"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  COMMENT_MAX,
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
} from "@/lib/community/content";
import { formatDate, formatDateTime } from "@/lib/community/format";
import type { CommentRecord } from "@/lib/community/store";

/**
 * Comments and one level of replies.
 *
 * Everything that mutates is sent to the API and followed by `router.refresh()`,
 * so the rendered thread is always the server's view of the database rather than
 * a local guess. A removed comment has no body in the props unless the viewer is
 * its author or a moderator, and even then this component shows a placeholder
 * instead of the text.
 */
export function CommentThread({
  postId,
  comments,
  viewerId,
  signedIn,
  isModerator,
  locked = false,
}: {
  postId: number;
  comments: readonly CommentRecord[];
  viewerId: number | null;
  signedIn: boolean;
  isModerator: boolean;
  /** A removed discussion keeps its replies for review but accepts no new ones. */
  locked?: boolean;
}) {
  const router = useRouter();
  const ids = useId();

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [reportId, setReportId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].id);
  const [reportDetail, setReportDetail] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportNotice, setReportNotice] = useState<string | null>(null);

  const topLevel = comments.filter((comment) => comment.parentCommentId === null);
  const repliesFor = (id: number) =>
    comments.filter((comment) => comment.parentCommentId === id);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await response.json()) as { error?: string; issues?: string[] };
      if (!response.ok) {
        setError([data.error ?? "The reply could not be published.", ...(data.issues ?? [])].join(" "));
        return;
      }
      setBody("");
      setNotice("Your reply is published.");
      router.refresh();
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(commentId: number) {
    setReplyBusy(true);
    setReplyError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: replyBody, parentCommentId: commentId }),
      });
      const data = (await response.json()) as { error?: string; issues?: string[] };
      if (!response.ok) {
        setReplyError(
          [data.error ?? "The reply could not be published.", ...(data.issues ?? [])].join(" "),
        );
        return;
      }
      setReplyBody("");
      setReplyTo(null);
      setNotice("Your reply is published.");
      router.refresh();
    } catch {
      setReplyError("The request did not reach the server. Please try again.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function saveEdit(commentId: number) {
    setEditBusy(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/community/comments/${commentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: editBody }),
      });
      const data = (await response.json()) as { error?: string; issues?: string[] };
      if (!response.ok) {
        setEditError(
          [data.error ?? "The changes could not be saved.", ...(data.issues ?? [])].join(" "),
        );
        return;
      }
      setEditId(null);
      setNotice("Your reply was updated.");
      router.refresh();
    } catch {
      setEditError("The request did not reach the server. Please try again.");
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteComment(commentId: number) {
    setEditBusy(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/community/comments/${commentId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setEditError(data.error ?? "The reply could not be deleted.");
        return;
      }
      setDeleteId(null);
      setNotice("Your reply was deleted.");
      router.refresh();
    } catch {
      setEditError("The request did not reach the server. Please try again.");
    } finally {
      setEditBusy(false);
    }
  }

  async function submitReport(commentId: number) {
    setReportBusy(true);
    setReportError(null);
    setReportNotice(null);
    try {
      const response = await fetch("/api/community/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: "comment",
          targetId: commentId,
          reason: reportReason,
          detail: reportDetail.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setReportError(data.error ?? "The report could not be filed.");
        return;
      }
      setReportId(null);
      setReportDetail("");
      setReportNotice(data.message ?? "Thank you. A moderator will review this report.");
    } catch {
      setReportError("The request did not reach the server. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <section className="stack" aria-labelledby={`${ids}-heading`}>
      <div className="section-head">
        <div className="section-head__text">
          <p className="kicker">Replies</p>
          <h2 id={`${ids}-heading`} style={{ fontSize: "1.5rem" }}>
            {comments.length === 1 ? "1 reply" : `${comments.length} replies`}
          </h2>
        </div>
      </div>

      <p className="meta" style={{ margin: 0 }} aria-live="polite">
        {notice ?? reportNotice ?? ""}
      </p>

      {topLevel.length === 0 ? (
        <div className="empty-state">
          <h3>No replies yet</h3>
          <p className="meta" style={{ margin: 0 }}>
            A short, kind reply is often enough. Share what you know from your own
            experience, not a treatment instruction.
          </p>
        </div>
      ) : (
        <ul className="community-comments list-plain">
          {topLevel.map((comment) => (
            <li key={comment.id}>
              {renderComment(comment, false)}
              {repliesFor(comment.id).length > 0 ? (
                <ul className="community-comments__replies list-plain">
                  {repliesFor(comment.id).map((reply) => (
                    <li key={reply.id}>{renderComment(reply, true)}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {locked ? (
        <div className="notice notice--warning">
          <p className="notice__title">This discussion is closed</p>
          <p style={{ margin: 0 }}>
            The discussion was removed, so no new replies can be published. Existing
            replies remain visible here for the author and for moderator review.
          </p>
        </div>
      ) : signedIn ? (
        <form className="panel stack" onSubmit={submitComment} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-body`}>
              Join the conversation
            </label>
            <textarea
              className="textarea"
              id={`${ids}-body`}
              rows={4}
              maxLength={COMMENT_MAX}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Reply with your own experience or a practical question."
              required
            />
            <p className="field__hint">
              {body.length} of {COMMENT_MAX} characters. Do not post contact details
              or anything that identifies someone else.
            </p>
          </div>
          <div aria-live="polite">
            {error ? (
              <p className="field__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <div className="community-actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Publish reply"}
            </button>
            <Link className="btn btn--quiet" href="/community/guidelines">
              Community guidelines
            </Link>
          </div>
        </form>
      ) : (
        <div className="notice notice--info">
          <p className="notice__title">Sign in to reply</p>
          <p style={{ margin: 0 }}>
            Reading is open to everyone. Posting and replying need an account so that
            authorship and moderation mean something.{" "}
            <Link href="/account">Sign in or create an account</Link>.
          </p>
        </div>
      )}
    </section>
  );

  function renderComment(comment: CommentRecord, isReply: boolean) {
    const isOwner = viewerId !== null && viewerId === comment.authorId;
    const removed = comment.removedAt !== null;
    const canReport = signedIn && !isOwner && !removed;

    return (
      <article
        className={
          isReply ? "community-comment community-comment--reply" : "community-comment"
        }
        aria-label={`Reply by ${comment.authorName}`}
      >
        <p className="community-comment__head">
          <strong>{comment.authorName}</strong>
          <span aria-hidden="true"> · </span>
          <time dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>
            {formatDate(comment.createdAt)}
          </time>
          {comment.editedAt && !removed ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>edited</span>
            </>
          ) : null}
          {isOwner && !removed ? <span className="tag">You</span> : null}
        </p>

        {removed ? (
          <p className="meta" style={{ margin: 0 }}>
            {comment.removedBy === "author"
              ? "This reply was deleted by its author."
              : "This reply was removed by a moderator."}
            {isModerator ? " It remains visible here for moderator review only." : ""}
          </p>
        ) : (
          <>
            <p className="community-body">{comment.body}</p>

            <div className="community-actions community-actions--wrap">
              {!isReply && !locked ? (
                <button
                  type="button"
                  className="btn btn--small btn--quiet"
                  aria-expanded={replyTo === comment.id}
                  onClick={() => {
                    setReplyTo(replyTo === comment.id ? null : comment.id);
                    setReplyBody("");
                    setReplyError(null);
                  }}
                >
                  Reply
                </button>
              ) : null}

              {isOwner && !locked ? (
                <>
                  <button
                    type="button"
                    className="btn btn--small btn--quiet"
                    aria-expanded={editId === comment.id}
                    onClick={() => {
                      setEditId(editId === comment.id ? null : comment.id);
                      setEditBody(comment.body ?? "");
                      setEditError(null);
                    }}
                  >
                    Edit
                  </button>
                  {deleteId === comment.id ? (
                    <span className="community-actions">
                      <span className="meta">Delete this reply?</span>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => deleteComment(comment.id)}
                        disabled={editBusy}
                      >
                        {editBusy ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--quiet btn--small"
                        onClick={() => setDeleteId(null)}
                        disabled={editBusy}
                      >
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--small btn--quiet"
                      onClick={() => setDeleteId(comment.id)}
                    >
                      Delete
                    </button>
                  )}
                </>
              ) : null}

              {canReport ? (
                <button
                  type="button"
                  className="btn btn--small btn--quiet"
                  aria-expanded={reportId === comment.id}
                  onClick={() => {
                    setReportId(reportId === comment.id ? null : comment.id);
                    setReportError(null);
                  }}
                >
                  Report
                </button>
              ) : null}
            </div>

            <p className="meta" style={{ margin: 0 }} aria-live="polite">
              {editId === comment.id ? (editError ?? "") : ""}
            </p>

            {replyTo === comment.id ? (
              <div className="community-comment__form">
                <label className="field__label" htmlFor={`${ids}-reply-${comment.id}`}>
                  Reply to {comment.authorName}
                </label>
                <textarea
                  className="textarea"
                  id={`${ids}-reply-${comment.id}`}
                  rows={3}
                  maxLength={COMMENT_MAX}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                />
                <div aria-live="polite">
                  {replyError ? (
                    <p className="field__error" role="alert">
                      {replyError}
                    </p>
                  ) : null}
                </div>
                <div className="community-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={() => submitReply(comment.id)}
                    disabled={replyBusy}
                  >
                    {replyBusy ? "Publishing…" : "Publish reply"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => setReplyTo(null)}
                    disabled={replyBusy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {editId === comment.id ? (
              <div className="community-comment__form">
                <label className="field__label" htmlFor={`${ids}-edit-${comment.id}`}>
                  Edit your reply
                </label>
                <textarea
                  className="textarea"
                  id={`${ids}-edit-${comment.id}`}
                  rows={3}
                  maxLength={COMMENT_MAX}
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <div className="community-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={() => saveEdit(comment.id)}
                    disabled={editBusy}
                  >
                    {editBusy ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => setEditId(null)}
                    disabled={editBusy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {reportId === comment.id && canReport ? (
              <div className="community-comment__form">
                <div className="field">
                  <label
                    className="field__label"
                    htmlFor={`${ids}-report-${comment.id}`}
                  >
                    Why are you reporting this reply?
                  </label>
                  <select
                    className="select"
                    id={`${ids}-report-${comment.id}`}
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(event.target.value as typeof reportReason)
                    }
                  >
                    {REPORT_REASONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label
                    className="field__label"
                    htmlFor={`${ids}-report-detail-${comment.id}`}
                  >
                    Anything else the moderator should know? (optional)
                  </label>
                  <textarea
                    className="textarea"
                    id={`${ids}-report-detail-${comment.id}`}
                    rows={2}
                    maxLength={REPORT_DETAIL_MAX}
                    value={reportDetail}
                    onChange={(event) => setReportDetail(event.target.value)}
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
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => submitReport(comment.id)}
                    disabled={reportBusy}
                  >
                    {reportBusy ? "Sending…" : "Send report"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => setReportId(null)}
                    disabled={reportBusy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </article>
    );
  }
}
