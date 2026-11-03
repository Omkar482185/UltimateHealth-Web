import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { AssistantPanel } from "@/components/AssistantPanel";
import { DISEASES } from "@/lib/community/diseases";
import { RETRIEVAL } from "@/lib/config";
import { getCorpusSummary } from "@/lib/corpus-summary";
import { TOPIC_LABELS, type TopicId } from "@/lib/corpus/sources";

export const metadata: Metadata = {
  title: "Health assistant",
  description:
    "Ask a health question and receive an answer assembled from a fixed corpus of public health guidance, with the passages behind every claim.",
};
export const instant = false;

/**
 * A topic link, for example from the Chikungunya page, arrives as query
 * parameters. The topic is only honoured when it names a topic that actually
 * exists, so an arbitrary value cannot silently narrow retrieval to nothing.
 */
type SearchParams = Promise<{ q?: string; topic?: string }>;

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await connection();
  const corpus = getCorpusSummary();
  const params = await searchParams;

  const requestedTopic = params.topic;
  const validTopic =
    requestedTopic && corpus.topics.some((t) => t.topic === requestedTopic)
      ? requestedTopic
      : undefined;
  const initialQuestion =
    params.q && params.q.trim().length >= 4 ? params.q.trim().slice(0, 500) : undefined;

  // Community suggestions follow the same topic restriction as retrieval, so a
  // chikungunya question never offers an unrelated condition's community. These
  // are peer-support spaces, not part of the assistant's evidence.
  const relatedCommunities = validTopic
    ? DISEASES.filter((disease) => disease.corpusTopic === validTopic)
    : [];

  return (
    <section className="section section--flush">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Retrieval-augmented assistant</p>
          <h1>Ask, and see the evidence beside the answer</h1>
          <p className="lede">
            The assistant answers from {corpus.documentCount} source documents across{" "}
            {corpus.publisherCount} publishers. It uses two independent retrieval methods
            and only cites passages it was given. If nothing in the library is relevant
            enough, it declines rather than improvising.
          </p>
        </div>

        <div className="page-grid" style={{ marginTop: "var(--space-6)" }}>
          <div className="stack">
            <div className="notice notice--info">
              <p className="notice__title">Before you ask</p>
              <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                <li>
                  This assistant provides general health education. It does not diagnose
                  conditions and does not replace a clinician.
                </li>
                <li>
                  It will not give medication doses, and it will not advise starting,
                  stopping, or changing a prescribed medicine.
                </li>
                <li>
                  Questions containing emergency warning signs are intercepted before
                  retrieval and answered with urgent care guidance instead.{" "}
                  <Link href="/guidance">The symptom guidance page</Link> also lists
                  those warning signs up front.
                </li>
              </ul>
            </div>

            <AssistantPanel
              initialQuestion={initialQuestion}
              topic={validTopic}
              topicLabel={validTopic ? TOPIC_LABELS[validTopic as TopicId] : undefined}
            />
          </div>

          <aside className="aside-stack">
            <div className="panel">
              <p className="kicker">Abstention is a feature</p>
              <h2 style={{ fontSize: "1.35rem", marginTop: "var(--space-2)" }}>
                Why the assistant sometimes declines
              </h2>
              <p style={{ marginTop: "var(--space-3)" }}>
                A system that always produces an answer is not grounding itself in
                anything. This one declines when the emergency screen fires, when
                retrieval returns no candidates, when the best candidate falls below the
                relevance threshold of{" "}
                <span className="mono">{RETRIEVAL.minCosine}</span> cosine similarity, or
                when the model reports that the retrieved passages do not cover the
                question. Each of those paths is visible in the interface rather than
                hidden.
              </p>
              <Link className="btn btn--small" href="/method">
                Read the method and evaluation
              </Link>
            </div>

            {relatedCommunities.length > 0 ? (
              <div className="panel stack-tight">
                <p className="kicker">Peer support</p>
                <h2 style={{ fontSize: "1.25rem", marginTop: 0 }}>
                  Talk to people who have been through it
                </h2>
                <p className="meta" style={{ margin: 0 }}>
                  The assistant answers from published guidance. Community members
                  describe their own experience, which is a different kind of
                  information: useful for the practical side of an illness, but not
                  evidence that a treatment works.
                </p>
                <div className="community-actions">
                  {relatedCommunities.map((disease) => (
                    <Link
                      className="btn btn--small"
                      key={disease.id}
                      href={`/community/${disease.id}`}
                    >
                      {disease.name} community
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card card--flat">
                <p className="kicker">Peer support</p>
                <p className="meta" style={{ margin: "var(--space-2) 0 var(--space-3)" }}>
                  People living with a condition often describe the practical parts
                  that guidance cannot: appointments, recovery, and daily life.
                </p>
                <Link className="btn btn--small" href="/community">
                  Browse the community
                </Link>
              </div>
            )}

            <div className="card card--flat">
              <p className="kicker">Privacy</p>
              <p className="meta" style={{ margin: "var(--space-2) 0 0" }}>
                A question is never stored against your account, even when you are signed
                in. Questions are logged for evaluation without any identifier of any
                kind, and the assistant cannot read your health records.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
