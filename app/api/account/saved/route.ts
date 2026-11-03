import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  listSavedResources,
  removeSavedResource,
  saveResource,
  SAVED_KINDS,
} from "@/lib/profile/saved";

/**
 * Saved learning material for the signed-in account.
 *
 * The body carries a kind and a reference id only. The title and the URL are
 * resolved from this platform's own catalogues on the server, so a caller cannot
 * save a link of their choosing, and a catalogue correction is reflected the next
 * time a saved item is read. There is no user id in the path or the body: the
 * account comes from the session cookie, so one account cannot write to another's
 * list by changing an identifier.
 */

const SavedBody = z.object({
  kind: z.enum(SAVED_KINDS),
  refId: z.string().trim().min(1).max(120),
});

function unauthenticated() {
  return NextResponse.json(
    {
      error: "Sign in to keep a list of learning material.",
      kind: "unauthenticated",
    },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  return NextResponse.json(
    { saved: listSavedResources(user.id) },
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

  const limit = rateLimit(`saved-write:${user.id}`, 60, 60_000);
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

  const parsed = SavedBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That is not a valid saved item." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const saved = saveResource(user.id, parsed.data.kind, parsed.data.refId);
  if (!saved) {
    // Not an internal failure: the reference simply is not in the catalogue, and
    // saying so is more useful than storing a row that can never be resolved.
    return NextResponse.json(
      { error: "That item is not in this platform's catalogue." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { saved },
    { status: 200, headers: { "Cache-Control": "no-store" } },
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

  const parsed = SavedBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That is not a valid saved item." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const removed = removeSavedResource(user.id, parsed.data.kind, parsed.data.refId);
  return NextResponse.json(
    { ok: true, removed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
