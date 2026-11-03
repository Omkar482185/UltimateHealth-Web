import { NextResponse } from "next/server";
import { z } from "zod";

import { clientKey, isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { deleteUserAccount, findUserForAuthentication } from "@/lib/auth/users";
import { buildExportReport, exportReportToJson } from "@/lib/export/report";

/**
 * Account-level operations: a complete export, and deletion.
 *
 * Both act only on the account in the session cookie.
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to export your data.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // The same report the PDF is rendered from, so the two downloads cannot describe
  // different data. `healthRecords` is kept at the top level, which is where a script
  // written against the earlier export expects to find it; everything added since is
  // additive.
  const report = buildExportReport(user.id);
  if (!report) {
    return NextResponse.json(
      { error: "That account no longer exists.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(`${JSON.stringify(exportReportToJson(report), null, 2)}\n`, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A download of personal data must never be cached by a shared proxy.
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="ultimatehealth-export-${user.id}.json"`,
    },
  });
}

const DeleteBody = z.object({
  /** Typed by the person to make the action deliberate rather than a stray tap. */
  confirmation: z.literal("delete my account"),
  password: z.string().min(1).max(200),
});

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to delete your account.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limit = rateLimit(`delete-account:${user.id}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = DeleteBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'Type "delete my account" exactly, and enter your password, to confirm.',
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Re-authenticate. A session alone should not be enough to destroy an account:
  // that raises the cost of a stolen cookie from "read-only access" to "needs the
  // password as well".
  const record = findUserForAuthentication(user.email);
  const ok =
    record !== null && (await verifyPassword(parsed.data.password, record.passwordHash));
  if (!ok) {
    return NextResponse.json(
      { error: "That password was not correct, so nothing was deleted." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Sessions first so no request in flight can still resolve, then the account.
  // The health records and profile are removed by the ON DELETE CASCADE.
  revokeAllSessionsForUser(user.id);
  const deleted = deleteUserAccount(user.id);
  await clearSessionCookie();

  return NextResponse.json(
    {
      ok: deleted,
      message: deleted
        ? "Your account, profile and health records have been deleted."
        : "The account no longer existed.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
