/**
 * Corpus ingestion CLI.
 *
 *   pnpm ingest                 # ingest or refresh sources whose content changed
 *   pnpm ingest --force         # re-ingest everything
 *   pnpm ingest --only=who-hypertension,nhs-stroke
 *   pnpm ingest --provider=test-hash
 *
 * Run from the `website` directory. Network access is required.
 */
import { loadEnv } from "@/lib/load-env";
import type { EmbeddingProviderName } from "@/lib/config";
import { ingestCorpus, type SourceOutcome } from "@/lib/rag/ingest";

loadEnv();

function parseArgs(argv: string[]) {
  const force = argv.includes("--force");
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const providerArg = argv.find((a) => a.startsWith("--provider="));
  return {
    force,
    only: onlyArg ? onlyArg.slice("--only=".length).split(",").filter(Boolean) : undefined,
    provider: providerArg
      ? (providerArg.slice("--provider=".length) as EmbeddingProviderName)
      : undefined,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const started = Date.now();

  console.log("Ingesting curated corpus...");
  const { outcomes, providerName, backend } = await ingestCorpus({
    ...options,
    onProgress: (o: SourceOutcome) => {
      const mark = o.status === "failed" ? "FAIL" : o.status === "unchanged" ? "SAME" : " OK ";
      console.log(`  [${mark}] ${o.sourceId} (${o.chunkCount} chunks)`);
      if (o.error) console.log(`         ${o.error}`);
    },
  });

  const ingested = outcomes.filter((o) => o.status === "ingested");
  const unchanged = outcomes.filter((o) => o.status === "unchanged");
  const failed = outcomes.filter((o) => o.status === "failed");

  console.log("");
  console.log(`backend:   ${backend}`);
  console.log(`provider:  ${providerName}`);
  console.log(`ingested:  ${ingested.length}`);
  console.log(`unchanged: ${unchanged.length}`);
  console.log(`failed:    ${failed.length}`);
  console.log(
    `chunks written: ${ingested.reduce((s, o) => s + o.chunkCount, 0)}`,
  );
  console.log(`elapsed:   ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (failed.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failed) console.log(`  ${f.sourceId}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
