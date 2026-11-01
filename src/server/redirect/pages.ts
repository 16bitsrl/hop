/** Built-in end-user pages. Tiny, inline CSS, dark mode, English and Italian. */

export type Lang = "en" | "it";

export function pickLang(acceptLanguage: string | null | undefined): Lang {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag.startsWith("it")) return "it";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const T = {
  en: {
    landingTitle: "Short links",
    landingText: "Nothing to see here. If someone sent you a link, check that it is complete.",
    notFoundTitle: "Link not found",
    notFoundText: "This link does not exist or is no longer available. Check the address and try again.",
    expiredTitle: "This link has expired",
    expiredText: "It is no longer active. Ask the person who sent it for a new one.",
    passwordTitle: "This link is protected",
    passwordText: "Enter the password to continue.",
    passwordLabel: "Password",
    passwordButton: "Continue",
    passwordError: "That password is not correct. Try again.",
    passwordLocked: "Too many attempts. Please wait a few minutes and try again.",
    openingTitle: "Opening the app",
    openingText: "If nothing happens, we will take you to the website.",
    openingLink: "Go to the website",
    redirecting: "Redirecting",
    redirectingLink: "Continue",
  },
  it: {
    landingTitle: "Link brevi",
    landingText: "Qui non c'è nulla da vedere. Se qualcuno ti ha mandato un link, controlla che sia completo.",
    notFoundTitle: "Link non trovato",
    notFoundText: "Questo link non esiste o non è più disponibile. Controlla l'indirizzo e riprova.",
    expiredTitle: "Questo link è scaduto",
    expiredText: "Non è più attivo. Chiedi a chi te l'ha inviato un link nuovo.",
    passwordTitle: "Questo link è protetto",
    passwordText: "Inserisci la password per continuare.",
    passwordLabel: "Password",
    passwordButton: "Continua",
    passwordError: "La password non è corretta. Riprova.",
    passwordLocked: "Troppi tentativi. Aspetta qualche minuto e riprova.",
    openingTitle: "Apertura dell'app",
    openingText: "Se non succede nulla, ti portiamo al sito web.",
    openingLink: "Vai al sito web",
    redirecting: "Reindirizzamento",
    redirectingLink: "Continua",
  },
} as const;

const CSS = `
:root{color-scheme:light dark;--bg:#f7f7f5;--fg:#1b1b19;--muted:#6b6a64;--card:#fff;--line:#e4e3de;--accent:#0f7a5c;--accent-fg:#fff;--err:#c2362b}
@media(prefers-color-scheme:dark){:root{--bg:#0d0d0c;--fg:#ecebe7;--muted:#9a988f;--card:#151514;--line:#292927;--accent:#3cc596;--accent-fg:#06150f;--err:#f0746a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:1.5rem;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:2rem;text-align:center}
@media(max-width:420px){main{padding:1.5rem 1.25rem}}
h1{margin:0 0 .5rem;font-size:1.25rem;letter-spacing:-.01em}
p{margin:0 0 1rem;color:var(--muted)}
a{color:var(--accent)}
form{display:grid;gap:.75rem;text-align:left}
label{font-size:.875rem;font-weight:600}
input{width:100%;min-height:2.75rem;padding:.65rem .75rem;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
button{min-height:2.75rem;padding:.65rem;border:0;border-radius:8px;background:var(--accent);color:var(--accent-fg);font:inherit;font-weight:600;cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.err{color:var(--err);font-size:.875rem;margin:0}
`;

