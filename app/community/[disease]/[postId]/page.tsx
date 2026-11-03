import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CommentThread } from "@/components/community/CommentThread";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { PostInteractions } from "@/components/community/PostInteractions";
import { PostOwnerActions } from "@/components/community/PostOwnerActions";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getDisease, topicLabel } from "@/lib/community/diseases";
import { formatDate, formatDateTime } from "@/lib/community/format";
import { isModerator } from "@/lib/community/roles";
import {
  getPost,
  listComments,
  listPosts,
  type CommunityViewer,
} from "@/lib/community/store";

export const metadata: Metadata = {
  title: "Discussion",
  description:
    "A peer-support discussion on UltimateHealth. Members describe their own experience; this is not medical advice.",
};

export const instant = false;

type Params = Promise<{ disease: string; postId: string }>;
type SearchParams = Promise<{ published?: string }>;

function parsePostId(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function CommunityThreadPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { disease: diseaseId, postId: rawPostId } = await params;
  const disease = getDisease(diseaseId);
  if (!disease) notFound();

  const postId = parsePostId(rawPostId);
  if (postId === null) notFound();

  await connection();

  const user = await getCurrentUser();
  const viewer: CommunityViewer | null = user
    ? { id: user.id, isModerator: isModerator(user.email) }
    : null;
  const post = getPost(postId, viewer);
  if (!post || post.diseaseId !== disease.id) notFound();

  const comments = listComments(post.id, viewer);
  const isOwner = user !== null && user.id === post.authorId;
  const removed = post.removedAt !== null;
  const published = (await searchParams).published === "1";

  const related = listPosts({
    diseaseId: disease.id,
    limit: 4,
    viewer,
  }).filter((item) => item.id !== post.id);

  return (
    <section className="section section--flush">
      <div className="container container--narrow stack">
        <nav aria-label="Breadcrumb" className="meta">
          <Link href="/community">Community</Link> /{" "}
          <Link href={`/community/${disease.id}`}>{disease.name}</Link> / Discussion
        </nav>

        {published ? (
          <div className="notice notice--info" role="status">
            <p className="notice__title">Your discussion is published</p>
            <p style={{ margin: 0 }}>
              It is public now and appears in the {disease.name} community. You can
              edit or delete it at any time from this page.
            </p>
          </div>
        ) : null}

        {removed ? (
          <div className="notice notice--warning">
            <p className="notice__title">
              {post.removedBy === "author"
                ? "The author deleted this discussion"
                : "A moderator removed this discussion"}
            </p>
            <p style={{ margin: 0 }}>
              It is hidden from the public feed.{" "}
              {viewer?.isModerator
                ? "You can see it because you are a moderator. Review it in the moderation queue before restoring it."
                : "Only you and moderators can see this page."}
            </p>
          </div>
        ) : null}

        <article className="stack">
          <header className="stack-tight">
            <div className="community-post__tags">
              <Link className="tag tag--accent" href={`/community/${disease.id}`}>
                {disease.name}
              </Link>
              <span className="tag">
                {topicLabel(post.diseaseId, post.topicId)}
              </span>
              {post.commentCount === 0 ? (
                <span className="tag tag--warning">No replies yet</span>
              ) : null}
            </div>

            <h1 style={{ fontSize: "clamp(1.75rem, 1.3rem + 1.8vw, 2.6rem)" }}>
              {post.title}
            </h1>

            <p className="meta" style={{ margin: 0 }}>
              <strong>{post.authorName}</strong>
              <span aria-hidden="true"> · </span>
              <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
                {formatDate(post.createdAt)}
              </time>
              {post.editedAt ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>edited {formatDate(post.editedAt)}</span>
                </>
              ) : null}
              {isOwner ? <span className="tag" style={{ marginLeft: "var(--space-2)" }}>You</span> : null}
            </p>

            <p className="meta" style={{ margin: 0 }}>
              This is one person&apos;s account of their own experience. It is not
              verified medical information, a diagnosis, or a treatment
              recommendation.
            </p>
          </header>

          <div className="community-body">{post.body}</div>

          {!removed ? (
            <PostInteractions
              postId={post.id}
              initialCount={post.reactionCount}
              initialReacted={post.helpedByViewer}
              signedIn={Boolean(user)}
              canReport={Boolean(user) && !isOwner}
            />
          ) : null}

          {isOwner && !removed ? (
            <PostOwnerActions
              postId={post.id}
              diseaseId={disease.id}
              initialTitle={post.title}
              initialBody={post.body}
            />
          ) : null}

          {!user ? (
            <div className="notice notice--info">
              <p className="notice__title">Sign in to take part</p>
              <p style={{ margin: 0 }}>
                <Link href="/account">Sign in or create an account</Link> to reply,
                mark a discussion helpful, or report unsafe content. Reading is open
                to everyone.
              </p>
            </div>
          ) : null}

          <CommentThread
            postId={post.id}
            comments={comments}
            viewerId={user?.id ?? null}
            signedIn={Boolean(user)}
            isModerator={Boolean(viewer?.isModerator)}
            locked={removed}
          />
        </article>

        <div className="panel stack-tight">
          <p className="kicker">Not medical advice</p>
          <p style={{ margin: 0 }}>
            If you need to make a decision about treatment, tests, or medicines,
            speak to a clinician. For the sourced medical picture, read the{" "}
            {disease.infoPath ? (
              <Link href={disease.infoPath}>{disease.name} information page</Link>
            ) : disease.corpusTopic ? (
              <Link href={`/library?topic=${disease.corpusTopic}`}>source library</Link>
            ) : (
              <Link href="/library">source library</Link>
            )}
            . For urgent symptoms, contact emergency services rather than waiting
            for a reply here.
          </p>
        </div>

        <section className="stack-tight" aria-labelledby="more-heading">
          <div className="section-head">
            <div className="section-head__text">
              <p className="kicker">Keep reading</p>
              <h2 id="more-heading" style={{ fontSize: "1.5rem" }}>
                More in {disease.name}
              </h2>
            </div>
            <Link className="btn btn--small" href={`/community/${disease.id}`}>
              Back to the community
            </Link>
          </div>
          <CommunityFeed
            posts={related}
            emptyTitle="No other discussions yet"
            emptyBody="This may be the first thread in this community."
          />
        </section>
      </div>
    </section>
  );
}
