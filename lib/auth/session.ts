/**
 * Server-side sessions.
 *
 * The browser holds an opaque random token in an HttpOnly cookie. The database
 * holds only its SHA-256 digest, so the two cannot be connected by anyone who
 * reads the database, and revoking a session is a single delete.
 *
 * This module deliberately does not import `next/headers`. Cookie handling lives
 * in `lib/auth/cookies.ts` so that everything here can be exercised by the unit
 * checks without a request context.
 */
import { createHash, randomBytes } from "node:crypto";

import { getDb } from "@/lib/db/index";

/** How long a session stays valid after its last use. */
export const SESSION_TTL_DAYS = 30;
/** A session's `expires_at` is only rewritten after this much idle time. */
const REFRESH_AFTER_MINUTES = 60;

export const SESSION_COOKIE = "uh_session";

export type SessionUser = {
  id: number;
  email: string;
  createdAt: string;
};

/** The cookie value is random and never derived from the user record. */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Digest stored in the database. A plain SHA-256 is the right tool here, unlike
 * for passwords: the input is 256 bits of uniform randomness, so there is nothing
 * to guess and no benefit to a slow hash.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isoNow(): string {
  return new Date().toISOString();
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Creates a session row and returns the raw token, which is the only time it
 * exists outside the browser. It is never logged and never stored.
 */
export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = isoNow();
  const expiresAt = addMinutes(SESSION_TTL_DAYS * 24 * 60);

  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(tokenHash, userId, now, now, expiresAt);

  return { token, expiresAt };
}

type SessionRow = {
  token_hash: string;
  user_id: number;
  last_seen_at: string;
  expires_at: string;
  id: number;
  email: string;
  created_at: string;
};

/**
 * Resolves a token to its user, or null when the token is unknown or expired.
 *
 * An expired row is deleted on the way past rather than left to accumulate.
 * Expiry is checked in SQL against a bound `now` instead of in JavaScript, so
 * there is one source of truth for the comparison.
 */
export function resolveSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const now = isoNow();
  const db = getDb();

  const row = db
    .prepare(
      `SELECT s.token_hash, s.user_id, s.last_seen_at, s.expires_at,
              u.id, u.email, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, now) as SessionRow | undefined;

  if (!row) {
    // Clean up an expired row for this token if one exists.
    db.prepare(`DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?`).run(
      tokenHash,
      now,
    );
    return null;
  }

  // Sliding expiry, but not on every request: a write per request would be pure
  // overhead, and an hour of drift costs nothing at a 30-day horizon.
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > REFRESH_AFTER_MINUTES * 60_000) {
    db.prepare(`UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`).run(
      now,
      addMinutes(SESSION_TTL_DAYS * 24 * 60),
      tokenHash,
    );
  }

  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function revokeSession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashSessionToken(token));
}

/** Used when a password changes, so other devices are signed out. */
export function revokeAllSessionsForUser(userId: number): number {
  const result = getDb().prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  return result.changes;
}

/** Housekeeping: drops rows that are already unusable. */
export function deleteExpiredSessions(): number {
  const result = getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
    .run(isoNow());
  return result.changes;
}
