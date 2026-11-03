import { GENERATION } from "@/lib/config";

/**
 * Local generation through Ollama.
 *
 * The RAG pipeline used to write its answers with a hosted model. Generation is
 * now a call to a model running on, or reachable from, the machine that hosts the
 * server: no API key, no per-request quota, and the question never leaves the
 * deployment. Retrieval, prompting, citation validation and safety are unchanged;
 * only the provider at the end of the pipeline moved.
 *
 * One place owns the HTTP call, so the request shape, the timeout and the error
 * vocabulary cannot drift between the assistant and the symptom-guidance
 * explanation, both of which generate through this module.
 *
 * Failure is designed to be legible. A stopped daemon, a missing model, a model
 * that does not fit in memory and a request that exceeds its deadline are four
 * different operator problems, and each produces its own message. None of them
 * includes the question or the retrieved passages, so the text is safe to show.
 */

export type OllamaErrorKind =
  | "unreachable"
  | "timeout"
  | "model-unavailable"
  | "out-of-memory"
  | "empty-response"
  | "bad-response"
  | "server-error"
  | "unknown";

/** A provider failure already translated into an operator-facing message. */
export class OllamaError extends Error {
  readonly kind: OllamaErrorKind;
  readonly httpStatus: number;
  readonly model: string;

  constructor(
    kind: OllamaErrorKind,
    message: string,
    httpStatus: number,
    model: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OllamaError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.model = model;
  }
}

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * The exact request body sent to `/api/chat`.
 *
 * Exported so the wire format can be asserted without a network call: the system
 * instruction must stay a system message rather than being folded into the user
 * turn, and streaming must stay off so the caller receives one JSON document.
 */
export function buildOllamaChatRequest(
  prompt: string,
  systemInstruction: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    numCtx?: number;
    keepAlive?: string;
  } = {},
): {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  keep_alive: string;
  options: { temperature: number; num_predict: number; num_ctx: number };
} {
  return {
    model: options.model ?? GENERATION.model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ],
    // A single JSON response, not a token stream: the API route returns the whole
    // answer after citation validation, and there is no incremental UI to feed.
    stream: false,
    // Keep the model resident between questions. Loading a 3B model from disk on
    // every request adds seconds to the first answer of a session.
    keep_alive: options.keepAlive ?? GENERATION.keepAlive,
    options: {
      // Deterministic decoding: this content is health information, and sampling
      // would make two readers get different citations for the same question.
      temperature: options.temperature ?? GENERATION.temperature,
      num_predict: options.maxTokens ?? GENERATION.maxOutputTokens,
      num_ctx: options.numCtx ?? GENERATION.numCtx,
    },
  };
}

/** A provider sentence with its JSON envelope removed and its length bounded. */
function providerDetail(text: string, maxChars = 240): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return "";
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trimEnd()}...` : trimmed;
}

/** The provider's own message from an error response, if it sent one. */
async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      if (typeof parsed?.error === "string") return providerDetail(parsed.error);
    } catch {
      // Not JSON; fall through to the raw text.
    }
    return providerDetail(text);
  } catch {
    return "";
  }
}

/** Maps an HTTP failure from Ollama onto the vocabulary above. */
function errorFromResponse(
  status: number,
  detail: string,
  model: string,
): OllamaError {
  const said = detail.length > 0 ? ` Ollama said: ${detail}` : "";

  if (/not found|no such model|try pulling|pull model/i.test(detail) || status === 404) {
    return new OllamaError(
      "model-unavailable",
      `The model "${model}" is not available from the local Ollama instance. Run \`ollama pull ${model}\` and confirm it appears in \`ollama list\`, or set OLLAMA_MODEL to a model you have pulled.${said}`,
      502,
      model,
    );
  }
  if (/out of memory|not enough memory|requires more system memory|cannot allocate/i.test(detail)) {
    return new OllamaError(
      "out-of-memory",
      `Ollama could not fit "${model}" in available memory. Close other applications, use a smaller model or a more heavily quantised build, then try again.${said}`,
      503,
      model,
    );
  }
  return new OllamaError(
    "server-error",
    `Ollama reported an error for "${model}" (HTTP ${status}). Check the Ollama server log, then try again.${said}`,
    502,
    model,
  );
}

/** Classifies a thrown value, including a raw `fetch` failure. */
export function classifyOllamaError(error: unknown): OllamaErrorKind {
  if (error instanceof OllamaError) return error.kind;
  const text = error instanceof Error ? error.message : String(error);
  if (/abort|timeout|timed out/i.test(text)) return "timeout";
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up/i.test(text)) {
    return "unreachable";
  }
  return "unknown";
}

/**
 * Turns a provider failure into a message an operator can act on, plus the HTTP
 * status the API route would use if the failure ever escaped the pipeline.
 */
export function describeOllamaError(
  error: unknown,
  context: { model?: string; timeoutMs?: number } = {},
): { kind: OllamaErrorKind; message: string; httpStatus: number } {
  if (error instanceof OllamaError) {
    return { kind: error.kind, message: error.message, httpStatus: error.httpStatus };
  }

  const kind = classifyOllamaError(error);
  const model = context.model ?? GENERATION.model;
  const seconds = Math.round((context.timeoutMs ?? GENERATION.timeoutMs) / 1000);
  const detail = providerDetail(error instanceof Error ? error.message : String(error));

  switch (kind) {
    case "timeout":
      return {
        kind,
        message: `The local language model did not finish within ${seconds} seconds. A 3B model generating a cited answer on a busy machine can be slow. Try again, raise OLLAMA_TIMEOUT_MS, or use a smaller model.`,
        httpStatus: 504,
      };
    case "unreachable":
      return {
        kind,
        message: `The local language model could not be reached at ${GENERATION.baseUrl}. Start Ollama (\`ollama serve\`), confirm it answers at ${GENERATION.baseUrl}/api/tags, and check OLLAMA_BASE_URL if it runs elsewhere.${detail ? ` Provider said: ${detail}` : ""}`,
        httpStatus: 502,
      };
    default:
      return {
        kind,
        message: detail.length > 0
          ? `The local language model failed: ${detail}`
          : "The local language model failed without returning a message.",
        httpStatus: 500,
      };
  }
}

