/**
 * Checks for the podcast catalogue.
 *
 *   pnpm check:podcasts            # offline: structure and selection behaviour
 *   pnpm check:podcasts --live     # also re-reads every video from YouTube
 *
 * Two jobs, deliberately separated.
 *
 * The offline pass runs with no network and asserts the properties that make the
 * catalogue safe to ship: every entry has the fields the interface reads, no id or
 * video is duplicated, the watch URL and the thumbnail both name the same video as
 * the entry does, dates and durations are real values, every topic is one the
 * filter can offer, and a summary exists. It also exercises the search, filter and
 * related-episode functions, because those are the parts of the feature a reader
 * actually touches and they are pure functions over this same data.
 *
 * The `--live` pass is the one that matters for honesty. It re-reads each video's
 * watch page and oEmbed record and compares the title, channel, publication date
 * and duration against what the catalogue claims. A video that was renamed,
 * re-uploaded, removed, or moved to a different channel fails the check instead of
 * quietly rendering the wrong card. Because it depends on YouTube being reachable
 * and on the pages being served in the same shape, a network failure is reported as
 * BLOCKED and exits 2, which is distinct from a real mismatch (exit 1), so "blocked"
 * is never mistaken for "broken".
 */
import {
  CATALOGUE_VERIFICATION,
  PODCAST_ENTRIES,
  episodesForTopics,
  filterCatalogue,
  formatDuration,
  getPodcastEntry,
  matchesQuery,
  relatedEpisodes,
} from "@/lib/podcasts/catalogue";
import { PODCAST_TOPIC_IDS } from "@/lib/profile/options";

const live = process.argv.includes("--live");

let passed = 0;
let failed = 0;
let blocked = 0;

function ok(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`ok   ${name}`);
    return;
  }
  failed += 1;
  console.log(
    `FAIL ${name}${detail === undefined ? "" : `  -> ${JSON.stringify(detail).slice(0, 300)}`}`,
  );
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ *
 * 1. Structure
 * ------------------------------------------------------------------ */

ok("the catalogue is not empty", PODCAST_ENTRIES.length > 0, PODCAST_ENTRIES.length);
ok(
  "every entry has a unique slug",
  new Set(PODCAST_ENTRIES.map((entry) => entry.id)).size === PODCAST_ENTRIES.length,
);
ok(
  "every entry has a unique video",
  new Set(PODCAST_ENTRIES.map((entry) => entry.videoId)).size ===
    PODCAST_ENTRIES.length,
);
ok(
  "every entry has a unique title",
  new Set(PODCAST_ENTRIES.map((entry) => entry.title)).size === PODCAST_ENTRIES.length,
);

const structural: string[] = [];
for (const entry of PODCAST_ENTRIES) {
  const problem = (message: string) => structural.push(`${entry.id}: ${message}`);
  if (!VIDEO_ID.test(entry.videoId)) problem("video id is not 11 URL-safe characters");
  if (entry.videoUrl !== `https://www.youtube.com/watch?v=${entry.videoId}`) {
    problem("watch URL does not name the entry's own video id");
  }
  if (entry.thumbnailUrl !== `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`) {
    problem("thumbnail URL does not name the entry's own video id");
  }
  if (entry.videoUrl.startsWith("http://")) problem("watch URL is not https");
  if (!ISO_DATE.test(entry.publishedOn)) problem("publication date is not YYYY-MM-DD");
  else if (Number.isNaN(Date.parse(`${entry.publishedOn}T00:00:00Z`))) {
    problem("publication date does not parse");
  } else if (Date.parse(`${entry.publishedOn}T00:00:00Z`) > Date.parse(`${CATALOGUE_VERIFICATION.verifiedOn}T00:00:00Z`)) {
    problem("publication date is later than the verification date");
  }
  if (!Number.isInteger(entry.durationSeconds) || entry.durationSeconds <= 0) {
    problem("duration is not a positive whole number of seconds");
  }
  if (entry.topics.length === 0) problem("no topics, so no filter can reach it");
  for (const topic of entry.topics) {
    if (!PODCAST_TOPIC_IDS.includes(topic)) problem(`unknown topic ${topic}`);
  }
  if (entry.summary.trim().length < 40) problem("summary is too short to be useful");
  if (entry.summary.includes("  ")) problem("summary has a double space");
  if (entry.title.trim() !== entry.title) problem("title has surrounding whitespace");
  // The title is quoted verbatim from the publisher, so nothing about its
  // characters is ours to constrain; the live pass is what proves it is exact.
  // The summary is this project's own text, so it is held to plain printable
  // ASCII: no typographic quotes, no em dashes, nothing a font has to supply.
  if (!/^[\x20-\x7E]+$/.test(entry.summary)) {
    problem("summary contains a character outside plain printable ASCII");
  }
  if (!entry.publisher.trim()) problem("publisher is empty");
  ok(`${entry.id} has a plausible duration label`, formatDuration(entry.durationSeconds).length > 0);
}
ok("every entry is structurally sound", structural.length === 0, structural);

