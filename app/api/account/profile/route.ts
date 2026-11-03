import { NextResponse } from "next/server";
import { z } from "zod";

import { clientKey, isSameOriginRequest, rateLimit } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/auth/cookies";
import { CONSENT_VERSION, getProfile, updateProfile } from "@/lib/auth/users";
import {
  ACTIVITY_GOAL_MINUTES,
  isGoalId,
  isInterestId,
  isLanguageId,
  MAX_CONDITIONS,
  MAX_GOALS,
  MAX_INTERESTS,
  SLEEP_GOAL_HOURS,
  CONDITION_IDS,
} from "@/lib/profile/options";

/**
 * The signed-in account's own profile.
 *
 * There is no user id in the path, the query string or the body. The account is
 * taken from the session cookie, so a request cannot ask for someone else's
 * profile by changing an identifier: the identifier is not an input at all.
 *
 * Profile reads are served no-store rather than cached, because a cached response
 * to a personalised request is how one account's data ends up in another's
 * browser.
 */

const CURRENT_YEAR = new Date().getFullYear();

const ProfileBody = z.object({
  displayName: z.string().trim().max(80).optional(),
  birthYear: z.number().int().min(1900).max(CURRENT_YEAR).nullable().optional(),
  sexAtBirth: z
    .enum(["female", "male", "intersex", "prefer-not-to-say"])
    .nullable()
    .optional(),
  heightCm: z.number().int().min(50).max(250).nullable().optional(),
  // The id lists are bounded and then checked against the vocabulary below. An
  // unknown id is a 400 rather than a silent drop: quietly storing less than the
  // person selected would make the profile disagree with the form they submitted.
  interests: z.array(z.string().max(60)).max(MAX_INTERESTS).optional(),
  goals: z.array(z.string().max(60)).max(MAX_GOALS).optional(),
  selfReportedConditions: z.array(z.string().max(60)).max(MAX_CONDITIONS).optional(),
  sleepGoalHours: z
    .number()
    .min(SLEEP_GOAL_HOURS.min)
    .max(SLEEP_GOAL_HOURS.max)
    .nullable()
    .optional(),
  activityGoalMinutes: z
    .number()
    .int()
    .min(ACTIVITY_GOAL_MINUTES.min)
    .max(ACTIVITY_GOAL_MINUTES.max)
    .nullable()
    .optional(),
  preferredLanguage: z.enum(["en", "hi"]).nullable().optional(),
  acceptConsent: z.boolean().optional(),
});

/** Removes duplicates while keeping the order the person selected, then caps. */
function dedupe(values: string[] | undefined, max: number): string[] {
  if (!values) return [];
  return [...new Set(values)].slice(0, max);
}

/** Names the first value that is not part of a vocabulary, or null. */
function firstUnknown(
  values: string[] | undefined,
  isKnown: (value: unknown) => boolean,
): string | null {
  if (!values) return null;
  for (const value of values) if (!isKnown(value)) return value;
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view your profile.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      account: { email: user.email, createdAt: user.createdAt },
      profile: getProfile(user.id),
      currentConsentVersion: CONSENT_VERSION,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to change your profile.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limit = rateLimit(`profile:${user.id}:${clientKey(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many updates. Try again in ${limit.retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = ProfileBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some of the submitted values were not valid.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Checked before anything is written, and all three lists are checked, so a
  // request that names an unknown interest cannot half-apply.
  const unknown = [
    { field: "interests", value: firstUnknown(parsed.data.interests, isInterestId) },
    { field: "goals", value: firstUnknown(parsed.data.goals, isGoalId) },
    {
      field: "selfReportedConditions",
      value: firstUnknown(
        parsed.data.selfReportedConditions,
        (value) => typeof value === "string" && CONDITION_IDS.includes(value),
      ),
    },
  ].find((entry) => entry.value !== null);

  if (unknown || (parsed.data.preferredLanguage && !isLanguageId(parsed.data.preferredLanguage))) {
    return NextResponse.json(
      {
        error: unknown
          ? `"${unknown.value}" is not one of the supported values for ${unknown.field}.`
          : "That is not a supported language.",
        kind: "unknown-option",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const existing = getProfile(user.id);
  const has = <K extends keyof typeof parsed.data>(key: K) =>
    Object.prototype.hasOwnProperty.call(parsed.data, key);

  const profile = updateProfile(user.id, {
    // A field that was not sent keeps its stored value rather than being cleared,
    // so a form that only edits one field cannot silently wipe the others.
    displayName: has("displayName")
      ? normaliseText(parsed.data.displayName)
      : (existing?.displayName ?? null),
    birthYear: has("birthYear") ? (parsed.data.birthYear ?? null) : (existing?.birthYear ?? null),
    sexAtBirth: has("sexAtBirth")
      ? (parsed.data.sexAtBirth ?? null)
      : (existing?.sexAtBirth ?? null),
    heightCm: has("heightCm") ? (parsed.data.heightCm ?? null) : (existing?.heightCm ?? null),
    interests: has("interests")
      ? dedupe(parsed.data.interests, MAX_INTERESTS)
      : (existing?.interests ?? []),
    goals: has("goals") ? dedupe(parsed.data.goals, MAX_GOALS) : (existing?.goals ?? []),
    selfReportedConditions: has("selfReportedConditions")
      ? dedupe(parsed.data.selfReportedConditions, MAX_CONDITIONS)
      : (existing?.selfReportedConditions ?? []),
    sleepGoalHours: has("sleepGoalHours")
      ? (parsed.data.sleepGoalHours ?? null)
      : (existing?.sleepGoalHours ?? null),
    activityGoalMinutes: has("activityGoalMinutes")
      ? (parsed.data.activityGoalMinutes ?? null)
      : (existing?.activityGoalMinutes ?? null),
    preferredLanguage: has("preferredLanguage")
      ? (parsed.data.preferredLanguage ?? null)
      : (existing?.preferredLanguage ?? null),
    acceptConsent: parsed.data.acceptConsent === true,
  });

  return NextResponse.json(
    { profile, currentConsentVersion: CONSENT_VERSION },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function normaliseText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
