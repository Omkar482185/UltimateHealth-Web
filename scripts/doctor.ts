import fs from "node:fs";
import path from "node:path";

import { loadEnv } from "@/lib/load-env";
import { EMBEDDING, GENERATION } from "@/lib/config";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { classifyGeminiError, getGeminiClient } from "@/lib/gemini";
import { getStore } from "@/lib/db/index";
import { classifyOllamaError, hasOllamaModel, listOllamaModels } from "@/lib/ollama";
import { callModel } from "@/lib/rag/generate";
import type { EvidenceChunk } from "@/lib/db/store";

/**
 * Verifies both provider configurations this project depends on, in the order
 * failures occur in practice:
 *
 *   1. Is the embedding key present, and is Ollama configured?
 *   2. Which embedding models does this key actually have access to?
 *   3. Does a real embedding call succeed, and at what dimension?
 *   4. Is the local Ollama model pulled, and does a generation call through the
 *      assistant's own code path succeed?
 *   5. Does the stored corpus match the configured embedding model?
 *
 * It never prints the key, and it exits non-zero as soon as a real call fails, so
 * it is safe to use as a pre-flight check before a demo or an evaluation run.
 *
 *   pnpm verify:gemini
 *
 * The command keeps its original name for continuity. Generation no longer uses
 * Gemini: only embeddings do.
 */

loadEnv();

type ModelInfo = { id: string; methods: string[] };

const results: { label: string; ok: boolean; detail: string }[] = [];

function record(label: string, ok: boolean, detail: string) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "}  ${label}`);
  console.log(`          ${detail}`);
}

function heading(text: string) {
  console.log(`\n${text}`);
  console.log("-".repeat(text.length));
}

function redact(message: string): string {
  const key = process.env.GEMINI_API_KEY;
  return key ? message.split(key).join("<redacted>") : message;
}

