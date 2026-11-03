import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Single place where the Gemini client is created and where embedding-provider
 * errors are turned into messages a non-expert operator can act on.
 *
 * Answer generation no longer uses this client: it runs against a local Ollama
 * model (see `lib/ollama.ts`). What remains here is embedding, which the corpus
 * and every query still depend on. Keeping one constructor means the key is read
 * once, the same way, and that an invalid key, a model this project's key cannot
 * use, and an exhausted quota each produce a distinct, honest explanation instead
 * of a generic 500.
 *
 * The API key is read from `process.env.GEMINI_API_KEY`, which Next.js only ever
 * exposes to server code (it has no `NEXT_PUBLIC_` prefix, so it cannot leak into
 * the browser bundle).
 */

export const ENV_FILE_HINT =
  "Create ultimatehealth/website/.env.local with GEMINI_API_KEY=<your key>, or copy website/.env.example to website/.env.local and fill it in. See website/.env.example for the optional MODEL overrides.";

/** Raised when the key is absent or empty, before any network call is attempted. */
export class MissingKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingKeyError";
  }
}

export function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingKeyError(`GEMINI_API_KEY is not set. ${ENV_FILE_HINT}`);
  }
  return apiKey;
}

let cachedClient: GoogleGenAI | null = null;
let cachedFor: string | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  // Rebuild if the key changed, which happens when .env.local is edited and the
  // dev server is still running under a different value.
  if (cachedClient && cachedFor === apiKey) return cachedClient;
  cachedClient = new GoogleGenAI({ apiKey });
  cachedFor = apiKey;
  return cachedClient;
}

/**
 * A provider failure already translated into an operator-facing message. It keeps
 * the original error as `cause` so that a stack trace is still available in the
 * server log, while the message stays safe to show a user.
 */
export class GeminiCallError extends Error {
  readonly kind: GeminiErrorKind;
  readonly httpStatus: number;
  readonly model: string | undefined;

  constructor(
    kind: GeminiErrorKind,
    message: string,
    httpStatus: number,
    model: string | undefined,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = "GeminiCallError";
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.model = model;
  }
}

/** Which configuration problem a provider error represents. */
export type GeminiErrorKind =
  | "missing-key"
  | "invalid-key"
  | "model-unavailable"
  | "quota-exhausted"
  | "rate-limited"
  | "overloaded"
  | "network"
  | "unknown";

export function classifyGeminiError(error: unknown): GeminiErrorKind {
  if (error instanceof MissingKeyError) return "missing-key";
  if (error instanceof GeminiCallError) return error.kind;

  const status =
    error instanceof ApiError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : undefined;

  // Message may come from an Error or from a plain object, so that this stays a
  // pure, directly testable function rather than one that needs a live SDK error.
  const text =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : String(error);

  if (status === 401 || status === 403) return "invalid-key";
  // The provider returns 503 UNAVAILABLE when a model is temporarily oversubscribed.
  // That is transient and retryable, unlike a 404 for a model that does not exist.
  if (status === 503 || /UNAVAILABLE|overloaded|high demand/i.test(text)) {
    return "overloaded";
  }
  if (status === 429) {
    return /quota|exceeded your current quota|billing/i.test(text)
      ? "quota-exhausted"
      : "rate-limited";
  }
  if (status === 404 || /NOT_FOUND|is not found|not supported for|does not exist/i.test(text)) {
    return "model-unavailable";
  }
  if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) {
    return "invalid-key";
  }
  if (/RESOURCE_EXHAUSTED|quota/i.test(text)) return "quota-exhausted";
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(text)) {
    return "network";
  }
  // A missing key surfaces from the SDK as a 400 with this wording.
  if (status === 400 && /API key|api_key|API_KEY/i.test(text)) return "invalid-key";
  return "unknown";
}

/**
 * Turns a provider failure into an operator-facing sentence plus the HTTP status
 * the API route should return. Secrets are never included: only the provider's own
 * message, which describes the key, not its value.
 */
