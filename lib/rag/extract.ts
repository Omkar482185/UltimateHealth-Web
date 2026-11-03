import * as cheerio from "cheerio";

import type { Section } from "@/lib/rag/chunk";

/**
 * HTML retrieval and readability-oriented extraction.
 *
 * Public health pages are mostly static HTML, so a targeted extraction is enough:
 * strip chrome and script content, pick the densest main container, then walk
 * headings and paragraphs in document order. This is intentionally conservative.
 * A paragraph that is short, or that is mostly a link, is dropped, because those
 * are almost always navigation or call-to-action text rather than content.
 */

const USER_AGENT =
  "UltimateHealthInsights/0.1 (academic project; corpus ingestion; contact: project maintainer)";

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

export type ExtractedDocument = {
  title: string;
  sections: Section[];
  charLength: number;
};

export async function fetchHtml(url: string): Promise<string> {
  const attempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  throw new Error(
    `Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function isMostlyLink(text: string, linkChars: number): boolean {
  return text.length > 0 && linkChars / text.length > 0.6;
}

export function extractSections(
  html: string,
  fallbackTitle: string,
): ExtractedDocument {
  const $ = cheerio.load(html);
  for (const selector of STRIP_SELECTORS) $(selector).remove();

  // Choose the first candidate container with substantial text.
  let containerSelector = "body";
  for (const selector of CONTENT_SELECTORS) {
    const candidate = $(selector).first();
    if (
      candidate.length > 0 &&
      candidate.text().replace(/\s+/g, " ").trim().length > 800
    ) {
      containerSelector = selector;
      break;
    }
  }
  const container = $(containerSelector).first();

  const headingOne = container.find("h1").first().text().replace(/\s+/g, " ").trim();
  const pageTitle = $("title").first().text().replace(/\s+/g, " ").trim();
  const title = headingOne || pageTitle || fallbackTitle;

  const sections: Section[] = [];
  let current: Section = { heading: null, paragraphs: [] };
  const seen = new Set<string>();

  const nodes = container.find("h1, h2, h3, h4, p, li").toArray();
  for (const node of nodes) {
    const el = $(node);
    const tag = (node.tagName ?? "").toLowerCase();
    const text = el.text().replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;

    if (tag.startsWith("h")) {
      if (current.paragraphs.length > 0 || current.heading) {
        sections.push(current);
      }
      current = { heading: text, paragraphs: [] };
      continue;
    }

    // Skip nested list items and paragraphs inside list items, which duplicate text.
    if (el.parents("li").length > 0) continue;

    // List items carry content; short standalone paragraphs are almost always
    // chrome. The 25-character floor was applied to both, and that silently
    // deleted the safety-critical part of several pages: the WHO dengue fact
    // sheet ended at "The symptoms of severe dengue ... may include:" with the
    // list of warning signs removed, because "severe abdominal pain", "bleeding
    // gums or nose" and "blood in vomit or stool" are each shorter than 25
    // characters. The same page read "Very high blood pressure may cause:"
    // followed by nothing, having dropped "chest pain", "confusion" and
    // "difficulty breathing". A reader asking about warning signs was therefore
    // told the sources did not cover them. List items now keep their text, and
    // only genuinely empty fragments are discarded; the mostly-link filter and
    // the chrome stripping above are what keep navigation out.
    if (tag === "li" ? text.length < 3 : text.length < 25) continue;
    const normalised = text.toLowerCase();
    if (seen.has(normalised)) continue;
    if (isMostlyLink(text, el.find("a").text().length)) continue;
    // Navigation sections often repeat the page title verbatim.
    if (normalised === title.toLowerCase()) continue;

    seen.add(normalised);
    current.paragraphs.push(text);
  }
  if (current.paragraphs.length > 0 || current.heading) sections.push(current);

  // The floor is applied during the walk above, where the element's tag is still
  // known. A second, tag-blind `length >= 25` filter used to run here as well,
  // which reintroduced exactly the deletion the tag-aware rule is meant to
  // prevent: keeping a short list item only to have this line drop it again.
  const cleaned = sections.filter((s) => s.paragraphs.length > 0);

  const charLength = cleaned.reduce(
    (sum, s) => sum + s.paragraphs.join(" ").length,
    0,
  );

  return { title, sections: cleaned, charLength };
}
