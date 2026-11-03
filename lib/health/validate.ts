/**
 * Record validation.
 *
 * Pure: no database, no network, so it can be exercised directly by the unit
 * checks and imported from either side of the boundary. It is kept apart from
 * `lib/health/records.ts` so that checking a value never requires opening
 * SQLite. `records.ts` re-exports everything here for server-side callers.
 *
 * The bounds enforced are typo guards, not clinical thresholds. They are far wider
 * than any reference range, and a value that passes is not thereby "normal".
 */
import {
  KIND_BY_ID,
  NOTE_MAX_CHARS,
  roundForKind,
  type RecordInput,
} from "@/lib/health/kinds";

export class RecordValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join(" "));
    this.name = "RecordValidationError";
    this.issues = issues;
  }
}

/** A reading dated slightly ahead is allowed: clocks and time zones differ. */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
export const EARLIEST_RECORD_MS = Date.parse("1900-01-01T00:00:00Z");

export type CleanRecord = {
  valuePrimary: number;
  valueSecondary: number | null;
  measuredAt: string;
  note: string | null;
};

/**
 * Validates the shape of one record and returns the exact values to store.
 *
 * Both create and update go through this, so a value cannot reach the table by a
 * route that skipped the check. All problems are collected and reported together
 * rather than one at a time, so a form can show every issue in one pass.
 */
export function validateRecordInput(input: RecordInput): CleanRecord {
  const issues: string[] = [];
  const spec = KIND_BY_ID[input.kind];
  if (!spec) {
    throw new RecordValidationError(["That is not one of the supported measurement kinds."]);
  }

  if (!Number.isFinite(input.valuePrimary)) {
    issues.push(`${spec.primary.label} must be a number.`);
  } else if (input.valuePrimary < spec.primary.min || input.valuePrimary > spec.primary.max) {
    issues.push(
      `${spec.primary.label} must be between ${spec.primary.min} and ${spec.primary.max} ${spec.primary.unit}.`,
    );
  }

  let secondary: number | null = null;
  if (spec.secondary) {
    if (
      input.valueSecondary === undefined ||
      input.valueSecondary === null ||
      !Number.isFinite(input.valueSecondary)
    ) {
      issues.push(`${spec.secondary.label} is required for a ${spec.label.toLowerCase()} record.`);
    } else if (
      input.valueSecondary < spec.secondary.min ||
      input.valueSecondary > spec.secondary.max
    ) {
      issues.push(
        `${spec.secondary.label} must be between ${spec.secondary.min} and ${spec.secondary.max} ${spec.secondary.unit}.`,
      );
    } else {
      // The secondary value is rounded to its own precision, so a diastolic is an
      // integer while a reading with a decimal place is kept as one.
      secondary = roundForKind({ ...spec, primary: spec.secondary }, input.valueSecondary);
    }
  } else if (input.valueSecondary !== undefined && input.valueSecondary !== null) {
    issues.push(`A ${spec.label.toLowerCase()} record has a single value.`);
  }

  // A diastolic above the systolic is the classic mis-typed reading. Rejecting it
  // is a data-quality check, not a clinical judgement: swapping the two silently
  // would record a reading that nobody took.
  if (
    spec.primaryAboveSecondary &&
    secondary !== null &&
    Number.isFinite(input.valuePrimary) &&
    roundForKind(spec, input.valuePrimary) <= secondary
  ) {
    issues.push(
      `${spec.primary.label} must be higher than ${spec.secondary?.label ?? "the second value"}. Check whether the two numbers were entered the wrong way round.`,
    );
  }

  const measuredAtMs = Date.parse(input.measuredAt);
  if (!Number.isFinite(measuredAtMs)) {
    issues.push("The date and time the reading was taken could not be read.");
  } else if (measuredAtMs > Date.now() + MAX_CLOCK_SKEW_MS) {
    issues.push("The reading cannot be dated in the future.");
  } else if (measuredAtMs < EARLIEST_RECORD_MS) {
    issues.push("That date is too far in the past to be a reading you took.");
  }

  const note = (input.note ?? "").trim();
  if (note.length > NOTE_MAX_CHARS) {
    issues.push(`A note can be at most ${NOTE_MAX_CHARS} characters.`);
  }

  if (issues.length > 0) throw new RecordValidationError(issues);

  return {
    valuePrimary: roundForKind(spec, input.valuePrimary),
    valueSecondary: secondary,
    measuredAt: new Date(measuredAtMs).toISOString(),
    note: note.length === 0 ? null : note,
  };
}
