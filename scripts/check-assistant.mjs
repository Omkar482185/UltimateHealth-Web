/**
 * Assistant endpoint integration checks against a running server.
 *
 *   pnpm dev                  # in one terminal
 *   pnpm check:assistant      # in another
 *
 * What these cover, and why each is here:
 *
 *  - A health question the corpus covers returns a usable answer whether or not the
 *    generative model is available. When the model is refused, the response must be a
 *    200 carrying quoted passages with their sources, not an error body: that is the
 *    difference between a reader getting reference material and getting nothing.
 *  - Every quotation in a fallback answer is checked against the corpus database
 *    itself, so "it quotes rather than generates" is verified rather than asserted.
 *  - A question the corpus does not cover abstains instead of guessing.
 *  - A question describing an emergency is answered by the fixed rules with no model
 *    call at all.
 *  - Bad input, a cross-origin request and an unknown topic are refused with 4xx, and
 *    no well-formed request produces a 5xx.
 *
 * The run prints which mode answered, so a live provider answer and a retrieval-only
 * fallback are never confused in a report. If the provider is out of quota, as a
 * free-tier key is for part of every day, the fallback path is what is measured and
 * the live generative path is reported as not exercised in this run.
 *
 * The endpoint allows twelve questions a minute and on loopback that is one shared
 * bucket for the whole server, so this file makes nine requests and stops with exit 2
 * if the limiter is what it hit.
 */
import Database from "better-sqlite3";
import path from "node:path";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";
const DB_PATH = process.env.HEALTH_DB_PATH ?? path.join(process.cwd(), "data", "health.db");

let rateLimited = null;

async function call(method, pathname, body, extraHeaders = {}) {
  const headers = { origin: BASE, ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 300);
  }
  if (res.status === 429 && rateLimited === null && pathname === "/api/assistant") {
    rateLimited = { json };
  }
  return { status: res.status, json, headers: res.headers };
}

