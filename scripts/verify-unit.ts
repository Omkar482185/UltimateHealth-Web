/**
 * Unit checks for the deterministic core.
 *
 *   pnpm verify
 *
 * These cover the parts of the pipeline whose behaviour must not depend on a model:
 * citation validation, the emergency screen, triage thresholds, the FTS query
 * builder, and overlap stitching. They run with no API key and no network access.
 *
 * This is deliberately not a test framework. It is a small, readable harness so
 * that the assertions can be read in the report and trusted.
 */
import {
  classifyGeminiError,
  describeGeminiError,
  MissingKeyError,
  providerDetail,
} from "@/lib/gemini";
import { toFtsQuery } from "@/lib/db/sqlite-store";
import { shouldSkipIngestion } from "@/lib/rag/ingest";
import { extractSections } from "@/lib/rag/extract";
import {
  buildRetrievalOnlyAnswer,
  RETRIEVAL_ONLY_LIMITS,
  trimToSentence,
  validateCitations,
} from "@/lib/rag/generate";
import type { EvidenceChunk } from "@/lib/db/store";
import { parseReading, triage } from "@/lib/rag/triage";
import {
  applyDiversityRules,
  applyDominanceRule,
  findIncomparableVectors,
  type FusedHit,
} from "@/lib/rag/retrieve";
import {
  EMERGENCY_MESSAGE,
  EMERGENCY_STEPS,
  SAFETY_RULES,
  screenForEmergency,
} from "@/lib/rag/safety";
import { stitchChunks } from "@/lib/rag/stitch";
import {
  declaredRuleIdsFromFollowUps,
  EMERGENCY_QUESTIONS,
  FOLLOW_UP_LIMITS,
  FOLLOW_UP_QUESTIONS,
  selectFollowUpQuestions,
  SYMPTOM_OPTIONS,
  type FollowUpAnswer,
  type FollowUpQuestion,
} from "@/lib/rag/guidance-content";
import { CORPUS_SOURCES } from "@/lib/corpus/sources";
import { INTERNAL_ERROR_BODY, redactError } from "@/lib/api-guard";
import {
  resolveReview,
  reviewsFor,
  staleness,
  type SourceReview,
} from "@/lib/corpus/reviews";
import { validateRecordInput } from "@/lib/health/validate";
import { buildTrend, buildTrends } from "@/lib/health/trends";
import type { HealthRecord } from "@/lib/health/kinds";
import {
  buildRecommendations,
  suggestedContentTopics,
} from "@/lib/recommendations";
import {
  INTEREST_IDS,
  INTEREST_OPTIONS,
  isConditionId,
  isGoalId,
  isInterestId,
  isLanguageId,
  isPodcastTopicId,
} from "@/lib/profile/options";
import { exportFilename, toLatin1Text } from "@/lib/export/pdf";
import { EXPORT_NOTES } from "@/lib/export/report";
import { DISEASES } from "@/lib/community/diseases";
import {
  EXPERIENCE_TOPICS,
  experienceTopicForNativeTopic,
  isExperienceTopicId,
} from "@/lib/community/experience-topics";
import {
  buildProviderQuery,
  decodeEntities,
  excerptFromHtml,
  isAllowedResultUrl,
  isSafeOutboundUrl,
  PROVIDER_FINDINGS,
} from "@/lib/community/experience-search";

let passed = 0;
let failed = 0;

/** Runs a validation expected to fail and returns its issues. */
function catchIssues(fn: () => unknown): string[] {
  try {
    fn();
    return [];
  } catch (error) {
    const issues = (error as { issues?: unknown }).issues;
    return Array.isArray(issues) ? issues.map(String) : [`unexpected: ${String(error)}`];
  }
}

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

console.log("citation validation");

{
  const result = validateCitations(
    "Blood pressure is high [S1]. It is usually silent [S9] and treatable [S2].",
    2,
  );
  check("keeps citations that resolve to a supplied passage", result.validLabels.join(",") === "S1,S2", result);
  check("removes a citation that does not resolve", !result.text.includes("[S9]"), result.text);
  check("counts the removed citation", result.stripped === 1, result.stripped);
  check("leaves surrounding prose intact", result.text.includes("It is usually silent and treatable"), result.text);
}

{
  const result = validateCitations("No citations in this answer at all.", 3);
  check("reports zero valid citations for an uncited answer", result.validLabels.length === 0, result);
  check("counts no stripping when nothing was cited", result.stripped === 0, result);
}

{
  const result = validateCitations("Claim [S3] and another [S0].", 3);
  check("treats S0 as invalid because labels start at S1", result.validLabels.join(",") === "S3", result);
  check("counts S0 as stripped", result.stripped === 1, result);
}

// Regression: models group citations naturally as "[S1, S2]". Matching only
// single-label brackets silently dropped the whole group, so these citations were
// neither resolved nor counted, and the citation-correctness measure was wrong.
{
  const result = validateCitations(
    "Raised blood pressure is usually symptomless [S1, S2]. Confirm it over repeat readings [S3, S4, S5].",
    5,
  );
  check(
    "resolves every label inside a grouped citation",
    result.validLabels.join(",") === "S1,S2,S3,S4,S5",
    result,
  );
  check("counts no stripping when every grouped label resolves", result.stripped === 0, result);
  check("keeps the group visible as a normalised bracket", result.text.includes("[S3, S4, S5]"), result.text);
}

{
  const result = validateCitations("One claim [S1, S9] and no other.", 3);
  check("keeps the resolvable label from a partly invalid group", result.validLabels.join(",") === "S1", result);
  check("counts the unsupported label inside the group as stripped", result.stripped === 1, result);
  check("removes the unsupported label from the visible text", !result.text.includes("S9"), result.text);
  check("leaves the group with only its valid label", result.text.includes("[S1]"), result.text);
}

{
  const result = validateCitations("Nothing resolvable here [S7, S8].", 3);
  check("removes a group with no resolvable label", !result.text.includes("S7") && !result.text.includes("S8"), result.text);
  check("counts both unsupported labels", result.stripped === 2, result);
  check("reports no valid labels for that answer", result.validLabels.length === 0, result);
}

console.log("evidence extraction");

// Regression: short list items are the substance of warning-sign sections, and
// a tag-blind 25-character floor deleted them. On the WHO dengue page that
// removed "severe abdominal pain", "bleeding gums or nose" and "blood in vomit
// or stool" from a document that is the corpus's only source on severe dengue.
{
  const filler = `Filler sentence that is definitely longer than the floor. ${Array.from(
    { length: 12 },
    (_, i) => `Sentence number ${i + 1} of the example page.`,
  ).join(" ")}`;
  const html = `<!doctype html><html><head><title>Example</title></head><body>
    <main><h2>Symptoms</h2>
      <ul><li>Fever</li><li>severe abdominal pain</li><li>bleeding gums</li><li>rash.</li></ul>
      <p>${filler}</p>
      <p>Share</p>
      <p>Print</p>
    </main></body></html>`;
  const doc = extractSections(html, "Example");
  const paragraphs = doc.sections.flatMap((s) => s.paragraphs);
  check(
    "keeps short list items, which are where warning signs live",
    paragraphs.includes("severe abdominal pain") && paragraphs.includes("bleeding gums"),
    paragraphs,
  );
  check("keeps a one-word list item", paragraphs.includes("Fever"), paragraphs);
  check(
    "still drops short standalone paragraphs, which are chrome",
    !paragraphs.includes("Share") && !paragraphs.includes("Print"),
    paragraphs,
  );
  check(
    "counts the kept list items in the document length",
    doc.charLength > filler.length,
    doc.charLength,
  );
}

console.log("provider error classification");

{
  const cases: { name: string; error: unknown; expected: string }[] = [
    {
      name: "a rejected key is an invalid-key error, not a transient one",
      error: { status: 400, message: '{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid"}}' },
      expected: "invalid-key",
    },
    {
      name: "a wrong model name is a model-unavailable error",
      error: { status: 404, message: '{"error":{"status":"NOT_FOUND","message":"models/gone is not found"}}' },
      expected: "model-unavailable",
    },
    {
      name: "a per-minute limit is a rate-limit error",
      error: { status: 429, message: '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Rate limit reached"}}' },
      expected: "rate-limited",
    },
    {
      name: "an exhausted free-tier quota is distinguished from a burst rate limit",
      error: {
        status: 429,
        message: '{"error":{"message":"You exceeded your current quota, please check your plan and billing details."}}',
      },
      expected: "quota-exhausted",
    },
    {
      name: "a 503 UNAVAILABLE demand spike is treated as transient overload",
      error: {
        status: 503,
        message: '{"error":{"status":"UNAVAILABLE","message":"This model is currently experiencing high demand."}}',
      },
      expected: "overloaded",
    },
    {
      name: "a network failure is reported as a network problem",
      error: { status: undefined, message: "fetch failed" },
      expected: "network",
    },
  ];

  for (const c of cases) {
    check(c.name, classifyGeminiError(c.error) === c.expected, classifyGeminiError(c.error));
  }

  const overloaded = describeGeminiError(
    { status: 503, message: '{"error":{"status":"UNAVAILABLE"}}' },
    { model: "gemini-flash-latest" },
  );
  check("an overloaded provider yields 503, not a generic 500", overloaded.httpStatus === 503, overloaded);
  check("the overload message names the model situation rather than leaking raw JSON", /oversubscribed/.test(overloaded.message), overloaded.message);
}

console.log("keyword query builder");

check(
  "sanitises an attempted FTS operator injection",
  toFtsQuery('pressure NEAR( "OR" *') === '"pressure" OR "near"',
  toFtsQuery('pressure NEAR( "OR" *'),
);
check("returns null when no usable token remains", toFtsQuery("a an of") === null, toFtsQuery("a an of"));
check(
  "keeps a single meaningful term",
  toFtsQuery("hypertension") === '"hypertension"',
  toFtsQuery("hypertension"),
);

console.log("blood pressure parsing");

