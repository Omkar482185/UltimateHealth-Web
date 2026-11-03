import type { Metadata } from "next";
import Link from "next/link";

import { EmergencyGate } from "@/components/EmergencyGate";
import { GuidanceForm } from "@/components/GuidanceForm";
import {
  FOLLOW_UP_NOTES,
  GUIDANCE_LIMITATIONS,
  URGENT_REVIEW_SIGNS,
  WARNING_SIGNS,
} from "@/lib/rag/guidance-content";

export const metadata: Metadata = {
  title: "Symptom guidance",
  description:
    "A short structured check for raised blood pressure that separates emergency warning signs from symptoms worth raising at a routine appointment, with the sources behind each statement.",
};

export const instant = false;

export default function GuidancePage() {
  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Raised blood pressure</p>
          <h1>Symptom guidance</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            Raised blood pressure is common, usually causes no symptoms at all, and
            damages blood vessels, the heart, and the kidneys over years before it is
            noticed. This page separates the warning signs that need emergency care
            from symptoms worth raising at a routine appointment.
          </p>
        </div>

        <div className="notice notice--danger">
          <p className="notice__title">
            If any of the following applies, seek emergency care now
          </p>
          <p>
            Do not complete this form first. Contact your local emergency number or
            go to the nearest emergency department.
          </p>
          <ul style={{ marginBottom: 0 }}>
            {WARNING_SIGNS.map((sign) => (
              <li key={sign.text}>{sign.text}</li>
            ))}
          </ul>
        </div>

        <div className="notice notice--warning">
          <p className="notice__title">
            Get advice the same day if any of these applies
          </p>
          <p>
            These sit below the emergency threshold, but they are not a reason to
            wait either.
          </p>
          <ul style={{ marginBottom: 0 }}>
            {URGENT_REVIEW_SIGNS.map((sign) => (
              <li key={sign.text}>{sign.text}</li>
            ))}
          </ul>
        </div>

        <div className="notice notice--info">
          <p className="notice__title">What this page does and does not do</p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>
              It runs a fixed check for emergency warning signs, then computes a care
              level from the values you enter. Neither step uses a language model.
            </li>
            <li>
              If nothing has escalated, it then asks clarifying questions in two
              rounds: the first chosen from the symptoms you selected, and the second
              chosen from the answer you gave. It recomputes the care level after each
              round. Answering can raise that level and cannot lower it, an answer of
              &ldquo;I do not know&rdquo; is recorded as unknown rather than as a no, and no
              clarifying question is asked once a warning sign has been reported.
            </li>
            <li>
              The threshold applied to a reading depends on where it was taken:
              140/90 or higher in a clinic, and 135/85 or higher at home. The form
              asks, and the result states which one was used.
            </li>
            <li>
              It then explains relevant information drawn from the source library,
              with citations you can check.
            </li>
            <li>
              It does not diagnose anything, does not estimate the probability of any
              condition, and gives no medication advice.{" "}
              <Link href="/method">The method page</Link> describes the design.
            </li>
          </ul>
        </div>

        {/*
          The workflow starts with the emergency screen and only reaches the form
          once nothing has been reported. The gate checks its answers in the browser
          with the same fixed rules the server uses, so a warning sign produces
          urgent instructions with no round trip, no retrieval and no model call.
        */}
        <EmergencyGate>
          <GuidanceForm />
        </EmergencyGate>

        <section className="panel stack-tight">
          <h2 style={{ fontSize: "1.1rem" }}>Worth having ready for an appointment</h2>
          <ul style={{ marginBottom: 0 }}>
            {FOLLOW_UP_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        <section className="stack-tight">
          <h2>Limitations</h2>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            {GUIDANCE_LIMITATIONS.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
