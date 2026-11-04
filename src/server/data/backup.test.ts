import { describe, expect, it } from "vitest";
import { consistencyFilter } from "./backup";

describe("backup consistency", () => {
  it("leaves out rows whose required parent was not exported, and their children", () => {
    const keep = consistencyFilter();
    expect(keep("domains", { id: "d1", host: "a.example" })).toBeTruthy();
    expect(keep("user", { id: "u1" })).toBeTruthy();
    // A domain created after the domains were read never reached the file: its link must not either.
    expect(keep("links", { id: "l1", domain_id: "d1", owner_id: "u1", folder_id: null })).toBeTruthy();
    expect(keep("links", { id: "l2", domain_id: "d-late", owner_id: "u1", folder_id: null })).toBeNull();
    expect(keep("clicks", { id: 1, link_id: "l1" })).toBeTruthy();
    expect(keep("clicks", { id: 2, link_id: "l2" })).toBeNull();
    expect(keep.skipped).toEqual({ links: 1, clicks: 1 });
  });

  it("clears an optional reference to something created during the backup, keeping the row", () => {
    const keep = consistencyFilter();
    keep("domains", { id: "d1" });
    keep("user", { id: "u1" });
    const row = keep("links", { id: "l1", domain_id: "d1", owner_id: "u-late", folder_id: "f-late" });
    expect(row).toEqual({ id: "l1", domain_id: "d1", owner_id: null, folder_id: null });
    expect(keep("audit_log", { id: "a1", user_id: "u-late" })).toEqual({ id: "a1", user_id: null });
    expect(keep.skipped).toEqual({});
  });
});
