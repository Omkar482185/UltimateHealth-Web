"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { BODY_MAX, TITLE_MAX } from "@/lib/community/content";

/**
 * Author-only controls on a thread.
 *
 * The server repeats every ownership check; hiding these buttons for other
 * readers is a usability choice, not the authorisation boundary.
 */
export function PostOwnerActions({
  postId,
  diseaseId,
  initialTitle,
  initialBody,
}: {
  postId: number;
  diseaseId: string;
  initialTitle: string;
  initialBody: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = (await response.json()) as { error?: string; issues?: string[] };
      if (!response.ok) {
        setError(
          [data.error ?? "The changes could not be saved.", ...(data.issues ?? [])].join(
            " ",
          ),
        );
        return;
      }
      setEditing(false);
      setMessage("Your changes were saved.");
      router.refresh();
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "The discussion could not be deleted.");
        return;
      }
      router.push(`/community/${diseaseId}?notice=deleted`);
      router.refresh();
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-tight">
      <div className="community-actions">
        <button
          type="button"
          className="btn btn--small"
          aria-expanded={editing}
          aria-controls={`${ids}-edit`}
          onClick={() => {
            setEditing((value) => !value);
            setConfirming(false);
          }}
        >
          {editing ? "Close editor" : "Edit your post"}
        </button>
        {!confirming ? (
          <button
            type="button"
            className="btn btn--small btn--quiet"
            onClick={() => {
              setConfirming(true);
              setEditing(false);
            }}
          >
            Delete
          </button>
        ) : (
          <span className="community-actions">
            <span className="meta">Delete this discussion and its replies?</span>
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={remove}
              disabled={busy}
            >
              {busy ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Keep it
            </button>
          </span>
        )}
      </div>

      <p className="meta" aria-live="polite" style={{ margin: 0 }}>
        {error ?? message ?? ""}
      </p>

      {editing ? (
        <form
          id={`${ids}-edit`}
          className="panel stack"
          onSubmit={save}
          noValidate
        >
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-title`}>
              Title
            </label>
            <input
              className="input"
              id={`${ids}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-body`}>
              Your post
            </label>
            <textarea
              className="textarea"
              id={`${ids}-body`}
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={BODY_MAX}
              required
            />
            <p className="field__hint">
              Edited posts are marked as edited. The original wording is not shown.
            </p>
          </div>
          <div className="community-actions">
            <button className="btn btn--primary btn--small" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              className="btn btn--quiet btn--small"
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