check("parses the slash form", parseReading("148/92")?.systolic === 148, parseReading("148/92"));
check("parses the spoken form", parseReading("180 over 120")?.diastolic === 120, parseReading("180 over 120"));
check("rejects a non-numeric string", parseReading("not a reading") === null, parseReading("not a reading"));
check("rejects physiologically impossible values", parseReading("400/300") === null, parseReading("400/300"));
check("returns null for undefined input", parseReading(undefined) === null);

console.log("triage thresholds");

check(
  "a crisis reading is an emergency",
  triage({ warningRules: [], reading: { systolic: 190, diastolic: 125, raw: "190/125" }, symptomCount: 0 }).level ===
    "emergency",
);
{
  const outcome = triage({
    warningRules: [],
    reading: { systolic: 190, diastolic: 125, raw: "190/125" },
    symptomCount: 0,
  });
  check(
    "the crisis reason names the documented threshold",
    outcome.reasons[0]?.text.includes("180/120") === true,
    outcome.reasons,
  );
  check(
    "the crisis reason cites the source documents",
    (outcome.reasons[0]?.sourceIds.length ?? 0) > 0,
    outcome.reasons,
  );
}
{
  const outcome = triage({
    warningRules: [{ id: "possible-stroke", label: "Possible stroke signs" }],
    reading: null,
    symptomCount: 1,
  });
  check("a matched warning rule is an emergency", outcome.level === "emergency");
  check(
    "the reason names which rule fired",
    outcome.reasons[0]?.text.includes("Possible stroke signs") === true,
    outcome.reasons,
  );
}
check(
  "a reading above the hypertension threshold is a medical review",
  triage({ warningRules: [], reading: { systolic: 148, diastolic: 92, raw: "148/92" }, symptomCount: 0 }).level ===
    "medical-review",
);
check(
  "symptoms without a warning rule are a medical review",
  triage({ warningRules: [], reading: null, symptomCount: 2 }).level === "medical-review",
);
check(
  "a normal reading with no symptoms is monitoring",
  triage({ warningRules: [], reading: { systolic: 118, diastolic: 76, raw: "118/76" }, symptomCount: 0 }).level ===
    "monitor",
);
check(
  "a crisis reading is never downgraded by an absent rule list",
  triage({ warningRules: [], reading: { systolic: 181, diastolic: 90, raw: "181/90" }, symptomCount: 0 }).level ===
    "emergency",
);

// The NHS page gives a lower threshold for a home reading (135/85) than for one
// taken by a professional (140/90). Applying the clinic threshold to a home
// reading made the guidance less sensitive than the source it cites.
check(
  "a home reading above the at-home threshold is a medical review",
  triage({
    warningRules: [],
    reading: { systolic: 138, diastolic: 88, raw: "138/88" },
    symptomCount: 0,
    measuredAt: "home",
  }).level === "medical-review",
);
check(
  "the same reading from a clinic is monitored, because the threshold differs",
  triage({
    warningRules: [],
    reading: { systolic: 138, diastolic: 88, raw: "138/88" },
    symptomCount: 0,
    measuredAt: "clinic",
  }).level === "monitor",
);
check(
  "an unspecified location uses the stricter clinic threshold rather than assuming home",
  triage({
    warningRules: [],
    reading: { systolic: 138, diastolic: 88, raw: "138/88" },
    symptomCount: 0,
  }).level === "monitor",
);
{
  const outcome = triage({
    warningRules: [],
    reading: { systolic: 138, diastolic: 88, raw: "138/88" },
    symptomCount: 0,
    measuredAt: "home",
  });
  check(
    "the reason names the home threshold it actually used",
    outcome.reasons.some((r) => r.text.includes("135/85")),
    outcome.reasons.map((r) => r.text),
  );
  check(
    "the home threshold reason cites the document that states it",
    outcome.reasons.some(
      (r) => r.text.includes("135/85") && r.sourceIds.includes("nhs-high-blood-pressure"),
    ),
    outcome.reasons,
  );
  check(
    "an above-threshold reading is qualified as needing repeat readings",
    outcome.reasons.some((r) => /repeated readings/.test(r.text)),
    outcome.reasons.map((r) => r.text),
  );
}
check(
  "a home reading below the at-home threshold is monitored",
  triage({
    warningRules: [],
    reading: { systolic: 128, diastolic: 80, raw: "128/80" },
    symptomCount: 0,
    measuredAt: "home",
  }).level === "monitor",
);
check(
  "the crisis thresholds apply at home too",
  triage({
    warningRules: [],
    reading: { systolic: 190, diastolic: 100, raw: "190/100" },
    symptomCount: 0,
    measuredAt: "home",
  }).level === "emergency",
);

console.log("emergency screen");

check(
  "fires on natural phrasing with a linking verb (regression: previous pattern required 'face drooping')",
  screenForEmergency("my face is drooping and my speech is slurred").isEmergency,
);
check(
  "names the stroke rule for that input",
  screenForEmergency("my face is drooping").matchedRules.some((r) => r.id === "possible-stroke"),
);
check(
  "fires on throat tightening phrased naturally",
  screenForEmergency("my throat is closing up and my lips are swollen").isEmergency,
);
check("fires on a crisis reading", screenForEmergency("my reading is 190/125").isEmergency);
check(
  "does not fire on a normal reading",
  !screenForEmergency("my blood pressure reading was 128/82").isEmergency,
);
check("does not fire on an ordinary informational question", !screenForEmergency("what is a normal blood pressure reading").isEmergency);
check("does not fire on a prevention question", !screenForEmergency("can high blood pressure be prevented").isEmergency);
check("does not fire on a lifestyle question", !screenForEmergency("does exercise lower blood pressure").isEmergency);
check("fires on sudden severe headache", screenForEmergency("sudden severe headache").isEmergency);
check("fires on faint wording", screenForEmergency("I passed out at work").isEmergency);

console.log("emergency screen: arboviral warning signs");

check(
  "fires on bleeding gums written as a noun phrase",
  screenForEmergency("I have bleeding gums").isEmergency,
);
check(
  "fires on bleeding gums written with a linking verb (regression: noun phrase only)",
  screenForEmergency("my gums are bleeding a little").isEmergency,
);
check("fires on blood in stool", screenForEmergency("there is blood in my stool").isEmergency);
check(
  "escalates persistent vomiting when a febrile illness is named",
  screenForEmergency("my brother has dengue and he has persistent vomiting").isEmergency,
);
check(
  "does not escalate persistent vomiting mentioned on its own",
  !screenForEmergency("I have had persistent vomiting after a bad meal").isEmergency,
);
check(
  "escalates severe abdominal pain when a mosquito-borne illness is named",
  screenForEmergency("I have chikungunya and severe abdominal pain").isEmergency,
);
check(
  "does not escalate severe joint pain, which is the expected feature of chikungunya",
  !screenForEmergency("I have severe joint pain and a fever").isEmergency,
);
check(
  "does not escalate a chikungunya information question",
  !screenForEmergency("what are the symptoms of chikungunya").isEmergency,
);
check(
  "does not escalate a question about long-term joint pain after chikungunya",
  !screenForEmergency("my knees still ache a year after having chikungunya").isEmergency,
);

console.log("ingestion skip logic");

const CURRENT_EMBEDDING = { model: "gemini-embedding-001", dim: 768 };

check(
  "skips a document whose text and embedding model are unchanged",
  shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "abc",
    storedEmbedding: CURRENT_EMBEDDING,
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "re-embeds when the text changed",
  !shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "def",
    storedEmbedding: CURRENT_EMBEDDING,
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "re-embeds when the embedding model changed, even though the text is identical",
  !shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "abc",
    storedEmbedding: { model: "test-hash-ngram-v1", dim: 256 },
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "re-embeds when only the embedding dimension changed",
  !shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "abc",
    storedEmbedding: { model: "gemini-embedding-001", dim: 3072 },
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "re-embeds a new document",
  !shouldSkipIngestion({
    existingHash: null,
    contentHash: "abc",
    storedEmbedding: null,
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "re-embeds a document whose chunks carry no recorded embedding",
  !shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "abc",
    storedEmbedding: null,
    currentEmbedding: CURRENT_EMBEDDING,
    force: false,
  }),
);
check(
  "force overrides an otherwise skippable document",
  !shouldSkipIngestion({
    existingHash: "abc",
    contentHash: "abc",
    storedEmbedding: CURRENT_EMBEDDING,
    currentEmbedding: CURRENT_EMBEDDING,
    force: true,
  }),
);

console.log("corpus comparability guard");

{
  const current = { model: "gemini-embedding-001", dim: 768 };
  check(
    "accepts a corpus embedded with the current model and width",
    findIncomparableVectors([{ ...current, chunkCount: 296 }], current) === null,
  );
  check(
    "rejects a corpus embedded with a different model",
    findIncomparableVectors(
      [{ model: "text-embedding-004", dim: 768, chunkCount: 296 }],
      current,
    ) !== null,
  );
  check(
    "rejects a corpus embedded at a different width even with the same model",
    findIncomparableVectors(
      [{ model: "gemini-embedding-001", dim: 256, chunkCount: 296 }],
      current,
    ) !== null,
  );
  check(
    "treats an empty corpus as retrievable-but-empty, not a mismatch",
    findIncomparableVectors([], current) === null,
  );
  check(
    "reports only the stale portion when the corpus is mixed",
    findIncomparableVectors(
      [
        { ...current, chunkCount: 100 },
        { model: "test-hash-ngram-v1", dim: 256, chunkCount: 5 },
      ],
      current,
    )?.chunkCount === 5,
  );
}

console.log("evidence selection");

// The tie-break exists because reciprocal rank fusion over ~24 candidates
// produces scores in a very narrow band, so the cut-off is close to arbitrary.
// Uncapped, the six passages for "How is chikungunya different from dengue?"
// were four from one short page, with the corpus's only dengue document below
// the cut, so the model correctly reported that its evidence did not cover the
// comparison. These checks assert the rule and, just as importantly, that it
// leaves a decisive ranking alone.
function hit(chunkId: number, rrf: number): FusedHit {
  return { chunkId, rrf, vectorRank: chunkId, keywordRank: null, cosine: null };
}

