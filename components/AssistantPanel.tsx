"use client";

import { useId, useState } from "react";

import { AnswerBody, CitationList } from "@/components/AnswerBody";
import type { AnswerResult } from "@/lib/rag/generate";

const EXAMPLES = [
  "What blood pressure reading is considered high?",
  "What are the warning signs of a stroke?",
  "Does high blood pressure usually cause symptoms?",
  "How much sodium is recommended per day?",
];

/**
 * A server-side failure is never just "the request failed". The API reports which
 * problem it hit, and that determines the heading a reader sees, so an operator can
 * tell an unconfigured embedding key from a stopped local model at a glance. The
 * Ollama failures are about that local service; the key, quota and corpus entries
 * belong to retrieval, which still uses the embedding provider.
 */
const ERROR_TITLES: Record<string, string> = {
  "missing-key": "The assistant has no embedding key configured",
  "invalid-key": "The configured embedding key was rejected",
  "model-unavailable": "The configured local model is not available",
  "quota-exhausted": "The embedding quota for this project is exhausted",
  "rate-limited": "The embedding service is rate-limiting requests",
  "overloaded": "The model is temporarily oversubscribed",
  "corpus-mismatch": "The stored corpus was built with a different embedding model",
  "retrieval-only-mode": "This server answers from source passages only",
  unreachable: "The local assistant model is not running",
  timeout: "The local model took too long to answer",
  "out-of-memory": "The local model ran out of memory",
  "empty-response": "The local model returned an empty answer",
  "bad-response": "The local model returned an unreadable response",
  "server-error": "The local model reported an error",
};

const CONFIDENCE_LABEL: Record<AnswerResult["confidence"], string> = {
  high: "Retrieval confidence: high",
  medium: "Retrieval confidence: medium",
  low: "Retrieval confidence: low",
  none: "No confidence score",
};

export type AssistantPanelProps = {
  /** Pre-fills the question, so a link can hand over a specific one. */
  initialQuestion?: string;
  /**
   * Restricts retrieval to one corpus topic. Set by topic pages, which pass the
   * topic they cover so that an answer cannot be assembled from an unrelated
   * document that happens to score well.
   */
  topic?: string;
  /** Human-readable name of `topic`, shown so the restriction is not silent. */
  topicLabel?: string;
};

