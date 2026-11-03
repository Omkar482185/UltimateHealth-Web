"use client";

import { useId, useState } from "react";

import { AnswerBody, CitationList } from "@/components/AnswerBody";
import {
  SYMPTOM_OPTIONS,
  type FollowUpAnswer,
} from "@/lib/rag/guidance-content";
import type { GuidanceResult } from "@/lib/rag/guidance";

const CARE_LEVEL_CLASS: Record<GuidanceResult["careLevel"], string> = {
  emergency: "notice notice--danger",
  "medical-review": "notice notice--warning",
  monitor: "notice notice--info",
};

/**
 * "I do not know" is offered everywhere rather than for selected questions only, and
 * it is stored as its own answer rather than as a no. A question someone could not
 * answer has not thereby become a negative finding.
 */
const ANSWER_LABELS: Record<FollowUpAnswer, string> = {
  yes: "Yes",
  no: "No",
  unknown: "I do not know",
};

const ANSWER_ORDER: FollowUpAnswer[] = ["yes", "no", "unknown"];

export function GuidanceForm() {
  const [selected, setSelected] = useState<string[]>([]);
  const [readingText, setReadingText] = useState("");
  const [measuredAt, setMeasuredAt] = useState<"clinic" | "home" | "unknown">("unknown");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, FollowUpAnswer>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const groupId = useId();

  const pending = result?.followUpQuestions ?? [];
  const allAnswered = pending.every((q) => answers[q.id] !== undefined);
  const pendingRounds = Array.from(new Set(pending.map((q) => q.round))).sort();
  // Round 2 exists only because of a round-1 answer, so when that is all that is left
  // the heading says so rather than claiming these came from the symptoms.
  const isFollowOn = pendingRounds.length === 1 && pendingRounds[0] === 2;

  /**
   * The workflow the reader is inside, for the progress rail only. It does not feed
   * any decision: the care level still comes from the server's fixed rules, and this
   * value only says which of four stages is being shown.
   */
  const stage = result ? (pending.length > 0 ? 3 : 4) : 2;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
    // The clarifying questions are chosen from the symptoms, so an answer given for
    // one selection must not carry into another. Without this, answering yes to a
    // headache question and then changing the symptom list would escalate a
    // submission that was never asked that question.
    setAnswers({});
  }

  async function send(
    followUpResponses: { id: string; answer: FollowUpAnswer }[],
    keepResult = false,
  ) {
    if (loading) return;

    setLoading(true);
    setError(null);
    // The clarifying round keeps the current result on screen while it updates,
    // so the page does not collapse under the person mid-read. A fresh submission
    // clears it, because the previous result no longer describes what was asked.
    if (!keepResult) setResult(null);

    try {
      const response = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptomIds: selected,
          followUpResponses:
            followUpResponses.length > 0 ? followUpResponses : undefined,
          readingText: readingText.trim() || undefined,
          measuredAt: readingText.trim().length > 0 ? measuredAt : undefined,
          duration: duration.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "The request could not be completed.");
        return;
      }
      setResult(data as GuidanceResult);
    } catch {
      setError(
        "The request could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (selected.length === 0 && readingText.trim().length === 0) {
      setError(
        "Select at least one item or enter a blood pressure reading so there is something to assess.",
      );
      return;
    }

    setAnswers({});
    await send([], false);
  }

  async function submitFollowUps() {
    if (!allAnswered || loading) return;
    // Every answer given so far is resent, not only the round being shown. That is
    // what lets the server select the next question from the previous answer while
    // still knowing that round 1 is settled.
    await send(
      Object.entries(answers).map(([id, answer]) => ({ id, answer })),
      true,
    );
  }

  return (
    <div className="stack">
      <ol className="steps" aria-label="Guidance progress">
        {[
          "Warning-sign check",
          "Symptoms and reading",
          "Clarifying questions",
          "Guidance and sources",
        ].map((label, index) => {
          const number = index + 1;
          const state =
            number === stage ? "current" : number < stage ? "done" : undefined;
          return (
            <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="steps__num" aria-hidden="true">
                {number < stage ? "✓" : number}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <form className="card stack" onSubmit={submit} noValidate>
        <div>
          <p className="kicker">Step 2</p>
          <h2 style={{ fontSize: "1.4rem", marginTop: "var(--space-1)" }}>
            Symptoms and reading
          </h2>
          <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
            Nothing entered here is stored. The assessment runs on the server and the
            response is not saved to your account.
          </p>
        </div>
        <fieldset
          style={{ border: 0, margin: 0, padding: 0 }}
          aria-describedby={`${groupId}-hint`}
        >
          <legend className="field__label">
            Which of these apply to you right now?
          </legend>
          <span className="field__hint" id={`${groupId}-hint`}>
            Select everything that applies. The list is deliberately broad so that
            warning signs are hard to miss.
          </span>
          <div className="checkbox-grid">
            {SYMPTOM_OPTIONS.map((option) => (
              <label className="checkbox" key={option.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid-2" style={{ marginTop: "var(--space-5)" }}>
          <div className="field">
            <label className="field__label" htmlFor="reading">
              Blood pressure reading (optional)
            </label>
            <span className="field__hint" id="reading-hint">
              For example 148/92. Leave blank if you do not have a reading. A
              single reading is not a diagnosis.
            </span>
            <input
              className="input"
              id="reading"
              name="reading"
              value={readingText}
              onChange={(e) => setReadingText(e.target.value)}
              aria-describedby="reading-hint"
              inputMode="numeric"
              maxLength={60}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="measured-at">
              Where was the reading taken?
            </label>
            <span className="field__hint" id="measured-at-hint">
              The threshold is different at home (135/85) than in a clinic
              (140/90), so this changes how the reading is interpreted.
            </span>
            <select
              className="input"
              id="measured-at"
              name="measuredAt"
              value={measuredAt}
              onChange={(e) =>
                setMeasuredAt(e.target.value as "clinic" | "home" | "unknown")
              }
              aria-describedby="measured-at-hint"
            >
              <option value="unknown">Clinic or not sure</option>
              <option value="clinic">In a clinic or by a health professional</option>
              <option value="home">At home with my own monitor</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="duration">
              How long has this been going on? (optional)
            </label>
            <input
              className="input"
              id="duration"
              name="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              maxLength={120}
              placeholder="For example: two days"
            />
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="notes">
            Anything else worth noting (optional)
          </label>
          <span className="field__hint" id="notes-hint">
            Do not include identifying details. This text is used to check for
            emergency warning signs and to select relevant sources.
          </span>
          <textarea
            className="textarea"
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-describedby="notes-hint"
            maxLength={600}
          />
        </div>

        <div className="row row--between">
          <p className="meta" style={{ margin: 0 }}>
            Answering is not a diagnosis. The next stage asks only what these answers
            require.
          </p>
          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Checking warning signs and sources" : "Get guidance"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="notice notice--danger" role="alert">
          <p className="notice__title">That submission could not be processed</p>
          <p style={{ marginBottom: "var(--space-3)" }}>{error}</p>
          <button className="btn" type="button" onClick={() => setError(null)}>
            Dismiss and edit
          </button>
        </div>
      ) : null}

      <div aria-live="polite">
        {loading ? (
          <p className="loading-state" role="status">
            <span className="loading-state__dot" aria-hidden="true" />
            Running the warning-sign check, then retrieving relevant sources.
          </p>
        ) : null}

        {result ? (
          <div className="stack">
            {pending.length > 0 ? (
              <section
                className="notice notice--info"
                aria-labelledby="follow-up-heading"
              >
                <p className="notice__title" id="follow-up-heading">
                  {isFollowOn
                    ? pending.length === 1
                      ? "One more question, because of your last answer"
                      : `${pending.length} more questions, because of your answers`
                    : pending.length === 1
                      ? "One question about what you selected"
                      : `${pending.length} questions about what you selected`}
                </p>
                <p>
                  {isFollowOn
                    ? "These follow from the answer you gave, not from the symptoms alone. "
                    : "These were chosen from the symptoms you reported. "}
                  The care level below already applies and still applies. Answering
                  can raise it, and nothing you answer here can lower it. If you
                  cannot answer one, say so: an unanswered question is not treated
                  as a no.
                </p>

                {pending.map((question) => (
                  <fieldset
                    key={question.id}
                    style={{
                      border: 0,
                      margin: 0,
                      padding: 0,
                      marginBottom: "var(--space-4)",
                    }}
                  >
                    <legend style={{ fontWeight: 600 }}>{question.label}</legend>
                    {question.why ? (
                      <p className="meta" style={{ marginTop: "var(--space-1)" }}>
                        <strong>Why this is being asked:</strong> {question.why}
                      </p>
                    ) : null}
                    <p className="meta" style={{ marginTop: "var(--space-1)" }}>
                      {question.detail}
                    </p>
                    <div className="checkbox-grid">
                      {ANSWER_ORDER.map((value) => (
                        <label className="checkbox" key={value}>
                          <input
                            type="radio"
                            name={`follow-up-${question.id}`}
                            checked={answers[question.id] === value}
                            onChange={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: value,
                              }))
                            }
                          />
                          <span>{ANSWER_LABELS[value]}</span>
                        </label>
                      ))}
                    </div>
                    {question.sources.length > 0 ? (
                      <p className="meta" style={{ marginBottom: 0 }}>
                        Source:{" "}
                        <a
                          href={question.sources[0].sourceUrl}
                          rel="noreferrer"
                        >
                          {question.sources[0].documentTitle}
                        </a>
                      </p>
                    ) : null}
                  </fieldset>
                ))}

                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={submitFollowUps}
                  disabled={loading || !allAnswered}
                >
                  {loading ? "Updating guidance" : "Update guidance"}
                </button>
                {!allAnswered ? (
                  <p className="meta" style={{ marginBottom: 0 }}>
                    Answer every question to update the guidance.
                  </p>
                ) : null}
              </section>
            ) : null}

            {/*
              The care level is deliberately the first thing in the result. The
              written sections below follow an order that would put "what your answers
              may indicate" above it, and that order is wrong for a reader who has just
              described a warning sign: the instruction not to wait has to come before
              any explanation of the general information.
            */}
            <h2 style={{ fontSize: "1.2rem", marginBottom: 0 }}>Recommended next step</h2>
            <div className={CARE_LEVEL_CLASS[result.careLevel]}>
              <p className="notice__title">{result.careLevelLabel}</p>
              <p>{result.careLevelExplanation}</p>

              {result.emergency ? (
                <ul>
                  {result.emergency.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : null}

              {result.reasons.length > 0 ? (
                <>
                  <h3 style={{ fontSize: "1rem" }}>
                    Why this recommendation is being made
                  </h3>
                  <ul>
                    {result.reasons.map((reason) => (
                      <li key={reason.text}>
                        {reason.text}
                        {reason.sourceIds.length > 0 ? (
                          <span className="meta">
                            {" "}
                            (thresholds documented in{" "}
                            {reason.sourceIds.join(", ")})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <p className="meta" style={{ marginBottom: 0 }}>
                Care level {result.careLevel} produced by fixed rules in{" "}
                <span className="mono">
                  {result.latencyMs < 1 ? "under 1" : result.latencyMs} ms
                </span>
                , without involving a language model.
              </p>
            </div>

            {result.reading ? (
              <p className="meta">
                Reading parsed as{" "}
                <span className="mono">
                  {result.reading.systolic}/{result.reading.diastolic}
                </span>{" "}
                (entered as &ldquo;{result.reading.raw}&rdquo;), compared against
                the{" "}
                {result.measuredAt === "home"
                  ? "at-home threshold 135/85"
                  : result.measuredAt === "clinic"
                    ? "clinic threshold 140/90"
                    : "clinic threshold 140/90, because the location was not specified"}
                .
              </p>
            ) : readingText.trim().length > 0 ? (
              <div className="notice notice--warning">
                <p className="notice__title">Reading not understood</p>
                <p style={{ margin: 0 }}>
                  &ldquo;{readingText}&rdquo; could not be parsed as a systolic and
                  diastolic pair. Enter it in the form 148/92 if you want it
                  considered.
                </p>
              </div>
            ) : null}

            {result.urgentReviewSigns.length > 0 ? (
              <section className="panel">
                <h2 style={{ fontSize: "1.1rem" }}>
                  Get advice the same day, rather than waiting
                </h2>
                <p className="meta">
                  These are below the emergency threshold but are not "wait and
                  see" either.
                </p>
                <ul>
                  {result.urgentReviewSigns.map((sign) => (
                    <li key={sign.text} style={{ marginBottom: "var(--space-2)" }}>
                      {sign.text}
                      {sign.sources.length > 0 ? (
                        <span className="meta">
                          {" "}
                          (source:{" "}
                          <a href={sign.sources[0].sourceUrl} rel="noreferrer">
                            {sign.sources[0].documentTitle}
                          </a>
                          )
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {result.emergencySources && result.emergencySources.length > 0 ? (
              <CitationList
                citations={result.emergencySources}
                anchorPrefix="gemg"
                heading="Sources for these warning signs"
              />
            ) : null}

            {result.explanation ? (
              <div className="stack">
                <h2 style={{ fontSize: "1.2rem" }}>What your answers may indicate</h2>
                <p className="meta" style={{ margin: 0 }}>
                  General information from the source documents below, in the words of the
                  retrieved passages. It is not a diagnosis and it does not say what is
                  causing anything you described.
                </p>
                <div className="answer card">
                  <AnswerBody text={result.explanation.text} citations={result.explanation.citations} />
                </div>
                {result.explanation.stripped > 0 ? (
                  <p className="meta">
                    {result.explanation.stripped} citation
                    {result.explanation.stripped === 1 ? "" : "s"} produced by the
                    model did not resolve to a retrieved passage and were removed.
                  </p>
                ) : null}
                <CitationList citations={result.explanation.citations} />
              </div>
            ) : null}

            {result.notice ? (
              <div className="notice notice--info">
                <p className="notice__title">Note</p>
                <p style={{ margin: 0 }}>{result.notice}</p>
              </div>
            ) : null}

            {result.selfCare.length > 0 ? (
              <section className="panel">
                <h2 style={{ fontSize: "1.1rem" }}>What you can do now</h2>
                <p className="meta">
                  General measures, each restating what the cited source document says.
                  They are habits the sources associate with lower blood pressure across
                  populations, not a plan or a target for you.
                </p>
                <ul>
                  {result.selfCare.map((item) => (
                    <li key={item.text} style={{ marginBottom: "var(--space-2)" }}>
                      {item.text}
                      {item.sources.length > 0 ? (
                        <span className="meta">
                          {" "}
                          (sources:{" "}
                          {item.sources.map((source, index) => (
                            <span key={source.sourceUrl}>
                              {index > 0 ? ", " : ""}
                              <a href={source.sourceUrl} rel="noreferrer">
                                {source.documentTitle}
                              </a>
                            </span>
                          ))}
                          )
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="panel">
              <h2 style={{ fontSize: "1.1rem" }}>When to seek further help</h2>
              <p className="meta">
                Warning signs to act on, each with the source that documents it.
              </p>
              <ul>
                {result.warningSigns.map((sign) => (
                  <li key={sign.text} style={{ marginBottom: "var(--space-3)" }}>
                    {sign.text}
                    {sign.sources.length > 0 ? (
                      <span className="meta">
                        {" "}
                        (sources:{" "}
                        {sign.sources.map((source, index) => (
                          <span key={source.sourceUrl}>
                            {index > 0 ? ", " : ""}
                            <a href={source.sourceUrl} rel="noreferrer">
                              {source.documentTitle}
                            </a>
                          </span>
                        ))}
                        )
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2 style={{ fontSize: "1.1rem" }}>
                How a reading is measured and confirmed
              </h2>
              <ul>
                {result.measurementNotes.map((note) => (
                  <li key={note.text} style={{ marginBottom: "var(--space-2)" }}>
                    {note.text}
                    {note.sources.length > 0 ? (
                      <span className="meta">
                        {" "}
                        (sources:{" "}
                        {note.sources.map((source, index) => (
                          <span key={source.sourceUrl}>
                            {index > 0 ? ", " : ""}
                            <a href={source.sourceUrl} rel="noreferrer">
                              {source.documentTitle}
                            </a>
                          </span>
                        ))}
                        )
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.1rem" }}>
                Why symptoms cannot answer this
              </h2>
              <ul>
                {result.symptomAssessmentLimits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "1.1rem" }}>
                Things associated with raised blood pressure
              </h2>
              <p className="meta">
                These are associations the sources describe across populations.
                They are not a personal risk score, and this page does not compute
                one.
              </p>
              <ul>
                {result.riskFactors.map((factor) => (
                  <li key={factor.text} style={{ marginBottom: "var(--space-2)" }}>
                    {factor.text}
                    {factor.sources.length > 0 ? (
                      <span className="meta">
                        {" "}
                        (sources:{" "}
                        {factor.sources.map((source, index) => (
                          <span key={source.sourceUrl}>
                            {index > 0 ? ", " : ""}
                            <a href={source.sourceUrl} rel="noreferrer">
                              {source.documentTitle}
                            </a>
                          </span>
                        ))}
                        )
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            {result.pathway.length > 0 ? (
              <section className="panel">
                <h2 style={{ fontSize: "1.1rem" }}>
                  How your clarifying answers were used
                </h2>
                <ul>
                  {result.pathway.map((step) => (
                    <li key={step.questionId}>
                      {step.label}{" "}
                      <strong>{ANSWER_LABELS[step.answer]}</strong>{" "}
                      <span className="meta">
                        (round {step.round}
                        {step.declaredRuleId
                          ? `, declared the warning-sign rule `
                          : ", declared no warning-sign rule"}
                        {step.declaredRuleId ? (
                          <span className="mono">{step.declaredRuleId}</span>
                        ) : null}
                        )
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="meta" style={{ marginBottom: 0 }}>
                  A yes-answer to any of these is treated as a warning sign and
                  escalates to emergency care. A no and an "I do not know" declare
                  nothing: no answer to these questions can lower the care level
                  above. This record holds question identifiers and answers only,
                  with none of your free text.
                </p>
              </section>
            ) : null}

            <section>
              <h2 style={{ fontSize: "1.1rem" }}>
                Worth having ready for your appointment
              </h2>
              <ul>
                {result.followUpNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p className="meta">
                These are preparation notes rather than questions. One round of
                questions specific to the symptoms selected is asked above, and no
                follow-up is asked once a warning sign has been reported.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "1.1rem" }}>Limitations of this page</h2>
              <ul>
                {result.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>

            {result.reportedSymptoms.length > 0 ? (
              <details className="panel">
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                  What you submitted
                </summary>
                <ul style={{ marginTop: "var(--space-3)" }}>
                  {result.reportedSymptoms.map((symptom) => (
                    <li key={symptom}>{symptom}</li>
                  ))}
                </ul>
                <p className="meta" style={{ marginBottom: 0 }}>
                  Retrieved passages: {result.retrieval.evidenceCount} from{" "}
                  {result.retrieval.distinctSources} documents. Highest similarity{" "}
                  <span className="mono">{result.retrieval.topCosine.toFixed(3)}</span>.
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