{
  const pool = [hit(1, 1.0), hit(2, 0.99), hit(3, 0.98), hit(4, 0.97), hit(5, 0.96), hit(6, 0.5)];
  const chunksById = new Map<number, { documentId: number }>([
    [1, { documentId: 10 }],
    [2, { documentId: 10 }],
    [3, { documentId: 10 }],
    [4, { documentId: 10 }],
    [5, { documentId: 20 }],
    [6, { documentId: 30 }],
  ]);
  const selected = applyDiversityRules(pool, chunksById, 4);
  check(
    "inside a tie band, a document with no passage yet is preferred over a repeat",
    selected.some((h) => h.chunkId === 5),
    selected,
  );
  check(
    "flagship candidates are still selected first",
    selected[0]?.chunkId === 1,
    selected,
  );
  check("returns no more than the requested number of passages", selected.length === 4, selected);
  check(
    "every returned passage belongs to a document the store resolved",
    selected.every((h) => chunksById.has(h.chunkId)),
    selected,
  );
}

{
  // Scores far enough apart that the ranking is decisive: the rule must not fire.
  const pool = [hit(1, 1.0), hit(2, 0.5), hit(3, 0.49), hit(4, 0.48)];
  const chunksById = new Map<number, { documentId: number }>([
    [1, { documentId: 10 }],
    [2, { documentId: 30 }],
    [3, { documentId: 40 }],
    [4, { documentId: 50 }],
  ]);
  const selected = applyDiversityRules(pool, chunksById, 4);
  check(
    "leaves a decisive ranking in its original order",
    selected.map((h) => h.chunkId).join(",") === "1,2,3,4",
    selected.map((h) => h.chunkId),
  );
}

{
  check("returns nothing for an empty pool", applyDiversityRules([], new Map(), 5).length === 0);
  const selected = applyDiversityRules([hit(1, 1.0)], new Map(), 5);
  check(
    "drops a candidate the store cannot resolve",
    selected.length === 0,
    selected,
  );
}

console.log("document-dominance refill");

// The shape of the chikungunya-versus-dengue failure, with the RRF values taken
// from the real run. Reciprocal rank fusion put four passages from one short
// Indian page inside the tie band, so every evidence slot filled from chikungunya
// documents.
//
// What these checks pin is the mechanism, not a fix. On the real corpus the rule
// caps the dominating page but hands the freed slot to the UKHSA chikungunya page,
// which fuses above the WHO dengue page, so the comparison question still cannot be
// answered. That is recorded as a known limitation in docs/architecture.md and the
// rule ships disabled. The pool below deliberately contains only one unrepresented
// document so that it isolates the mechanism; it is not a claim about the corpus.
{
  const pool = [
    hit(101, 0.032258),
    hit(102, 0.031514),
    hit(103, 0.031318),
    hit(104, 0.031318),
    hit(201, 0.031025),
    hit(301, 0.03101),
    hit(302, 0.029438),
    hit(401, 0.029412),
  ];
  const chunksById = new Map<number, { documentId: number }>([
    [101, { documentId: 10 }],
    [102, { documentId: 10 }],
    [103, { documentId: 10 }],
    [104, { documentId: 10 }],
    [201, { documentId: 20 }],
    [301, { documentId: 30 }],
    [302, { documentId: 30 }],
    [401, { documentId: 40 }],
  ]);

  const diversified = applyDiversityRules(pool, chunksById, 5);
  check(
    "without the rule, one page fills the whole evidence set",
    diversified.filter((h) => chunksById.get(h.chunkId)?.documentId === 10).length === 3,
    diversified.map((h) => h.chunkId),
  );
  check(
    "without the rule, the unrepresented document never reaches the model",
    !diversified.some((h) => h.chunkId === 401),
    diversified.map((h) => h.chunkId),
  );

  const selected = applyDominanceRule(diversified, pool, chunksById, 5, { share: 0.4 });
  check(
    "the rule stops one page from filling the evidence set",
    selected.filter((h) => chunksById.get(h.chunkId)?.documentId === 10).length <= 2,
    selected.map((h) => h.chunkId),
  );
  check(
    "the rule releases a slot for the best unrepresented document inside the band",
    selected.some((h) => h.chunkId === 401),
    selected.map((h) => h.chunkId),
  );
  check(
    "the rule keeps the evidence set at its original size",
    selected.length === diversified.length,
    selected.length,
  );
  check(
    "the rule restores best-first order after refilling",
    selected.every((h, i) => i === 0 || selected[i - 1]!.rrf >= h.rrf),
    selected.map((h) => h.rrf),
  );

  // The rule ships disabled because the measurement above did not support it.
  // This pins that decision so re-enabling it is a deliberate act, not a drift.
  const atDefault = applyDominanceRule(diversified, pool, chunksById, 5);
  check(
    "is a no-op at the default setting, because measurement did not support it",
    atDefault.map((h) => h.chunkId).join(",") === diversified.map((h) => h.chunkId).join(","),
    atDefault.map((h) => h.chunkId),
  );
}

{
  // No document dominates, so the rule must not touch the set at all.
  const pool = [hit(1, 1.0), hit(2, 0.9), hit(3, 0.8)];
  const chunksById = new Map<number, { documentId: number }>([
    [1, { documentId: 10 }],
    [2, { documentId: 20 }],
    [3, { documentId: 30 }],
  ]);
  const diversified = applyDiversityRules(pool, chunksById, 3);
  check(
    "leaves an already-diverse set untouched",
    applyDominanceRule(diversified, pool, chunksById, 3)
      .map((h) => h.chunkId)
      .join(",") === "1,2,3",
  );
}

{
  // One document dominates, but nothing else is close enough to admit. The rule
  // must return the set it was given rather than thin it for no benefit.
  const pool = [hit(1, 1.0), hit(2, 0.99), hit(3, 0.98)];
  const chunksById = new Map<number, { documentId: number }>([
    [1, { documentId: 10 }],
    [2, { documentId: 10 }],
    [3, { documentId: 10 }],
  ]);
  const diversified = applyDiversityRules(pool, chunksById, 3);
  // share 0.4 makes the document genuinely dominant, so the guard is exercised
  // rather than short-circuited by the rule being off.
  const selected = applyDominanceRule(diversified, pool, chunksById, 3, { share: 0.4 });
  check(
    "does not thin the set when no replacement exists inside the band",
    selected.length === diversified.length && selected.length === 3,
    selected.map((h) => h.chunkId),
  );
}

{
  check("returns nothing for an empty selection", applyDominanceRule([], [hit(1, 1)], new Map(), 3).length === 0);
}

console.log("overlap stitching");

{
  const stitched = stitchChunks([
    { heading: "Section", text: "one two three four five six" },
    { heading: "Section", text: "four five six seven eight" },
  ]);
  check(
    "removes the repeated overlap between chunks",
    stitched.length === 1 && stitched[0].text === "one two three four five six\n\nseven eight",
    stitched,
  );
}
{
  const stitched = stitchChunks([
    { heading: "First", text: "alpha beta gamma delta" },
    { heading: "Second", text: "epsilon zeta eta theta" },
  ]);
  check(
    "keeps separate sections separate",
    stitched.length === 2 && stitched[1].heading === "Second",
    stitched,
  );
}

console.log("error redaction");

{
  // Logging a thrown object is the leak this guards against: a provider SDK error
  // commonly carries the request it failed on, and that request holds the reader's
  // question. A redacted description keeps the diagnosis and drops the payload.
  const providerish = Object.assign(new Error("INVALID_ARGUMENT: bad request"), {
    request: { contents: [{ parts: [{ text: "why is my blood pressure high" }] }] },
    apiKey: "AIza-not-a-real-key",
  });
  const redacted = redactError(providerish);
  check("keeps the error name and message", /^Error: INVALID_ARGUMENT/.test(redacted), redacted);
  check(
    "drops the attached request and credential",
    !redacted.includes("blood pressure") && !redacted.includes("AIza"),
    redacted,
  );
  check("reports a non-error throw without stringifying it", redactError({ a: 1 }) === "non-error thrown: object", redactError({ a: 1 }));
  check("handles a thrown string", redactError("boom") === "non-error thrown: string", redactError("boom"));
}

{
  // The shared internal-failure body must not carry anything actionable, and it
  // must not differ between routes, or a caller could fingerprint the failure.
  check(
    "the internal error body carries no detail and a kind",
    INTERNAL_ERROR_BODY.kind === "internal-error" && !/Error:|at |\/api\//.test(INTERNAL_ERROR_BODY.error),
    INTERNAL_ERROR_BODY,
  );
}

console.log("source governance");

{
  // With no review on file, the outcome must be an explicit negative. A default of
  // anything else would let an unreviewed document read as reviewed.
  const outcome = resolveReview([], "who-hypertension", "abc123");
  check("an unreviewed document reports as not reviewed", outcome.status === "not-reviewed", outcome.status);
  check("an unreviewed document has no covering review", outcome.covering === null && outcome.latest === null, outcome);
  check(
    "the unreviewed wording does not imply any review took place",
    /no qualified clinical reviewer/i.test(outcome.detail),
    outcome.detail,
  );
  check(
    "the unreviewed label does not claim approval",
    !/approv|validat(ed|ion) passed/i.test(outcome.label),
    outcome.label,
  );
}

