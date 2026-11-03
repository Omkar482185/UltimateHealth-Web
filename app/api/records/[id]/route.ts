import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest, rateLimit, redactError } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  deleteRecord,
  NOTE_MAX_CHARS,
  RECORD_KINDS,
  RecordValidationError,
  updateRecord,
  type RecordKind,
} from "@/lib/health/records";

/**
 * A single record, addressed by its own id.
 *
 * The id in the path is the *record's* id, never a user id. The account still
 * comes from the session cookie, and both statements below match on
 * `id AND user_id`, so another account's record is "not found" rather than
 * "forbidden" — the response does not confirm that an id exists at all.
 *
 * `PUT` replaces the record's values rather than merging into them, so an edit
 * cannot leave half of a blood-pressure reading from a previous version behind.
 */

const KIND_VALUES = RECORD_KINDS.map((spec) => spec.kind) as [RecordKind, ...RecordKind[]];

const RecordBody = z.object({
  kind: z.enum(KIND_VALUES),
  valuePrimary: z.number().finite(),
  valueSecondary: z.number().finite().nullable().optional(),
  measuredAt: z.string().min(1).max(40),
  note: z.string().max(NOTE_MAX_CHARS).nullable().optional(),
});

function noStore(init?: ResponseInit): ResponseInit {
  return { ...init, headers: { ...(init?.headers ?? {}), "Cache-Control": "no-store" } };
}

/** Shared guards for both mutations. Returns a response to short-circuit with. */
async function guard(
  request: Request,
  action: string,
): Promise<{ user: { id: number } } | { response: Response }> {
  if (!isSameOriginRequest(request)) {
    return {
      response: NextResponse.json(
        { error: "Cross-origin requests are not accepted." },
        { status: 403 },
      ),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: `Sign in to ${action}.`, kind: "unauthenticated" },
        noStore({ status: 401 }),
      ),
    };
  }

  const limit = rateLimit(`records:write:${user.id}`, 120, 60_000);
  if (!limit.allowed) {
    return {
      response: NextResponse.json(
        { error: `Too many changes. Try again in ${limit.retryAfterSeconds} seconds.` },
        noStore({ status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }),
      ),
    };
  }

  return { user };
}

/** Only digits, so a non-numeric path never reaches the query. */
function parseRecordId(raw: string): number | null {
  if (!/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guard(request, "change a record");
  if ("response" in gate) return gate.response;

  const id = parseRecordId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "That record was not found." }, noStore({ status: 404 }));
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = RecordBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some of the submitted values were not valid.",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
      noStore({ status: 400 }),
    );
  }

  try {
    const record = updateRecord(gate.user.id, id, {
      kind: parsed.data.kind,
      valuePrimary: parsed.data.valuePrimary,
      valueSecondary: parsed.data.valueSecondary ?? null,
      measuredAt: parsed.data.measuredAt,
      note: parsed.data.note ?? null,
    });

    if (!record) {
      // Either it does not exist or it belongs to someone else. Both are the same
      // answer on purpose.
      return NextResponse.json(
        { error: "That record was not found." },
        noStore({ status: 404 }),
      );
    }

    return NextResponse.json({ record }, noStore());
  } catch (error) {
    if (error instanceof RecordValidationError) {
      return NextResponse.json(
        { error: error.issues.join(" "), issues: error.issues },
        noStore({ status: 400 }),
      );
    }
    console.error("[records] unexpected update failure:", redactError(error));
    return NextResponse.json(
      { error: "The record could not be updated. Please try again." },
      noStore({ status: 500 }),
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await guard(request, "delete a record");
  if ("response" in gate) return gate.response;

  const id = parseRecordId((await params).id);
  if (id === null) {
    return NextResponse.json({ error: "That record was not found." }, noStore({ status: 404 }));
  }

  const deleted = deleteRecord(gate.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "That record was not found." }, noStore({ status: 404 }));
  }

  return NextResponse.json({ ok: true }, noStore());
}
