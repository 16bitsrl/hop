import { describe, expect, it, vi } from "vitest";
import { checkSafeBrowsing, hostAndParents, isHostBlocked, normalizeHost } from "./safety";

describe("host matching", () => {
  it("normalizes hosts and URLs", () => {
    expect(normalizeHost("Evil.Example.")).toBe("evil.example");
    expect(normalizeHost("https://Evil.Example:8080/path?x=1")).toBe("evil.example");
    expect(normalizeHost("evil.example/path")).toBe("evil.example");
    expect(normalizeHost("evil.example:99")).toBe("evil.example");
  });

  it("blocks the host and every subdomain, but not look-alikes", () => {
    const blocked = ["evil.example", "bad.test"];
    expect(isHostBlocked("evil.example", blocked)).toBe(true);
    expect(isHostBlocked("a.b.evil.example", blocked)).toBe(true);
    expect(isHostBlocked("EVIL.example.", blocked)).toBe(true);
    expect(isHostBlocked("notevil.example", blocked)).toBe(false);
    expect(isHostBlocked("evil.example.com", blocked)).toBe(false);
    expect(isHostBlocked("example", blocked)).toBe(false);
  });

  it("lists a host and its parents", () => {
    expect(hostAndParents("a.b.c")).toEqual(["a.b.c", "b.c", "c"]);
  });
});

describe("Safe Browsing", () => {
  const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

  it("sends one threatMatches:find request with all URLs", async () => {
    const f = ok({});
    const res = await checkSafeBrowsing(["https://a.test/", "https://b.test/", "https://a.test/"], "KEY 1", f as unknown as typeof fetch);
    expect(res).toEqual({ unsafe: [] });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://safebrowsing.googleapis.com/v4/threatMatches:find?key=KEY%201");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.threatInfo.threatEntryTypes).toEqual(["URL"]);
    expect(body.threatInfo.threatEntries).toEqual([{ url: "https://a.test/" }, { url: "https://b.test/" }]);
    expect(body.threatInfo.threatTypes).toContain("SOCIAL_ENGINEERING");
  });

  it("reports URLs that matched", async () => {
    const f = ok({ matches: [{ threatType: "MALWARE", threat: { url: "https://b.test/" } }] });
    expect(await checkSafeBrowsing(["https://a.test/", "https://b.test/"], "k", f as unknown as typeof fetch)).toEqual({
      unsafe: ["https://b.test/"],
    });
  });

  it("fails open on HTTP errors and network failures", async () => {
    const bad = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await checkSafeBrowsing(["https://a.test/"], "k", bad as unknown as typeof fetch)).toEqual({ unsafe: [], error: true });
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await checkSafeBrowsing(["https://a.test/"], "k", boom as unknown as typeof fetch)).toEqual({ unsafe: [], error: true });
  });

  it("does not call the service without URLs", async () => {
    const f = ok({});
    await checkSafeBrowsing([], "k", f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
});