/** Wraps a raw failure so callers can rely on the kind and status. */
export function wrapOllamaError(
  error: unknown,
  context: { model?: string; timeoutMs?: number } = {},
): OllamaError {
  const { kind, message, httpStatus } = describeOllamaError(error, context);
  return new OllamaError(kind, message, httpStatus, context.model ?? GENERATION.model, error);
}

export type OllamaChatOptions = {
  temperature?: number;
  maxTokens?: number;
  numCtx?: number;
  keepAlive?: string;
  timeoutMs?: number;
  /** Injected by tests; production uses the runtime's global fetch. */
  fetchImpl?: typeof fetch;
};

export type OllamaChatResult = {
  text: string;
  /** The model Ollama reports having run, which is the served tag. */
  model: string;
  /** Provider-side generation time, when Ollama reports it. */
  totalDurationMs: number | null;
};

/**
 * Sends one non-streaming chat request and returns the text.
 *
 * The timeout covers the whole exchange, including model load and generation.
 * Without it a stopped-but-listening daemon, or a machine under memory pressure,
 * would leave the question hanging until the client gave up.
 */
export async function ollamaChat(
  prompt: string,
  systemInstruction: string,
  options: OllamaChatOptions = {},
): Promise<OllamaChatResult> {
  const model = GENERATION.model;
  const timeoutMs = options.timeoutMs ?? GENERATION.timeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = buildOllamaChatRequest(prompt, systemInstruction, {
    model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    numCtx: options.numCtx,
    keepAlive: options.keepAlive,
  });

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const timeoutError = (cause?: unknown) =>
    new OllamaError(
      "timeout",
      `The local language model did not finish within ${Math.round(timeoutMs / 1000)} seconds. Try again, raise OLLAMA_TIMEOUT_MS, or use a smaller model.`,
      504,
      model,
      cause,
    );

  // The deadline stays armed until the body has been read. Ollama can hold the
  // connection open while it loads weights, and a daemon that accepted the socket
  // but stopped responding would otherwise leave the request hanging after the
  // headers arrived, which is exactly the failure this is meant to prevent.
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${GENERATION.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      if (timedOut) throw timeoutError(error);
      throw new OllamaError(
        "unreachable",
        `The local language model could not be reached at ${GENERATION.baseUrl}. Start Ollama with \`ollama serve\` and check OLLAMA_BASE_URL if it runs on another machine.`,
        502,
        model,
        error,
      );
    }

    if (!response.ok) {
      throw errorFromResponse(response.status, await readErrorBody(response), model);
    }

    let payload: {
      model?: unknown;
      message?: { content?: unknown };
      done_reason?: unknown;
      total_duration?: unknown;
    };
    try {
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      if (timedOut) throw timeoutError(error);
      throw new OllamaError(
        "bad-response",
        `Ollama returned a response that was not JSON. Check the Ollama server log; a proxy or a different service may be listening on ${GENERATION.baseUrl}.`,
        502,
        model,
        error,
      );
    }

    const content = typeof payload?.message?.content === "string" ? payload.message.content : "";
    const text = content.trim();
    if (text.length === 0) {
      throw new OllamaError(
        "empty-response",
        `The model "${model}" returned an empty answer. Try the question again, or check that the model is not repeatedly hitting a context limit in the Ollama log.`,
        502,
        model,
      );
    }

    return {
      text,
      model: typeof payload.model === "string" && payload.model.trim().length > 0 ? payload.model : model,
      totalDurationMs:
        typeof payload.total_duration === "number" ? Math.round(payload.total_duration / 1e6) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether a configured model is among the pulled tags.
 *
 * Ollama accepts a tagless name for the default tag (`llama3.2` resolves to
 * `llama3.2:latest`), and the listing always carries a tag, so an exact string
 * comparison would report a working configuration as missing.
 */
export function hasOllamaModel(pulled: string[], model: string): boolean {
  const wanted = model.trim();
  if (pulled.includes(wanted)) return true;
  if (wanted.includes(":")) return false;
  return pulled.some((name) => name.split(":")[0] === wanted);
}

/**
 * Lists the models the local Ollama instance has pulled. Used by the pre-flight
 * check so an operator learns that `llama3.2:3b` is missing before asking a
 * question, rather than through the fallback path.
 */
export async function listOllamaModels(
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${GENERATION.baseUrl}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new OllamaError(
        "server-error",
        `Listing local models failed with HTTP ${response.status} from ${GENERATION.baseUrl}.`,
        502,
        GENERATION.model,
      );
    }
    const payload = (await response.json()) as { models?: { name?: unknown; model?: unknown }[] };
    return (payload.models ?? [])
      .map((entry) => (typeof entry.name === "string" ? entry.name : entry.model))
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  } catch (error) {
    if (error instanceof OllamaError) throw error;
    throw wrapOllamaError(error, { timeoutMs });
  } finally {
    clearTimeout(timer);
  }
}
