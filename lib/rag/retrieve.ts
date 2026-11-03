import { RETRIEVAL } from "@/lib/config";
import { getStore } from "@/lib/db/index";
import type { CorpusEmbeddingStat, EvidenceChunk } from "@/lib/db/store";
import { getEmbeddingProvider } from "@/lib/embeddings";

/**
 * Hybrid retrieval.
 *
 * Two independent rankers run over the same chunks: dense vector similarity and
 * BM25 keyword matching. Their rankings are combined with reciprocal rank fusion
 * (RRF), which needs no score calibration between the two systems and is stable
 * when one ranker returns nothing.
 *
 *   RRF(chunk) = sum over rankers of 1 / (k + rank)
 *
 * Dense retrieval catches paraphrases; BM25 catches exact clinical terms,
 * drug names and abbreviations that embeddings often blur. Neither dominates,
 * which is why the two are fused rather than chosen between.
 */

export type FusedHit = {
  chunkId: number;
  rrf: number;
  vectorRank: number | null;
  keywordRank: number | null;
  /** Cosine similarity, present when the chunk appeared in the vector ranking. */
  cosine: number | null;
};

export type RetrievalResult = {
  question: string;
  evidence: EvidenceChunk[];
  fused: FusedHit[];
  topCosine: number;
  vectorHitCount: number;
  keywordHitCount: number;
  topic: string | null;
};

/**
 * Thrown when the stored corpus vectors were produced by a different embedding
 * model or dimension than the one currently configured. Cosine similarity between
 * incomparable vectors is meaningless, so retrieval refuses to run rather than
 * returning confident-looking nonsense.
 */
export class CorpusMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusMismatchError";
  }
}

/**
 * Pure decision behind `CorpusMismatchError`, kept separate so it can be asserted
 * without a database or an embedding provider.
 *
 * Returns a description of the offending vectors, or null when every stored vector
 * is comparable with the current provider. An empty corpus is not a mismatch: it
 * simply has nothing to retrieve, which the normal abstention path already handles.
 */
export function findIncomparableVectors(
  stats: CorpusEmbeddingStat[],
  current: { model: string; dim: number },
): { description: string; chunkCount: number } | null {
  const stale = stats.filter(
    (s) => s.model !== current.model || s.dim !== current.dim,
  );
  if (stale.length === 0) return null;
  return {
    description: stale
      .map(
        (s) =>
          `${s.chunkCount} passage${s.chunkCount === 1 ? "" : "s"} embedded with ${s.model} at ${s.dim} dimensions`,
      )
      .join("; "),
    chunkCount: stale.reduce((sum, s) => sum + s.chunkCount, 0),
  };
}

/**
 * Turns a ranked candidate pool into the final evidence set.
 *
 * Two independent rules, both deliberately conservative:
 *
 *  1. A tie-break. Candidates within `RETRIEVAL.tieBand` of the best fusion score
 *     are treated as equally ranked, and inside that band a document that has no
 *     passage yet is preferred over a repeat. This is what stops one short page
 *     from filling the whole evidence set when the scores are too close to
 *     distinguish, without touching a ranking that is actually decisive.
 *  2. An optional per-document cap, off by default.
 *
 * Exported and kept free of database access so that both rules can be asserted
 * directly in the test suite, and so that the two strategies can be compared by
 * measurement rather than by assertion.
 */
export function applyDiversityRules(
  pool: FusedHit[],
  chunksById: ReadonlyMap<number, { documentId: number }>,
  topK: number,
): FusedHit[] {
  if (pool.length === 0 || topK <= 0) return [];

  const cap = RETRIEVAL.maxPerDocument;
  const bandFloor = pool[0].rrf * (1 - Math.max(0, RETRIEVAL.tieBand));

  const tied: FusedHit[] = [];
  const rest: FusedHit[] = [];
  for (const hit of pool) {
    if (hit.rrf >= bandFloor) tied.push(hit);
    else rest.push(hit);
  }

  const represented = new Set<number>();
  const preferred: FusedHit[] = [];
  const deferred: FusedHit[] = [];
  for (const hit of tied) {
    const documentId = chunksById.get(hit.chunkId)?.documentId;
    if (documentId === undefined) continue;
    if (represented.has(documentId)) {
      deferred.push(hit);
    } else {
      represented.add(documentId);
      preferred.push(hit);
    }
  }

  const selected: FusedHit[] = [];
  const perDocument = new Map<number, number>();
  for (const hit of [...preferred, ...deferred, ...rest]) {
    if (selected.length >= topK) break;
    const documentId = chunksById.get(hit.chunkId)?.documentId;
    if (documentId === undefined) continue;
    if (cap > 0) {
      const used = perDocument.get(documentId) ?? 0;
      if (used >= cap) continue;
      perDocument.set(documentId, used + 1);
    }
    selected.push(hit);
  }
  return selected;
}

