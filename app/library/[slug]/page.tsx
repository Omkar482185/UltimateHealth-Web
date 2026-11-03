import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  REVIEW_DECISION_LABELS,
  reviewFor,
  staleness,
} from "@/lib/corpus/reviews";
import { TOPIC_LABELS, type TopicId } from "@/lib/corpus/sources";
import { SaveResourceButton } from "@/components/SaveResourceButton";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getStore } from "@/lib/db/index";
import { listSavedResources } from "@/lib/profile/saved";
import { paragraphsOf, stitchChunks } from "@/lib/rag/stitch";


type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const doc = getStore().getDocumentBySourceId(slug);
  if (!doc) return { title: "Document not found" };
  return {
    title: doc.title,
    description: `Source document from ${doc.publisher}, retrieved for the ${TOPIC_LABELS[doc.topic as TopicId] ?? doc.topic} collection.`,
  };
}

export const instant = false;

export default async function DocumentPage({ params }: { params: Params }) {
  const { slug } = await params;
  await connection();
  const store = getStore();
  const doc = store.getDocumentBySourceId(slug);
  if (!doc) notFound();

  const chunks = store.listDocumentChunks(doc.id);
  const sections = stitchChunks(chunks);
  const retrieved = new Date(doc.retrievedAt).toISOString().slice(0, 10);
  const review = reviewFor(doc.sourceId, doc.contentSha256);
  const age = staleness(doc.retrievedAt);
  const revisions = store.listRevisions(doc.id);

  // The session is read only so that a signed-in reader can keep this document in
  // the list on their dashboard. Reading a source document never needs an account.
  const user = await getCurrentUser();
  const saved = user ? listSavedResources(user.id) : [];
  const alreadySaved = saved.some(
    (item) => item.kind === "library-document" && item.refId === doc.sourceId,
  );

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">
            {TOPIC_LABELS[doc.topic as TopicId] ?? doc.topic}
          </p>
          <h1>{doc.title}</h1>
          <p className="lede" style={{ marginTop: 0 }}>
            {doc.publisher} · {doc.wordCount.toLocaleString("en")} words ·{" "}
            {chunks.length} indexed passages
          </p>
        </div>

        <div className="page-grid">
          <div className="stack">
        <div className="notice notice--info">
          <p className="notice__title">This is a copy of a third-party publication</p>
          <p style={{ marginBottom: "var(--space-3)" }}>
            The text below was retrieved from {doc.publisher} and is reproduced
            here so that citations in the assistant can be checked against the
            original. It is not written or reviewed by this project.
          </p>
          <p style={{ margin: 0 }}>
            <a href={doc.sourceUrl} rel="noreferrer">
              Read the original on the publisher&apos;s site
            </a>
            {doc.licenceUrl ? (
              <>
                {" · "}
                <a href={doc.licenceUrl} rel="noreferrer">
                  Licence terms
                </a>
              </>
            ) : null}
          </p>
        </div>

        {sections.map((section, index) => (
          <section key={`${section.heading ?? "intro"}-${index}`}>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="prose">
              {paragraphsOf(section.text).map((paragraph, pIndex) => (
                <p key={pIndex}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        <hr />
        <div className="stack-tight">
          <h2>Provenance record</h2>
          <table className="table table--numeric">
            <caption className="visually-hidden">
              Machine-readable provenance for this document
            </caption>
            <tbody>
              <tr>
                <th scope="row">Document id</th>
                <td className="mono">{doc.sourceId}</td>
              </tr>
              <tr>
                <th scope="row">Canonical URL</th>
                <td>
                  <a href={doc.sourceUrl} rel="noreferrer">
                    {doc.sourceUrl}
                  </a>
                </td>
              </tr>
              <tr>
                <th scope="row">Licence</th>
                <td>{doc.licence}</td>
              </tr>
              <tr>
                <th scope="row">Licence URL</th>
                <td>
                  {doc.licenceUrl ? (
                    <a href={doc.licenceUrl} rel="noreferrer">
                      {doc.licenceUrl}
                    </a>
                  ) : (
                    "Not specified by the publisher"
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">Retrieved</th>
                <td className="mono">{retrieved}</td>
              </tr>
              <tr>
                <th scope="row">Content SHA-256</th>
                <td className="mono" style={{ wordBreak: "break-all" }}>
                  {doc.contentSha256}
                </td>
              </tr>
              <tr>
                <th scope="row">Indexed passages</th>
                <td className="mono">{chunks.length}</td>
              </tr>
            </tbody>
          </table>
          <p className="meta">
            The content hash is what makes re-ingestion idempotent: if the
            publisher has not changed the text, a re-run of the ingestion
            pipeline leaves this document untouched. It is also what a review
            record is tied to, so a changed document cannot keep a stale approval.
          </p>
        </div>

        {/*
          Governance block. The wording is deliberate: a review record names a
          person and states that the software did not verify them, because a
          document that merely says "reviewed" would imply an assurance this
          project cannot give.
        */}
        <section className="panel stack-tight">
          <h2 className="panel-title">Review status</h2>
          <div className="tag-row">
            <span
              className={
                review.status === "current"
                  ? "tag tag--accent"
                  : review.status === "superseded"
                    ? "tag tag--warning"
                    : "tag"
              }
            >
              {review.label}
            </span>
            {age.stale ? <span className="tag tag--warning">{age.label}</span> : <span className="tag">{age.label}</span>}
          </div>
          <p className="meta" style={{ margin: 0 }}>
            {review.detail}
          </p>
          {review.latest ? (
            <table className="table table--numeric">
              <caption className="visually-hidden">
                The most recent review decision recorded for this document
              </caption>
              <tbody>
                <tr>
                  <th scope="row">Reviewer</th>
                  <td>{review.latest.reviewerName}</td>
                </tr>
                <tr>
                  <th scope="row">Stated credential</th>
                  <td>{review.latest.reviewerCredential}</td>
                </tr>
                <tr>
                  <th scope="row">Decision</th>
                  <td>{REVIEW_DECISION_LABELS[review.latest.decision]}</td>
                </tr>
                <tr>
                  <th scope="row">Recorded</th>
                  <td className="mono">{review.latest.reviewedAt.slice(0, 10)}</td>
                </tr>
                <tr>
                  <th scope="row">Covers revision</th>
                  <td className="mono" style={{ wordBreak: "break-all" }}>
                    {review.latest.contentSha256.slice(0, 16)}…
                    {review.status === "current" ? " (current)" : " (superseded)"}
                  </td>
                </tr>
                {review.latest.note ? (
                  <tr>
                    <th scope="row">Note</th>
                    <td>{review.latest.note}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
          <p className="meta" style={{ margin: 0 }}>
            Review records are held in the repository, not in the database, so each
            one has a commit and a date behind it. This deployment has not been
            clinically validated and is not a medical device.
          </p>
        </section>

        <section className="panel stack-tight">
          <h2 className="panel-title">Indexed revisions</h2>
          {revisions.length === 0 ? (
            <p style={{ margin: 0 }}>
              No revision history is recorded for this document. Revision tracking
              was added after this corpus was first indexed, and a revision is
              recorded when a document is re-ingested. The content hash above is
              the revision held now.
            </p>
          ) : (
            <table className="table table--numeric">
              <caption className="visually-hidden">
                Every distinct revision of this document that has been indexed
              </caption>
              <thead>
                <tr>
                  <th scope="col">Content hash</th>
                  <th scope="col">Words</th>
                  <th scope="col">Retrieved</th>
                  <th scope="col">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((revision) => (
                  <tr key={revision.id}>
                    <td className="mono" style={{ wordBreak: "break-all" }}>
                      {revision.contentSha256.slice(0, 16)}…
                      {revision.contentSha256 === doc.contentSha256 ? " (current)" : ""}
                    </td>
                    <td>{revision.wordCount.toLocaleString("en")}</td>
                    <td className="mono">{revision.retrievedAt.slice(0, 10)}</td>
                    <td className="mono">{revision.recordedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="meta" style={{ margin: 0 }}>
            A re-fetched page whose text is identical adds no revision, so each row
            is a version of the content rather than a record of a run.
          </p>
        </section>

          </div>

          <aside className="aside-stack">
            <div className="card">
              <p className="kicker">Document record</p>
              <h2 className="panel-title" style={{ marginTop: "var(--space-2)" }}>
                {doc.publisher}
              </h2>
              <dl className="detail-list" style={{ marginTop: "var(--space-4)" }}>
                <div>
                  <dt>Licence</dt>
                  <dd>{doc.licence}</dd>
                </div>
                <div>
                  <dt>Retrieved</dt>
                  <dd className="mono">{retrieved}</dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd>
                    {doc.wordCount.toLocaleString("en")} words in {chunks.length} indexed
                    passages
                  </dd>
                </div>
                <div>
                  <dt>Review status</dt>
                  <dd>
                    <span
                      className={
                        review.status === "current"
                          ? "tag tag--accent"
                          : review.status === "superseded"
                            ? "tag tag--warning"
                            : "tag"
                      }
                    >
                      {review.label}
                    </span>
                  </dd>
                </div>
              </dl>
              <div className="row" style={{ marginTop: "var(--space-5)" }}>
                <SaveResourceButton
                  signedIn={user !== null}
                  kind="library-document"
                  refId={doc.sourceId}
                  initiallySaved={alreadySaved}
                  label="Keep this document"
                />
                <a
                  className="btn btn--small"
                  href={doc.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open at publisher
                </a>
              </div>
            </div>

            <div className="card card--flat">
              <p className="kicker">How this text is used</p>
              <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
                The assistant may quote these passages only when they clear the relevance
                threshold, and every citation links back to this page so the claim can be
                checked against the publisher&apos;s own text.
              </p>
            </div>

            <Link className="btn" href="/library">
              Back to the library
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
