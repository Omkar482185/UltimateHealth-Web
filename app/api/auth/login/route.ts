import { NextResponse } from "next/server";
import { z } from "zod";

import { clientKey, isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { setSessionCookie } from "@/lib/auth/cookies";
import { normaliseEmail, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteExpiredSessions } from "@/lib/auth/session";
import { findUserForAuthentication } from "@/lib/auth/users";

const RequestBody = z.object({
  email: z.string().trim().max(254),
  password: z.string().min(1).max(200),
});

/**
 * A real, valid scrypt hash used only to keep the failure path doing the same
 * work as the success path.
 *
 * Without it, a request for an address with no account would return as soon as
 * the lookup missed, while a request for a real address would spend a tenth of a
 * second hashing. That difference is measurable from outside and turns sign-in
 * into an account-existence oracle. Because the hash below is never compared
 * against a stored password, it only has to be well-formed.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const limit = rateLimit(`login:${clientKey(request)}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = RequestBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the email address and password you signed up with." },
      { status: 400 },
    );
  }

  const email = normaliseEmail(parsed.data.email);
  const user = findUserForAuthentication(email);

  // Always hash, whether or not the account exists. See DUMMY_HASH above.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    // One message for both cases: an unknown address and a wrong password are
    // deliberately indistinguishable to the caller.
    return NextResponse.json(
      { error: "That email address and password combination was not recognised." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  deleteExpiredSessions();
  const session = createSession(user.id);
  await setSessionCookie(session.token);

  return NextResponse.json(
    { account: { email: user.email, createdAt: user.createdAt } },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
