/**
 * Community data access.
 *
 * Every mutation takes the acting user id explicitly and every ownership check is
 * made in SQL rather than in a page or a client component. A caller therefore
 * cannot edit or delete another person's post by changing a request body: the
 * account comes from the session cookie, and the update is scoped to that account
 * or to the moderator path.
 *
 * Removed content is kept as a row but its body is not returned to ordinary
 * readers. `listComments` masks a removed body unless the viewer wrote it or is a
 * moderator, so a page cannot accidentally render text that was taken down.
 */
import { getDb } from "@/lib/db/index";
import { publicDisplayName } from "@/lib/community/content";
import { isCommunityTopic, isDiseaseId } from "@/lib/community/diseases";

export type CommunitySort = "recent" | "active" | "helpful" | "unanswered";

export const COMMUNITY_SORTS: readonly { id: CommunitySort; label: string }[] = [
  { id: "recent", label: "Newest first" },
  { id: "active", label: "Recently active" },
  { id: "helpful", label: "Most marked helpful" },
  { id: "unanswered", label: "Unanswered questions" },
];

export function isCommunitySort(value: unknown): value is CommunitySort {
  return COMMUNITY_SORTS.some((sort) => sort.id === value);
}

export type CommunityViewer = { id: number; isModerator: boolean };

export type PostSummary = {
  id: number;
  diseaseId: string;
  topicId: string;
  title: string;
  excerpt: string;
  authorId: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  removedAt: string | null;
  removedBy: string | null;
  commentCount: number;
  reactionCount: number;
  helpedByViewer: boolean;
  lastActivityAt: string;
};

export type PostDetail = PostSummary & { body: string };

export type CommentRecord = {
  id: number;
  postId: number;
  parentCommentId: number | null;
  authorId: number;
  authorName: string;
  /** Null when the comment was removed and the viewer may not see its text. */
  body: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  removedAt: string | null;
  removedBy: string | null;
};

export type ListPostsOptions = {
  diseaseId?: string;
  diseaseIds?: string[];
  topicId?: string;
  query?: string;
  sort?: CommunitySort;
  limit?: number;
  viewer?: CommunityViewer | null;
};

type PostRow = {
  id: number;
  disease_id: string;
  topic_id: string;
  title: string;
  body: string;
  author_id: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  display_name: string | null;
  comment_count: number;
  reaction_count: number;
  last_comment_at: string | null;
  helped_by_viewer: number;
};

const POST_SELECT = `
  SELECT p.id, p.disease_id, p.topic_id, p.title, p.body, p.author_id,
         p.created_at, p.updated_at, p.edited_at, p.removed_at, p.removed_by,
         pr.display_name,
         (SELECT COUNT(*) FROM community_comments c
           WHERE c.post_id = p.id AND c.removed_at IS NULL) AS comment_count,
         (SELECT COUNT(*) FROM community_reactions r
           WHERE r.post_id = p.id) AS reaction_count,
         (SELECT MAX(c.created_at) FROM community_comments c
           WHERE c.post_id = p.id AND c.removed_at IS NULL) AS last_comment_at,
         EXISTS(SELECT 1 FROM community_reactions r
                WHERE r.post_id = p.id AND r.user_id = @viewerId) AS helped_by_viewer
    FROM community_posts p
    LEFT JOIN profiles pr ON pr.user_id = p.author_id
`;

