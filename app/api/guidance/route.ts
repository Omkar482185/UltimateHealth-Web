import { NextResponse } from "next/server";
import { z } from "zod";

import {
  clientKey,
  INTERNAL_ERROR_BODY,
  isSameOriginRequest,
  rateLimit,
  redactError,
} from "@/lib/api-guard";
import { buildGuidance, SYMPTOM_OPTIONS } from "@/lib/rag/guidance";
import { FOLLOW_UP_QUESTIONS } from "@/lib/rag/guidance-content";
import { SAFETY_RULES } from "@/lib/rag/safety";


const validSymptomIds = SYMPTOM_OPTIONS.map((o) => o.id) as [string, ...string[]];
const validEmergencyIds = SAFETY_RULES.map((r) => r.id) as [string, ...string[]];
const validFollowUpIds = FOLLOW_UP_QUESTIONS.map((q) => q.id) as [
  string,
  ...string[],
];

const RequestBody = z.object({
  symptomIds: z.array(z.enum(validSymptomIds)).max(20),
  /**
   * Yes-answers from the first step. Validated against the rule table, so the
   * client cannot introduce its own wording into the emergency screen.
   */
  emergencySignIds: z.array(z.enum(validEmergencyIds)).max(20).optional(),
  /**
   * Answers to the clarifying questions, addressed by question id. The id set is the
   * question table, so a caller cannot invent a question, and the answer is one of
   * three fixed values rather than text, so there is nothing to inject. `unknown` is a
   * first-class answer rather than a missing one: it records that the person could not
   * say, and it is never read as a no.
   *
   * An id that does not follow from the submitted symptoms is still accepted. It can
   * only add an escalation, which is the safe direction, and refusing it would make
   * the form fail when someone edits their symptoms after answering.
   */
  followUpResponses: z
    .array(
      z.object({
        id: z.enum(validFollowUpIds),
        answer: z.enum(["yes", "no", "unknown"]),
      }),
    )
    .max(20)
    .optional(),
  readingText: z.string().trim().max(60).optional(),
  duration: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(600).optional(),
  // Where the reading was taken decides which threshold applies, so it is part
  // of the request rather than inferred from free text.
  measuredAt: z.enum(["clinic", "home", "unknown"]).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  }

  const limit = rateLimit(`guidance:${clientKey(request)}`, 15, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Too many submissions in a short period. Try again in ${limit.retryAfterSeconds} seconds.`,
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
        error: "Some of the submitted values were not valid.",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  if (
    parsed.data.symptomIds.length === 0 &&
    !parsed.data.readingText &&
    (parsed.data.emergencySignIds?.length ?? 0) === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Select at least one symptom or enter a blood pressure reading so there is something to assess.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await buildGuidance(parsed.data);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Previously this returned `error.message` straight to the browser. This route
    // reaches the retrieval layer and the provider, so that message could name a
    // file path, a model or a request payload, and a person who has just typed
    // their symptoms is the last person who should be shown it. The redacted form
    // goes to the log; the caller gets a fixed sentence.
    console.error("[guidance] unexpected failure:", redactError(error));
    return NextResponse.json(INTERNAL_ERROR_BODY, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