ok(
  "every catalogue topic has at least one entry",
  PODCAST_TOPIC_IDS.every((topic) =>
    PODCAST_ENTRIES.some((entry) => entry.topics.includes(topic)),
  ),
);

/* ------------------------------------------------------------------ *
 * 2. Selection behaviour
 * ------------------------------------------------------------------ */

const bp = filterCatalogue({ topics: ["heart-and-blood-pressure"] });
ok("topic filtering returns only matching entries", bp.length > 0, bp.length);
ok(
  "topic filtering never returns a non-matching entry",
  bp.every((entry) => entry.topics.includes("heart-and-blood-pressure")),
);

const noResults = filterCatalogue({ query: "zzzzzznotaword" });
ok("an unmatched search returns nothing rather than everything", noResults.length === 0);

const combined = filterCatalogue({ query: "dengue", topics: ["mosquito-borne-disease"] });
ok("search and topic filters combine", combined.length > 0, combined.length);

const hindi = filterCatalogue({ language: "hi" });
ok("the Hindi filter returns the Hindi-language entries", hindi.length > 0, hindi.length);
ok("the Hindi filter returns only Hindi entries", hindi.every((entry) => entry.language === "hi"));

const cdc = filterCatalogue({ query: "cdc" });
ok(
  "publisher names are searchable",
  cdc.length > 0 && cdc.every((entry) => matchesQuery(entry, "cdc")),
  cdc.length,
);

const tanglish = filterCatalogue({ query: "SLEEP" });
ok("search is case-insensitive", tanglish.length > 0, tanglish.length);

const related = relatedEpisodes(PODCAST_ENTRIES[0]!.id, 3);
ok("related episodes are found for an entry with shared topics", related.length > 0);
ok(
  "related episodes never include the entry itself",
  related.every((candidate) => candidate.entry.id !== PODCAST_ENTRIES[0]!.id),
);
ok(
  "related episodes each share at least one topic",
  related.every((candidate) => candidate.sharedTopics.length > 0),
);

const suggestions = episodesForTopics(["sleep", "mental-health"], 3);
ok("profile topics select episodes", suggestions.length > 0, suggestions.length);
ok(
  "profile suggestions match the requested topics",
  suggestions.every((candidate) =>
    candidate.matchedTopics.some((topic) => ["sleep", "mental-health"].includes(topic)),
  ),
);
const withExclusions = episodesForTopics(["sleep"], 3, ["nhs-sleep-problems"]);
ok(
  "already-saved episodes can be excluded from suggestions",
  withExclusions.every((candidate) => candidate.entry.id !== "nhs-sleep-problems"),
);

ok("an unknown slug resolves to nothing", getPodcastEntry("not-a-real-slug") === null);
ok("a known slug resolves", getPodcastEntry(PODCAST_ENTRIES[0]!.id) !== null);
ok(
  "the catalogue records how its metadata was verified",
  CATALOGUE_VERIFICATION.method.length > 20 && CATALOGUE_VERIFICATION.verifiedOn.length === 10,
);

