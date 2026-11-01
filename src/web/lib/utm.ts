/** UTM parameters in a destination URL (D1). */

export const UTM_FIELDS = ["source", "medium", "campaign", "term", "content"] as const;
export type UtmField = (typeof UTM_FIELDS)[number];
export type Utm = Record<UtmField, string>;

export const emptyUtm = (): Utm => ({ source: "", medium: "", campaign: "", term: "", content: "" });

/** Reads utm_* parameters from the URL. Returns empty values when the URL is invalid. */
export function parseUtm(url: string): Utm {
  const out = emptyUtm();
  try {
    const params = new URL(url).searchParams;
    for (const f of UTM_FIELDS) out[f] = params.get(`utm_${f}`) ?? "";
  } catch {
    /* keep empty */
  }
  return out;
}

/** Writes the non-empty fields into the URL and removes the empty ones. Other parameters are untouched. */
export function applyUtm(url: string, utm: Utm): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  for (const f of UTM_FIELDS) {
    const value = utm[f].trim();
    if (value) u.searchParams.set(`utm_${f}`, value);
    else u.searchParams.delete(`utm_${f}`);
  }
  return u.toString();
}
