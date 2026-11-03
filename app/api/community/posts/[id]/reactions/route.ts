import { NextResponse } from "next/server";

import { jsonError, noStore, parseId, requireCommunityActor } from "@/lib/community/http";
import { toggleReaction } from "@/lib/community/store";

/**
 * Toggles one "helpful" mark for the signed-in account.
 *
 * The endpoint is a toggle rather than an increment: the database primary key
 * makes a second mark impossible, and sending the same request twice returns the
 * post to its previous state. No counter is ever written by the client.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCommunityActor(request, "mark a discussion helpful", {
    limit: 120,
    windowMs: 10 * 60_000,
    bucket: "reaction",
  });
  if ("response" in gate) return gate.response;

  const id = parseId((await params).id);
  if (id === null) return jsonError("That discussion was not found.", 404);

  const result = toggleReaction(id, gate.user.id);
  if (!result) return jsonError("That discussion was not found.", 404);

  return NextResponse.json(
    {
      reacted: result.reacted,
      count: result.count,
      message: result.reacted
        ? "Marked as helpful."
        : "Your helpful mark was removed.",
    },
    noStore(),
  );
}
