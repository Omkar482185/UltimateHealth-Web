/**
 * Guidance endpoint integration checks against a running server.
 *
 *   pnpm dev            # in one terminal
 *   pnpm check:guidance # in another
 *
 * These drive the real endpoint. What they cover that a unit check cannot is the
 * boundary: that a declared warning sign survives transport and is escalated by the
 * server, that an unknown rule id is refused rather than passed through, that the
 * endpoint is still same-origin only, and that the triage level for an ordinary
 * symptom is not an emergency.
 *
 * None of these checks needs a language model. The care level is produced by fixed
 * rules, so it is measurable while the provider is out of quota, which is the point.
 *
 * The endpoint carries a courtesy limit of fifteen submissions a minute, and on
 * loopback every run shares one bucket, so the whole file must stay under that. This
 * file makes fourteen requests, which leaves one spare; anything added here has to be
 * paid for by merging or removing another, and `check:security` also spends from the
 * same bucket. When the limit is hit the run stops and exits 2 rather than reporting
 * the limiter as a failure of the code under test.
 */
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";

let rateLimited = null;

async function call(method, path, body, extraHeaders = {}) {
  const headers = { origin: BASE, ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text.slice(0, 200);
  }
  if (res.status === 429 && rateLimited === null) {
    rateLimited = { path, json };
  }
  return { status: res.status, json };
}

/**
 * The limiter is a property of the server, not of the guidance logic, so a run that
 * trips it has measured nothing. Exit 2 is distinct from 1 so that "blocked" is
 * never read as "broken".
 */
