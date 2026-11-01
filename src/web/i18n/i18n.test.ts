import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.dirname(new URL(import.meta.url).pathname);

function load(lang: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, lang, file), "utf8"));
}

/** { a: { b: "x" } } becomes { "a.b": "x" }. */
function flatten(o: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = String(v);
  }
  return out;
}

// Plural forms differ between languages (English has one/other, Italian may add many): compare the base keys.
const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, "");
const variables = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const files = readdirSync(path.join(root, "en")).filter((f) => f.endsWith(".json"));

describe("translations", () => {
  it("has the same namespaces in English and Italian", () => {
    expect(readdirSync(path.join(root, "it")).filter((f) => f.endsWith(".json")).sort()).toEqual([...files].sort());
  });

  for (const file of files) {
    describe(file, () => {
      const en = flatten(load("en", file));
      const it_ = flatten(load("it", file));

      it("has every key in both languages", () => {
        const enKeys = new Set(Object.keys(en).map(base));
        const itKeys = new Set(Object.keys(it_).map(base));
        expect([...enKeys].filter((k) => !itKeys.has(k)), "missing in Italian").toEqual([]);
        expect([...itKeys].filter((k) => !enKeys.has(k)), "missing in English").toEqual([]);
      });

      it("has no empty text", () => {
        expect(Object.entries(en).filter(([, v]) => !v.trim())).toEqual([]);
        expect(Object.entries(it_).filter(([, v]) => !v.trim())).toEqual([]);
      });

      it("uses the same placeholders in both languages", () => {
        const mismatched = Object.keys(en)
          .filter((k) => k in it_)
          .filter((k) => variables(en[k]!).join() !== variables(it_[k]!).join());
        expect(mismatched).toEqual([]);
      });
    });
  }

  describe("Italian style", () => {
    const all = files.flatMap((f) => Object.entries(flatten(load("it", f))).map(([k, v]) => [`${f}:${k}`, v] as const));

    it("has no em or en dashes", () => {
      expect(all.filter(([, v]) => /[—–]/.test(v))).toEqual([]);
    });

    it("uses accented letters, not apostrophes (è, not e')", () => {
      expect(all.filter(([, v]) => /\b(e|a|i|o|u)'(?=\s|$|[.,;:?!])/i.test(v) && !/\bpo'/.test(v))).toEqual([]);
    });

    it("uses sentence case, not Title Case", () => {
      // Two capitalized words in a row, or a capitalized word in the middle of a sentence, is Title Case.
      const proper = /^(hop|YOURLS|Google|Workspace|Microsoft|Okta|Keycloak|OpenID|English|Italiano|Europe|Rome|Authorization|PNG|JPG|GIF|WebP|SVG|CSV|UTM|QR|HTTP|HTTPS|API|URL|SQL|DNS|SSL|TLS|STARTTLS|A|B|IT|US|ID|OK|Android|iOS|Invio)$/;
      const offenders = all.filter(([, v]) => {
        const words = v.split(/\s+/).slice(1);
        return words.some((w, i) => {
          const clean = w.replace(/[^\p{L}]/gu, "");
          // A quoted word is the name of a button or menu, written as it appears on screen.
          if (/^[«"“]/.test(w) || !/^\p{Lu}\p{Ll}+$/u.test(clean) || proper.test(clean)) return false;
          // After a full stop, question mark or colon a capital is correct.
          const before = i === 0 ? v.split(/\s+/)[0]! : words[i - 1]!;
          return !/[.?!:«"“]$/.test(before);
        });
      });
      expect(offenders).toEqual([]);
    });
  });

  describe("English style", () => {
    it("has no em dashes", () => {
      const all = files.flatMap((f) => Object.entries(flatten(load("en", f))).map(([k, v]) => [`${f}:${k}`, v] as const));
      expect(all.filter(([, v]) => /[—]/.test(v))).toEqual([]);
    });
  });
});