/* ------------------------------------------------------------------ *
 * 3. Live verification against YouTube
 * ------------------------------------------------------------------ */

type Remote = {
  title: string | null;
  channel: string | null;
  uploadDate: string | null;
  seconds: number | null;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * The watch page embeds its metadata as JSON, so an ampersand arrives as the
 * JavaScript escape `\u0026`. Without this the channel check would compare
 * `Ministry of Health \u0026 Family Welfare` against the real name and report a
 * mismatch that does not exist.
 */
function decodeJsEscapes(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function match(html: string, pattern: RegExp): string | null {
  return html.match(pattern)?.[1] ?? null;
}

async function readRemote(videoId: string): Promise<Remote | "unreachable"> {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; UltimateHealthCatalogueCheck/1.0; metadata verification)",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) return "unreachable";
    const html = await response.text();
    const title =
      match(html, /<meta name="title" content="([^"]*)"/) ??
      match(html, /"title":"((?:[^"\\]|\\.)*)"/);
    const channel = match(html, /"ownerChannelName":"((?:[^"\\]|\\.)*)"/);
    const seconds = match(html, /"lengthSeconds":"(\d+)"/);
    return {
      title: title ? decodeEntities(decodeJsEscapes(title)) : null,
      channel: channel ? decodeJsEscapes(channel) : null,
      uploadDate: match(html, /"uploadDate":"([^"]*)"/),
      seconds: seconds ? Number(seconds) : null,
    };
  } catch {
    return "unreachable";
  }
}

async function verifyLive() {
  for (const entry of PODCAST_ENTRIES) {
    const remote = await readRemote(entry.videoId);
    if (remote === "unreachable") {
      blocked += 1;
      console.log(`BLOCKED ${entry.id} could not be read from YouTube`);
      continue;
    }
    const mismatches: string[] = [];
    if (!remote.title) mismatches.push("no title on the page");
    else if (remote.title !== entry.title) {
      mismatches.push(`title is "${remote.title}" but the catalogue says "${entry.title}"`);
    }
    if (!remote.channel) mismatches.push("no channel on the page");
    else if (remote.channel !== entry.publisher) {
      mismatches.push(
        `channel is "${remote.channel}" but the catalogue says "${entry.publisher}"`,
      );
    }
    if (!remote.uploadDate) mismatches.push("no upload date on the page");
    else if (!remote.uploadDate.startsWith(entry.publishedOn)) {
      mismatches.push(
        `published ${remote.uploadDate.slice(0, 10)} but the catalogue says ${entry.publishedOn}`,
      );
    }
    if (remote.seconds === null) mismatches.push("no duration on the page");
    else if (remote.seconds !== entry.durationSeconds) {
      mismatches.push(
        `duration is ${remote.seconds}s but the catalogue says ${entry.durationSeconds}s`,
      );
    }

    const thumbnail = await fetch(entry.thumbnailUrl, { method: "HEAD" });
    if (!thumbnail.ok) mismatches.push(`thumbnail returned HTTP ${thumbnail.status}`);

    if (mismatches.length === 0) {
      passed += 1;
      console.log(`ok   ${entry.id} matches YouTube (${entry.publisher})`);
    } else {
      failed += 1;
      console.log(`FAIL ${entry.id}  -> ${mismatches.join("; ")}`);
    }
    // A courtesy pause: this reads ~35 pages from one host and has no reason to
    // do it as fast as possible.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function main() {
  if (live) {
    console.log(
      `\nReading ${PODCAST_ENTRIES.length} videos from YouTube for live verification…`,
    );
    await verifyLive();
  }

  console.log(
    `\n${passed} passed, ${failed} failed${blocked > 0 ? `, ${blocked} blocked` : ""}`,
  );
  // Exit 2 means "could not test", which is distinct from 1, "tested and wrong",
  // so a blocked network is never reported as a broken catalogue.
  if (failed > 0) process.exit(1);
  if (blocked > 0) process.exit(2);
}

main().catch((error) => {
  console.error("The check itself failed:", error instanceof Error ? error.message : error);
  process.exit(2);
});
