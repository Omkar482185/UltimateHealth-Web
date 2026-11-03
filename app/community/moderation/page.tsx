import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { ModerationCard } from "@/components/community/ModerationCard";
import { getCurrentUser } from "@/lib/auth/cookies";
import { isModerator, moderationConfigured } from "@/lib/community/roles";
import { countOpenReports, listReports } from "@/lib/community/store";

export const metadata: Metadata = {
  title: "Community moderation",
  description: "Restricted report review queue for community moderators.",
  robots: { index: false, follow: false },
};

export const instant = false;

type SearchParams = Promise<{ status?: string }>;

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const user = await getCurrentUser();
  const allowed = Boolean(user && isModerator(user.email));
  const status = (await searchParams).status === "all" ? "all" : "open";

  return (
    <section className="section section--flush">
      <div className="container container--narrow stack">
        <nav aria-label="Breadcrumb" className="meta">
          <Link href="/community">Community</Link> / Moderation
        </nav>

        <div className="page-head">
          <p className="eyebrow">Restricted</p>
          <h1>Report review</h1>
          <p className="lede">
            A person, not an automated classifier, decides what happens to reported
            content. Removal hides the words from public pages but keeps the row and
            the report record.
          </p>
        </div>

        {!user ? (
          <div className="notice notice--info">
            <p className="notice__title">Sign in to continue</p>
            <p style={{ margin: 0 }}>
              This page is limited to community moderators.{" "}
              <Link href="/account">Sign in</Link>.
            </p>
          </div>
        ) : !allowed ? (
          <div className="notice notice--warning">
            <p className="notice__title">This account is not a moderator</p>
            <p style={{ margin: 0 }}>
              Moderator access is granted through server configuration, not from a
              profile setting. If you believe you should have access, contact the
              site operator. Nothing on this page is shown to non-moderators.
            </p>
            <Link className="btn btn--small" href="/community">
              Return to the community
            </Link>
          </div>
        ) : (
          <>
            {!moderationConfigured() ? (
              <div className="notice notice--warning">
                <p className="notice__title">No moderator allowlist is configured</p>
                <p style={{ margin: 0 }}>
                  Set <code className="mono">COMMUNITY_MODERATOR_EMAILS</code> on the
                  server. Until then the queue is closed, which is the safe default.
                </p>
              </div>
            ) : null}

            <ModerationQueue status={status} />
          </>
        )}
      </div>
    </section>
  );
}

async function ModerationQueue({ status }: { status: "open" | "all" }) {
  const openCount = countOpenReports();
  const reports = listReports(status === "open" ? "open" : undefined);

  return (
    <div className="stack">
      <div className="section-head">
        <div className="section-head__text">
          <p className="kicker">Queue</p>
          <h2>
            {status === "open"
              ? openCount === 1
                ? "1 open report"
                : `${openCount} open reports`
              : `${reports.length} reports in total`}
          </h2>
          <p>
            Several reports against the same content are resolved together, so the
            count can be higher than the number of actions you need to take.
          </p>
        </div>
        <div className="community-actions">
          <Link
            className={status === "open" ? "chip chip--active" : "chip"}
            href="/community/moderation"
          >
            Open
          </Link>
          <Link
            className={status === "all" ? "chip chip--active" : "chip"}
            href="/community/moderation?status=all"
          >
            All
          </Link>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="empty-state">
          <h3>{status === "open" ? "No open reports" : "No reports yet"}</h3>
          <p className="meta" style={{ margin: 0 }}>
            {status === "open"
              ? "Nothing is waiting for review. Reports appear here as readers file them."
              : "No reader has reported community content."}
          </p>
        </div>
      ) : (
        <ul className="list-plain stack" style={{ margin: 0 }}>
          {reports.map((report) => (
            <li key={report.id}>
              <ModerationCard report={report} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