function excerptOf(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}…` : collapsed;
}

function toSummary(row: PostRow): PostSummary {
  return {
    id: row.id,
    diseaseId: row.disease_id,
    topicId: row.topic_id,
    title: row.title,
    excerpt: excerptOf(row.body),
    authorId: row.author_id,
    authorName: publicDisplayName(row.display_name, row.author_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    commentCount: row.comment_count,
    reactionCount: row.reaction_count,
    helpedByViewer: row.helped_by_viewer === 1,
    lastActivityAt: row.last_comment_at ?? row.created_at,
  };
}

/** Escapes LIKE wildcards so a search for "100%" does not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function listPosts(options: ListPostsOptions = {}): PostSummary[] {
  const where: string[] = ["p.removed_at IS NULL"];
  const params: Record<string, unknown> = {
    viewerId: options.viewer?.id ?? -1,
  };

  if (options.diseaseId) {
    where.push("p.disease_id = @diseaseId");
    params.diseaseId = options.diseaseId;
  }
  if (options.diseaseIds && options.diseaseIds.length > 0) {
    const valid = options.diseaseIds.filter(isDiseaseId);
    if (valid.length === 0) return [];
    const placeholders = valid.map((_, index) => `@disease${index}`);
    valid.forEach((id, index) => {
      params[`disease${index}`] = id;
    });
    where.push(`p.disease_id IN (${placeholders.join(", ")})`);
  }
  if (options.topicId) {
    where.push("p.topic_id = @topicId");
    params.topicId = options.topicId;
  }
  if (options.query) {
    const pattern = `%${escapeLike(options.query.trim().toLowerCase())}%`;
    where.push("(lower(p.title) LIKE @pattern ESCAPE '\\' OR lower(p.body) LIKE @pattern ESCAPE '\\')");
    params.pattern = pattern;
  }
  if (options.sort === "unanswered") {
    where.push(
      `(SELECT COUNT(*) FROM community_comments c
         WHERE c.post_id = p.id AND c.removed_at IS NULL) = 0`,
    );
  }

  const order =
    options.sort === "helpful"
      ? "reaction_count DESC, comment_count DESC, p.created_at DESC"
      : options.sort === "active"
        ? "COALESCE(last_comment_at, p.created_at) DESC, p.created_at DESC"
        : "p.created_at DESC, p.id DESC";

  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);

  const rows = getDb()
    .prepare(
      `${POST_SELECT}
       WHERE ${where.join(" AND ")}
       ORDER BY ${order}
       LIMIT @limit`,
    )
    .all({ ...params, limit }) as PostRow[];

  return rows.map(toSummary);
}

export function getPost(
  postId: number,
  viewer?: CommunityViewer | null,
): PostDetail | null {
  const row = getDb()
    .prepare(`${POST_SELECT} WHERE p.id = @id`)
    .get({ id: postId, viewerId: viewer?.id ?? -1 }) as PostRow | undefined;

  if (!row) return null;

  if (row.removed_at !== null) {
    const maySee = viewer && (viewer.isModerator || viewer.id === row.author_id);
    if (!maySee) return null;
  }

  return { ...toSummary(row), body: row.body };
}

export type CreatePostInput = {
  diseaseId: string;
  topicId: string;
  authorId: number;
  title: string;
  body: string;
};

export function createPost(input: CreatePostInput): PostSummary {
  if (!isDiseaseId(input.diseaseId)) {
    throw new Error("Unknown disease community.");
  }
  if (!isCommunityTopic(input.diseaseId, input.topicId)) {
    throw new Error("That topic does not belong to this community.");
  }

  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `INSERT INTO community_posts
         (disease_id, topic_id, author_id, title, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.diseaseId,
      input.topicId,
      input.authorId,
      input.title,
      input.body,
      now,
      now,
    );

  const post = getPost(Number(info.lastInsertRowid), {
    id: input.authorId,
    isModerator: false,
  });
  if (!post) throw new Error("The new post could not be read back.");
  return post;
}

export function updatePost(
  postId: number,
  authorId: number,
  input: { title: string; body: string },
): boolean {
  const info = getDb()
    .prepare(
      `UPDATE community_posts
          SET title = ?, body = ?, updated_at = ?, edited_at = ?
        WHERE id = ? AND author_id = ? AND removed_at IS NULL`,
    )
    .run(
      input.title,
      input.body,
      new Date().toISOString(),
      new Date().toISOString(),
      postId,
      authorId,
    );
  return info.changes > 0;
}

