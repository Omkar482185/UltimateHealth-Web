import { NextResponse } from "next/server";

import { clientKey, isSameOriginRequest, rateLimit, redactError } from "@/lib/api-guard";
import { isDiseaseId, getDisease, topicLabel } from "@/lib/community/diseases";
import {
  experienceTopicForNativeTopic,
  isExperienceTopicId,
  type ExperienceTopicId,
} from "@/lib/community/experience-topics";
import {
  searchExternalExperiences,
  skippedExternalResult,
  verifiedFallbacks,
} from "@/lib/community/experience-search";
import { jsonError, noStore } from "@/lib/community/http";
import { listPosts } from "@/lib/community/store";

const QUESTION_MAX = 200;

/**
 * Question-to-experience discovery for one disease community.
 *
 * POST rather than GET because the body carries the reader's question. A health
 * question in a query string would be written to access logs and browser history
 * before anything else happened; in a JSON body it is not part of the URL. The
 * response is `no-store` for the same reason.
 *
 * Returns two deliberately separate result sets: discussions actually stored by
 * UltimateHealth, and questions retrieved from the one external provider that
 * permits an authorised search. The external set carries its own status so a
 * provider failure is visible as a failure and never as an empty success. No
 * result is invented to fill the page.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("Cross-origin requests are not accepted.", 403);
  }

  const limit = rateLimit(`community:discover:${clientKey(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many searches. Try again in ${limit.retryAfterSeconds} seconds.`,
        kind: "rate-limited",
      },
      noStore({
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400, { kind: "invalid-body" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError("The request body must be a JSON object.", 400, {
      kind: "invalid-body",
    });
  }

  const raw = payload as {
    disease?: unknown;
    q?: unknown;
    topic?: unknown;
    includeExternal?: unknown;
  };

  if (!isDiseaseId(raw.disease)) {
    return jsonError("Choose a disease community before searching.", 400, {
      kind: "invalid-disease",
    });
  }
  const disease = getDisease(raw.disease);
  if (!disease) {
    return jsonError("That disease community does not exist.", 404);
  }

  if (raw.q !== undefined && typeof raw.q !== "string") {
    return jsonError("The search text must be a string.", 400, { kind: "invalid-question" });
  }
  const question = (raw.q ?? "").trim().slice(0, QUESTION_MAX);

  if (raw.topic !== undefined && raw.topic !== null && raw.topic !== "all") {
    if (!isExperienceTopicId(raw.topic)) {
      return jsonError("That experience topic is not recognised.", 400, {
        kind: "invalid-topic",
      });
    }
  }
  const topic: ExperienceTopicId | null =
    typeof raw.topic === "string" && raw.topic !== "all" && isExperienceTopicId(raw.topic)
      ? raw.topic
      : null;

  let native: {
    id: number;
    title: string;
    excerpt: string;
    url: string;
    topicLabel: string;
    experienceTopic: string | null;
    authorName: string;
    createdAt: string;
    lastActivityAt: string;
    commentCount: number;
    reactionCount: number;
  }[] = [];

  try {
    const posts = listPosts({
      diseaseId: disease.id,
      query: question || undefined,
      sort: "recent",
      limit: 40,
    });
    native = posts
      .map((post) => ({
        id: post.id,
        title: post.title,
        excerpt: post.excerpt,
        url: `/community/${post.diseaseId}/${post.id}`,
        topicLabel: topicLabel(post.diseaseId, post.topicId),
        experienceTopic: experienceTopicForNativeTopic(post.topicId),
        authorName: post.authorName,
        createdAt: post.createdAt,
        lastActivityAt: post.lastActivityAt,
        commentCount: post.commentCount,
        reactionCount: post.reactionCount,
      }))
      .filter((post) => !topic || post.experienceTopic === topic)
      .slice(0, 24);
  } catch (error) {
    console.error("community discover: native search failed:", redactError(error));
    return jsonError(
      "The UltimateHealth discussions could not be searched just now. The external search and the verified links are still available.",
      500,
      { kind: "native-search-failed" },
    );
  }

  /*
   * External questions are included by default, so opening a disease community
   * attempts discovery without making the reader search first. `includeExternal:
   * false` is the explicit opt-out for callers that want stored discussions only.
   * Repeated calls are cheap: the provider result is cached per disease and query
   * for ten minutes, concurrent identical calls are deduplicated, and a failed
   * provider is backed off before it is asked again.
   */
  const external =
    raw.includeExternal === false
      ? skippedExternalResult()
      : await searchExternalExperiences({
          diseaseId: disease.id,
          question,
          limit: 6,
        });

  return NextResponse.json(
    {
      disease: { id: disease.id, name: disease.name, shortName: disease.shortName },
      question,
      topic,
      native,
      external,
      fallbacks: verifiedFallbacks(disease.id),
      retrievedAt: new Date().toISOString(),
    },
    noStore(),
  );
}
