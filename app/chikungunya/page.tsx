import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { CommunityFeed } from "@/components/community/CommunityFeed";
import { getStore } from "@/lib/db/index";
import type { StoredDocument } from "@/lib/db/store";
import { listPosts } from "@/lib/community/store";
import {
  CHIKUNGUNYA_LIMITATIONS,
  CHIKUNGUNYA_SECTIONS,
  CHIKUNGUNYA_TOPIC_ID,
  FREQUENT_QUESTIONS,
  URGENT_SIGNS,
  URGENT_SIGNS_NOTE,
} from "@/lib/rag/chikungunya-content";

export const metadata: Metadata = {
  title: "Chikungunya",
  description:
    "Chikungunya explained from named public health sources: symptoms and progression, how it differs from dengue, diagnosis, care, medicine safety, prevention, and the warning signs that need urgent care.",
};

export const instant = false;

/** Resolves a source id to the stored document so every statement links out. */
function useSourceResolver() {
  const store = getStore();
  const cache = new Map<string, StoredDocument | null>();

  return (sourceId: string): StoredDocument | null => {
    if (cache.has(sourceId)) return cache.get(sourceId) ?? null;
    const doc = store.getDocumentBySourceId(sourceId);
    cache.set(sourceId, doc);
    return doc;
  };
}

function SourceRefs({
  sourceIds,
  resolve,
}: {
  sourceIds: string[];
  resolve: (id: string) => StoredDocument | null;
}) {
  const documents = sourceIds
    .map((id) => ({ id, doc: resolve(id) }))
    .filter((entry): entry is { id: string; doc: StoredDocument } =>
      Boolean(entry.doc),
    );

  if (documents.length === 0) {
    return (
      <p className="meta" style={{ margin: 0 }}>
        Source not indexed. Run <code className="mono">pnpm ingest</code> to
        fetch the corpus.
      </p>
    );
  }

  return (
    <p className="meta" style={{ margin: 0 }}>
      Source:{" "}
      {documents.map((entry, index) => (
        <span key={entry.id}>
          {index > 0 ? "; " : ""}
          <Link href={`/library/${entry.id}`}>{entry.doc.title}</Link> (
          {entry.doc.publisher})
        </span>
      ))}
    </p>
  );
}

