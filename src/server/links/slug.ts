/** Slug rules (A1) and generator. Case-sensitive; letters, digits, "-" and "_". */

export const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidSlug = (value: string): boolean => SLUG_PATTERN.test(value);

export type SlugSettings = { length: number; alphabet: string };

export const DEFAULT_SLUG_SETTINGS: SlugSettings = {
  length: 6,
  alphabet: "abcdefghijklmnopqrstuvwxyz0123456789",
};

/** Cleans a user-provided alphabet: keeps allowed characters only, no duplicates. */
export function normalizeAlphabet(value: string): string {
  return [...new Set([...value].filter((ch) => /[A-Za-z0-9_-]/.test(ch)))].join("");
}

/** Random slug. `randomInt(max)` returns an integer in [0, max). */
export function generateSlug(
  settings: SlugSettings = DEFAULT_SLUG_SETTINGS,
  randomInt: (max: number) => number = secureInt,
): string {
  const chars = [...(normalizeAlphabet(settings.alphabet) || DEFAULT_SLUG_SETTINGS.alphabet)];
  let out = "";
  for (let i = 0; i < settings.length; i++) out += chars[randomInt(chars.length)];
  return out;
}

/** Unbiased random integer in [0, max) from the Web Crypto generator. */
function secureInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % max;
  }
}
