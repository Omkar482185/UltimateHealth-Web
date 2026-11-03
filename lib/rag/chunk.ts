import { CHUNK } from "@/lib/config";

/**
 * Section-aware chunking.
 *
 * Documents are chunked along heading boundaries rather than by fixed character
 * windows, so a chunk rarely straddles two unrelated topics. Paragraphs are then
 * packed into chunks that approach `targetChars` without exceeding `maxChars`,
 * and each chunk repeats a short tail of the previous chunk so that a sentence
 * split across a boundary keeps its context.
 */

export type Section = {
  heading: string | null;
  paragraphs: string[];
};

export type TextChunk = {
  ordinal: number;
  heading: string | null;
  text: string;
};

/** Split an over-long paragraph on sentence boundaries. */
function splitLongParagraph(paragraph: string, limit: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [
    paragraph,
  ];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > limit) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());

  // A single sentence longer than the limit still has to be emitted.
  return parts.length > 0 ? parts : [paragraph];
}

function tail(text: string, chars: number): string {
  if (text.length <= chars) return text;
  const slice = text.slice(text.length - chars);
  const boundary = slice.search(/[.!?]\s/);
  return boundary === -1 ? slice : slice.slice(boundary + 2);
}

export function chunkSections(sections: Section[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let pending: string[] = [];
  let pendingHeading: string | null = null;
  let previousTail = "";

  function flush() {
    const body = pending.join("\n\n").trim();
    pending = [];
    if (body.length < CHUNK.minChars && chunks.length > 0) {
      // Too small to stand alone: append to the previous chunk if it fits.
      const last = chunks[chunks.length - 1];
      if (last.text.length + body.length + 2 <= CHUNK.maxChars) {
        last.text = `${last.text}\n\n${body}`;
        return;
      }
    }
    if (body.length === 0) return;
    const withOverlap =
      previousTail.length > 0
        ? `${previousTail}\n\n${body}`
        : body;
    chunks.push({
      ordinal: chunks.length,
      heading: pendingHeading,
      text: withOverlap,
    });
    previousTail = tail(body, CHUNK.overlapChars);
  }

  for (const section of sections) {
    for (const rawParagraph of section.paragraphs) {
      const paragraph = rawParagraph.replace(/\s+/g, " ").trim();
      if (paragraph.length < 2) continue;

      const pieces =
        paragraph.length > CHUNK.maxChars
          ? splitLongParagraph(paragraph, CHUNK.targetChars)
          : [paragraph];

      for (const piece of pieces) {
        const prospective = [...pending, piece].join("\n\n");
        if (pending.length > 0 && prospective.length > CHUNK.targetChars) {
          flush();
          pendingHeading = section.heading;
        }
        if (pending.length === 0) pendingHeading = section.heading;
        pending.push(piece);
      }
    }
    // Headings are natural chunk boundaries.
    if (pending.join("").length >= CHUNK.minChars) flush();
  }
  flush();

  return chunks;
}

/** Rough token estimate used for context-budget decisions. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