export function AssistantPanel({
  initialQuestion,
  topic,
  topicLabel,
}: AssistantPanelProps = {}) {
  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fieldId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const trimmed = question.trim();
    if (trimmed.length < 4) {
      setError("Please enter a question of at least a few words.");
      return;
    }

    setLoading(true);
    setError(null);
    setErrorKind(null);
    setResult(null);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topic ? { question: trimmed, topic } : { question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "The request could not be completed.");
        setErrorKind(typeof data.kind === "string" ? data.kind : null);
        return;
      }
      setResult(data as AnswerResult);
    } catch {
      setError(
        "The request could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      {topic && topicLabel ? (
        <div className="notice notice--info">
          <p className="notice__title">Retrieval is restricted to this topic</p>
          <p style={{ margin: 0 }}>
            Answers here search only the <strong>{topicLabel}</strong> documents. A
            question about anything else will be declined rather than answered from
            an unrelated source.
          </p>
        </div>
      ) : null}

      <form className="composer" onSubmit={submit} noValidate aria-busy={loading}>
        <div className="field">
          <label className="field__label" htmlFor={fieldId}>
            Your health question
          </label>
          <span className="field__hint" id={`${fieldId}-hint`}>
            Ask about anything covered by the source library. The assistant answers
            only from those documents and shows the passages it used.
          </span>
          <textarea
            className="textarea"
            id={fieldId}
            name="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-describedby={`${fieldId}-hint`}
            maxLength={500}
            placeholder="For example: what is a hypertensive crisis?"
            required
          />
        </div>

        <div className="composer__examples">
          <span className="composer__examples-label">Try one of these</span>
          <div className="tag-row">
            {EXAMPLES.map((example) => (
              <button
                className="chip"
                key={example}
                type="button"
                onClick={() => setQuestion(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="composer__foot">
          <span className="composer__count">{question.length} of 500 characters</span>
          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? "Retrieving and writing…" : "Ask the assistant"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="notice notice--danger" role="alert">
          <p className="notice__title">
            {(errorKind && ERROR_TITLES[errorKind]) ?? "That request failed"}
          </p>
          <p style={{ marginBottom: "var(--space-3)" }}>{error}</p>
          {errorKind ? (
            <p className="meta" style={{ marginBottom: "var(--space-3)" }}>
              Reported cause: <span className="mono">{errorKind}</span>. This is a
              server-side or provider problem, not a problem with your question.
            </p>
          ) : null}
          <button
            className="btn"
            type="button"
            onClick={() => {
              setError(null);
              setErrorKind(null);
            }}
          >
            Dismiss and edit the question
          </button>
        </div>
      ) : null}

      <div aria-live="polite">
        {loading ? (
          <p className="loading-state" role="status">
            <span className="loading-state__dot" aria-hidden="true" />
            Retrieving candidate passages, fusing the rankings, and generating a cited
            answer.
          </p>
        ) : null}

        {result && result.mode === "emergency" && result.emergency ? (
          <div className="notice notice--danger">
            <p className="notice__title">Seek emergency care now</p>
            <p>{result.emergency.message}</p>
            <ul>
              {result.emergency.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="meta">
              Triggered by:{" "}
              {result.emergency.matchedRules
                .map((rule) => `${rule.label} (matched "${rule.triggeredBy}")`)
                .join("; ")}
            </p>
            <p className="meta">
              This response came from a fixed rule set, not from the language
              model, and no question was asked before it.
            </p>
            {result.emergencySources ? (
              <CitationList
                citations={result.emergencySources}
                anchorPrefix="emg"
                heading="Guidance these warning signs come from"
              />
            ) : null}
          </div>
        ) : null}

        {result && result.mode === "abstained" ? (
          <div className="notice notice--warning">
            <p className="notice__title">
              The assistant declined to answer this question
            </p>
            <p style={{ marginBottom: 0 }}>{result.notice}</p>
            <p className="meta" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              Passages considered: {result.retrieval.evidenceCount}. Highest
              retrieval similarity:{" "}
              <span className="mono">{result.retrieval.topCosine.toFixed(3)}</span>.
            </p>
          </div>
        ) : null}

        {/*
          The retrieval-only answer. It is not an error state: the question reached the
          corpus and the passages below are real. What the reader needs to know is that
          nothing here was written by the model, because "an answer" and "the sentences
          nearest to your question" are not the same thing and must not look the same.
        */}
        {result && result.mode === "retrieval-only" ? (
          <div className="stack">
            <div className="notice notice--warning" role="status">
              <p className="notice__title">
                {result.providerError
                  ? (ERROR_TITLES[result.providerError.kind] ??
                    "The written answer was unavailable")
                  : "The written answer was unavailable"}
              </p>
              <p style={{ marginBottom: "var(--space-3)" }}>{result.notice}</p>
              {result.providerError ? (
                <details>
                  <summary style={{ cursor: "pointer" }}>
                    What the server reported, for an operator
                  </summary>
                  <p className="meta" style={{ marginTop: "var(--space-3)" }}>
                    <span className="mono">{result.providerError.kind}</span>:{" "}
                    {result.providerError.message}
                  </p>
                </details>
              ) : null}
            </div>

            <div className="tag-row">
              <span className="tag tag--warning">Quoted passages, not a written answer</span>
              <span className="tag">{result.citations.length} sources</span>
              <span className="tag mono">{result.latencyMs} ms</span>
            </div>

            <div className="answer card">
              <AnswerBody text={result.answer} citations={result.citations} />
            </div>

            <CitationList citations={result.citations} />

            <details className="panel">
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                Retrieval detail for this answer
              </summary>
              <table className="table table--numeric" style={{ marginTop: "var(--space-4)" }}>
                <tbody>
                  <tr>
                    <th scope="row">Passages retrieved</th>
                    <td>{result.retrieval.evidenceCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Passages quoted</th>
                    <td>{result.citations.length}</td>
                  </tr>
                  <tr>
                    <th scope="row">Distinct source documents</th>
                    <td>{result.retrieval.distinctSources}</td>
                  </tr>
                  <tr>
                    <th scope="row">Highest cosine similarity</th>
                    <td>{result.retrieval.topCosine.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Total latency</th>
                    <td>{result.latencyMs} ms</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        ) : null}

        {result && (result.mode === "answered" || result.mode === "uncited") ? (
          <div className="stack">
            <div className="tag-row">
              <span
                className={
                  result.confidence === "high"
                    ? "tag tag--accent"
                    : result.confidence === "low"
                      ? "tag tag--warning"
                      : "tag"
                }
              >
                {CONFIDENCE_LABEL[result.confidence]}
              </span>
              <span className="tag">{result.citations.length} citations</span>
              {result.strippedCitations > 0 ? (
                <span className="tag tag--warning">
                  {result.strippedCitations} unsupported citation
                  {result.strippedCitations === 1 ? "" : "s"} removed
                </span>
              ) : null}
              <span className="tag mono">{result.latencyMs} ms</span>
            </div>

            {result.notice ? (
              <div className="notice notice--warning">
                <p className="notice__title">Caveat</p>
                <p style={{ margin: 0 }}>{result.notice}</p>
              </div>
            ) : null}

            <div className="answer card">
              <AnswerBody text={result.answer} citations={result.citations} />
            </div>

            <CitationList citations={result.citations} />

            <details className="panel">
              <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                Retrieval detail for this answer
              </summary>
              <table className="table table--numeric" style={{ marginTop: "var(--space-4)" }}>
                <tbody>
                  <tr>
                    <th scope="row">Passages passed to the model</th>
                    <td>{result.retrieval.evidenceCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Distinct source documents</th>
                    <td>{result.retrieval.distinctSources}</td>
                  </tr>
                  <tr>
                    <th scope="row">Vector candidates</th>
                    <td>{result.retrieval.vectorHitCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Keyword candidates</th>
                    <td>{result.retrieval.keywordHitCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Highest cosine similarity</th>
                    <td>{result.retrieval.topCosine.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Total latency</th>
                    <td>{result.latencyMs} ms</td>
                  </tr>
                </tbody>
              </table>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}