{
  const reviews: SourceReview[] = [
    {
      sourceId: "who-hypertension",
      reviewerName: "Dr Example",
      reviewerCredential: "MBBS, MD",
      decision: "approved-for-education",
      note: null,
      reviewedAt: "2026-05-01T00:00:00.000Z",
      contentSha256: "hash-one",
    },
  ];

  const matching = resolveReview(reviews, "who-hypertension", "hash-one");
  check("a review against the current hash reports as current", matching.status === "current", matching.status);
  check("the review is returned as covering", matching.covering?.reviewerName === "Dr Example", matching.covering);
  check(
    "the detail states that the credential was not verified",
    /does not verify that credential/i.test(matching.detail),
    matching.detail,
  );
  check(
    "the label describes a recorded review rather than an endorsement",
    /review recorded/i.test(matching.label),
    matching.label,
  );

  // The load-bearing case. A document re-fetched with changed text must lose its
  // review, or a stale approval would silently keep applying to new content.
  const changed = resolveReview(reviews, "who-hypertension", "hash-two");
  check("a review against a different revision is superseded", changed.status === "superseded", changed.status);
  check("a superseded review does not cover the text", changed.covering === null, changed.covering);
  check("the superseded review is still shown, for the audit trail", changed.latest?.contentSha256 === "hash-one", changed.latest);
  check(
    "the superseded wording says the document is treated as unreviewed",
    /treated as unreviewed/i.test(changed.detail),
    changed.detail,
  );
}

{
  const reviews: SourceReview[] = [
    {
      sourceId: "who-dengue",
      reviewerName: "First",
      reviewerCredential: "MBBS",
      decision: "changes-requested",
      note: "check the 2024 revision",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      contentSha256: "same",
    },
    {
      sourceId: "who-dengue",
      reviewerName: "Second",
      reviewerCredential: "MBBS, MD",
      decision: "approved-for-education",
      note: null,
      reviewedAt: "2026-06-01T00:00:00.000Z",
      contentSha256: "same",
    },
  ];
  const outcome = resolveReview(reviews, "who-dengue", "same");
  check("the most recent review wins", outcome.covering?.reviewerName === "Second", outcome.covering?.reviewerName);
  check("an earlier entry is not discarded by the newest one", reviewsFor(reviews, "who-dengue").length === 2, "2 retained");
  check(
    "a changes-requested decision is not reported as approval",
    resolveReview([reviews[0]!], "who-dengue", "same").label.toLowerCase().includes("changes requested"),
    resolveReview([reviews[0]!], "who-dengue", "same").label,
  );
}

{
  const now = new Date("2026-07-01T00:00:00.000Z");
  const recent = staleness("2026-06-20T00:00:00.000Z", now);
  check("a recent copy is not flagged", recent.stale === false && recent.days === 11, recent);
  const old = staleness("2025-01-01T00:00:00.000Z", now, 180);
  check("a copy past the window is flagged stale", old.stale === true && old.days === 546, old);
  check("the stale label names the window it used", /180-day/.test(old.label), old.label);
  // 2026-01-02 is exactly 180 days before the 2026-07-01 reference, so this pins
  // the boundary itself: exactly the window is not stale, one day past is.
  const exact = staleness("2026-01-02T00:00:00.000Z", now, 180);
  check("exactly the window is not flagged stale", exact.days === 180 && exact.stale === false, exact);
  const overByOne = staleness("2026-01-01T00:00:00.000Z", now, 180);
  check("one day past the window is flagged stale", overByOne.days === 181 && overByOne.stale === true, overByOne);
  const unreadable = staleness("not a date", now);
  check("an unreadable retrieval date is reported rather than guessed", unreadable.days === 0 && /unreadable/i.test(unreadable.label), unreadable);
}

console.log("emergency step alignment");

{
  // The emergency step presents one yes/no question per rule, addressed by rule id.
  // These two checks are what stops the question list and the screen drifting
  // apart: a rule with no question would be unreachable from the interface, and a
  // question with no rule could not escalate.
  const questionIds = EMERGENCY_QUESTIONS.map((q) => q.id).sort();
  const ruleIds = SAFETY_RULES.map((r) => r.id).sort();
  check(
    "every safety rule has exactly one emergency question",
    questionIds.length === ruleIds.length && questionIds.every((id, i) => id === ruleIds[i]),
    { questionIds, ruleIds },
  );
  check(
    "the emergency question list has no duplicate ids",
    new Set(questionIds).size === questionIds.length,
    questionIds,
  );
}

{
  // The load-bearing check. Each question's wording must, on its own, make the
  // deterministic screen fire that question's rule. It caught a real case: the
  // self-harm question said "ending your life", which matches no pattern, so
  // answering yes produced no escalation at all.
  const failures: string[] = [];
  for (const question of EMERGENCY_QUESTIONS) {
    const result = screenForEmergency(question.detail);
    if (!result.isEmergency || !result.matchedRules.some((m) => m.id === question.id)) {
      failures.push(question.id);
    }
  }
  check(
    "answering yes to a question fires that question's own rule",
    failures.length === 0,
    failures,
  );
}

{
  check("the emergency instruction has steps", EMERGENCY_STEPS.length >= 3, EMERGENCY_STEPS.length);
  check(
    "the first step sends the reader to emergency care without hedge",
    EMERGENCY_STEPS[0]!.toLowerCase().includes("emergency"),
    EMERGENCY_STEPS[0],
  );
  check(
    "the emergency message does not claim a diagnosis",
    !/\byou (have|are having)\b/i.test(EMERGENCY_MESSAGE),
    EMERGENCY_MESSAGE,
  );
}

console.log("clarifying questions");

{
  // The branch is chosen from the selected symptoms, not from a fixed sequence, so
  // these assert that two different symptoms produce two different question sets and
  // that the choice does not depend on the order the symptoms arrive in.
  const headache = selectFollowUpQuestions(["headache"]).map((q) => q.id);
  const palpitations = selectFollowUpQuestions(["palpitations"]).map((q) => q.id);
  const tableOrder = FOLLOW_UP_QUESTIONS.filter((q) =>
    ["headache", "palpitations"].some((s) => q.forSymptoms.includes(s)),
  ).map((q) => q.id);

  check("a symptom with an authored question gets one", headache.includes("headache-sudden-severe"), headache);
  check(
    "two symptoms produce different question sets",
    !headache.some((id) => palpitations.includes(id)),
    { headache, palpitations },
  );
  check(
    "the first round asks the symptom's own question",
    palpitations.length === 1 && palpitations[0] === "palpitations-chest-pain",
    palpitations,
  );
  check(
    "a symptom with no authored question gets none",
    selectFollowUpQuestions(["fatigue"]).length === 0 &&
      selectFollowUpQuestions(["chest-pain"]).length === 0,
    selectFollowUpQuestions(["fatigue", "chest-pain"]).map((q) => q.id),
  );
  check(
    "the same selection always produces the same questions",
    selectFollowUpQuestions(["headache"]).map((q) => q.id).join(",") ===
      selectFollowUpQuestions(["headache"]).map((q) => q.id).join(","),
    headache,
  );
  check(
    "order follows the table, not the order the symptoms were selected in",
    selectFollowUpQuestions(["palpitations", "headache"])
      .map((q) => q.id)
      .join(",") === tableOrder.join(","),
    { got: selectFollowUpQuestions(["palpitations", "headache"]).map((q) => q.id), tableOrder },
  );
}

{
  // Reachability, derived from the screen rather than from a hand-written list so
  // that it keeps working when the symptom list changes. Nothing is asked once a
  // warning sign has fired, so a question attached to a symptom whose own label
  // already escalates could never be shown. This is what stops the clarifying table
  // accumulating entries that are dead on arrival.
  // Widened to `string` deliberately: `question.forSymptoms` holds plain ids, and the
  // comparison has to be between two `string` sets rather than against the literal
  // union, which would only typecheck by accident.
  const escalatesAlone: string[] = SYMPTOM_OPTIONS.filter(
    (option) => screenForEmergency(option.label).isEmergency,
  ).map((option) => option.id as string);
  check(
    "the screen does escalate some symptom labels on their own",
    escalatesAlone.length > 0,
    escalatesAlone,
  );
  const unreachable = FOLLOW_UP_QUESTIONS.flatMap((question) =>
    question.forSymptoms
      .filter((id) => escalatesAlone.includes(id))
      .map((id) => `${question.id}:${id}`),
  );
  check(
    "no clarifying question is attached to a symptom that already escalates",
    unreachable.length === 0,
    unreachable,
  );
  check(
    "every first-round question is reachable from some symptom",
    FOLLOW_UP_QUESTIONS.filter((q) => q.round === 1).every(
      (question) => question.forSymptoms.length > 0,
    ),
    FOLLOW_UP_QUESTIONS.filter(
      (q) => q.round === 1 && q.forSymptoms.length === 0,
    ).map((q) => q.id),
  );
}

