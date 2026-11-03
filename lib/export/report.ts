/**
 * The personal-data export, assembled once and rendered twice.
 *
 * Both the PDF and the JSON download are views of this object, so the two cannot
 * describe different things. The scope is stated in the report itself: what is
 * included, and what is deliberately left out and why. A reader should not have to
 * take the platform's word for what a download contains.
 *
 * Everything here is scoped to one account. The account is identified by the
 * session, and every read filters on that id, so there is no code path that could
 * produce another person's rows.
 */
import { getProfile, getUserById } from "@/lib/auth/users";
import type { Profile } from "@/lib/auth/users";
import { countRecords, listRecords, LIST_LIMIT_MAX } from "@/lib/health/records";
import { KIND_BY_ID, RECORD_KINDS, type HealthRecord } from "@/lib/health/kinds";
import { buildTrend } from "@/lib/health/trends";
import { SITE } from "@/lib/config";
import { listSavedResources, type SavedResource } from "@/lib/profile/saved";
import { getDb } from "@/lib/db/index";

export const EXPORT_FORMAT_VERSION = "2";

export type ExportKindSummary = {
  kind: string;
  label: string;
  unit: string;
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  /** Date of the earliest and latest record of this kind. */
  firstMeasuredAt: string | null;
  lastMeasuredAt: string | null;
};

export type ExportReport = {
  formatVersion: string;
  generatedAt: string;
  platform: string;
  account: { email: string; createdAt: string };
  profile: Profile | null;
  records: HealthRecord[];
  recordCount: number;
  /** True when the account holds more rows than a single export includes. */
  recordsTruncated: boolean;
  summaries: ExportKindSummary[];
  saved: SavedResource[];
  activeSessions: number;
  included: string[];
  excluded: string[];
  notes: string[];
};

/** What every export contains. Kept as data so the PDF and README cannot drift. */
export const EXPORT_INCLUDED = [
  "The account's email address and the date it was created.",
  "Every profile field you have saved, including interests, goals and any condition you disclosed, labelled as your own statement rather than a verified record.",
  "Every measurement you recorded, with its value, unit, the time you said it was taken, your own note, and the fact that it is self-reported.",
  "Descriptive summaries per measurement kind: how many records, the lowest, the highest and the mean.",
  "Every item you saved from the podcasts catalogue or the source library, with where it came from.",
  "How many sessions are currently active on the account.",
];

export const EXPORT_EXCLUDED = [
  "The password hash. It is stored only so that you can sign in, cannot be reversed into your password, and has no use outside that.",
  "Questions asked of the assistant. They are not linked to any account, so there is no link to export.",
  "Symptom guidance sessions. They are not stored against an account either.",
  "Server configuration, API keys, logs and any other account's data.",
];

export const EXPORT_NOTES = [
  "This is a personal data export, not a medical record, and it does not replace one.",
  "The summary figures are arithmetic over the rows listed here. They are not clinical measurements and are not compared with any threshold in the export.",
  "Character restriction: the PDF uses a standard Latin font, so text outside the Latin-1 range (for example a note written in Devanagari or Bengali) is shown as a question mark. The JSON export preserves it exactly.",
];

export function buildExportReport(userId: number): ExportReport | null {
  const user = getUserById(userId);
  if (!user) return null;

  const profile = getProfile(userId);
  const records = listRecords(userId, { limit: LIST_LIMIT_MAX });
  const total = countRecords(userId);

  const summaries: ExportKindSummary[] = RECORD_KINDS.filter((spec) =>
    records.some((record) => record.kind === spec.kind),
  ).map((spec) => {
    const trend = buildTrend(records, spec.kind);
    const dates = trend.points.map((point) => point.measuredAt).sort();
    return {
      kind: spec.kind,
      label: spec.label,
      unit: KIND_BY_ID[spec.kind].primary.unit,
      count: trend.points.length,
      min: trend.primary?.min ?? null,
      max: trend.primary?.max ?? null,
      mean: trend.primary?.mean ?? null,
      firstMeasuredAt: dates[0] ?? null,
      lastMeasuredAt: dates[dates.length - 1] ?? null,
    };
  });

  const activeSessions = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`)
      .get(userId) as { n: number }
  ).n;

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    platform: SITE.title,
    account: { email: user.email, createdAt: user.createdAt },
    profile,
    records,
    recordCount: total,
    recordsTruncated: total > records.length,
    summaries,
    saved: listSavedResources(userId),
    activeSessions,
    included: [...EXPORT_INCLUDED],
    excluded: [...EXPORT_EXCLUDED],
    notes: [...EXPORT_NOTES],
  };
}

/**
 * The JSON body of the download.
 *
 * The flat `healthRecords` key is kept alongside the richer report so that a
 * script written against an earlier export keeps working; the report is additive.
 */
export function exportReportToJson(report: ExportReport): Record<string, unknown> {
  return {
    formatVersion: report.formatVersion,
    exportedAt: report.generatedAt,
    platform: report.platform,
    account: report.account,
    profile: report.profile,
    healthRecords: report.records,
    recordCount: report.recordCount,
    recordSummaries: report.summaries,
    savedResources: report.saved,
    activeSessions: report.activeSessions,
    includedInThisExport: report.included,
    excludedFromThisExport: report.excluded,
    notes: report.notes,
  };
}