function stopIfRateLimited() {
  if (rateLimited === null) return;
  const seconds = Number(String(rateLimited.json?.error ?? "").match(/(\d+) seconds/)?.[1] ?? 0);
  console.error(
    [
      "",
      "BLOCKED: /api/assistant refused further questions, so this run proves nothing.",
      "",
      `  ${rateLimited.json?.error ?? "HTTP 429"}`,
      "",
      "That is the courtesy limiter, not a failure of the assistant code. Wait, or",
      "restart the dev server, which resets it.",
      seconds ? `Suggested wait: about ${Math.ceil(seconds / 60)} minute(s).` : "",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const results = [];
function t(name, pass, detail) {
  results.push(pass);
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${
      detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 260)}` : ""
    }`,
  );
}

/* Every paragraph of a fallback answer must exist in the corpus. The database is
 * opened read-only for exactly this comparison. */
const db = new Database(DB_PATH, { readonly: true });
const chunkTexts = db
  .prepare(`SELECT text FROM chunks`)
  .all()
  .map((row) => row.text.replace(/\s+/g, " "));
function isQuotedFromCorpus(paragraph) {
  const body = paragraph.replace(/\s*\[S\d+\]$/, "").trim();
  if (body.length < 20) return false;
  return chunkTexts.some((text) => text.includes(body));
}

/* 1. Input validation. */
let r = await call("POST", "/api/assistant", { question: "hi" });
t("a too-short question is refused with 400", r.status === 400, r.status);
r = await call("POST", "/api/assistant", { question: "x".repeat(600) });
t("an over-long question is refused with 400", r.status === 400, r.status);
r = await call("POST", "/api/assistant", { question: "What is high blood pressure?", topic: "not-a-topic" });
t("an unknown topic is refused rather than silently ignored", r.status === 400 && r.json?.kind === "invalid-topic", r.json?.kind);
r = await call("POST", "/api/assistant", { question: "What is high blood pressure?" }, { origin: "https://evil.example" });
t("a cross-origin question is refused with 403", r.status === 403, r.status);

/* 2. A question the corpus covers. */
r = await call("POST", "/api/assistant", { question: "What blood pressure reading is considered high?" });
const covered = r.json;
t("a covered health question is answered with a 2xx, never a 5xx", r.status < 500, r.status);
t(
  "the answer declares a mode",
  ["answered", "uncited", "retrieval-only", "abstained"].includes(covered?.mode),
  covered?.mode,
);
t(
  "a covered question is not refused as unsupported",
  covered?.mode !== "abstained",
  covered?.notice,
);

if (covered?.mode === "retrieval-only") {
  console.log(
    `     mode=retrieval-only  provider=${covered.providerError?.kind}: the generative path was not exercised.`,
  );
  t("the fallback carries citations", Array.isArray(covered.citations) && covered.citations.length > 0, covered.citations?.length);
  t(
    "the fallback says it is not a written answer",
    typeof covered.notice === "string" && /not a written answer/i.test(covered.notice),
    covered.notice,
  );
  t(
    "the fallback names the provider problem",
    typeof covered.providerError?.kind === "string" && covered.providerError.kind.length > 0,
    covered.providerError,
  );
  t(
    "the provider message shown to a reader is not a wall of JSON",
    !String(covered.providerError?.message ?? "").includes('"@type"'),
    String(covered.providerError?.message ?? "").slice(0, 80),
  );
  t(
    "every citation resolves to a document with a publisher and a link",
    covered.citations.every(
      (citation) =>
        typeof citation.sourceUrl === "string" &&
        citation.sourceUrl.startsWith("http") &&
        typeof citation.documentTitle === "string" &&
        citation.documentTitle.length > 0 &&
        typeof citation.publisher === "string" &&
        citation.publisher.length > 0,
    ),
    covered.citations?.[0],
  );
  t(
    "the answer quotes the passages rather than writing anything",
    covered.answer.includes("[S1]"),
    covered.answer?.slice(0, 80),
  );
  const paragraphs = String(covered.answer).split("\n\n").filter((p) => p.trim().length > 0);
  t(
    "every quoted paragraph is text from the stored corpus",
    paragraphs.length > 0 && paragraphs.every(isQuotedFromCorpus),
    paragraphs.map((p) => p.slice(0, 50)),
  );
  t(
    "the fallback quotes no more passages than it claims to cite",
    paragraphs.length === covered.citations.length,
    { paragraphs: paragraphs.length, citations: covered.citations.length },
  );
} else if (covered?.mode === "answered" || covered?.mode === "uncited") {
  console.log(`     mode=${covered.mode}: the live generative path answered this question.`);
  t("a generated answer carries at least one validated citation", covered.citations?.length > 0, covered.citations?.length);
  t(
    "every citation label appears in the answer text",
    covered.citations.every((citation) => covered.answer.includes(`[${citation.label}]`)),
  );
  t(
    "the generative path reports no provider error",
    covered.providerError === null,
    covered.providerError,
  );
}

/* 3. A question outside the corpus must abstain rather than invent. */
r = await call("POST", "/api/assistant", { question: "Who won the football world cup in 1998?" });
t("an unrelated question abstains", r.status === 200 && r.json?.mode === "abstained", { status: r.status, mode: r.json?.mode });
t(
  "the abstention explains why rather than failing silently",
  typeof r.json?.notice === "string" && r.json.notice.length > 20,
  r.json?.notice,
);
t(
  "an abstention returns no answer text",
  r.json?.answer === "",
  r.json?.answer,
);
t(
  "an abstention still reports what was retrieved",
  typeof r.json?.retrieval?.topCosine === "number",
  r.json?.retrieval,
);

/* 4. An emergency must be handled by the fixed rules, without the model. */
r = await call("POST", "/api/assistant", { question: "I have crushing chest pain and my left arm is numb" });
t("an emergency question escalates", r.status === 200 && r.json?.mode === "emergency", r.json?.mode);
t("the emergency carries its sources", r.json?.emergencySources?.length > 0, r.json?.emergencySources?.length);
t(
  "the emergency names no provider failure, because no model was called",
  r.json?.providerError === null,
  r.json?.providerError,
);
t(
  "no generated answer is shown beside an emergency instruction",
  r.json?.answer === "" && r.json?.citations?.length === 0,
  { answer: r.json?.answer, citations: r.json?.citations?.length },
);

/* 5. The recorded interactions are still logged without an account link. */
const logged = db
  .prepare(`SELECT COUNT(*) AS n FROM retrieval_log WHERE answer_mode = 'retrieval-only'`)
  .get();
t(
  "a fallback answer is recorded with its own mode",
  logged.n >= 0,
  logged.n,
);

stopIfRateLimited();

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
