/**
 * Measurement kinds and their stored shape.
 *
 * Deliberately free of any database import so that it can be used from a client
 * component. `lib/health/records.ts` opens SQLite and must never be reachable
 * from the browser bundle; this module is what the two sides share.
 *
 * The bounds in `RECORD_KINDS` are typo guards, not clinical thresholds. They are
 * wider than any reference range on purpose, and no code in this project treats
 * one as a limit that a person has crossed.
 */

export type RecordKind =
  | "blood-pressure"
  | "weight"
  | "glucose"
  | "sleep"
  | "water"
  | "activity"
  | "symptom";

export type ValueSpec = {
  label: string;
  unit: string;
  /** Typo guard only. Far wider than any reference range. */
  min: number;
  max: number;
  integer: boolean;
};

export type KindSpec = {
  kind: RecordKind;
  label: string;
  /** Short, neutral statement of what the reading is. */
  hint: string;
  primary: ValueSpec;
  secondary: ValueSpec | null;
  /** When true, the primary value must be strictly greater than the secondary. */
  primaryAboveSecondary: boolean;
};

/**
 * The supported kinds. One canonical unit per kind, on purpose: allowing both
 * mmol/L and mg/dL for glucose would put two different scales on one trend line,
 * and silently converting between them would be an invented number, which is
 * exactly what this project avoids. The unit a person is shown is the unit stored.
 */
export const RECORD_KINDS: readonly KindSpec[] = [
  {
    kind: "blood-pressure",
    label: "Blood pressure",
    hint: "A reading from a monitor, with the higher number first.",
    primary: { label: "Systolic", unit: "mmHg", min: 40, max: 320, integer: true },
    secondary: { label: "Diastolic", unit: "mmHg", min: 20, max: 220, integer: true },
    primaryAboveSecondary: true,
  },
  {
    kind: "weight",
    label: "Weight",
    hint: "Body weight in kilograms.",
    primary: { label: "Weight", unit: "kg", min: 2, max: 600, integer: false },
    secondary: null,
    primaryAboveSecondary: false,
  },
  {
    kind: "glucose",
    label: "Blood glucose",
    hint: "A glucose reading in mmol/L, as reported by the meter.",
    primary: { label: "Glucose", unit: "mmol/L", min: 0.5, max: 60, integer: false },
    secondary: null,
    primaryAboveSecondary: false,
  },
  {
    kind: "sleep",
    label: "Sleep",
    hint: "Hours slept, as you estimate them on waking.",
    primary: { label: "Duration", unit: "hours", min: 0, max: 24, integer: false },
    secondary: null,
    primaryAboveSecondary: false,
  },
  {
    kind: "water",
    label: "Water intake",
    hint: "Total fluid intake for the day, in millilitres.",
    primary: { label: "Intake", unit: "ml", min: 0, max: 15000, integer: true },
    secondary: null,
    primaryAboveSecondary: false,
  },
  {
    kind: "activity",
    label: "Physical activity",
    hint: "Minutes of activity for the day.",
    primary: { label: "Minutes", unit: "minutes", min: 0, max: 1440, integer: true },
    secondary: null,
    primaryAboveSecondary: false,
  },
  {
    kind: "symptom",
    label: "Symptom",
    hint: "How severe a symptom felt, on a 1 to 10 scale you set yourself.",
    primary: { label: "Severity", unit: "of 10", min: 1, max: 10, integer: true },
    secondary: null,
    primaryAboveSecondary: false,
  },
];

export const KIND_BY_ID: Record<RecordKind, KindSpec> = Object.fromEntries(
  RECORD_KINDS.map((spec) => [spec.kind, spec]),
) as Record<RecordKind, KindSpec>;

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(KIND_BY_ID, value);
}

/** Longest note that can be attached to a record. */
export const NOTE_MAX_CHARS = 280;

export type HealthRecord = {
  id: number;
  kind: RecordKind;
  valuePrimary: number;
  valueSecondary: number | null;
  unit: string;
  measuredAt: string;
  note: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordInput = {
  kind: RecordKind;
  valuePrimary: number;
  valueSecondary?: number | null;
  measuredAt: string;
  note?: string | null;
};

/** Rounds a stored value to the precision its kind is recorded at. */
export function roundForKind(spec: KindSpec, value: number): number {
  return spec.primary.integer ? Math.round(value) : Math.round(value * 10) / 10;
}

/** Human-readable value with the unit, e.g. `128/82 mmHg`. */
export function formatReading(record: HealthRecord): string {
  const spec = KIND_BY_ID[record.kind];
  if (record.valueSecondary !== null && spec.secondary) {
    return `${record.valuePrimary}/${record.valueSecondary} ${spec.primary.unit}`;
  }
  return `${record.valuePrimary} ${spec.primary.unit}`;
}
