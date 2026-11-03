/**
 * Date formatting for community content.
 *
 * Absolute dates are used rather than "3 hours ago" so a reader can tell when
 * something was written without depending on the server's clock or a relative
 * label that changes as the page is cached. The full timestamp is kept in the
 * `title`/`dateTime` attributes for anyone who needs it.
 *
 * Safe to import from client components: no database or Node imports.
 */

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/*
 * A date without a time (the verification date in the external directory) is a
 * calendar date, not an instant. Formatting it in the server's timezone would
 * move it a day backwards for readers west of UTC, so date-only values are
 * formatted in UTC.
 */
const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const ms = Date.parse(`${iso}T00:00:00Z`);
    return Number.isFinite(ms) ? DATE_ONLY.format(new Date(ms)) : iso;
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? DATE.format(new Date(ms)) : iso.slice(0, 10);
}

export function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? DATE_TIME.format(new Date(ms)) : iso;
}
