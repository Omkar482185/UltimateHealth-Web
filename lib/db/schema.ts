/**
 * Database schema for the knowledge corpus and retrieval layer.
 *
 * Stored as a TypeScript string rather than a .sql file so it can be applied by
 * both the ingestion scripts and the running Next.js server without a bundler
 * workaround. Statements are idempotent: `applySchema` may run on every boot.
 *
 * Vector storage: embeddings are stored as normalised Float32 BLOBs. Because
 * vectors are unit length, cosine similarity reduces to a dot product, which the
 * exact-search index computes in process. See `lib/db/vectors.ts` for the
 * storage interface, which is written so the implementation can be swapped for
 * pgvector without touching callers.
 */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Curated source documents with full provenance and licence tracking.
CREATE TABLE IF NOT EXISTS documents (
  id             INTEGER PRIMARY KEY,
  source_id      TEXT NOT NULL UNIQUE,
  topic          TEXT NOT NULL,
  title          TEXT NOT NULL,
  publisher      TEXT NOT NULL,
  source_url     TEXT NOT NULL,
  licence        TEXT NOT NULL,
  licence_url    TEXT,
  retrieved_at   TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  word_count     INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_topic ON documents(topic);

-- Every distinct revision of a document that has ever been indexed, keyed by the
-- content hash. Re-ingesting identical content adds nothing, so this table is both
-- the version history and the evidence that a hash has been seen before.
-- A clinical review is recorded against one of these hashes, which is what makes it
-- possible to tell that a re-fetched page has changed and the review no longer
-- covers the current text.
CREATE TABLE IF NOT EXISTS document_revisions (
  id             INTEGER PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_id      TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  word_count     INTEGER NOT NULL,
  retrieved_at   TEXT NOT NULL,
  recorded_at    TEXT NOT NULL,
  UNIQUE(document_id, content_sha256)
);

CREATE INDEX IF NOT EXISTS idx_revisions_document ON document_revisions(document_id, recorded_at DESC);

-- One row per attempt to ingest a source, so a failure is recorded rather than
-- only printed to a console that nobody keeps.
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id          INTEGER PRIMARY KEY,
  source_id   TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT,
  chunk_count INTEGER,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_source ON ingestion_runs(source_id, recorded_at DESC);

-- Semantically chunked passages with their embeddings.
CREATE TABLE IF NOT EXISTS chunks (
  id              INTEGER PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  heading         TEXT,
  text            TEXT NOT NULL,
  char_count      INTEGER NOT NULL,
  embedding       BLOB NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim   INTEGER NOT NULL,
  UNIQUE(document_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

-- Keyword (BM25) index over the same rows.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  content='chunks',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_fts_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
END;

-- ---------------------------------------------------------------------------
-- Accounts and personal health data.
--
-- These tables are separate from the knowledge corpus on purpose. The corpus is
-- public reference material with no owner; everything below belongs to one
-- person and is reachable only through that person's session. No table here is
-- ever read by the retrieval layer, so a question sent to the assistant cannot
-- pull a health record into a model prompt.
--
-- Stored values are deliberately minimal. There is no name field, no address, no
-- phone number, and no free-text medical history, because none of those are
-- needed to place a reading against a threshold.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Sessions are server-side. The cookie carries a random token; this table stores
-- only its SHA-256 digest, so a copy of the database does not yield a usable
-- session and a stolen cookie cannot be recovered from a backup.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- One profile per account. consent_version records which wording of the
-- consent notice the person accepted, so a later change to that wording is
-- visible rather than assumed.
CREATE TABLE IF NOT EXISTS profiles (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name    TEXT,
  birth_year      INTEGER,
  sex_at_birth    TEXT,
  height_cm       INTEGER,
  consent_version TEXT,
  consent_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  -- Added after the first release; see ADDED_PROFILE_COLUMNS below, which brings
  -- an existing database up to this shape with ALTER TABLE.
  --
  -- interests, goals and self_reported_conditions hold JSON arrays of ids from
  -- the closed vocabularies in lib/profile/options.ts. Free text is deliberately
  -- not stored: an id can be matched against the corpus and the podcast catalogue
  -- by a rule that can be read and tested, and a free-text health history would be
  -- both unusable for that and the most sensitive thing this project could hold.
  interests               TEXT,
  goals                   TEXT,
  self_reported_conditions TEXT,
  sleep_goal_hours        REAL,
  activity_goal_minutes   INTEGER,
  preferred_language      TEXT
);

-- Learning material a signed-in person chose to keep. Only the reference is
-- stored, never a copy of the content: the title and URL are resolved from the
-- catalogue on read, so a saved item cannot drift into a stale or spoofed link.
CREATE TABLE IF NOT EXISTS saved_resources (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  saved_at   TEXT NOT NULL,
  UNIQUE(user_id, kind, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_resources(user_id, saved_at DESC);

-- Recommendations the person dismissed or completed.
--
-- Only the key and the state are stored, never a copy of the recommendation: the
-- text is recomputed from current data on every visit, so a suggestion that is no
-- longer true cannot be brought back by restoring a stored string. The key is what
-- makes "do not show me this again" possible without hiding the rules themselves.
CREATE TABLE IF NOT EXISTS recommendation_state (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_key    TEXT NOT NULL,
  state      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, rec_key)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_state_user ON recommendation_state(user_id);

-- Measurements the person recorded themselves. The source column distinguishes a
-- value a person typed in from anything the platform computed, so a chart can
-- never present a derived number as a measurement.
CREATE TABLE IF NOT EXISTS health_records (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  value_primary  REAL,
  value_secondary REAL,
  unit           TEXT,
  measured_at    TEXT NOT NULL,
  note           TEXT,
  source         TEXT NOT NULL DEFAULT 'self-reported',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_user_kind_time
  ON health_records(user_id, kind, measured_at DESC);

-- ---------------------------------------------------------------------------
-- Peer community.
--
-- Separate from the corpus and from the personal health tables. A community
-- post is public to anyone who can read the site, so nothing from the profile
-- or health-record tables is copied into it: the only author data rendered is the
-- display name or a stable pseudonym, resolved at read time.
--
-- Deletion is soft for moderation. A removed row keeps its id and timestamps so
-- that reports and replies keep pointing at something, but its title, body and
-- author are not returned by any public query. Author account deletion removes
-- their posts and comments through ON DELETE CASCADE, which is deliberate: the
-- platform should not keep publishing words after their author has asked for
-- their account and data to be deleted.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS community_posts (
  id          INTEGER PRIMARY KEY,
  disease_id  TEXT NOT NULL,
  topic_id    TEXT NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  edited_at   TEXT,
  -- 'author' when the writer deleted it, 'moderator' when it was removed after a
  -- report. NULL means visible.
  removed_at  TEXT,
  removed_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_community_posts_disease
  ON community_posts(disease_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author
  ON community_posts(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_comments (
  id                INTEGER PRIMARY KEY,
  post_id           INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- One level of replies. NULL is a top-level comment; a reply points at a
  -- top-level comment on the same post, enforced in the data layer.
  parent_comment_id INTEGER REFERENCES community_comments(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  edited_at         TEXT,
  removed_at        TEXT,
  removed_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON community_comments(post_id, created_at ASC);

-- One "helpful" mark per person per post. The primary key is what prevents a
-- second reaction from inflating a count, rather than a check in the UI.
CREATE TABLE IF NOT EXISTS community_reactions (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions(post_id);

-- Reports are kept after review so that a removal has a record behind it. The
-- unique index stops one person filing the same report repeatedly.
CREATE TABLE IF NOT EXISTS community_reports (
  id              INTEGER PRIMARY KEY,
  post_id         INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id      INTEGER REFERENCES community_comments(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL,
  reporter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  detail          TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TEXT NOT NULL,
  reviewed_at     TEXT,
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reports_unique
  ON community_reports(reporter_id, COALESCE(post_id, 0), COALESCE(comment_id, 0));
CREATE INDEX IF NOT EXISTS idx_community_reports_status
  ON community_reports(status, created_at DESC);

-- Communities a person chose to follow. This is an explicit selection, not an
-- inference: following a community is not a statement that the person has the
-- condition, and it is not copied into the health profile.
CREATE TABLE IF NOT EXISTS community_follows (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disease_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, disease_id)
);

-- Audit trail of assistant interactions. No user identifiers are stored here:
-- prompts are not linked to any person, and questions sent to the assistant are
-- not tied to an account even when the reader is signed in.
CREATE TABLE IF NOT EXISTS retrieval_log (
  id              INTEGER PRIMARY KEY,
  created_at      TEXT NOT NULL,
  question        TEXT NOT NULL,
  answer_mode     TEXT NOT NULL,
  chunk_ids       TEXT NOT NULL,
  top_cosine      REAL,
  latency_ms      INTEGER NOT NULL,
  citation_count  INTEGER NOT NULL,
  stripped_citations INTEGER NOT NULL
);
`;

/**
 * Columns added to existing tables after a database has already been created.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and `CREATE TABLE IF NOT EXISTS`
 * silently does nothing for a table that already exists, so a database created
 * before the profile was extended would keep the old column set and every insert
 * naming a new column would fail. Each entry is applied only when the column is
 * genuinely absent, which is what makes this safe to run on every boot: it is a
 * no-op once the database matches the schema above, and it never rewrites or
 * drops a row.
 */
export const ADDED_PROFILE_COLUMNS: readonly { name: string; type: string }[] = [
  { name: "interests", type: "TEXT" },
  { name: "goals", type: "TEXT" },
  { name: "self_reported_conditions", type: "TEXT" },
  { name: "sleep_goal_hours", type: "REAL" },
  { name: "activity_goal_minutes", type: "INTEGER" },
  { name: "preferred_language", type: "TEXT" },
];

/**
 * The slice of a SQLite connection this migration needs, declared structurally so
 * that `schema.ts` does not have to import the database module that imports it.
 */
type MigratableDb = {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
  exec(sql: string): unknown;
};

/**
 * Brings an existing `profiles` table up to the current column set. Returns the
 * columns that were actually added, so a caller can log or assert on them.
 */
export function applySchemaMigrations(db: MigratableDb): string[] {
  const existing = new Set(
    (db.prepare(`PRAGMA table_info(profiles)`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );

  const added: string[] = [];
  for (const column of ADDED_PROFILE_COLUMNS) {
    if (existing.has(column.name)) continue;
    // The column name comes from the constant above and never from a request, so
    // there is nothing to inject here. Every other statement in this project is
    // parameterised.
    db.exec(`ALTER TABLE profiles ADD COLUMN ${column.name} ${column.type}`);
    added.push(column.name);
  }
  return added;
}
