import { describe, expect, it } from "vitest";
import { hashLinkPassword, verifyLinkPassword } from "./password";

describe("link password", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashLinkPassword("s3cret");
    expect(hash.startsWith("pbkdf2$")).toBe(true);
    expect(await verifyLinkPassword("s3cret", hash)).toBe(true);
    expect(await verifyLinkPassword("wrong", hash)).toBe(false);
    expect(await verifyLinkPassword("", hash)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashLinkPassword("a")).not.toBe(await hashLinkPassword("a"));
  });
  it("rejects malformed hashes", async () => {
    expect(await verifyLinkPassword("a", "garbage")).toBe(false);
  });
});
