import type { Trend } from "@/lib/health/trends";

/**
 * A trend chart drawn as plain SVG.
 *
 * Three deliberate choices:
 *
 *  - No charting dependency. The whole figure is a path and some circles, which
 *    is a fraction of the weight of a library and leaves nothing to keep patched.
 *  - No interpretation. The chart plots recorded values against time; it draws no
 *    trend line, no target band and no reference range, because deciding whether a
 *    reading is good or bad is a clinical judgement this project does not make.
 *  - The numbers are always available. The same data is rendered as a real table
 *    inside a `<details>` element, so the chart supplements the figures rather
 *    than replacing them for anyone who cannot use a graphic.
 */

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 18, bottom: 30, left: 56 };

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function TrendChart({ trend }: { trend: Trend }) {
  const { points, primary, secondary } = trend;
  const hasSecondary = trend.secondaryLabel !== null;

  // Every plotted value, so one shared scale covers both series. A second scale
  // would let the two lines cross visually where they do not in fact cross.
  const values: number[] = [];
  for (const point of points) {
    values.push(point.primary);
    if (point.secondary !== null) values.push(point.secondary);
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A flat series would otherwise divide by zero; widen it so the line sits mid-height.
  const min = rawMin === rawMax ? rawMin - 1 : rawMin;
  const max = rawMin === rawMax ? rawMax + 1 : rawMax;
  const pad = (max - min) * 0.08;
  const yMin = min - pad;
  const yMax = max + pad;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const times = points.map((point) => Date.parse(point.measuredAt));
  const t0 = times[0] ?? 0;
  const t1 = times[times.length - 1] ?? 0;
  const span = t1 - t0;

  const xFor = (index: number): number => {
    if (points.length === 1) return PAD.left + plotWidth / 2;
    // With every reading at the same instant, spacing by index is the only
    // arrangement that does not stack the points on one vertical line.
    const fraction = span > 0 ? (times[index]! - t0) / span : index / (points.length - 1);
    return PAD.left + fraction * plotWidth;
  };

  const yFor = (value: number): number =>
    PAD.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

  const lineFor = (selector: (point: Trend["points"][number]) => number | null): string =>
    points
      .map((point, index) => ({ x: xFor(index), y: selector(point) }))
      .filter((p): p is { x: number; y: number } => p.y !== null)
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${yFor(p.y).toFixed(1)}`)
      .join(" ");

  const gridValues = [yMin, (yMin + yMax) / 2, yMax];

  const summary =
    primary === null
      ? "No readings to plot."
      : hasSecondary && secondary !== null
        ? `${trend.label} readings, ${points.length} of them, from ${formatDate(points[0]!.measuredAt)} to ${formatDate(points[points.length - 1]!.measuredAt)}. ${trend.secondaryLabel} ranges from ${formatValue(secondary.min)} to ${formatValue(secondary.max)}.`
        : `${trend.label} readings, ${points.length} of them, from ${formatDate(points[0]!.measuredAt)} to ${formatDate(points[points.length - 1]!.measuredAt)}, ranging from ${formatValue(primary.min)} to ${formatValue(primary.max)} ${trend.unit}.`;

  return (
    <div className="chart">
      <div className="chart__head">
        <h4 className="chart__title">{trend.label}</h4>
        <p className="meta" style={{ margin: 0 }}>
          {points.length} recorded {points.length === 1 ? "reading" : "readings"}
          {trend.spanDays !== null && trend.spanDays > 0
            ? ` over ${trend.spanDays} ${trend.spanDays === 1 ? "day" : "days"}`
            : ""}
        </p>
      </div>

      {points.length === 1 ? (
        <p className="meta">
          A line needs at least two readings. The single value you have recorded is in
          the table below.
        </p>
      ) : null}

      {points.length >= 2 ? (
        <svg
          className="chart__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={summary}
        >
          {gridValues.map((value, index) => (
            <g key={index}>
              <line
                x1={PAD.left}
                y1={yFor(value)}
                x2={WIDTH - PAD.right}
                y2={yFor(value)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yFor(value) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
              >
                {formatValue(Math.round(value * 10) / 10)}
              </text>
            </g>
          ))}

          {hasSecondary ? (
            <path
              d={lineFor((point) => point.secondary)}
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinejoin="round"
            />
          ) : null}

          <path
            d={lineFor((point) => point.primary)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((point, index) => (
            <g key={`${point.measuredAt}-${index}`}>
              <circle
                cx={xFor(index)}
                cy={yFor(point.primary)}
                r="3"
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth="1.5"
              >
                <title>{`${formatDate(point.measuredAt)}: ${formatValue(point.primary)} ${trend.unit}`}</title>
              </circle>
              {hasSecondary && point.secondary !== null ? (
                <circle
                  cx={xFor(index)}
                  cy={yFor(point.secondary)}
                  r="2.5"
                  fill="var(--surface)"
                  stroke="var(--text-secondary)"
                  strokeWidth="1.2"
                >
                  <title>{`${formatDate(point.measuredAt)}: ${formatValue(point.secondary)} ${trend.secondaryUnit ?? ""}`}</title>
                </circle>
              ) : null}
            </g>
          ))}

          <text
            x={PAD.left}
            y={HEIGHT - 8}
            fontSize="11"
            fill="var(--text-muted)"
            textAnchor="start"
          >
            {formatDate(points[0]!.measuredAt)}
          </text>
          <text
            x={WIDTH - PAD.right}
            y={HEIGHT - 8}
            fontSize="11"
            fill="var(--text-muted)"
            textAnchor="end"
          >
            {formatDate(points[points.length - 1]!.measuredAt)}
          </text>
        </svg>
      ) : null}

      <p className="chart__legend meta">
        <span className="chart__key chart__key--primary" aria-hidden="true" />
        {trend.label} ({trend.unit})
        {hasSecondary ? (
          <>
            {" · "}
            <span className="chart__key chart__key--secondary" aria-hidden="true" />
            {trend.secondaryLabel} ({trend.secondaryUnit})
          </>
        ) : null}
      </p>

      <details className="chart__table">
        <summary>Show the numbers behind this chart</summary>
        <div style={{ overflowX: "auto" }}>
          <table className="table table--numeric">
            <caption className="visually-hidden">
              {trend.label} readings you recorded, most recent first
            </caption>
            <thead>
              <tr>
                <th scope="col">Taken</th>
                <th scope="col">
                  {trend.label} ({trend.unit})
                </th>
                {hasSecondary ? (
                  <th scope="col">
                    {trend.secondaryLabel} ({trend.secondaryUnit})
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {points
                .map((point, index) => ({ point, index }))
                .reverse()
                .map(({ point, index }) => (
                  <tr key={`${point.measuredAt}-${index}`}>
                    <td className="nowrap">
                      {formatDate(point.measuredAt)}
                      <span className="meta">
                        {" "}
                        {new Date(point.measuredAt).toISOString().slice(11, 16)}
                      </span>
                    </td>
                    <td>{formatValue(point.primary)}</td>
                    {hasSecondary ? (
                      <td>{point.secondary === null ? "—" : formatValue(point.secondary)}</td>
                    ) : null}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
