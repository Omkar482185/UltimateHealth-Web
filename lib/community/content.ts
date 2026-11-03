/**
 * Validation and the small set of automated safety rules for community content.
 *
 * These rules are intentionally modest and explainable. They are not a spam
 * classifier and they are not moderation: they stop the obvious mechanical
 * problems (empty posts, essays, lists of contact details, link dumps) and leave
 * judgement calls to a person reviewing a report. Anything that is refused names
 * the rule that refused it, so an author can fix it rather than guess.
 *
 * This module is imported by client components for the same constants the server
 * enforces, so it must stay free of database and Node imports.
 */

export const TITLE_MIN = 8;
export const TITLE_MAX = 120;
export const BODY_MIN = 20;
export const BODY_MAX = 4000;
export const COMMENT_MIN = 2;
export const COMMENT_MAX = 2000;
export const REPORT_DETAIL_MAX = 500;
export const MAX_LINKS = 2;

/** Reasons a reader can pick when reporting. Ids are stored; labels are shown. */
export const REPORT_REASONS = [
  {
    id: "harassment",
    label: "Harassment or a personal attack",
    hint: "Insults, threats, or targeting someone.",
  },
  {
    id: "spam",
    label: "Spam, advertising or a scam",
    hint: "Promotion, repeated posting, or a request for money.",
  },
  {
    id: "personal-information",
    label: "Someone's personal information",
    hint: "A phone number, address, email, or identifying detail.",
  },
  {
    id: "unsafe-medical-advice",
    label: "Unsafe medical advice",
    hint: "Instructions that could cause harm, such as stopping a prescribed medicine.",
  },
  {
    id: "other",
    label: "Something else",
    hint: "Tell us briefly what is wrong.",
  },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]["id"];

export function isReportReason(value: unknown): value is ReportReasonId {
  return (
    typeof value === "string" &&
    REPORT_REASONS.some((reason) => reason.id === value)
  );
}

export function reportReasonLabel(id: string): string {
  return REPORT_REASONS.find((reason) => reason.id === id)?.label ?? id;
}

/**
 * The house rules, in the order they matter. Kept here rather than in a page so
 * the same wording appears beside the composer, on the thread page, and in the
 * dedicated guidelines page.
 */
export const GUIDELINES = [
  {
    title: "Share experience, not instructions",
    body: "Describe what happened to you and what helped. Do not tell someone to start, stop, or change a medicine, and do not present one recovery story as a proven treatment.",
  },
  {
    title: "Keep it kind and specific",
    body: "Disagree with the idea, not the person. No harassment, discrimination, or pressure. Assume the person reading is having a hard day.",
  },
  {
    title: "Protect privacy, including your own",
    body: "Do not post phone numbers, home addresses, email addresses, workplace details, or anyone else's health information. Use first names or pseudonyms.",
  },
  {
    title: "No selling, recruiting or fundraising",
    body: "Commercial promotion, repeated links, miracle cures, and requests for money are removed. Sharing one relevant public resource is fine.",
  },
  {
    title: "This is not an emergency service",
    body: "If someone describes a medical emergency, contact emergency services rather than waiting for a reply here. Posts are not monitored around the clock.",
  },
  {
    title: "Reports are reviewed by a person",
    body: "Report content that breaks these rules. A moderator can remove a post or comment; the author can always edit or delete their own words.",
  },
] as const;

/**
 * Normalises line endings, removes control characters that would corrupt a
 * rendered page, and trims surrounding whitespace. Deliberately does not strip
 * markdown or HTML: text is rendered as text, never as markup, so there is
 * nothing to sanitise for the browser.
 */
export function normaliseContent(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A rough e-mail shape. Addresses are refused because they are personal data. */
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * A run of digits that looks like a phone number rather than a measurement.
 * Nine or more digits is the threshold: "120/80" and "2 tablets" stay allowed,
 * "+91 98765 43210" does not.
 */
function looksLikePhoneNumber(text: string): boolean {
  const candidates = text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  return candidates.some(
    (candidate) => (candidate.match(/\d/g) ?? []).length >= 9,
  );
}

function countLinks(text: string): number {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}

export type ContentCheck =
  | { ok: true; title: string; body: string }
  | { ok: false; issues: string[] };

/**
 * Validates a post. Every issue is returned at once so the author does not fix
 * one problem only to discover the next on the following submission.
 */
export function validatePost(input: {
  title: unknown;
  body: unknown;
}): ContentCheck {
  const issues: string[] = [];

  const title = typeof input.title === "string" ? normaliseContent(input.title) : "";
  const body = typeof input.body === "string" ? normaliseContent(input.body) : "";

  if (title.length < TITLE_MIN) {
    issues.push(`Give the discussion a title of at least ${TITLE_MIN} characters.`);
  }
  if (title.length > TITLE_MAX) {
    issues.push(`Keep the title to ${TITLE_MAX} characters or fewer.`);
  }
  if (body.length < BODY_MIN) {
    issues.push(`Write at least ${BODY_MIN} characters so there is something to reply to.`);
  }
  if (body.length > BODY_MAX) {
    issues.push(`Keep the post to ${BODY_MAX} characters or fewer.`);
  }

  const combined = `${title}\n${body}`;
  if (EMAIL_PATTERN.test(combined) || looksLikePhoneNumber(combined)) {
    issues.push(
      "Remove email addresses and phone numbers. Contact details are personal information and are not allowed in a public post.",
    );
  }
  if (countLinks(combined) > MAX_LINKS) {
    issues.push(`Include at most ${MAX_LINKS} links. Link dumps are removed as spam.`);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, title, body };
}

export type CommentCheck =
  | { ok: true; body: string }
  | { ok: false; issues: string[] };

export function validateComment(input: { body: unknown }): CommentCheck {
  const issues: string[] = [];
  const body = typeof input.body === "string" ? normaliseContent(input.body) : "";

  if (body.length < COMMENT_MIN) {
    issues.push("Write a short reply before sending.");
  }
  if (body.length > COMMENT_MAX) {
    issues.push(`Keep the reply to ${COMMENT_MAX} characters or fewer.`);
  }
  if (EMAIL_PATTERN.test(body) || looksLikePhoneNumber(body)) {
    issues.push(
      "Remove email addresses and phone numbers. Contact details are personal information and are not allowed in a public reply.",
    );
  }
  if (countLinks(body) > MAX_LINKS) {
    issues.push(`Include at most ${MAX_LINKS} links in a reply.`);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, body };
}

export function validateReportDetail(input: unknown): string | null {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string") return null;
  return normaliseContent(input).slice(0, REPORT_DETAIL_MAX) || null;
}

/**
 * A stable public name. The profile display name is used when the person set
 * one; otherwise this pseudonym is derived from the account id. Neither the
 * email address nor any health profile field is ever part of it.
 */
export function publicDisplayName(
  displayName: string | null | undefined,
  userId: number,
): string {
  const cleaned = normaliseContent(displayName ?? "").slice(0, 40);
  if (cleaned.length > 0) return cleaned;
  return `Member ${userId.toString(36).toUpperCase().padStart(3, "0")}`;
}
