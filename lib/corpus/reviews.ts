/**
 * Source governance: review status and staleness.
 *
 * Pure and dependency-free, so it is usable from a server component, a client
 * component and a script with identical behaviour. It reads a JSON ledger that
 * lives in version control (`source-reviews.json`), which is deliberate: a review
 * record is a governance artefact, not user data, and its audit trail is the git
 * history behind it. Every entry therefore has a commit and a date.
 *
 * The module holds one line that must not be crossed. A review record is a claim
 * made by the operator about a named reviewer. This software does not verify that
 * the person is qualified, has read the document, or exists. So nothing here
 * reports a document as "clinically approved": the wording says a review was
 * *recorded*, names who recorded it and when, and states plainly that no clinical
 * validation of this platform has been performed.
 *
 * A review covers one content revision, identified by its SHA-256. If a document
 * is re-fetched and its extracted text changes, the hash changes and the review is
 * reported as no longer covering the text rather than silently continuing to
 * appear valid.
 */
import ledger from "@/lib/corpus/source-reviews.json";

export type ReviewDecision = "approved-for-education" | "changes-requested";

export type SourceReview = {
  sourceId: string;
  /** The name of the person who made the decision. Never invented. */
  reviewerName: string;
  /** Their stated qualification, recorded verbatim and not checked. */
  reviewerCredential: string;
  decision: ReviewDecision;
  note: string | null;
  reviewedAt: string;
  /** SHA-256 of the extracted text this decision was made against. */
  contentSha256: string;
};

export type ReviewStatus = "not-reviewed" | "current" | "superseded";

export type ReviewOutcome = {
  status: ReviewStatus;
  label: string;
  /** Shown under the label. Explains the limits of what the record proves. */
  detail: string;
  /** The review that still covers the current text, when there is one. */
  covering: SourceReview | null;
  /** The most recent review for this source, even when it no longer covers it. */
  latest: SourceReview | null;
};

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  "approved-for-education": "Approved for educational use",
  "changes-requested": "Changes requested",
};

/**
 * How old a retrieved copy may be before it is flagged as worth re-checking.
 *
 * A policy choice, not a fact. Publishers change pages without notice, so any
 * threshold is arbitrary; 180 days is chosen so that a document is flagged within
 * a review cycle rather than at some semantically meaningful moment.
 */
export const STALENESS_THRESHOLD_DAYS = 180;

const LEDGER_NOTE =
  "This record was entered by the operator of this deployment and names the person who made the decision. The software does not verify that credential and cannot confirm the review took place. It covers only the content revision identified by the hash below; if the text changes, this record stops covering it.";

export function listReviews(): SourceReview[] {
  return (ledger.reviews ?? []) as SourceReview[];
}

/** All reviews for one source, newest first. */
export function reviewsForSource(sourceId: string): SourceReview[] {
  return reviewsFor(listReviews(), sourceId);
}

/** All reviews for one source from a supplied list, newest first. */
export function reviewsFor(reviews: SourceReview[], sourceId: string): SourceReview[] {
  return reviews
    .filter((review) => review.sourceId === sourceId)
    .slice()
    .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));
}

/**
 * Resolves the review position for one document at one content revision.
 *
 * `status` is `current` only when the newest review was made against exactly the
 * hash the document has now. Anything else is `superseded`, including a review
 * that exists for a revision the corpus no longer holds.
 */
export function reviewFor(sourceId: string, currentSha256: string): ReviewOutcome {
  return resolveReview(listReviews(), sourceId, currentSha256);
}

/**
 * The same resolution over a supplied ledger, so the decision table can be
 * checked directly instead of by writing to the real ledger file.
 */
export function resolveReview(
  reviews: SourceReview[],
  sourceId: string,
  currentSha256: string,
): ReviewOutcome {
  const forSource = reviewsFor(reviews, sourceId);
  const latest = forSource[0] ?? null;

  if (!latest) {
    return {
      status: "not-reviewed",
      label: "Not clinically reviewed",
      detail:
        "No qualified clinical reviewer has reviewed this document. The platform has not been clinically validated, and nothing here should be read as clinical endorsement.",
      covering: null,
      latest: null,
    };
  }

  const covers = latest.contentSha256 === currentSha256;

  if (!covers) {
    return {
      status: "superseded",
      label: "Review recorded, but it no longer covers this text",
      detail: `${latest.reviewerName} made a decision on ${formatDate(latest.reviewedAt)} against an earlier revision of this document. The text held here has changed since, so that decision does not apply to what you are reading. The document is treated as unreviewed until the review is repeated. ${LEDGER_NOTE}`,
      covering: null,
      latest,
    };
  }

  return {
    status: "current",
    label:
      latest.decision === "approved-for-education"
        ? `Review recorded: ${REVIEW_DECISION_LABELS[latest.decision].toLowerCase()}`
        : "Review recorded: changes requested",
    detail: LEDGER_NOTE,
    covering: latest,
    latest,
  };
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export type Staleness = {
  /** Whole days since the copy was retrieved. Negative is clamped to 0. */
  days: number;
  stale: boolean;
  label: string;
};

/**
 * How old the indexed copy is.
 *
 * Age is computed against the copy actually held, which is the only date this
 * platform knows. It says nothing about when the publisher last edited the page,
 * because the corpus does not record that and guessing it would be inventing a
 * fact.
 */
export function staleness(
  retrievedAtIso: string,
  now: Date = new Date(),
  thresholdDays: number = STALENESS_THRESHOLD_DAYS,
): Staleness {
  const retrieved = Date.parse(retrievedAtIso);
  if (!Number.isFinite(retrieved)) {
    return { days: 0, stale: false, label: "Retrieval date unreadable" };
  }
  const days = Math.max(0, Math.floor((now.getTime() - retrieved) / 86_400_000));
  const stale = days > thresholdDays;
  return {
    days,
    stale,
    label: stale
      ? `Retrieved ${days} days ago, which is longer than the ${thresholdDays}-day re-check window`
      : `Retrieved ${days} ${days === 1 ? "day" : "days"} ago`,
  };
}
