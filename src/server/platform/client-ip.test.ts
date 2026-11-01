import { describe, expect, it } from "vitest";
import { forwardedClientIp } from "./client-ip";

describe("forwardedClientIp", () => {
  it("takes the entry added by the trusted proxy: the rightmost one", () => {
    expect(forwardedClientIp("6.6.6.6, 203.0.113.9")).toBe("203.0.113.9");
    expect(forwardedClientIp("1.1.1.1, 2.2.2.2, 203.0.113.9")).toBe("203.0.113.9");
  });
  it("handles a single entry and whitespace", () => {
    expect(forwardedClientIp(" 203.0.113.9 ")).toBe("203.0.113.9");
  });
  it("returns null for nothing", () => {
    expect(forwardedClientIp(null)).toBeNull();
    expect(forwardedClientIp("")).toBeNull();
    expect(forwardedClientIp(" , ")).toBeNull();
  });
});
