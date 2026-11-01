import { Hono } from "hono";
import type { AppEnv } from "../env";

/** All JSON API routes, mounted at /api. Feature modules register here. */
export const apiRoutes = new Hono<AppEnv>();

apiRoutes.get("/status", (c) => c.json({ ok: true, platform: c.var.platform.name }));
