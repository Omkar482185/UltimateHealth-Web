import path from "node:path";

/**
 * Product identity. Change these values to rename the platform.
 *
 * The platform is derived from the open-source UltimateHealth repository (MIT).
 * The non-affiliation notice is shown in the footer and on the policy pages.
 */
export const SITE = {
  title: "UltimateHealth Insights",
  shortTitle: "Health Insights",
  tagline: "Health information that shows its sources.",
  description:
    "A source-grounded health information platform. Browse curated health education material, ask questions that are answered only from cited sources, and get evidence-based guidance on symptoms.",
  upstreamUrl: "https://github.com/SB2318/UltimateHealth",
  forkUrl: "https://github.com/Omkar482185/UltimateHealth",
  nonAffiliationNotice:
    "This is an independent academic project derived from the open-source UltimateHealth repository (MIT licensed). It is not affiliated with, maintained by, or endorsed by the upstream project.",
} as const;

export const DATA_DIR =
  process.env.HEALTH_DATA_DIR ?? path.join(process.cwd(), "data");

export const DB_PATH =
  process.env.HEALTH_DB_PATH ?? path.join(DATA_DIR, "health.db");

export type EmbeddingProviderName = "gemini" | "test-hash";

export const EMBEDDING = {
  /**
   * `test-hash` is a deterministic test double for plumbing tests only. It has no
   * semantic meaning and MUST NOT be used for evaluation runs or reported metrics.
   */
  provider: (process.env.EMBEDDING_PROVIDER ??
    "gemini") as EmbeddingProviderName,
  /**
   * `text-embedding-004` was shut down on 14 January 2026, so the previous
   * default would fail with a NOT_FOUND error even with a valid key.
   * `gemini-embedding-001` is the current text embedding model and, unlike
   * `gemini-embedding-2`, accepts the retrieval task types used below.
   */
  geminiModel: process.env.EMBEDDING_MODEL ?? "gemini-embedding-001",
  /**
   * Reduced output dimension. The model defaults to 3072, and 768 is the
   * recommended trade-off between quality and storage. Changing this, or the
   * model, invalidates every stored vector and requires re-ingestion.
   */
  geminiDim: Number(process.env.EMBEDDING_DIM ?? 768),
  batchSize: Number(process.env.EMBEDDING_BATCH_SIZE ?? 8),
} as const;

/**
 * Generation runs against a local Ollama instance. There is no API key and no
 * external request on this path: the retrieved passages, the question and the
 * system instruction are sent to the model over HTTP on the host running the
 * server. See `lib/ollama.ts` for the transport and its failure handling.
 */
function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const GENERATION = {
  provider: "ollama" as const,
  /** The pulled tag to run. Override with OLLAMA_MODEL. */
  model: process.env.OLLAMA_MODEL?.trim() || "llama3.2:3b",
  /**
   * Where the Ollama daemon listens. `localhost` here means the server, not the
   * browser: a remotely hosted deployment needs an Ollama host it can reach, not
   * a model running on a developer's laptop.
   */
  baseUrl: (process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434").replace(
    /\/+$/,
    "",
  ),
  temperature: 0,
  maxOutputTokens: positiveNumber("OLLAMA_MAX_TOKENS", 1024),
  /**
   * Context window. The prompt is a system instruction plus at most six retrieved
   * passages, so 8192 tokens leaves room without reserving the model's full
   * 128k window in memory.
   */
  numCtx: positiveNumber("OLLAMA_NUM_CTX", 8192),
  /** Whole-request deadline, covering model load and generation. */
  timeoutMs: positiveNumber("OLLAMA_TIMEOUT_MS", 120_000),
  /** How long the model stays resident between questions. */
  keepAlive: process.env.OLLAMA_KEEP_ALIVE?.trim() || "10m",
} as const;

export const CHUNK = {
  /** Target characters per chunk. Roughly 200-250 words. */
  targetChars: 1200,
  maxChars: 1800,
  minChars: 240,
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars: 200,
} as const;

