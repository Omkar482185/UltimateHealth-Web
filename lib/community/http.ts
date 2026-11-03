/**
 * Shared request guards for the community endpoints.
 *
 * The account is always resolved from the session cookie, never from the body or
 * the path. The path id is the post or comment id only. Keeping that in one place
 * makes it harder to add an endpoint later that trusts a supplied user id.
 */
import { NextResponse } from "next/server";

import { isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import type { SessionUser } from "@/lib/auth/session";
import { isModerator } from "@/lib/community/roles";
import type { CommunityViewer } from "@/lib/community/store";

export function noStore(init?: ResponseInit): ResponseInit {
  return { ...init, headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store" } };
}

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return NextResponse.json({ error: message, ...extra }, noStore({ status }));
}

/** Only digits, so a hostile path cannot reach the query as anything else. */
export function parseId(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type CommunityActor = {
  user: SessionUser;
  viewer: CommunityViewer;
  isModerator: boolean;
};

type GuardResult = CommunityActor | { response: Response };

export async function requireCommunityActor(
  request: Request,
  action: string,
  options: { limit: number; windowMs: number; bucket: string },
): Promise<GuardResult> {
  if (!isSameOriginRequest(request)) {
    return { response: jsonError("Cross-origin requests are not accepted.", 403) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      response: jsonError(`Sign in to ${action}.`, 401, { kind: "unauthenticated" }),
    };
  }

  const limit = rateLimit(
    `community:${options.bucket}:${user.id}`,
    options.limit,
    options.windowMs,
  );
  if (!limit.allowed) {
    return {
      response: NextResponse.json(
        { error: `Too many actions. Try again in ${limit.retryAfterSeconds} seconds.` },
        noStore({
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }),
      ),
    };
  }

  const moderator = isModerator(user.email);
  return {
    user,
    isModerator: moderator,
    viewer: { id: user.id, isModerator: moderator },
  };
}

export async function requireModerator(
  request: Request,
  action: string,
): Promise<GuardResult> {
  const result = await requireCommunityActor(request, action, {
    limit: 120,
    windowMs: 60_000,
    bucket: "moderation",
  });
  if ("response" in result) return result;
  if (!result.isModerator) {
    return { response: jsonError("That action is limited to community moderators.", 403) };
  }
  return result;
}
