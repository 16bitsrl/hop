import { describe, expect, it } from "vitest";
import { applyUtm, emptyUtm, parseUtm } from "./utm";

describe("utm", () => {
  it("reads existing utm parameters", () => {
    expect(parseUtm("https://example.com/p?utm_source=news&utm_campaign=spring%20sale&x=1")).toEqual({
      source: "news",
      medium: "",
      campaign: "spring sale",
      term: "",
      content: "",
    });
  });

  it("returns empty values for invalid URLs and URLs without parameters", () => {
    expect(parseUtm("nope")).toEqual(emptyUtm());
    expect(parseUtm("https://example.com")).toEqual(emptyUtm());
  });

  it("writes filled fields, keeps other parameters, removes emptied ones", () => {
    const url = applyUtm("https://example.com/p?x=1&utm_source=old&utm_term=gone", {
      ...emptyUtm(),
      source: "newsletter",
      campaign: "spring sale",
    });
    const u = new URL(url);
    expect(u.searchParams.get("utm_source")).toBe("newsletter");
    expect(u.searchParams.get("utm_campaign")).toBe("spring sale");
    expect(u.searchParams.has("utm_term")).toBe(false);
    expect(u.searchParams.get("x")).toBe("1");
  });

  it("round-trips", () => {
    const utm = { source: "a", medium: "b", campaign: "c", term: "d", content: "e" };
    expect(parseUtm(applyUtm("https://example.com/", utm))).toEqual(utm);
  });

  it("leaves unparsable URLs alone", () => {
    expect(applyUtm("not a url", { ...emptyUtm(), source: "x" })).toBe("not a url");
  });
});
