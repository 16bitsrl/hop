/**
 * Links that arrive from outside: the Android share sheet (`/links?share=<url>`, sometimes with the
 * address inside `text`) and the bookmarklet (`/links?url=<url>`).
 */

const KEY = "hop-pending-share";

/** The first web address found in what was shared, or null. */
export function sharedUrl(search: { share?: string; url?: string; text?: string }): string | null {
  for (const value of [search.share, search.url, search.text]) {
    const match = value?.match(/https?:\/\/[^\s<>"']+/i);
    if (match) return match[0];
  }
  return null;
}

/** Keeps a shared link across the sign-in page. */
export function rememberShared(search: { share?: string; url?: string; text?: string }) {
  const url = sharedUrl(search);
  if (url) sessionStorage.setItem(KEY, url);
}

/** Takes (and forgets) the link kept before sign-in. */
export function takeRememberedShared(): string | null {
  const url = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return url;
}

/** The bookmarklet: sends the current page to hop's create dialog. */
export function bookmarklet(origin: string): string {
  return `javascript:(function(){window.open(${JSON.stringify(`${origin}/links?url=`)}+encodeURIComponent(location.href),"_blank")})()`;
}
