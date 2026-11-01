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
    openingTitle: "Apertura dell'app",
    openingText: "Se non succede nulla, ti portiamo al sito web.",
    openingLink: "Vai al sito web",
    redirecting: "Reindirizzamento",
    redirectingLink: "Continua",
  },
} as const;

const CSS = `
:root{color-scheme:light dark;--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--accent:#2563eb;--accent-fg:#fff;--err:#b91c1c}
@media(prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--accent:#60a5fa;--accent-fg:#0c0a09;--err:#f87171}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{width:100%;max-width:26rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:2rem;text-align:center}
h1{margin:0 0 .5rem;font-size:1.25rem}
p{margin:0 0 1rem;color:var(--muted)}
a{color:var(--accent)}
form{display:grid;gap:.75rem;text-align:left}
label{font-size:.875rem;font-weight:600}
input{width:100%;padding:.65rem .75rem;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}
button{padding:.65rem;border:0;border-radius:8px;background:var(--accent);color:var(--accent-fg);font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--err);font-size:.875rem;margin:0}
`;

function shell(lang: Lang, title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>${head}<style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

const HEADERS = { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" };

export function htmlResponse(html: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(html, { status, headers: { ...HEADERS, ...extra } });
}

function simple(lang: Lang, title: string, text: string, status: number, cache = "no-store"): Response {
  return htmlResponse(shell(lang, title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`), status, {
    "cache-control": cache,
  });
}

export const landingPage = (lang: Lang) => simple(lang, T[lang].landingTitle, T[lang].landingText, 200);
export const notFoundPage = (lang: Lang) => simple(lang, T[lang].notFoundTitle, T[lang].notFoundText, 404);
export const expiredPage = (lang: Lang) => simple(lang, T[lang].expiredTitle, T[lang].expiredText, 410);

export function passwordPage(lang: Lang, error: boolean): Response {
  const t = T[lang];
  const body = `<h1>${t.passwordTitle}</h1><p>${t.passwordText}</p><form method="post">${
    error ? `<p class="err" role="alert">${t.passwordError}</p>` : ""
  }<label for="p">${t.passwordLabel}</label><input id="p" name="password" type="password" autocomplete="off" autofocus required><button type="submit">${t.passwordButton}</button></form>`;
  return htmlResponse(shell(lang, t.passwordTitle, body), 200, { "cache-control": "no-store" });
}

/** Tries the app URL, then falls back to the web URL after ~1.5 s. */
export function deepLinkPage(lang: Lang, appUrl: string, webUrl: string): Response {
  const t = T[lang];
  const body = `<h1>${t.openingTitle}</h1><p>${t.openingText}</p><p><a href="${esc(webUrl)}">${t.openingLink}</a></p>
<script>(function(){var a=${jsString(appUrl)},w=${jsString(webUrl)};location.href=a;setTimeout(function(){location.replace(w)},1500)})()</script>`;
  return htmlResponse(shell(lang, t.openingTitle, body), 200, { "cache-control": "private, max-age=0" });
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
  return htmlResponse(shell(lang, title, body, head), 200, { "cache-control": "private, max-age=0" });
}

/** JS string literal safe to embed inside an inline script. */
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
