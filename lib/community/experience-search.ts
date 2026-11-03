/**
 * Authorised external patient-experience discovery.
 *
 * ## What was verified, and what was not
 *
 * Each provider below was checked directly from a terminal. The findings are kept
 * in code so the capability claims shown in the interface are reviewable next to
 * the implementation:
 *
 *  - **Medical Sciences Stack Exchange** exposes an official public API (v2.3)
 *    with a search endpoint. It answered `application/json` here without an API
 *    key, within its anonymous quota. Public contributions are licensed CC BY-SA,
 *    so a short attributed excerpt with a link to the original thread is
 *    permitted. This is the only provider implemented as search.
 *  - **Reddit** has an official API, but its unauthenticated JSON search endpoint
 *    returned HTTP 403 from here. Searching it needs OAuth credentials, so it is
 *    not implemented; the interface says so instead of pretending to search it.
 *  - **HealthUnlocked** returned HTTP 403 to a direct read, so neither its groups
 *    nor their activity could be verified.
 *  - **PatientsLikeMe** and **HealthCircle** were reachable, but no public search
 *    interface was found, so they are linked as destinations only.
 *
 * ## Boundaries
 *
 * Nothing is scraped. The request is one documented API call, bounded by a
 * timeout, a per-process result cache, and a failure backoff so a provider that is
 * down is not called in a loop. Returned URLs are checked against the provider's
 * own host before they are shown, and only a short excerpt is reproduced, with
 * attribution and the licence named. A failed provider never throws into a page:
 * it returns an `unavailable` result and the caller shows the fallback.
 */
import { DISEASES } from "@/lib/community/diseases";
import { externalResourcesFor } from "@/lib/community/external";

export const SEARCH_PROVIDER = {
  id: "medicalsciences-stackexchange",
  name: "Medical Sciences Stack Exchange",
  platform: "Stack Exchange",
  homepage: "https://medicalsciences.stackexchange.com/",
  licence: "CC BY-SA",
  licenceUrl: "https://medicalsciences.stackexchange.com/help/licensing",
  host: "medicalsciences.stackexchange.com",
} as const;

/** Provider capability findings, shown in the interface and in the docs. */
export const PROVIDER_FINDINGS: readonly {
  id: string;
  name: string;
  method: string;
  /** `search` means real results are retrieved; the rest are destinations only. */
  capability: "search" | "credentials-required" | "destination-only" | "unverified";
  finding: string;
  url: string;
}[] = [
  {
    id: SEARCH_PROVIDER.id,
    name: SEARCH_PROVIDER.name,
    method: "Official public API (Stack Exchange API v2.3, search/advanced)",
    capability: "search",
    finding:
      "Answered with JSON without a key, within the anonymous quota. Public posts are CC BY-SA, so a short attributed excerpt and a link to the original thread are permitted.",
    url: SEARCH_PROVIDER.homepage,
  },
  {
    id: "reddit",
    name: "Reddit",
    method: "Official API via OAuth",
    capability: "credentials-required",
    finding:
      "The unauthenticated search endpoint returned HTTP 403 when checked from this deployment. Searching requires OAuth credentials, so no Reddit search is performed.",
    url: "https://www.reddit.com/",
  },
  {
    id: "healthunlocked",
    name: "HealthUnlocked",
    method: "Direct links only",
    capability: "unverified",
    finding:
      "Returned HTTP 403 to a direct read, so its communities and their activity could not be verified. Nothing from it is presented as a checked destination.",
    url: "https://healthunlocked.com/",
  },
  {
    id: "patientslikeme",
    name: "PatientsLikeMe",
    method: "Direct links only",
    capability: "destination-only",
    finding:
      "Public condition pages are readable, but no public discussion search interface was found. Linked as a condition page, not searched.",
    url: "https://www.patientslikeme.com/",
  },
  {
    id: "healthcircle",
    name: "HealthCircle",
    method: "Direct links only",
    capability: "destination-only",
    finding:
      "Reachable, and one dedicated chikungunya community page could be read. No public search interface was verified, so it is linked, not searched.",
    url: "https://healthcircle.life/communities",
  },
];

/**
 * Canonical disease id to search terms for the external provider. Keyed by the
 * project's own disease id rather than matching on the displayed name, so a
 * rename cannot silently stop the search from finding the right condition.
 */
const DISEASE_QUERY: Record<string, string> = {
  chikungunya: "chikungunya",
  dengue: "dengue",
  "high-blood-pressure": "hypertension blood pressure",
  "type-2-diabetes": "type 2 diabetes",
  endometriosis: "endometriosis",
  "parkinsons-disease": "parkinson disease",
  "chronic-kidney-disease": "chronic kidney disease",
};

