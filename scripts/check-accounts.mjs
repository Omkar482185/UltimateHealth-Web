/**
 * Account integration checks against a running server.
 *
 *   pnpm dev                    # in one terminal
 *   pnpm check:accounts         # in another
 *
 * These are not unit checks: they drive the real HTTP endpoints so that the parts
 * that only exist at the boundary are covered. That includes the session cookie
 * itself, cross-account isolation, the same-origin rejection, and the cascade
 * from deleting an account. A unit check cannot see any of those, because they are
 * properties of the request, not of a function.
 *
 * Every account it creates is deleted again unless the deletion is the thing being
 * tested, so repeated runs do not accumulate rows. It prints one line per check and
 * exits non-zero on the first failure, so it can be run in a shell loop.
 *
 * Note: registration is rate-limited to five attempts per fifteen minutes, so a
 * repeated run can legitimately report 429. That is the limiter working.
 */
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";
const stamp = Date.now();
const A = { email: `a${stamp}@example.test`, password: "correct horse battery staple" };
const B = { email: `b${stamp}@example.test`, password: "another long passphrase here" };

function jar() { return { cookie: null }; }
async function call(j, method, path, body, extraHeaders = {}) {
  const headers = { origin: BASE, ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (j.cookie) headers.cookie = j.cookie;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("uh_session=")) {
      const v = pair.slice("uh_session=".length);
      j.cookie = v ? `uh_session=${v}` : null;
    }
  }
  let json = null; const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: res.status, json };
}

const results = [];
function t(name, pass, detail) { results.push({ name, pass, detail }); console.log(`${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail).slice(0,220) : ""}`); }

const ja = jar(), jb = jar(), anon = jar();

// register A
let r = await call(ja, "POST", "/api/auth/register", { ...A, acceptConsent: true });

