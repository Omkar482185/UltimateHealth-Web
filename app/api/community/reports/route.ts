import { NextResponse } from "next/server";

import { redactError } from "@/lib/api-guard";
import {
  isReportReason,
  REPORT_DETAIL_MAX,
  validateReportDetail,
} from "@/lib/community/content";
import {
  jsonError,
  noStore,
  requireCommunityActor,
} from "@/lib/community/http";
import {
  createReport,
  getCommentMeta,
  getPost,
  type ReportTarget,
} from "@/lib/community/store";

/**
 * Files a report about one post or comment.
 *
 * Anyone signed in can report. The reporter is recorded so that the same person
 * cannot file the same report repeatedly, but the public pages never show who
 * reported what.
 */
export async function POST(request: Request) {
  const gate = await requireCommunityActor(request, "report content", {
    limit: 10,
    windowMs: 60 * 60_000,
    bucket: "report",
  });
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
  const reason = body.reason;

  if (targetType !== "post" && targetType !== "comment") {
    return jsonError("Say whether you are reporting a post or a comment.", 400);
  }
  if (
    typeof targetId !== "number" ||
    !Number.isSafeInteger(targetId) ||
    targetId <= 0
  ) {
    return jsonError("That content was not found.", 404);
  }
  if (!isReportReason(reason)) {
    return jsonError("Choose a reason for the report.", 400);
  }
  if (typeof body.detail === "string" && body.detail.length > REPORT_DETAIL_MAX) {
    return jsonError(`Keep the note to ${REPORT_DETAIL_MAX} characters or fewer.`, 400);
  }

  const target: ReportTarget = { type: targetType, id: targetId };

  if (targetType === "post") {
    const post = getPost(targetId, gate.viewer);
    if (!post) return jsonError("That post was not found.", 404);
    if (post.authorId === gate.user.id) {
      return jsonError(
        "You cannot report your own post. Edit or delete it instead.",
        400,
      );
    }
  } else {
    const comment = getCommentMeta(targetId);
    if (!comment || comment.removedAt !== null) {
      return jsonError("That comment was not found.", 404);
    }
    if (comment.authorId === gate.user.id) {
      return jsonError(
        "You cannot report your own comment. Edit or delete it instead.",
        400,
      );
    }
    const post = getPost(comment.postId, gate.viewer);
    if (!post) return jsonError("That comment was not found.", 404);
  }

  try {
    const result = createReport({
      reporterId: gate.user.id,
      target,
      reason,
      detail: validateReportDetail(body.detail),
    });

    if (!result.ok) {
      const duplicate = result.error.includes("already reported");
      return jsonError(result.error, duplicate ? 409 : 400, {
        kind: duplicate ? "duplicate-report" : "report-refused",
      });
    }

    return NextResponse.json(
      {
        ok: true,
        reportId: result.id,
        message:
          "Thank you. A moderator will review this report. The content stays visible until they do.",
      },
      noStore({ status: 201 }),
    );
  } catch (error) {
    console.error("[community] report creation failed:", redactError(error));
    return jsonError("The report could not be filed. Please try again.", 500);
  }
}
