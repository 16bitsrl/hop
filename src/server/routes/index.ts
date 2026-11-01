import { Hono } from "hono";
import type { AppEnv } from "../env";
import { testLinksRoutes } from "./test-links";

/** All JSON API routes, mounted at /api. Feature modules register here. */
export const apiRoutes = new Hono<AppEnv>();

apiRoutes.get("/status", (c) => c.json({ ok: true, platform: c.var.platform.name }));
apiRoutes.route("/_test", testLinksRoutes);
