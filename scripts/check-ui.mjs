/**
 * Interface consistency checks against a running server.
 *
 *   pnpm dev          # in one terminal
 *   pnpm check:ui     # in another
 *
 * Every page is rendered by the same layout, so every page should carry the same
 * chrome and the same semantics. Nothing enforced that: a new page could ship with
 * its own header, a second `<h1>`, a heading level skipped, an icon button with no
 * accessible name, or a hard-coded colour, and no check would notice. These are
 * properties of the rendered document, which is why this drives the real server
 * rather than asserting against the components.
 *
 * The document checks are real: `cheerio` parses the served HTML, so what is
 * asserted is what a browser receives, including anything the framework injects.
 *
 * No credential is needed and no account is created, so this can run at any time.
 * The one page that needs a parameter, a library document, is discovered from the
 * library index rather than hard-coded, so it follows the corpus.
 */
import * as cheerio from "cheerio";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3100";
const SITE_TITLE = "UltimateHealth Insights";

/**
 * The primary navigation, in the order the header declares it.
 *
 * The header carries the entry points a reader needs to start with, including
 * the Chikungunya guide. Personal screens live behind the "Your health"
 * disclosure and the reference and policy pages in the footer; both are exercised
 * through the link resolution check below, so the menus do not make a route
 * orphaned.
 */
const NAV_LABELS = [
  "Assistant",
  "Symptom guidance",
  "Chikungunya",
  "Community",
  "Library",
  "Podcasts",
  "Your health",
];

/** A fragment of the footer's standing disclaimer. */
const DISCLAIMER = "does not provide medical diagnosis or treatment";

const results = [];
function t(name, pass, detail) {
  results.push(pass);
  console.log(
    `${pass ? "ok  " : "FAIL"} ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail).slice(0, 220) : ""}`,
  );
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  return { status: res.status, html: await res.text(), path };
}

/** Accessible name for a control, from its text or the usual fallbacks. */
function accessibleName($, el) {
  const $el = $(el);
  const text = $el.text().replace(/\s+/g, " ").trim();
  if (text) return text;
  const label = $el.attr("aria-label") ?? $el.attr("title");
  if (label && label.trim()) return label.trim();
  const img = $el.find("img[alt]").first().attr("alt");
  if (img && img.trim()) return img.trim();
  const hidden = $el.find('[class*="visually-hidden"]').text().trim();
  return hidden;
}

/* 1. Which pages exist. The home page plus every route the nav and footer link to,
 *    so a new entry in the nav is covered without editing this list. */
const home = await get("/");
t("the home page is served", home.status === 200, home.status);

const $home = cheerio.load(home.html);
const linked = new Set();
for (const a of $home("a[href^='/']").toArray()) {
  const href = $home(a).attr("href");
  if (href && href !== "/" && !href.startsWith("//")) linked.add(href.split("#")[0]);
}
const pages = ["/", ...[...linked].sort()];
t("the navigation links to the main pages", pages.length >= 8, pages.length);

// The reusable disease template is reachable from the hub, which this crawler does
// not follow into, so check its rendered shell explicitly.
const COMMUNITY_DISEASES = [
  "chikungunya",
  "dengue",
  "high-blood-pressure",
  "type-2-diabetes",
  "endometriosis",
  "parkinsons-disease",
  "chronic-kidney-disease",
];
pages.push(...COMMUNITY_DISEASES.map((id) => `/community/${id}`));

/* 2. A library document page needs a real id; take it from the index. */
const library = await get("/library");
const $lib = cheerio.load(library.html);
const firstDoc = $lib("a[href^='/library/']").first().attr("href");
if (firstDoc) pages.push(firstDoc);
t("a library document page could be discovered", Boolean(firstDoc), firstDoc);

/* 2b. The Podcasts tab, and one episode page from it. The episode is discovered
 *     from the listing rather than hard-coded, so it follows the catalogue. */
const podcasts = await get("/podcasts");
const $pod = cheerio.load(podcasts.html);
const firstEpisode = $pod("a[href^='/podcasts/']").first().attr("href");
if (firstEpisode) pages.push(firstEpisode);
t("a podcast episode page could be discovered", Boolean(firstEpisode), firstEpisode);

