/**
 * Chunks overlap so that sentences split across a boundary keep their context.
 * That overlap is correct for retrieval but would read as duplicated text on an
 * article page, so it is removed here before display.
 *
 * For each chunk, the longest prefix that also ends the previous chunk is
 * dropped. Consecutive chunks that share a heading are merged.
 */

export type StitchableChunk = {
  heading: string | null;
  text: string;
};

export type StitchedSection = {
  heading: string | null;
  text: string;
};

export function stitchChunks(chunks: StitchableChunk[]): StitchedSection[] {
  const sections: StitchedSection[] = [];
  let previousFull = "";

  for (const chunk of chunks) {
    let text = chunk.text;
    const maxOverlap = Math.min(600, text.length);
    for (let k = maxOverlap; k > 12; k -= 1) {
      if (previousFull.endsWith(text.slice(0, k))) {
        text = text.slice(k).replace(/^\s+/, "");
        break;
      }
    }
    if (text.trim().length === 0) {
      previousFull = chunk.text;
      continue;
    }

    const last = sections[sections.length - 1];
    if (last && last.heading === chunk.heading) {
      last.text = `${last.text}\n\n${text}`.trim();
    } else {
      sections.push({ heading: chunk.heading, text });
    }
    previousFull = chunk.text;
  }

  return sections;
}

export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
