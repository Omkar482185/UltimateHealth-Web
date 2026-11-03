/**
 * Trend arithmetic.
 *
 * Pure functions over records that have already been read from the database, so
 * this module is safe to import from a client component. It is deliberately
 * separate from `lib/health/records.ts`, which opens SQLite.
 *
 * Everything here is descriptive. There is no direction, no threshold and no
 * comparison against any reference range, because each of those would be an
 * interpretation this project is not in a position to make. `difference` is the
 * subtraction of two numbers the person recorded and nothing more.
 */
import {
  KIND_BY_ID,
  RECORD_KINDS,
  type HealthRecord,
  type RecordKind,
} from "@/lib/health/kinds";

export type TrendPoint = {
  measuredAt: string;
  primary: number;
  secondary: number | null;
};

export type SeriesStats = {
  min: number;
  max: number;
  mean: number;
  /** Earliest reading in the window. */
  first: number;
  /** Most recent reading in the window. */
  last: number;
  /** `last - first`. A difference between two recorded numbers, nothing more. */
  difference: number;
};

export type Trend = {
  kind: RecordKind;
  label: string;
  unit: string;
  secondaryLabel: string | null;
  secondaryUnit: string | null;
  /** Ascending by time, so a chart can plot it directly. */
  points: TrendPoint[];
  primary: SeriesStats | null;
  secondary: SeriesStats | null;
  spanDays: number | null;
};

function stats(values: number[]): SeriesStats | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: Math.round((sum / values.length) * 10) / 10,
    first,
    last,
    difference: Math.round((last - first) * 10) / 10,
  };
}

export function buildTrend(records: HealthRecord[], kind: RecordKind): Trend {
  const spec = KIND_BY_ID[kind];
  const forKind = records
    .filter((record) => record.kind === kind)
    .slice()
    .sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));

  const points: TrendPoint[] = forKind.map((record) => ({
    measuredAt: record.measuredAt,
    primary: record.valuePrimary,
    secondary: record.valueSecondary,
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const spanDays =
    points.length >= 2 && first && last
      ? Math.round((Date.parse(last.measuredAt) - Date.parse(first.measuredAt)) / 86_400_000)
      : null;

  return {
    kind,
    label: spec.label,
    unit: spec.primary.unit,
    secondaryLabel: spec.secondary?.label ?? null,
    secondaryUnit: spec.secondary?.unit ?? null,
    points,
    primary: stats(points.map((p) => p.primary)),
    secondary: spec.secondary
      ? stats(
          points
            .map((p) => p.secondary)
            .filter((value): value is number => value !== null),
        )
      : null,
    spanDays,
  };
}

/** One trend per kind that actually has records, in the canonical kind order. */
export function buildTrends(records: HealthRecord[]): Trend[] {
  return RECORD_KINDS.filter((spec) =>
    records.some((record) => record.kind === spec.kind),
  ).map((spec) => buildTrend(records, spec.kind));
}
