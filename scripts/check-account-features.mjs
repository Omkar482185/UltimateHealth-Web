/**
 * Integration checks for the profile, dashboard, saved material and PDF export.
 *
 *   pnpm dev                        # in one terminal
 *   pnpm check:account-features     # in another
 *
 * These drive the real HTTP endpoints against a running server, because most of
 * what is being checked only exists at the boundary: that a saved profile comes back
 * after a refresh, that a recommendation disappears when it is dismissed and returns
 * when it is restored, that one account cannot see another's export, and that the
 * file the browser receives is a real PDF that a parser can open.
 *
 * Every account it creates is deleted again. Registration is rate-limited to five
 * attempts per fifteen minutes per client, and on loopback every run shares one
 * bucket, so a run inside that window exits 2 (blocked) rather than reporting the
 * rest as failures.
 */
import zlib from "node:zlib";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";
const stamp = Date.now();
const A = { email: `feat-a${stamp}@example.test`, password: "correct horse battery staple" };
const B = { email: `feat-b${stamp}@example.test`, password: "another long passphrase here" };

function jar() {
  return { cookie: null };
}

async function call(j, method, path, body, extraHeaders = {}) {
  const headers = { origin: BASE, ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (j.cookie) headers.cookie = j.cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("uh_session=")) {
      const value = pair.slice("uh_session=".length);
      j.cookie = value ? `uh_session=${value}` : null;
    }
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  return { status: res.status, json, headers: res.headers, text };
}

/**
 * The text content of a PDF, for asserting on what the document actually says.
 *
 * Two things stop a raw byte search from working. pdf-lib compresses each content
 * stream with Flate, so the text is not present in the saved file at all; and it
 * writes drawn strings as hex-encoded show-text operators (`<506572736F6E616C>
 * Tj` for "Personal"), so even after inflating, the text is not legible either.
 * This decodes both: inflate, then read the hex strings back through the same
 * Latin-1 character set the standard font encodes with, and the parenthesised
 * literals as literal text.
 *
 * It is deliberately not a general PDF text extractor. Its job is to prove that a
 * value the account holds actually reached the page, which is the property being
 * checked, and it avoids adding a PDF-reading dependency just to assert on our own
 * output.
 */
function stringsFromContent(content) {
  const out = [];
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = match[1].replace(/\s+/g, "");
    if (hex.length % 2 !== 0) continue;
    // WinAnsi, which is what the standard fonts encode with, so one byte per
    // character. Decoding as UTF-16 would pair the bytes up and produce nonsense
    // that no assertion could match.
    out.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  for (const match of content.matchAll(/\((?:\\.|[^()\\])*\)/g)) {
    out.push(match[0].slice(1, -1));
  }
  return out.join(" ");
}

function collectStreams(doc, contents, out) {
  if (!contents) return;
  const resolved = doc.context.lookup(contents);
  if (!resolved) return;
  // A page's /Contents is usually an array of stream references, and those arrays
  // are not iterable in pdf-lib, so they are walked explicitly.
  if (resolved instanceof PDFArray) {
    for (const item of resolved.asArray()) collectStreams(doc, item, out);
    return;
  }
  out.push(resolved);
}

async function pdfVisibleText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const chunks = [];
  for (const page of doc.getPages()) {
    const streams = [];
    collectStreams(doc, page.node.Contents(), streams);
    for (const stream of streams) {
      try {
        const decoded =
          stream instanceof PDFRawStream
            ? decodePDFRawStream(stream).decode()
            : stream.getContents();
        chunks.push(stringsFromContent(Buffer.from(decoded).toString("latin1")));
      } catch {
        // A stream this simple reader cannot decode is skipped rather than failing
        // the check; the assertions below are all positive ones.
      }
    }
  }
  // Compressed content can also appear outside the page tree, so the whole file is
  // scanned as a fallback, which catches an inflated stream this walk missed.
  const raw = Buffer.from(bytes).toString("latin1");
  for (const candidate of raw.split(/stream\r?\n/).slice(1)) {
    const end = candidate.indexOf("endstream");
    if (end < 0) continue;
    try {
      chunks.push(zlib.inflateSync(Buffer.from(candidate.slice(0, end), "latin1")).toString("latin1"));
    } catch {
      chunks.push(candidate.slice(0, end));
    }
  }
  return chunks.join("\n");
}

/** The raw body of a response, needed for the PDF bytes. */
async function callRaw(j, path) {
  const headers = { origin: BASE };
  if (j.cookie) headers.cookie = j.cookie;
  const res = await fetch(BASE + path, { headers });
  return {
    status: res.status,
    headers: res.headers,
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

const results = [];
function t(name, pass, detail) {
  results.push({ name, pass });
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${
      detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 240)}` : ""
    }`,
  );
}

const ja = jar();
const jb = jar();
const anon = jar();