function stopIfRateLimited() {
  if (rateLimited === null) return;
  const seconds = Number(
    String(rateLimited.json?.error ?? "").match(/(\d+) seconds/)?.[1] ?? 0,
  );
  console.error(
    [
      "",
      `BLOCKED: /api/guidance refused further submissions, so the run proves nothing.`,
      "",
      `  ${rateLimited.json?.error ?? `HTTP 429 from ${rateLimited.path}`}`,
      "",
      "This is the courtesy limiter, not a failure of the guidance code. On loopback the",
      "limit is one shared bucket for the whole server, and this file makes more requests",
      "than the previous version did.",
      seconds
        ? `Wait about ${Math.ceil(seconds / 60)} minute(s), or restart the dev server, which resets it.`
        : "Restart the dev server, which resets it.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const results = [];
function t(name, pass, detail) {
  results.push(pass);
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail).slice(0, 220) : ""}`,
  );
}

// 1. A declared warning sign escalates, and the response carries the sources for it.
let r = await call("POST", "/api/guidance", { symptomIds: [], emergencySignIds: ["possible-heart-attack"] });
stopIfRateLimited();
t("a declared warning sign escalates to emergency", r.status === 200 && r.json?.careLevel === "emergency", r.json?.careLevel);
t("the emergency response carries supporting sources", Array.isArray(r.json?.emergencySources) && r.json.emergencySources.length > 0, r.json?.emergencySources?.length);
t("the matched rule is named", Array.isArray(r.json?.emergency?.matchedRules) && r.json.emergency.matchedRules.some((m) => m.id === "possible-heart-attack"), r.json?.emergency?.matchedRules);
t("no explanation is generated for an emergency", r.json?.explanation === null, r.json?.explanation);
// Nothing is asked once a warning sign has fired. The clarifying step must not
// appear behind an escalation, because the screen is there to instruct, not to ask.
t("no clarifying question is asked after an escalation", Array.isArray(r.json?.followUpQuestions) && r.json.followUpQuestions.length === 0, r.json?.followUpQuestions?.length);
// Self-care measures must not appear beside an instruction to seek emergency care.
// Both assertions below read a response this file already fetches, so they cost no
// request against the endpoint's per-minute limit.
t("no self-care measures are shown after an escalation", Array.isArray(r.json?.selfCare) && r.json.selfCare.length === 0, r.json?.selfCare?.length);

// 2. Regression. Several rule labels deliberately do not contain the phrases their
//    patterns match, so "Possible stroke signs" matches no pattern of its own. The
//    server must escalate on the declared id rather than re-deriving the match from
//    the label text, or a reported stroke sign would produce a routine answer.
r = await call("POST", "/api/guidance", { symptomIds: [], emergencySignIds: ["possible-stroke", "possible-self-harm", "pregnancy-warning-sign"] });
t("escalates on rule ids whose labels match no pattern", r.status === 200 && r.json?.careLevel === "emergency", r.json?.careLevel);
t("names every declared rule, not just the textual matches", ["possible-stroke", "possible-self-harm", "pregnancy-warning-sign"].every((id) => r.json?.emergency?.matchedRules?.some((m) => m.id === id)), r.json?.emergency?.matchedRules);

// 3. Ids outside the rule table are refused, so the client cannot inject wording. The
//    two invalid values go in one body deliberately: zod reports one issue per failing
//    index, so a single request proves both are rejected, and asserting both issue
//    paths is stronger than two separate 400s that would only prove the body was
//    refused. It also keeps this file inside the endpoint's per-minute limit.
r = await call("POST", "/api/guidance", { symptomIds: [], emergencySignIds: ["not-a-rule", "chest pain"] });
const issuePaths = (r.json?.issues ?? []).map((i) => i.path);
t("an unknown rule id is rejected, by name", r.status === 400 && issuePaths.includes("emergencySignIds.0"), { status: r.status, issuePaths });
t("a free-text value is rejected in place of a rule id", r.status === 400 && issuePaths.includes("emergencySignIds.1"), { status: r.status, issuePaths });

// 4. The existing guard still holds when nothing at all is supplied.
r = await call("POST", "/api/guidance", { symptomIds: [] });
t("an empty submission is still refused", r.status === 400, r.json?.error);

// 5. Same-origin is still enforced on the widened body.
r = await call("POST", "/api/guidance", { symptomIds: [], emergencySignIds: ["possible-heart-attack"] }, { origin: "https://evil.example" });
t("cross-origin guidance submission is 403", r.status === 403, r.status);

// 6. An ordinary symptom must not escalate, which also confirms the declared-sign
//    path did not make everything an emergency.
r = await call("POST", "/api/guidance", { symptomIds: ["fatigue"] });
t("an ordinary symptom is not treated as an emergency", r.status === 200 && r.json?.careLevel !== "emergency", r.json?.careLevel);
t("an ordinary symptom still returns a care level and reasons", typeof r.json?.careLevelLabel === "string" && Array.isArray(r.json?.reasons), { level: r.json?.careLevel, reasons: r.json?.reasons?.length });
t("a symptom with no authored branch is asked nothing", Array.isArray(r.json?.followUpQuestions) && r.json.followUpQuestions.length === 0, r.json?.followUpQuestions?.length);
t("an ordinary result offers general measures the sources describe", Array.isArray(r.json?.selfCare) && r.json.selfCare.length > 0, r.json?.selfCare?.length);
t("every general measure carries text", (r.json?.selfCare ?? []).every((item) => typeof item.text === "string" && item.text.length > 40), r.json?.selfCare?.map((item) => item.text?.length));
t("the sourced general measures cite at least one document each", (r.json?.selfCare ?? []).filter((item) => item.sources.length > 0).length >= 4, r.json?.selfCare?.map((item) => item.sources.length));
t("every cited measure resolves to a real source with a URL", (r.json?.selfCare ?? []).every((item) => item.sources.every((source) => typeof source.sourceUrl === "string" && source.sourceUrl.startsWith("http"))), r.json?.selfCare?.[0]?.sources);
t("the one measure that is a boundary, not advice, cites nothing", (r.json?.selfCare ?? []).some((item) => item.sources.length === 0 && /medicine/i.test(item.text)), r.json?.selfCare?.map((item) => [item.sources.length, item.text.slice(0, 30)]));
t("no section that renders is left empty", Array.isArray(r.json?.limitations) && r.json.limitations.length > 0 && Array.isArray(r.json?.warningSigns) && r.json.warningSigns.length > 0, { limitations: r.json?.limitations?.length, warningSigns: r.json?.warningSigns?.length });

// 7. Notes are still screened, so a warning sign typed into the second step is caught
//    even though the first step reported nothing.
r = await call("POST", "/api/guidance", { symptomIds: ["fatigue"], notes: "also chest pain and sweating" });
t("a warning sign typed in the notes is still caught", r.status === 200 && r.json?.careLevel === "emergency", r.json?.careLevel);

// 8. The first clarifying round is chosen from the symptoms, so two symptoms must
//    produce two different sets, and each question must arrive with its sources.
r = await call("POST", "/api/guidance", { symptomIds: ["headache"] });
const headacheQuestions = (r.json?.followUpQuestions ?? []).map((q) => q.id);
t("a non-emergency symptom is offered its own clarifying question", r.status === 200 && headacheQuestions.includes("headache-sudden-severe"), headacheQuestions);
t("a clarifying question carries the sources behind it", (r.json?.followUpQuestions ?? []).every((q) => Array.isArray(q.sources) && q.sources.length > 0), r.json?.followUpQuestions);
t("a question chosen from symptoms is a first-round question", (r.json?.followUpQuestions ?? []).every((q) => q.round === 1 && q.why === null), r.json?.followUpQuestions?.map((q) => [q.round, q.why]));

r = await call("POST", "/api/guidance", { symptomIds: ["palpitations"] });
const palpitationsRound1 = (r.json?.followUpQuestions ?? []).map((q) => q.id);
t("the branch differs by symptom: another symptom gets other questions", r.status === 200 && palpitationsRound1.includes("palpitations-chest-pain") && !palpitationsRound1.includes("headache-sudden-severe"), palpitationsRound1);
t("the first round asks only what the symptom calls for, not every question about it", palpitationsRound1.length === 1, palpitationsRound1);

// 9. The adaptive second round. This is the assertion the feature turns on: the
//    question must come from the answer, so the same symptom with a different answer
//    produces a different set, and the follow-on question must say why it is asked.
const afterNo = await call("POST", "/api/guidance", { symptomIds: ["palpitations"], followUpResponses: [{ id: "palpitations-chest-pain", answer: "no" }] });
const secondRound = afterNo.json?.followUpQuestions ?? [];
const secondRoundIds = secondRound.map((q) => q.id);
t("a no-answer selects a second question for the same symptom", afterNo.status === 200 && secondRoundIds.includes("palpitations-fainting"), secondRoundIds);
t("the follow-on is a second-round question", secondRound.every((q) => q.round === 2), secondRound.map((q) => q.round));
t("the follow-on explains why it is being asked", secondRound.some((q) => typeof q.why === "string" && q.why.length > 20), secondRound.map((q) => q.why));
t("the answered question is not asked again", !secondRoundIds.includes("palpitations-chest-pain"), secondRoundIds);
t("answering no leaves the care level exactly as it was", afterNo.json?.careLevel === "medical-review", afterNo.json?.careLevel);
t("the pathway records the answer and that it declared no rule", afterNo.json?.pathway?.length === 1 && afterNo.json.pathway[0].answer === "no" && afterNo.json.pathway[0].declaredRuleId === null, afterNo.json?.pathway);

// 10. A yes-answer escalates through the same rule path the emergency step uses, with
//     the provenance recorded, and stops the round: nothing is asked after a warning
//     sign has fired.
const afterYes = await call("POST", "/api/guidance", { symptomIds: ["palpitations"], followUpResponses: [{ id: "palpitations-chest-pain", answer: "yes" }] });
const rankOf = (level) => ["monitor", "medical-review", "emergency"].indexOf(level);
t("a yes-answer raises the care level to emergency", afterYes.status === 200 && afterYes.json?.careLevel === "emergency", afterYes.json?.careLevel);
t("an answer can raise the level and never lower it", rankOf(afterYes.json?.careLevel) >= rankOf(afterNo.json?.careLevel), { no: afterNo.json?.careLevel, yes: afterYes.json?.careLevel });
t("the escalation names the rule the question stands for", afterYes.json?.emergency?.matchedRules?.some((m) => m.id === "possible-heart-attack"), afterYes.json?.emergency?.matchedRules);
t("the escalation records that a clarifying answer caused it", afterYes.json?.emergency?.matchedRules?.some((m) => /clarifying question/i.test(String(m.triggeredBy))), afterYes.json?.emergency?.matchedRules?.map((m) => m.triggeredBy));
t("no follow-on question is offered after an escalation", Array.isArray(afterYes.json?.followUpQuestions) && afterYes.json.followUpQuestions.length === 0, afterYes.json?.followUpQuestions?.length);
t("the pathway records the rule the answer declared", afterYes.json?.pathway?.[0]?.declaredRuleId === "possible-heart-attack", afterYes.json?.pathway);
t("the emergency response still withholds a generated explanation", afterYes.json?.explanation === null, afterYes.json?.explanation);
t("escalation through a clarifying answer also withholds the self-care section", Array.isArray(afterYes.json?.selfCare) && afterYes.json.selfCare.length === 0, afterYes.json?.selfCare?.length);

// 11. "I do not know" is its own answer. It must declare nothing, and it must not be
//     read as a no, so the follow-on it triggers is still asked rather than skipped.
const afterUnknown = await call("POST", "/api/guidance", { symptomIds: ["palpitations"], followUpResponses: [{ id: "palpitations-chest-pain", answer: "unknown" }] });
const unknownRound = (afterUnknown.json?.followUpQuestions ?? []).map((q) => q.id);
t("an I-do-not-know answer leaves the care level unchanged", afterUnknown.status === 200 && afterUnknown.json?.careLevel === "medical-review", afterUnknown.json?.careLevel);
t("I-do-not-know is recorded as unknown, not as a no", afterUnknown.json?.pathway?.[0]?.answer === "unknown" && afterUnknown.json?.pathway?.[0]?.declaredRuleId === null, afterUnknown.json?.pathway);
t("I-do-not-know still asks the follow-on instead of dropping it", unknownRound.includes("palpitations-fainting"), unknownRound);

// 12. An id outside the question table is refused, exactly as for the emergency step,
//     so the client cannot put its own wording or its own rule in front of the screen.
r = await call("POST", "/api/guidance", { symptomIds: ["palpitations"], followUpResponses: [{ id: "not-a-question", answer: "yes" }] });
t("an unknown clarifying question id is rejected", r.status === 400, r.status);
t("an answer outside yes/no/unknown is rejected", (await call("POST", "/api/guidance", { symptomIds: ["palpitations"], followUpResponses: [{ id: "palpitations-chest-pain", answer: "maybe" }] })).status === 400, "maybe");

stopIfRateLimited();

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
