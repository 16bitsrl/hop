import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireRole, requireUser } from "../auth/permissions";
import { createResetLink, createUserWithPassword, findUserByEmail, randomToken, sha256Hex } from "../auth/users";
import { invites, session, user } from "../db/schema";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { fail, parseJson } from "../lib/validate";
import { actionMail, getMailer } from "../mail";

export const userRoutes = new Hono<AppEnv>();

/** Id and name of every user, for owner filters and pickers. Any signed-in user. */
userRoutes.get("/users/directory", requireUser, async (c) => {
  const rows = await c.var.platform.db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name);
  return c.json({ users: rows });
});

const admin = requireRole("admin");

userRoutes.get("/users", admin, async (c) => {
  const rows = await c.var.platform.db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt);
  return c.json({ users: rows });
});

const patchBody = z.object({ role: z.enum(["admin", "member", "viewer"]).optional(), disabled: z.boolean().optional() });

userRoutes.patch("/users/:id", admin, async (c) => {
  const { id } = c.req.param();
  const body = await parseJson(c, patchBody);
  if (id === c.var.user!.id) return fail(c, 409, "cannot_change_self");
  const { db } = c.var.platform;
  const target = await db.select().from(user).where(eq(user.id, id)).get();
  if (!target) return fail(c, 404, "not_found");
  await db
    .update(user)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(user.id, id));
  if (body.disabled) await db.delete(session).where(eq(session.userId, id));
  if (body.role && body.role !== target.role) {
    await audit(c, { action: "user.role", entityType: "user", entityId: id, data: { before: target.role, after: body.role, email: target.email } });
  }
  if (body.disabled !== undefined && body.disabled !== target.disabled) {
    await audit(c, {
      action: body.disabled ? "user.disable" : "user.enable",
      entityType: "user",
      entityId: id,
      data: { email: target.email },
    });
  }
  return c.json({ ok: true });
});

userRoutes.post("/users/:id/reset-link", admin, async (c) => {
  const { id } = c.req.param();
  const target = await c.var.platform.db.select().from(user).where(eq(user.id, id)).get();
  if (!target) return fail(c, 404, "not_found");
  const url = await createResetLink(c.var.platform, id);
  await audit(c, { action: "user.reset_link", entityType: "user", entityId: id, data: { email: target.email } });
  return c.json({ url });
});

/* ---------------------------- invites ---------------------------- */

const INVITE_DAYS = 7;

userRoutes.get("/invites", admin, async (c) => {
  const rows = await c.var.platform.db
    .select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt));
  return c.json({ invites: rows });
});

const inviteBody = z.object({ email: z.email(), role: z.enum(["admin", "member", "viewer"]) });

userRoutes.post("/invites", admin, async (c) => {
  const body = await parseJson(c, inviteBody);
  const platform = c.var.platform;
  const email = body.email.trim().toLowerCase();
  if (await findUserByEmail(platform, email)) return fail(c, 409, "user_exists");
  // A new invite replaces any pending one for the same address.
  await platform.db.delete(invites).where(and(eq(invites.email, email), isNull(invites.acceptedAt)));
  const token = randomToken(24);
  const id = crypto.randomUUID();
  await platform.db.insert(invites).values({
    id,
    email,
    role: body.role,
    tokenHash: await sha256Hex(token),
    createdBy: c.var.user!.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000),
  });
  const url = `${platform.config.appUrl}/invite/${token}`;
  let emailed = false;
  const mailer = await getMailer(platform);
  if (mailer) {
    try {
      await mailer.send(
        actionMail({
          to: email,
          subject: "You have been invited to hop",
          intro: `${c.var.user!.name} invited you to join hop. The invitation works for ${INVITE_DAYS} days.`,
          button: "Accept the invitation",
          url,
        }),
      );
      emailed = true;
    } catch {
      emailed = false;
    }
  }
  await audit(c, { action: "invite.create", entityType: "invite", entityId: id, data: { email, role: body.role, emailed } });
  return c.json({ id, url, emailed });
});

userRoutes.delete("/invites/:id", admin, async (c) => {
  const { id } = c.req.param();
  const row = await c.var.platform.db.select().from(invites).where(eq(invites.id, id)).get();
  if (!row) return fail(c, 404, "not_found");
  await c.var.platform.db.delete(invites).where(eq(invites.id, id));
  await audit(c, { action: "invite.revoke", entityType: "invite", entityId: id, data: { email: row.email } });
  return c.json({ ok: true });
});

/* Public: the invited person opens the link. */

async function findInvite(c: { var: AppEnv["Variables"] }, token: string) {
  const tokenHash = await sha256Hex(token);
  const row = await c.var.platform.db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .get();
  return row ?? null;
}

userRoutes.get("/invites/by-token/:token", async (c) => {
  const invite = await findInvite(c, c.req.param("token"));
  if (!invite) return fail(c, 404, "invalid_invite");
  return c.json({ email: invite.email, role: invite.role });
});

const acceptBody = z.object({ name: z.string().trim().min(1).max(100), password: z.string().min(8).max(200) });

userRoutes.post("/invites/by-token/:token/accept", async (c) => {
  const invite = await findInvite(c, c.req.param("token"));
  if (!invite) return fail(c, 404, "invalid_invite");
  const body = await parseJson(c, acceptBody);
  if (await findUserByEmail(c.var.platform, invite.email)) return fail(c, 409, "user_exists");
  const created = await createUserWithPassword(c.var.platform, { ...body, email: invite.email, role: invite.role });
  await c.var.platform.db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
  c.set("user", created);
  await audit(c, { action: "invite.accept", entityType: "invite", entityId: invite.id, data: { email: invite.email } });
  return c.json({ email: created.email });
});
