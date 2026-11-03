/**
 * Account and profile data access.
 *
 * Every function here takes an explicit `userId` and filters on it in SQL. There
 * is no function that accepts a user id from a request body, which is what makes
 * cross-account access a missing capability rather than a permission check that
 * could be forgotten at one call site.
 *
 * The profile is deliberately thin. Age and height matter because blood pressure
 * and weight thresholds are read differently for a child than for an adult, and
 * sex at birth changes some reference ranges. Nothing else is collected: no name,
 * no address, no contact details, no free-text history.
 */
import { getDb } from "@/lib/db/index";

import { hashPassword, normaliseEmail, PASSWORD_ALGO } from "@/lib/auth/password";
import {
  isConditionId,
  isGoalId,
  isInterestId,
  isLanguageId,
  MAX_CONDITIONS,
  MAX_GOALS,
  MAX_INTERESTS,
} from "@/lib/profile/options";
import { listSavedResources } from "@/lib/profile/saved";

/**
 * Bumping this string when the consent wording on the account page changes makes
 * it possible to see which wording a person actually agreed to.
 */
export const CONSENT_VERSION = "2026-10-01";

export type UserRecord = {
  id: number;
  email: string;
  createdAt: string;
};

export type Profile = {
  userId: number;
  displayName: string | null;
  birthYear: number | null;
  sexAtBirth: string | null;
  heightCm: number | null;
  /** Ids from `INTEREST_OPTIONS`. Empty when the person selected none. */
  interests: string[];
  /** Ids from `GOAL_OPTIONS`. */
  goals: string[];
  /** Ids from `CONDITION_OPTIONS`. The person's own account, never a verified record. */
  selfReportedConditions: string[];
  sleepGoalHours: number | null;
  activityGoalMinutes: number | null;
  preferredLanguage: string | null;
  consentVersion: string | null;
  consentAt: string | null;
  updatedAt: string;
};

/**
 * Reads one of the JSON-array columns.
 *
 * Anything that is not a stored array of known ids reads as empty: a truncated
 * write, a value written by an older version, or a hand-edited row cannot put an
 * unknown id into a recommendation or a filter, because the check is the
 * vocabulary itself rather than the shape of the string.
 */
function readIdList(
  raw: unknown,
  isKnownId: (value: unknown) => boolean,
  max: number,
): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    for (const value of parsed) {
      if (isKnownId(value) && !seen.has(value as string)) seen.add(value as string);
      if (seen.size >= max) break;
    }
    return [...seen];
  } catch {
    return [];
  }
}

