# RAG database guide

## What the database actually is

The retrieval corpus lives in a single **SQLite** file, opened through
[`better-sqlite3`](https://www.npmjs.com/package/better-sqlite3), a Node.js native
module installed with this project's normal dependencies. SQLite itself needs no
separate installation: the engine ships inside that module, and the file format is
standard SQLite, so the same file can be opened read-only with Python's built-in
`sqlite3` module, the `sqlite3` CLI, or any SQLite browser.

The website's own code opens the file in
[`lib/db/index.ts`](../../lib/db/index.ts) and wraps it in the typed knowledge
store in [`lib/db/sqlite-store.ts`](../../lib/db/sqlite-store.ts).

## Exact runtime path

The path is resolved in [`lib/config.ts`](../../lib/config.ts):

| Priority | Source | Example |
| --- | --- | --- |
| 1 | `HEALTH_DB_PATH` environment variable | any path you choose |
| 2 | `HEALTH_DATA_DIR` environment variable + `/health.db` | `<yourdir>/health.db` |
| 3 | default: `<working directory>/data/health.db` | `D:\UltimateHealth(F)\ultimatehealth\website\data\health.db` |

On this machine, with the server started from the `website` directory, the runtime
file is:

```
D:\UltimateHealth(F)\ultimatehealth\website\data\health.db
```

Two companion files appear next to it because the database runs in WAL mode:

```
data\health.db        the database itself
data\health.db-wal    write-ahead log (uncommitted or recently committed data)
data\health.db-shm    shared-memory index used by WAL
```

All three belong together. If you copy the corpus to another machine, copy the
`.db` file only after checkpointing (see below), or copy all three while no
process is using the database.

## Does it exist, and is the corpus in it?

Yes. The file on this machine is about 2.3 MB and contains the whole corpus:
37 rows in `documents`, 343 rows in `chunks`, each chunk with an embedding blob.
`pnpm tsx scripts/rag-audit.ts` re-checks this and fails loudly if the counts ever
disagree with the manifest.

## Persistence and initialisation

- **Created** on first use: `openDatabase()` in `lib/db/index.ts` creates the
  parent directory, opens the file, sets `journal_mode = WAL` and
  `foreign_keys = ON`, then executes `SCHEMA_SQL` from
  [`lib/db/schema.ts`](../../lib/db/schema.ts) and applies incremental column
  migrations. Running against an existing file is a no-op, so the schema never
  overwrites data it already matches.
- **Persists** across restarts: it is an ordinary file on disk. Restarting or
  rebuilding the website does not touch it. Only `pnpm ingest` changes corpus
  rows, and it replaces a document's chunks as a unit.
- **Connection reuse**: the server caches one connection on `globalThis`, so a
  development hot-reload does not open a new file handle each time.

## Schema relevant to retrieval

| Table | What it holds |
| --- | --- |
| `documents` | One row per source: `source_id`, `topic`, `title`, `publisher`, `source_url`, `licence`, `licence_url`, `retrieved_at`, `content_sha256`, `word_count` |
| `chunks` | Indexed passages: `document_id` (FK), `ordinal`, `heading`, `text`, `char_count`, `embedding` (Float32 BLOB), `embedding_model`, `embedding_dim` |
| `chunks_fts` | FTS5 external-content full-text index over the chunks, maintained by triggers; source of the BM25 keyword ranking |
| `document_revisions` | One row per observed content hash, so a re-fetched page can be told apart from the previous copy |
| `ingestion_runs` | One row per source per ingestion attempt: status, detail, chunk count, timestamp |
| `retrieval_log` | Records retrieval outcomes used by evaluation |

The same database also holds the application's non-corpus tables (accounts,
sessions, personal health records, community posts, saved resources). Retrieval
only reads `documents`, `chunks`, and `chunks_fts`.

## Is `sqlite-exact` genuinely the active backend?

`sqlite-exact` is not a decorative label. `createSqliteStore()` returns
`backend: "sqlite-exact"`, and the home page prints whatever the live store
reports. The name describes the vector-search strategy: an **exact** full scan of
every stored embedding (`vectorSearch` in `lib/db/sqlite-store.ts`), chosen so
evaluation is deterministic at this corpus size.

Importantly, the backend name does **not** mean retrieval is exact keyword
matching. Retrieval is **hybrid**: the exact vector ranking and a BM25 keyword
ranking from FTS5 are fused with reciprocal rank fusion in
[`lib/rag/retrieve.ts`](../../lib/rag/retrieve.ts). Both rankers were observed
executing in `pnpm retrieval-check` (see [RAG_RETRIEVAL_DEMO.md](RAG_RETRIEVAL_DEMO.md)).

## Safe inspection commands

Run these from the `website` directory. All open the file read-only.

### Node (already a project dependency — recommended)

```bash
node -e "const D=require('better-sqlite3');const db=new D('data/health.db',{readonly:true});console.log(db.prepare('SELECT COUNT(*) n FROM documents').get(),db.prepare('SELECT COUNT(*) n FROM chunks').get());"
```

Per-document passage counts:

```bash
node -e "const D=require('better-sqlite3');const db=new D('data/health.db',{readonly:true});db.prepare('SELECT d.source_id,d.title,COUNT(c.id) passages FROM documents d LEFT JOIN chunks c ON c.document_id=d.id GROUP BY d.id ORDER BY d.source_id').all().forEach(r=>console.log(r.passages,r.source_id));"
```

### PowerShell

The one-liners above work in PowerShell too:

```powershell
cd "D:\UltimateHealth(F)\ultimatehealth\website"
node -e "const D=require('better-sqlite3');const db=new D('data/health.db',{readonly:true});console.log(db.prepare('SELECT COUNT(*) n FROM documents').get());"
```

If you prefer the `sqlite3` CLI and it is installed:

```
sqlite3 -readonly data/health.db "SELECT COUNT(*) FROM documents;"
```

### Python (standard library)

```powershell
python -c "import sqlite3; con=sqlite3.connect(r'file:data/health.db?mode=ro', uri=True); print(con.execute('select count(*) from documents').fetchone())"
```

### The audit script

```bash
pnpm tsx scripts/rag-audit.ts
```

It reads the database read-only, cross-checks it against the curated manifest and
the review ledger, regenerates `docs/rag-evidence/` and exits non-zero if
anything disagrees.

## Precautions

- Do not open the file read-write from a second program while the server is
  running unless you know you need to; WAL allows concurrent readers, but a
  foreign writer can still lock the database.
- Never edit `documents` or `chunks` by hand to change a statistic. Change the
  manifest and re-run `pnpm ingest`, then the audit script.
- `retrieval_log` and application tables contain operational and user data. Keep
  them out of any file you share with evaluators; the generated inventory
  contains only public corpus metadata.
