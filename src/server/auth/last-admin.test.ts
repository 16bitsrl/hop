import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { user, type Role } from "../db/schema";
import { openDatabase } from "../platform/node";
import { updateUserAccess } from "./users";

let dir: string;
let handle: ReturnType<typeof openDatabase>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "hop-last-admin-"));
  handle = openDatabase(dir, path.resolve("migrations"));
});
afterEach(() => {
  handle.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

async function addUser(id: string, role: Role, disabled = false) {
  await handle.db.insert(user).values({ id, name: id, email: `${id}@example.test`, role, disabled });
}
const row = (id: string) => handle.db.select().from(user).where(eq(user.id, id)).get();

describe("updateUserAccess", () => {
  it("refuses to demote or disable the last enabled admin", async () => {
    await addUser("a", "admin");
    await addUser("m", "member");
    expect(await updateUserAccess(handle.db, "a", { role: "member" })).toBe(false);
    expect(await updateUserAccess(handle.db, "a", { disabled: true })).toBe(false);
    expect(await row("a")).toMatchObject({ role: "admin", disabled: false });
  });

  it("counts only enabled admins as admins left", async () => {
    await addUser("a", "admin");
    await addUser("b", "admin", true);
    expect(await updateUserAccess(handle.db, "a", { role: "viewer" })).toBe(false);
  });

  it("allows it while another enabled admin remains, then refuses for the one left", async () => {
    await addUser("a", "admin");
    await addUser("b", "admin");
    expect(await updateUserAccess(handle.db, "b", { role: "member" })).toBe(true);
    expect(await updateUserAccess(handle.db, "a", { disabled: true })).toBe(false);
    expect(await row("b")).toMatchObject({ role: "member" });
  });

  it("does not get in the way of everything else", async () => {
    await addUser("a", "admin");
    await addUser("m", "member");
    expect(await updateUserAccess(handle.db, "m", { role: "admin" })).toBe(true);
    expect(await updateUserAccess(handle.db, "m", { disabled: true })).toBe(true);
    expect(await updateUserAccess(handle.db, "a", { role: "admin" })).toBe(true);
  });
});