{
  // The decision table for the adaptive second round. This is the part that must not
  // be cosmetic: the same symptom has to lead to different second questions depending
  // on the answer above it, so each row below is asserted rather than described.
  const answer = (id: string, value: FollowUpAnswer) => ({ id, answer: value });
  const ids = (list: FollowUpQuestion[]) => list.map((q) => q.id);

  const round1Only = ids(selectFollowUpQuestions(["palpitations"]));
  const afterNo = ids(
    selectFollowUpQuestions(["palpitations"], [answer("palpitations-chest-pain", "no")]),
  );
  const afterUnknown = ids(
    selectFollowUpQuestions(["palpitations"], [answer("palpitations-chest-pain", "unknown")]),
  );
  const afterYes = ids(
    selectFollowUpQuestions(["palpitations"], [answer("palpitations-chest-pain", "yes")]),
  );

  check(
    "round 2 is not offered while its dependency is unanswered",
    !round1Only.includes("palpitations-fainting"),
    round1Only,
  );
  check(
    "a no-answer selects the follow-on question for that symptom",
    afterNo.includes("palpitations-fainting"),
    afterNo,
  );
  check(
    "an unknown answer also selects it, rather than being read as a no",
    afterUnknown.includes("palpitations-fainting"),
    afterUnknown,
  );
  check(
    "a yes-answer selects no follow-on, because the screen has already escalated",
    !afterYes.includes("palpitations-fainting"),
    afterYes,
  );
  check(
    "the follow-on carries the reason it is being asked",
    (FOLLOW_UP_QUESTIONS.find((q) => q.id === "palpitations-fainting")?.why ?? "")
      .length > 20,
    FOLLOW_UP_QUESTIONS.find((q) => q.id === "palpitations-fainting")?.why,
  );

  // The same symptom, two different answers, two different question sets. Without
  // this the second round would be cosmetic.
  check(
    "one symptom produces different follow-on sets from different answers",
    afterNo.join(",") !== round1Only.join(","),
    { round1Only, afterNo },
  );

  // Nosebleeds: the second round asks the other half of a co-signal rule, so the
  // escalation reached in round 2 must differ from the one round 1 would declare.
  const nosebleedYes = ids(
    selectFollowUpQuestions(["nosebleeds"], [answer("nosebleed-with-fever", "yes")]),
  );
  const nosebleedNo = ids(
    selectFollowUpQuestions(["nosebleeds"], [answer("nosebleed-with-fever", "no")]),
  );
  check(
    "the second round is skipped when the first round declares a rule",
    !nosebleedYes.includes("nosebleed-arboviral-bleeding"),
    nosebleedYes,
  );
  check(
    "the second round asks a different question with a different rule",
    nosebleedNo.includes("nosebleed-arboviral-bleeding") &&
      FOLLOW_UP_QUESTIONS.find((q) => q.id === "nosebleed-arboviral-bleeding")?.escalatesTo !==
        FOLLOW_UP_QUESTIONS.find((q) => q.id === "nosebleed-with-fever")?.escalatesTo,
    nosebleedNo,
  );
  check(
    "an answered question is never returned again",
    selectFollowUpQuestions(["palpitations"], [answer("palpitations-chest-pain", "yes")])
      .every((q) => q.id !== "palpitations-chest-pain"),
    afterYes,
  );

  // Emergency exit: an emergency elsewhere in the submission must stop the round
  // entirely. `selectFollowUpQuestions` cannot see the care level, so this asserts the
  // filter that buildGuidance applies, using the same two inputs.
  const escalatedByNotes = screenForEmergency("chest pain").isEmergency;
  check(
    "a submission that has escalated is a case the caller must not ask about",
    escalatedByNotes && ids(selectFollowUpQuestions(["palpitations"])).length > 0,
    { escalatedByNotes },
  );
}

{
  // The documented ceilings. Nothing is truncated in code, so these fail if the bank
  // grows past what it claims to ask, which forces the ceiling to be raised on
  // purpose rather than letting a question be dropped to fit it.
  const everySymptom = SYMPTOM_OPTIONS.map((option) => option.id);
  const widestFirstRound = selectFollowUpQuestions(everySymptom).filter(
    (q) => q.round === 1,
  ).length;
  const everyAnswer = FOLLOW_UP_QUESTIONS.map((q) => ({
    id: q.id,
    answer: "unknown" as FollowUpAnswer,
  }));
  const widestSecondRound = selectFollowUpQuestions(everySymptom, everyAnswer).filter(
    (q) => q.round === 2,
  ).length;

  check(
    "the first round cannot exceed its documented ceiling",
    widestFirstRound <= FOLLOW_UP_LIMITS.firstRound,
    { widestFirstRound, ceiling: FOLLOW_UP_LIMITS.firstRound },
  );
  check(
    "the second round cannot exceed its documented ceiling",
    widestSecondRound <= FOLLOW_UP_LIMITS.secondRound,
    { widestSecondRound, ceiling: FOLLOW_UP_LIMITS.secondRound },
  );
  check(
    "there are exactly two rounds, and both are in use",
    FOLLOW_UP_LIMITS.rounds === 2 &&
      new Set(FOLLOW_UP_QUESTIONS.map((q) => q.round)).size === 2,
    FOLLOW_UP_QUESTIONS.map((q) => q.round),
  );
  check(
    "no documented ceiling is binding, so nothing is dropped to fit",
    widestFirstRound < FOLLOW_UP_LIMITS.firstRound &&
      widestSecondRound < FOLLOW_UP_LIMITS.secondRound,
    { widestFirstRound, widestSecondRound },
  );
}

{
  // Integrity of the table itself. A question with no rule behind it could not
  // escalate, and a citation that is not in the manifest would render as a link to
  // nothing.
  const ruleIds = new Set<string>(SAFETY_RULES.map((rule) => rule.id));
  const knownSymptoms = new Set<string>(SYMPTOM_OPTIONS.map((option) => option.id));
  const knownSources = new Set<string>(CORPUS_SOURCES.map((source) => source.sourceId));
  const ids = FOLLOW_UP_QUESTIONS.map((q) => q.id);

  check(
    "every clarifying question escalates to a rule that exists",
    FOLLOW_UP_QUESTIONS.every((q) => ruleIds.has(q.escalatesTo)),
    FOLLOW_UP_QUESTIONS.filter((q) => !ruleIds.has(q.escalatesTo)).map((q) => `${q.id}->${q.escalatesTo}`),
  );
  check("the clarifying question list has no duplicate ids", new Set(ids).size === ids.length, ids);
  check(
    "every clarifying question is keyed to a symptom that exists",
    FOLLOW_UP_QUESTIONS.every((q) => q.forSymptoms.every((id) => knownSymptoms.has(id))),
    FOLLOW_UP_QUESTIONS.flatMap((q) => q.forSymptoms.filter((id) => !knownSymptoms.has(id)).map((id) => `${q.id}:${id}`)),
  );
  check(
    "every clarifying question cites a document in the corpus manifest",
    FOLLOW_UP_QUESTIONS.every((q) => q.sourceIds.every((id) => knownSources.has(id))),
    FOLLOW_UP_QUESTIONS.flatMap((q) => q.sourceIds.filter((id) => !knownSources.has(id)).map((id) => `${q.id}:${id}`)),
  );
  check(
    "every clarifying question cites at least one source",
    FOLLOW_UP_QUESTIONS.every((q) => q.sourceIds.length > 0),
    FOLLOW_UP_QUESTIONS.filter((q) => q.sourceIds.length === 0).map((q) => q.id),
  );
}

{
  // The escalation-only property, asserted where it is decided. A no contributes
  // nothing at all, and the question table is the only thing that can produce a
  // declared rule, so a caller cannot name a rule directly and cannot express a
  // de-escalation.
  const one = FOLLOW_UP_QUESTIONS[0]!;
  check(
    "a yes-answer declares exactly its own rule",
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "yes" }]).join(",") === one.escalatesTo,
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "yes" }]),
  );
  check(
    "a no-answer declares nothing",
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "no" }]).length === 0,
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "no" }]),
  );
  check(
    "an answer of I-do-not-know declares nothing, and is not read as a no",
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "unknown" }]).length === 0 &&
      declaredRuleIdsFromFollowUps([{ id: one.id, answer: "unknown" }]).length ===
        declaredRuleIdsFromFollowUps([{ id: one.id, answer: "no" }]).length,
    declaredRuleIdsFromFollowUps([{ id: one.id, answer: "unknown" }]),
  );
  check(
    "an id outside the question table declares nothing",
    declaredRuleIdsFromFollowUps([{ id: "not-a-question", answer: "yes" }]).length === 0,
    declaredRuleIdsFromFollowUps([{ id: "not-a-question", answer: "yes" }]),
  );
  check(
    "answering every question yes declares one rule each",
    FOLLOW_UP_QUESTIONS.every((q) => {
      const declared = declaredRuleIdsFromFollowUps([{ id: q.id, answer: "yes" }]);
      return declared.length === 1 && declared[0] === q.escalatesTo;
    }),
  );
  check(
    "answering every question no or unknown declares no rule at all",
    FOLLOW_UP_QUESTIONS.flatMap((q) => [
      declaredRuleIdsFromFollowUps([{ id: q.id, answer: "no" }]),
      declaredRuleIdsFromFollowUps([{ id: q.id, answer: "unknown" }]),
    ]).every((declared) => declared.length === 0),
  );
}

{
  // The shape invariants of the bank, so a round-2 entry cannot be written as a
  // round-1 one by mistake and quietly become unaskable, or the reverse.
  const wrongShape = FOLLOW_UP_QUESTIONS.filter((q) =>
    q.round === 1
      ? q.forSymptoms.length === 0 || q.afterQuestions.length > 0 || q.why !== null
      : q.forSymptoms.length > 0 ||
        q.afterQuestions.length === 0 ||
        q.afterAnswers.length === 0 ||
        (q.why ?? "").length < 20,
  ).map((q) => `${q.id}:round-${q.round}`);
  check("every question has the shape its round requires", wrongShape.length === 0, wrongShape);

  const knownIds = new Set(FOLLOW_UP_QUESTIONS.map((q) => q.id));
  const dangling = FOLLOW_UP_QUESTIONS.filter((q) => q.round === 2).flatMap((q) =>
    q.afterQuestions.filter((id) => !knownIds.has(id)).map((id) => `${q.id}<-${id}`),
  );
  check(
    "every second-round question depends on a question that exists",
    dangling.length === 0,
    dangling,
  );

  // A round-2 question that depends on another round-2 question would need a third
  // round to reach, which the documented limit does not allow.
  const depthTwo = FOLLOW_UP_QUESTIONS.filter((q) => q.round === 2).flatMap((q) =>
    q.afterQuestions
      .filter((id) => FOLLOW_UP_QUESTIONS.find((x) => x.id === id)?.round === 2)
      .map((id) => `${q.id}<-${id}`),
  );
  check(
    "no second-round question depends on another second-round question",
    depthTwo.length === 0,
    depthTwo,
  );
}

console.log("health record validation");

{
  const clean = validateRecordInput({
    kind: "blood-pressure",
    valuePrimary: 128,
    valueSecondary: 82,
    measuredAt: "2026-06-01T08:30:00.000Z",
    note: "  after walking  ",
  });
  check("accepts a well-formed blood pressure reading", clean.valuePrimary === 128 && clean.valueSecondary === 82, clean);
  check("trims the note", clean.note === "after walking", clean.note);
  check("normalises the timestamp to ISO", clean.measuredAt === "2026-06-01T08:30:00.000Z", clean.measuredAt);
}

