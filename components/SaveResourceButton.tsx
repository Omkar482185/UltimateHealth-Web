"use client";

import { useState } from "react";

import type { SavedKind } from "@/lib/profile/saved";

/**
 * Saves or removes one catalogue reference against the signed-in account.
 *
 * The button sends only a kind and a reference id; the server resolves the title
 * and link from its own catalogue, so nothing the browser supplies can become a
 * stored link. Signed-out readers see nothing at all rather than a control that
 * can only fail, which is also why `signedIn` is a required prop: a save that
 * silently does nothing would be worse than no button.
 */
export function SaveResourceButton({
  signedIn,
  kind,
  refId,
  initiallySaved,
  label = "Keep for later",
}: {
  signedIn: boolean;
  kind: SavedKind;
  refId: string;
  initiallySaved: boolean;
  label?: string;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/saved", {
        method: saved ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, refId }),
      });
      if (!response.ok) {
        const text = await response.text();
        let message = `The request failed with status ${response.status}.`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // The server's own text is not JSON; the status message stands.
        }
        setError(message);
        return;
      }
      setSaved(!saved);
    } catch {
      setError("The request could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="save-button">
      <button
        type="button"
        className={saved ? "btn btn--small" : "btn btn--small btn--primary"}
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
      >
        {busy ? "Working…" : saved ? "Saved" : label}
      </button>
      {/**
       * The failure is announced rather than only painted, so a screen reader
       * hears it, and the button keeps its previous state because nothing was
       * stored.
       */}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
