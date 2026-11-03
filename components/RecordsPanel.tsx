"use client";

import Link from "next/link";
import { useState } from "react";

import { TrendChart } from "@/components/TrendChart";
import {
  formatReading,
  KIND_BY_ID,
  RECORD_KINDS,
  type HealthRecord,
  type RecordKind,
} from "@/lib/health/kinds";
import type { Trend } from "@/lib/health/trends";

type Props = {
  initialRecords: HealthRecord[];
  initialTrends: Trend[];
  /** The most records the server loaded; stated on screen rather than implied. */
  loadedCap: number;
};

const RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

/** `datetime-local` needs a local-time string, not a UTC ISO one. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Health records panel.
 *
 * The list rendered on the server is the first paint; every change afterwards goes
 * through the real JSON endpoints and then re-reads the list from the database, so
 * what is on screen is what is stored rather than an optimistic guess. A failure
 * leaves the previous data in place and shows the server's own message.
 */
export function RecordsPanel({ initialRecords, initialTrends, loadedCap }: Props) {
  const [records, setRecords] = useState<HealthRecord[]>(initialRecords);
  const [trends, setTrends] = useState<Trend[]>(initialTrends);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [filterKind, setFilterKind] = useState<"" | RecordKind>("");
  const [rangeDays, setRangeDays] = useState<string>("");

  const [kind, setKind] = useState<RecordKind>("blood-pressure");
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [measuredAt, setMeasuredAt] = useState(() => toLocalInput(new Date()));
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const spec = KIND_BY_ID[kind];


  async function read(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (!response.ok) {
        const message =
          parsed && typeof parsed === "object" && "error" in parsed
            ? String((parsed as { error: unknown }).error)
            : `The request failed with status ${response.status}.`;
        setError(message);
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setError("The request could not reach the server. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Re-reads the list from the database.
   *
   * `overrides` exists because `setState` does not apply before the next line
   * runs. Reading the filter out of component state straight after calling the
   * setter returned the *previous* filter, so changing a filter refetched with the
   * old one: the list stayed unfiltered while the caption claimed it had been
   * filtered in the database. The caller now passes the value it just chose.
   * `undefined` means "keep the current filter".
   */
  async function reload(
    overrides: { kind?: "" | RecordKind; rangeDays?: string } = {},
  ): Promise<boolean> {
    const activeKind = overrides.kind !== undefined ? overrides.kind : filterKind;
    const activeRange = overrides.rangeDays !== undefined ? overrides.rangeDays : rangeDays;

    const params = new URLSearchParams();
    if (activeKind) params.set("kind", activeKind);
    if (activeRange) {
      params.set(
        "from",
        new Date(Date.now() - Number(activeRange) * 86_400_000).toISOString(),
      );
    }
    const query = params.toString();

    const result = await read("GET", `/api/records${query ? `?${query}` : ""}`);
    if (!result) return false;
    setRecords((result.records as HealthRecord[]) ?? []);
    setTrends((result.trends as Trend[]) ?? []);
    return true;
  }

  function resetForm() {
    setEditingId(null);
    setPrimary("");
    setSecondary("");
    setNote("");
    setMeasuredAt(toLocalInput(new Date()));
  }

  function startEdit(record: HealthRecord) {
    setEditingId(record.id);
    setKind(record.kind);
    setPrimary(String(record.valuePrimary));
    setSecondary(record.valueSecondary === null ? "" : String(record.valueSecondary));
    setNote(record.note ?? "");
    setMeasuredAt(toLocalInput(new Date(record.measuredAt)));
    setError(null);
    setOk(null);
    document.getElementById("record-form")?.scrollIntoView({ block: "start" });
  }

  const filtered = filterKind !== "" || rangeDays !== "";

  return (
    <div className="stack">
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="form__success" role="status">
          {ok}
        </p>
      ) : null}

      <section className="panel stack" id="record-form">
        <h2 className="panel-title">
          {editingId === null ? "Record a measurement" : "Edit this measurement"}
        </h2>

        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = {
              kind,
              valuePrimary: Number(primary),
              valueSecondary: spec.secondary ? Number(secondary) : null,
              measuredAt: new Date(measuredAt).toISOString(),
              note: note.trim() === "" ? null : note.trim(),
            };
            const result =
              editingId === null
                ? await read("POST", "/api/records", body)
                : await read("PUT", `/api/records/${editingId}`, body);
            if (!result) return;
            const refreshed = await reload();
            if (refreshed) {
              setOk(editingId === null ? "Measurement saved." : "Measurement updated.");
              resetForm();
            }
          }}
        >
          <div className="grid-2">
            <label className="field">
              <span className="field__label">What are you recording?</span>
              <select
                className="select"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as RecordKind);
                  setPrimary("");
                  setSecondary("");
                }}
              >
                {RECORD_KINDS.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field__hint">{spec.hint}</span>
            </label>

            <label className="field">
              <span className="field__label">When was it taken?</span>
              <input
                className="input"
                type="datetime-local"
                required
                value={measuredAt}
                onChange={(event) => setMeasuredAt(event.target.value)}
              />
              <span className="field__hint">
                Stored in UTC. Times are shown in UTC as well, so two devices cannot
                disagree about when a reading was taken.
              </span>
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="field__label">
                {spec.primary.label} ({spec.primary.unit})
              </span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                required
                min={spec.primary.min}
                max={spec.primary.max}
                step={spec.primary.integer ? 1 : 0.1}
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              />
              <span className="field__hint">
                Accepted range {spec.primary.min}–{spec.primary.max} {spec.primary.unit}, which
                only catches a typing mistake.
              </span>
            </label>

            {spec.secondary ? (
              <label className="field">
                <span className="field__label">
                  {spec.secondary.label} ({spec.secondary.unit})
                </span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  required
                  min={spec.secondary.min}
                  max={spec.secondary.max}
                  step={spec.secondary.integer ? 1 : 0.1}
                  value={secondary}
                  onChange={(event) => setSecondary(event.target.value)}
                />
                <span className="field__hint">
                  The lower number from the monitor, entered separately so both are
                  recorded as taken.
                </span>
              </label>
            ) : null}
          </div>

          <label className="field">
            <span className="field__label">Note (optional)</span>
            <input
              className="input"
              type="text"
              maxLength={280}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: taken after walking"
            />
            <span className="field__hint">
              Up to 280 characters, attached to this one measurement. Nothing is
              inferred from it.
            </span>
          </label>

          <div className="row">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : editingId === null ? "Save measurement" : "Save changes"}
            </button>
            {editingId !== null ? (
              <button className="btn" type="button" disabled={busy} onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>

        <p className="meta" style={{ margin: 0 }}>
          Nothing here is a diagnosis or an estimate. A record keeps the number you typed
          in, the unit, the time you say it was taken, and the fact that you reported it.
        </p>
      </section>

      <section className="panel stack">
        <h2 className="panel-title">Filters</h2>
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Measurement</span>
            <select
              className="select"
              value={filterKind}
              onChange={async (event) => {
                const value = event.target.value as "" | RecordKind;
                setFilterKind(value);
                await reload({ kind: value });
              }}
            >
              <option value="">All measurements</option>
              {RECORD_KINDS.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Period</span>
            <select
              className="select"
              value={rangeDays}
              onChange={async (event) => {
                const value = event.target.value;
                setRangeDays(value);
                await reload({ rangeDays: value });
              }}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="meta" style={{ margin: 0 }}>
          {records.length} of at most {loadedCap} records shown
          {filtered ? ", after filtering in the database" : ""}. Filters are applied in
          SQL against your records, not by hiding rows on screen.
        </p>
      </section>

      {records.length === 0 ? (
        <section className="panel stack-tight">
          <h2 className="panel-title">
            {filtered ? "No measurements match this filter" : "You have not recorded anything yet"}
          </h2>
          <p style={{ margin: 0 }}>
            {filtered
              ? "Change the filters above to see your other records."
              : "Use the form above to add your first reading. Until you do, there is nothing here and no placeholder data is shown in its place."}
          </p>
        </section>
      ) : null}

      {trends.map((trend) => (
        <section className="panel stack" key={trend.kind}>
          <div className="stat-row">
            <div className="stat">
              <span className="stat__value">{trend.points.length}</span>
              <span className="stat__label">
                {trend.points.length === 1 ? "Recorded reading" : "Recorded readings"}
              </span>
            </div>
            {trend.primary ? (
              <>
                <div className="stat">
                  <span className="stat__value">{formatValue(trend.primary.last)}</span>
                  <span className="stat__label">
                    Most recent, {trend.unit}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__value">
                    {formatValue(trend.primary.min)}–{formatValue(trend.primary.max)}
                  </span>
                  <span className="stat__label">
                    Lowest and highest, {trend.unit}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__value">{formatValue(trend.primary.mean)}</span>
                  <span className="stat__label">
                    Mean of your readings, {trend.unit}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <TrendChart trend={trend} />

          <p className="meta" style={{ margin: 0 }}>
            These figures describe the numbers you entered and nothing else. A mean of a
            few readings is not a clinical measurement, and a change between two readings
            can be the monitor, the cuff, the time of day or the person taking it as easily
            as anything else. Ask a clinician what your readings mean for you.{" "}
            {trend.kind === "blood-pressure" ? (
              <Link href="/guidance">Symptom guidance</Link>
            ) : null}
          </p>
        </section>
      ))}

      {records.length > 0 ? (
        <section className="panel stack">
          <h2 className="panel-title">Every record</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="table table--numeric">
              <caption className="visually-hidden">
                All of your saved measurements, most recent first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Taken</th>
                  <th scope="col">Measurement</th>
                  <th scope="col">Value</th>
                  <th scope="col">Note</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="nowrap">{formatWhen(record.measuredAt)}</td>
                    <td>
                      {KIND_BY_ID[record.kind].label}
                      <div>
                        <span className="tag">Self-reported</span>
                      </div>
                    </td>
                    <td className="nowrap">{formatReading(record)}</td>
                    <td>{record.note ?? "—"}</td>
                    <td>
                      <div className="row">
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(record)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn--danger"
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            const result = await read("DELETE", `/api/records/${record.id}`);
                            if (!result) return;
                            const refreshed = await reload();
                            if (refreshed) {
                              setOk("Record deleted.");
                              if (editingId === record.id) resetForm();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
