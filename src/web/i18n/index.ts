import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * One JSON file per namespace and language: src/web/i18n/<lang>/<namespace>.json.
 * Add a namespace by dropping in en/<ns>.json and it/<ns>.json, nothing to register.
 */
const files = import.meta.glob("./*/*.json", { eager: true, import: "default" }) as Record<string, Record<string, unknown>>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, content] of Object.entries(files)) {
  const m = path.match(/^\.\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lang, ns] = m as unknown as [string, string, string];
  (resources[lang] ??= {})[ns] = content;
}

export const LANGUAGES = ["en", "it"] as const;
export type Language = (typeof LANGUAGES)[number];
const KEY = "hop-locale";

export function detectLanguage(): Language {
  const saved = localStorage.getItem(KEY);
  if (saved === "en" || saved === "it") return saved;
  return navigator.language.toLowerCase().startsWith("it") ? "it" : "en";
}

/** Switches the interface language and remembers it for the login page. */
export function setLanguage(lang: Language) {
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  void i18n.changeLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: Object.keys(resources.en ?? {}),
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = detectLanguage();

export default i18n;
