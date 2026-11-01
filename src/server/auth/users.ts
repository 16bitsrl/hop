import { eq, sql } from "drizzle-orm";
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
) {
  const auth = await createAuth(platform);
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(input.password);
  const id = crypto.randomUUID();
  const now = new Date();
  await runBatch(platform.db, [
    platform.db.insert(user).values({
      id,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      role: input.role,
      locale: input.locale ?? null,
      createdAt: now,
      updatedAt: now,
    }),
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
