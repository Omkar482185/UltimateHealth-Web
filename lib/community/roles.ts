/**
 * Moderator authorisation.
 *
 * There is no self-service way to become a moderator, and no moderator flag in
 * the profile that a user could set. The allowlist is server configuration:
 *
 *   COMMUNITY_MODERATOR_EMAILS=moderator@example.org,second@example.org
 *
 * When the variable is unset, nobody is a moderator and the report queue is
 * closed. That is the safe default: a deployment should not inherit a moderator
 * because someone happened to register first.
 *
 * The comparison is against the account email in the server-side session, never
 * against a value from the request or the rendered page.
 */

export function moderatorEmails(): string[] {
  const raw = process.env.COMMUNITY_MODERATOR_EMAILS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@"));
}

export function isModerator(email: string | null | undefined): boolean {
  if (!email) return false;
  return moderatorEmails().includes(email.trim().toLowerCase());
}

/** Shown on the moderation page when no allowlist is configured. */
export function moderationConfigured(): boolean {
  return moderatorEmails().length > 0;
}
