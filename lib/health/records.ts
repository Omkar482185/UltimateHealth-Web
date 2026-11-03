/**
 * Personal health records: database access and domain validation.
 *
 * These are measurements a person typed in themselves. Nothing here is derived,
 * predicted or estimated: the `source` column is written as `self-reported` on
 * every row and there is no code path that inserts a computed value, so a chart
 * can only ever draw numbers that someone actually recorded.
 *
 * Two rules shape this module:
 *
 *  1. Every statement filters on `user_id`, and update and delete additionally
 *     match `id AND user_id` together. A record belonging to another account is
 *     therefore not found rather than forbidden, and a caller cannot tell the two
 *     apart — which is why the API returns the same 404 for both.
 *  2. Values pass plausibility bounds before they are stored. Those bounds exist
 *     to catch a mistyped reading, not to judge whether a measurement is
 *     clinically acceptable: they are far wider than any reference range, and
 *     nothing in this file interprets a value.
 *
 * This module must not be imported from a client component: it opens SQLite. The
 * shared, browser-safe definitions live in `lib/health/kinds.ts` and the trend
 * arithmetic in `lib/health/trends.ts`. Both are re-exported below so server-side
 * callers have one import.
 */
import { getDb } from "@/lib/db/index";
import {
  KIND_BY_ID,
  type HealthRecord,
  type RecordInput,
  type RecordKind,
} from "@/lib/health/kinds";
import { RecordValidationError, validateRecordInput } from "@/lib/health/validate";

export * from "@/lib/health/kinds";
export * from "@/lib/health/trends";
export * from "@/lib/health/validate";

type RecordRow = {
  id: number;
  kind: string;
  value_primary: number;
  value_secondary: number | null;
  unit: string;
  measured_at: string;
  note: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS = `id, kind, value_primary, value_secondary, unit, measured_at, note, source,
              created_at, updated_at`;

function toRecord(row: RecordRow): HealthRecord {
  return {
    id: row.id,
    kind: row.kind as RecordKind,
    valuePrimary: row.value_primary,
    valueSecondary: row.value_secondary,
    unit: row.unit,
    measuredAt: row.measured_at,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isoNow(): string {
  return new Date().toISOString();
}

export function createRecord(userId: number, input: RecordInput): HealthRecord {
  const spec = KIND_BY_ID[input.kind];
  if (!spec) {
    throw new RecordValidationError(["That is not one of the supported measurement kinds."]);
  }
  const clean = validateRecordInput(input);
  const now = isoNow();

  const info = getDb()
    .prepare(
      `INSERT INTO health_records
         (user_id, kind, value_primary, value_secondary, unit, measured_at, note, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'self-reported', ?, ?)`,
    )
    .run(
      userId,
      input.kind,
      clean.valuePrimary,
      clean.valueSecondary,
      spec.primary.unit,
      clean.measuredAt,
      clean.note,
      now,
      now,
    );

  const created = getRecord(userId, Number(info.lastInsertRowid));
  if (!created) throw new Error("The record could not be read back after it was inserted.");
  return created;
}

export type ListOptions = {
  kind?: RecordKind;
  /** Inclusive lower bound on the time the reading was taken, as an ISO string. */
  from?: string;
  /** Exclusive upper bound, so a day filter does not double count a midnight row. */
  to?: string;
  limit?: number;
};

export const LIST_LIMIT_MAX = 2000;
export const LIST_LIMIT_DEFAULT = 500;

export function listRecords(userId: number, options: ListOptions = {}): HealthRecord[] {
  const clauses = ["user_id = ?"];
  const params: (string | number)[] = [userId];

  if (options.kind) {
    clauses.push("kind = ?");
    params.push(options.kind);
  }
  if (options.from) {
    clauses.push("measured_at >= ?");
    params.push(options.from);
  }
  if (options.to) {
    clauses.push("measured_at < ?");
    params.push(options.to);
  }

  const limit = Math.min(Math.max(options.limit ?? LIST_LIMIT_DEFAULT, 1), LIST_LIMIT_MAX);
  params.push(limit);

  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLUMNS}
         FROM health_records
        WHERE ${clauses.join(" AND ")}
        ORDER BY measured_at DESC, id DESC
        LIMIT ?`,
    )
    .all(...params) as RecordRow[];

  return rows.map(toRecord);
}

export function getRecord(userId: number, id: number): HealthRecord | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM health_records WHERE id = ? AND user_id = ?`)
    .get(id, userId) as RecordRow | undefined;
  return row ? toRecord(row) : null;
}

export function countRecords(userId: number): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM health_records WHERE user_id = ?`)
      .get(userId) as { n: number }
  ).n;
}

/**
 * Updates a record. Returns null when no row matched, which covers both a record
 * that does not exist and one owned by another account.
 */
export function updateRecord(
  userId: number,
  id: number,
  input: RecordInput,
): HealthRecord | null {
  const spec = KIND_BY_ID[input.kind];
  if (!spec) {
    throw new RecordValidationError(["That is not one of the supported measurement kinds."]);
  }
  const clean = validateRecordInput(input);

  const result = getDb()
    .prepare(
      `UPDATE health_records
          SET kind = ?, value_primary = ?, value_secondary = ?, unit = ?, measured_at = ?,
              note = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    )
    .run(
      input.kind,
      clean.valuePrimary,
      clean.valueSecondary,
      spec.primary.unit,
      clean.measuredAt,
      clean.note,
      isoNow(),
      id,
      userId,
    );

  if (result.changes === 0) return null;
  return getRecord(userId, id);
}

/** Returns false when no row matched, for the same reason as `updateRecord`. */
export function deleteRecord(userId: number, id: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM health_records WHERE id = ? AND user_id = ?`)
    .run(id, userId);
  return result.changes > 0;
}
