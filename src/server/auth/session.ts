import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { user } from "../db/schema";
import type { AppEnv } from "../env";
import { createAuth } from "./auth";

/** Fills `c.var.user` from the session cookie. Disabled users count as signed out. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Better Auth's own routes resolve sessions themselves.
  if (!c.req.path.startsWith("/api/auth/") && c.req.header("cookie")) {
    const auth = await createAuth(c.var.platform);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      const row = await c.var.platform.db.select().from(user).where(eq(user.id, session.user.id)).get();
      if (row && !row.disabled) c.set("user", row);
    }
  }
  await next();
});
