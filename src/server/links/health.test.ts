import { describe, expect, it } from "vitest";
import { classifyStatus, isFailCode, nextHealth, probe } from "./health";

describe("classifyStatus", () => {
  it("fails on 404, 410, 5xx and network errors only", () => {
    for (const c of [404, 410, 500, 502, 503, 0]) expect(classifyStatus(c)).toBe("fail");
    for (const c of [200, 204, 301, 302, 304, 401, 403, 405, 429]) expect(classifyStatus(c)).toBe("ok");
  });
  it("tolerates missing codes", () => {
    expect(isFailCode(null)).toBe(false);
    expect(isFailCode(undefined)).toBe(false);
  });
});

describe("nextHealth", () => {
  it("one failure is not enough", () => {
    expect(nextHealth({ status: "ok", code: 200 }, { kind: "fail", code: 500 })).toEqual({ status: "ok", code: 500 });
    expect(nextHealth({ status: "unknown", code: null }, { kind: "fail", code: 404 })).toEqual({ status: "unknown", code: 404 });
  });
  it("two failures in a row mark it broken", () => {
    expect(nextHealth({ status: "ok", code: 500 }, { kind: "fail", code: 404 })).toEqual({ status: "broken", code: 404 });
    expect(nextHealth({ status: "unknown", code: 0 }, { kind: "fail", code: 0 })).toEqual({ status: "broken", code: 0 });
  });
  it("a broken link stays broken while it fails and recovers on success", () => {
    expect(nextHealth({ status: "broken", code: 404 }, { kind: "fail", code: 404 }).status).toBe("broken");
    expect(nextHealth({ status: "broken", code: 404 }, { kind: "ok", code: 200 })).toEqual({ status: "ok", code: 200 });
  });
  it("a success between failures resets the count", () => {
    const afterFail = nextHealth({ status: "ok", code: 200 }, { kind: "fail", code: 500 });
    const afterOk = nextHealth(afterFail, { kind: "ok", code: 200 });
    expect(nextHealth(afterOk, { kind: "fail", code: 500 }).status).toBe("ok");
  });
  it("a skipped check changes nothing", () => {
    expect(nextHealth({ status: "ok", code: 200 }, { kind: "skipped" })).toEqual({ status: "ok", code: 200 });
  });
});

const respond = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

describe("probe", () => {
  it("uses HEAD and reports the status", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push(init.method!);
      return respond(200);
    }) as unknown as typeof fetch;
    expect(await probe("https://example.com/", { fetchImpl })).toEqual({ kind: "ok", code: 200 });
    expect(calls).toEqual(["HEAD"]);
  });
  it("falls back to GET when HEAD is refused", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push(init.method!);
      return respond(init.method === "HEAD" ? 405 : 200);
    }) as unknown as typeof fetch;
    expect(await probe("https://example.com/", { fetchImpl })).toEqual({ kind: "ok", code: 200 });
    expect(calls).toEqual(["HEAD", "GET"]);
  });
  it("follows redirects", async () => {
    const fetchImpl = (async (u: string) =>
      u.endsWith("/a") ? respond(301, { location: "/b" }) : respond(404)) as unknown as typeof fetch;
    expect(await probe("https://example.com/a", { fetchImpl })).toEqual({ kind: "fail", code: 404 });
  });
  it("treats network errors as failures", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await probe("https://example.com/", { fetchImpl })).toEqual({ kind: "fail", code: 0 });
  });
  it("never reaches private hosts, also through a redirect", async () => {
    let called = 0;
    const fetchImpl = (async (u: string) => {
      called++;
      return u.includes("example.com") ? respond(302, { location: "http://127.0.0.1/admin" }) : respond(200);
    }) as unknown as typeof fetch;
    expect(await probe("http://localhost:8080/", { fetchImpl })).toEqual({ kind: "skipped" });
    expect(called).toBe(0);
    expect(await probe("https://example.com/", { fetchImpl })).toEqual({ kind: "skipped" });
    expect(called).toBe(1);
  });
  it("reaches private hosts when allowed (tests)", async () => {
    const fetchImpl = (async () => respond(500)) as unknown as typeof fetch;
    expect(await probe("http://localhost/", { fetchImpl, allowPrivate: true })).toEqual({ kind: "fail", code: 500 });
  });
  it("in the test environment only reaches private hosts", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called++;
      return respond(200);
    }) as unknown as typeof fetch;
    const opts = { fetchImpl, allowPrivate: true, privateOnly: true };
    expect(await probe("https://example.com/", opts)).toEqual({ kind: "skipped" });
    expect(called).toBe(0);
    expect(await probe("http://app.localhost:8805/x", opts)).toEqual({ kind: "ok", code: 200 });
  });
});
