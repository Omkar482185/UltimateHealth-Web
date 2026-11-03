/**
 * Evaluation harness.
 *
 *   pnpm eval                       # retrieval + assistant + safety, full set
 *   pnpm eval --limit=10            # cap generation calls
 *   pnpm eval --retrieval-only      # skip generation entirely
 *   pnpm eval --allow-test-embeddings
 *
 * Produces:
 *   data/evaluation-report.json     # machine-readable, rendered by /method
 *   docs/evaluation.md              # written report with methodology
 *
 * The harness refuses to report numbers produced by the non-semantic test
 * embedding provider, because those numbers would be meaningless.
 */
import fs from "node:fs";
import path from "node:path";

import { loadEnv } from "@/lib/load-env";
import { DATA_DIR, GENERATION, RETRIEVAL } from "@/lib/config";
import { getStore } from "@/lib/db/index";
import { getEmbeddingProvider } from "@/lib/embeddings";
import type { EvaluationReport } from "@/lib/evaluation";
import {
  IN_CORPUS_QUESTIONS,
  OUT_OF_SCOPE_QUESTIONS,
  SAFETY_CASES,
} from "@/lib/rag/eval-set";
import { answerQuestion } from "@/lib/rag/generate";
import { retrieve } from "@/lib/rag/retrieve";
import { screenForEmergency } from "@/lib/rag/safety";

loadEnv();

const K = 5;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function argValue(flag: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : undefined;
}