export function deleteOwnPost(postId: number, authorId: number): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE community_posts
          SET removed_at = ?, removed_by = 'author', updated_at = ?
        WHERE id = ? AND author_id = ? AND removed_at IS NULL`,
    )
    .run(now, now, postId, authorId);
  return info.changes > 0;
}

export function moderatorRemovePost(postId: number): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE community_posts
          SET removed_at = ?, removed_by = 'moderator', updated_at = ?
        WHERE id = ? AND removed_at IS NULL`,
    )
    .run(now, now, postId);
  return info.changes > 0;
}

export function moderatorRestorePost(postId: number): boolean {
  const info = getDb()
    .prepare(
      `UPDATE community_posts
          SET removed_at = NULL, removed_by = NULL, updated_at = ?
        WHERE id = ? AND removed_by = 'moderator'`,
    )
    .run(new Date().toISOString(), postId);
  return info.changes > 0;
}

export function toggleReaction(
  postId: number,
  userId: number,
): { reacted: boolean; count: number } | null {
  const post = getPost(postId);
  if (!post) return null;

  const db = getDb();
  const tx = db.transaction(() => {
    const removed = db
      .prepare(`DELETE FROM community_reactions WHERE post_id = ? AND user_id = ?`)
      .run(postId, userId);
    if (removed.changes > 0) return false;
    db.prepare(
      `INSERT INTO community_reactions (user_id, post_id, created_at)
       VALUES (?, ?, ?)`,
    ).run(userId, postId, new Date().toISOString());
    return true;
  });
  const reacted = tx();
  const count = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM community_reactions WHERE post_id = ?`)
      .get(postId) as { n: number }
  ).n;
  return { reacted, count };
}

export function listComments(
  postId: number,
  viewer?: CommunityViewer | null,
): CommentRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.post_id, c.parent_comment_id, c.author_id, c.body,
              c.created_at, c.updated_at, c.edited_at, c.removed_at, c.removed_by,
              pr.display_name
         FROM community_comments c
         LEFT JOIN profiles pr ON pr.user_id = c.author_id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC, c.id ASC`,
    )
    .all(postId) as {
    id: number;
    post_id: number;
    parent_comment_id: number | null;
    author_id: number;
    body: string;
    created_at: string;
    updated_at: string;
    edited_at: string | null;
    removed_at: string | null;
    removed_by: string | null;
    display_name: string | null;
  }[];

  return rows.map((row) => {
    const maySee =
      row.removed_at === null ||
      Boolean(viewer && (viewer.isModerator || viewer.id === row.author_id));
    return {
      id: row.id,
      postId: row.post_id,
      parentCommentId: row.parent_comment_id,
      authorId: row.author_id,
      authorName: publicDisplayName(row.display_name, row.author_id),
      body: maySee ? row.body : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      editedAt: row.edited_at,
      removedAt: row.removed_at,
      removedBy: row.removed_by,
    };
  });
}

export type CreateCommentInput = {
  postId: number;
  authorId: number;
  body: string;
  parentCommentId?: number | null;
};

export function createComment(
  input: CreateCommentInput,
): CommentRecord | { error: string } {
  const db = getDb();
  const post = getPost(input.postId);
  if (!post) return { error: "That discussion is no longer available." };

  let parentId: number | null = null;
  if (input.parentCommentId != null) {
    const parent = db
      .prepare(
        `SELECT id, post_id, parent_comment_id, removed_at
           FROM community_comments WHERE id = ?`,
      )
      .get(input.parentCommentId) as
      | {
          id: number;
          post_id: number;
          parent_comment_id: number | null;
          removed_at: string | null;
        }
      | undefined;
    if (!parent || parent.post_id !== input.postId) {
      return { error: "The comment you are replying to does not exist." };
    }
    if (parent.removed_at !== null) {
      return { error: "The comment you are replying to was removed." };
    }
    if (parent.parent_comment_id !== null) {
      return { error: "Replies are one level deep. Reply to the original comment instead." };
    }
    parentId = parent.id;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO community_comments
         (post_id, author_id, parent_comment_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.postId, input.authorId, parentId, input.body, now, now);

  const row = db
    .prepare(
      `SELECT c.id, c.post_id, c.parent_comment_id, c.author_id, c.body,
              c.created_at, c.updated_at, c.edited_at, c.removed_at, c.removed_by,
              pr.display_name
         FROM community_comments c
         LEFT JOIN profiles pr ON pr.user_id = c.author_id
        WHERE c.id = ?`,
    )
    .get(Number(info.lastInsertRowid)) as {
    id: number;
    post_id: number;
    parent_comment_id: number | null;
    author_id: number;
    body: string;
    created_at: string;
    updated_at: string;
    edited_at: string | null;
    removed_at: string | null;
    removed_by: string | null;
    display_name: string | null;
  };

  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id,
    authorId: row.author_id,
    authorName: publicDisplayName(row.display_name, row.author_id),
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
  };
}

