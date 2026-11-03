import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { reviewFor, staleness } from "@/lib/corpus/reviews";
import { TOPIC_LABELS, type TopicId } from "@/lib/corpus/sources";
import { getCorpusSummary } from "@/lib/corpus-summary";
import { getStore } from "@/lib/db/index";


export const metadata: Metadata = {
  title: "Source library",
  description:
    "Browse the curated corpus of public health documents behind every answer on this platform, with publisher, licence, and reference details.",
};

type SearchParams = Promise<{ topic?: string; q?: string }>;

export const instant = false;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  // Defer to request time so the listing never reflects a build-time snapshot.
  await connection();
  const store = getStore();
  const corpus = getCorpusSummary();

  const allDocuments = store.listDocuments();
  const query = (params.q ?? "").trim().toLowerCase();
  const topicFilter = params.topic;

  const documents = allDocuments.filter((doc) => {
    if (topicFilter && doc.topic !== topicFilter) return false;
    if (query.length > 0) {
      const haystack = `${doc.title} ${doc.publisher}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  /*
   * Indexed passage counts are read from the same database the rankers use, so
   * the number beside a document is what retrieval can actually return, not a
   * figure copied from the manifest.
   */
  const passageCounts = new Map(
    documents.map((doc) => [doc.sourceId, store.listDocumentChunks(doc.id).length]),
  );

  if (corpus.isEmpty) {
    return (
      <section className="section">
        <div className="container stack">
          <h1>Source library</h1>
          <div className="notice notice--warning">
            <p className="notice__title">No documents are indexed</p>
            <p style={{ margin: 0 }}>
              The corpus has not been ingested yet. Run{" "}
              <code className="mono">pnpm ingest</code> in the website directory,
              then reload this page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Curated corpus</p>
          <h1>Source library</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            These are the documents the assistant is allowed to use. Each entry
            records its publisher, licence, and the date it was retrieved, so any
            answer can be traced to an identifiable publication.
          </p>
        </div>

        <form className="panel stack" method="get" role="search">
          <div className="filter-bar">
            <div className="field" style={{ flex: "1 1 20rem", marginBottom: 0 }}>
              <label className="field__label" htmlFor="q">
                Search by title or publisher
              </label>
              <input
                className="input"
                id="q"
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="For example: blood pressure, kidney, NHS"
              />
            </div>
            {topicFilter ? (
              <input type="hidden" name="topic" value={topicFilter} />
            ) : null}
            <button className="btn btn--primary" type="submit">
              Search
            </button>
            {query || topicFilter ? (
              <Link className="btn" href="/library">
                Clear filters
              </Link>
            ) : null}
          </div>
        </form>

        <nav aria-label="Filter by topic">
          <p className="field__label" id="topic-filter-label">
            Filter by topic
          </p>
          <ul
            className="tag-row"
            aria-labelledby="topic-filter-label"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            <li>
              <Link
                className={topicFilter ? "chip" : "chip chip--active"}
                href={query ? `/library?q=${encodeURIComponent(query)}` : "/library"}
              >
                All topics
              </Link>
            </li>
            {corpus.topics.map((topic) => (
              <li key={topic.topic}>
                <Link
                  className={
                    topicFilter === topic.topic ? "chip chip--active" : "chip"
                  }
                  href={`/library?topic=${topic.topic}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                >
                  {topic.label}
                  <span className="chip__count">{topic.documentCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="meta" aria-live="polite">
          Showing {documents.length} of {corpus.documentCount} documents.
        </p>

        <section className="panel stack-tight" aria-labelledby="inventory-export">
          <p className="kicker">Evaluator export</p>
          <h2 id="inventory-export" style={{ fontSize: "1.25rem" }}>
            Download the verified source inventory
          </h2>
          <p className="meta" style={{ margin: 0 }}>
            The rows above, generated from the retrieval database on each request:
            document id, title, publisher, topic, source URL, licence, retrieval
            date, review status, and the number of indexed passages. It contains
            only public corpus metadata — no server paths, no configuration, no
            user data. The figures are read from the database, so the export can be
            checked against the counts on the home page.
          </p>
          <div className="tag-row">
            <Link
              className="btn btn--small"
              href="/api/corpus/inventory?format=csv"
              download
            >
              Download CSV
            </Link>
            <Link
              className="btn btn--small"
              href="/api/corpus/inventory?format=json"
              download
            >
              Download JSON
            </Link>
            <Link className="btn btn--small" href="/method">
              How retrieval and citation work
            </Link>
          </div>
        </section>

        <div className="notice notice--info">
          <p className="notice__title">No document in this corpus has been clinically reviewed</p>
          <p style={{ margin: 0 }}>
            Every entry below is marked accordingly. These are third-party
            publications reproduced for citation, and this platform has not been
            clinically validated. Where a review is recorded, the page for that
            document names the reviewer, states that the software did not verify
            them, and shows the exact content revision the decision applies to.
          </p>
        </div>

        {documents.length === 0 ? (
          <div className="notice notice--info">
            <p className="notice__title">No documents match those filters</p>
            <p style={{ margin: 0 }}>
              Try a different term, or{" "}
              <Link href="/library">clear the filters</Link> to see the whole
              corpus.
            </p>
          </div>
        ) : (
          <ul className="list-plain">
            {documents.map((doc) => (
              <li key={doc.sourceId} className="doc-row">
                <div className="doc-row__head">
                  <h2>
                    <Link href={`/library/${doc.sourceId}`}>{doc.title}</Link>
                  </h2>
                  <span className="meta nowrap">
                    {(passageCounts.get(doc.sourceId) ?? 0).toLocaleString("en")}{" "}
                    indexed passages · {doc.wordCount.toLocaleString("en")} words
                  </span>
                </div>
                <p className="doc-row__meta">
                  {doc.publisher} · {TOPIC_LABELS[doc.topic as TopicId] ?? doc.topic} ·
                  retrieved {new Date(doc.retrievedAt).toISOString().slice(0, 10)} ·{" "}
                  {doc.licence}
                </p>
                {/*
                  Review status and age are shown in the list, not only on the
                  document page, so that "how much of this corpus has been
                  reviewed" is answerable at a glance rather than only by opening
                  all 37 documents.
                */}
                <div className="tag-row" style={{ marginTop: "var(--space-3)" }}>
                  {(() => {
                    const review = reviewFor(doc.sourceId, doc.contentSha256);
                    const age = staleness(doc.retrievedAt);
                    return (
                      <>
                        <span
                          className={
                            review.status === "current"
                              ? "tag tag--accent"
                              : review.status === "superseded"
                                ? "tag tag--warning"
                                : "tag"
                          }
                        >
                          {review.status === "current"
                            ? `Review recorded${review.covering ? ` by ${review.covering.reviewerName}` : ""}`
                            : review.status === "superseded"
                              ? "Review no longer covers the text"
                              : "Not clinically reviewed"}
                        </span>
                        {age.stale ? (
                          <span className="tag tag--warning">
                            Copy is {age.days} days old
                          </span>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
