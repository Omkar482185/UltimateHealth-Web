import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import { validateReportDetail } from "@/lib/community/content";
import {
  jsonError,
  noStore,
  requireModerator,
} from "@/lib/community/http";
import {
  getCommentMeta,
  getPost,
  resolveReportsForTarget,
} from "@/lib/community/store";

/**
 * Moderator decisions on reported content.
 *
 * `remove` takes the content down and closes the open reports against it.
 * `restore` puts back content a moderator removed, and closes the reports.
 * `dismiss` closes the reports without changing the content.
 *
 * The moderator allowlist is server configuration (see lib/community/roles.ts).
 * Nothing in the request can grant the role.
 */
export async function POST(request: Request) {
  const gate = await requireModerator(request, "review reports");
  if ("response" in gate) return gate.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }

  const body = payload as Record<string, unknown>;
  const targetType = body.targetType;
  const targetId = body.targetId;
  const action = body.action;

  if (targetType !== "post" && targetType !== "comment") {
    return jsonError("Say whether the target is a post or a comment.", 400);
  }
  if (
    typeof targetId !== "number" ||
    !Number.isSafeInteger(targetId) ||
    targetId <= 0
  ) {
    return jsonError("That content was not found.", 404);
  }
  if (action !== "remove" && action !== "restore" && action !== "dismiss") {
    return jsonError("That moderation action is not supported.", 400);
  }

  let removedAt: string | null = null;
  let removedBy: string | null = null;

  if (targetType === "post") {
    const post = getPost(targetId, gate.viewer);
    if (!post) return jsonError("That post was not found.", 404);
    removedAt = post.removedAt;
    removedBy = post.removedBy;
  } else {
    const comment = getCommentMeta(targetId);
    if (!comment) return jsonError("That comment was not found.", 404);
    removedAt = comment.removedAt;
    removedBy = comment.removedBy;
  }

  if (action === "remove" && removedAt !== null) {
    return jsonError("That content has already been removed.", 409);
  }
  if (action === "restore") {
    if (removedAt === null) {
      return jsonError("That content is already visible.", 409);
    }
    if (removedBy !== "moderator") {
      return jsonError(
        "The author deleted this content. A moderator cannot restore an author's deletion.",
        409,
      );
    }
  }

  try {
    const resolved = resolveReportsForTarget({
      targetType,
      targetId,
      moderatorId: gate.user.id,
      action,
      note: validateReportDetail(body.note),
    });

    return NextResponse.json(
      {
        ok: true,
        resolved,
        message:
          action === "remove"
            ? "The content was removed and its reports were closed."
            : action === "restore"
              ? "The content was restored and its reports were closed."
              : "The reports were closed without changing the content.",
      },
      noStore(),
    );
  } catch (error) {
    console.error("[community] moderation action failed:", redactError(error));
    return jsonError("The moderation action could not be completed.", 500);
  }
}