/**
 * Document-dominance rule, applied after the ordering above.
 *
 * The tie-break reorders candidates whose scores are already indistinguishable,
 * which is not enough when a genuine coverage gap exists: a document the question
 * needs can sit below the whole tie band because a competing page matched the
 * query wording more closely. This rule handles that case by releasing a
 * dominating document's weakest repeats and refilling from unrepresented
 * documents within `dominanceBand` of the top score.
 *
 * Honest status: this did not resolve the case that motivated it. It caps the
 * dominating document correctly, but the slot it frees goes to whichever
 * unrepresented document ranks highest, and on the chikungunya corpus that is a
 * second chikungunya page rather than the dengue page. The rule is therefore off
 * by default and the unanswered comparison is recorded as a known limitation.
 *
 * Deliberately conservative in four ways: it only fires when one document
 * exceeds its share, it only releases a repeat when a replacement exists inside
 * the band, it restores score order afterwards so the evidence set still reads
 * best-first, and it never returns a smaller set than it was given. Pure and free
 * of database access so the failures it prevents can be asserted in the test suite.
 */
export type DominanceOptions = {
  /** Fraction of the slots one document may occupy. Defaults to configuration. */
  share?: number;
  /** How far below the top score a refill candidate may sit. Defaults to config. */
  band?: number;
};

export function applyDominanceRule(
  selected: FusedHit[],
  pool: FusedHit[],
  chunksById: ReadonlyMap<number, { documentId: number }>,
  topK: number,
  options: DominanceOptions = {},
): FusedHit[] {
  if (selected.length === 0 || topK <= 0) return [];

  const share = Math.min(
    1,
    Math.max(0, options.share ?? RETRIEVAL.dominanceShare),
  );
  const band = Math.max(0, options.band ?? RETRIEVAL.dominanceBand);
  const maxPerDocument = Math.max(2, Math.ceil(topK * share));

  const documentOf = new Map<number, number>();
  for (const hit of selected) {
    const documentId = chunksById.get(hit.chunkId)?.documentId;
    if (documentId !== undefined) documentOf.set(hit.chunkId, documentId);
  }

  const counts = new Map<number, number>();
  for (const documentId of documentOf.values()) {
    counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
  }
  const dominated = [...counts.values()].some((n) => n > maxPerDocument);
  if (!dominated) return selected;

  // Candidates that could take a released slot: not already selected, and no
  // further below the top score than `dominanceBand` allows.
  const alreadySelected = new Set(selected.map((h) => h.chunkId));
  const bandFloor = (pool[0]?.rrf ?? 0) * (1 - band);
  const candidates = pool.filter(
    (hit) => !alreadySelected.has(hit.chunkId) && hit.rrf >= bandFloor,
  );
  // Nothing to refill with, so there is nothing to gain by trimming. Returning
  // early is what keeps the rule from thinning an evidence set for no reason.
  if (candidates.length === 0) return selected;

  // Keep the best `maxPerDocument` passages per document, in score order.
  const kept: FusedHit[] = [];
  const keptPerDocument = new Map<number, number>();
  for (const hit of selected) {
    const documentId = documentOf.get(hit.chunkId);
    if (documentId === undefined) continue;
    const used = keptPerDocument.get(documentId) ?? 0;
    if (used >= maxPerDocument) continue;
    keptPerDocument.set(documentId, used + 1);
    kept.push(hit);
  }

  const represented = new Set(keptPerDocument.keys());
  const newDocuments = candidates.filter((hit) => {
    const documentId = documentOf.get(hit.chunkId) ?? chunksById.get(hit.chunkId)?.documentId;
    return documentId !== undefined && !represented.has(documentId);
  });
  const newDocumentIds = new Set(newDocuments.map((h) => h.chunkId));
  const repeatDocuments = candidates.filter((hit) => !newDocumentIds.has(hit.chunkId));

  // Refill to the size we started with, new documents preferred.
  const out = [...kept];
  for (const hit of [...newDocuments, ...repeatDocuments]) {
    if (out.length >= selected.length) break;
    out.push(hit);
  }
  // If the band held less room than the released repeats, put the rest back
  // rather than return a thinner set than the input.
  if (out.length < selected.length) {
    for (const hit of selected) {
      if (out.length >= selected.length) break;
      if (out.some((keptHit) => keptHit.chunkId === hit.chunkId)) continue;
      out.push(hit);
    }
  }

  return out.sort((a, b) => b.rrf - a.rrf);
}

