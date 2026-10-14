/** Shared, locale-aware display formatters for the application surfaces. */

const mgaFormatter = new Intl.NumberFormat("fr-MG", {
  style: "currency",
  currency: "MGA",
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMga(value: number) {
  return mgaFormatter.format(value);
}

/** Short amount for chart labels, e.g. "1,2 M". */
export function formatCompact(value: number) {
  return compactFormatter.format(value);
}

export function formatCount(value: number) {
  return value.toLocaleString("fr-MG");
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)} %`;
}

/** "sept. 26" style month label from an ISO date (YYYY-MM-DD). */
export function formatMonthShort(isoDate: string) {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

/** "septembre 2026" style month label from an ISO date (YYYY-MM-DD). */
export function formatMonthLong(isoDate: string) {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatDateMedium(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-MG", { dateStyle: "medium" }).format(date);
}

/** Calendar date (YYYY-MM-DD) shown as-is, independent of the server time zone. */
export function formatDay(isoDate: string) {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;
  return new Intl.DateTimeFormat("fr-MG", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-MG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-MG", { timeStyle: "short" }).format(date);
}

/** Initials for avatars: "Hery Rakoto" → "HR". */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : parts[0]?.[1] ?? "";
  return `${first}${last}`.toUpperCase();
}

function parseIsoDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