// Every card must offer a way to reach the video that does not depend on the embed
// loading, which is the whole point of shipping the direct link beside it.
const watchLinks = $pod("a[href^='https://www.youtube.com/watch?v=']");
const cannot_be_embedded = $pod("iframe[src*='youtube']").length;
const cards = $pod("ul.podcast-list > li.card");
t(
  "every podcast card links to its video on YouTube",
  cards.length > 0 && watchLinks.length === cards.length,
  { cards: cards.length, watchLinks: watchLinks.length },
);
t(
  "every podcast card shows its publisher",
  cards.toArray().every((card) => $pod(card).find(".meta").first().text().trim().length > 0),
);
t(
  "the listing page does not embed players, so it cannot be slowed by them",
  cannot_be_embedded === 0,
  cannot_be_embedded,
);

// Filters must be real buttons with a pressed state, not styled text.
const chips = $pod("button[aria-pressed]");
t("the podcast topic filters are real toggles", chips.length > 3, chips.length);
t(
  "every filter toggle starts unpressed",
  chips.toArray().every((el) => el.attribs["aria-pressed"] === "false"),
  chips.toArray().filter((el) => el.attribs["aria-pressed"] !== "false").length,
);

/* 3. Per-page consistency. */
const documents = [];
for (const path of [...new Set(pages)]) {
  const page = await get(path);
  const $ = cheerio.load(page.html);
  const label = path;

  t(`${label} is served without a redirect`, page.status === 200, page.status);

  // Language, so a screen reader picks the right voice.
  t(`${label} declares a language`, $("html").attr("lang") === "en", $("html").attr("lang"));

  // Exactly one H1: the page's subject, and the top of the outline.
  const h1s = $("h1");
  t(`${label} has exactly one h1`, h1s.length === 1, h1s.length);

  // A title, using the layout's template.
  const title = $("head title").first().text().trim();
  t(
    `${label} carries the site title`,
    title.length > 0 && title.endsWith(SITE_TITLE),
    title,
  );

  // A description, which is what a result or a preview shows.
  const desc = $("meta[name='description']").attr("content")?.trim() ?? "";
  t(`${label} carries a meta description`, desc.length >= 40, desc.slice(0, 60));

  // The same chrome, in the same order, on every page.
  const navLabels = $("nav[aria-label='Main'] a, nav[aria-label='Main'] button")
    .map((_, el) => $(el).text().trim())
    .get();
  t(
    `${label} carries the shared navigation`,
    JSON.stringify(navLabels) === JSON.stringify(NAV_LABELS),
    navLabels,
  );

  // The reader is told where they are. More than one nav may legitimately mark the
  // current page (the footer links to the same routes as the header), so the
  // requirement is that at least one marker exists and that it points at this page.
  // What must never happen is the main navigation marking two of its own entries,
  // which would say the reader is in two places at once.
  const currentHrefs = $("[aria-current='page']")
    .map((_, a) => ($(a).attr("href") ?? "").replace(/\/$/, "") || "/")
    .get();
  // Query strings address a filtered view of the same route, so location is
  // decided by the path: `/library?topic=...` is still the library page, whose
  // navigation marker correctly points at `/library`.
  const here = path.split("?")[0].replace(/\/$/, "") || "/";
  t(
    `${label} marks its own location`,
    currentHrefs.some((h) => here === h || here.startsWith(`${h}/`) || h.startsWith(`${here}/`)),
    currentHrefs,
  );
  const navCurrent = $("nav[aria-label='Main'] [aria-current='page']").length;
  t(`${label} never marks two main-nav entries at once`, navCurrent <= 1, navCurrent);

  // One main landmark, and the skip link points at it.
  t(`${label} has exactly one main landmark`, $("main").length === 1, $("main").length);
  t(`${label} has a working skip link`, $("#main").length === 1 && $("a[href='#main']").length === 1);

  // The footer, with its disclaimer, so the standing safety notice is never
  // dropped on a page that adds its own layout.
  t(`${label} carries the footer disclaimer`, $("footer").text().includes(DISCLAIMER));

  // Headings descend without skipping a level; a jump from h1 to h3 breaks the
  // outline a screen reader navigates by.
  const levels = $("h1, h2, h3, h4, h5, h6")
    .map((_, h) => Number(h.tagName.slice(1)))
    .get();
  const skips = levels.filter((lv, i) => i > 0 && lv - levels[i - 1] > 1);
  t(`${label} descends no heading level by more than one`, skips.length === 0, skips);

  // Every control has a name a person can hear.
  const unnamed = $("a, button")
    .toArray()
    .filter((el) => {
      if ($(el).attr("aria-hidden") === "true") return false;
      return !accessibleName($, el);
    })
    .map((el) => $(el).attr("href") ?? el.tagName);
  t(`${label} gives every link and button an accessible name`, unnamed.length === 0, unnamed);

  // Colour discipline: colours come from tokens, so a page cannot drift to a
  // hard-coded shade. `var(...)` and `currentColor` are the intended forms.
  const painted = $("[style]")
    .toArray()
    .flatMap((el) =>
      ($(el).attr("style") ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter((d) => /#[0-9a-fA-F]{3,8}\b/.test(d) || /\brgba?\(/.test(d)),
    );
  const svgPainted = $("svg[fill], svg[stroke], path[fill], path[stroke], rect[fill], rect[stroke]")
    .toArray()
    .map((el) => el.attribs.fill ?? el.attribs.stroke)
    .filter((v) => v && /#[0-9a-fA-F]{3,8}\b/.test(v));
  t(`${label} paints from tokens, not literal colours`, painted.length + svgPainted.length === 0, [
    ...painted,
    ...svgPainted,
  ]);

  documents.push({ path, $ });
}

/* 3b. Patient-experience discovery lives inside the existing Community tab.
 *     Every supported disease page must carry it, with both ways in, and no new
 *     top-level navigation entry (the NAV_LABELS assertion above already enforces
 *     the navigation itself). */
const byPath = new Map(documents.map((document) => [document.path, document.$]));
const experiencePages = ["/community", ...COMMUNITY_DISEASES.map((id) => `/community/${id}`)];
for (const path of experiencePages) {
  const $ = byPath.get(path);
  if (!$) {
    t(`${path} was available for the experience check`, false);
    continue;
  }
  const section = $("#experiences");
  t(`${path} contains the experience-discovery section`, section.length === 1, section.length);
  const modes = section.find("button[aria-pressed]");
  t(
    `${path} offers an ask path and a read path as real toggles`,
    modes.length === 2 &&
      /Ask people and connect/.test(section.text()) &&
      /Read patient experiences/.test(section.text()),
    modes.length,
  );
  t(
    `${path} says replies are not guaranteed and experiences are not medical advice`,
    /not guaranteed/i.test(section.text()) && /not medical advice/i.test(section.text()),
  );
  t(
    `${path} keeps the native posting route alongside the external options`,
    section.find('a[href$="#start"]').length > 0,
  );
}

const hubExperience = byPath.get("/community");
if (hubExperience) {
  const text = hubExperience("#experiences").text();
  t(
    "the hub states which external providers are searched and which are linked only",
    /Medical Sciences Stack Exchange/.test(text) &&
      /Reddit/.test(text) &&
      /HealthUnlocked/.test(text) &&
      /linked as destinations only/i.test(text),
  );
}

/* 4. Every internal link the pages emit resolves. A nav entry that 404s is the
 *    most visible kind of inconsistency, and it is invisible to a unit check. */
const targets = new Set();
for (const { $ } of documents) {
  for (const a of $("a[href^='/']").toArray()) {
    const href = $(a).attr("href");
    if (href && !href.startsWith("//")) targets.add(href.split("#")[0]);
  }
}
const broken = [];
for (const target of targets) {
  if (target === "" ) continue;
  const res = await fetch(BASE + target, { redirect: "manual" });
  if (res.status !== 200) broken.push(`${target} -> ${res.status}`);
  await res.arrayBuffer();
}
t(`${targets.size} distinct internal links all resolve`, broken.length === 0, broken);

/* 5. The episode page must offer both ways in: the player and the direct link. */
if (firstEpisode) {
  const episode = await get(firstEpisode);
  const $ep = cheerio.load(episode.html);
  const embed = $ep("iframe[src^='https://www.youtube-nocookie.com/embed/']");
  const direct = $ep("a[href^='https://www.youtube.com/watch?v=']");
  t(
    `${firstEpisode} embeds the publisher's player`,
    embed.length === 1,
    embed.attr("src"),
  );
  t(
    `${firstEpisode} also offers a direct link to YouTube`,
    direct.length >= 1,
    direct.attr("href"),
  );
  t(
    `${firstEpisode} gives the player an accessible name`,
    Boolean(embed.attr("title")),
    embed.attr("title"),
  );
  t(
    `${firstEpisode} says the episode has not been clinically reviewed`,
    /not clinically reviewed/i.test($ep("main").text()),
  );
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
