/**
 * Learning material a signed-in person chose to keep.
 *
 * Only a reference is stored: a kind and an id from one of the platform's own
 * catalogues. The title and the URL are resolved on read, which is what stops a
 * saved row from holding a link that was never in the catalogue. That matters for
 * two reasons: a stored URL supplied by a caller is a place to park an arbitrary
 * link, and a stored copy of a title would silently go stale when a catalogue
 * entry is corrected.
 *
 * Everything here filters on `user_id` in SQL, including the delete, so removing
 * someone else's saved item is not a permission that can be forgotten at a call
 * site.
 */
import { getDb, getStore } from "@/lib/db/index";
import { getPodcastEntry } from "@/lib/podcasts/catalogue";

export const SAVED_KINDS = ["podcast", "library-document"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export function isSavedKind(value: unknown): value is SavedKind {
  return typeof value === "string" && SAVED_KINDS.includes(value as SavedKind);
}

/** A saved row as stored, before it is resolved against a catalogue. */
type SavedRow = {
  id: number;
  kind: string;
  ref_id: string;
  saved_at: string;
};

/**
 * A saved item with its display details resolved at read time.
 *
 * `title` and `url` are null when the referenced entry is no longer in the
 * catalogue. Those rows are reported rather than hidden, so a saved item that has
 * been withdrawn from the catalogue shows as unavailable instead of silently
 * disappearing from the person's own list.
 */
export type SavedResource = {
  id: number;
  kind: SavedKind;
  refId: string;
  title: string | null;
  url: string | null;
  /** Where the item lives on this platform, so the interface can link back to it. */
  localPath: string | null;
  savedAt: string;
  available: boolean;
};

function resolve(
  kind: SavedKind,
  refId: string,
): { title: string; url: string; localPath: string } | null {
  if (kind === "podcast") {
    const entry = getPodcastEntry(refId);
    if (!entry) return null;
    return {
      title: entry.title,
      url: entry.videoUrl,
      localPath: `/podcasts/${entry.id}`,
    };
  }
  const document = getStore().getDocumentBySourceId(refId);
  if (!document) return null;
  return {
    title: document.title,
    url: document.sourceUrl,
    localPath: `/library/${document.sourceId}`,
  };
}

function toSavedResource(row: SavedRow): SavedResource {
  const kind = isSavedKind(row.kind) ? row.kind : "podcast";
  const details = resolve(kind, row.ref_id);
  return {
    id: row.id,
    kind,
    refId: row.ref_id,
    title: details?.title ?? null,
    url: details?.url ?? null,
    localPath: details?.localPath ?? null,
    savedAt: row.saved_at,
    available: details !== null,
  };
}

export function listSavedResources(userId: number): SavedResource[] {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, ref_id, saved_at FROM saved_resources
        WHERE user_id = ? ORDER BY saved_at DESC, id DESC`,
    )
    .all(userId) as SavedRow[];
  return rows.map(toSavedResource);
}

/**
 * Saves a catalogue reference. Returns null when the reference is not in the
 * catalogue, so the route can answer 404 rather than store something that cannot
 * be resolved back.
 *
 * Saving the same item twice is not an error: the UNIQUE constraint makes the
 * insert idempotent and the existing row is returned, so a double click in a
 * client cannot produce a duplicate or a failure.
 */
export function saveResource(
  userId: number,
  kind: SavedKind,
  refId: string,
): SavedResource | null {
  if (!resolve(kind, refId)) return null;
  const db = getDb();
  db.prepare(
    `INSERT INTO saved_resources (user_id, kind, ref_id, saved_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, kind, ref_id) DO NOTHING`,
  ).run(userId, kind, refId, new Date().toISOString());

  const row = db
    .prepare(
      `SELECT id, kind, ref_id, saved_at FROM saved_resources
        WHERE user_id = ? AND kind = ? AND ref_id = ?`,
    )
    .get(userId, kind, refId) as SavedRow | undefined;
  return row ? toSavedResource(row) : null;
}

/** Returns false when no row matched, which covers another account's row too. */
export function removeSavedResource(
  userId: number,
  kind: SavedKind,
  refId: string,
): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM saved_resources WHERE user_id = ? AND kind = ? AND ref_id = ?`,
    )
    .run(userId, kind, refId);
  return result.changes > 0;
}

export function countSavedResources(userId: number): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM saved_resources WHERE user_id = ?`)
      .get(userId) as { n: number }
  ).n;
}
