"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { REPORT_DETAIL_MAX, REPORT_REASONS } from "@/lib/community/content";

/**
 * Helpful marks and reporting for one post.
 *
 * Reporting is deliberately a small, explicit form rather than a one-click flag,
 * so a report carries a reason and is not triggered by a stray tap. Authors do
 * not see a report control for their own post; they can edit or delete it.
 */
export function PostInteractions({
  postId,
  initialCount,
  initialReacted,
  signedIn,
  canReport,
}: {
  postId: number;
  initialCount: number;
  initialReacted: boolean;
  signedIn: boolean;
  canReport: boolean;
}) {
  const ids = useId();
  const [count, setCount] = useState(initialCount);
  const [reacted, setReacted] = useState(initialReacted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0].id);
  const [detail, setDetail] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  async function toggleHelpful() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/reactions`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        reacted?: boolean;
        count?: number;
      };
      if (!response.ok || typeof data.count !== "number") {
        setError(data.error ?? "The helpful mark could not be saved.");
        return;
      }
      setReacted(Boolean(data.reacted));
      setCount(data.count);
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReportBusy(true);
    setReportError(null);
    setReportMessage(null);
    try {
      const response = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "post",
          targetId: postId,
          reason,
          detail: detail.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setReportError(data.error ?? "The report could not be filed.");
        return;
      }
      setReportMessage(
        data.message ?? "Thank you. A moderator will review this report.",
      );
      setReportOpen(false);
      setDetail("");
    } catch {
      setReportError("The request did not reach the server. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="community-actions community-actions--wrap">
      {signedIn ? (
        <button
          type="button"
          className={reacted ? "btn btn--small btn--primary" : "btn btn--small"}
          aria-pressed={reacted}
          onClick={toggleHelpful}
          disabled={busy}
        >
          {busy ? "Saving…" : reacted ? "Marked helpful" : "Mark helpful"}
          <span className="chip__count" aria-hidden="true">
            {count}
          </span>
        </button>
      ) : (
        <Link className="btn btn--small" href="/account">
          Sign in to mark helpful
        </Link>
      )}

      {canReport ? (
        <button
          type="button"
          className="btn btn--small btn--quiet"
          aria-expanded={reportOpen}
          aria-controls={`${ids}-report`}
          onClick={() => setReportOpen((open) => !open)}
        >
          Report this post
        </button>
      ) : null}

      <p className="meta" style={{ margin: 0 }} aria-live="polite">
        {error ?? reportMessage ?? ""}
      </p>

      {reportOpen && canReport ? (
        <form
          id={`${ids}-report`}
          className="community-report"
          onSubmit={submitReport}
        >
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-reason`}>
              Why are you reporting this?
            </label>
            <select
              className="select"
              id={`${ids}-reason`}
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as typeof reason)
              }
            >
              {REPORT_REASONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field__hint">
              {REPORT_REASONS.find((option) => option.id === reason)?.hint}
            </p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-detail`}>
              Anything else the moderator should know? (optional)
            </label>
            <textarea
              className="textarea"
              id={`${ids}-detail`}
              rows={3}
              maxLength={REPORT_DETAIL_MAX}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
          <div aria-live="polite">
            {reportError ? (
              <p className="field__error" role="alert">
                {reportError}
              </p>
            ) : null}
          </div>
          <div className="community-actions">
            <button
              className="btn btn--danger btn--small"
              type="submit"
              disabled={reportBusy}
            >
              {reportBusy ? "Sending…" : "Send report"}
            </button>
            <button
              className="btn btn--quiet btn--small"
              type="button"
              onClick={() => setReportOpen(false)}
              disabled={reportBusy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