function writeIdList(values: string[]): string {
  return JSON.stringify(values.slice(0, MAX_INTERESTS));
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account already exists for that email address.");
    this.name = "EmailTakenError";
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

export async function createUser(
  email: string,
  password: string,
  /**
   * Registration requires the storage notice to be accepted, and the acceptance is
   * recorded against the version in force at the time. Leaving this null would
   * mean an account whose owner agreed to the notice showed as never having agreed
   * to one, which is what the page did before this was wired up.
   */
  consentAccepted: boolean,
): Promise<UserRecord> {
  const db = getDb();
  const normalised = normaliseEmail(email);
  const now = isoNow();
  const hash = await hashPassword(password);

  try {
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, password_algo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(normalised, hash, PASSWORD_ALGO, now, now);
    const id = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO profiles
         (user_id, display_name, birth_year, sex_at_birth, height_cm,
          consent_version, consent_at, created_at, updated_at)
       VALUES (?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
    ).run(
      id,
      consentAccepted ? CONSENT_VERSION : null,
      consentAccepted ? now : null,
      now,
      now,
    );

    return { id, email: normalised, createdAt: now };
  } catch (error) {
    // The UNIQUE constraint is what enforces one account per address; checking
    // first and inserting second would race.
    if (String(error).includes("UNIQUE constraint failed: users.email")) {
      throw new EmailTakenError();
    }
    throw error;
  }
}

/** Full row including the hash. Only the login route should call this. */
export function findUserForAuthentication(
  email: string,
): { id: number; email: string; passwordHash: string; createdAt: string } | null {
  const row = getDb()
    .prepare(`SELECT id, email, password_hash, created_at FROM users WHERE email = ?`)
    .get(normaliseEmail(email)) as
    | { id: number; email: string; password_hash: string; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export function getUserById(userId: number): UserRecord | null {
  const row = getDb()
    .prepare(`SELECT id, email, created_at FROM users WHERE id = ?`)
    .get(userId) as { id: number; email: string; created_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function getProfile(userId: number): Profile | null {
  const row = getDb()
    .prepare(
      `SELECT user_id, display_name, birth_year, sex_at_birth, height_cm,
              interests, goals, self_reported_conditions, sleep_goal_hours,
              activity_goal_minutes, preferred_language,
              consent_version, consent_at, updated_at
         FROM profiles WHERE user_id = ?`,
    )
    .get(userId) as
    | {
        user_id: number;
        display_name: string | null;
        birth_year: number | null;
        sex_at_birth: string | null;
        height_cm: number | null;
        interests: unknown;
        goals: unknown;
        self_reported_conditions: unknown;
        sleep_goal_hours: number | null;
        activity_goal_minutes: number | null;
        preferred_language: string | null;
        consent_version: string | null;
        consent_at: string | null;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.display_name,
    birthYear: row.birth_year,
    sexAtBirth: row.sex_at_birth,
    heightCm: row.height_cm,
    interests: readIdList(row.interests, isInterestId, MAX_INTERESTS),
    goals: readIdList(row.goals, isGoalId, MAX_GOALS),
    selfReportedConditions: readIdList(
      row.self_reported_conditions,
      isConditionId,
      MAX_CONDITIONS,
    ),
    sleepGoalHours: row.sleep_goal_hours,
    activityGoalMinutes: row.activity_goal_minutes,
    preferredLanguage:
      row.preferred_language && isLanguageId(row.preferred_language)
        ? row.preferred_language
        : null,
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    updatedAt: row.updated_at,
  };
}

export type ProfileInput = {
  displayName: string | null;
  birthYear: number | null;
  sexAtBirth: string | null;
  heightCm: number | null;
  interests: string[];
  goals: string[];
  selfReportedConditions: string[];
  sleepGoalHours: number | null;
  activityGoalMinutes: number | null;
  preferredLanguage: string | null;
  /** Set when the person accepted the current consent wording in this request. */
  acceptConsent: boolean;
};

export function updateProfile(userId: number, input: ProfileInput): Profile {
  const db = getDb();
  const now = isoNow();
  const existing = getProfile(userId);

  const consentAt = input.acceptConsent ? (existing?.consentAt ?? now) : (existing?.consentAt ?? null);
  const consentVersion = input.acceptConsent
    ? CONSENT_VERSION
    : (existing?.consentVersion ?? null);

  db.prepare(
    `UPDATE profiles
        SET display_name = ?, birth_year = ?, sex_at_birth = ?, height_cm = ?,
            interests = ?, goals = ?, self_reported_conditions = ?,
            sleep_goal_hours = ?, activity_goal_minutes = ?, preferred_language = ?,
            consent_version = ?, consent_at = ?, updated_at = ?
      WHERE user_id = ?`,
  ).run(
    input.displayName,
    input.birthYear,
    input.sexAtBirth,
    input.heightCm,
    writeIdList(input.interests),
    JSON.stringify(input.goals.slice(0, MAX_GOALS)),
    JSON.stringify(input.selfReportedConditions.slice(0, MAX_CONDITIONS)),
    input.sleepGoalHours,
    input.activityGoalMinutes,
    input.preferredLanguage,
    consentVersion,
    consentAt,
    now,
    userId,
  );

  const updated = getProfile(userId);
  if (!updated) throw new Error("Profile row was missing when it should have existed.");
  return updated;
}

/*
 * The personal-data export lives in `lib/export/report.ts`, which assembles the
 * report both downloads are rendered from. It was in this file until the export
 * grew a PDF, a summary section and a stated scope: those are presentation
 * decisions about the export rather than account data access, and keeping them here
 * would have made this module the place where "what is exported" is decided twice.
 */

/**
 * Deletes the account. Health records, profile and sessions go with it through
 * ON DELETE CASCADE, so this is a single statement rather than a sequence that
 * could stop halfway and leave orphaned health data behind.
 */
export function deleteUserAccount(userId: number): boolean {
  const result = getDb().prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  return result.changes > 0;
}