async function listModels(apiKey: string): Promise<ModelInfo[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const body = (await res.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Listing models failed with HTTP ${res.status}: ${body.error?.message ?? "no detail"}`,
    );
  }
  return (body.models ?? []).map((m) => ({
    id: m.name.replace(/^models\//, ""),
    methods: m.supportedGenerationMethods ?? [],
  }));
}

async function main() {
  const envLocal = path.join(process.cwd(), ".env.local");
  const envFile = path.join(process.cwd(), ".env");

  heading("1. Environment");
  console.log(`  working directory: ${process.cwd()}`);
  console.log(`  .env.local present: ${fs.existsSync(envLocal) ? "yes" : "no"}`);
  console.log(`  .env present:       ${fs.existsSync(envFile) ? "yes" : "no"}`);

  const key = process.env.GEMINI_API_KEY?.trim();
  record(
    "GEMINI_API_KEY is set",
    Boolean(key),
    key
      ? "Found. Value is never printed by this script."
      : "Not set. Create ultimatehealth/website/.env.local with GEMINI_API_KEY=<your key> (see .env.example), then restart the dev server.",
  );
  if (!key) return finish();

  record(
    "Configured providers",
    true,
    `embedding: ${EMBEDDING.geminiModel} at ${EMBEDDING.geminiDim} dims (provider ${EMBEDDING.provider}); generation: ${GENERATION.model} via Ollama at ${GENERATION.baseUrl}`,
  );

  heading("2. Models available to this key");
  let models: ModelInfo[] = [];
  try {
    models = await listModels(key);
    const embedders = models.filter((m) => m.methods.includes("embedContent"));
    console.log(`  ${models.length} models visible.`);
    console.log(
      `  embedContent: ${embedders.map((m) => m.id).join(", ") || "(none)"}`,
    );
    record(
      `Embedding model ${EMBEDDING.geminiModel} is available`,
      embedders.some((m) => m.id === EMBEDDING.geminiModel),
      embedders.some((m) => m.id === EMBEDDING.geminiModel)
        ? "Present."
        : "Not in the list. Set EMBEDDING_MODEL in .env.local to one of the embedContent models above, then re-ingest.",
    );
  } catch (error) {
    record(
      "List models",
      false,
      redact(error instanceof Error ? error.message : String(error)),
    );
  }

  heading("3. Real embedding call");
  try {
    const provider = await getEmbeddingProvider("gemini");
    const vector = await provider.embedQuery("blood pressure measurement at home");
    record(
      "Embedding request succeeded",
      true,
      `model ${provider.model} returned ${vector.length} dimensions.`,
    );
    record(
      "Dimension matches EMBEDDING_DIM",
      vector.length === EMBEDDING.geminiDim,
      vector.length === EMBEDDING.geminiDim
        ? `Both ${vector.length}.`
        : `Model returned ${vector.length} but EMBEDDING_DIM is ${EMBEDDING.geminiDim}. Fix EMBEDDING_DIM before ingesting.`,
    );
  } catch (error) {
    record(
      "Embedding request",
      false,
      `[${classifyGeminiError(error)}] ${redact(error instanceof Error ? error.message : String(error))}`,
    );
  }

  heading("4. Local Ollama model and a real generation call");
  try {
    const pulled = await listOllamaModels();
    console.log(`  ${pulled.length} models pulled: ${pulled.join(", ") || "(none)"}`);
    record(
      `Ollama model ${GENERATION.model} is pulled`,
      hasOllamaModel(pulled, GENERATION.model),
      hasOllamaModel(pulled, GENERATION.model)
        ? `Present at ${GENERATION.baseUrl}.`
        : `Not pulled. Run \`ollama pull ${GENERATION.model}\`, or set OLLAMA_MODEL in .env.local to one of the models above.`,
    );
  } catch (error) {
    record(
      "Ollama is reachable",
      false,
      `[${classifyOllamaError(error)}] ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    // Exercise the same code path the assistant uses, including prompt assembly
    // and citation labelling, rather than a bare HTTP call.
    const synthetic: EvidenceChunk = {
      id: -1,
      documentId: -1,
      ordinal: 0,
      heading: "Self-check",
      text: "This is a connectivity self-check. Reply with the single word OK.",
      charCount: 60,
      sourceId: "self-check",
      documentTitle: "Connectivity self-check",
      publisher: "UltimateHealth",
      sourceUrl: "https://example.invalid/self-check",
      licence: "test",
      topic: "self-check",
    };
    const { text, model } = await callModel(
      [synthetic],
      "Reply with exactly one sentence confirming you received this evidence.",
    );
    record(
      "Generation request succeeded",
      true,
      `model ${model} replied: "${redact(text).slice(0, 120)}${text.length > 120 ? "..." : ""}"`,
    );
  } catch (error) {
    record(
      "Generation request",
      false,
      `[${classifyOllamaError(error)}] ${redact(error instanceof Error ? error.message : String(error))}`,
    );
  }

  heading("5. Stored corpus consistency");
  try {
    const store = getStore();
    const documents = store.countDocuments();
    const chunks = store.countChunks();
    const stats = store.getCorpusEmbeddingStats();
    console.log(`  ${documents} documents, ${chunks} passages.`);
    if (chunks === 0) {
      record(
        "Corpus is populated",
        false,
        "No passages stored. Run `pnpm ingest` with a working key.",
      );
    } else {
      const described = stats
        .map((s) => `${s.chunkCount} at ${s.model}/${s.dim}d`)
        .join(", ");
      console.log(`  stored vectors: ${described}`);
      const allMatch =
        stats.length === 1 &&
        stats[0].model === EMBEDDING.geminiModel &&
        stats[0].dim === EMBEDDING.geminiDim;
      record(
        "Stored vectors match the configured model and dimension",
        allMatch,
        allMatch
          ? "Corpus is current; retrieval will compare like with like."
          : `Stored vectors do not match ${EMBEDDING.geminiModel}/${EMBEDDING.geminiDim}d. Run \`pnpm ingest\` to rebuild the corpus. Until then, the assistant will refuse non-emergency questions with a corpus-mismatch error.`,
      );
    }
  } catch (error) {
    record(
      "Corpus check",
      false,
      redact(error instanceof Error ? error.message : String(error)),
    );
  }

  // The embedding client is only constructed here to prove the SDK accepts the
  // key shape. No request is made.
  try {
    getGeminiClient();
  } catch (error) {
    record(
      "Gemini embedding client construction",
      false,
      redact(error instanceof Error ? error.message : String(error)),
    );
  }

  finish();
}

function finish() {
  const failures = results.filter((r) => !r.ok);
  heading("Summary");
  if (failures.length === 0) {
    console.log(`  All ${results.length} checks passed.`);
    process.exit(0);
  }
  console.log(`  ${failures.length} of ${results.length} checks failed:`);
  for (const f of failures) console.log(`   - ${f.label}: ${f.detail}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack ?? error.message : String(error)));
  process.exit(1);
});
