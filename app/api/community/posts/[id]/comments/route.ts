import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import { validateComment } from "@/lib/community/content";
import {
  jsonError,
  noStore,
  parseId,
  requireCommunityActor,
} from "@/lib/community/http";
import { createComment, getPost } from "@/lib/community/store";

/**
 * Adds a comment or a one-level reply.
 *
 * `parentCommentId` is optional and is validated against the post in the data
 * layer, so a reply cannot be attached to a comment on a different discussion.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCommunityActor(request, "reply to a discussion", {
    limit: 30,
    windowMs: 10 * 60_000,
    bucket: "comment",
  });
  if ("response" in gate) return gate.response;

  const postId = parseId((await params).id);
  if (postId === null) return jsonError("That discussion was not found.", 404);
  if (!getPost(postId, gate.viewer)) {
    return jsonError("That discussion was not found.", 404);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  const checked = validateComment({ body: body.body });
  if (!checked.ok) {
    return jsonError("The reply could not be published.", 400, { issues: checked.issues });
  }

  let parentCommentId: number | null = null;
  if (body.parentCommentId !== undefined && body.parentCommentId !== null) {
    if (
      typeof body.parentCommentId !== "number" ||
      !Number.isSafeInteger(body.parentCommentId) ||
      body.parentCommentId <= 0
    ) {
      return jsonError("The comment you are replying to was not valid.", 400);
    }
    parentCommentId = body.parentCommentId;
  }

  try {
    const result = createComment({
      postId,
      authorId: gate.user.id,
      body: checked.body,
      parentCommentId,
    });
    if ("error" in result) return jsonError(result.error, 400);

    return NextResponse.json(
      { comment: result, message: "Your reply is published." },
      noStore({ status: 201 }),
    );
  } catch (error) {
    console.error("[community] comment creation failed:", redactError(error));
    return jsonError("The reply could not be published. Please try again.", 500);
  }
}