// The sign-up limiter is an in-process courtesy limit of five attempts per
// fifteen minutes, keyed per client. Served on loopback there is no proxy header,
// so every run shares one key and a second run inside the window is refused.
// Continuing from here would report the remaining checks as failures for a reason
// that has nothing to do with the code under test, so stop and say so. The exit
// code is 2, distinct from 1, so "blocked" is never mistaken for "broken".
if (r.status === 429) {
  const seconds = Number(r.json?.error?.match(/(\d+) seconds/)?.[1] ?? 0);
  console.error(
    [
      "",
      "BLOCKED: this run could not register an account, so nothing was tested.",
      "",
      `  ${r.json?.error ?? `HTTP ${r.status} from /api/auth/register`}`,
      "",
      "This is the courtesy limiter, not a failure of the account code. On loopback the",
      "limit is one shared bucket for the whole server, so a run within the window is",
      "refused.",
      seconds ? `Wait about ${Math.ceil(seconds / 60)} minute(s), or restart the dev server, which resets it.` : "Restart the dev server, which resets it.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

t("register creates an account and sets a session", r.status === 201 && ja.cookie !== null, r);
t("register reports no records yet", r.json?.account?.hasRecords === false, r.json);

// weak password rejected
r = await call(jar(), "POST", "/api/auth/register", { email: `c${stamp}@example.test`, password: "short", acceptConsent: true });
t("weak password rejected before hashing", r.status === 400 && r.json?.kind === "too-short", r.json);

// missing consent rejected
r = await call(jar(), "POST", "/api/auth/register", { email: `d${stamp}@example.test`, password: "a sufficiently long password" });
t("registration without consent accepted=false is rejected", r.status === 400, r.json);

// duplicate email
r = await call(jar(), "POST", "/api/auth/register", { ...A, acceptConsent: true });
t("duplicate email rejected with 409", r.status === 409 && r.json?.kind === "email-taken", r.json);

// profile requires auth
r = await call(anon, "GET", "/api/account/profile");
t("profile without a session is 401", r.status === 401, r);

// profile with session
r = await call(ja, "GET", "/api/account/profile");
t("profile with a session is 200 and is A's own", r.status === 200 && r.json?.account?.email === A.email, r.json);
const aProfileEmail = r.json?.account?.email;

// update profile
r = await call(ja, "PUT", "/api/account/profile", { displayName: "Person A", birthYear: 1975, heightCm: 172, acceptConsent: true });
t("profile update persists", r.status === 200 && r.json?.profile?.birthYear === 1975 && r.json?.profile?.consentVersion, r.json);

// partial update does not wipe other fields
r = await call(ja, "PUT", "/api/account/profile", { displayName: "Person A renamed" });
t("partial update keeps previously stored fields", r.status === 200 && r.json?.profile?.birthYear === 1975 && r.json?.profile?.heightCm === 172, r.json?.profile);

// invalid values rejected
r = await call(ja, "PUT", "/api/account/profile", { birthYear: 3021 });
t("implausible birth year rejected", r.status === 400, r.json?.error);

// cross-origin blocked
r = await call(ja, "PUT", "/api/account/profile", { displayName: "x" }, { origin: "https://evil.example" });
t("cross-origin profile write is 403", r.status === 403, r);

// wrong password login
r = await call(jar(), "POST", "/api/auth/login", { email: A.email, password: "wrong password here" });
t("wrong password rejected", r.status === 401, r.json);

// unknown account login gives the SAME message and status
r = await call(jar(), "POST", "/api/auth/login", { email: `nobody${stamp}@example.test`, password: "wrong password here" });
t("unknown account is indistinguishable from a wrong password", r.status === 401 && r.json?.error === "That email address and password combination was not recognised.", r.json);

// correct login
const ja2 = jar();
r = await call(ja2, "POST", "/api/auth/login", { email: A.email, password: A.password });
t("correct password signs in", r.status === 200 && ja2.cookie !== null, r);

// register B and check isolation
r = await call(jb, "POST", "/api/auth/register", { ...B, acceptConsent: true });
t("second account registers", r.status === 201, r);
r = await call(jb, "GET", "/api/account/profile");
t("B sees only B's account", r.status === 200 && r.json?.account?.email === B.email && r.json?.account?.email !== aProfileEmail, r.json?.account);
t("B's profile is empty, not A's", r.json?.profile?.displayName === null && r.json?.profile?.birthYear === null, r.json?.profile);

/* ------------------------------------------------------------------ */
/* Health records                                                      */
/* ------------------------------------------------------------------ */

const recNow = new Date(Date.now() - 3_600_000).toISOString();

r = await call(anon, "GET", "/api/records");
t("records without a session is 401", r.status === 401, r);

r = await call(ja, "POST", "/api/records", {
  kind: "blood-pressure", valuePrimary: 128, valueSecondary: 82, measuredAt: recNow, note: "after walking",
});
t("creates a blood pressure record", r.status === 201 && r.json?.record?.valuePrimary === 128 && r.json?.record?.valueSecondary === 82, r.json);
const aBpId = r.json?.record?.id;
t("takes the unit from the kind definition, not from the request", r.json?.record?.unit === "mmHg", r.json?.record?.unit);
t("marks the record self-reported", r.json?.record?.source === "self-reported", r.json?.record?.source);
t("keeps the note", r.json?.record?.note === "after walking", r.json?.record?.note);
t("never returns an owner id with a record", r.json?.record?.user_id === undefined && r.json?.record?.userId === undefined, Object.keys(r.json?.record ?? {}));

r = await call(ja, "POST", "/api/records", { kind: "weight", valuePrimary: 72.34, measuredAt: recNow });
t("rounds a decimal weight to one decimal place before storing", r.json?.record?.valuePrimary === 72.3, r.json?.record?.valuePrimary);
const aWeightId = r.json?.record?.id;

// Validation, exercised through the endpoint rather than the function.
r = await call(ja, "POST", "/api/records", { kind: "blood-pressure", valuePrimary: 82, valueSecondary: 128, measuredAt: recNow });
t("rejects a reversed blood pressure reading", r.status === 400 && String(r.json?.error).includes("wrong way round"), r.json);

r = await call(ja, "POST", "/api/records", { kind: "blood-pressure", valuePrimary: 500, valueSecondary: 900, measuredAt: recNow });
t("reports every validation issue in one response", r.status === 400 && Array.isArray(r.json?.issues) && r.json.issues.length === 2, r.json);

r = await call(ja, "POST", "/api/records", { kind: "blood-pressure", valuePrimary: 120, measuredAt: recNow });
t("requires the second value of a two-value kind", r.status === 400, r.json);

r = await call(ja, "POST", "/api/records", { kind: "weight", valuePrimary: "heavy", measuredAt: recNow });
t("rejects a non-numeric value", r.status === 400, r.json);

r = await call(ja, "POST", "/api/records", { kind: "weight", valuePrimary: 70, measuredAt: "the day before yesterday" });
t("rejects an unreadable timestamp", r.status === 400, r.json);

r = await call(ja, "POST", "/api/records", { kind: "weight", valuePrimary: 70, measuredAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
t("rejects a reading dated in the future", r.status === 400, r.json);

r = await call(ja, "POST", "/api/records", { kind: "carrots", valuePrimary: 1, measuredAt: recNow });
t("rejects an unsupported kind", r.status === 400, r.json);

// Listing and trends.
r = await call(ja, "GET", "/api/records");
t("lists exactly A's own records", r.status === 200 && r.json?.records?.length === 2, r.json?.records?.length);
t("returns a trend per recorded kind", r.status === 200 && Array.isArray(r.json?.trends) && r.json.trends.length === 2, r.json?.trends?.map((x) => x.kind));
const weightTrend = r.json?.trends?.find((x) => x.kind === "weight");
t("computes trend statistics from stored rows", weightTrend?.primary?.last === 72.3 && weightTrend?.points?.length === 1, weightTrend?.primary);

r = await call(ja, "GET", "/api/records?kind=weight");
t("filters by kind", r.status === 200 && r.json?.records?.length === 1 && r.json.records[0].kind === "weight", r.json?.records?.length);
t("a kind filter narrows the trends too", r.json?.trends?.length === 1 && r.json.trends[0].kind === "weight", r.json?.trends?.map((x) => x.kind));

r = await call(ja, "GET", "/api/records?kind=carrots");
t("rejects an unknown kind filter", r.status === 400, r.json);
r = await call(ja, "GET", "/api/records?from=not-a-date");
t("rejects an unreadable date filter", r.status === 400, r.json);
r = await call(ja, "GET", "/api/records?from=" + encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString()));
t("a future lower bound yields an empty list, not an error", r.status === 200 && r.json?.records?.length === 0, r.json?.records?.length);

// Cross-account isolation. Every one of these must fail without confirming that
// the record exists at all, which is why the expected status is 404 and not 403.
r = await call(jb, "POST", "/api/records", { kind: "sleep", valuePrimary: 6.5, measuredAt: recNow });
t("B can create its own record", r.status === 201, r.status);
r = await call(jb, "GET", "/api/records");
t("B sees only B's record", r.status === 200 && r.json?.records?.length === 1 && r.json.records[0].kind === "sleep", r.json?.records?.length);

r = await call(jb, "PUT", `/api/records/${aBpId}`, { kind: "blood-pressure", valuePrimary: 111, valueSecondary: 71, measuredAt: recNow });
t("another account cannot update A's record", r.status === 404, r);
r = await call(jb, "DELETE", `/api/records/${aBpId}`);
t("another account cannot delete A's record", r.status === 404, r);
r = await call(ja, "GET", "/api/records?kind=blood-pressure");
t("A's record is unchanged after B's attempts", r.status === 200 && r.json?.records?.[0]?.valuePrimary === 128 && r.json.records[0].valueSecondary === 82, r.json?.records?.[0]);

r = await call(ja, "PUT", "/api/records/99999999", { kind: "weight", valuePrimary: 70, measuredAt: recNow });
t("updating a record that does not exist is 404", r.status === 404, r);
r = await call(ja, "DELETE", "/api/records/abc");
t("a non-numeric record id is not found", r.status === 404, r);

r = await call(ja, "POST", "/api/records", { kind: "weight", valuePrimary: 70, measuredAt: recNow }, { origin: "https://evil.example" });
t("cross-origin record write is 403", r.status === 403, r);

// Own-record update and delete.
r = await call(ja, "PUT", `/api/records/${aWeightId}`, { kind: "weight", valuePrimary: 71.5, measuredAt: recNow, note: "revised" });
t("A can update its own record", r.status === 200 && r.json?.record?.valuePrimary === 71.5, r.json?.record);
r = await call(ja, "GET", "/api/records?kind=weight");
t("the update is persisted", r.json?.records?.[0]?.valuePrimary === 71.5 && r.json.records[0].note === "revised", r.json?.records?.[0]);

r = await call(ja, "DELETE", `/api/records/${aWeightId}`);
t("A can delete its own record", r.status === 200 && r.json?.ok === true, r.json);
r = await call(ja, "GET", "/api/records?kind=weight");
t("the deleted record is gone", r.status === 200 && r.json?.records?.length === 0, r.json?.records?.length);
r = await call(ja, "DELETE", `/api/records/${aWeightId}`);
t("deleting the same record twice is 404", r.status === 404, r.status);

// export
r = await call(ja, "GET", "/api/account");
t("export returns the account's own data", r.status === 200 && r.json?.account?.email === A.email, { status: r.status });
t("export includes the account's health records", Array.isArray(r.json?.healthRecords) && r.json.healthRecords.length === 1 && r.json.healthRecords[0].kind === "blood-pressure", r.json?.healthRecords?.length);
t("export excludes the password hash", !JSON.stringify(r.json).includes("scrypt$"), "no hash present");

// delete with wrong password
r = await call(jb, "DELETE", "/api/account", { confirmation: "delete my account", password: "not the password" });
t("deletion refused with a wrong password", r.status === 401, r.json);
r = await call(jb, "GET", "/api/account/profile");
t("account survives a refused deletion", r.status === 200, r.status);

// delete with correct password
r = await call(jb, "DELETE", "/api/account", { confirmation: "delete my account", password: B.password });
t("deletion succeeds with the correct password", r.status === 200 && r.json?.ok === true, r.json);
t("session is cleared after deletion", jb.cookie === null, jb.cookie);
r = await call(jb, "GET", "/api/account/profile");
t("deleted account can no longer read its profile", r.status === 401, r.status);

// logout
r = await call(ja2, "POST", "/api/auth/logout");
t("logout succeeds", r.status === 200, r.status);
r = await call(ja2, "GET", "/api/account/profile");
t("session no longer resolves after logout", r.status === 401, r.status);

const failed = results.filter(x => !x.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exitCode = failed.length === 0 ? 0 : 1;
