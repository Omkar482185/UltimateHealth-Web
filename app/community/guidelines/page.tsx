import type { Metadata } from "next";
import Link from "next/link";

import { GUIDELINES, REPORT_REASONS } from "@/lib/community/content";
import { VERIFIED_ON } from "@/lib/community/external";
import { formatDate } from "@/lib/community/format";

export const metadata: Metadata = {
  title: "Community guidelines",
  description:
    "How the UltimateHealth peer community works: what is welcome, what is removed, how reporting and moderation work, and why this is not an emergency service.",
};

export default function CommunityGuidelinesPage() {
  return (
    <section className="section section--flush">
      <div className="container container--narrow stack">
        <nav aria-label="Breadcrumb" className="meta">
          <Link href="/community">Community</Link> / Guidelines
        </nav>

        <div className="page-head">
          <p className="eyebrow">Community standards</p>
          <h1>Guidelines and safety</h1>
          <p className="lede">
            This is a peer-support space. The rules are short because they matter
            more than they are numerous: describe your own experience, protect
            people&apos;s privacy, and do not turn an anecdote into a prescription.
          </p>
        </div>

        <div className="notice notice--danger">
          <p className="notice__title">This is not an emergency service</p>
          <p style={{ marginBottom: "var(--space-2)" }}>
            Posts are not monitored around the clock. If you or someone else has
            chest pain, difficulty breathing, a seizure, severe bleeding, sudden
            weakness, confusion, or another urgent symptom, contact local emergency
            services now.
          </p>
          <Link href="/guidance">See the urgent warning signs</Link>
        </div>

        <div className="notice notice--warning">
          <p className="notice__title">Experience is not evidence of a treatment</p>
          <p style={{ margin: 0 }}>
            A member saying that something helped them is a personal account. It
            does not prove the treatment works, that it is safe for you, or that it
            applies to your situation. Nobody here can diagnose you. For decisions
            about medicines, tests, or care, speak to a qualified clinician.
          </p>
        </div>

        <section className="stack-tight" aria-labelledby="rules-heading">
          <h2 id="rules-heading">The rules</h2>
          <ol className="stack-tight" style={{ paddingLeft: "var(--space-5)", margin: 0 }}>
            {GUIDELINES.map((rule) => (
              <li key={rule.title}>
                <h3 style={{ marginBottom: "var(--space-1)" }}>{rule.title}</h3>
                <p style={{ margin: 0 }}>{rule.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack-tight" aria-labelledby="reporting-heading">
          <h2 id="reporting-heading">Reporting and moderation</h2>
          <p>
            Every discussion and reply has a report control for signed-in readers.
            A report records a reason and an optional note. The person who was
            reported is not told who reported them, and reporters are never shown
            on a public page.
          </p>
          <p className="meta" style={{ margin: 0 }}>
            Report reasons available in the interface:
          </p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {REPORT_REASONS.map((reason) => (
              <li key={reason.id}>
                <strong>{reason.label}.</strong> {reason.hint}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: "var(--space-3)" }}>
            A moderator reviews open reports from a restricted queue. They can
            remove a post or reply, restore something they removed themselves, or
            dismiss a report without changing the content. Removal hides the words
            from public pages but keeps the row so the report still has a record.
            An author can delete their own content at any time, and a moderator
            cannot restore an author&apos;s deletion.
          </p>
          <p className="meta" style={{ margin: 0 }}>
            Moderator access is configured on the server. There is no self-service
            way to become a moderator, and no profile setting grants it.
          </p>
        </section>

        <section className="stack-tight" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Privacy and public names</h2>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>
              Posts are public. Your display name is shown if you set one; otherwise
              the site generates a pseudonym from your account id. Your email
              address is never shown.
            </li>
            <li>
              Community posts are stored separately from health records and are not
              copied into your health profile, the medical corpus, or the
              assistant&apos;s retrieval index.
            </li>
            <li>
              Following a community is an explicit display choice. It is not a
              diagnosis, is not inferred from browsing, and does not appear in your
              health profile.
            </li>
            <li>
              Do not post contact details or identifying information about yourself
              or anyone else. The composer refuses obvious phone numbers and email
              addresses, but it cannot catch everything; use judgement.
            </li>
            <li>
              Deleting your account deletes the posts and replies attached to it.
              Deleted content is removed from public pages immediately.
            </li>
          </ul>
          <p className="meta" style={{ margin: 0 }}>
            The <Link href="/privacy">privacy policy</Link> covers account data,
            records, and retention in more detail.
          </p>
        </section>

        <section className="stack-tight" aria-labelledby="external-heading">
          <h2 id="external-heading">External communities</h2>
          <p>
            A disease community page may list patient communities on other
            websites. Those links are checked on the date shown beside them and are
            opened in a new tab. UltimateHealth does not operate, moderate, or
            endorse them, and does not copy their posts or member data. Their own
            registration, privacy policy, and rules apply.
          </p>
          <p className="meta" style={{ margin: 0 }}>
            Directory last checked {formatDate(VERIFIED_ON)}. Medical information
            pages are labelled separately from peer communities.
          </p>
        </section>

        <div className="panel stack-tight">
          <h2 style={{ fontSize: "1.35rem" }}>If something has gone wrong</h2>
          <p style={{ margin: 0 }}>
            Report the post or reply and, if someone is in immediate danger,
            contact emergency services. For a privacy request or a concern about
            moderation, use the contact route in the{" "}
            <Link href="/privacy">privacy policy</Link>.
          </p>
          <div className="community-actions">
            <Link className="btn btn--primary" href="/community">
              Back to the community
            </Link>
            <Link className="btn" href="/guidance">
              Urgent symptoms
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
