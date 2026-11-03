import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import { validatePost } from "@/lib/community/content";
import {
  jsonError,
  noStore,
  parseId,
  requireCommunityActor,
} from "@/lib/community/http";
import { deleteOwnPost, getPost, updatePost } from "@/lib/community/store";

/**
 * Edits and deletes one post.
 *
 * Both handlers resolve the post first and compare its author with the session
 * account. A mismatched author gets 403 rather than 404, because the post is
 * public and its existence is not a secret. A moderator cannot edit someone
 * else's wording: taking content down goes through the moderation route, which
 * preserves the text for review.
 */

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const gate = await requireCommunityActor(request, "edit a discussion", {
    limit: 20,
    windowMs: 10 * 60_000,
    bucket: "post-edit",
  });
  if ("response" in gate) return gate.response;

  const id = parseId((await params).id);
  if (id === null) return jsonError("That discussion was not found.", 404);

  const existing = getPost(id, gate.viewer);
  if (!existing) return jsonError("That discussion was not found.", 404);
  if (existing.authorId !== gate.user.id) {
    return jsonError("Only the person who wrote this discussion can edit it.", 403);
  }
  if (existing.removedAt !== null) {
    return jsonError("A removed discussion cannot be edited.", 409);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }
  const body = payload as Record<string, unknown>;
  const checked = validatePost({ title: body.title, body: body.body });
  if (!checked.ok) {
    return jsonError("The changes could not be saved.", 400, { issues: checked.issues });
  }

  try {
    const changed = updatePost(id, gate.user.id, {
      title: checked.title,
      body: checked.body,
    });
    if (!changed) return jsonError("That discussion was not found.", 404);
    const updated = getPost(id, gate.viewer);
    return NextResponse.json(
      { post: updated, message: "Your changes were saved." },
      noStore(),
    );
  } catch (error) {
    console.error("[community] post edit failed:", redactError(error));
    return jsonError("The changes could not be saved. Please try again.", 500);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const gate = await requireCommunityActor(request, "delete a discussion", {
    limit: 20,
    windowMs: 10 * 60_000,
    bucket: "post-delete",
  });
  if ("response" in gate) return gate.response;

  const id = parseId((await params).id);
  if (id === null) return jsonError("That discussion was not found.", 404);

  const existing = getPost(id, gate.viewer);
  if (!existing) return jsonError("That discussion was not found.", 404);
  if (existing.authorId !== gate.user.id) {
    return jsonError("Only the person who wrote this discussion can delete it.", 403);
  }

  const removed = deleteOwnPost(id, gate.user.id);
  if (!removed) {
    return jsonError("That discussion was already removed.", 409);
  }
  return NextResponse.json(
    { ok: true, message: "Your discussion was deleted." },
    noStore(),
  );
}