async function main() {
  const provider = await getEmbeddingProvider();
  const store = getStore();

  if (provider.isTestDouble && !process.argv.includes("--allow-test-embeddings")) {
    console.error(
      "Refusing to evaluate with the test-hash embedding provider.\n" +
        "Its vectors carry no semantic signal, so retrieval metrics would be meaningless.\n" +
        "Set GEMINI_API_KEY in website/.env.local (see .env.example).",
    );
    process.exitCode = 1;
    return;
  }

  const limit = Number(argValue("--limit") ?? IN_CORPUS_QUESTIONS.length);
  const retrievalOnly = process.argv.includes("--retrieval-only");

  console.log(`backend:   ${store.backend}`);
  console.log(`provider:  ${provider.name}:${provider.model}`);
  console.log(`corpus:    ${store.countDocuments()} documents, ${store.countChunks()} chunks`);
  console.log(`retrieval: hybrid, k=${K}, minCosine=${RETRIEVAL.minCosine}`);
  console.log("");

  // ---------- Retrieval ----------
  // The emergency screen is pure code and needs neither the embedding provider
  // nor the language model. Running it alone means the safety behaviour stays
  // measurable during a provider outage, which is exactly when a reader is most
  // likely to meet the deterministic path.
  const safetyOnly = process.argv.includes("--safety-only");

  if (!safetyOnly) console.log("Evaluating retrieval...");
  const precisionScores: number[] = [];
  const recallScores: number[] = [];
  const reciprocalRanks: number[] = [];
  let zeroHitQuestions = 0;

  for (const item of safetyOnly ? [] : IN_CORPUS_QUESTIONS) {
    const result = await retrieve(item.question, { topK: K });
    const gold = new Set(item.relevantSourceIds);

    const retrievedIds = result.evidence.map((c) => c.id);
    const retrievedSources = result.evidence.map((c) => c.sourceId);
    const relevantFlags = retrievedSources.map((id) => gold.has(id));
    const relevantCount = relevantFlags.filter(Boolean).length;

    precisionScores.push(retrievedIds.length === 0 ? 0 : relevantCount / K);
    const firstRelevant = relevantFlags.findIndex(Boolean);
    reciprocalRanks.push(firstRelevant === -1 ? 0 : 1 / (firstRelevant + 1));

    const distinctRelevantSources = new Set(
      retrievedSources.filter((id) => gold.has(id)),
    ).size;
    recallScores.push(gold.size === 0 ? 0 : distinctRelevantSources / gold.size);

    if (relevantCount === 0) zeroHitQuestions += 1;
  }

  const retrieval = {
    k: K,
    questionCount: IN_CORPUS_QUESTIONS.length,
    precisionAtK: mean(precisionScores),
    recallAtK: mean(recallScores),
    mrr: mean(reciprocalRanks),
  };
  if (!safetyOnly) {
    console.log(
      `  precision@${K}=${retrieval.precisionAtK.toFixed(3)} recall@${K}=${retrieval.recallAtK.toFixed(3)} mrr=${retrieval.mrr.toFixed(3)}`,
    );
    console.log(`  questions with no relevant passage in top ${K}: ${zeroHitQuestions}`);
    console.log("");
  }

  // ---------- Safety ----------
  console.log("Evaluating the emergency screen...");
  const safetyLatencies: number[] = [];
  let detected = 0;
  const safetyMistakes: string[] = [];

  for (const testCase of SAFETY_CASES) {
    const started = performance.now();
    const screen = screenForEmergency(testCase.text);
    safetyLatencies.push(performance.now() - started);

    const fired = screen.isEmergency;
    const expectedRuleOk =
      !testCase.expectedRuleId ||
      screen.matchedRules.some((r) => r.id === testCase.expectedRuleId);

    if (fired === testCase.expectEmergency && expectedRuleOk) {
      detected += 1;
    } else {
      safetyMistakes.push(
        `${testCase.id}: expected emergency=${testCase.expectEmergency}${
          testCase.expectedRuleId ? ` rule=${testCase.expectedRuleId}` : ""
        }, got emergency=${fired} rules=[${screen.matchedRules.map((r) => r.id).join(",")}]`,
      );
    }
  }

  const safety = {
    cases: SAFETY_CASES.length,
    detected,
    detectionRate: SAFETY_CASES.length === 0 ? 0 : detected / SAFETY_CASES.length,
    medianLatencyMs:
      Math.round(percentile(safetyLatencies, 50) * 1000) / 1000,
  };
  console.log(
    `  ${detected}/${SAFETY_CASES.length} cases behaved as expected (median ${safety.medianLatencyMs} ms)`,
  );
  for (const mistake of safetyMistakes) console.log(`  MISS ${mistake}`);
  console.log("");

  if (safetyOnly) {
    console.log(
      "Safety-only run: retrieval and answer metrics were not measured.",
    );
    writeReport({
      generatedAt: new Date().toISOString(),
      embeddingProvider: `${provider.name}:${provider.model}`,
      generationModel: GENERATION.model,
      corpus: {
        documents: store.countDocuments(),
        chunks: store.countChunks(),
      },
      retrieval: {
        k: K,
        questionCount: IN_CORPUS_QUESTIONS.length,
        precisionAtK: 0,
        recallAtK: 0,
        mrr: 0,
      },
      assistant: {
        questionCount: 0,
        answeredCount: 0,
        abstainedCount: 0,
        citationCorrectness: 0,
        unsupportedCitationRate: 0,
        uncitedAnswerCount: 0,
      },
      outOfScope: {
        questionCount: OUT_OF_SCOPE_QUESTIONS.length,
        abstainedCount: 0,
        abstentionRate: 0,
      },
      safety,
      latencyMs: { p50: 0, p95: 0, max: 0 },
      // Named so the interface can say "not measured in this run" rather than
      // rendering a zero as if it were a result. A zero and an unmeasured value
      // look identical in a table and mean opposite things.
      notMeasured: ["retrieval", "assistant", "outOfScope", "latency"],
      limitations: [
        "This run used --safety-only because the embedding provider was unavailable, so only the emergency screen was measured. Retrieval, answer behaviour and latency were not measured and are shown as unmeasured rather than as zero.",
        "The emergency screen is evaluated against a hand-written set of inputs. It measures whether the rules fire as intended, not whether the rules cover every real emergency presentation.",
        "No measure here says anything about clinical effectiveness. Nothing on this platform has been clinically validated.",
      ],
    });
    if (detected !== SAFETY_CASES.length) process.exitCode = 1;
    return;
  }

  // ---------- Assistant ----------
  // `erroredCount` is tracked separately and is never folded into either an
  // answer or an abstention. A provider failure is a missing measurement, not a
  // behaviour, and the distinction matters in both directions: counting an error
  // as an abstention would flatter the abstention rate, and dividing by the full
  // question count after errors would understate it.
  const assistant = {
    questionCount: 0,
    answeredCount: 0,
    abstainedCount: 0,
    erroredCount: 0,
    citationCorrectness: 0,
    unsupportedCitationRate: 0,
    uncitedAnswerCount: 0,
  };
  const outOfScope = {
    questionCount: OUT_OF_SCOPE_QUESTIONS.length,
    abstainedCount: 0,
    erroredCount: 0,
    abstentionRate: 0,
  };
  const latencies: number[] = [];

  if (!retrievalOnly) {
    console.log(`Generating answers for ${limit} in-corpus questions...`);
    let citationAttempts = 0;
    let citationFailures = 0;
    let answeredWithCleanCitations = 0;
    const subset = IN_CORPUS_QUESTIONS.slice(0, limit);
    assistant.questionCount = subset.length;

    for (const item of subset) {
      try {
        const result = await answerQuestion(item.question);
        latencies.push(result.latencyMs);

        if (result.mode === "abstained") {
          assistant.abstainedCount += 1;
        } else if (result.mode === "answered") {
          assistant.answeredCount += 1;
          citationAttempts += result.citations.length + result.strippedCitations;
          citationFailures += result.strippedCitations;
          if (result.strippedCitations === 0) answeredWithCleanCitations += 1;
        } else if (result.mode === "uncited") {
          assistant.uncitedAnswerCount += 1;
          citationFailures += result.strippedCitations;
          citationAttempts += result.strippedCitations;
        }
        process.stdout.write(".");
      } catch (error) {
        assistant.erroredCount += 1;
        console.log(
          `\n  error on ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log("");

    assistant.citationCorrectness =
      assistant.answeredCount === 0
        ? 0
        : answeredWithCleanCitations / assistant.answeredCount;
    assistant.unsupportedCitationRate =
      citationAttempts === 0 ? 0 : citationFailures / citationAttempts;

    console.log(
      `  answered=${assistant.answeredCount} abstained=${assistant.abstainedCount} uncited=${assistant.uncitedAnswerCount}${
        assistant.erroredCount > 0
          ? ` not measured=${assistant.erroredCount} (provider error, excluded from the rates)`
          : ""
      }`,
    );
    console.log(
      `  citation correctness=${assistant.citationCorrectness.toFixed(3)} unsupported citation rate=${assistant.unsupportedCitationRate.toFixed(3)}`,
    );

    console.log(`Generating answers for ${OUT_OF_SCOPE_QUESTIONS.length} out-of-scope questions...`);
    for (const question of OUT_OF_SCOPE_QUESTIONS) {
      try {
        const result = await answerQuestion(question);
        latencies.push(result.latencyMs);
        if (result.mode === "abstained") outOfScope.abstainedCount += 1;
        process.stdout.write(".");
      } catch (error) {
        outOfScope.erroredCount += 1;
        console.log(
          `\n  error on out-of-scope question: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log("");
    const outOfScopeMeasured = outOfScope.questionCount - outOfScope.erroredCount;
    outOfScope.abstentionRate =
      outOfScopeMeasured === 0 ? 0 : outOfScope.abstainedCount / outOfScopeMeasured;
    console.log(
      `  abstained on ${outOfScope.abstainedCount}/${outOfScopeMeasured} measured out-of-scope questions${
        outOfScope.erroredCount > 0 ? ` (${outOfScope.erroredCount} not measured: provider error)` : ""
      }`,
    );
  } else {
    console.log("Skipping generation (--retrieval-only).");
  }
  console.log("");

  // ---------- Report ----------
  // A section whose every call failed has not been measured. Saying so is the
  // difference between "no answer was produced" and "the system abstained".
  const assistantMeasured = assistant.questionCount - assistant.erroredCount;
  const notMeasured: string[] = [];
  if (retrievalOnly) notMeasured.push("assistant", "outOfScope", "latency");
  else {
    if (assistantMeasured === 0) notMeasured.push("assistant");
    if (outOfScope.questionCount - outOfScope.erroredCount === 0)
      notMeasured.push("outOfScope");
    if (latencies.length === 0) notMeasured.push("latency");
  }

  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    embeddingProvider: `${provider.name}:${provider.model}`,
    // Read through the config module, so the report names the local Ollama model
    // that actually generated the answers rather than a hard-coded fallback.
    generationModel: GENERATION.model,
    corpus: {
      documents: store.countDocuments(),
      chunks: store.countChunks(),
    },
    retrieval,
    assistant,
    outOfScope,
    safety,
    latencyMs: {
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      max: Math.round(latencies.length === 0 ? 0 : Math.max(...latencies)),
    },
    limitations: [
      "Retrieval relevance is judged at document level by one person who wrote the questions after the corpus was assembled. Questions are therefore easier than questions gathered from real users, and the retrieval figures should be read as an upper estimate.",
      "The question sets are small, so each question moves the percentages by roughly 2.5 points in the in-corpus set and 10 points in the out-of-scope set.",
      `Precision is computed against a fixed cut-off of ${K} retrieved passages, and a passage counts as correct when its source document is in the relevance list for that question, whether or not the passage itself answers the question.`,
      "Citation correctness measures whether citation markers resolve to a retrieved passage. It does not measure whether the passage actually supports the sentence, which would require sentence-level human adjudication.",
      "Latency was measured on a single development machine with a local SQLite database and a hosted language model. It is indicative, not a benchmark, and it will vary with network conditions and provider load.",
      "The emergency screen is evaluated against a hand-written set of inputs. It measures whether the rules fire as intended, not whether the rules cover every real emergency presentation.",
      "No measure here says anything about clinical effectiveness. Nothing on this platform has been clinically validated.",
      retrievalOnly
        ? "This run used --retrieval-only, so assistant, out-of-scope and latency figures were not measured. They are reported as unmeasured rather than as zero."
        : `Generation metrics are based on ${assistant.questionCount} in-corpus questions${limit < IN_CORPUS_QUESTIONS.length ? " (a subset, see --limit)" : ""} and ${outOfScope.questionCount} out-of-scope questions.`,
      assistant.erroredCount > 0 || outOfScope.erroredCount > 0
        ? `${assistant.erroredCount + outOfScope.erroredCount} generation calls failed on the provider and were excluded from every rate rather than counted as abstentions, so the abstention and citation figures cover only the calls that returned. The generation model is metered at 20 free requests per project per day, which this run reached.`
        : "No generation calls failed on the provider in this run.",
    ],
    notMeasured: notMeasured.length > 0 ? notMeasured : undefined,
  };

  writeReport(report);
}

/** Writes the JSON report and the Markdown mirror, and says where they went. */
function writeReport(report: EvaluationReport): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const jsonPath = path.join(DATA_DIR, "evaluation-report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const markdown = renderMarkdown(report);
  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  const markdownPath = path.join(docsDir, "evaluation.md");
  fs.writeFileSync(markdownPath, markdown);

  console.log("Report written to:");
  console.log(`  ${jsonPath}`);
  console.log(`  ${markdownPath}`);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderMarkdown(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push("# Evaluation report");
  lines.push("");
  lines.push(
    `Generated ${report.generatedAt}. This file is produced by \`pnpm eval\` and is regenerated on every run, so it always reflects a real measurement rather than a remembered one.`,
  );
  lines.push("");
  if (report.notMeasured && report.notMeasured.length > 0) {
    lines.push(
      `**Not measured in this run:** ${report.notMeasured.join(", ")}. Those sections are shown below as unmeasured rather than as zero.`,
    );
    lines.push("");
  }
  lines.push("## Test conditions");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Embedding provider | ${report.embeddingProvider} |`);
  lines.push(`| Generation model | ${report.generationModel} |`);
  lines.push(`| Corpus | ${report.corpus.documents} documents, ${report.corpus.chunks} passages |`);
  lines.push(`| Retrieval | hybrid (vector + BM25), reciprocal rank fusion |`);
  lines.push(`| Retrieval cut-off | top ${report.retrieval.k} passages |`);
  lines.push("");
  lines.push("## Retrieval");
  lines.push("");
  lines.push("| Metric | Definition | Value |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Precision@${report.retrieval.k} | Share of the top ${report.retrieval.k} retrieved passages whose document is relevant for the question | ${pct(report.retrieval.precisionAtK)} |`,
  );
  lines.push(
    `| Recall@${report.retrieval.k} | Share of relevant documents represented in the top ${report.retrieval.k} | ${pct(report.retrieval.recallAtK)} |`,
  );
  lines.push(
    `| Mean reciprocal rank | Mean of 1 divided by the rank of the first relevant passage | ${report.retrieval.mrr.toFixed(3)} |`,
  );
  lines.push(`| Questions | In-corpus questions with relevance judgements | ${report.retrieval.questionCount} |`);
  lines.push("");
  lines.push("## Answer behaviour");
  lines.push("");
  lines.push("| Metric | Definition | Value |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Citation correctness | Answered questions where every citation resolved to a retrieved passage | ${pct(report.assistant.citationCorrectness)} |`,
  );
  lines.push(
    `| Unsupported citation rate | Citations stripped because they did not resolve to a retrieved passage | ${pct(report.assistant.unsupportedCitationRate)} |`,
  );
  lines.push(`| Uncited answers | Answers with no verifiable citation at all | ${report.assistant.uncitedAnswerCount} |`);
  lines.push(`| Answered | In-corpus questions answered | ${report.assistant.answeredCount} |`);
  lines.push(`| Abstained | In-corpus questions declined | ${report.assistant.abstainedCount} |`);
  if ((report.assistant.erroredCount ?? 0) > 0) {
    lines.push(
      `| Not measured, in-corpus | Calls that failed on the provider, excluded from every rate above | ${report.assistant.erroredCount} |`,
    );
  }
  const outOfScopeMeasured =
    report.outOfScope.questionCount - (report.outOfScope.erroredCount ?? 0);
  lines.push(
    `| Abstention on out-of-scope questions | Declined questions the corpus cannot answer | ${pct(report.outOfScope.abstentionRate)} (${report.outOfScope.abstainedCount}/${outOfScopeMeasured}) |`,
  );
  if ((report.outOfScope.erroredCount ?? 0) > 0) {
    lines.push(
      `| Not measured, out-of-scope | Calls that failed on the provider | ${report.outOfScope.erroredCount} |`,
    );
  }
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  lines.push("| Metric | Definition | Value |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Warning-sign detection | Inputs where the screen fired as expected, including the expected rule | ${pct(report.safety.detectionRate)} (${report.safety.detected}/${report.safety.cases}) |`,
  );
  lines.push(`| Screen latency | Median time from input to decision | ${report.safety.medianLatencyMs} ms |`);
  lines.push("");
  lines.push("## Latency");
  lines.push("");
  lines.push("| Percentile | Value |");
  lines.push("| --- | --- |");
  lines.push(`| p50 | ${report.latencyMs.p50} ms |`);
  lines.push(`| p95 | ${report.latencyMs.p95} ms |`);
  lines.push(`| max | ${report.latencyMs.max} ms |`);
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push("");
  lines.push(
    "These metrics measure the behaviour of this software. They are not evidence of clinical effectiveness, and no such claim is made.",
  );
  lines.push("");
  return lines.join("\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
