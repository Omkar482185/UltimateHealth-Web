/**
 * Retrieval inspection harness.
 *
 *   pnpm retrieval-check
 *   pnpm retrieval-check --provider=test-hash
 *
 * Prints the fused ranking for a fixed set of questions so that retrieval
 * behaviour can be inspected directly rather than inferred from answer text.
 * This is a diagnostic, not the evaluation: pass rates and metrics come from
 * `scripts/eval.ts`.
 */
import { loadEnv } from "@/lib/load-env";
import { getStore } from "@/lib/db/index";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { retrieve } from "@/lib/rag/retrieve";

loadEnv();

const QUESTIONS = [
  "What blood pressure reading is considered high?",
  "What are the warning signs of a stroke?",
  "How much sodium should I eat per day?",
  "What are the symptoms of a heart attack?",
  "How does high blood pressure affect the kidneys?",
  "What exercises can lower my blood pressure?",
  "What is a hypertensive crisis?",
  "Does high cholesterol cause symptoms?",
  "What is the best treatment for type 2 diabetes?",
  "How do I get a refund for my hospital bill?",
];

async function main() {
  const providerArg = process.argv.find((a) => a.startsWith("--provider="));
  const provider = await getEmbeddingProvider(
    providerArg
      ? (providerArg.slice("--provider=".length) as "gemini" | "test-hash")
      : undefined,
  );
  const store = getStore();

  console.log(`backend:  ${store.backend}`);
  console.log(`provider: ${provider.name}:${provider.model}`);
  console.log(`corpus:   ${store.countDocuments()} documents, ${store.countChunks()} chunks`);
  if (provider.isTestDouble) {
    console.log(
      "note:     the test-hash provider has no semantic signal, so only the keyword ranker is meaningful here.",
    );
  }
  console.log("");

  for (const question of QUESTIONS) {
    const result = await retrieve(question);
    console.log(`Q: ${question}`);
    console.log(
      `   topCosine=${result.topCosine.toFixed(3)} vectorHits=${result.vectorHitCount} keywordHits=${result.keywordHitCount} evidence=${result.evidence.length}`,
    );
    for (const chunk of result.evidence.slice(0, 3)) {
      const fused = result.fused.find((f) => f.chunkId === chunk.id);
      const cosine = fused?.cosine === null || fused?.cosine === undefined
        ? "  n/a"
        : fused.cosine.toFixed(3);
      console.log(
        `   - [${(fused?.vectorRank ?? "-").toString().padStart(2)}/${(fused?.keywordRank ?? "-").toString().padStart(2)}] cos=${cosine} rrf=${fused?.rrf.toFixed(4)} ${chunk.documentTitle} #${chunk.ordinal}`,
      );
    }
    console.log("");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