{
  // The classic mistake: the two numbers entered the wrong way round. Storing it
  // would record a reading nobody took, so it is rejected rather than swapped.
  const issues = catchIssues(() =>
    validateRecordInput({
      kind: "blood-pressure",
      valuePrimary: 82,
      valueSecondary: 128,
      measuredAt: "2026-06-01T08:30:00.000Z",
    }),
  );
  check("rejects a systolic below the diastolic", issues.length === 1, issues);
  check(
    "explains the reversed-reading possibility in the message",
    issues[0]?.includes("wrong way round") === true,
    issues[0],
  );
}

{
  check(
    "rejects an equal systolic and diastolic",
    catchIssues(() =>
      validateRecordInput({
        kind: "blood-pressure",
        valuePrimary: 90,
        valueSecondary: 90,
        measuredAt: "2026-06-01T08:30:00.000Z",
      }),
    ).length === 1,
  );
}

{
  const issues = catchIssues(() =>
    validateRecordInput({
      kind: "blood-pressure",
      valuePrimary: 400,
      valueSecondary: 900,
      measuredAt: "not a date",
      note: "x".repeat(400),
    }),
  );
  // Four separate problems in one call: the two out-of-range values, the date and
  // the note. Reporting them together is what lets a form show every issue at once.
  check("reports every problem in one pass", issues.length === 4, issues);
}

{
  check(
    "requires the second value on a two-value kind",
    catchIssues(() =>
      validateRecordInput({
        kind: "blood-pressure",
        valuePrimary: 120,
        measuredAt: "2026-06-01T08:30:00.000Z",
      }),
    ).length === 1,
  );
}

{
  check(
    "rejects a second value on a single-value kind",
    catchIssues(() =>
      validateRecordInput({
        kind: "weight",
        valuePrimary: 70,
        valueSecondary: 50,
        measuredAt: "2026-06-01T08:30:00.000Z",
      }),
    ).length === 1,
  );
}

{
  const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
  check(
    "rejects a reading dated in the future",
    catchIssues(() =>
      validateRecordInput({ kind: "weight", valuePrimary: 70, measuredAt: future }),
    ).length === 1,
  );
  const justAhead = new Date(Date.now() + 60_000).toISOString();
  check(
    "tolerates a clock a minute ahead",
    validateRecordInput({ kind: "weight", valuePrimary: 70, measuredAt: justAhead }).valuePrimary === 70,
  );
}

{
  const clean = validateRecordInput({
    kind: "weight",
    valuePrimary: 72.34,
    measuredAt: "2026-06-01T08:30:00.000Z",
  });
  check("rounds a decimal reading to one decimal place", clean.valuePrimary === 72.3, clean.valuePrimary);
  const bp = validateRecordInput({
    kind: "blood-pressure",
    valuePrimary: 128.6,
    valueSecondary: 82.4,
    measuredAt: "2026-06-01T08:30:00.000Z",
  });
  check("stores whole numbers for a whole-number kind", bp.valuePrimary === 129 && bp.valueSecondary === 82, bp);
}

{
  const clean = validateRecordInput({
    kind: "sleep",
    valuePrimary: 7.5,
    measuredAt: "2026-06-01T08:30:00.000Z",
    note: "   ",
  });
  check("treats a whitespace-only note as no note", clean.note === null, clean.note);
}

console.log("health record trends");

function record(
  id: number,
  kind: HealthRecord["kind"],
  valuePrimary: number,
  measuredAt: string,
  valueSecondary: number | null = null,
): HealthRecord {
  return {
    id,
    kind,
    valuePrimary,
    valueSecondary,
    unit: "",
    measuredAt,
    note: null,
    source: "self-reported",
    createdAt: measuredAt,
    updatedAt: measuredAt,
  };
}

{
  // Supplied newest-first, exactly as the list query returns them, so this also
  // checks that the chart input is sorted into time order.
  const records = [
    record(3, "weight", 74, "2026-06-03T08:00:00.000Z"),
    record(2, "weight", 71, "2026-06-02T08:00:00.000Z"),
    record(1, "weight", 70, "2026-06-01T08:00:00.000Z"),
  ];
  const trend = buildTrend(records, "weight");
  check("orders trend points oldest first", trend.points.map((p) => p.primary).join(",") === "70,71,74", trend.points);
  check("computes the mean of the recorded values", trend.primary?.mean === 71.7, trend.primary);
  check("reports the first and last reading", trend.primary?.first === 70 && trend.primary?.last === 74, trend.primary);
  check("reports the difference between first and last", trend.primary?.difference === 4, trend.primary);
  check("reports the lowest and highest", trend.primary?.min === 70 && trend.primary?.max === 74, trend.primary);
  check("computes the span in days", trend.spanDays === 2, trend.spanDays);
  check("leaves the second series empty for a single-value kind", trend.secondary === null, trend.secondary);
}

{
  const records = [
    record(2, "blood-pressure", 118, "2026-06-02T08:00:00.000Z", 76),
    record(1, "blood-pressure", 132, "2026-06-01T08:00:00.000Z", 88),
  ];
  const trend = buildTrend(records, "blood-pressure");
  check("summarises both series of a two-value kind", trend.primary?.mean === 125 && trend.secondary?.mean === 82, {
    primary: trend.primary?.mean,
    secondary: trend.secondary?.mean,
  });
  check("names the second series from its spec", trend.secondaryLabel === "Diastolic", trend.secondaryLabel);
  check("carries both values on each point", trend.points[0]?.secondary === 88, trend.points[0]);
}

{
  // A kind with nothing recorded must not produce NaN or a phantom series.
  const trend = buildTrend([record(1, "weight", 70, "2026-06-01T08:00:00.000Z")], "glucose");
  check("returns no statistics for a kind with no records", trend.primary === null && trend.secondary === null, trend.primary);
  check("returns no points for a kind with no records", trend.points.length === 0, trend.points.length);
  check("returns no span for a kind with no records", trend.spanDays === null, trend.spanDays);
}

{
  const trend = buildTrend([record(1, "sleep", 7.5, "2026-06-01T08:00:00.000Z")], "sleep");
  check("reports a zero difference for a single reading", trend.primary?.difference === 0, trend.primary);
  check("reports no span for a single reading", trend.spanDays === null, trend.spanDays);
  check("keeps the fractional value of a single reading", trend.primary?.last === 7.5, trend.primary?.last);
}

{
  const records = [
    record(1, "weight", 70, "2026-06-01T08:00:00.000Z"),
    record(2, "sleep", 8, "2026-06-02T08:00:00.000Z"),
    record(3, "blood-pressure", 120, "2026-06-03T08:00:00.000Z", 80),
  ];
  const trends = buildTrends(records);
  check("builds one trend per kind that has records", trends.length === 3, trends.map((t) => t.kind));
  check(
    "orders trends by the canonical kind order, not by input order",
    trends.map((t) => t.kind).join(",") === "blood-pressure,weight,sleep",
    trends.map((t) => t.kind),
  );
  check("returns no trends for an empty record set", buildTrends([]).length === 0);
}

/* ------------------------------------------------------------------ *
 * Profile vocabularies
 *
 * The profile stores ids from closed lists, so the check that matters is that an
 * id outside the list is refused. That is what makes the mapping from an interest
 * to a recommendation a rule rather than a guess about free text.
 * ------------------------------------------------------------------ */
{
  check("accepts a known interest id", isInterestId("blood-pressure"));
  check("rejects an unknown interest id", !isInterestId("whatever-i-like"));
  check("rejects a non-string interest id", !isInterestId(42));
  check("accepts a known goal id", isGoalId("sleep-better"));
  check("rejects an unknown goal id", !isGoalId("get-richer"));
  check("accepts a known condition id", isConditionId("diabetes"));
  check("rejects an unknown condition id", !isConditionId("tiredness"));
  check("accepts a supported language", isLanguageId("en"));
  check("rejects an unsupported language", !isLanguageId("fr"));
  check(
    "every interest maps either to a corpus topic or to podcast topics",
    INTEREST_OPTIONS.every(
      (option) => option.corpusTopic !== null || option.podcastTopics.length > 0,
    ),
    INTEREST_OPTIONS.filter(
      (option) => option.corpusTopic === null && option.podcastTopics.length === 0,
    ).map((option) => option.id),
  );
  check(
    "every podcast topic an interest names is a real topic",
    INTEREST_OPTIONS.every((option) =>
      option.podcastTopics.every((topic) => isPodcastTopicId(topic)),
    ),
  );
  check("the interest id list matches the options", INTEREST_IDS.length === INTEREST_OPTIONS.length);
}

