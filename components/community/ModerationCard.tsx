"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { formatDate, formatDateTime } from "@/lib/community/format";
import { reportReasonLabel } from "@/lib/community/content";
import type { ModerationReport } from "@/lib/community/store";

type Action = "remove" | "restore" | "dismiss";

/**
 * One report in the moderator queue.
 *
 * The server checks the moderator allowlist again on every submission; this
 * component only decides which actions are worth offering. Removing or
 * dismissing here resolves every open report against the same target, which the
 * store does in one transaction.
 */
export function ModerationCard({ report }: { report: ModerationReport }) {
  const router = useRouter();
  const ids = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const targetHref =
    report.diseaseId && report.postId
      ? `/community/${report.diseaseId}/${report.postId}`
      : null;
  const removed = report.targetRemovedAt !== null;
  const canRestore = removed && report.targetRemovedBy === "moderator";

  async function act(action: Action) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/community/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: report.targetType,
          targetId:
            report.targetType === "post" ? report.postId : report.commentId,
          action,
          note: note.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "The moderation action could not be completed.");
        return;
      }
      setMessage(data.message ?? "The report was resolved.");
      setNote("");
      router.refresh();
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card stack-tight">
      <div className="community-post__tags">
        <span className="tag tag--accent">
          {report.targetType === "post" ? "Post" : "Reply"}
        </span>
        <span className="tag">{reportReasonLabel(report.reason)}</span>
        {removed ? (
          <span className="tag tag--danger">
            Removed by {report.targetRemovedBy ?? "unknown"}
          </span>
        ) : (
          <span className="tag tag--warning">Still visible</span>
        )}
        {report.status !== "open" ? (
          <span className="tag">Resolved</span>
        ) : null}
      </div>

      <h3 style={{ margin: 0 }}>
        {report.targetType === "post"
          ? report.postTitle ?? "Untitled discussion"
          : `Reply on “${report.postTitle ?? "a discussion"}”`}
      </h3>

      <p className="meta" style={{ margin: 0 }}>
        Reported by an anonymous member ·{" "}
        <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
          {formatDate(report.createdAt)}
        </time>{" "}
        · Target author: {report.targetAuthorName}
      </p>

      <blockquote className="community-report-quote">
        {report.targetExcerpt ?? "The content could not be read."}
      </blockquote>

      {report.detail ? (
        <p style={{ margin: 0 }}>
          <strong>Reporter&apos;s note:</strong> {report.detail}
        </p>
      ) : null}

      <p className="meta" style={{ margin: 0 }}>
        {report.commentCount} {report.commentCount === 1 ? "reply" : "replies"} ·{" "}
        {report.reactionCount} helpful{" "}
        {report.reactionCount === 1 ? "mark" : "marks"}
        {report.postId ? (
          <>
            {" · "}
            {targetHref ? <Link href={targetHref}>Open the thread</Link> : null}
          </>
        ) : null}
      </p>

      {report.resolutionNote ? (
        <p className="meta" style={{ margin: 0 }}>
          Previous note: {report.resolutionNote}
        </p>
      ) : null}

      {report.status === "open" ? (
        <>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field__label" htmlFor={`${ids}-note`}>
              Resolution note (optional, recorded on every open report for this
              content)
            </label>
            <textarea
              className="textarea"
              id={`${ids}-note`}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div aria-live="polite">
            {error ? (
              <p className="field__error" role="alert">
                {error}
              </p>
            ) : null}
            {message ? <p className="form__success">{message}</p> : null}
          </div>

          <div className="community-actions">
            {!removed ? (
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={() => act("remove")}
                disabled={busy !== null}
              >
                {busy === "remove" ? "Removing…" : "Remove content"}
              </button>
            ) : null}
            {canRestore ? (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => act("restore")}
                disabled={busy !== null}
              >
                {busy === "restore" ? "Restoring…" : "Restore content"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => act("dismiss")}
              disabled={busy !== null}
            >
              {busy === "dismiss" ? "Closing…" : "Dismiss report"}
            </button>
          </div>
        </>
      ) : (
        <p className="meta" style={{ margin: 0 }}>
          Reviewed{" "}
          {report.reviewedAt
            ? formatDate(report.reviewedAt)
            : "earlier"}
          .
        </p>
      )}
    </article>
  );
}