export const RETRIEVAL = {
  vectorTopK: 12,
  keywordTopK: 12,
  /**
   * Chunks passed to the generator as evidence.
   *
   * Kept at 6. Raising it to 8 was tried and reverted, because the reason for
   * raising it turned out to be false. The intent was to reach the dengue passage
   * for "How is chikungunya different from dengue?"; inspecting the real ranking
   * showed that passage fuses to rank 9, behind a UKHSA chikungunya passage, so an
   * 8-passage cut-off still excludes it while handing the model two extra passages
   * of chikungunya text. A change whose stated reason does not hold is not worth
   * its tokens.
   */
  finalTopK: 6,
  /**
   * Fraction of the best fusion score within which candidates are treated as
   * tied. Ties are then broken in favour of documents not yet represented.
   *
   * Why this exists: reciprocal rank fusion over ~24 candidates produces scores
   * in a very narrow band, so near the cut-off the ordering is close to
   * arbitrary. Measured on the evaluation set, the top six passages for "How is
   * chikungunya different from dengue?" were four passages from one short Indian
   * page followed by two others, with the whole WHO dengue document below the
   * cut. The model, given no dengue passage, correctly answered that the evidence
   * did not cover the difference, which is honest but useless to the reader.
   *
   * A hard per-document cap also fixes that case, but it costs precision
   * everywhere else, including questions whose gold answer is a single document
   * where the cap has nothing to diversify against. Measured: cap 2 moved
   * precision@5 from 0.696 to 0.579 while recall@5 moved from 0.780 to 0.817. A
   * tie-break instead only reorders candidates whose scores are already
   * indistinguishable, so it changes nothing where the ranking is decisive and
   * cannot discard a passage in favour of an unrelated one.
   */
  tieBand: Number(process.env.RETRIEVAL_TIE_BAND ?? 0.05),
  /**
   * Optional hard cap on passages from a single document. Disabled by default
   * because the measurement above did not support it; kept so the two strategies
   * can be compared with `RETRIEVAL_MAX_PER_DOCUMENT=<n> pnpm eval
   * --retrieval-only` without editing code.
   */
  maxPerDocument: Number(process.env.RETRIEVAL_MAX_PER_DOCUMENT ?? 0),
  /**
   * Dominance rule. Document coverage, as opposed to tie-band reordering.
   *
   * Measured failure it exists to fix: for "How is chikungunya different from
   * dengue?" the tie band contained six passages, four of them from one short
   * Indian page, so all six evidence slots filled from chikungunya documents and
   * the WHO dengue passage - the only document that describes dengue - sat at
   * fused rank 8 and never reached the model. The model then correctly answered
   * that the evidence did not explain the difference, which is honest and useless.
   *
   * The rule: if any single document occupied more than `dominanceShare` of the
   * evidence slots, its weakest repeats are released and the freed slots are
   * refilled from the best-ranked passages of documents not yet represented,
   * provided they are within `dominanceBand` of the top fusion score. Order is
   * then restored by score, so this changes which passages are eligible rather
   * than overriding the ranking.
   *
   * `dominanceShare` is a fraction of the evidence slots: at 0.4 a 6-passage set
   * tolerates 3 passages from one document and a 5-passage set tolerates 2.
   *
   * DISABLED BY DEFAULT, because the measurement did not support enabling it.
   * Measured on the 56-question set with corrected relevance judgements:
   *
   *   share  precision@5  recall@5   mrr
   *   1.0     0.714        0.814     0.905   (rule off - the default)
   *   0.8     0.707        0.814     0.905   (does not trip for the target case)
   *   0.6     0.700        0.814     0.905   (does not trip for the target case)
   *   0.4     0.675        0.826     0.905   (fixes the target case)
   *
   * Only 0.4 makes the rule fire for the target question at all, and it costs 3.9
   * points of the primary precision metric to gain 1.2 of recall.
   *
   * It also does not solve the case it was written for. Inspecting the real
   * evidence set at 0.4 shows the rule doing exactly what it should - capping the
   * dominating page at three passages - but the freed slot goes to the best-ranked
   * document still unrepresented, and on this corpus that is the UKHSA chikungunya
   * page, not the WHO dengue page. The dengue passage fuses to rank 9, behind both.
   * So the rule is off by default and is recorded as not having worked, rather than
   * being enabled on the strength of the argument that motivated it. Enable it with
   * RETRIEVAL_DOMINANCE_SHARE=0.4 and re-run `pnpm eval --retrieval-only`.
   *
   * The unanswered comparison question is recorded as a known limitation of
   * retrieval on this corpus instead; see `docs/architecture.md`.
   */
  dominanceShare: Number(process.env.RETRIEVAL_DOMINANCE_SHARE ?? 1),
  /**
   * How far below the best fusion score a refill candidate may sit, as a fraction
   * of that score. Wider than `tieBand` because the point is to reach a document
   * the ranking has already decided against, not to reorder near-ties.
   */
  dominanceBand: Number(process.env.RETRIEVAL_DOMINANCE_BAND ?? 0.15),
  /** Reciprocal rank fusion constant. */
  rrfK: 60,
  /**
   * Minimum cosine similarity for a vector hit to be eligible as evidence.
   * Calibrated against the evaluation set, not chosen a priori.
   */
  minCosine: Number(process.env.RETRIEVAL_MIN_COSINE ?? 0.5),
} as const;

export function isTestEmbeddingProvider(): boolean {
  return EMBEDDING.provider === "test-hash";
}