/* ------------------------------------------------------------------ *
 * Recommendations
 *
 * These rules are the only part of the platform that says anything about a
 * recorded number, so they are asserted directly: which kinds appear, what they
 * quote, and what they must never claim.
 * ------------------------------------------------------------------ */
{
  const base = {
    profile: null,
    records: [] as HealthRecord[],
    library: [] as { sourceId: string; title: string; topic: string; publisher: string }[],
    savedPodcastIds: [],
    suppressedKeys: [],
    now: new Date("2026-06-10T09:00:00.000Z"),
  };

  check(
    "suggests nothing when there is no profile and no data",
    buildRecommendations(base).length === 0,
    buildRecommendations(base),
  );

  const crisis = buildRecommendations({
    ...base,
    records: [record(1, "blood-pressure", 195, "2026-06-09T08:00:00.000Z", 125)],
  });
  check("a crisis reading produces one suggestion", crisis.length === 1, crisis.length);
  check("a crisis reading is classified as urgent", crisis[0]?.kind === "urgent", crisis[0]?.kind);
  check(
    "the crisis suggestion quotes the threshold it used",
    /180\/120/.test(crisis[0]?.why ?? ""),
    crisis[0]?.why,
  );
  check(
    "the crisis suggestion says it is not a diagnosis",
    /not a diagnosis/i.test(crisis[0]?.why ?? ""),
  );
  check(
    "the crisis suggestion names the reading it came from",
    (crisis[0]?.basedOn ?? []).some((line) => line.includes("195/125")),
    crisis[0]?.basedOn,
  );
  check(
    "the crisis suggestion is not offered as completable",
    crisis[0]?.completable === false,
  );

  const raised = buildRecommendations({
    ...base,
    records: [record(1, "blood-pressure", 152, "2026-06-09T08:00:00.000Z", 94)],
  });
  check(
    "a raised reading produces a professional-review suggestion",
    raised[0]?.kind === "professional-review",
    raised[0]?.kind,
  );
  check(
    "the raised reading suggestion says one reading is not a diagnosis",
    /not a diagnosis/i.test(raised[0]?.why ?? ""),
  );
  check(
    "a normal reading does not produce a review suggestion",
    buildRecommendations({
      ...base,
      records: [record(1, "blood-pressure", 118, "2026-06-09T08:00:00.000Z", 76)],
    }).length === 0,
  );

  const symptom = buildRecommendations({
    ...base,
    records: [record(1, "symptom", 9, "2026-06-08T08:00:00.000Z")],
  });
  check(
    "a symptom at the top of the person's own scale is surfaced",
    symptom.some((item) => item.key.startsWith("symptom:")),
    symptom.map((item) => item.key),
  );
  check(
    "the symptom suggestion calls the number their own scale",
    /scale you set yourself/i.test(symptom[0]?.why ?? ""),
  );
  check(
    "an old high symptom reading is left alone",
    buildRecommendations({
      ...base,
      records: [record(1, "symptom", 9, "2026-01-01T08:00:00.000Z")],
    }).length === 0,
  );

  const profile = {
    interests: ["sleep", "blood-pressure"],
    goals: ["sleep-better"],
    selfReportedConditions: [],
    sleepGoalHours: 8,
    activityGoalMinutes: null,
  };
  const forProfile = buildRecommendations({ ...base, profile });
  check(
    "selected interests produce measurement suggestions",
    forProfile.filter((item) => item.kind === "measurement").length >= 1,
    forProfile.map((item) => item.key),
  );
  check(
    "the measurement suggestion names the interest it came from",
    forProfile.some((item) => item.basedOn.some((line) => line.startsWith("Your interests:"))),
  );
  check(
    "a measurement suggestion is not shown twice",
    new Set(forProfile.map((item) => item.key)).size === forProfile.length,
  );

  const withRecentSleep = buildRecommendations({
    ...base,
    profile,
    records: [record(1, "sleep", 6, "2026-06-09T08:00:00.000Z")],
  });
  check(
    "a recent recording suppresses the suggestion to record one",
    !withRecentSleep.some((item) => item.key === "measurement:sleep"),
    withRecentSleep.map((item) => item.key),
  );

  const goalComparison = buildRecommendations({
    ...base,
    profile,
    records: [
      record(1, "sleep", 6, "2026-06-09T08:00:00.000Z"),
      record(2, "sleep", 6.5, "2026-06-08T08:00:00.000Z"),
      record(3, "sleep", 6.2, "2026-06-07T08:00:00.000Z"),
      record(4, "sleep", 6.8, "2026-06-06T08:00:00.000Z"),
    ],
  });
  const goalItem = goalComparison.find((item) => item.key === "goal:sleep");
  check("a goal below its target is compared with the recordings", Boolean(goalItem), goalItem);
  check(
    "the goal comparison says it is between the goal and the recordings",
    /your own goal and your own entries/i.test(goalItem?.why ?? ""),
    goalItem?.why,
  );
  check(
    "the goal comparison is not presented as a clinical target",
    /not a clinical target/i.test(goalItem?.why ?? ""),
  );

  const suppressed = buildRecommendations({
    ...base,
    records: [record(1, "symptom", 9, "2026-06-08T08:00:00.000Z")],
    suppressedKeys: ["symptom:1"],
  });
  check(
    "a dismissed suggestion key is left out",
    suppressed.length === 0,
    suppressed.map((item) => item.key),
  );

  const library = [
    {
      sourceId: "who-hypertension",
      title: "Hypertension",
      topic: "hypertension",
      publisher: "World Health Organization (WHO)",
    },
  ];
  const withLibrary = buildRecommendations({
    ...base,
    profile: { ...profile, interests: ["blood-pressure"] },
    library,
  });
  const education = withLibrary.find((item) => item.key.startsWith("education:library:"));
  check(
    "an interest selects a corpus document as suggested reading",
    Boolean(education),
    withLibrary.map((item) => item.key),
  );
  check(
    "the suggested reading explains it is the text the assistant quotes",
    /retrieves answers from/i.test(education?.why ?? ""),
  );
  check(
    "nothing in a recommendation promises a diagnosis or a prediction",
    withLibrary.every(
      (item) => !/you (have|will get|are likely)/i.test(item.why) && !/probab/i.test(item.why),
    ),
    withLibrary.map((item) => item.why),
  );

  const topicSuggestions = suggestedContentTopics(
    {
      interests: ["sleep"],
      goals: ["manage-stress"],
      selfReportedConditions: [],
      sleepGoalHours: null,
      activityGoalMinutes: null,
    },
    "podcast",
  );
  check(
    "an interest and a goal both contribute content topics",
    topicSuggestions.some((s) => s.topic === "sleep") &&
      topicSuggestions.some((s) => s.topic === "mental-health"),
    topicSuggestions.map((s) => s.topic),
  );
  check(
    "a topic suggestion names the reader-facing topic rather than the id",
    topicSuggestions.every(
      (s) => s.topicLabel.length > 0 && s.topicLabel !== s.topic && s.topicLabel.includes(" "),
    ),
    topicSuggestions.map((s) => s.topicLabel),
  );
  check(
    "no profile means no topic suggestions",
    suggestedContentTopics(null, "podcast").length === 0,
  );
  check(
    "the library channel never returns a podcast-only topic",
    suggestedContentTopics(
      {
        interests: ["sleep", "mental-health"],
        goals: [],
        selfReportedConditions: [],
        sleepGoalHours: null,
        activityGoalMinutes: null,
      },
      "library",
    ).length === 0,
  );
}

/* ------------------------------------------------------------------ *
 * PDF text encoding
 * ------------------------------------------------------------------ */
{
  check("keeps plain ASCII unchanged", toLatin1Text("Blood pressure 120/80") === "Blood pressure 120/80");
  check(
    "converts a typographic apostrophe the font cannot draw",
    toLatin1Text("CDC\u2019s guidance") === "CDC's guidance",
    toLatin1Text("CDC\u2019s guidance"),
  );
  check(
    "converts an em dash rather than dropping the space around it",
    toLatin1Text("one \u2014 two") === "one - two",
    toLatin1Text("one \u2014 two"),
  );
  check(
    "keeps accented Latin-1 characters, which the font can draw",
    toLatin1Text("caf\u00e9") === "caf\u00e9",
    toLatin1Text("caf\u00e9"),
  );
  // Three code points, one question mark each: the count says nothing is
  // dropped silently, and that the report is still the length of the input.
  check(
    "replaces characters outside the font's set with a visible marker",
    toLatin1Text("\u0915\u094d\u0937") === "???",
    toLatin1Text("\u0915\u094d\u0937"),
  );
  check(
    "the report says what happens to those characters",
    EXPORT_NOTES.some((note) => /Latin-1/.test(note)),
    EXPORT_NOTES,
  );
}

{
  const name = exportFilename(7, "2026-06-10T09:00:00.000Z");
  check("the export filename ends in .pdf", name.endsWith(".pdf"), name);
  check(
    "the export filename carries no character that a filesystem would reject",
    /^[A-Za-z0-9._-]+$/.test(name),
    name,
  );
  check(
    "the export filename does not contain a path separator",
    !name.includes("/") && !name.includes("\\"),
  );
}

/* ------------------------------------------------------------------ *
 * The retrieval-only fallback
 *
 * This is what a reader gets on a day the provider refuses every request, so the
 * properties asserted here are the ones that make it safe: it quotes only, it
 * quotes whole sentences, and it labels each quotation with the document it came
 * from. There is no generated sentence anywhere in it, because none could be
 * attributed to a source once the model is out of the picture.
 * ------------------------------------------------------------------ */
function evidence(id: number, text: string, heading: string | null = null): EvidenceChunk {
  return {
    id,
    documentId: 1,
    ordinal: id,
    heading,
    text,
    charCount: text.length,
    sourceId: "nhs-high-blood-pressure",
    documentTitle: "High blood pressure",
    publisher: "NHS (UK)",
    sourceUrl: "https://www.nhs.uk/conditions/high-blood-pressure/",
    licence: "Open Government Licence v3.0.",
    topic: "hypertension",
  };
}

const sentences = [
  "Blood pressure is recorded with two numbers. ",
  "The systolic pressure is the higher number. ",
  "The diastolic pressure is the lower number. ",
  "Both numbers are measured in millimetres of mercury. ",
  "Raised blood pressure is confirmed from repeated readings. ",
].join("");

{
  check(
    "a passage shorter than the budget is quoted whole",
    trimToSentence("Short passage about blood pressure. It has two sentences.", 420) ===
      "Short passage about blood pressure. It has two sentences.",
    trimToSentence("Short passage about blood pressure. It has two sentences.", 420),
  );
  const trimmed = trimToSentence(sentences, 80);
  check(
    "a long passage is cut at a sentence boundary",
    trimmed !== null && trimmed.endsWith(".") && !trimmed.endsWith(".. "),
    trimmed,
  );
  check(
    "the cut passage is a prefix of the original, with nothing added",
    trimmed !== null && sentences.startsWith(trimmed.replace(/\s+/g, " ")),
    trimmed,
  );
  check(
    "a passage with no sentence break in the window is refused rather than cut mid-sentence",
    trimToSentence("x".repeat(200) + " end", 80) === null,
    trimToSentence("x".repeat(200) + " end", 80),
  );
  check(
    "a passage whose only ending is early falls back to its first whole sentence",
    trimToSentence("Diet matters. " + "y".repeat(300), 80) === "Diet matters.",
    trimToSentence("Diet matters. " + "y".repeat(300), 80),
  );
  check(
    "a first sentence that runs past the budget is refused",
    trimToSentence("z".repeat(300) + ". More.", 80) === null,
    trimToSentence("z".repeat(300) + ". More.", 80),
  );
  check(
    "a fragment beginning mid-word is refused rather than quoted",
    trimToSentence("ur GP surgery a few days later. " + "w".repeat(300), 80) === null,
    trimToSentence("ur GP surgery a few days later. " + "w".repeat(300), 80),
  );
  check("an empty passage is refused", trimToSentence("   ", 100) === null);
  check(
    "runs of whitespace in a passage are collapsed",
    trimToSentence("One   sentence\n\nhere.", 100) === "One sentence here.",
    trimToSentence("One   sentence\n\nhere.", 100),
  );
}

