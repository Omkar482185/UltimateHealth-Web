"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CitationList } from "@/components/AnswerBody";
import { EMERGENCY_QUESTIONS } from "@/lib/rag/guidance-content";
import {
  EMERGENCY_MESSAGE,
  EMERGENCY_STEPS,
  SAFETY_RULES,
  screenForEmergency,
  type SafetyScreenResult,
} from "@/lib/rag/safety";
import type { GuidanceResult } from "@/lib/rag/guidance";

/**
 * Step one of the guidance workflow: the emergency screen.
 *
 * Three properties matter here and each is deliberate.
 *
 * **It runs first, and escalation takes no further questions.** Ticking any box
 * escalates immediately. There is no "next" to press and no routine question
 * between the warning sign and the instruction, because delay is the harm.
 *
 * **Escalation does not wait for the network.** `screenForEmergency` is a pure
 * function with no imports, so it runs in the browser: the matched rule and the
 * fixed instructions below are produced locally, with no round trip and no
 * language model. The request that follows only adds source citations, and its
 * failure is reported as a missing citation list rather than as a blocked
 * emergency.
 *
 * **The server is still the authority.** The yes-answers are sent as rule ids and
 * re-screened server-side, so a modified client cannot skip the screen, and the
 * form that follows re-screens everything the person types as well.
 */
export function EmergencyGate({ children }: { children: React.ReactNode }) {
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [screen, setScreen] = useState<SafetyScreenResult | null>(null);
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [citationError, setCitationError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const requestedRef = useRef(0);

  const escalate = useCallback(async (ids: string[]) => {
    // Built from the rule table rather than from a text match, because each
    // question *is* a warning sign: a ticked box is a yes-answer to the rule, so
    // escalation cannot depend on the question's wording happening to match a
    // pattern. The screen is still run over the wording as a cross-check, and a
    // unit check asserts the two always agree, so the representations cannot
    // drift apart without a check failing.
    const rules = ids
      .map((id) => SAFETY_RULES.find((rule) => rule.id === id))
      .filter((rule): rule is (typeof SAFETY_RULES)[number] => Boolean(rule));
    const crossCheckText = ids
      .map((id) => EMERGENCY_QUESTIONS.find((q) => q.id === id)?.detail ?? id)
      .join(" ");
    const crossCheck = screenForEmergency(crossCheckText);

    const local: SafetyScreenResult = {
      isEmergency: true,
      matchedRules: rules.map((rule) => ({
        id: rule.id,
        label: rule.label,
        triggeredBy:
          crossCheck.matchedRules.find((m) => m.id === rule.id)?.triggeredBy ??
          "reported in step 1",
      })),
      message: EMERGENCY_MESSAGE,
      steps: EMERGENCY_STEPS,
      sourceIds: Array.from(new Set(rules.flatMap((rule) => rule.sourceIds))),
    };
    setScreen(local);
    setCleared(false);
    setResult(null);
    setCitationError(null);

    const requestId = requestedRef.current + 1;
    requestedRef.current = requestId;

    try {
      const response = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptomIds: [], emergencySignIds: ids }),
      });
      // A later tick supersedes this response, so a stale one is discarded rather
      // than replacing the current citations.
      if (requestedRef.current !== requestId) return;
      const text = await response.text();
      const parsed = JSON.parse(text) as GuidanceResult | { error?: string };
      if (!response.ok) {
        setCitationError(
          "error" in parsed && parsed.error
            ? String(parsed.error)
            : `The server returned status ${response.status}.`,
        );
        return;
      }
      setResult(parsed as GuidanceResult);
    } catch {
      if (requestedRef.current !== requestId) return;
      setCitationError(
        "The request for the supporting sources did not reach the server. The instructions above come from the built-in rule set and are unaffected.",
      );
    }
  }, []);

  // Move focus to the instruction so a keyboard or screen-reader user is taken
  // straight to it rather than being left on the checkbox they just ticked.
  useEffect(() => {
    if (screen?.isEmergency) noticeRef.current?.focus();
  }, [screen]);

  function toggle(id: string) {
    const next = answeredIds.includes(id)
      ? answeredIds.filter((value) => value !== id)
      : [...answeredIds, id];
    setAnsweredIds(next);
    if (next.length > 0) {
      void escalate(next);
    } else {
      setScreen(null);
      setResult(null);
      setCitationError(null);
    }
  }

  if (cleared) return <>{children}</>;

  if (screen?.isEmergency) {
    return (
      <div className="stack">
        <div
          className="notice notice--danger"
          role="alert"
          tabIndex={-1}
          ref={noticeRef}
          aria-labelledby="emergency-gate-heading"
        >
          <p className="notice__title" id="emergency-gate-heading">
            {EMERGENCY_MESSAGE}
          </p>
          <p>Do not carry on with this form. Read this first.</p>
          <ol style={{ marginBottom: 0 }}>
            {EMERGENCY_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <section className="panel stack-tight">
          <h2 className="panel-title">
            Which of your answers produced this
          </h2>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {screen.matchedRules.map((rule) => (
              <li key={rule.id}>
                {rule.label}
                <span className="meta"> — matched on &ldquo;{rule.triggeredBy}&rdquo;</span>
              </li>
            ))}
          </ul>
          <p className="meta" style={{ margin: 0 }}>
            The screen is a fixed set of rules over the words you selected. It is
            deliberately broad: it will alert you in situations that turn out not to be
            an emergency. It is not a diagnosis and cannot tell you what is wrong.
          </p>
        </section>

        {result?.emergencySources && result.emergencySources.length > 0 ? (
          <CitationList
            citations={result.emergencySources}
            anchorPrefix="gemerg"
            heading="Sources for these warning signs"
          />
        ) : citationError ? (
          <p className="meta" role="status">
            {citationError}
          </p>
        ) : (
          <p className="meta" role="status">
            Loading the published sources behind these warning signs. The instructions
            above do not depend on them.
          </p>
        )}

        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() => {
              setAnsweredIds([]);
              setScreen(null);
              setResult(null);
              setCitationError(null);
            }}
          >
            Start again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <h2 className="panel-title">
          Step 1: check for warning signs
        </h2>
        <p className="meta" style={{ margin: 0 }}>
          These are the signs that make raised blood pressure an emergency rather than
          something to raise at a routine appointment. Answering yes to any of them
          shows urgent instructions straight away, and that happens before any other
          question is asked.
        </p>

        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="field__label" style={{ marginBottom: "var(--space-3)" }}>
            Have you noticed any of these? Tick every one that applies.
          </legend>
          <div className="stack-tight">
            {EMERGENCY_QUESTIONS.map((question) => (
              <label className="checkbox" key={question.id}>
                <input
                  type="checkbox"
                  checked={answeredIds.includes(question.id)}
                  onChange={() => toggle(question.id)}
                />
                <span>
                  <strong>{question.label}</strong>
                  <span className="field__hint" style={{ display: "block" }}>
                    {question.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="meta" style={{ margin: 0 }}>
          If none of these applies, continue and the form will ask about your reading
          and any other symptoms. If you are unsure, treat it as an emergency and seek
          advice rather than continuing here.
        </p>

        <div className="row">
          <button
            className="btn btn--primary"
            type="button"
            disabled={answeredIds.length > 0}
            onClick={() => {
              setCleared(true);
              // The second step begins at the top of the form, so a reader is not
              // dropped into the middle of it.
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
          >
            None of these apply — continue
          </button>
          {answeredIds.length > 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              Clear the ticks above to continue to the form.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