export default async function ChikungunyaPage() {
  await connection();
  const resolve = useSourceResolver();

  const topicDocuments = getStore().listDocuments({ topic: CHIKUNGUNYA_TOPIC_ID });
  // Only real, currently visible discussions. The feed shows the actual reply and
  // helpful counts; it is not seeded or padded to make the page look busy.
  const communityPosts = listPosts({ diseaseId: "chikungunya", limit: 3 });
  const warningDocuments = Array.from(
    new Set(URGENT_SIGNS.flatMap((sign) => sign.sourceIds)),
  )
    .map((id) => resolve(id))
    .filter((doc): doc is StoredDocument => Boolean(doc));

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Mosquito-borne disease</p>
          <h1>Chikungunya</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            Chikungunya is a viral illness spread by day-biting Aedes mosquitoes,
            the same mosquitoes that transmit dengue. This page organises what{" "}
            {topicDocuments.length} named public health documents say about it,
            states where each statement comes from, and points to the assistant
            for anything more specific.
          </p>
        </div>

        <div className="notice notice--danger">
          <p className="notice__title">
            Seek emergency care now if any of these applies
          </p>
          <p>
            Do not finish reading this page first. Contact your local emergency
            number or go to the nearest emergency department.
          </p>
          <ul style={{ marginBottom: "var(--space-3)" }}>
            {URGENT_SIGNS.map((sign) => (
              <li key={sign.text}>{sign.text}</li>
            ))}
          </ul>
          <p style={{ marginBottom: "var(--space-3)" }}>{URGENT_SIGNS_NOTE}</p>
          {warningDocuments.length > 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              Warning signs as listed by:{" "}
              {warningDocuments.map((doc, index) => (
                <span key={doc.sourceId}>
                  {index > 0 ? "; " : ""}
                  <Link href={`/library/${doc.sourceId}`}>{doc.title}</Link> (
                  {doc.publisher})
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <div className="notice notice--info">
          <p className="notice__title">What this page is</p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>
              A structured summary of published guidance from the World Health
              Organization, India&apos;s National Centre for Vector Borne Diseases
              Control, the UK Health Security Agency, and MedlinePlus.
            </li>
            <li>
              Every statement is followed by the documents it came from, so you can
              open the original wording.
            </li>
            <li>
              It does not diagnose anything, gives no doses, and estimates no
              probabilities. <Link href="/method">How it works</Link> explains the
              same limits for the assistant.
            </li>
          </ul>
        </div>

        <section id="community" className="panel stack-tight" aria-labelledby="community-heading">
          <p className="kicker">Peer support</p>
          <h2 id="community-heading">Hear from people who have had it</h2>
          <p style={{ margin: 0 }}>
            Fact sheets describe the illness in general. The Chikungunya community
            is where people describe what recovery was actually like: joint pain at
            night, tiredness that lasted longer than expected, returning to work,
            and the questions they took to a doctor. Read without an account, or
            sign in to add your own experience.
          </p>
          <div className="community-actions">
            <Link className="btn btn--primary" href="/community/chikungunya">
              Open the Chikungunya community
            </Link>
            <Link className="btn" href="/community/guidelines">
              How the community works
            </Link>
          </div>
          {communityPosts.length > 0 ? (
            <div className="stack-tight">
              <h3 style={{ margin: 0 }}>Recent discussions</h3>
              <CommunityFeed posts={communityPosts} />
            </div>
          ) : (
            <p className="meta" style={{ margin: 0 }}>
              No one has started a discussion in this community yet. A short
              question is enough to begin.
            </p>
          )}
          <p className="meta" style={{ margin: 0 }}>
            Community posts are personal experience, not medical guidance. They are
            kept separate from the sources on this page and are never added to the
            assistant&apos;s medical corpus.
          </p>
        </section>

        <nav aria-label="Sections on this page" className="panel">
          <p className="field__label" id="topic-nav-label">
            On this page
          </p>
          <ul
            className="tag-row"
            aria-labelledby="topic-nav-label"
            style={{ listStyle: "none", padding: 0, margin: 0 }}
          >
            {CHIKUNGUNYA_SECTIONS.map((section) => (
              <li key={section.id}>
                <a className="chip" href={`#${section.id}`}>
                  {section.heading}
                </a>
              </li>
            ))}
            <li>
              <a className="chip" href="#questions">
                Questions to ask
              </a>
            </li>
            <li>
              <a className="chip" href="#sources">
                Sources
              </a>
            </li>
          </ul>
        </nav>

        {CHIKUNGUNYA_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="stack-tight">
            <h2>{section.heading}</h2>
            {section.intro ? <p className="lede">{section.intro}</p> : null}

            {section.statements.length > 0 ? (
              <ul style={{ paddingLeft: "var(--space-5)", margin: 0 }}>
                {section.statements.map((statement) => (
                  <li key={statement.text} style={{ marginBottom: "var(--space-3)" }}>
                    <p style={{ margin: 0 }}>{statement.text}</p>
                    <SourceRefs sourceIds={statement.sourceIds} resolve={resolve} />
                  </li>
                ))}
              </ul>
            ) : null}

            {section.comparison ? (
              <>
                <p className="meta" style={{ margin: 0 }}>
                  Comparison drawn from the two WHO fact sheets. Each row names the
                  documents behind it.
                </p>
                {/*
                  Rendered as one block per feature rather than a three-column
                  table. In a table the source list had to live inside the narrow
                  row-header cell and squeezed it to a few characters per line on a
                  narrow screen. A block keeps the two sides adjacent, which is what
                  a comparison is for, and gives the provenance room.
                */}
                {section.comparison.map((row) => (
                  <div
                    key={row.label}
                    className="card stack-tight"
                    style={{ marginBottom: "var(--space-4)" }}
                  >
                    <h3 style={{ fontSize: "1rem", margin: 0 }}>{row.label}</h3>
                    <p style={{ margin: 0 }}>
                      <strong className="mono">Chikungunya:</strong> {row.chikungunya}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong className="mono">Dengue:</strong> {row.dengue}
                    </p>
                    <SourceRefs sourceIds={row.sourceIds} resolve={resolve} />
                  </div>
                ))}
              </>
            ) : null}
          </section>
        ))}

        <section id="questions" className="stack-tight">
          <h2>Questions to ask the assistant</h2>
          <p className="lede">
            These open the assistant with your question already written. Answers
            there are generated from retrieved passages and carry citations that can
            be checked, unlike the summaries above.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {FREQUENT_QUESTIONS.map((item) => (
              <li key={item.question} style={{ marginBottom: "var(--space-3)" }}>
                <Link
                  className="btn"
                  href={`/assistant?q=${encodeURIComponent(item.question)}&topic=${CHIKUNGUNYA_TOPIC_ID}`}
                >
                  {item.question}
                </Link>
                <div style={{ marginTop: "var(--space-2)" }}>
                  <SourceRefs sourceIds={item.sourceIds} resolve={resolve} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="sources" className="stack-tight">
          <h2>Sources used on this page</h2>
          {topicDocuments.length === 0 ? (
            <div className="notice notice--warning">
              <p className="notice__title">The topic is not indexed</p>
              <p style={{ margin: 0 }}>
                Run <code className="mono">pnpm ingest</code> in the website
                directory, then reload this page.
              </p>
            </div>
          ) : (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {topicDocuments.map((doc) => (
                  <li
                    key={doc.sourceId}
                    className="card"
                    style={{ marginBottom: "var(--space-4)" }}
                  >
                    <h3 style={{ fontSize: "1.05rem" }}>
                      <Link href={`/library/${doc.sourceId}`}>{doc.title}</Link>
                    </h3>
                    <p className="meta" style={{ margin: 0 }}>
                      {doc.publisher} · retrieved{" "}
                      {new Date(doc.retrievedAt).toISOString().slice(0, 10)}
                    </p>
                    <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
                      {doc.licence}
                    </p>
                    <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
                      <a href={doc.sourceUrl} rel="noreferrer noopener" target="_blank">
                        Original document
                      </a>
                      {" · "}
                      <Link href={`/library/${doc.sourceId}`}>
                        Indexed text and provenance
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
              <p className="meta">
                Every document in this topic is browsable in the{" "}
                <Link href={`/library?topic=${CHIKUNGUNYA_TOPIC_ID}`}>
                  source library
                </Link>
                , with its content hash and retrieval date.
              </p>
            </>
          )}
        </section>

        <section className="stack-tight">
          <h2>Limitations</h2>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            {CHIKUNGUNYA_LIMITATIONS.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
