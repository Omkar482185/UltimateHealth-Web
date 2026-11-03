/**
 * Security posture checks against a running server.
 *
 *   pnpm dev             # in one terminal
 *   pnpm check:security  # in another
 *
 * These are the claims the security section of `docs/architecture.md` makes, turned
 * into assertions, so that a change which quietly removes a header or starts
 * serving a file it should not fails a check rather than shipping.
 *
 * The most important group is the path probes. A Next.js application that exposes
 * `.env.local` or its SQLite file over HTTP has leaked its API key or every user's
 * health records, and nothing else in the suite would notice.
 *
 * No credential is needed and no account is created, so this can run at any time.
 */
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";

async function req(method, path, { body, headers = {} } = {}) {
  const finalHeaders = { origin: BASE, ...headers };
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

const results = [];
function t(name, pass, detail) {
  results.push(pass);
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail).slice(0, 200) : ""}`,
  );
}

/* 1. Response headers on a page. */
{
  const r = await req("GET", "/");
  t("page is served", r.status === 200, r.status);
  t("X-Content-Type-Options is nosniff", r.headers.get("x-content-type-options") === "nosniff", r.headers.get("x-content-type-options"));
  t("Referrer-Policy is set", r.headers.get("referrer-policy") === "strict-origin-when-cross-origin", r.headers.get("referrer-policy"));
  t("Permissions-Policy denies camera and microphone", /camera=\(\)/.test(r.headers.get("permissions-policy") ?? "") && /microphone=\(\)/.test(r.headers.get("permissions-policy") ?? ""), r.headers.get("permissions-policy"));
  t("X-Frame-Options is SAMEORIGIN", r.headers.get("x-frame-options") === "SAMEORIGIN", r.headers.get("x-frame-options"));
}

/* 2. The headers reach JSON routes too, and personal reads stay uncacheable. */
{
  const r = await req("GET", "/api/records");
  t("an unauthenticated personal read is 401", r.status === 401, r.status);
  t("it is marked no-store", r.headers.get("cache-control") === "no-store", r.headers.get("cache-control"));
  t("it carries nosniff", r.headers.get("x-content-type-options") === "nosniff", r.headers.get("x-content-type-options"));
}

/* 3. Every mutating route refuses a foreign origin. */
{
  const cases = [
    ["POST", "/api/assistant", { question: "does exercise lower blood pressure" }],
    ["POST", "/api/guidance", { symptomIds: ["fatigue"] }],
    ["POST", "/api/records", { kind: "weight", valuePrimary: 70, measuredAt: new Date().toISOString() }],
    ["PUT", "/api/records/1", { kind: "weight", valuePrimary: 70, measuredAt: new Date().toISOString() }],
    ["DELETE", "/api/records/1", undefined],
    ["PUT", "/api/account/profile", { displayName: "x" }],
    ["DELETE", "/api/account", { confirmation: "delete my account", password: "x" }],
    ["POST", "/api/auth/login", { email: "a@example.test", password: "x" }],
    ["POST", "/api/auth/register", { email: "a@example.test", password: "x", acceptConsent: true }],
    ["POST", "/api/auth/logout", undefined],
  ];
  const wrong = [];
  for (const [method, path, body] of cases) {
    const r = await req(method, path, { body, headers: { origin: "https://evil.example" } });
    if (r.status !== 403) wrong.push(`${method} ${path} -> ${r.status}`);
  }
  t("every mutating route rejects a cross-origin request with 403", wrong.length === 0, wrong);
}

/* 4. Path probes. This is the group that matters most. */
{
  const probes = [
    "/.env.local",
    "/.env",
    "/data/health.db",
    "/data/evaluation-report.json",
    "/.git/config",
    "/../.env.local",
    "/package.json",
    "/lib/auth/session.ts",
    "/next.config.ts",
  ];
  const leaked = [];
  for (const path of probes) {
    const r = await req("GET", path);
    // A 401/403 for a protected route is fine. A 200 with source or secret content
    // is not, and neither is any body that contains a key or a password hash.
    const body = r.text ?? "";
    const looksSecret =
      /GEMINI_API_KEY/.test(body) ||
      /scrypt\$\d+\$/.test(body) ||
      /BEGIN [A-Z ]*PRIVATE KEY/.test(body) ||
      /SQLite format 3/.test(body);
    if (r.status === 200 || looksSecret) {
      leaked.push(`${path} -> ${r.status}${looksSecret ? " (content leak)" : ""}`);
    }
  }
  t("the environment file, the database and the repository are not served", leaked.length === 0, leaked);
}

/* 5. Ordering of checks, and what a refusal is allowed to say. */
{
  // Authorisation is applied before the body is parsed, so an unauthenticated
  // write is 401 and not 400. That is deliberate: a caller who is not signed in
  // should not be able to probe the validation rules, and pinning it here means a
  // later refactor cannot quietly reorder the two.
  const unauth = await req("POST", "/api/records", {
    kind: "weight",
    valuePrimary: "heavy",
    measuredAt: new Date().toISOString(),
  });
  t("an unauthenticated write is refused before the body is validated", unauth.status === 401, unauth.status);

  // The public route is where an invalid body can be exercised, and its refusal
  // must not describe the internals. The body is wrapped in `{ body }` because
  // that is what the helper reads: passing it bare sent no body at all, which
  // still produced a 400 and made this check pass without testing the enum.
  const r = await req("POST", "/api/guidance", { body: { symptomIds: ["not-a-symptom"] } });
  t("an invalid body is refused with 400", r.status === 400, r.status);
  // A refusal that names the offending field proves the payload reached the
  // schema. Without this the check would pass on any 400, including one thrown
  // before the body was read.
  t(
    "the invalid body was actually sent and validated",
    /"path"\s*:\s*"symptomIds/.test(r.text ?? ""),
    (r.text ?? "").slice(0, 200),
  );
  t(
    "the refusal carries no stack trace or file path",
    !/\bat\s+\w+.*\(|\.ts:\d+|node_modules|D:\\|\/home\/|\/Users\//.test(r.text ?? ""),
    (r.text ?? "").slice(0, 160),
  );
  t(
    "the refusal names no internal identifier",
    !/sqlite|better-sqlite3|SELECT |INSERT |prisma/i.test(r.text ?? ""),
    (r.text ?? "").slice(0, 160),
  );
}

/* 6. A malformed body is refused the same way, not with a parser error. */
{
  const res = await fetch(`${BASE}/api/guidance`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: "{not json",
  });
  const text = await res.text();
  t("a malformed JSON body is 400", res.status === 400, res.status);
  t(
    "the malformed-body response leaks no parser detail",
    !/Unexpected token|JSON at position|SyntaxError/i.test(text),
    text.slice(0, 160),
  );
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
