import Link from "next/link";

import { formatDate, formatDateTime } from "@/lib/community/format";
import { getDisease, topicLabel } from "@/lib/community/diseases";
import type { PostSummary } from "@/lib/community/store";

/**
 * One feed, used by the community hub and every disease page.
 *
 * Only real counts from the database are shown. An unanswered post is labelled
 * because it is a useful thing to notice, not to create pressure: there is no
 * badge for "trending" and no member total.
 */
export function CommunityFeed({
  posts,
  showDisease = false,
  emptyTitle = "No discussions yet",
  emptyBody = "Be the first to start one. A short question is enough.",
  emptyHref,
  emptyLabel = "Start a discussion",
}: {
  posts: readonly PostSummary[];
  showDisease?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  emptyHref?: string;
  emptyLabel?: string;
}) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        <p className="meta" style={{ margin: 0 }}>
          {emptyBody}
        </p>
        {emptyHref ? (
          <Link className="btn btn--primary btn--small" href={emptyHref}>
            {emptyLabel}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="community-feed list-plain">
      {posts.map((post) => {
        const disease = getDisease(post.diseaseId);
        return (
          <li key={post.id}>
            <article className="community-post">
              <div className="community-post__tags">
                {showDisease && disease ? (
                  <Link
                    className="tag tag--accent"
                    href={`/community/${disease.id}`}
                  >
                    {disease.shortName}
                  </Link>
                ) : null}
                <span className="tag">{topicLabel(post.diseaseId, post.topicId)}</span>
                {post.commentCount === 0 ? (
                  <span className="tag tag--warning">No replies yet</span>
                ) : null}
              </div>

              <h3 className="community-post__title">
                <Link href={`/community/${post.diseaseId}/${post.id}`}>
                  {post.title}
                </Link>
              </h3>

              <p className="community-post__meta">
                <span>{post.authorName}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={post.createdAt} title={formatDateTime(post.createdAt)}>
                  {formatDate(post.createdAt)}
                </time>
                {post.editedAt ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>edited</span>
                  </>
                ) : null}
              </p>

              <p className="community-post__excerpt">{post.excerpt}</p>

              <p className="community-post__stats">
                <span>
                  {post.commentCount === 1
                    ? "1 reply"
                    : `${post.commentCount} replies`}
                </span>
                <span aria-hidden="true"> · </span>
                <span>
                  {post.reactionCount === 0
                    ? "Not marked helpful yet"
                    : post.reactionCount === 1
                      ? "1 person marked this helpful"
                      : `${post.reactionCount} people marked this helpful`}
                </span>
              </p>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
