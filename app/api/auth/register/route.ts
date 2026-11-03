import { NextResponse } from "next/server";
import { z } from "zod";

import { clientKey, isSameOriginRequest, rateLimit, redactError } from "@/lib/api-guard";
import { setSessionCookie } from "@/lib/auth/cookies";
import {
  checkPasswordPolicy,
  describePasswordProblem,
  normaliseEmail,
} from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { CONSENT_VERSION, createUser, EmailTakenError } from "@/lib/auth/users";

const RequestBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  acceptConsent: z.literal(true),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  // Registration is the most expensive unauthenticated endpoint, because it runs
  // scrypt. The limit is applied before any hashing so that a loop of requests
  // cannot be used to make the server burn CPU.
  const limit = rateLimit(`register:${clientKey(request)}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many sign-up attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
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
      {
        error: "Please check the email address and confirm that you accept the notice.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const problem = checkPasswordPolicy(parsed.data.password);
  if (problem) {
    return NextResponse.json(
      { error: describePasswordProblem(problem), kind: problem },
      { status: 400 },
    );
  }

  try {
    const user = await createUser(
      normaliseEmail(parsed.data.email),
      parsed.data.password,
      // The schema already requires this to be literally true, so the acceptance
      // is recorded against the notice version in force at sign-up.
      parsed.data.acceptConsent,
    );
    const session = createSession(user.id);
    await setSessionCookie(session.token);

    // A new account starts with no records. The client is told this explicitly so
    // it can show an empty state rather than implying data is on its way.
    return NextResponse.json(
      {
        account: {
          email: user.email,
          createdAt: user.createdAt,
          hasRecords: false,
          consentVersion: CONSENT_VERSION,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailTakenError) {
      // Registration has to say this, unlike sign-in, or a person cannot tell a
      // typo from a taken address. Sign-in is where existence is not disclosed.
      return NextResponse.json(
        { error: error.message, kind: "email-taken" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("[register] unexpected failure:", redactError(error));
    return NextResponse.json(
      { error: "The account could not be created. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
