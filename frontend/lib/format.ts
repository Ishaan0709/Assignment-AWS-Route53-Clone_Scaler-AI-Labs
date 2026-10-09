/** Returns `count noun` with a naive English plural, e.g. "1 record", "3 records". */
export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : plural}`;
}

/** `example.com.` -> `example.com` (how the console displays zone and record names). */
export function displayName(fqdn: string): string {
  return fqdn.endsWith(".") ? fqdn.slice(0, -1) : fqdn;
}

/** `public` -> `Public`. */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** `-330` minutes offset -> `UTC+05:30`. */
export function utcOffsetLabel(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Consistent console date format: `Oct 9, 2026, 14:30 (UTC+05:30)`.
 * Accepts ISO strings (the backend emits naive UTC timestamps) or Date objects.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(ensureUtc(value)) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${datePart}, ${timePart} (${utcOffsetLabel(date)})`;
}

/** Backend timestamps have no zone designator; treat them as UTC. */
function ensureUtc(iso: string): string {
  return /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
}

/** Formats numbers with thousands separators, e.g. `1,234`. */
export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}
