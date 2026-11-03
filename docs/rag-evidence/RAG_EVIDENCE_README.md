# RAG evidence package — for reviewers

This folder is the verifiable evidence behind the platform's claim: **37 source
documents, 343 indexed passages, 6 publishers, 5 licences, retrieval backend
`sqlite-exact`**. Nothing here was typed by hand; it is regenerated from the live
database and the curated manifest by a read-only script.

## What is in here

| File | What it proves |
| --- | --- |
| [RAG_SOURCE_INVENTORY.csv](RAG_SOURCE_INVENTORY.csv) | One row per document: id, title, publisher, topic, source URL, licence, retrieval date, review status, passage count, content hash. Open it in Excel or a text editor. |
| [RAG_SOURCE_INVENTORY.json](RAG_SOURCE_INVENTORY.json) | The same inventory, machine-readable, with totals, publisher/licence breakdowns and a `generatedAt` timestamp. |
| [RAG_CORPUS_REPORT.md](RAG_CORPUS_REPORT.md) | Totals, publisher list, licence list, the full pipeline (collection → ingestion → chunking → indexing → retrieval → citation → abstention), review status and known limitations. |
| [RAG_DATABASE_GUIDE.md](RAG_DATABASE_GUIDE.md) | Where the SQLite file actually is, its schema, and copy-paste inspection commands for Node, PowerShell, Python and the `sqlite3` CLI. |
| [RAG_RETRIEVAL_DEMO.md](RAG_RETRIEVAL_DEMO.md) | Real captured retrieval runs: question, fused ranks, cosine scores, and the exact source each passage came from, plus an observed abstention. |
| `RAG_EVIDENCE_README.md` | This file. |

## The fastest way to show this to evaluators

1. **In VS Code (5 seconds):** open the folder `website/docs/rag-evidence/` in
   the Explorer sidebar. Click `RAG_SOURCE_INVENTORY.csv` (Excel-friendly, every
   row is a real source) and `RAG_CORPUS_REPORT.md` (renders with the preview
   button, Ctrl+Shift+V). This is the whole package in one place.
2. **From the running website (live):** open
   <http://localhost:3101/library> in a browser. It lists every document with
   publisher, licence, retrieval date, review status and indexed passage count,
   and the **Download CSV / Download JSON** buttons export the same inventory on
   demand, generated from the database at request time.
3. **From the database itself:** follow [RAG_DATABASE_GUIDE.md](RAG_DATABASE_GUIDE.md)
   and run the one-liner to count rows directly, or run
   `pnpm tsx scripts/rag-audit.ts` to re-audit everything and regenerate this
   folder.
4. **Live retrieval:** run `pnpm retrieval-check` and let the evaluator watch the
   fused ranking print, then compare with [RAG_RETRIEVAL_DEMO.md](RAG_RETRIEVAL_DEMO.md).

## How to verify the numbers yourself

```bash
cd "website"

# 1. Re-audit everything (read-only) and regenerate this folder.
pnpm tsx scripts/rag-audit.ts
# Expected final line: AUDIT PASSED: every number is backed by a database row.

# 2. Ask the running app to export the same inventory.
curl "http://localhost:3101/api/corpus/inventory?format=json"
curl "http://localhost:3101/api/corpus/inventory?format=csv"

# 3. Run retrieval and watch the ranking, not just the answer.
pnpm retrieval-check

# 4. Full regression suites that cover retrieval, citation and abstention.
pnpm check:assistant
```

Each source's original URL is in the inventory. Open any of them in a browser to
confirm the publisher and page exist; the licence text recorded in the inventory
should match that publisher's published terms.

## What the numbers do and do not mean

- **Indexed** = the document's text is stored, chunked, embedded and searchable
  (by vector similarity and BM25 keyword). It says nothing about clinical review.
- **Reviewed** = a named person recorded a decision in a version-controlled
  ledger. That ledger is currently **empty**: no document has been clinically
  reviewed, and every inventory row says `not-reviewed`. Nothing on this platform
  has been clinically validated.
- **Licences** are recorded from each publisher's own published terms at
  collection time and shown for attribution. They are the project's records, not
  a legal opinion. Where a publisher's terms are general terms of use rather than
  an explicit content licence, the recorded licence text says so.
- The retrieval figures in `docs/evaluation.md` are measured against a small,
  hand-built question set and should be read as an upper estimate.

## Privacy and safety of this package

The inventory and exports contain **only public corpus metadata**: titles,
publishers, source URLs, licence text, dates, counts and content hashes. They
contain no server filesystem paths, no environment variables, no credentials, no
user accounts and no patient data. The corpus text itself is not reproduced here;
each row links to its original source instead.

## Keeping it honest

`scripts/rag-audit.ts` exits non-zero if the database and the curated manifest
ever disagree (an indexed document missing from the manifest, a manifest entry
that was never ingested, a changed URL/publisher/licence, an empty passage, or a
count that does not add up). Regenerate this folder with that script rather than
editing the files by hand, so the evidence always reflects the real corpus.
