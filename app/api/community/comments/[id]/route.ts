import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import { validateComment } from "@/lib/community/content";
import {
  jsonError,
  noStore,
  parseId,
  requireCommunityActor,
} from "@/lib/community/http";
import {
  deleteOwnComment,
  getCommentMeta,
  updateComment,
} from "@/lib/community/store";

/**
 * Edits and deletes one comment. Ownership is checked against the session
 * account before either statement runs.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCommunityActor(request, "edit a reply", {
    limit: 40,
    windowMs: 10 * 60_000,
    bucket: "comment-edit",
  });
  if ("response" in gate) return gate.response;

  const id = parseId((await params).id);
  if (id === null) return jsonError("That reply was not found.", 404);
  const existing = getCommentMeta(id);
  if (!existing) return jsonError("That reply was not found.", 404);
  if (existing.authorId !== gate.user.id) {
    return jsonError("Only the person who wrote this reply can edit it.", 403);
  }
  if (existing.removedAt !== null) {
    return jsonError("A removed reply cannot be edited.", 409);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }
  const checked = validateComment({ body: (payload as Record<string, unknown>).body });
  if (!checked.ok) {
    return jsonError("The changes could not be saved.", 400, { issues: checked.issues });
  }

  try {
    const changed = updateComment(id, gate.user.id, checked.body);
    if (!changed) return jsonError("That reply was not found.", 404);
    return NextResponse.json(
      { ok: true, body: checked.body, message: "Your changes were saved." },
      noStore(),
    );
  } catch (error) {
    console.error("[community] comment edit failed:", redactError(error));
    return jsonError("The changes could not be saved. Please try again.", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireCommunityActor(request, "delete a reply", {
    limit: 40,
    windowMs: 10 * 60_000,
    bucket: "comment-delete",
  });
  if ("response" in gate) return gate.response;

  const id = parseId((await params).id);
  if (id === null) return jsonError("That reply was not found.", 404);
  const existing = getCommentMeta(id);
  if (!existing) return jsonError("That reply was not found.", 404);
  if (existing.authorId !== gate.user.id) {
    return jsonError("Only the person who wrote this reply can delete it.", 403);
  }

  const removed = deleteOwnComment(id, gate.user.id);
  if (!removed) return jsonError("That reply was already removed.", 409);
  return NextResponse.json(
    { ok: true, message: "Your reply was deleted." },
    noStore(),
  );
}
