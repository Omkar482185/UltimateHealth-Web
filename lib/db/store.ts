/**
 * Storage contract for the knowledge corpus.
 *
 * The retrieval layer only ever talks to this interface, never to SQLite
 * directly. That keeps the storage engine replaceable: the current
 * implementation (`lib/db/sqlite-store.ts`) does exact vector search in process,
 * and a pgvector implementation can be dropped in without changing callers.
 *
 * Embeddings are unit-normalised before storage, so cosine similarity is a dot
 * product.
 */

export type NewDocument = {
  sourceId: string;
  topic: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string | null;
  retrievedAt: string;
  contentSha256: string;
  wordCount: number;
};

export type StoredDocument = NewDocument & { id: number };

export type NewChunk = {
  ordinal: number;
  heading: string | null;
  text: string;
  embedding: Float32Array;
};

export type StoredChunk = {
  id: number;
  documentId: number;
  ordinal: number;
  heading: string | null;
  text: string;
  charCount: number;
};

export type EvidenceChunk = StoredChunk & {
  sourceId: string;
  documentTitle: string;
  publisher: string;
  sourceUrl: string;
  licence: string;
  topic: string;
};

export type SearchHit = {
  chunkId: number;
  /** Cosine similarity for vector search, or a positive BM25 relevance score. */
  score: number;
};

export type TopicSummary = {
  topic: string;
  documentCount: number;
  chunkCount: number;
};

/** How many stored vectors, and of which model and dimension, the corpus holds. */
export type CorpusEmbeddingStat = {
  model: string;
  dim: number;
  chunkCount: number;
};

/**
 * One indexed revision of a document. Content is identified by its hash, so a
 * revision is added when the extracted text changes and not when it does not.
 */
export type DocumentRevision = {
  id: number;
  documentId: number;
  sourceId: string;
  contentSha256: string;
  wordCount: number;
  retrievedAt: string;
  recordedAt: string;
};

/**
 * The result of one ingestion attempt for one source. `status` is one of
 * `ingested`, `skipped-unchanged` or `failed`; `detail` carries the error message
 * when it failed, and `chunkCount` is null when nothing was written.
 */
export type IngestionRun = {
  sourceId: string;
  status: string;
  detail: string | null;
  chunkCount: number | null;
  recordedAt: string;
};

export type RetrievalLogEntry = {
  question: string;
  answerMode: string;
  chunkIds: number[];
  topCosine: number | null;
  latencyMs: number;
  citationCount: number;
  strippedCitations: number;
};

export interface KnowledgeStore {
  /** Identifies the active backend, e.g. "sqlite-exact" or "pgvector". */
  readonly backend: string;

  upsertDocument(doc: NewDocument): StoredDocument;

  /** Replaces all chunks for a document. Returns the number written. */
  replaceChunks(
    documentId: number,
    chunks: NewChunk[],
    embeddingModel: string,
    embeddingDim: number,
  ): number;

  getDocumentBySourceId(sourceId: string): StoredDocument | null;
  listDocuments(options?: { topic?: string }): StoredDocument[];
  listTopics(): TopicSummary[];
  countDocuments(): number;
  countChunks(): number;

  getEvidence(chunkIds: number[]): EvidenceChunk[];

  /** All chunks of one document, in reading order. */
  listDocumentChunks(documentId: number): StoredChunk[];

  /**
   * Embedding model and dimension recorded against a document's chunks, or null
   * when the document has no chunks. Used to detect a provider, model or width
   * change, because vectors from different models are not comparable.
   */
  getDocumentChunkEmbedding(documentId: number): { model: string; dim: number } | null;

  /**
   * One entry per distinct (model, dimension) pair present in the corpus. Used to
   * detect a stale corpus before it is queried, because vectors from a different
   * model cannot be compared with a fresh query vector.
   */
  getCorpusEmbeddingStats(): CorpusEmbeddingStat[];

  vectorSearch(
    embedding: Float32Array,
    topK: number,
    options?: { topic?: string },
  ): SearchHit[];

  keywordSearch(
    query: string,
    topK: number,
    options?: { topic?: string },
  ): SearchHit[];

  /**
   * Records that a document has been indexed at this content hash. Idempotent:
   * re-indexing identical content does not add a second row, so the table is a
   * set of distinct revisions rather than a log of runs.
   */
  recordRevision(revision: {
    documentId: number;
    sourceId: string;
    contentSha256: string;
    wordCount: number;
    retrievedAt: string;
  }): void;

  /** Distinct revisions of one document, newest first. */
  listRevisions(documentId: number): DocumentRevision[];

  /** Revision counts per document, for the library listing. */
  getRevisionCounts(): { documentId: number; revisionCount: number }[];

  /** Records the outcome of one ingestion attempt, including failures. */
  recordIngestionRun(run: IngestionRun): void;

  /** Recent ingestion attempts for one source, newest first. */
  listIngestionRuns(sourceId: string, limit?: number): IngestionRun[];

  logRetrieval(entry: RetrievalLogEntry): void;
}
