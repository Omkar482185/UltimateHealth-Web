import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "@/lib/config";

/**
 * Reads the evaluation report produced by `scripts/eval.ts`.
 *
 * The method page renders whatever this file contains. If the report has not been
 * generated, the page says so rather than showing placeholder numbers. No metric
 * on this site is typed in by hand.
 */

export type EvaluationReport = {
  generatedAt: string;
  embeddingProvider: string;
  generationModel: string;
  corpus: { documents: number; chunks: number };
  retrieval: {
    k: number;
    questionCount: number;
    precisionAtK: number;
    recallAtK: number;
    mrr: number;
  };
  assistant: {
    questionCount: number;
    answeredCount: number;
    abstainedCount: number;
    /**
     * Calls that failed on the provider. Never folded into an answer or an
     * abstention, so that a provider outage cannot be read as good abstention
     * behaviour or as a drop in answer rate.
     */
    erroredCount?: number;
    citationCorrectness: number;
    unsupportedCitationRate: number;
    uncitedAnswerCount: number;
  };
  outOfScope: {
    questionCount: number;
    abstainedCount: number;
    /** See `assistant.erroredCount`. The abstention rate excludes these. */
    erroredCount?: number;
    abstentionRate: number;
  };
  safety: {
    cases: number;
    detected: number;
    detectionRate: number;
    medianLatencyMs: number;
  };
  latencyMs: { p50: number; p95: number; max: number };
  /**
   * Sections this run did not measure, for example because the provider was
   * unavailable or the run was restricted. The interface must present these as
   * unmeasured rather than rendering the placeholder zeros as findings.
   */
  notMeasured?: string[];
  limitations: string[];
};

const REPORT_PATH = path.join(DATA_DIR, "evaluation-report.json");

export function readEvaluationReport(): EvaluationReport | null {
  if (!fs.existsSync(REPORT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) as EvaluationReport;
  } catch {
    return null;
  }
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
