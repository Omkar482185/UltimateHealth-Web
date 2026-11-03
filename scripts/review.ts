/**
 * Records a review decision against one corpus document, or lists the current
 * position.
 *
 *   pnpm review
 *   pnpm review --source=who-hypertension --reviewer="Dr A. Example" \
 *               --credential="MBBS, MD (General Medicine)" \
 *               --decision=approved-for-education --note="Checked against the 2023 revision."
 *
 * Why this is a command and not a button in the web application: a review record
 * is a claim by a named person, and a visitor to a public deployment must not be
 * able to create one. Writing to a file that is committed means the record has a
 * repository history behind it and cannot be produced by anyone who has not been
 * given access to the repository. It also means no credential for a review
 * interface has to exist at all.
 *
 * The ledger is append-only. A decision is never edited in place: a later decision
 * is a new row and supersedes an earlier one, so the history of what was decided
 * and when survives.
 *
 * This script records what it is told. It does not check that the named person is
 * qualified, that they read the document, or that they exist, and it says so on the
 * way out. Nothing it writes makes this platform clinically validated.
 */
import fs from "node:fs";
import path from "node:path";

import { CORPUS_SOURCES } from "@/lib/corpus/sources";
import {
  reviewFor,
  staleness,
  type ReviewDecision,
  type SourceReview,
} from "@/lib/corpus/reviews";
import { getStore } from "@/lib/db/index";

const LEDGER_PATH = path.join(process.cwd(), "lib", "corpus", "source-reviews.json");

const DECISIONS: ReviewDecision[] = ["approved-for-education", "changes-requested"];

type Args = {
  source?: string;
  reviewer?: string;
  credential?: string;
  decision?: string;
  note?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv) {
    // `[\s\S]*` rather than the `s` flag, which the project's ES2017 target rejects.
    const match = raw.match(/^--([a-z]+)=([\s\S]*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "source" || key === "reviewer" || key === "credential" || key === "decision" || key === "note") {
      args[key] = value;
    }
  }
  return args;
}

function readLedger(): { about: string; reviews: SourceReview[] } {
  const raw = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")) as {
    about?: string;
    reviews?: SourceReview[];
  };
  return { about: raw.about ?? "", reviews: raw.reviews ?? [] };
}

function writeLedger(ledger: { about: string; reviews: SourceReview[] }): void {
  fs.writeFileSync(
    LEDGER_PATH,
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}

function list(): void {
  const store = getStore();
  const documents = store.listDocuments();
  const revisionCounts = new Map(
    store.getRevisionCounts().map((row) => [row.documentId, row.revisionCount]),
  );

  if (documents.length === 0) {
    console.log("The corpus is empty. Run `pnpm ingest` first.");
    return;
  }

  const rows = documents.map((doc) => {
    const outcome = reviewFor(doc.sourceId, doc.contentSha256);
    const age = staleness(doc.retrievedAt);
    return {
      source: doc.sourceId,
      status: outcome.status,
      reviewer: outcome.covering?.reviewerName ?? "",
      reviewedAt: outcome.covering?.reviewedAt.slice(0, 10) ?? "",
      revisions: String(revisionCounts.get(doc.id) ?? 0),
      stale: age.stale ? `yes (${age.days}d)` : `${age.days}d`,
    };
  });

  const width = (key: keyof (typeof rows)[number]) =>
    Math.max(key.length, ...rows.map((row) => row[key].length));

  const columns: (keyof (typeof rows)[number])[] = [
    "source",
    "status",
    "reviewer",
    "reviewedAt",
    "revisions",
    "stale",
  ];
  console.log(columns.map((c) => c.padEnd(width(c))).join("  "));
  for (const row of rows) {
    console.log(columns.map((c) => row[c].padEnd(width(c))).join("  "));
  }

  const reviewed = rows.filter((row) => row.status === "current").length;
  const superseded = rows.filter((row) => row.status === "superseded").length;
  const stale = rows.filter((row) => row.stale.startsWith("yes")).length;
  console.log(
    `\n${rows.length} documents: ${reviewed} with a review covering the current text, ` +
      `${superseded} whose review no longer covers it, ` +
      `${rows.length - reviewed - superseded} never reviewed.`,
  );
  console.log(`${stale} past the re-check window.`);
  const tracked = rows.filter((row) => row.revisions !== "0").length;
  console.log(
    `${tracked} of ${rows.length} have revision history recorded. The revision table was added after this corpus was first indexed, so a document shows 0 until the next ingest records a revision for it; the content hash held now is authoritative either way.`,
  );
  console.log(
    "A review record is a claim by a named person entered by the operator. It is not clinical validation of this platform.",
  );
}

function record(args: Args): void {
  const missing = (
    ["source", "reviewer", "credential", "decision"] as const
  ).filter((key) => !args[key]?.trim());
  if (missing.length > 0) {
    console.error(
      `Refusing to record an incomplete review. Missing: ${missing.join(", ")}.`,
    );
    console.error(
      'A review must name the person and their stated credential, because a record with no name attached is worse than no record: it looks like provenance without being any. Use --reviewer="..." --credential="...".',
    );
    process.exitCode = 1;
    return;
  }

  const decision = args.decision as ReviewDecision;
  if (!DECISIONS.includes(decision)) {
    console.error(
      `--decision must be one of: ${DECISIONS.join(", ")}. Received "${args.decision}".`,
    );
    process.exitCode = 1;
    return;
  }

  const source = CORPUS_SOURCES.find((s) => s.sourceId === args.source);
  if (!source) {
    console.error(
      `No corpus source with id "${args.source}". Run \`pnpm review\` to list the ids.`,
    );
    process.exitCode = 1;
    return;
  }

  const document = getStore().getDocumentBySourceId(source.sourceId);
  if (!document) {
    console.error(
      `"${source.sourceId}" has not been ingested, so there is no content revision to review. Run \`pnpm ingest --only=${source.sourceId}\` first.`,
    );
    process.exitCode = 1;
    return;
  }

  const review: SourceReview = {
    sourceId: source.sourceId,
    reviewerName: args.reviewer!.trim(),
    reviewerCredential: args.credential!.trim(),
    decision,
    note: args.note?.trim() ? args.note.trim() : null,
    reviewedAt: new Date().toISOString(),
    contentSha256: document.contentSha256,
  };

  const ledger = readLedger();
  const previous = reviewFor(source.sourceId, document.contentSha256);

  // Append-only: an earlier decision is left in place so the history survives.
  ledger.reviews.push(review);
  writeLedger(ledger);

  console.log(`Recorded for ${source.sourceId}:`);
  console.log(`  reviewer   ${review.reviewerName} (${review.reviewerCredential})`);
  console.log(`  decision   ${review.decision}`);
  console.log(`  when       ${review.reviewedAt}`);
  console.log(`  covers     ${review.contentSha256.slice(0, 16)}…`);
  console.log(`  ledger     ${path.relative(process.cwd(), LEDGER_PATH)}`);
  if (previous.latest) {
    console.log(
      `  note       this supersedes the entry from ${previous.latest.reviewedAt.slice(0, 10)}; that entry is kept.`,
    );
  }
  console.log(
    "\nThis records a claim made by a named person. It does not verify that person, their credential, or that the review took place, and it is not clinical validation of the platform. Commit the ledger for the record to have a history.",
  );
}

const args = parseArgs(process.argv.slice(2));
if (args.source) {
  record(args);
} else {
  list();
}
