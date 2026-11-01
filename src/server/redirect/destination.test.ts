import { describe, expect, it } from "vitest";
import {
  classifyUserAgent,
  isPreviewCrawler,
  mergeQuery,
  parseLanguage,
  pickVariant,
  selectDestination,
  type RequestInfo,
} from "./destination";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("classifyUserAgent", () => {
  it("detects ios, android, desktop, tablet", () => {
    expect(classifyUserAgent(IPHONE)).toMatchObject({ device: "mobile", os: "iOS", isIos: true });
    expect(classifyUserAgent(IPAD)).toMatchObject({ device: "tablet", isIos: true });
    expect(classifyUserAgent(ANDROID)).toMatchObject({ device: "mobile", os: "Android", isAndroid: true });
    expect(classifyUserAgent(DESKTOP)).toMatchObject({ device: "desktop", isIos: false, isAndroid: false });
  });
  it("handles empty UA", () => {
    expect(classifyUserAgent(null).device).toBe("desktop");
  });
});

describe("isPreviewCrawler", () => {
  it.each([
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "LinkedInBot/1.0",
    "Slackbot-LinkExpanding 1.0",
    "WhatsApp/2.23",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Discordbot/2.0)",
    "Pinterest/0.2",
    "Mozilla/5.0 (Macintosh) Applebot/0.1",
    "SkypeUriPreview Preview/0.5",
  ])("%s", (ua) => expect(isPreviewCrawler(ua)).toBe(true));
  it("rejects browsers", () => {
    expect(isPreviewCrawler(DESKTOP)).toBe(false);
    expect(isPreviewCrawler(null)).toBe(false);
  });
});

describe("parseLanguage", () => {
  it("takes the primary subtag of the top choice", () => {
    expect(parseLanguage("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
    expect(parseLanguage("en;q=0.5, fr;q=0.9")).toBe("fr");
    expect(parseLanguage(null)).toBeNull();
    expect(parseLanguage("*")).toBeNull();
  });
});

describe("pickVariant", () => {
  const v = [
    { url: "a", weight: 1 },
    { url: "b", weight: 3 },
  ];
  it("is weighted using the injected random", () => {
    expect(pickVariant(v, () => 0)).toBe(0);
    expect(pickVariant(v, () => 0.24)).toBe(0);
    expect(pickVariant(v, () => 0.26)).toBe(1);
    expect(pickVariant(v, () => 0.999)).toBe(1);
  });
  it("ignores zero-weight variants and falls back when all are zero", () => {
    expect(
      pickVariant(
        [
          { url: "a", weight: 0 },
          { url: "b", weight: 2 },
        ],
        () => 0,
      ),
    ).toBe(1);
    expect(pickVariant([{ url: "a", weight: 0 }], () => 0.5)).toBe(0);
  });
});

describe("mergeQuery", () => {
  it("merges with incoming override", () => {
    expect(mergeQuery("https://x.com/p?a=1&b=2", new URLSearchParams("b=3&c=4"))).toBe(
      "https://x.com/p?a=1&b=3&c=4",
    );
  });
  it("returns the url untouched when nothing is incoming", () => {
    expect(mergeQuery("https://x.com/p?a=1", new URLSearchParams())).toBe("https://x.com/p?a=1");
  });
  it("keeps repeated incoming params and the hash", () => {
    expect(mergeQuery("https://x.com/p#h", new URLSearchParams("t=1&t=2"))).toBe("https://x.com/p?t=1&t=2#h");
  });
  it("returns invalid urls untouched", () => {
    expect(mergeQuery("not a url", new URLSearchParams("a=1"))).toBe("not a url");
  });
});

describe("selectDestination", () => {
  const base = { url: "https://main", appUrl: null, rules: [], variants: [] };
  const req = (o: Partial<RequestInfo> = {}): RequestInfo => ({
    ua: classifyUserAgent(DESKTOP),
    country: null,
    language: null,
    ...o,
  });

  it("main by default", () => {
    expect(selectDestination(base, req(), () => 0)).toEqual({ url: "https://main", appUrl: null, target: "main" });
  });
  it("first matching rule wins; all conditions must match", () => {
    const link = {
      ...base,
      rules: [
        { devices: ["ios" as const], countries: ["IT"], url: "https://r0" },
        { devices: ["ios" as const], url: "https://r1", appUrl: "app://x" },
        { url: "https://r2" },
      ],
    };
    const ios = classifyUserAgent(IPHONE);
    expect(selectDestination(link, req({ ua: ios, country: "IT" }), () => 0).target).toBe("rule:0");
    expect(selectDestination(link, req({ ua: ios, country: "FR" }), () => 0)).toEqual({
      url: "https://r1",
      appUrl: "app://x",
      target: "rule:1",
    });
    expect(selectDestination(link, req(), () => 0).target).toBe("rule:2");
  });
  it("country and language rules", () => {
    const link = { ...base, rules: [{ countries: ["IT"], languages: ["it"], url: "https://it" }] };
    expect(selectDestination(link, req({ country: "IT", language: "it" }), () => 0).target).toBe("rule:0");
    expect(selectDestination(link, req({ country: "IT", language: "en" }), () => 0).target).toBe("main");
    expect(selectDestination(link, req({ language: "it" }), () => 0).target).toBe("main");
  });
  it("device mobile matches phones, not tablets", () => {
    const link = { ...base, rules: [{ devices: ["mobile" as const], url: "https://m" }] };
    expect(selectDestination(link, req({ ua: classifyUserAgent(ANDROID) }), () => 0).target).toBe("rule:0");
    expect(selectDestination(link, req({ ua: classifyUserAgent(IPAD) }), () => 0).target).toBe("main");
  });
  it("variants replace main, rules take precedence", () => {
    const link = {
      ...base,
      rules: [{ countries: ["IT"], url: "https://it" }],
      variants: [
        { url: "https://v0", weight: 1 },
        { url: "https://v1", weight: 1 },
      ],
    };
    expect(selectDestination(link, req(), () => 0.9)).toMatchObject({ url: "https://v1", target: "variant:1" });
    expect(selectDestination(link, req({ country: "IT" }), () => 0.9).target).toBe("rule:0");
  });
  it("main appUrl applies to main only", () => {
    expect(selectDestination({ ...base, appUrl: "app://m" }, req(), () => 0).appUrl).toBe("app://m");
  });
});
