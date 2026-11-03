import crypto from "node:crypto";

import type { EmbeddingProviderName } from "@/lib/config";
import { CORPUS_SOURCES, type CorpusSource } from "@/lib/corpus/sources";
import { getDb } from "@/lib/db/index";
import { createSqliteStore } from "@/lib/db/sqlite-store";
import type { KnowledgeStore, NewChunk } from "@/lib/db/store";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { chunkSections } from "@/lib/rag/chunk";
import { extractSections, fetchHtml } from "@/lib/rag/extract";

/**
 * Ingestion pipeline.
 *
 * For each source: fetch, extract, hash, chunk, embed, store.
 *
 * Re-ingestion is idempotent. A document whose extracted text hashes to the same
 * SHA-256 as the stored document is skipped, so running the pipeline repeatedly
 * costs nothing and produces no duplicate chunks. `force` overrides the skip.
 */

export type SourceOutcome = {
  sourceId: string;
  title: string;
  status: "ingested" | "unchanged" | "failed";
  chunkCount: number;
  charLength: number;
  error?: string;
};

export type IngestOptions = {
  force?: boolean;
  only?: string[];
  provider?: EmbeddingProviderName;
  /** Milliseconds between network requests, to avoid hammering public sites. */
  delayMs?: number;
  onProgress?: (outcome: SourceOutcome) => void;
};

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Decides whether a document can be skipped on this run.
 *
 * Unchanged text is not sufficient on its own. Vectors produced by a different
 * model, or by the same model at a different width, are not comparable with a
 * fresh query vector, so either change must force re-embedding even when the
 * extracted text hashes identically. Without this check, changing provider or
 * EMBEDDING_DIM would silently leave stale vectors in the index while reporting
 * every document as up to date, and the assistant would then reject every
 * question as a corpus mismatch with no obvious way forward.
 */
export function shouldSkipIngestion(params: {
  existingHash: string | null;
  contentHash: string;
  storedEmbedding: { model: string; dim: number } | null;
  currentEmbedding: { model: string; dim: number };
  force: boolean;
}): boolean {
  if (params.force) return false;
  if (params.existingHash === null) return false;
  if (params.existingHash !== params.contentHash) return false;
  const stored = params.storedEmbedding;
  if (stored === null) return false;
  if (stored.model !== params.currentEmbedding.model) return false;
  if (stored.dim !== params.currentEmbedding.dim) return false;
  return true;
}

/** Text embedded for retrieval: the heading gives the passage its context. */
function embeddingInput(heading: string | null, text: string): string {
  return heading ? `${heading}\n\n${text}` : text;
}

async function ingestSource(
  source: CorpusSource,
  store: KnowledgeStore,
  provider: Awaited<ReturnType<typeof getEmbeddingProvider>>,
  force: boolean,
): Promise<SourceOutcome> {
  const base = { sourceId: source.sourceId, title: source.title };
  try {
    const html = await fetchHtml(source.url);
    const extracted = extractSections(html, source.title);

    if (extracted.sections.length === 0 || extracted.charLength < 500) {
      throw new Error(
        `Extraction produced too little text (${extracted.charLength} characters). The page structure may have changed.`,
      );
    }

    const plainText = extracted.sections
      .map((s) => [s.heading ?? "", ...s.paragraphs].join("\n"))
      .join("\n");
    const contentHash = sha256(plainText);

    const existing = store.getDocumentBySourceId(source.sourceId);
    const skip = shouldSkipIngestion({
      existingHash: existing?.contentSha256 ?? null,
      contentHash,
      storedEmbedding: existing
        ? store.getDocumentChunkEmbedding(existing.id)
        : null,
      currentEmbedding: { model: provider.model, dim: provider.dim },
      force,
    });
    if (skip) {
      // Recorded as well as returned. A run that skips everything is still a
      // meaningful fact about the corpus, and a console line that nobody keeps is
      // not a record.
      store.recordIngestionRun({
        sourceId: source.sourceId,
        status: "skipped-unchanged",
        detail: null,
        chunkCount: null,
        recordedAt: new Date().toISOString(),
      });
      return {
        ...base,
        status: "unchanged",
        chunkCount: 0,
        charLength: extracted.charLength,
      };
    }

    const chunks = chunkSections(extracted.sections);
    if (chunks.length === 0) {
      throw new Error("Chunking produced no chunks.");
    }

    const embeddings = await provider.embedDocuments(
      chunks.map((c) => embeddingInput(c.heading, c.text)),
    );
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding provider returned ${embeddings.length} vectors for ${chunks.length} chunks.`,
      );
    }

    const retrievedAt = new Date().toISOString();
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;

    const document = store.upsertDocument({
      sourceId: source.sourceId,
      topic: source.topic,
      title: extracted.title || source.title,
      publisher: source.publisher,
      sourceUrl: source.url,
      licence: source.licence,
      licenceUrl: source.licenceUrl,
      retrievedAt,
      contentSha256: contentHash,
      wordCount,
    });

    const newChunks: NewChunk[] = chunks.map((chunk, index) => ({
      ordinal: chunk.ordinal,
      heading: chunk.heading,
      text: chunk.text,
      embedding: embeddings[index],
    }));

    store.replaceChunks(document.id, newChunks, provider.model, provider.dim);

    // Idempotent: re-indexing identical content adds no second revision, so this
    // table is the set of distinct revisions ever indexed rather than a run log.
    store.recordRevision({
      documentId: document.id,
      sourceId: source.sourceId,
      contentSha256: contentHash,
      wordCount,
      retrievedAt,
    });

    store.recordIngestionRun({
      sourceId: source.sourceId,
      status: "ingested",
      detail: null,
      chunkCount: newChunks.length,
      recordedAt: new Date().toISOString(),
    });

    return {
      ...base,
      status: "ingested",
      chunkCount: newChunks.length,
      charLength: extracted.charLength,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Failures are recorded, so "which sources are broken" is answerable from the
    // database rather than from a scrollback buffer that no longer exists.
    store.recordIngestionRun({
      sourceId: source.sourceId,
      status: "failed",
      detail: message,
      chunkCount: null,
      recordedAt: new Date().toISOString(),
    });
    return {
      ...base,
      status: "failed",
      chunkCount: 0,
      charLength: 0,
      error: message,
    };
  }
}

export async function ingestCorpus(
  options: IngestOptions = {},
): Promise<{ outcomes: SourceOutcome[]; providerName: string; backend: string }> {
  const store = createSqliteStore(getDb());
  const provider = await getEmbeddingProvider(options.provider);
  const delays = options.delayMs ?? 400;

  const selected = options.only?.length
    ? CORPUS_SOURCES.filter((s) => options.only!.includes(s.sourceId))
    : CORPUS_SOURCES;

  if (selected.length === 0) {
    throw new Error(
      `No sources matched. Available ids: ${CORPUS_SOURCES.map((s) => s.sourceId).join(", ")}`,
    );
  }

  const outcomes: SourceOutcome[] = [];
  for (const source of selected) {
    const outcome = await ingestSource(
      source,
      store,
      provider,
      options.force ?? false,
    );
    outcomes.push(outcome);
    options.onProgress?.(outcome);
    if (delays > 0) await new Promise((r) => setTimeout(r, delays));
  }

  return {
    outcomes,
    providerName: `${provider.name}:${provider.model}`,
    backend: store.backend,
  };
}
