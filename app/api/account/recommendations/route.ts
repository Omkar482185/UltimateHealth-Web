import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  clearRecommendationState,
  isValidRecommendationKey,
  listRecommendationStates,
  RECOMMENDATION_STATES,
  setRecommendationState,
} from "@/lib/profile/recommendation-state";

/**
 * Dismissing or completing a recommendation.
 *
 * The body carries a key and a state. Nothing about the recommendation itself is
 * accepted from the caller: the text is derived from the person's own data on every
 * visit, so suppressing a key is enough and a caller cannot inject a line of their
 * own text into someone's dashboard. The account comes from the session cookie, so
 * there is no identifier to tamper with.
 */

const Body = z.object({
  key: z.string().min(1).max(120).refine(isValidRecommendationKey, {
    message: "That is not a valid recommendation key.",
  }),
  state: z.enum(RECOMMENDATION_STATES),
});

function unauthenticated() {
  return NextResponse.json(
    { error: "Sign in to change your suggestions.", kind: "unauthenticated" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  return NextResponse.json(
    { states: listRecommendationStates(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  const limit = rateLimit(`recommendation-write:${user.id}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many changes. Try again in ${limit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That is not a valid recommendation change." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  setRecommendationState(user.id, parsed.data.key, parsed.data.state);
  return NextResponse.json(
    { ok: true, state: listRecommendationStates(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That is not a valid recommendation key." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cleared = clearRecommendationState(user.id, parsed.data.key);
  return NextResponse.json(
    { ok: true, cleared, state: listRecommendationStates(user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
