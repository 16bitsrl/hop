/** Joins class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Date and time in the current language, e.g. "1 Nov 2026, 14:05". */
export function formatDateTime(value: string | number | Date, locale?: string): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | number | Date, locale?: string): string {
  return new Date(value).toLocaleDateString(locale, { dateStyle: "medium" });
}
