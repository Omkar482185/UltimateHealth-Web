"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import {
  BODY_MAX,
  BODY_MIN,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/community/content";
import type { CommunityTopic } from "@/lib/community/diseases";

/**
 * The composer for a new discussion.
 *
 * It submits JSON to the community API and, on success, navigates to the new
 * thread. Validation is duplicated on the server: these checks exist to give
 * immediate feedback, not to protect the database.
 */
export function CommunityComposer({
  diseaseId,
  topics,
  starterQuestion,
}: {
  diseaseId: string;
  topics: readonly CommunityTopic[];
  starterQuestion: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTopic = topics.find((topic) => topic.id === topicId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setIssues([]);
    setError(null);

    try {
      const response = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diseaseId, topicId, title, body }),
      });
      const data = (await response.json()) as {
        error?: string;
        issues?: string[];
        post?: { id: number };
      };

      if (!response.ok || !data.post) {
        setError(data.error ?? "The discussion could not be published.");
        setIssues(Array.isArray(data.issues) ? data.issues : []);
        return;
      }

      router.push(`/community/${diseaseId}/${data.post.id}?published=1`);
      router.refresh();
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="start" className="panel stack" aria-labelledby={`${ids}-heading`}>
      <div className="section-head" style={{ margin: 0 }}>
        <div className="section-head__text">
          <p className="kicker">Add your experience</p>
          <h2 id={`${ids}-heading`} style={{ fontSize: "1.45rem" }}>
            Start a discussion
          </h2>
          <p className="meta" style={{ marginBottom: 0 }}>
            Ask a question or describe what has helped you. Personal experience is
            welcome; medical instructions are not.
          </p>
        </div>
        <button
          type="button"
          className={open ? "btn" : "btn btn--primary"}
          aria-expanded={open}
          aria-controls={`${ids}-form`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close composer" : "Write a post"}
        </button>
      </div>

      {open ? (
        <form id={`${ids}-form`} className="stack" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-topic`}>
              Topic
            </label>
            <select
              className="select"
              id={`${ids}-topic`}
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
              required
            >
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.label}
                </option>
              ))}
            </select>
            {selectedTopic ? (
              <p className="field__hint">{selectedTopic.hint}</p>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor={`${ids}-title`}>
              Title
            </label>
            <input
              className="input"
              id={`${ids}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={TITLE_MIN}
              maxLength={TITLE_MAX}
              required
              placeholder="A short summary of your question or experience"
            />
            <p className="field__hint">
              {TITLE_MIN}–{TITLE_MAX} characters. Avoid names and contact details.
            </p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={`${ids}-body`}>
              Your post
            </label>
            <textarea
              className="textarea"
              id={`${ids}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              minLength={BODY_MIN}
              maxLength={BODY_MAX}
              rows={7}
              required
              placeholder={starterQuestion}
              aria-describedby={`${ids}-body-hint`}
            />
            <p className="field__hint" id={`${ids}-body-hint`}>
              {body.length} of {BODY_MAX} characters. Do not post phone numbers,
              email addresses, or anyone else&apos;s health information.
            </p>
          </div>

          <p className="field__hint" style={{ margin: 0 }}>
            By publishing you agree to the{" "}
            <Link href="/community/guidelines">community guidelines</Link>. Posts are
            public and show your display name or a pseudonym.
          </p>

          <div aria-live="polite">
            {error ? (
              <div className="notice notice--danger" role="alert">
                <p className="notice__title">{error}</p>
                {issues.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="community-actions">
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Publish discussion"}
            </button>
            <button
              className="btn btn--quiet"
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
