/** Joins class names, skipping falsy values; later Tailwind classes win over earlier ones. */
export { cn } from "./utils";

/** Date and time in the current language, e.g. "1 Nov 2026, 14:05". */
export function formatDateTime(value: string | number | Date, locale?: string): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | number | Date, locale?: string): string {
  return new Date(value).toLocaleDateString(locale, { dateStyle: "medium" });
}
