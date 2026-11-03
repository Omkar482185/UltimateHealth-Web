import { NextResponse } from "next/server";
import { z } from "zod";

import { clientKey, isSameOriginRequest, rateLimit, redactError } from "@/lib/api-guard";
import { EMBEDDING } from "@/lib/config";
import { TOPIC_IDS, isTopicId } from "@/lib/corpus/sources";
import { describeGeminiError } from "@/lib/gemini";
import { answerQuestion } from "@/lib/rag/generate";
import { CorpusMismatchError } from "@/lib/rag/retrieve";


const RequestBody = z.object({
  question: z.string().trim().min(4).max(500),
  topic: z.string().trim().max(60).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const limit = rateLimit(`assistant:${clientKey(request)}`, 12, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many questions in a short period. Try again in ${limit.retryAfterSeconds} seconds.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = RequestBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please enter a question between 4 and 500 characters.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  // A topic restricts retrieval, so an unrecognised one is rejected rather than
  // passed through: silently filtering on a topic that does not exist would turn
  // a typo into an abstention and look like a corpus gap.
  if (parsed.data.topic !== undefined && !isTopicId(parsed.data.topic)) {
    return NextResponse.json(
      {
        error: `Unknown topic. Valid topics are: ${TOPIC_IDS.join(", ")}.`,
        kind: "invalid-topic",
      },
      { status: 400 },
    );
  }

  try {
    const result = await answerQuestion(parsed.data.question, {
      topic: parsed.data.topic,
    });

    // A provider failure is reported inside a successful response rather than as a
    // status code, because the answer itself is real: the question reached retrieval,
    // evidence was found, and it is quoted in the body with its sources. Returning 503
    // here would throw away an answer the reader can use and tell them nothing about
    // it. The failure is still named, in `providerError`, and logged once below.
    if (result.providerError) {
      console.warn(
        `[assistant] answered from retrieval only (${result.providerError.kind})`,
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CorpusMismatchError) {
      console.error("[assistant] corpus mismatch:", error.message);
      return NextResponse.json(
        { error: error.message, kind: "corpus-mismatch" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    // Reaching here means retrieval itself failed, so there is no evidence to quote
    // and no honest answer to give. Generation failures never arrive here: they are
    // caught inside the pipeline and answered from the retrieved passages. What is
    // left is the embedding provider and the corpus, so the message and status are
    // about that dependency: an exhausted embedding quota is 429 and worth retrying;
    // an invalid key or a model the key cannot reach is 502 and needs a configuration
    // change. Nothing is mapped to a generic 503.
    const described = describeGeminiError(error, { model: EMBEDDING.geminiModel });
    // The log carries a redacted form only. The thrown object is deliberately not
    // logged: a provider error can embed the request it failed on, and that request
    // contains the reader's question.
    console.error(
      `[assistant] retrieval failure (${described.kind}/${described.httpStatus}):`,
      redactError(error),
    );
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    const retryAfter = described.retryAfterSeconds;
    if (retryAfter !== null && retryAfter > 0) {
      // The provider's own number, so a client backs off by the amount the provider
      // actually asked for instead of guessing.
      headers["Retry-After"] = String(retryAfter);
    }
    return NextResponse.json(
      { error: described.message, kind: described.kind },
      { status: described.httpStatus, headers },
    );
  }
}