/**
 * Words that must appear in a result for it to be about the selected condition.
 * This is a relevance guard: the provider's ranking will happily return an
 * unrelated question when the query is broad, and showing it would be worse than
 * showing fewer results.
 */
const DISEASE_MATCH: Record<string, string[]> = {
  chikungunya: ["chikungunya"],
  dengue: ["dengue"],
  "high-blood-pressure": ["hypertension", "blood pressure"],
  "type-2-diabetes": ["diabetes"],
  endometriosis: ["endometriosis"],
  "parkinsons-disease": ["parkinson"],
  "chronic-kidney-disease": ["kidney", "renal", "ckd"],
};

function matchesDisease(item: ExternalExperience, diseaseId: string): boolean {
  const terms = DISEASE_MATCH[diseaseId];
  if (!terms || terms.length === 0) return false;
  const haystack = `${item.title} ${item.tags.join(" ")} ${item.excerpt ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "has", "had", "was", "were",
  "are", "you", "your", "anyone", "anybody", "else", "someone", "what", "when",
  "how", "why", "who", "does", "did", "not", "but", "about", "from", "they",
  "their", "there", "been", "being", "into", "over", "after", "before", "could",
  "would", "should", "like", "just", "very", "much", "more", "most", "some",
  "experience", "experienced", "any", "all", "can", "get", "got", "same",
]);

/** A single genuine answer returned by the provider, reduced for display. */
export type ExternalAnswer = {
  id: number;
  /** Plain-text excerpt of the answer body, or null when the body was empty. */
  excerpt: string | null;
  author: string | null;
  score: number;
  accepted: boolean;
  createdAt: string | null;
};

export type ExternalExperience = {
  id: string;
  providerId: typeof SEARCH_PROVIDER.id;
  provider: string;
  title: string;
  excerpt: string | null;
  url: string;
  publishedAt: string | null;
  retrievedAt: string;
  tags: string[];
  answerCount: number;
  score: number;
  author: string | null;
  licence: string;
  licenceUrl: string;
  /**
   * The accepted answer, or the highest-voted one when none is accepted. Null
   * means either "no answers exist" (answerCount is 0) or "the provider did not
   * return answer text" — `answerLookup` on the result distinguishes the two.
   */
  answer: ExternalAnswer | null;
};

export type ExternalSearchResult = {
  /**
   * `skipped` is used when the caller deliberately did not ask the provider (the
   * default native feed), so the interface can offer to load external questions
   * instead of pretending the search failed.
   */
  status: "ok" | "empty" | "unavailable" | "skipped";
  provider: { id: string; name: string; homepage: string; licence: string; licenceUrl: string };
  items: ExternalExperience[];
  retrievedAt: string;
  /** Why there are no results. Set for `empty` and `unavailable`. */
  reason: string | null;
  /** True when this answer came from the short-lived cache. */
  cached: boolean;
  /** Whether answer text was requested and returned. */
  answerLookup: "ok" | "failed" | "skipped";
};

const CACHE_TTL_MS = 10 * 60_000;
const FAILURE_BACKOFF_MS = 60_000;
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_CACHE_ENTRIES = 60;

type CacheEntry = { at: number; result: ExternalSearchResult };

const cache = new Map<string, CacheEntry>();
/** Identical searches already on the wire, so a double mount costs one call. */
const inFlight = new Map<string, Promise<ExternalSearchResult>>();
let providerDisabledUntil = 0;
let lastFailure: string | null = null;

const BASE_PROVIDER = {
  id: SEARCH_PROVIDER.id,
  name: SEARCH_PROVIDER.name,
  homepage: SEARCH_PROVIDER.homepage,
  licence: SEARCH_PROVIDER.licence,
  licenceUrl: SEARCH_PROVIDER.licenceUrl,
};

function result(
  status: ExternalSearchResult["status"],
  items: ExternalExperience[],
  retrievedAt: string,
  reason: string | null,
  cached: boolean,
  answerLookup: ExternalSearchResult["answerLookup"] = "skipped",
): ExternalSearchResult {
  return {
    status,
    provider: BASE_PROVIDER,
    items,
    retrievedAt,
    reason,
    cached,
    answerLookup,
  };
}

/** Only https URLs on the provider's own host may be rendered as a result. */
export function isAllowedResultUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === SEARCH_PROVIDER.host &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** A curated outbound link: https, no embedded credentials, a real host. */
export function isSafeOutboundUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Minimal entity decoding for provider-supplied text. Never renders markup. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) && value > 0 && value < 0x10ffff
        ? String.fromCodePoint(value)
        : " ";
    });
}

/** Plain text from a provider's HTML body. No markup is ever rendered. */
export function excerptFromHtml(html: unknown, limit = 260): string | null {
  if (typeof html !== "string") return null;
  const text = decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/**
 * Builds the provider query from the canonical disease term plus meaningful words
 * from the reader's question. Anything unusual is stripped, and the result is
 * capped, so the request cannot be used to send arbitrary text to the provider.
 */
export function buildProviderQuery(diseaseId: string, question: string): string {
  const disease = DISEASE_QUERY[diseaseId] ?? "";
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
    // The provider matches all supplied words, so a long question would return
    // almost nothing. Two meaningful words plus the disease term keeps the first
    // attempt relevant while still finding real questions.
    .slice(0, 2);
  const query = [disease, ...words].filter(Boolean).join(" ").trim();
  return query.slice(0, 120);
}

type StackExchangeItem = {
  question_id?: unknown;
  title?: unknown;
  link?: unknown;
  creation_date?: unknown;
  body?: unknown;
  tags?: unknown;
  answer_count?: unknown;
  score?: unknown;
  owner?: { display_name?: unknown };
};

function toIsoDate(seconds: unknown): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  // Reject a timestamp implausibly far in the future (provider data error).
  if (date.getTime() > Date.now() + 24 * 60 * 60_000) return null;
  return date.toISOString();
}

function parseItems(payload: unknown, retrievedAt: string): ExternalExperience[] | null {
  if (!payload || typeof payload !== "object") return null;
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const parsed: ExternalExperience[] = [];
  for (const raw of items as StackExchangeItem[]) {
    if (!raw || typeof raw !== "object") continue;
    if (typeof raw.question_id !== "number") continue;
    if (typeof raw.title !== "string" || raw.title.trim().length === 0) continue;
    if (!isAllowedResultUrl(raw.link)) continue;
    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 5)
      : [];
    const author =
      raw.owner && typeof raw.owner.display_name === "string"
        ? decodeEntities(raw.owner.display_name).replace(/\s+/g, " ").trim().slice(0, 80) || null
        : null;
    parsed.push({
      id: `se-${raw.question_id}`,
      providerId: SEARCH_PROVIDER.id,
      provider: SEARCH_PROVIDER.name,
      title: decodeEntities(raw.title).replace(/\s+/g, " ").trim().slice(0, 200),
      excerpt: excerptFromHtml(raw.body),
      url: raw.link,
      publishedAt: toIsoDate(raw.creation_date),
      retrievedAt,
      tags,
      answerCount:
        typeof raw.answer_count === "number" && Number.isFinite(raw.answer_count)
          ? Math.max(0, Math.trunc(raw.answer_count))
          : 0,
      score:
        typeof raw.score === "number" && Number.isFinite(raw.score)
          ? Math.trunc(raw.score)
          : 0,
      author,
      licence: SEARCH_PROVIDER.licence,
      licenceUrl: SEARCH_PROVIDER.licenceUrl,
      answer: null,
    });
  }
  return parsed;
}

const MAX_ANSWER_QUESTIONS = 3;

function questionIdOf(item: ExternalExperience): number | null {
  if (!item.id.startsWith("se-")) return null;
  const id = Number(item.id.slice(3));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Fetches the accepted (or highest-voted) answer for up to three questions in a
 * single authorised API call. Answer text is only ever displayed with its author
 * and with a link back to the thread; nothing is stored.
 *
 * A failure here never fails the search: the questions are real and useful on
 * their own, so the result records `answerLookup: "failed"` and the interface
 * says that answer text could not be retrieved rather than inventing one.
 */
async function attachAnswers(items: ExternalExperience[]): Promise<{
  items: ExternalExperience[];
  lookup: ExternalSearchResult["answerLookup"];
}> {
  const candidates = items
    .filter((item) => item.answerCount > 0 && questionIdOf(item) !== null)
    .slice(0, MAX_ANSWER_QUESTIONS);
  if (candidates.length === 0) return { items, lookup: "skipped" };

  const ids = candidates
    .map(questionIdOf)
    .filter((id): id is number => id !== null);
  if (ids.length === 0) return { items, lookup: "skipped" };

  const params = new URLSearchParams({
    site: "health",
    filter: "withbody",
    sort: "votes",
    order: "desc",
    pagesize: "100",
  });

  try {
    const response = await fetch(
      `https://api.stackexchange.com/2.3/questions/${ids.join(";")}/answers?${params.toString()}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (!response.ok) return { items, lookup: "failed" };

    const payload: unknown = await response.json();
    const rawItems =
      payload && typeof payload === "object"
        ? (payload as { items?: unknown }).items
        : undefined;
    if (!Array.isArray(rawItems)) return { items, lookup: "failed" };

    const best = new Map<number, ExternalAnswer>();
    for (const raw of rawItems as {
      answer_id?: unknown;
      question_id?: unknown;
      body?: unknown;
      score?: unknown;
      is_accepted?: unknown;
      creation_date?: unknown;
      owner?: { display_name?: unknown };
    }[]) {
      if (!raw || typeof raw !== "object") continue;
      if (typeof raw.answer_id !== "number" || typeof raw.question_id !== "number") {
        continue;
      }
      const excerpt = excerptFromHtml(raw.body, 240);
      if (!excerpt) continue;
      const answer: ExternalAnswer = {
        id: raw.answer_id,
        excerpt,
        author:
          raw.owner && typeof raw.owner.display_name === "string"
            ? decodeEntities(raw.owner.display_name).replace(/\s+/g, " ").trim().slice(0, 80) || null
            : null,
        score:
          typeof raw.score === "number" && Number.isFinite(raw.score)
            ? Math.trunc(raw.score)
            : 0,
        accepted: raw.is_accepted === true,
        createdAt: toIsoDate(raw.creation_date),
      };

      const existing = best.get(raw.question_id);
      if (!existing) {
        best.set(raw.question_id, answer);
        continue;
      }
      const answerWins =
        (!existing.accepted && answer.accepted) ||
        (existing.accepted === answer.accepted && answer.score > existing.score);
      if (answerWins) best.set(raw.question_id, answer);
    }

    return {
      items: items.map((item) => {
        const id = questionIdOf(item);
        const answer = id === null ? undefined : best.get(id);
        return answer ? { ...item, answer } : item;
      }),
      lookup: "ok",
    };
  } catch {
    return { items, lookup: "failed" };
  }
}

