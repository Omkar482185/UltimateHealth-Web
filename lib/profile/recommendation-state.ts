/**
 * Which recommendations a person has dismissed or marked done.
 *
 * This stores the key of a recommendation and nothing else. The text is recomputed
 * from current data on every visit, which matters: a recommendation is derived from
 * the person's own recorded numbers, so a stored copy could keep claiming something
 * that has since stopped being true. Suppressing the key is the whole mechanism, and
 * clearing the state brings the recomputed version back.
 *
 * A key is a short identifier produced by `lib/recommendations.ts`, for example
 * `measurement:blood-pressure` or `education:library:who-hypertension`. It is
 * validated for shape here so a caller cannot grow this table with arbitrary text.
 */
import { getDb } from "@/lib/db/index";

export const RECOMMENDATION_STATES = ["dismissed", "done"] as const;
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];

export function isRecommendationState(value: unknown): value is RecommendationState {
  return (
    typeof value === "string" &&
    RECOMMENDATION_STATES.includes(value as RecommendationState)
  );
}

/** Longest key accepted. The real keys are well under this. */
const KEY_MAX = 120;

export function isValidRecommendationKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= KEY_MAX &&
    /^[a-z0-9:_-]+$/i.test(value)
  );
}

export function listRecommendationStates(
  userId: number,
): { key: string; state: RecommendationState; updatedAt: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT rec_key, state, updated_at FROM recommendation_state
        WHERE user_id = ? ORDER BY updated_at DESC`,
    )
    .all(userId) as { rec_key: string; state: string; updated_at: string }[];
  return rows
    .filter((row) => isRecommendationState(row.state))
    .map((row) => ({
      key: row.rec_key,
      state: row.state as RecommendationState,
      updatedAt: row.updated_at,
    }));
}

/** Keys the recommendation list should leave out. */
export function suppressedRecommendationKeys(userId: number): string[] {
  return listRecommendationStates(userId).map((entry) => entry.key);
}

export function setRecommendationState(
  userId: number,
  key: string,
  state: RecommendationState,
): void {
  getDb()
    .prepare(
      `INSERT INTO recommendation_state (user_id, rec_key, state, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, rec_key)
       DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    )
    .run(userId, key, state, new Date().toISOString());
}

/** Returns false when there was nothing recorded, which is not an error. */
export function clearRecommendationState(userId: number, key: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM recommendation_state WHERE user_id = ? AND rec_key = ?`)
    .run(userId, key);
  return result.changes > 0;
}