function shell(lang: Lang, title: string, body: string, head: string, nonce: string): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>${head}<style nonce="${nonce}">${CSS}</style></head><body><main>${body}</main></body></html>`;
}

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * A built-in page. Its one style block (and script, when it has one) carries a fresh nonce and the
 * policy allows nothing else, so injected markup cannot run or restyle anything.
 */
function page(
  lang: Lang,
  title: string,
  body: string | ((nonce: string) => string),
  opts: { status?: number; extra?: Record<string, string>; head?: string; script?: boolean } = {},
): Response {
  const nonce = newNonce();
  const html = shell(lang, title, typeof body === "function" ? body(nonce) : body, opts.head ?? "", nonce);
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    ...(opts.script ? [`script-src 'nonce-${nonce}'`] : []),
    // No form-action: the password form is answered by a redirect to the destination, which Chrome
    // would check against it and block.
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return new Response(html, { status: opts.status ?? 200, headers: { ...HEADERS, "content-security-policy": csp, ...opts.extra } });
}

function simple(lang: Lang, title: string, text: string, status: number, cache = "no-store"): Response {
  return page(lang, title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`, { status, extra: { "cache-control": cache } });
}

export const landingPage = (lang: Lang) => simple(lang, T[lang].landingTitle, T[lang].landingText, 200);
export const notFoundPage = (lang: Lang) => simple(lang, T[lang].notFoundTitle, T[lang].notFoundText, 404);
export const expiredPage = (lang: Lang) => simple(lang, T[lang].expiredTitle, T[lang].expiredText, 410);

export function passwordPage(lang: Lang, error: boolean | "locked", retryAfter = 0): Response {
  const t = T[lang];
  if (error === "locked") {
    const body = `<h1>${t.passwordTitle}</h1><p class="err" role="alert">${t.passwordLocked}</p>`;
    return page(lang, t.passwordTitle, body, { status: 429, extra: { "cache-control": "no-store", "retry-after": String(retryAfter) } });
  }
  const body = `<h1>${t.passwordTitle}</h1><p>${t.passwordText}</p><form method="post">${
    error ? `<p class="err" role="alert">${t.passwordError}</p>` : ""
  }<label for="p">${t.passwordLabel}</label><input id="p" name="password" type="password" autocomplete="off" autofocus required><button type="submit">${t.passwordButton}</button></form>`;
  return page(lang, t.passwordTitle, body, { extra: { "cache-control": "no-store" } });
}

/** Tries the app URL, then falls back to the web URL after ~1.5 s. */
export function deepLinkPage(lang: Lang, appUrl: string, webUrl: string): Response {
  const t = T[lang];
  const body = (nonce: string) => `<h1>${t.openingTitle}</h1><p>${t.openingText}</p><p><a href="${esc(webUrl)}">${t.openingLink}</a></p>
<script nonce="${nonce}">(function(){var a=${jsString(appUrl)},w=${jsString(webUrl)};location.href=a;setTimeout(function(){location.replace(w)},1500)})()</script>`;
  return page(lang, t.openingTitle, body, { script: true, extra: { "cache-control": "private, max-age=0" } });
}

export interface PreviewData {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string;
}

/** Open Graph + Twitter card page for link-preview crawlers. */
export function previewPage(lang: Lang, d: PreviewData): Response {
  const title = d.title ?? d.url;
  const meta = (attr: string, name: string, value: string | null) =>
    value ? `<meta ${attr}="${name}" content="${esc(value)}">` : "";
  const head = [
    `<meta http-equiv="refresh" content="0;url=${esc(d.url)}">`,
    meta("property", "og:type", "website"),
    meta("property", "og:url", d.url),
    meta("property", "og:title", d.title),
    meta("property", "og:description", d.description),
    meta("property", "og:image", d.image),
    meta("name", "twitter:card", d.image ? "summary_large_image" : "summary"),
    meta("name", "twitter:title", d.title),
    meta("name", "twitter:description", d.description),
    meta("name", "twitter:image", d.image),
  ].join("");
  const body = `<h1>${esc(title)}</h1>${d.description ? `<p>${esc(d.description)}</p>` : ""}<p><a href="${esc(d.url)}">${T[lang].redirectingLink}</a></p>`;
  return page(lang, title, body, { head, extra: { "cache-control": "private, max-age=0" } });
}

/** JS string literal safe to embed inside an inline script. */
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