/**
 * The result shape for a request that deliberately did not call the provider, so
 * the default native feed costs no external quota.
 */
export function skippedExternalResult(): ExternalSearchResult {
  return result("skipped", [], new Date().toISOString(), null, false, "skipped");
}

/** A provider failure with a message that is safe to show to a reader. */
class ProviderRequestError extends Error {
  constructor(readonly userMessage: string) {
    super("provider request failed");
    this.name = "ProviderRequestError";
  }
}

/** One bounded API call. Throws `ProviderRequestError`; never returns garbage. */
async function requestProviderPage(
  query: string,
  limit: number,
  retrievedAt: string,
): Promise<{ items: ExternalExperience[]; backoff: number | null }> {
  const params = new URLSearchParams({
    order: "desc",
    sort: "relevance",
    q: query,
    site: "health",
    pagesize: String(limit),
    filter: "withbody",
  });

  const response = await fetch(
    `https://api.stackexchange.com/2.3/search/advanced?${params.toString()}`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (response.status === 429 || response.status === 503) {
    throw new ProviderRequestError(
      "The external question service is rate-limiting requests right now. Try again in a minute; the UltimateHealth community and the verified links below still work.",
    );
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      "The external question service did not answer successfully, so no external results are shown. The UltimateHealth community and the verified links below still work.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(
      "The external question service returned something that could not be read, so no external results are shown.",
    );
  }

  const parsed = parseItems(payload, retrievedAt);
  if (parsed === null) {
    throw new ProviderRequestError(
      "The external question service returned an unexpected response, so no external results are shown.",
    );
  }

  const backoff = (payload as { backoff?: unknown }).backoff;
  return {
    items: parsed.slice(0, limit),
    backoff: typeof backoff === "number" ? backoff : null,
  };
}

