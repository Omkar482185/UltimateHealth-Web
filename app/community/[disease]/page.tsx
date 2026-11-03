import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CommunityComposer } from "@/components/community/CommunityComposer";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { CommunityFilters } from "@/components/community/CommunityFilters";
import { ExperienceExplorer } from "@/components/community/ExperienceExplorer";
import { ExternalSupport } from "@/components/community/ExternalSupport";
import { FollowButton } from "@/components/community/FollowButton";
import { getCurrentUser } from "@/lib/auth/cookies";
import { GUIDELINES } from "@/lib/community/content";
import {
  DISEASES,
  getDisease,
  isCommunityTopic,
} from "@/lib/community/diseases";
import {
  PROVIDER_FINDINGS,
  verifiedFallbacks,
} from "@/lib/community/experience-search";
import { externalResourcesFor } from "@/lib/community/external";
import { isModerator } from "@/lib/community/roles";
import {
  isCommunitySort,
  isFollowing,
  listDiseaseStats,
  listPosts,
  type CommunityViewer,
} from "@/lib/community/store";

export const instant = false;

type Params = Promise<{ disease: string }>;
type SearchParams = Promise<{
  topic?: string;
  q?: string;
  sort?: string;
  notice?: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const disease = getDisease((await params).disease);
  if (!disease) return { title: "Community not found" };
  return {
    title: `${disease.name} community`,
    description: `Peer support for people affected by ${disease.name.toLowerCase()}: personal experiences, practical questions, and replies from other people. Not medical advice.`,
  };
}

