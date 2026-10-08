const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Beyond this, a relative label stops being informative and a date is shown instead. */
const RELATIVE_LIMIT = 4 * WEEK;
const UNKNOWN = "Unknown time";

const shortDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Compact relative label for feed rows: "just now", "4m ago", "3h ago",
 * "2d ago", "3w ago", then a short date. `now` is in milliseconds so it can
 * be shared across rows and pinned in tests.
 */
export function formatRelativeTime(epochSeconds: number, now = Date.now()): string {
  if (!Number.isFinite(epochSeconds)) return UNKNOWN;
  const elapsed = Math.floor(now / 1000) - Math.floor(epochSeconds);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;
  if (elapsed < RELATIVE_LIMIT) return `${Math.floor(elapsed / WEEK)}w ago`;
  return shortDate.format(new Date(epochSeconds * 1000));
}

/** Full local date and time, used for titles beside relative labels. */
export function formatDateTime(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds)) return UNKNOWN;
  return dateTime.format(new Date(epochSeconds * 1000));
}
