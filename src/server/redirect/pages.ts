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
    landingText: "Short links. Open one and you land straight on the right page.",
    landingHint: "Link not working? Check that you copied all of it.",
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
    landingText: "Link brevi: ne apri uno e arrivi subito alla pagina giusta.",
    landingHint: "Il link non funziona? Controlla di averlo copiato tutto.",
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

/** The app icon, inline: the page policy allows no images. Same drawing as public/icon.svg. */
const MARK = `<svg class="mark" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0f7a5c"/><g transform="translate(-8.18,2.32) scale(0.42) translate(0,1254) scale(0.1,-0.1)" fill="#fff" stroke="#fff" stroke-width="140" stroke-linejoin="round"><path d="M4180 9583 c-61 -22 -67 -100 -20 -246 78 -244 255 -444 560 -633 451 -280 619 -424 777 -666 60 -91 127 -227 118 -237 -2 -2 -64 52 -137 120 -476 442 -935 690 -1417 765 -220 35 -609 11 -721 -44 -64 -31 -47 -118 53 -274 196 -307 486 -466 1051 -578 203 -40 380 -91 482 -139 85 -40 174 -96 174 -110 0 -4 -35 -13 -77 -20 -241 -39 -521 -134 -708 -238 -850 -477 -1554 -1446 -1945 -2678 l-67 -210 -309 -6 c-249 -4 -318 -9 -357 -22 -219 -75 -368 -257 -392 -477 -24 -230 130 -436 360 -480 43 -8 246 -10 700 -8 l640 3 65 23 c232 83 384 283 397 523 15 265 -162 449 -431 449 -31 0 -56 2 -56 4 0 11 103 242 145 326 424 844 1068 1433 1725 1576 127 28 404 25 514 -4 396 -108 729 -430 997 -964 74 -148 157 -339 285 -657 209 -520 321 -720 504 -900 218 -216 480 -331 821 -361 156 -14 2892 -13 2977 0 296 48 503 320 449 592 -40 201 -165 342 -367 411 l-65 22 -1225 6 c-1202 5 -1227 6 -1311 26 -419 103 -693 365 -898 857 -39 94 -89 246 -185 566 -187 621 -379 984 -675 1281 -81 80 -248 220 -297 247 -9 5 -19 49 -29 122 -127 976 -632 1665 -1414 1935 -198 68 -613 127 -691 98z"/></g></svg>`;

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
body.landing{background:radial-gradient(60rem 30rem at 50% -10%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%),var(--bg)}
body.landing{grid-template-columns:minmax(0,1fr);justify-items:center}
.landing main{max-width:40rem;min-width:0;background:none;border:0;padding:0}
.mark{width:5.5rem;height:5.5rem;display:block;margin:0 auto 1.75rem;filter:drop-shadow(0 .6rem 1.2rem color-mix(in srgb,#0f7a5c 35%,transparent));animation:hop 2.8s cubic-bezier(.3,0,.3,1) infinite}
@keyframes hop{0%,55%,100%{transform:translateY(0) scale(1,1)}62%{transform:translateY(.15rem) scale(1.06,.94)}75%{transform:translateY(-.9rem) scale(.97,1.03)}88%{transform:translateY(0) scale(1.03,.97)}}
@media(prefers-reduced-motion:reduce){.mark{animation:none}}
.landing h1{font-size:clamp(2.25rem,9vw,3.5rem);line-height:1.05;letter-spacing:-.035em;margin:0 0 .75rem;font-weight:700}
.lead{font-size:1.125rem;margin:0 auto 2.5rem;max-width:26rem;text-wrap:balance}
.hint{text-wrap:balance}
.demo{display:flex;align-items:center;gap:.5rem;justify-content:center;margin:0 auto 2.5rem;font:500 .875rem/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.demo span{padding:.6rem .8rem;border-radius:999px;white-space:nowrap}
.short{background:var(--accent);color:var(--accent-fg);flex:none}
.long{background:var(--card);border:1px solid var(--line);color:var(--muted);min-width:0;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,#000 75%,transparent);mask-image:linear-gradient(90deg,#000 75%,transparent)}
.arc{width:3rem;height:1.5rem;flex:none;color:var(--accent);overflow:visible}
.hint{font-size:.875rem}
@media(max-width:520px){.demo{flex-direction:column}.arc{transform:rotate(90deg);margin:.25rem 0}.long{max-width:100%}}
`;

function shell(lang: Lang, title: string, body: string, head: string, nonce: string, bodyClass?: string): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>${head}<style nonce="${nonce}">${CSS}</style></head><body${bodyClass ? ` class="${bodyClass}"` : ""}><main>${body}</main></body></html>`;
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
  opts: { status?: number; extra?: Record<string, string>; head?: string; script?: boolean; bodyClass?: string } = {},
): Response {
  const nonce = newNonce();
  const html = shell(lang, title, typeof body === "function" ? body(nonce) : body, opts.head ?? "", nonce, opts.bodyClass);
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

/** What the bare short domain shows: its name, the mark, and a short link landing on a long one. */
export function landingPage(lang: Lang, host: string): Response {
  const t = T[lang];
  const body = `${MARK}<h1>${esc(host)}</h1><p class="lead">${t.landingText}</p><div class="demo" aria-hidden="true"><span class="short">${esc(host)}/abc</span><svg class="arc" viewBox="0 0 48 24"><path d="M4 20 C14 2 34 2 44 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 5"/><path d="M38 17 L44 20 L45 13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="long">https://www.example.com/a/very/long/address/for/the/page?ref=newsletter&amp;utm_campaign=autumn</span></div><p class="hint">${t.landingHint}</p>`;
  return page(lang, host, body, { bodyClass: "landing", extra: { "cache-control": "no-store" } });
}
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