/**
 * Searches the one provider that supports an authorised search interface.
 *
 * Never throws. A failure disables the provider for a short backoff window and
 * returns `unavailable` with a message that is safe to show; the caller keeps the
 * native community and the verified link directory working.
 *
 * Concurrent identical searches share one in-flight request. Several components
 * can mount at once (a community page and its explorer, or a re-render before the
 * first response lands), and each of those would otherwise spend the provider's
 * anonymous quota on the same question.
 */
export async function searchExternalExperiences(input: {
  diseaseId: string;
  question: string;
  limit?: number;
}): Promise<ExternalSearchResult> {
  const key = `${input.diseaseId}::${buildProviderQuery(input.diseaseId, input.question)}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = runProviderSearch(input).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

/** One search, bounded by the cache, the backoff and at most two provider calls. */
async function runProviderSearch(input: {
  diseaseId: string;
  question: string;
  limit?: number;
}): Promise<ExternalSearchResult> {
  const retrievedAt = new Date().toISOString();
  const query = buildProviderQuery(input.diseaseId, input.question);

  if (!query) {
    return result(
      "unavailable",
      [],
      retrievedAt,
      "This condition has no configured search terms yet, so no external search was run.",
      false,
    );
  }

  const key = `${input.diseaseId}::${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ...hit.result, cached: true };
  }

  if (Date.now() < providerDisabledUntil) {
    return result(
      "unavailable",
      [],
      retrievedAt,
      lastFailure ??
        "The external question service is temporarily unavailable. The UltimateHealth community and the verified links below still work.",
      false,
    );
  }

  const limit = Math.min(Math.max(input.limit ?? 6, 1), 10);
  const diseaseTerm = DISEASE_QUERY[input.diseaseId] ?? "";

  /*
   * The provider ranks by relevance across the words rather than requiring all of
   * them, so the question-specific query is asked first. If it yields fewer than
   * three relevant results, the condition alone is asked once more and the two
   * sets are merged without duplicates. That is two bounded requests at most; it
   * never loops, and a provider that is already failing is not asked again until
   * its backoff expires.
   */
  try {
    const primary = await requestProviderPage(query, limit, retrievedAt);
    if (typeof primary.backoff === "number" && primary.backoff > 0) {
      providerDisabledUntil = Date.now() + Math.min(primary.backoff, 120) * 1000;
    }

    let items = primary.items.filter((item) => matchesDisease(item, input.diseaseId));

    if (items.length < 3 && diseaseTerm && query !== diseaseTerm) {
      try {
        const broad = await requestProviderPage(diseaseTerm, limit, retrievedAt);
        if (typeof broad.backoff === "number" && broad.backoff > 0) {
          providerDisabledUntil = Date.now() + Math.min(broad.backoff, 120) * 1000;
        }
        const seen = new Set(items.map((item) => item.id));
        for (const item of broad.items) {
          if (seen.has(item.id)) continue;
          if (!matchesDisease(item, input.diseaseId)) continue;
          items.push(item);
        }
      } catch {
        // The first response is real and relevant; a failed broader attempt must
        // not throw it away. The interface shows what was actually retrieved.
      }
    }    items = items.slice(0, limit);

    const withAnswers = await attachAnswers(items);
    items = withAnswers.items;

    const answer = items.length === 0
        ? result(
            "empty",
            [],
            retrievedAt,
            "No public questions matching this were returned by the external service. That does not mean nobody has the experience; it means nothing matched this search.",
            false,
            "skipped",
          )
        : result("ok", items, retrievedAt, null, false, withAnswers.lookup);

    cache.set(key, { at: Date.now(), result: answer });
    if (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }

    return answer;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      providerDisabledUntil = Date.now() + FAILURE_BACKOFF_MS;
      lastFailure = error.userMessage;
      return result("unavailable", [], retrievedAt, lastFailure, false);
    }
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    providerDisabledUntil = Date.now() + FAILURE_BACKOFF_MS;
    lastFailure = timedOut
      ? "The external question service did not respond in time, so no external results are shown. The UltimateHealth community and the verified links below still work."
      : "The external question service could not be reached, so no external results are shown. The UltimateHealth community and the verified links below still work.";
    return result("unavailable", [], retrievedAt, lastFailure, false);
  }
}

export type VerifiedFallback = {
  name: string;
  platform: string;
  url: string;
  kind: string;
  accessNote: string | null;
  checkedOn: string;
};

/** Verified destinations for a disease, used when search is unavailable. */
export function verifiedFallbacks(diseaseId: string): VerifiedFallback[] {
  return externalResourcesFor(diseaseId)
    .filter((resource) => isSafeOutboundUrl(resource.url))
    .map((resource) => ({
      name: resource.name,
      platform: resource.platform,
      url: resource.url,
      kind: resource.kind,
      accessNote: resource.accessNote,
      checkedOn: resource.checkedOn,
    }));
}

/**
 * The same directory keyed by disease, so a page can hand the explorer its
 * fallback destinations without a second request. Only verified entries are
 * included; a disease with none gets an empty list and the interface says so.
 */
export function verifiedFallbacksByDisease(): Record<string, VerifiedFallback[]> {
  const byDisease: Record<string, VerifiedFallback[]> = {};
  for (const disease of DISEASES) {
    byDisease[disease.id] = verifiedFallbacks(disease.id);
  }
  return byDisease;
}
