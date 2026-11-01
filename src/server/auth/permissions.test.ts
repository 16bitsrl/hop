import { describe, expect, it } from "vitest";
import { canCreate, canModify } from "./permissions";

describe("canModify", () => {
  it("lets an admin change anything", () => {
    expect(canModify({ id: "a", role: "admin" }, "someone-else")).toBe(true);
    expect(canModify({ id: "a", role: "admin" }, null)).toBe(true);
  });
  it("lets a member change only their own", () => {
    expect(canModify({ id: "m", role: "member" }, "m")).toBe(true);
    expect(canModify({ id: "m", role: "member" }, "other")).toBe(false);
    expect(canModify({ id: "m", role: "member" }, null)).toBe(false);
  });
  it("never lets a viewer change anything", () => {
    expect(canModify({ id: "v", role: "viewer" }, "v")).toBe(false);
  });
});

describe("canCreate", () => {
  it("allows admin and member, not viewer", () => {
    expect(canCreate({ role: "admin" })).toBe(true);
    expect(canCreate({ role: "member" })).toBe(true);
    expect(canCreate({ role: "viewer" })).toBe(false);
  });
});
