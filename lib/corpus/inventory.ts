/**
 * Verified corpus inventory.
 *
 * Every row is built by joining three real records: the curated manifest in
 * `lib/corpus/sources.ts`, the row actually stored in the retrieval database,
 * and the governance ledger in `lib/corpus/source-reviews.json`. Nothing here is
 * typed by hand, so the inventory cannot drift from the corpus it describes.
 *
 * Used by two consumers:
 *  - `scripts/rag-audit.ts`, which writes the evaluator evidence package under
 *    `docs/rag-evidence/` (including internal paths, for someone with the repo).
 *  - `GET /api/corpus/inventory`, the public export offered on the library page.
 *    The public payload deliberately omits `localLocation`, so no filesystem
 *    detail leaves the server through the API.
 */
import { reviewFor } from "@/lib/corpus/reviews";
import { CORPUS_SOURCES, TOPIC_LABELS, type TopicId } from "@/lib/corpus/sources";
import { getStore } from "@/lib/db/index";

/** Where a document's text lives, for a reader who has the repository open. */
export const CORPUS_LOCAL_LOCATION = "data/health.db :: documents + chunks";

export type ReviewStatusValue = "not-reviewed" | "current" | "superseded";

export type InventoryRow = {
  sourceId: string;
  /** Row id in the database, so a row can be located with a single query. */
  documentRowId: number;
  title: string;
  topic: string;
  topicLabel: string;
  publisher: string;
  sourceUrl: string;
  sourceType: "HTML";
  licence: string;
  licenceUrl: string | null;
  retrievedAt: string;
  contentSha256: string;
  wordCount: number;
  indexedPassages: number;
  reviewStatus: ReviewStatusValue;
  reviewLabel: string;
  /** True when the document has at least one passage a ranker could return. */
  searchable: boolean;
  /** True when the document is present in both the manifest and the database. */
  inManifest: boolean;
  localLocation: string;
};

export type InventoryDiscrepancy = {
  kind: string;
  sourceId: string;
  detail: string;
};

export type Inventory = {
  generatedAt: string;
  backend: string;
  database: string;
  documentCount: number;
  passageCount: number;
  publishers: { publisher: string; documents: number }[];
  licences: { licence: string; licenceUrl: string | null; documents: number }[];
  rows: InventoryRow[];
  discrepancies: InventoryDiscrepancy[];
};