export function describeGeminiError(
  error: unknown,
  context: { model?: string },
): {
  kind: GeminiErrorKind;
  message: string;
  httpStatus: number;
  /** The provider's own wait, in whole seconds, when it supplied one. */
  retryAfterSeconds: number | null;
} {
  if (error instanceof GeminiCallError) {
    return {
      kind: error.kind,
      message: error.message,
      httpStatus: error.httpStatus,
      retryAfterSeconds: providerRetryAfterSeconds(error.cause ?? error),
    };
  }
  const kind = classifyGeminiError(error);
  const raw = error instanceof Error ? error.message : String(error);
  const model = context.model ?? "the configured model";
  // What the provider actually said, without its JSON envelope. The envelope is
  // mostly protocol metadata, quota metric names and documentation links; none of it
  // belongs in a sentence shown to a reader, and pasting it verbatim turned an
  // actionable message into a wall of escaped JSON.
  const detail = providerDetail(error);
  const retryAfterSeconds = providerRetryAfterSeconds(error);
  const waits = retryAfterSeconds
    ? ` The provider asked for a wait of about ${formatWait(retryAfterSeconds)}.`
    : "";

  switch (kind) {
    case "missing-key":
      // 503 is right here: the deployment is not configured, and nothing the client
      // sends will change that until an operator sets the key.
      return { kind, message: raw, httpStatus: 503, retryAfterSeconds: null };
    case "invalid-key":
      return {
        kind,
        message: `The Gemini API rejected the configured key. Check that GEMINI_API_KEY in ultimatehealth/website/.env.local is a valid Google AI Studio key with the Generative Language API enabled, then restart the server. Provider said: ${detail}`,
        httpStatus: 502,
        retryAfterSeconds,
      };
    case "model-unavailable":
      return {
        kind,
        message: `The embedding model "${model}" is not available to this API key. Run \`pnpm verify:gemini\` to list the models your key can use, then set EMBEDDING_MODEL in ultimatehealth/website/.env.local accordingly. Provider said: ${detail}`,
        httpStatus: 502,
        retryAfterSeconds: null,
      };
    case "quota-exhausted":
      return {
        kind,
        message: `The Gemini API quota for this project is exhausted. Wait for the limit to reset or enable billing on the project, then try again.${waits} Provider said: ${detail}`,
        httpStatus: 429,
        retryAfterSeconds,
      };
    case "rate-limited":
      return {
        kind,
        message: `The Gemini API is rate-limiting requests. Try again shortly.${waits} Provider said: ${detail}`,
        httpStatus: 429,
        retryAfterSeconds,
      };
    case "overloaded":
      return {
        kind,
        message: `The model is temporarily oversubscribed at the provider and could not answer after several retries. This is transient; try the same question again shortly.${waits} Provider said: ${detail}`,
        httpStatus: 503,
        retryAfterSeconds,
      };
    case "network":
      return {
        kind,
        message: `The server could not reach the Gemini API. Check the machine's network access and try again. Provider said: ${detail}`,
        httpStatus: 502,
        retryAfterSeconds: null,
      };
    default:
      return { kind, message: detail, httpStatus: 500, retryAfterSeconds: null };
  }
}

/** Classifies a raw provider error and rethrows it as a `GeminiCallError`. */
export function wrapGeminiError(
  error: unknown,
  context: { model?: string },
): GeminiCallError {
  const { kind, message, httpStatus } = describeGeminiError(error, context);
  return new GeminiCallError(kind, message, httpStatus, context.model, error);
}

/**
 * The Gemini API reports how long to wait before retrying inside the error body,
 * for example `"retryDelay":"26s"`. Using the provider's own number matters: the
 * free tier enforces a per-minute request quota, so a fixed short delay can spin
 * against the limit while a longer one succeeds immediately after.
 */
function retryDelayMs(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s/);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.ceil((seconds + 1) * 1000);
}

/** The provider's wait, rounded up to whole seconds, if it gave one. */
export function providerRetryAfterSeconds(error: unknown): number | null {
  const ms = retryDelayMs(error);
  return ms === null ? null : Math.ceil(ms / 1000);
}

/**
 * The provider's own sentence, with its JSON envelope removed.
 *
 * A quota error arrives as a JSON document containing the human-readable reason
 * alongside protocol metadata: the quota metric name, the model id, the violation
 * list and a documentation link. The reader needs the reason and the wait, not the
 * envelope, and a page of escaped JSON is not an actionable message. When there is
 * no embedded message the raw text is used, truncated, so the diagnosis is never
 * silently dropped either.
 */
export function providerDetail(error: unknown, maxChars = 260): string {
  const raw = error instanceof Error ? error.message : String(error);
  const embedded = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const text = (embedded ?? raw)
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
}

/** `45 seconds`, `12 minutes`, `7 hours`, for a wait the provider asked for. */
function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryEvent = {
  attempt: number;
  kind: GeminiErrorKind;
  waitMs: number;
};

/**
 * Retries a provider call when, and only when, the failure is transient: a rate
 * limit, an exhausted quota, or a model the provider reports as temporarily
 * unavailable (503 `UNAVAILABLE`, which Gemini returns during demand spikes).
 * Authentication, model-not-found and malformed-request errors are never retried:
 * they cannot succeed on a second attempt, and retrying them would turn a clear
 * configuration error into a slow one.
 *
 * Embedding a 300-passage corpus on the free tier routinely trips the per-minute
 * request quota, so without this the ingestion run fails partway and leaves the
 * corpus in a mixed state.
 */
export async function withGeminiRetry<T>(
  fn: () => Promise<T>,
  context: {
    model?: string;
    attempts?: number;
    /**
     * Upper bound on a single wait between attempts. The default suits a batch
     * run; an interactive request should set a small value so that a per-minute
     * quota produces a quick, honest error rather than a request that hangs.
     */
    waitCapMs?: number;
    onRetry?: (event: RetryEvent) => void;
  },
): Promise<T> {
  const attempts = context.attempts ?? 7;
  const waitCap = context.waitCapMs ?? 70_000;
  let backoff = Math.min(8_000, waitCap);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const kind = classifyGeminiError(error);
      const retryable =
        kind === "rate-limited" ||
        kind === "quota-exhausted" ||
        kind === "overloaded";
      if (!retryable || attempt >= attempts) {
        throw error instanceof GeminiCallError
          ? error
          : wrapGeminiError(error, { model: context.model });
      }
      const waitMs = retryDelayMs(error) ?? backoff;
      context.onRetry?.({ attempt, kind, waitMs });
      await sleep(Math.min(waitMs, waitCap));
      backoff = Math.min(backoff * 2, waitCap);
    }
  }
}
