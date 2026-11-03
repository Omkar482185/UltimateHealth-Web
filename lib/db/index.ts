import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { DB_PATH } from "@/lib/config";
import { applySchemaMigrations, SCHEMA_SQL } from "@/lib/db/schema";
import { createSqliteStore } from "@/lib/db/sqlite-store";
import type { KnowledgeStore } from "@/lib/db/store";

export type Db = Database.Database;

/**
 * Next.js reloads modules on change in development, which would otherwise open a
 * new file handle each time. Cache the connection on globalThis.
 */
const globalForDb = globalThis as unknown as {
  __healthDb?: Db;
  __healthStore?: KnowledgeStore;
};

function openDatabase(): Db {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  // Columns added after the first release are applied here rather than only in the
  // CREATE TABLE above, because that statement does nothing for a table that
  // already exists. This is a no-op once the database matches the schema.
  applySchemaMigrations(db);
  return db;
}

export function getDb(): Db {
  if (!globalForDb.__healthDb) {
    globalForDb.__healthDb = openDatabase();
  }
  return globalForDb.__healthDb;
}

/** The knowledge store used by the retrieval layer. */
export function getStore(): KnowledgeStore {
  if (!globalForDb.__healthStore) {
    globalForDb.__healthStore = createSqliteStore(getDb());
  }
  return globalForDb.__healthStore;
}
