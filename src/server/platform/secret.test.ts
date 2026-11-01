import { describe, expect, it } from "vitest";
import { authSecretProblem } from "./secret";

describe("authSecretProblem", () => {
  it("accepts a long secret", () => {
    expect(authSecretProblem("x".repeat(32))).toBeNull();
  });
  it("explains a missing or short one", () => {
    expect(authSecretProblem(undefined)).toMatch(/AUTH_SECRET is required/);
    expect(authSecretProblem("  ")).toMatch(/AUTH_SECRET is required/);
    expect(authSecretProblem("short")).toMatch(/too short/);
    expect(authSecretProblem("x".repeat(31))).toMatch(/too short/);
  });
});
