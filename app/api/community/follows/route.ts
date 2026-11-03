import { NextResponse } from "next/server";

import { isDiseaseId } from "@/lib/community/diseases";
import {
  jsonError,
  noStore,
  requireCommunityActor,
} from "@/lib/community/http";
import { isFollowing, setFollow } from "@/lib/community/store";

/**
 * Adds or removes a followed community.
 *
 * Following is an explicit display preference. It is not a diagnosis, is not
 * written into the health profile, and is not used to infer anything: the feed
 * simply puts the communities the person chose at the top.
 */
export async function POST(request: Request) {
  const gate = await requireCommunityActor(request, "follow a community", {
    limit: 60,
    windowMs: 10 * 60_000,
    bucket: "follow",
  });
  if ("response" in gate) return gate.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  if (!isDiseaseId(body.diseaseId)) {
    return jsonError("That disease community does not exist.", 400);
  }
  if (typeof body.following !== "boolean") {
    return jsonError("Say whether to follow or unfollow the community.", 400);
  }

  const diseaseId = body.diseaseId;
  const saved = setFollow(gate.user.id, diseaseId, body.following);
  if (!saved) return jsonError("That disease community does not exist.", 400);

  const following = isFollowing(gate.user.id, diseaseId);
  return NextResponse.json(
    {
      ok: true,
      diseaseId,
      following,
      message: following
        ? "This community will appear first in your feed."
        : "This community was removed from your followed list.",
    },
    noStore(),
  );
}