export type CommentMeta = {
  id: number;
  postId: number;
  authorId: number;
  removedAt: string | null;
  removedBy: string | null;
};

export function getCommentMeta(commentId: number): CommentMeta | null {
  const row = getDb()
    .prepare(
      `SELECT id, post_id, author_id, removed_at, removed_by
         FROM community_comments WHERE id = ?`,
    )
    .get(commentId) as
    | {
        id: number;
        post_id: number;
        author_id: number;
        removed_at: string | null;
        removed_by: string | null;
      }
    | undefined;
  return row
    ? {
        id: row.id,
        postId: row.post_id,
        authorId: row.author_id,
        removedAt: row.removed_at,
        removedBy: row.removed_by,
      }
    : null;
}

export function updateComment(
  commentId: number,
  authorId: number,
  body: string,
): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE community_comments
          SET body = ?, updated_at = ?, edited_at = ?
        WHERE id = ? AND author_id = ? AND removed_at IS NULL`,
    )
    .run(body, now, now, commentId, authorId);
  return info.changes > 0;
}

export function deleteOwnComment(commentId: number, authorId: number): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE community_comments
          SET removed_at = ?, removed_by = 'author', updated_at = ?
        WHERE id = ? AND author_id = ? AND removed_at IS NULL`,
    )
    .run(now, now, commentId, authorId);
  return info.changes > 0;
}