export function buildInventory(): Inventory {
  const store = getStore();
  const documents = store.listDocuments();
  const manifestBySourceId = new Map(
    CORPUS_SOURCES.map((source) => [source.sourceId, source]),
  );
  const dbBySourceId = new Map(documents.map((doc) => [doc.sourceId, doc]));

  const discrepancies: InventoryDiscrepancy[] = [];
  const rows: InventoryRow[] = documents.map((doc) => {
    const manifest = manifestBySourceId.get(doc.sourceId);
    const chunks = store.listDocumentChunks(doc.id);
    const review = reviewFor(doc.sourceId, doc.contentSha256);

    if (!manifest) {
      discrepancies.push({
        kind: "indexed but not in the manifest",
        sourceId: doc.sourceId,
        detail: "The database has this document but lib/corpus/sources.ts does not list it.",
      });
    } else {
      if (manifest.url !== doc.sourceUrl) {
        discrepancies.push({
          kind: "url differs from the manifest",
          sourceId: doc.sourceId,
          detail: `database: ${doc.sourceUrl} · manifest: ${manifest.url}`,
        });
      }
      if (manifest.publisher !== doc.publisher) {
        discrepancies.push({
          kind: "publisher differs from the manifest",
          sourceId: doc.sourceId,
          detail: `database: ${doc.publisher} · manifest: ${manifest.publisher}`,
        });
      }
      if (manifest.licence !== doc.licence) {
        discrepancies.push({
          kind: "licence differs from the manifest",
          sourceId: doc.sourceId,
          detail: "The stored licence text does not match the curated manifest.",
        });
      }
    }

    const empty = chunks.filter((chunk) => chunk.text.trim().length === 0).length;
    if (empty > 0) {
      discrepancies.push({
        kind: "empty passages",
        sourceId: doc.sourceId,
        detail: `${empty} passage(s) have no text.`,
      });
    }

    return {
      sourceId: doc.sourceId,
      documentRowId: doc.id,
      title: doc.title,
      topic: doc.topic,
      topicLabel: TOPIC_LABELS[doc.topic as TopicId] ?? doc.topic,
      publisher: doc.publisher,
      sourceUrl: doc.sourceUrl,
      sourceType: "HTML",
      licence: doc.licence,
      licenceUrl: doc.licenceUrl,
      retrievedAt: doc.retrievedAt,
      contentSha256: doc.contentSha256,
      wordCount: doc.wordCount,
      indexedPassages: chunks.length,
      reviewStatus: review.status as ReviewStatusValue,
      reviewLabel: review.label,
      searchable: chunks.length > 0,
      inManifest: Boolean(manifest),
      localLocation: CORPUS_LOCAL_LOCATION,
    };
  });

  for (const source of CORPUS_SOURCES) {
    if (!dbBySourceId.has(source.sourceId)) {
      discrepancies.push({
        kind: "listed in the manifest but not indexed",
        sourceId: source.sourceId,
        detail: "The manifest lists it but no database row exists; run pnpm ingest.",
      });
    }
  }

  const publisherMap = new Map<string, number>();
  const licenceMap = new Map<string, { url: string | null; count: number }>();
  for (const row of rows) {
    publisherMap.set(row.publisher, (publisherMap.get(row.publisher) ?? 0) + 1);
    const entry = licenceMap.get(row.licence) ?? { url: row.licenceUrl, count: 0 };
    entry.count += 1;
    licenceMap.set(row.licence, entry);
  }

  return {
    generatedAt: new Date().toISOString(),
    backend: store.backend,
    database: "data/health.db (SQLite via better-sqlite3)",
    documentCount: rows.length,
    passageCount: rows.reduce((sum, row) => sum + row.indexedPassages, 0),
    publishers: [...publisherMap.entries()]
      .map(([publisher, documents]) => ({ publisher, documents }))
      .sort((a, b) => a.publisher.localeCompare(b.publisher)),
    licences: [...licenceMap.entries()]
      .map(([licence, entry]) => ({
        licence,
        licenceUrl: entry.url,
        documents: entry.count,
      }))
      .sort((a, b) => a.licence.localeCompare(b.licence)),
    rows: rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    discrepancies,
  };
}

const CSV_COLUMNS = [
  "source_id",
  "document_row_id",
  "title",
  "topic",
  "topic_label",
  "publisher",
  "source_url",
  "source_type",
  "licence",
  "licence_url",
  "retrieved_at",
  "indexed_passages",
  "word_count",
  "review_status",
  "review_label",
  "searchable",
  "in_manifest",
  "content_sha256",
];

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function inventoryToCsv(
  rows: InventoryRow[],
  options: { includeLocalLocation: boolean },
): string {
  const columns = options.includeLocalLocation
    ? [...CSV_COLUMNS, "local_location"]
    : CSV_COLUMNS;
  const lines = [columns.join(",")];
  for (const row of rows) {
    const values: (string | number | boolean | null)[] = [
      row.sourceId,
      row.documentRowId,
      row.title,
      row.topic,
      row.topicLabel,
      row.publisher,
      row.sourceUrl,
      row.sourceType,
      row.licence,
      row.licenceUrl,
      row.retrievedAt,
      row.indexedPassages,
      row.wordCount,
      row.reviewStatus,
      row.reviewLabel,
      row.searchable,
      row.inManifest,
      row.contentSha256,
    ];
    if (options.includeLocalLocation) values.push(row.localLocation);
    lines.push(values.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