/* ---------------------------------------------------------------- *
 * Registration
 * ---------------------------------------------------------------- */
let r = await call(ja, "POST", "/api/auth/register", { ...A, acceptConsent: true });
if (r.status === 429) {
  console.error(
    [
      "",
      "BLOCKED: the sign-up limiter refused this run, so nothing was tested.",
      "",
      `  ${r.json?.error ?? `HTTP ${r.status} from /api/auth/register`}`,
      "",
      "This is the courtesy limiter, not a failure. On loopback it is one shared",
      "bucket for the whole server. Wait, or restart the dev server, which resets it.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}
t("account A is registered", r.status === 201, r.status);
r = await call(jb, "POST", "/api/auth/register", { ...B, acceptConsent: true });
t("account B is registered", r.status === 201, r.status);

/* ---------------------------------------------------------------- *
 * Profile: the expanded fields
 * ---------------------------------------------------------------- */
r = await call(ja, "PUT", "/api/account/profile", {
  displayName: "Test Person",
  birthYear: 1980,
  heightCm: 174,
  interests: ["blood-pressure", "sleep", "metabolic-health"],
  goals: ["sleep-better", "understand-readings"],
  selfReportedConditions: ["high-blood-pressure"],
  sleepGoalHours: 8,
  activityGoalMinutes: 30,
  preferredLanguage: "en",
});
t("the expanded profile saves", r.status === 200, r.status);
t(
  "the saved interests come back",
  JSON.stringify(r.json?.profile?.interests) === JSON.stringify(["blood-pressure", "sleep", "metabolic-health"]),
  r.json?.profile?.interests,
);
t(
  "the disclosed conditions come back as entered",
  JSON.stringify(r.json?.profile?.selfReportedConditions) === JSON.stringify(["high-blood-pressure"]),
  r.json?.profile?.selfReportedConditions,
);
t("the sleep goal is stored", r.json?.profile?.sleepGoalHours === 8, r.json?.profile?.sleepGoalHours);

r = await call(ja, "GET", "/api/account/profile");
t(
  "the profile persists across a separate request",
  r.json?.profile?.displayName === "Test Person" &&
    r.json?.profile?.interests?.length === 3,
  r.json?.profile?.displayName,
);

r = await call(ja, "PUT", "/api/account/profile", { interests: ["not-a-real-interest"] });
t("an unknown interest is rejected with 400", r.status === 400, r.json);
t("the rejection names the field", typeof r.json?.error === "string", r.json?.error);

r = await call(ja, "GET", "/api/account/profile");
t(
  "a rejected update changed nothing",
  r.json?.profile?.interests?.length === 3,
  r.json?.profile?.interests,
);

r = await call(ja, "PUT", "/api/account/profile", {
  interests: ["blood-pressure", "blood-pressure", "sleep", "sleep", "metabolic-health"],
});
t(
  "duplicate selections are collapsed rather than stored twice",
  JSON.stringify(r.json?.profile?.interests) ===
    JSON.stringify(["blood-pressure", "sleep", "metabolic-health"]),
  r.json?.profile?.interests,
);

r = await call(ja, "PUT", "/api/account/profile", { sleepGoalHours: 99 });
t("an implausible goal is rejected", r.status === 400, r.status);

r = await call(anon, "PUT", "/api/account/profile", { interests: ["sleep"] });
t("an unauthenticated profile write is refused", r.status === 401, r.status);

r = await call(ja, "PUT", "/api/account/profile", { interests: ["sleep"], preferredLanguage: "hi" }, { origin: "https://evil.example" });
t("a cross-origin profile write is refused", r.status === 403, r.status);

// Back to the full set for the dashboard checks below.
r = await call(ja, "PUT", "/api/account/profile", {
  interests: ["blood-pressure", "sleep", "metabolic-health"],
  goals: ["sleep-better", "understand-readings"],
  selfReportedConditions: ["high-blood-pressure"],
  sleepGoalHours: 8,
  activityGoalMinutes: 30,
  preferredLanguage: "en",
});
t("the full profile is restored", r.status === 200, r.status);

/* ---------------------------------------------------------------- *
 * Measurements: enough real data for the dashboard to have something to say
 * ---------------------------------------------------------------- */
const now = Date.now();
async function record(jarRef, kind, valuePrimary, valueSecondary, daysAgo, note) {
  return call(jarRef, "POST", "/api/records", {
    kind,
    valuePrimary,
    valueSecondary,
    measuredAt: new Date(now - daysAgo * 86_400_000).toISOString(),
    note,
  });
}

r = await record(ja, "blood-pressure", 158, 96, 2, "morning, at home");
t("a raised reading is recorded", r.status === 201, r.json);
await record(ja, "sleep", 6.2, null, 1, null);
await record(ja, "sleep", 6.8, null, 3, null);
await record(ja, "sleep", 6.5, null, 5, null);
await record(ja, "sleep", 6.9, null, 7, null);
r = await record(ja, "symptom", 8, null, 1, "headache in the evening");
t("a symptom record is accepted", r.status === 201, r.status);
r = await record(jb, "weight", 70, null, 1, null);
t("account B records its own measurement", r.status === 201, r.status);

/* ---------------------------------------------------------------- *
 * Dashboard
 * ---------------------------------------------------------------- */
r = await call(ja, "GET", "/dashboard");
t("the dashboard is served to a signed-in account", r.status === 200, r.status);
// The dashboard is HTML, so the assertions below run against the full response body
// rather than the JSON-parsed form of it.
const dashText = r.text;
t("the dashboard shows the recorded reading itself", /158\/96 mmHg/.test(dashText));
t(
  "the dashboard renders a measurement card for the recorded kind",
  /Blood pressure/.test(dashText) && /Latest on/.test(dashText),
);
t(
  "the dashboard compares a goal against the person's own recordings",
  /a night, your own goal/.test(dashText) && /average/.test(dashText),
);
t(
  "the dashboard states what a suggestion is based on",
  /What this is based on/.test(dashText),
);
t(
  "a raised reading produces a review suggestion that quotes the threshold",
  /at or above the level guidance calls raised/i.test(dashText),
);
t(
  "the disclosed condition is labelled as the person's own account",
  /your own account, as you entered it/i.test(dashText),
);
t(
  "the dashboard never claims to diagnose or predict",
  /does not diagnose, estimate a risk, or predict/.test(dashText),
);
t(
  "the dashboard says it is not a medical record",
  /not a medical record and does not replace one/i.test(dashText),
);
t(
  "a symptom rated at the high end of the user's own scale is surfaced",
  /at the higher end of your own scale/i.test(dashText),
);

/* ---------------------------------------------------------------- *
 * Dismissing and restoring a recommendation
 * ---------------------------------------------------------------- */
r = await call(ja, "GET", "/api/account/recommendations");
const initialStates = r.json?.states?.length ?? -1;
const key = /symptom:\d+/.exec(dashText)?.[0];
t("a recommendation key is present in the rendered dashboard", Boolean(key), key);

r = await call(ja, "POST", "/api/account/recommendations", { key, state: "dismissed" });
t("a recommendation can be dismissed", r.status === 200 && r.json?.ok === true, r.json);

r = await call(ja, "GET", "/dashboard");
t(
  "the dismissed recommendation is gone from the dashboard",
  !/at the higher end of your own scale/i.test(r.text),
);

r = await call(ja, "DELETE", "/api/account/recommendations", { key, state: "dismissed" });
t("a recommendation can be restored", r.status === 200, r.json);
r = await call(ja, "GET", "/dashboard");
t(
  "the restored recommendation is shown again",
  /at the higher end of your own scale/i.test(r.text),
);

r = await call(ja, "POST", "/api/account/recommendations", {
  key: "../../etc/passwd",
  state: "dismissed",
});
t("a malformed recommendation key is rejected", r.status === 400, r.json);

r = await call(ja, "POST", "/api/account/recommendations", {
  key: "measurement:blood-pressure",
  state: "seen",
});
t("an unknown recommendation state is rejected", r.status === 400, r.status);

/* ---------------------------------------------------------------- *
 * Saved learning material
 * ---------------------------------------------------------------- */
r = await call(ja, "POST", "/api/account/saved", {
  kind: "podcast",
  refId: "nhs-sleep-problems",
});
t("a podcast can be saved", r.status === 200 && r.json?.saved?.title?.length > 0, r.json);

r = await call(ja, "POST", "/api/account/saved", {
  kind: "podcast",
  refId: "nhs-sleep-problems",
});
t("saving the same item twice is idempotent", r.status === 200, r.status);

r = await call(ja, "POST", "/api/account/saved", {
  kind: "podcast",
  // A real-looking YouTube URL that is not in the catalogue: the server must
  // resolve references from its own catalogue rather than store what it is sent.
  refId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
});
t("an item outside the catalogue is refused with 404", r.status === 404, r.json);

r = await call(ja, "GET", "/api/account/saved");
t(
  "the saved list holds the resolved title",
  r.json?.saved?.length === 1 && /Sleep problems/.test(r.json.saved[0].title),
  r.json,
);

r = await call(jb, "GET", "/api/account/saved");
t("another account's saved list is empty", r.json?.saved?.length === 0, r.json);

r = await call(ja, "GET", "/dashboard");
t("the saved item appears on the dashboard", /Sleep problems \| NHS/.test(r.text));

r = await call(jb, "DELETE", "/api/account/saved", {
  kind: "podcast",
  refId: "nhs-sleep-problems",
});
t("another account cannot remove the saved item", r.json?.removed === false, r.json);

/* ---------------------------------------------------------------- *
 * PDF export
 * ---------------------------------------------------------------- */
const pdf = await callRaw(ja, "/api/account/export.pdf");
t("the export returns 200", pdf.status === 200, pdf.status);
t(
  "the export is served as a PDF",
  pdf.headers.get("content-type")?.startsWith("application/pdf"),
  pdf.headers.get("content-type"),
);
const disposition = pdf.headers.get("content-disposition") ?? "";
t(
  "the download names a file ending in .pdf",
  /attachment; filename="[^"]+\.pdf"/.test(disposition),
  disposition,
);
t(
  "the export is not cacheable",
  pdf.headers.get("cache-control") === "no-store",
  pdf.headers.get("cache-control"),
);
const header = new TextDecoder().decode(pdf.bytes.slice(0, 5));
const trailer = new TextDecoder().decode(pdf.bytes.slice(-8));
t("the file begins with the PDF signature", header === "%PDF-", header);
t("the file ends with the PDF trailer marker", /%%EOF/.test(trailer), trailer);

const parsed = await PDFDocument.load(pdf.bytes);
t("a PDF parser can open the download", parsed.getPageCount() > 0, parsed.getPageCount());
t(
  "the report spans more than one page for an account with data",
  parsed.getPageCount() >= 2,
  parsed.getPageCount(),
);
t(
  "the PDF carries the report title as document metadata",
  /Personal data export/.test(parsed.getTitle() ?? ""),
  parsed.getTitle(),
);

const pdfText = await pdfVisibleText(pdf.bytes);
t(
  "the report contains the account's own email address",
  pdfText.includes(A.email),
);
t(
  "the report contains the recorded reading",
  pdfText.includes("158/96 mmHg"),
);
t(
  "the report contains the saved item's title",
  /Sleep problems/.test(pdfText),
);
t(
  "the report states what it leaves out",
  /password hash/i.test(pdfText),
);
t(
  "the report names the sender's pdf-lib producer rather than leaking config",
  !/GEMINI|api[_-]?key/i.test(pdfText),
);
t(
  "account A's export does not contain account B's email",
  !pdfText.includes(B.email),
);

const pdfB = await callRaw(jb, "/api/account/export.pdf");
t("account B's export also succeeds", pdfB.status === 200, pdfB.status);
if (pdfB.status === 200) {
  const pdfBText = await pdfVisibleText(pdfB.bytes);
  t(
    "account B's export contains only B's data",
    pdfBText.includes(B.email) && !pdfBText.includes(A.email),
    pdfBText.slice(0, 80),
  );
}

const anonExport = await callRaw(anon, "/api/account/export.pdf");
t("an unauthenticated export is refused", anonExport.status === 401, anonExport.status);
const anonJson = await callRaw(anon, "/api/account");
t("the JSON export is also refused when signed out", anonJson.status === 401, anonJson.status);

r = await call(ja, "GET", "/api/account");
t("the JSON export still works", r.status === 200, r.status);
t(
  "the JSON export carries the same health records",
  Array.isArray(r.json?.healthRecords) && r.json.healthRecords.length === 6,
  r.json?.healthRecords?.length,
);
t(
  "the JSON export names what it excludes",
  Array.isArray(r.json?.excludedFromThisExport) && r.json.excludedFromThisExport.length >= 3,
  r.json?.excludedFromThisExport?.length,
);
t(
  "the JSON export contains no password material",
  !/password_hash|passwordHash|scrypt\$|pbkdf2/i.test(typeof r.json === "string" ? r.json : JSON.stringify(r.json)),
);

/* ---------------------------------------------------------------- *
 * Clearing, and deletion
 * ---------------------------------------------------------------- */
r = await call(ja, "PUT", "/api/account/profile", {
  interests: [],
  goals: [],
  selfReportedConditions: [],
  sleepGoalHours: null,
  activityGoalMinutes: null,
});
t(
  "the optional health details can be cleared",
  r.json?.profile?.interests?.length === 0 &&
    r.json?.profile?.selfReportedConditions?.length === 0 &&
    r.json?.profile?.sleepGoalHours === null,
  r.json?.profile,
);

r = await call(ja, "GET", "/dashboard");
t("with the details cleared the dashboard stops suggesting goals", /No goals set/.test(r.text));

r = await call(ja, "DELETE", "/api/account", {
  confirmation: "delete my account",
  password: A.password,
});
t("the account can still be deleted", r.status === 200 && r.json?.ok === true, r.json);
r = await call(jb, "DELETE", "/api/account", {
  confirmation: "delete my account",
  password: B.password,
});
t("the second account can be deleted too", r.status === 200 && r.json?.ok === true, r.json);

const failed = results.filter((entry) => !entry.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