export function moderatorRemoveComment(commentId: number): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE community_comments
          SET removed_at = ?, removed_by = 'moderator', updated_at = ?
        WHERE id = ? AND removed_at IS NULL`,
    )
    .run(now, now, commentId);
  return info.changes > 0;
}

export function moderatorRestoreComment(commentId: number): boolean {
  const info = getDb()
    .prepare(
      `UPDATE community_comments
          SET removed_at = NULL, removed_by = NULL, updated_at = ?
        WHERE id = ? AND removed_by = 'moderator'`,
    )
    .run(new Date().toISOString(), commentId);
  return info.changes > 0;
}

export type ReportTarget =
  | { type: "post"; id: number }
  | { type: "comment"; id: number };

export type CreateReportInput = {
  reporterId: number;
  target: ReportTarget;
  reason: string;
  detail: string | null;
};

export function createReport(
  input: CreateReportInput,
): { ok: true; id: number } | { ok: false; error: string } {
  const db = getDb();
  let postId: number | null = null;
  let commentId: number | null = null;

  if (input.target.type === "post") {
    const row = db
      .prepare(`SELECT id, removed_at FROM community_posts WHERE id = ?`)
      .get(input.target.id) as { id: number; removed_at: string | null } | undefined;
    if (!row) return { ok: false, error: "That post no longer exists." };
    if (row.removed_at !== null) {
      return { ok: false, error: "That post has already been removed." };
    }
    postId = row.id;
  } else {
    const row = db
      .prepare(
        `SELECT c.id, c.post_id, c.removed_at, p.removed_at AS post_removed_at
           FROM community_comments c
           JOIN community_posts p ON p.id = c.post_id
          WHERE c.id = ?`,
      )
      .get(input.target.id) as
      | {
          id: number;
          post_id: number;
          removed_at: string | null;
          post_removed_at: string | null;
        }
      | undefined;
    if (!row) return { ok: false, error: "That comment no longer exists." };
    if (row.removed_at !== null || row.post_removed_at !== null) {
      return { ok: false, error: "That comment has already been removed." };
    }
    commentId = row.id;
    postId = row.post_id;
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO community_reports
           (post_id, comment_id, target_type, reporter_id, reason, detail, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .run(
        postId,
        commentId,
        input.target.type,
        input.reporterId,
        input.reason,
        input.detail,
        new Date().toISOString(),
      );
    return { ok: true, id: Number(info.lastInsertRowid) };
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) {
      return { ok: false, error: "You have already reported this content." };
    }
    throw error;
  }
}

export type ModerationReport = {
  id: number;
  targetType: "post" | "comment";
  postId: number | null;
  commentId: number | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  resolutionNote: string | null;
  diseaseId: string | null;
  postTitle: string | null;
  targetExcerpt: string | null;
  targetAuthorName: string | null;
  targetRemovedAt: string | null;
  targetRemovedBy: string | null;
  commentCount: number;
  reactionCount: number;
};

export function listReports(status?: string): ModerationReport[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.target_type, r.post_id, r.comment_id, r.reason, r.detail,
              r.status, r.created_at, r.reviewed_at, r.resolution_note,
              p.disease_id, p.title AS post_title,
              p.removed_at AS post_removed_at, p.removed_by AS post_removed_by,
              c.body AS comment_body, c.removed_at AS comment_removed_at,
              c.removed_by AS comment_removed_by,
              COALESCE(cp.display_name, pp.display_name) AS target_author,
              COALESCE(c.author_id, p.author_id) AS target_author_id,
              (SELECT COUNT(*) FROM community_comments x
                WHERE x.post_id = p.id AND x.removed_at IS NULL) AS comment_count,
              (SELECT COUNT(*) FROM community_reactions y
                WHERE y.post_id = p.id) AS reaction_count
         FROM community_reports r
         LEFT JOIN community_posts p ON p.id = r.post_id
         LEFT JOIN community_comments c ON c.id = r.comment_id
         LEFT JOIN profiles cp ON cp.user_id = c.author_id
         LEFT JOIN profiles pp ON pp.user_id = p.author_id
        ${status ? "WHERE r.status = ?" : ""}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 200`,
    )
    .all(...(status ? [status] : [])) as {
    id: number;
    target_type: "post" | "comment";
    post_id: number | null;
    comment_id: number | null;
    reason: string;
    detail: string | null;
    status: string;
    created_at: string;
    reviewed_at: string | null;
    resolution_note: string | null;
    disease_id: string | null;
    post_title: string | null;
    post_removed_at: string | null;
    post_removed_by: string | null;
    comment_body: string | null;
    comment_removed_at: string | null;
    comment_removed_by: string | null;
    target_author: string | null;
    target_author_id: number | null;
    comment_count: number;
    reaction_count: number;
  }[];

  return rows.map((row) => {
    const isComment = row.target_type === "comment";
    const removedAt = isComment ? row.comment_removed_at : row.post_removed_at;
    const removedBy = isComment ? row.comment_removed_by : row.post_removed_by;
    const excerptSource = isComment ? row.comment_body : row.post_title;
    return {
      id: row.id,
      targetType: row.target_type,
      postId: row.post_id,
      commentId: row.comment_id,
      reason: row.reason,
      detail: row.detail,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      resolutionNote: row.resolution_note,
      diseaseId: row.disease_id,
      postTitle: row.post_title,
      targetExcerpt:
        excerptSource && excerptSource.length > 220
          ? `${excerptSource.slice(0, 217)}…`
          : excerptSource,
      targetAuthorName:
        row.target_author_id !== null
          ? publicDisplayName(row.target_author, row.target_author_id)
          : "Unknown",
      targetRemovedAt: removedAt,
      targetRemovedBy: removedBy,
      commentCount: row.comment_count,
      reactionCount: row.reaction_count,
    };
  });
}

type ModerationAction = "remove" | "restore" | "dismiss";

