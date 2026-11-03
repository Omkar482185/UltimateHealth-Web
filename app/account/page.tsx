import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { AccountPanel } from "@/components/AccountPanel";
import { getCurrentUser } from "@/lib/auth/cookies";
import { CONSENT_VERSION, getProfile } from "@/lib/auth/users";

export const metadata: Metadata = {
  title: "Account",
  description:
    "Sign in to keep your own blood pressure and weight measurements, or read exactly what this project stores and delete it.",
};

/**
 * Account page.
 *
 * Rendered on the server so the signed-in state is decided before anything
 * reaches the browser. There is no client-side "am I signed in" request that
 * could briefly render the wrong thing, and no personal data is delivered to a
 * page that has not been authenticated.
 *
 * This route opts out of instant-navigation validation with `instant = false`.
 * Reading the session cookie is a request-time read, so it cannot be part of a
 * prerendered shell, and Cache Components flags such routes. The documented
 * opt-out for a route that must block on the server is this flag. `dynamic =
 * "force-dynamic"` is not an option here: with Cache Components enabled, Next
 * rejects it as an incompatible segment config.
 *
 * What matters for correctness is that the page is not reused across visitors.
 * Because it reads a cookie, it is rendered per request, and the documented
 * cached alternative for session-derived reads (`use cache: private`) keeps its
 * result in the browser only. Nothing here is cached on the server.
 */
export const instant = false;

export default async function AccountPage() {
  // Load-bearing, not decorative: resolving the session compares its expiry with
  // the current time, and Next rejects a current-time read during prerendering
  // (`blocking-prerender-current-time`). Waiting for the request first means the
  // session is only resolved when a request actually exists. `instant = false`
  // alone was not enough, which is what the browser console showed.
  await connection();
  const user = await getCurrentUser();
  const profile = user ? getProfile(user.id) : null;

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Your account</p>
          <h1>{user ? "Your profile and data" : "Sign in or create an account"}</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            An account exists for one reason: to keep measurements you record
            yourself, so a trend line is built from your own numbers rather than from
            anything invented. The assistant, the symptom guidance and the whole
            source library work without signing in.
          </p>
        </div>

        {!user ? (
          <div className="notice notice--info">
            <p className="notice__title">What an account does and does not do</p>
            <ul style={{ marginBottom: 0 }}>
              <li>
                It stores an email address, a password hash, and only the profile
                fields you choose to give. There is no name, address or contact
                field.
              </li>
              <li>
                Your measurements are yours. There is no sharing, no public profile,
                and no way for one account to read another&apos;s records.
              </li>
              <li>
                It is not a medical record and does not replace one.{" "}
                <Link href="/privacy">The privacy page</Link> sets out exactly what is
                stored and for how long.
              </li>
            </ul>
          </div>
        ) : null}

        <div className="page-grid" style={{ marginTop: "var(--space-5)" }}>
          <AccountPanel
            signedIn={user ? { email: user.email, createdAt: user.createdAt } : null}
            profile={profile}
            consentVersion={CONSENT_VERSION}
          />

          <aside className="aside-stack">
            <div className="panel">
              <p className="kicker">Privacy</p>
              <h2 className="panel-title" style={{ marginTop: "var(--space-2)" }}>
                {user ? "Your data, in your hands" : "Why an account exists"}
              </h2>
              <p className="meta" style={{ marginTop: "var(--space-3)" }}>
                {user
                  ? "Everything stored for this account can be downloaded as a PDF or JSON file, and deleted permanently, from this page. There is no sharing, no public profile and no analytics that identifies you."
                  : "An account stores an email address, a password hash and the profile fields you choose to give. It is not a medical record, and every other part of the platform works without one."}
              </p>
              <Link className="btn btn--small" href="/privacy">
                Read the privacy policy
              </Link>
            </div>

            <div className="card card--flat">
              <p className="kicker">Without signing in</p>
              <ul className="list-plain stack-tight" style={{ marginTop: "var(--space-3)" }}>
                <li>
                  <Link href="/assistant">Ask the health assistant</Link>
                </li>
                <li>
                  <Link href="/guidance">Check symptoms and warning signs</Link>
                </li>
                <li>
                  <Link href="/library">Read the source library</Link>
                </li>
                <li>
                  <Link href="/podcasts">Watch and listen</Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