export default async function DiseaseCommunityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { disease: diseaseId } = await params;
  const disease = getDisease(diseaseId);
  if (!disease) notFound();
  await connection();

  const query = await searchParams;
  const user = await getCurrentUser();
  const viewer: CommunityViewer | null = user
    ? { id: user.id, isModerator: isModerator(user.email) }
    : null;

  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const topicId =
    typeof query.topic === "string" && isCommunityTopic(disease.id, query.topic)
      ? query.topic
      : undefined;
  const sort = isCommunitySort(query.sort) ? query.sort : "recent";
  const justDeleted = query.notice === "deleted";

  const stats = listDiseaseStats().find((row) => row.diseaseId === disease.id);
  const posts = listPosts({
    diseaseId: disease.id,
    topicId,
    query: q || undefined,
    sort,
    limit: 40,
    viewer,
  });
  const unanswered = listPosts({
    diseaseId: disease.id,
    sort: "unanswered",
    limit: 4,
    viewer,
  });
  const following = user ? isFollowing(user.id, disease.id) : false;
  const filtered = Boolean(q || topicId || sort !== "recent");
  const external = externalResourcesFor(disease.id);
  /* Only this disease's destinations are serialised into this page; passing the
   * whole directory would ship every other community's external links to a reader
   * who asked about this condition. */
  const experienceFallbacks = { [disease.id]: verifiedFallbacks(disease.id) };

  return (
    <section className="section section--flush">
      <div className="container stack">
        <nav aria-label="Breadcrumb" className="meta">
          <Link href="/community">Community</Link> / {disease.name}
        </nav>

        <div className="page-head">
          <p className="eyebrow">Peer community</p>
          <h1>{disease.name} community</h1>
          <p className="lede">{disease.intro}</p>
          <p className="lede" style={{ margin: 0 }}>
            {disease.purpose}
          </p>

          <div className="community-actions">
            <a className="btn btn--primary" href="#start">
              Share an experience or ask a question
            </a>
            <Link className="btn" href="#experiences">
              Read patient experiences
            </Link>
            {disease.infoPath ? (
              <Link className="btn" href={disease.infoPath}>
                Read the medical information
              </Link>
            ) : null}
            <FollowButton
              diseaseId={disease.id}
              initialFollowing={following}
              signedIn={Boolean(user)}
            />
          </div>
        </div>

        <div className="grid-2">
          <div className="notice notice--warning">
            <p className="notice__title">Experiences here are not medical advice</p>
            <p style={{ margin: 0 }}>
              A member describing what helped them is one person&apos;s account, not
              a proven treatment. Nothing in this community should replace a
              conversation with a clinician who knows your situation.
            </p>
          </div>
          <div className="notice notice--danger">
            <p className="notice__title">Urgent symptoms need urgent care</p>
            <p style={{ margin: 0 }}>
              This community is not monitored continuously and cannot respond to an
              emergency. Contact local emergency services or an urgent care service
              now. The{" "}
              <Link href="/guidance">symptom guidance page</Link> lists warning
              signs.
            </p>
          </div>
        </div>

        {justDeleted ? (
          <div className="notice notice--info" role="status">
            <p className="notice__title">Your discussion was deleted</p>
            <p style={{ margin: 0 }}>
              It no longer appears in the public feed. Replies to it are no longer
              reachable from the community.
            </p>
          </div>
        ) : null}

        {user ? (
          <CommunityComposer
            diseaseId={disease.id}
            topics={disease.topics}
            starterQuestion={disease.starterQuestion}
          />
        ) : (
          <section id="start" className="panel stack" aria-labelledby="join-heading">
            <div className="section-head" style={{ margin: 0 }}>
              <div className="section-head__text">
                <p className="kicker">Add your experience</p>
                <h2 id="join-heading" style={{ fontSize: "1.45rem" }}>
                  Start a discussion
                </h2>
                <p className="meta" style={{ marginBottom: 0 }}>
                  Reading is open to everyone. Posting and replying need an account
                  so that authorship and moderation mean something.
                </p>
              </div>
              <Link className="btn btn--primary" href="/account">
                Sign in to post
              </Link>
            </div>
            <p className="meta" style={{ margin: 0 }}>
              Your public name is your profile display name or a generated
              pseudonym. Your email address and health profile are never shown.
            </p>
          </section>
        )}

        <section id="feed" className="stack-tight" aria-labelledby="feed-heading">
          <div className="section-head">
            <div className="section-head__text">
              <p className="kicker">Discussion feed</p>
              <h2 id="feed-heading">
                {filtered ? "Matching discussions" : "Recent discussions"}
              </h2>
              <p>
                {stats
                  ? `${stats.posts} ${stats.posts === 1 ? "discussion" : "discussions"} in this community, ${stats.unanswered} waiting for a first reply.`
                  : "No discussions yet. A short question is enough to begin."}
              </p>
            </div>
          </div>

          <div className="tag-row" role="group" aria-label="Filter by topic">
            <Link
              className={topicId ? "chip" : "chip chip--active"}
              href={`/community/${disease.id}#feed`}
            >
              All topics
            </Link>
            {disease.topics.map((topic) => (
              <Link
                key={topic.id}
                className={topicId === topic.id ? "chip chip--active" : "chip"}
                href={`/community/${disease.id}?topic=${topic.id}#feed`}
                title={topic.hint}
              >
                {topic.label}
              </Link>
            ))}
          </div>

          <CommunityFilters
            action={`/community/${disease.id}`}
            q={q}
            sort={sort}
            topics={disease.topics}
            topicId={topicId}
          />

          <CommunityFeed
            posts={posts}
            emptyTitle={filtered ? "No discussions match" : "No discussions yet"}
            emptyBody={
              filtered
                ? "Try a shorter search, another topic, or clear the filters."
                : "Be the first to describe an experience or ask a practical question. Posts are public and show a display name or pseudonym."
            }
            emptyHref={user ? "#start" : undefined}
            emptyLabel="Write the first post"
          />
        </section>

        <section className="stack-tight" aria-labelledby="unanswered-heading">
          <div className="section-head">
            <div className="section-head__text">
              <p className="kicker">A reply can help</p>
              <h2 id="unanswered-heading" style={{ fontSize: "1.6rem" }}>
                Unanswered questions
              </h2>
              <p>
                Questions with no replies. If you have relevant experience, a short
                answer is welcome.
              </p>
            </div>
          </div>
          <CommunityFeed
            posts={unanswered}
            emptyTitle="Nothing is waiting for a reply"
            emptyBody="Every discussion in this community has at least one reply."
          />
        </section>

        <div className="grid-2">
          <section className="panel stack-tight" aria-labelledby="related-heading">
            <p className="kicker">Evidence, not anecdotes</p>
            <h2 id="related-heading" style={{ fontSize: "1.4rem" }}>
              Related health information
            </h2>
            <p className="meta" style={{ margin: 0 }}>
              Community posts are not added to the assistant&apos;s medical corpus.
              These links open the sourced material instead.
            </p>
            <div className="community-actions">
              {disease.infoPath ? (
                <Link className="btn btn--small" href={disease.infoPath}>
                  {disease.name}: what the sources say
                </Link>
              ) : null}
              {disease.corpusTopic ? (
                <>
                  <Link
                    className="btn btn--small"
                    href={`/library?topic=${disease.corpusTopic}`}
                  >
                    Browse the source documents
                  </Link>
                  <Link
                    className="btn btn--small"
                    href={`/assistant?topic=${disease.corpusTopic}`}
                  >
                    Ask the assistant
                  </Link>
                </>
              ) : (
                <>
                  <Link className="btn btn--small" href="/library">
                    Browse the source library
                  </Link>
                  <Link className="btn btn--small" href="/assistant">
                    Ask the assistant
                  </Link>
                </>
              )}
            </div>
            {!disease.corpusTopic ? (
              <p className="meta" style={{ margin: 0 }}>
                This condition is not yet represented in the curated medical
                corpus. The assistant will say when the evidence does not cover a
                question rather than inventing an answer; general support here is
                peer experience, not clinical guidance.
              </p>
            ) : null}
          </section>

          <section className="panel stack-tight" aria-labelledby="rules-heading">
            <p className="kicker">Before you post</p>
            <h2 id="rules-heading" style={{ fontSize: "1.4rem" }}>
              Community guidelines
            </h2>
            <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
              {GUIDELINES.slice(0, 4).map((rule) => (
                <li key={rule.title}>
                  <strong>{rule.title}.</strong> {rule.body}
                </li>
              ))}
            </ul>
            <Link className="btn btn--small" href="/community/guidelines">
              Read all guidelines and the safety policy
            </Link>
          </section>
        </div>

        <ExperienceExplorer
          diseases={[
            {
              id: disease.id,
              name: disease.name,
              shortName: disease.shortName,
              starterQuestion: disease.starterQuestion,
            },
          ]}
          initialDiseaseId={disease.id}
          signedIn={Boolean(user)}
          showDiseaseSelect={false}
          fallbacks={experienceFallbacks}
          providerFindings={PROVIDER_FINDINGS}
        />

        <ExternalSupport disease={disease} resources={external} />

        <p className="meta" style={{ margin: 0 }}>
          Other communities:{" "}
          {DISEASES.filter((item) => item.id !== disease.id).map((item, index) => (
            <span key={item.id}>
              {index > 0 ? " · " : ""}
              <Link href={`/community/${item.id}`}>{item.name}</Link>
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
