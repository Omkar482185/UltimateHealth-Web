import { NextResponse } from "next/server";
import { z } from "zod";

import { isSameOriginRequest, rateLimit, redactError } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  buildTrends,
  createRecord,
  isRecordKind,
  listRecords,
  NOTE_MAX_CHARS,
  RECORD_KINDS,
  RecordValidationError,
  type RecordKind,
} from "@/lib/health/records";

/**
 * The signed-in account's own health records.
 *
 * As on the profile endpoint, there is no user id anywhere in the request: the
 * account comes from the session cookie, so asking for another person's records
 * is not an operation this API can express.
 *
 * Reads are `no-store`. A cached response to a request for personal health data
 * is how one account's readings end up rendered in another browser.
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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to see your records.", kind: "unauthenticated" },
      noStore({ status: 401 }),
    );
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (kindParam !== null && !isRecordKind(kindParam)) {
    return NextResponse.json(
      { error: "That is not one of the supported measurement kinds." },
      noStore({ status: 400 }),
    );
  }

  // `null` signals an unreadable parameter; `undefined` means it was absent.
  const parseBound = (value: string | null): string | undefined | null => {
    if (value === null || value === "") return undefined;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  };

  const from = parseBound(fromParam);
  const to = parseBound(toParam);
  if (from === null || to === null) {
    return NextResponse.json(
      { error: "The date range could not be read." },
      noStore({ status: 400 }),
    );
  }

  const records = listRecords(user.id, {
    kind: kindParam && isRecordKind(kindParam) ? kindParam : undefined,
    from,
    to,
  });

  return NextResponse.json(
    {
      records,
      trends: buildTrends(records),
      note:
        "Every value here was entered by you. Nothing on this page is estimated, predicted or derived from another person's data.",
    },
    noStore(),
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
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to save a record.", kind: "unauthenticated" },
      noStore({ status: 401 }),
    );
  }

  const limit = rateLimit(`records:write:${user.id}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many saved records. Try again in ${limit.retryAfterSeconds} seconds.` },
      noStore({ status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }),
    );
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
    const record = createRecord(user.id, {
      kind: parsed.data.kind,
      valuePrimary: parsed.data.valuePrimary,
      valueSecondary: parsed.data.valueSecondary ?? null,
      measuredAt: parsed.data.measuredAt,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ record }, noStore({ status: 201 }));
  } catch (error) {
    if (error instanceof RecordValidationError) {
      return NextResponse.json(
        { error: error.issues.join(" "), issues: error.issues },
        noStore({ status: 400 }),
      );
    }
    console.error("[records] unexpected create failure:", redactError(error));
    return NextResponse.json(
      { error: "The record could not be saved. Please try again." },
      noStore({ status: 500 }),
    );
  }
}
