import { NextResponse } from "next/server";

import { buildInventory, inventoryToCsv } from "@/lib/corpus/inventory";

/**
 * Public export of the verified corpus inventory.
 *
 * The library page offers it so an evaluator can download the evidence behind the
 * statistics instead of transcribing a screenshot. It exposes only metadata that
 * is already public elsewhere on the site (title, publisher, licence, source URL,
 * passage counts, retrieval date, review status). No filesystem path, database
 * file location, environment variable, or user data leaves the server here, and
 * the corpus text itself is not included.
 *
 * Format is explicit so nothing has to guess: `?format=csv` or `?format=json`.
 */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: "Use ?format=json or ?format=csv." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const inventory = buildInventory();
  const documents = inventory.rows.map(({ localLocation, ...doc }) => doc);

  if (format === "csv") {
    const csv = inventoryToCsv(inventory.rows, { includeLocalLocation: false });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="rag-source-inventory.csv"',
        "cache-control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      generatedAt: inventory.generatedAt,
      backend: inventory.backend,
      // Deliberately not the database file path: how the corpus is stored is
      // described in the documentation, not in a public API response.
      storage: "SQLite (FTS5 keyword index plus stored embeddings)",
      documentCount: inventory.documentCount,
      passageCount: inventory.passageCount,
      publishers: inventory.publishers,
      licences: inventory.licences,
      discrepancies: inventory.discrepancies,
      documents,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
