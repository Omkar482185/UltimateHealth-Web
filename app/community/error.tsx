"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * A community page can fail because the database is unavailable or a query
 * failed. Saying that plainly is better than showing an empty feed, which would
 * read as "nobody has posted" and misrepresent the community.
 */
export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The message is logged without any post content or account details.
    console.error("[community] page failed:", error.message);
  }, [error]);

  return (
    <section className="section section--flush">
      <div className="container container--narrow stack">
        <div className="page-head">
          <p className="eyebrow">Community</p>
          <h1>The discussions could not be loaded</h1>
          <p className="lede">
            This is a problem on our side, not a sign that the community is empty.
            Nothing you wrote was removed by this error.
          </p>
        </div>

        <div className="notice notice--warning" role="alert">
          <p className="notice__title">What you can do</p>
          <p style={{ marginBottom: "var(--space-3)" }}>
            Try the request again. If it keeps failing, the community database may
            be unavailable; the rest of the site still works.
          </p>
          <div className="community-actions">
            <button type="button" className="btn btn--primary" onClick={reset}>
              Try again
            </button>
            <Link className="btn" href="/community">
              Back to the community
            </Link>
            <Link className="btn btn--quiet" href="/">
              Home
            </Link>
          </div>
        </div>

        {error.digest ? (
          <p className="meta" style={{ margin: 0 }}>
            Reference for support: <span className="mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