/**
 * Resolves every open report against the same target and records the moderator's
 * decision. `remove` also removes the content; `restore` puts moderator-removed
 * content back; `dismiss` leaves the content alone.
 */
export function resolveReportsForTarget(input: {
  targetType: "post" | "comment";
  targetId: number;
  moderatorId: number;
  action: ModerationAction;
  note: string | null;
}): number {
  const db = getDb();
  const now = new Date().toISOString();

  const apply = db.transaction(() => {
    if (input.action === "remove") {
      if (input.targetType === "post") moderatorRemovePost(input.targetId);
      else moderatorRemoveComment(input.targetId);
    } else if (input.action === "restore") {
      if (input.targetType === "post") moderatorRestorePost(input.targetId);
      else moderatorRestoreComment(input.targetId);
    }

    /*
     * Comment reports store both the comment id and its post id so the queue can
     * show which discussion the reply belongs to. A comment id is unique across
     * the table, so the comment update must match on comment_id alone. Matching on
     * a NULL post_id here (the previous behaviour) resolved zero reports for every
     * comment, leaving them open after the moderator had acted.
     */
    const info =
      input.targetType === "post"
        ? db
            .prepare(
              `UPDATE community_reports
                  SET status = 'reviewed', reviewed_at = ?, reviewed_by = ?, resolution_note = ?
                WHERE status = 'open' AND post_id = ? AND comment_id IS NULL`,
            )
            .run(now, input.moderatorId, input.note, input.targetId)
        : db
            .prepare(
              `UPDATE community_reports
                  SET status = 'reviewed', reviewed_at = ?, reviewed_by = ?, resolution_note = ?
                WHERE status = 'open' AND comment_id = ?`,
            )
            .run(now, input.moderatorId, input.note, input.targetId);
    return info.changes;
  });

  return apply();
}

export type DiseaseStats = {
  diseaseId: string;
  posts: number;
  unanswered: number;
  lastActivityAt: string | null;
};

export function listDiseaseStats(): DiseaseStats[] {
  const rows = getDb()
    .prepare(
      `SELECT p.disease_id,
              COUNT(*) AS posts,
              SUM(CASE WHEN (SELECT COUNT(*) FROM community_comments c
                              WHERE c.post_id = p.id AND c.removed_at IS NULL) = 0
                       THEN 1 ELSE 0 END) AS unanswered,
              MAX(COALESCE(
                (SELECT MAX(c.created_at) FROM community_comments c
                  WHERE c.post_id = p.id AND c.removed_at IS NULL),
                p.created_at)) AS last_activity_at
         FROM community_posts p
        WHERE p.removed_at IS NULL
        GROUP BY p.disease_id`,
    )
    .all() as {
    disease_id: string;
    posts: number;
    unanswered: number;
    last_activity_at: string | null;
  }[];

  return rows.map((row) => ({
    diseaseId: row.disease_id,
    posts: row.posts,
    unanswered: row.unanswered,
    lastActivityAt: row.last_activity_at,
  }));
}

export function setFollow(
  userId: number,
  diseaseId: string,
  following: boolean,
): boolean {
  if (!isDiseaseId(diseaseId)) return false;
  if (following) {
    getDb()
      .prepare(
        `INSERT INTO community_follows (user_id, disease_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, disease_id) DO NOTHING`,
      )
      .run(userId, diseaseId, new Date().toISOString());
  } else {
    getDb()
      .prepare(`DELETE FROM community_follows WHERE user_id = ? AND disease_id = ?`)
      .run(userId, diseaseId);
  }
  return true;
}

export function isFollowing(userId: number, diseaseId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS present FROM community_follows WHERE user_id = ? AND disease_id = ?`,
    )
    .get(userId, diseaseId) as { present: number } | undefined;
  return Boolean(row);
}

export function listFollows(userId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT disease_id FROM community_follows
        WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .all(userId) as { disease_id: string }[];
  return rows.map((row) => row.disease_id).filter(isDiseaseId);
}

export function countOpenReports(): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM community_reports WHERE status = 'open'`)
      .get() as { n: number }
  ).n;
}
