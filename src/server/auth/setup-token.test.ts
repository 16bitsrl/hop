import { describe, expect, it } from "vitest";
import { setupTokenOk } from "./setup-token";

describe("setupTokenOk", () => {
  it("accepts anything when no token is configured", async () => {
    expect(await setupTokenOk(undefined, undefined)).toBe(true);
    expect(await setupTokenOk("", "x")).toBe(true);
  });
  it("requires the exact token when configured", async () => {
    expect(await setupTokenOk("secret", "secret")).toBe(true);
    expect(await setupTokenOk("secret", "secre")).toBe(false);
    expect(await setupTokenOk("secret", "")).toBe(false);
    expect(await setupTokenOk("secret", undefined)).toBe(false);
  });
});
