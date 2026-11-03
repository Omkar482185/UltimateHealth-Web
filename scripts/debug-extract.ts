/**
 * Extraction diagnostic.
 *
 *   pnpm exec tsx scripts/debug-extract.ts <url>
 *
 * Reports which content container the extractor would choose, how much text each
 * candidate holds, the tag distribution inside the chosen container, and the first
 * few paragraphs it would keep. Use this when a source starts failing extraction
 * because a publisher changed their page structure.
 */
import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/rag/extract";

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "form",
  "nav",
  "header",
  "footer",
  "aside",
  "[aria-hidden=true]",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  ".nhsuk-header",
  ".nhsuk-footer",
  ".nhsuk-breadcrumb",
  "#breadcrumbs",
  ".breadcrumb",
  ".cookie-banner",
  "[id*=cookie]",
  ".nav",
  ".menu",
  ".sidebar",
  ".related-links",
];

const CONTENT_SELECTORS = [
  "#mplus-content",
  ".nhsuk-main-wrapper",
  "main article",
  "main",
  "article",
  "[role=main]",
  ".entry-content",
  "#content",
];

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: tsx scripts/debug-extract.ts <url>");
    process.exit(2);
  }
  const html = await fetchHtml(url);
  console.log(`fetched ${html.length} characters of HTML`);

  const $ = cheerio.load(html);
  for (const s of STRIP_SELECTORS) $(s).remove();

  console.log("\nCandidate containers:");
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    const text = el.text().replace(/\s+/g, " ").trim();
    console.log(
      `  ${selector.padEnd(22)} matches=${$(selector).length} text=${text.length}`,
    );
  }

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  console.log(`  ${"<body>".padEnd(22)} text=${bodyText.length}`);

  const container = $("main").first().length ? $("main").first() : $("body");
  console.log("\nTag counts inside <main> (or body):");
  for (const tag of ["h1", "h2", "h3", "h4", "p", "li", "div"]) {
    console.log(`  ${tag.padEnd(4)} ${container.find(tag).length}`);
  }

  console.log("\nFirst 8 paragraph-ish text nodes inside <main>:");
  const nodes = container.find("h1, h2, h3, p, li").toArray().slice(0, 12);
  for (const node of nodes) {
    const el = $(node);
    const tag = (node.tagName ?? "").toLowerCase();
    const text = el.text().replace(/\s+/g, " ").trim();
    console.log(`  <${tag}> len=${text.length} ${text.slice(0, 110)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
