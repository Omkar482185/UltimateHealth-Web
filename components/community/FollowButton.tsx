"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Follows or unfollows a community.
 *
 * The label and the note beside it make clear that following is a display
 * preference, not a health disclosure. Signing out leaves the button as a link to
 * sign in rather than silently doing nothing.
 */
export function FollowButton({
  diseaseId,
  initialFollowing,
  signedIn,
}: {
  diseaseId: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link className="btn btn--small" href="/account">
        Sign in to follow
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/community/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ diseaseId, following: !following }),
      });
      const data = (await response.json()) as { error?: string; following?: boolean };
      if (!response.ok) {
        setError(data.error ?? "The change could not be saved.");
        return;
      }
      setFollowing(Boolean(data.following));
      setMessage(
        data.following
          ? "Following. This community now appears first in your feed."
          : "Unfollowed.",
      );
    } catch {
      setError("The request did not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={following ? "btn btn--small" : "btn btn--small btn--primary"}
        aria-pressed={following}
        onClick={toggle}
        disabled={busy}
      >
        {busy ? "Saving…" : following ? "Following this community" : "Follow this community"}
      </button>
      <p className="field__hint" style={{ marginTop: "var(--space-2)" }}>
        Following only changes what appears first for you. It is not stored in your
        health profile and does not mean you have this condition.
      </p>
      <p className="meta" aria-live="polite" style={{ margin: 0 }}>
        {error ?? message ?? ""}
      </p>
    </div>
  );
}
