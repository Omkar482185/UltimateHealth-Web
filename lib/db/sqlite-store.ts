import type { Db } from "@/lib/db/index";
import { dotProduct } from "@/lib/embeddings";
import type {
  EvidenceChunk,
  KnowledgeStore,
  NewChunk,
  NewDocument,
  RetrievalLogEntry,
  SearchHit,
  StoredChunk,
  StoredDocument,
  TopicSummary,
} from "@/lib/db/store";

// `DocumentRevision` and `IngestionRun` are structurally typed by the interface,
// so they need no import here.

/**
 * SQLite implementation of the knowledge store.
 *
 * Vector search is exact: every embedding is scored against the query vector.
 * For the corpus sizes this project targets (hundreds to a few thousand chunks)
 * an exact scan is both faster to build and easier to reason about than an
 * approximate index, and it makes evaluation results deterministic. The scan is
 * O(n·d) with d = 768, measured in `docs/evaluation.md`.
 *
 * Embeddings are stored as little-endian Float32 BLOBs and read back through a
 * copy so the resulting ArrayBuffer is correctly aligned.
 */

type DocumentRow = {
  id: number;
  source_id: string;
  topic: string;
  title: string;
  publisher: string;
  source_url: string;
  licence: string;
  licence_url: string | null;
  retrieved_at: string;
  content_sha256: string;
  word_count: number;
};

type ChunkRow = {
  id: number;
  document_id: number;
  ordinal: number;
  heading: string | null;
  text: string;
  char_count: number;
};

type EvidenceRow = ChunkRow & {
  source_id: string;
  document_title: string;
  publisher: string;
  source_url: string;
  licence: string;
  topic: string;
};

type VectorRow = { id: number; embedding: Buffer };

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    topic: row.topic,
    title: row.title,
    publisher: row.publisher,
    sourceUrl: row.source_url,
    licence: row.licence,
    licenceUrl: row.licence_url,
    retrievedAt: row.retrieved_at,
    contentSha256: row.content_sha256,
    wordCount: row.word_count,
  };
}

function toChunk(row: ChunkRow): StoredChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    ordinal: row.ordinal,
    heading: row.heading,
    text: row.text,
    charCount: row.char_count,
  };
}

export function bufferToFloat32(buf: Buffer): Float32Array {
  const bytes = new Uint8Array(buf);
  return new Float32Array(bytes.buffer, 0, bytes.byteLength / 4);
}

export function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Turn free text into a safe FTS5 query. Tokens are reduced to alphanumerics and
 * quoted, so user input cannot inject FTS5 operators.
 */
export function toFtsQuery(text: string): string | null {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const unique = Array.from(new Set(tokens.filter((t) => t.length > 2)));
  if (unique.length === 0) return null;
  return unique.map((t) => `"${t}"`).join(" OR ");
}

