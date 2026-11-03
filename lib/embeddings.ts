import {
  EMBEDDING,
  type EmbeddingProviderName,
} from "@/lib/config";
import {
  ENV_FILE_HINT,
  getGeminiClient,
  MissingKeyError,
  withGeminiRetry,
  wrapGeminiError,
} from "@/lib/gemini";

/**
 * Embedding provider contract.
 *
 * Two implementations exist:
 *  - `gemini`: the real provider, using the current Google embedding model
 *    (`gemini-embedding-001` by default).
 *  - `test-hash`: a deterministic, semantics-free test double used only to
 *    exercise the ingestion and retrieval plumbing without an API key.
 *
 * Evaluation metrics must come from a real provider. `assertRealProvider` exists
 * so evaluation code can refuse to report numbers produced by the test double.
 */
export type EmbeddingProvider = {
  /** Identifier recorded against every stored chunk. */
  readonly name: string;
  /** Provider-specific model identifier. */
  readonly model: string;
  /** Expected vector length. Actual responses are validated against this. */
  readonly dim: number;
  readonly isTestDouble: boolean;
  embedDocuments(texts: string[]): Promise<Float32Array[]>;
  embedQuery(text: string): Promise<Float32Array>;
};

/** Scale a vector to unit length so cosine similarity equals a dot product. */
export function normalise(vec: number[] | Float32Array): Float32Array {
  const out = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  let sumSquares = 0;
  for (let i = 0; i < out.length; i += 1) sumSquares += out[i] * out[i];
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return out;
  for (let i = 0; i < out.length; i += 1) out[i] /= norm;
  return out;
}

export function dotProduct(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) sum += a[i] * b[i];
  return sum;
}

function createGeminiProvider(): EmbeddingProvider {
  const ai = getGeminiClient();

  function validate(values: number[] | undefined): Float32Array {
    if (!values || values.length === 0) {
      throw wrapGeminiError(
        new Error(
          `Embedding model ${EMBEDDING.geminiModel} returned an empty vector.`,
        ),
        { model: EMBEDDING.geminiModel },
      );
    }
    if (values.length !== EMBEDDING.geminiDim) {
      throw new Error(
        `Embedding model ${EMBEDDING.geminiModel} returned ${values.length} dimensions, expected ${EMBEDDING.geminiDim}. Set EMBEDDING_DIM to ${values.length} and re-ingest, or leave it unset and re-ingest so the corpus matches the model.`,
      );
    }
    return normalise(values);
  }

  return {
    name: "gemini",
    model: EMBEDDING.geminiModel,
    dim: EMBEDDING.geminiDim,
    isTestDouble: false,
    async embedDocuments(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += EMBEDDING.batchSize) {
        const batch = texts.slice(i, i + EMBEDDING.batchSize);
        // Retried on rate limits and exhausted quotas, never on configuration
        // errors. See withGeminiRetry for why that distinction matters here.
        const res = await withGeminiRetry(
          () =>
            ai.models.embedContent({
              model: EMBEDDING.geminiModel,
              contents: batch,
              config: {
                taskType: "RETRIEVAL_DOCUMENT",
                outputDimensionality: EMBEDDING.geminiDim,
              },
            }),
          { model: EMBEDDING.geminiModel },
        );
        const embeddings = res.embeddings ?? [];
        if (embeddings.length !== batch.length) {
          throw new Error(
            `Embedding provider returned ${embeddings.length} vectors for ${batch.length} inputs.`,
          );
        }
        for (const e of embeddings) out.push(validate(e.values));
      }
      return out;
    },
    async embedQuery(text) {
      // Two attempts, not the ingestion budget of seven.
      //
      // embedDocuments is a batch run: giving up partway leaves the corpus half
      // written, so it is worth waiting out a per-minute quota. A query is not.
      // This call is on the critical path of a person waiting for an answer, and
      // the default budget of seven attempts with backoff up to 70 seconds meant
      // an exhausted quota held the request open for about four minutes before
      // returning a message that says exactly the same thing. Observed, not
      // theorised: a guidance request for a reading of 138/88 exceeded a 90 second
      // client timeout and returned nothing at all.
      const res = await withGeminiRetry(
        () =>
          ai.models.embedContent({
            model: EMBEDDING.geminiModel,
            contents: text,
            config: {
              taskType: "RETRIEVAL_QUERY",
              outputDimensionality: EMBEDDING.geminiDim,
            },
          }),
        // The provider's own retryDelay is often most of a minute on the free
        // tier, so the wait is capped rather than honoured. Waiting out that
        // minute would keep the request open for longer than any reader will wait
        // to be told the same thing.
        { model: EMBEDDING.geminiModel, attempts: 2, waitCapMs: 2_500 },
      );
      return validate((res.embeddings ?? [])[0]?.values);
    },
  };
}

const HASH_DIM = 256;

/**
 * Deterministic character-n-gram hashing. This is a plumbing test double: it
 * produces stable vectors so ingestion, storage and fusion can be exercised
 * without credentials. It carries no semantic signal whatsoever and will not
 * retrieve by meaning.
 */
function createHashProvider(): EmbeddingProvider {
  function vectorise(text: string): Float32Array {
    const vec = new Float32Array(HASH_DIM);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      const grams =
        token.length <= 3
          ? [token]
          : Array.from({ length: token.length - 2 }, (_, i) =>
              token.slice(i, i + 3),
            );
      for (const gram of grams) {
        let h = 2166136261;
        for (let i = 0; i < gram.length; i += 1) {
          h ^= gram.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        vec[Math.abs(h) % HASH_DIM] += 1;
      }
    }
    return normalise(vec);
  }

  return {
    name: "test-hash",
    model: "test-hash-ngram-v1",
    dim: HASH_DIM,
    isTestDouble: true,
    async embedDocuments(texts) {
      return texts.map(vectorise);
    },
    async embedQuery(text) {
      return vectorise(text);
    },
  };
}

let cached: EmbeddingProvider | null = null;

export async function getEmbeddingProvider(
  override?: EmbeddingProviderName,
): Promise<EmbeddingProvider> {
  const name = override ?? EMBEDDING.provider;
  if (cached && cached.name === name) return cached;

  if (name === "test-hash") {
    cached = createHashProvider();
    return cached;
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    // Raised as MissingKeyError, not a plain Error, so that the API route reports
    // this as a configuration problem (503) rather than an unexplained failure.
    throw new MissingKeyError(
      `GEMINI_API_KEY is not set. ${ENV_FILE_HINT} Alternatively set EMBEDDING_PROVIDER=test-hash to exercise the pipeline with the non-semantic test double.`,
    );
  }
  cached = createGeminiProvider();
  return cached;
}
