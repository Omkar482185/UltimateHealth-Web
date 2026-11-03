/**
 * Request guards for the JSON endpoints.
 *
 * Both guards are deliberately simple and their limits are documented rather
 * than glossed over:
 *
 *  - `isSameOriginRequest` rejects cross-origin state-changing requests, which
 *    blocks the trivial drive-by form case. It supplements but does not replace
 *    authentication: routes that touch personal data resolve the account from the
 *    session cookie independently, and the session cookie is SameSite=Lax as well.
 *  - `rateLimit` is an in-process token bucket. It is per server instance, so it
 *    is a courtesy limit against accidental loops and casual abuse, not a
 *    defence against a distributed attack. A production deployment would move
 *    this to a shared store.
 */

/**
 * A redacted, log-safe description of a thrown value.
 *
 * Never log the thrown object itself. A provider SDK error commonly carries the
 * request it failed on, and on this platform that request contains the reader's
 * question and the retrieved passages, so logging the object can put a person's
 * health question into the server log. A database error can carry the statement.
 * The name and message are enough to diagnose with.
 *
 * Neither part is shown to a caller: this is for the log, and `describeGeminiError`
 * in `lib/gemini.ts` is what turns a provider failure into a message that is safe
 * to show.
 */
export function redactError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `non-error thrown: ${typeof error}`;
}

/**
 * The fixed response body for an unexpected failure.
 *
 * Every unhandled error returns this instead of its own message. An internal
 * message can name a file path, a model, a table or a request payload, none of
 * which a reader can act on and some of which should not leave the process.
 */
export const INTERNAL_ERROR_BODY = {
  error:
    "Something went wrong inside the application, so this request could not be completed. Nothing you entered has been stored. Please try again.",
  kind: "internal-error",
} as const;

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Non-browser clients (curl, fetch from a script) send no Origin header.
  // Requests without an Origin are allowed, matching typical same-origin policy.
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identity for the rate limiter.
 *
 * The limit is only as fine-grained as the proxy in front of the app. Behind a
 * proxy that sets `x-forwarded-for` each client is metered separately; served
 * directly, such as `next dev` on loopback, no header is present, every caller
 * resolves to the same key, and the limits become one shared bucket for the whole
 * deployment. That makes them a courtesy limit against accidental loops rather
 * than a per-user quota, and it is why the integration checks can legitimately
 * meet a 429 from an earlier run.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
