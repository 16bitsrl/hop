import { describe, expect, it } from "vitest";
import { DEFAULT_SLUG_SETTINGS, generateSlug, isValidSlug, normalizeAlphabet } from "./slug";

describe("slugs", () => {
  it("validates characters and length", () => {
    expect(isValidSlug("abc-DEF_123")).toBe(true);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("è")).toBe(false);
    expect(isValidSlug("a".repeat(65))).toBe(false);
  });

  it("generates the configured length from the alphabet", () => {
    const s = generateSlug({ length: 12, alphabet: "xyz" });
    expect(s).toMatch(/^[xyz]{12}$/);
    expect(generateSlug()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("uses the injected random source", () => {
    expect(generateSlug({ length: 3, alphabet: "abc" }, () => 2)).toBe("ccc");
    let i = 0;
    expect(generateSlug({ length: 3, alphabet: "abc" }, () => i++ % 3)).toBe("abc");
  });

  it("falls back to the default alphabet when nothing usable is left", () => {
    expect(normalizeAlphabet("@@ ##")).toBe("");
    expect(generateSlug({ length: 4, alphabet: "@@" })).toMatch(/^[a-z0-9]{4}$/);
    expect(normalizeAlphabet("aabbc!")).toBe("abc");
    expect(DEFAULT_SLUG_SETTINGS.length).toBe(6);
  });
});