export function createSqliteStore(db: Db): KnowledgeStore {
  const upsertDocumentStmt = db.prepare(`
    INSERT INTO documents (source_id, topic, title, publisher, source_url, licence,
                           licence_url, retrieved_at, content_sha256, word_count, created_at)
    VALUES (@sourceId, @topic, @title, @publisher, @sourceUrl, @licence,
            @licenceUrl, @retrievedAt, @contentSha256, @wordCount, @createdAt)
    ON CONFLICT(source_id) DO UPDATE SET
      topic = excluded.topic,
      title = excluded.title,
      publisher = excluded.publisher,
      source_url = excluded.source_url,
      licence = excluded.licence,
      licence_url = excluded.licence_url,
      retrieved_at = excluded.retrieved_at,
      content_sha256 = excluded.content_sha256,
      word_count = excluded.word_count
    RETURNING *
  `);

  const deleteChunksStmt = db.prepare(`DELETE FROM chunks WHERE document_id = ?`);

  const insertChunkStmt = db.prepare(`
    INSERT INTO chunks (document_id, ordinal, heading, text, char_count,
                        embedding, embedding_model, embedding_dim)
    VALUES (@documentId, @ordinal, @heading, @text, @charCount,
            @embedding, @embeddingModel, @embeddingDim)
  `);

  const evidenceStmt = db.prepare(`
    SELECT c.id, c.document_id, c.ordinal, c.heading, c.text, c.char_count,
           d.source_id, d.title AS document_title, d.publisher, d.source_url,
           d.licence, d.topic
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.id = ?
  `);

  const logStmt = db.prepare(`
    INSERT INTO retrieval_log (created_at, question, answer_mode, chunk_ids,
                               top_cosine, latency_ms, citation_count, stripped_citations)
    VALUES (@createdAt, @question, @answerMode, @chunkIds,
            @topCosine, @latencyMs, @citationCount, @strippedCitations)
  `);

  function vectorRows(topic?: string): VectorRow[] {
    if (topic) {
      return db
        .prepare(
          `SELECT c.id, c.embedding FROM chunks c
           JOIN documents d ON d.id = c.document_id
           WHERE d.topic = ?`,
        )
        .all(topic) as VectorRow[];
    }
    return db.prepare(`SELECT id, embedding FROM chunks`).all() as VectorRow[];
  }

  return {
    backend: "sqlite-exact",

    upsertDocument(doc: NewDocument): StoredDocument {
      const row = upsertDocumentStmt.get({
        ...doc,
        createdAt: new Date().toISOString(),
      }) as DocumentRow;
      return toDocument(row);
    },

    replaceChunks(documentId, chunks: NewChunk[], embeddingModel, embeddingDim) {
      const tx = db.transaction((items: NewChunk[]) => {
        deleteChunksStmt.run(documentId);
        for (const chunk of items) {
          if (chunk.embedding.length !== embeddingDim) {
            throw new Error(
              `Chunk ${chunk.ordinal} has ${chunk.embedding.length} dimensions but the store expects ${embeddingDim}.`,
            );
          }
          insertChunkStmt.run({
            documentId,
            ordinal: chunk.ordinal,
            heading: chunk.heading,
            text: chunk.text,
            charCount: chunk.text.length,
            embedding: float32ToBuffer(chunk.embedding),
            embeddingModel,
            embeddingDim,
          });
        }
        return items.length;
      });
      return tx(chunks);
    },

    getDocumentBySourceId(sourceId) {
      const row = db
        .prepare(`SELECT * FROM documents WHERE source_id = ?`)
        .get(sourceId) as DocumentRow | undefined;
      return row ? toDocument(row) : null;
    },

    listDocuments(options) {
      const rows = options?.topic
        ? (db
            .prepare(`SELECT * FROM documents WHERE topic = ? ORDER BY title`)
            .all(options.topic) as DocumentRow[])
        : (db
            .prepare(`SELECT * FROM documents ORDER BY topic, title`)
            .all() as DocumentRow[]);
      return rows.map(toDocument);
    },

    listTopics(): TopicSummary[] {
      return db
        .prepare(
          `SELECT d.topic AS topic,
                  COUNT(DISTINCT d.id) AS documentCount,
                  COUNT(c.id) AS chunkCount
           FROM documents d
           LEFT JOIN chunks c ON c.document_id = d.id
           GROUP BY d.topic
           ORDER BY documentCount DESC`,
        )
        .all() as TopicSummary[];
    },

    countDocuments() {
      return (
        db.prepare(`SELECT COUNT(*) AS n FROM documents`).get() as { n: number }
      ).n;
    },

    countChunks() {
      return (db.prepare(`SELECT COUNT(*) AS n FROM chunks`).get() as { n: number })
        .n;
    },

    listDocumentChunks(documentId) {
      const rows = db
        .prepare(
          `SELECT id, document_id, ordinal, heading, text, char_count
           FROM chunks WHERE document_id = ? ORDER BY ordinal`,
        )
        .all(documentId) as ChunkRow[];
      return rows.map(toChunk);
    },

    getDocumentChunkEmbedding(documentId) {
      const row = db
        .prepare(
          `SELECT embedding_model, embedding_dim FROM chunks WHERE document_id = ? LIMIT 1`,
        )
        .get(documentId) as
        | { embedding_model: string; embedding_dim: number }
        | undefined;
      return row
        ? { model: row.embedding_model, dim: row.embedding_dim }
        : null;
    },

    getCorpusEmbeddingStats() {
      const rows = db
        .prepare(
          `SELECT embedding_model AS model, embedding_dim AS dim, COUNT(*) AS n
           FROM chunks GROUP BY embedding_model, embedding_dim
           ORDER BY n DESC`,
        )
        .all() as { model: string; dim: number; n: number }[];
      return rows.map((r) => ({
        model: r.model,
        dim: r.dim,
        chunkCount: r.n,
      }));
    },

    getEvidence(chunkIds) {
      const out: EvidenceChunk[] = [];
      for (const id of chunkIds) {
        const row = evidenceStmt.get(id) as EvidenceRow | undefined;
        if (!row) continue;
        out.push({
          ...toChunk(row),
          sourceId: row.source_id,
          documentTitle: row.document_title,
          publisher: row.publisher,
          sourceUrl: row.source_url,
          licence: row.licence,
          topic: row.topic,
        });
      }
      return out;
    },

    vectorSearch(embedding, topK, options) {
      const rows = vectorRows(options?.topic);
      const scored: SearchHit[] = [];
      for (const row of rows) {
        scored.push({
          chunkId: row.id,
          score: dotProduct(embedding, bufferToFloat32(row.embedding)),
        });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK);
    },

    keywordSearch(query, topK, options) {
      const match = toFtsQuery(query);
      if (!match) return [];
      const sql = options?.topic
        ? `SELECT f.rowid AS chunkId, bm25(chunks_fts) AS rank
           FROM chunks_fts f
           JOIN chunks c ON c.id = f.rowid
           JOIN documents d ON d.id = c.document_id
           WHERE chunks_fts MATCH ? AND d.topic = ?
           ORDER BY rank LIMIT ?`
        : `SELECT f.rowid AS chunkId, bm25(chunks_fts) AS rank
           FROM chunks_fts f
           WHERE chunks_fts MATCH ?
           ORDER BY rank LIMIT ?`;
      const rows = (
        options?.topic
          ? db.prepare(sql).all(match, options.topic, topK)
          : db.prepare(sql).all(match, topK)
      ) as { chunkId: number; rank: number }[];
      // bm25() returns negative values where lower is better; expose a positive score.
      return rows.map((r) => ({ chunkId: r.chunkId, score: -r.rank }));
    },

    recordRevision(revision) {
      // `ON CONFLICT DO NOTHING` rather than an update: the row records the first
      // time this exact content was seen, and re-seeing it changes nothing about
      // the text. The original retrieval date is what a reviewer's judgement was
      // made against.
      db.prepare(
        `INSERT INTO document_revisions
           (document_id, source_id, content_sha256, word_count, retrieved_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id, content_sha256) DO NOTHING`,
      ).run(
        revision.documentId,
        revision.sourceId,
        revision.contentSha256,
        revision.wordCount,
        revision.retrievedAt,
        new Date().toISOString(),
      );
    },

    listRevisions(documentId) {
      const rows = db
        .prepare(
          `SELECT id, document_id, source_id, content_sha256, word_count,
                  retrieved_at, recorded_at
             FROM document_revisions
            WHERE document_id = ?
            ORDER BY recorded_at DESC, id DESC`,
        )
        .all(documentId) as {
        id: number;
        document_id: number;
        source_id: string;
        content_sha256: string;
        word_count: number;
        retrieved_at: string;
        recorded_at: string;
      }[];
      return rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        sourceId: row.source_id,
        contentSha256: row.content_sha256,
        wordCount: row.word_count,
        retrievedAt: row.retrieved_at,
        recordedAt: row.recorded_at,
      }));
    },

    getRevisionCounts() {
      return db
        .prepare(
          `SELECT document_id AS documentId, COUNT(*) AS revisionCount
             FROM document_revisions GROUP BY document_id`,
        )
        .all() as { documentId: number; revisionCount: number }[];
    },

    recordIngestionRun(run) {
      db.prepare(
        `INSERT INTO ingestion_runs (source_id, status, detail, chunk_count, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        run.sourceId,
        run.status,
        run.detail,
        run.chunkCount,
        run.recordedAt,
      );
    },

    listIngestionRuns(sourceId, limit = 10) {
      const rows = db
        .prepare(
          `SELECT source_id, status, detail, chunk_count, recorded_at
             FROM ingestion_runs WHERE source_id = ?
            ORDER BY recorded_at DESC, id DESC LIMIT ?`,
        )
        .all(sourceId, Math.min(Math.max(limit, 1), 100)) as {
        source_id: string;
        status: string;
        detail: string | null;
        chunk_count: number | null;
        recorded_at: string;
      }[];
      return rows.map((row) => ({
        sourceId: row.source_id,
        status: row.status,
        detail: row.detail,
        chunkCount: row.chunk_count,
        recordedAt: row.recorded_at,
      }));
    },

    logRetrieval(entry: RetrievalLogEntry) {
      logStmt.run({
        createdAt: new Date().toISOString(),
        question: entry.question.slice(0, 500),
        answerMode: entry.answerMode,
        chunkIds: entry.chunkIds.join(","),
        topCosine: entry.topCosine,
        latencyMs: entry.latencyMs,
        citationCount: entry.citationCount,
        strippedCitations: entry.strippedCitations,
      });
    },
  };
}
