import { and, eq, or, sql } from "drizzle-orm";
import { runBatch } from "../db/batch";
import { account, invites, user, type Role } from "../db/schema";
import type { Platform } from "../platform/types";
import { createAuth } from "./auth";

export function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function countUsers(platform: Platform): Promise<number> {
  const row = await platform.db.select({ n: sql<number>`count(*)` }).from(user).get();
  return row?.n ?? 0;
}

export async function findUserByEmail(platform: Platform, email: string) {
  return platform.db
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${email.trim().toLowerCase()}`)
    .get();
}

/**
 * Creates a user that signs in with email and password. Used by first-run setup,
 * invite acceptance and the test helpers (public sign-up is closed).
 */
export async function createUserWithPassword(
  platform: Platform,
  input: { name: string; email: string; password: string; role: Role; locale?: string | null },
  opts: { onlyIfFirst?: boolean } = {},
) {
  const auth = await createAuth(platform);
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(input.password);
  const id = crypto.randomUUID();
  const now = new Date();
  const email = input.email.trim().toLowerCase();
  const values = { id, name: input.name, email, emailVerified: true, role: input.role, locale: input.locale ?? null, createdAt: now, updatedAt: now };
  // First-run setup: the user is inserted only while the table is empty, in the same atomic batch,
  // so concurrent setups cannot each create an admin. The account insert then fails its foreign key.
  const insertUser = opts.onlyIfFirst
    ? platform.db
        .insert(user)
        .select(
          sql`select ${id}, ${input.name}, ${email}, 1, null, ${input.role}, 0, null, ${values.locale}, ${now.getTime()}, ${now.getTime()} where not exists (select 1 from "user")`,
        )
    : platform.db.insert(user).values(values);
  await runBatch(platform.db, [
    insertUser,
    platform.db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  const created = await platform.db.select().from(user).where(eq(user.id, id)).get();
  return created!;
}

/** Marks every pending invite for the address as used. */
export async function markInvitesAccepted(platform: Platform, email: string) {
  await platform.db
    .update(invites)
    .set({ acceptedAt: new Date() })
    .where(sql`lower(${invites.email}) = ${email.toLowerCase()} and ${invites.acceptedAt} is null`);
}

/** Creates a one-hour password reset token and returns the link to give to the user. */
export async function createResetLink(platform: Platform, userId: string): Promise<string> {
  const auth = await createAuth(platform);
  const ctx = await auth.$context;
  const token = randomToken(24);
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return `${platform.config.appUrl}/reset-password?token=${token}`;
}

/**
 * Changes a user's role and/or disabled flag in ONE statement that refuses to leave the installation
 * without an enabled admin (two admins demoting each other at the same moment cannot both win).
 * Returns false when nothing was changed because of that rule.
 */
export async function updateUserAccess(
  db: Platform["db"],
  id: string,
  change: { role?: Role; disabled?: boolean },
): Promise<boolean> {
  const current = await db.select({ role: user.role, disabled: user.disabled }).from(user).where(eq(user.id, id)).get();
  if (!current) return false;
  const role = change.role ?? current.role;
  const disabled = change.disabled ?? current.disabled;
  const staysEnabledAdmin = role === "admin" && !disabled;
  const rows = await db
    .update(user)
    .set({ ...change, updatedAt: new Date() })
    .where(
      and(
        eq(user.id, id),
        or(
          // nobody loses admin rights here...
          sql`${staysEnabledAdmin ? 1 : 0} = 1`,
          sql`not (${user.role} = 'admin' and ${user.disabled} = 0)`,
          // ...or another enabled admin is left.
          sql`exists (select 1 from ${user} as other where other.id <> ${id} and other.role = 'admin' and other.disabled = 0)`,
        ),
      ),
    )
    .returning({ id: user.id });
  return rows.length > 0;
}
