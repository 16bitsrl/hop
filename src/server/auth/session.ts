import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { user } from "../db/schema";
import type { AppEnv } from "../env";
import { bearerKey, userForKey } from "./api-keys";
import { createAuth } from "./auth";

/**
 * Fills `c.var.user` from `Authorization: Bearer hop_...` (personal API key) or the session cookie.
 * Disabled users count as signed out.
 */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Better Auth's own routes resolve sessions themselves.
  if (!c.req.path.startsWith("/api/auth/")) {
    const key = bearerKey(c.req.header("authorization"));
    if (key) {
      const row = await userForKey(c.var.platform.db, key);
      if (row) {
        c.set("user", row);
        c.set("authVia", "key");
      }
    } else if (c.req.header("cookie")) {
      const auth = await createAuth(c.var.platform);
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (session) {
        const row = await c.var.platform.db.select().from(user).where(eq(user.id, session.user.id)).get();
        if (row && !row.disabled) c.set("user", row);
      }
    }
  }
  await next();
});