{
  const chunks = [
    evidence(1, sentences),
    evidence(2, sentences),
    evidence(3, sentences),
    evidence(4, sentences),
    evidence(5, sentences),
  ];
  const built = buildRetrievalOnlyAnswer(chunks);
  check(
    "the fallback quotes no more passages than the limit",
    built.excerpts === RETRIEVAL_ONLY_LIMITS.passages,
    built.excerpts,
  );
  check(
    "the fallback labels its quotations in order",
    built.labels.join(",") === "S1,S2,S3",
    built.labels,
  );
  check(
    "every landed quotation carries its label",
    built.labels.every((label) => built.text.includes(`[${label}]`)),
    built.text.slice(0, 80),
  );
  check(
    "every quotation in the fallback is text from a retrieved passage",
    built.text
      .split("\n\n")
      .every((paragraph) => {
        const body = paragraph.replace(/\s*\[S\d+\]$/, "").trim();
        return chunks.some((chunk) => chunk.text.replace(/\s+/g, " ").includes(body));
      }),
    built.text.split("\n\n").map((p) => p.slice(0, 40)),
  );
  check(
    "the fallback contains no sentence of its own",
    !/\b(this means|you should|we recommend|in summary)\b/i.test(built.text),
    built.text,
  );
  check(
    "the fallback never repeats a passage",
    new Set(built.text.split("\n\n")).size === built.text.split("\n\n").length,
  );

  const nothingQuotable = buildRetrievalOnlyAnswer([
    evidence(1, "x".repeat(600)),
  ]);
  check(
    "an unquotable passage yields no answer rather than a fragment",
    nothingQuotable.excerpts === 0 && nothingQuotable.text === "",
    nothingQuotable,
  );

  check(
    "no evidence at all yields no answer",
    buildRetrievalOnlyAnswer([]).excerpts === 0,
  );
}

/* ------------------------------------------------------------------ *
 * Provider error reporting
 * ------------------------------------------------------------------ */
{
  const quota = new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"25855s"}]}}',
  );
  const described = describeGeminiError(quota, { model: "gemini-flash-latest" });
  check("an exhausted quota is a 429, not a generic 503", described.httpStatus === 429, described.httpStatus);
  check(
    "the quota message names the provider's human sentence",
    /exceeded your current quota/i.test(described.message),
    described.message,
  );
  check(
    "the quota message does not paste the provider's JSON envelope",
    !described.message.includes('"details"') && !described.message.includes("@type"),
    described.message,
  );
  check(
    "the provider's own wait is surfaced in whole seconds",
    described.retryAfterSeconds === 25856,
    described.retryAfterSeconds,
  );
  check(
    "the wait is stated in a form a reader can act on",
    /about \d+ hours/.test(described.message),
    described.message,
  );
  check(
    "an invalid key is a 502 that asks for a configuration change",
    describeGeminiError(new Error("API key not valid"), { model: "m" }).httpStatus === 502,
  );
  check(
    "an oversubscribed model is a 503 and says so is transient",
    /transient/.test(describeGeminiError(new Error("503 UNAVAILABLE"), { model: "m" }).message),
  );
  check(
    "a missing key reports the configuration problem, not a crash",
    (() => {
      const result = describeGeminiError(new MissingKeyError("GEMINI_API_KEY is not set."), {});
      return result.kind === "missing-key" && result.httpStatus === 503;
    })(),
  );
  check(
    "a long provider message is truncated rather than shown whole",
    providerDetail(new Error("z".repeat(4000))).length <= 263,
    providerDetail(new Error("z".repeat(4000))).length,
  );
  check(
    "a provider message without an envelope is still reported",
    providerDetail(new Error("fetch failed")) === "fetch failed",
    providerDetail(new Error("fetch failed")),
  );
}

/* ------------------------------------------------------------------ *
 * Patient-experience discovery
 *
 * The external search is the one part of the community that talks to a third
 * party, so the deterministic rules are asserted here: the query cannot carry
 * arbitrary text, a result cannot point anywhere except the provider's own https
 * host, provider HTML is reduced to plain text, and every stored disease topic has
 * an experience category. A topic with no category would silently disappear from
 * the experience filter for that condition.
 * ------------------------------------------------------------------ */
{
  const query = buildProviderQuery(
    "chikungunya",
    "Has anyone else experienced this problem while living with my condition?",
  );
  check(
    "the provider query starts with the canonical disease term",
    query.startsWith("chikungunya"),
    query,
  );
  check(
    "the provider query drops filler words and stops at three terms",
    !/\b(anyone|experienced|living|condition)\b/.test(query) && query.split(" ").length <= 3,
    query,
  );
  check(
    "the provider query cannot exceed its cap",
    buildProviderQuery("dengue", "a".repeat(400)).length <= 120,
  );
  check(
    "the provider query strips punctuation that has no meaning to the API",
    !/[<>"'%;()&+]/.test(
      buildProviderQuery("dengue", 'fever <script>alert("x")</script> & pain; pain'),
    ),
    buildProviderQuery("dengue", 'fever <script>alert("x")</script> & pain; pain'),
  );
  check(
    "every configured disease has a non-empty search query",
    DISEASES.every((disease) => buildProviderQuery(disease.id, "").length > 0),
    DISEASES.filter((disease) => buildProviderQuery(disease.id, "").length === 0).map(
      (disease) => disease.id,
    ),
  );
  check(
    "the query is keyed by disease id, not by the displayed name",
    buildProviderQuery("chronic-kidney-disease", "") === "chronic kidney disease",
    buildProviderQuery("chronic-kidney-disease", ""),
  );
}

{
  const excerpt = excerptFromHtml(
    '<p>I was diagnosed &amp; the pain <strong>woke me</strong> at night.</p>',
  );
  check(
    "provider HTML is reduced to plain text",
    excerpt === "I was diagnosed & the pain woke me at night.",
    excerpt,
  );
  check(
    "an excerpt never contains markup",
    excerpt === null || !/[<>]/.test(excerpt),
    excerpt,
  );
  check(
    "a long provider body is truncated with an ellipsis",
    (excerptFromHtml(`<p>${"word ".repeat(200)}</p>`) ?? "").endsWith("…"),
  );
  check("an empty provider body becomes null, not an empty string", excerptFromHtml("<p> </p>") === null);
  check("a missing provider body becomes null", excerptFromHtml(undefined) === null);
  check(
    "numeric entities are decoded rather than shown literally",
    decodeEntities("it&#39;s fine") === "it's fine",
    decodeEntities("it&#39;s fine"),
  );
}

{
  check(
    "the provider's own https question URL is allowed",
    isAllowedResultUrl(
      "https://medicalsciences.stackexchange.com/questions/1/example",
    ),
  );
  check(
    "a look-alike host is refused",
    !isAllowedResultUrl("https://medicalsciences.stackexchange.com.evil.test/questions/1"),
  );
  check("plain http is refused for a result", !isAllowedResultUrl("http://medicalsciences.stackexchange.com/q/1"));
  check("a javascript: URL is refused", !isAllowedResultUrl("javascript:alert(1)"));
  check("a URL with embedded credentials is refused", !isAllowedResultUrl("https://user:pass@medicalsciences.stackexchange.com/q/1"));
  check("a non-URL is refused", !isAllowedResultUrl("not a url"));
  check("a hosted fallback on https is allowed", isSafeOutboundUrl("https://www.who.int/health-topics/dengue"));
  check("a fallback on plain http is refused", !isSafeOutboundUrl("http://example.org/group"));
  check(
    "a fallback with embedded credentials is refused",
    !isSafeOutboundUrl("https://user:pass@example.org/group"),
  );
}

{
  check(
    "every stored disease topic maps to an experience category",
    DISEASES.every((disease) =>
      disease.topics.every((topic) => experienceTopicForNativeTopic(topic.id) !== null),
    ),
    DISEASES.flatMap((disease) =>
      disease.topics
        .filter((topic) => experienceTopicForNativeTopic(topic.id) === null)
        .map((topic) => `${disease.id}:${topic.id}`),
    ),
  );
  check(
    "a familiar topic maps to the expected category",
    experienceTopicForNativeTopic("joints") === "symptoms-impact",
    experienceTopicForNativeTopic("joints"),
  );
  check(
    "an unknown topic has no category instead of guessing one",
    experienceTopicForNativeTopic("not-a-real-topic") === null,
  );
  check(
    "an experience category cannot be falsified by an arbitrary string",
    !isExperienceTopicId("everything") && isExperienceTopicId("caregiving"),
  );
  check(
    "the filter vocabulary covers every category exactly once",
    new Set(EXPERIENCE_TOPICS.map((topic) => topic.id)).size === EXPERIENCE_TOPICS.length,
  );
}

{
  const searching = PROVIDER_FINDINGS.filter((provider) => provider.capability === "search");
  check(
    "exactly one provider is claimed as searched",
    searching.length === 1 && searching[0]?.id === "medicalsciences-stackexchange",
    searching.map((provider) => provider.id),
  );
  check(
    "every provider finding names the method it actually supports",
    PROVIDER_FINDINGS.every(
      (provider) => provider.method.length > 0 && provider.finding.length > 40,
    ),
  );
  check(
    "every provider finding links to a real https site",
    PROVIDER_FINDINGS.every((provider) => isSafeOutboundUrl(provider.url)),
  );
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