export type RetrieveOptions = {
  topic?: string;
  topK?: number;
  vectorTopK?: number;
  keywordTopK?: number;
};

export async function retrieve(
  question: string,
  options: RetrieveOptions = {},
): Promise<RetrievalResult> {
  const store = getStore();
  const provider = await getEmbeddingProvider();
  const topK = options.topK ?? RETRIEVAL.finalTopK;

  const queryVector = await provider.embedQuery(question);

  // Refuse to compare a fresh query vector with stored vectors of a different
  // model or width. The min-length dot product in the store would otherwise
  // truncate silently and produce plausible but meaningless similarities.
  const stale = findIncomparableVectors(store.getCorpusEmbeddingStats(), {
    model: provider.model,
    dim: queryVector.length,
  });
  if (stale) {
    throw new CorpusMismatchError(
      `The stored corpus does not match the configured embedding model (${provider.model} at ${queryVector.length} dimensions). Found ${stale.description}. Vectors from different models are not comparable, so retrieval has stopped rather than return misleading results. Run \`pnpm ingest\` to rebuild the corpus with the configured model, then try again. The emergency pathway is deterministic and still works.`,
    );
  }

  const filter = options.topic ? { topic: options.topic } : undefined;
  const vectorHits = store.vectorSearch(
    queryVector,
    options.vectorTopK ?? RETRIEVAL.vectorTopK,
    filter,
  );
  const keywordHits = store.keywordSearch(
    question,
    options.keywordTopK ?? RETRIEVAL.keywordTopK,
    filter,
  );

  const fused = new Map<number, FusedHit>();
  vectorHits.forEach((hit, index) => {
    fused.set(hit.chunkId, {
      chunkId: hit.chunkId,
      rrf: 1 / (RETRIEVAL.rrfK + index + 1),
      vectorRank: index + 1,
      keywordRank: null,
      cosine: hit.score,
    });
  });
  keywordHits.forEach((hit, index) => {
    const existing = fused.get(hit.chunkId);
    const contribution = 1 / (RETRIEVAL.rrfK + index + 1);
    if (existing) {
      existing.rrf += contribution;
      existing.keywordRank = index + 1;
    } else {
      fused.set(hit.chunkId, {
        chunkId: hit.chunkId,
        rrf: contribution,
        vectorRank: null,
        keywordRank: index + 1,
        cosine: null,
      });
    }
  });

  const ranked = Array.from(fused.values()).sort((a, b) => b.rrf - a.rrf);

  // Widen the candidate window before applying any diversity rule, otherwise
  // the rule would simply shorten the evidence set instead of diversifying it.
  const pool = ranked.slice(0, Math.max(topK * 4, topK));
  const evidenceById = new Map(
    store.getEvidence(pool.map((h) => h.chunkId)).map((c) => [c.id, c]),
  );

  const diversified = applyDiversityRules(pool, evidenceById, topK);

  // Then cap how much of the set a single document may occupy. Off by default:
  // see `RETRIEVAL.dominanceShare` for the measurements. It is applied here rather
  // than removed so that the two strategies stay comparable by measurement.
  const selected: FusedHit[] = applyDominanceRule(
    diversified,
    pool,
    evidenceById,
    topK,
  );

  const evidence = selected
    .map((hit) => evidenceById.get(hit.chunkId))
    .filter((c): c is EvidenceChunk => Boolean(c));

  const topCosine = vectorHits.length > 0 ? vectorHits[0].score : 0;

  return {
    question,
    evidence,
    fused: selected,
    topCosine,
    vectorHitCount: vectorHits.length,
    keywordHitCount: keywordHits.length,
    topic: options.topic ?? null,
  };
}
