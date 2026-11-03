import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import { validatePost } from "@/lib/community/content";
import { isCommunityTopic, isDiseaseId } from "@/lib/community/diseases";
import { jsonError, noStore, requireCommunityActor } from "@/lib/community/http";
import { createPost } from "@/lib/community/store";

/**
 * Creates a community post.
 *
 * The author is the account in the session. Title and body are validated on the
 * server, and the topic is checked against this disease's own topic list, so a
 * crafted request cannot file a Chikungunya post under a topic that only exists
 * in another community.
 */
export async function POST(request: Request) {
  const gate = await requireCommunityActor(request, "start a discussion", {
    limit: 8,
    windowMs: 10 * 60_000,
    bucket: "post",
  });
  if ("response" in gate) return gate.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  const diseaseId = typeof body.diseaseId === "string" ? body.diseaseId : "";
  const topicId = typeof body.topicId === "string" ? body.topicId : "";

  if (!isDiseaseId(diseaseId)) {
    return jsonError("That disease community does not exist.", 400);
  }
  if (!isCommunityTopic(diseaseId, topicId)) {
    return jsonError("Choose one of the discussion topics for this community.", 400);
  }

  const checked = validatePost({ title: body.title, body: body.body });
  if (!checked.ok) {
    return jsonError("The post could not be published.", 400, {
      issues: checked.issues,
    });
  }

  try {
    const post = createPost({
      diseaseId,
      topicId,
      authorId: gate.user.id,
      title: checked.title,
      body: checked.body,
    });

    return NextResponse.json(
      {
        post: {
          id: post.id,
          diseaseId: post.diseaseId,
          topicId: post.topicId,
          title: post.title,
          authorName: post.authorName,
          createdAt: post.createdAt,
        },
        message: "Your discussion is published.",
      },
      noStore({
        status: 201,
        headers: { Location: `/community/${post.diseaseId}/${post.id}` },
      }),
    );
  } catch (error) {
    console.error("[community] post creation failed:", redactError(error));
    return jsonError("The discussion could not be published. Please try again.", 500);
  }
}
