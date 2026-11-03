import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/api-guard";
import { signOut } from "@/lib/auth/cookies";

/**
 * Sign-out.
 *
 * The session row is deleted in the database and the cookie is cleared. Deleting
 * only the cookie would leave a working token in any copy that had already been
 * taken, which is not what a person means when they sign out.
 *
 * This endpoint is idempotent: signing out without a session succeeds, so a
 * double-click or a stale tab does not produce an error.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  await signOut();
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
