"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { SavedKind } from "@/lib/profile/saved";

/**
 * The two write actions on the dashboard.
 *
 * Both send an identifier and nothing else, and both refresh the server-rendered
 * page afterwards so the list shown is the one the server recomputed. Failures are
 * announced with the server's own message and the control keeps its previous state,
 * so a change that did not happen can never look as though it did.
 */
function useWrite(path: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        let message = `The request failed with status ${response.status}.`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // The response was not JSON; the status message stands on its own.
        }
        setError(message);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("The request could not reach the server. Check your connection.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, send };
}

export function RecommendationActions({
  recKey,
  completable,
}: {
  recKey: string;
  completable: boolean;
}) {
  const { busy, error, send } = useWrite("/api/account/recommendations");

  return (
    <div className="stack-tight">
      <div className="row">
        {completable ? (
          <button
            type="button"
            className="btn btn--small"
            disabled={busy}
            onClick={() => send("POST", { key: recKey, state: "done" })}
          >
            Mark as done
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--small"
          disabled={busy}
          onClick={() => send("POST", { key: recKey, state: "dismissed" })}
        >
          Do not show this again
        </button>
      </div>
      {error ? (
        <p className="field__error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RemoveSavedButton({
  kind,
  refId,
  label,
}: {
  kind: SavedKind;
  refId: string;
  label: string;
}) {
  const { busy, error, send } = useWrite("/api/account/saved");

  return (
    <span className="save-button">
      <button
        type="button"
        className="btn btn--small"
        disabled={busy}
        onClick={() => send("DELETE", { kind, refId })}
      >
        {busy ? "Removing…" : label}
      </button>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Re-shows a dismissed or completed recommendation. */
export function RestoreRecommendationButton({ recKey }: { recKey: string }) {
  const { busy, error, send } = useWrite("/api/account/recommendations");

  return (
    <span className="save-button">
      <button
        type="button"
        className="btn btn--small"
        disabled={busy}
        onClick={() => send("DELETE", { key: recKey, state: "dismissed" })}
      >
        Show again
      </button>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
