import { Hono } from "hono";
import { sessionMiddleware } from "../auth/session";
import type { AppEnv } from "../env";
import { auditRoutes } from "./audit";
import { authRoutes } from "./auth";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { testAuthRoutes } from "./test-auth";
import { userRoutes } from "./users";
import { testLinksRoutes } from "./test-links";
import { testStatsRoutes } from "./test-stats";

/** All JSON API routes, mounted at /api. Feature modules register here. */
export const apiRoutes = new Hono<AppEnv>();

// Every API request knows who is calling (`c.var.user`, null when signed out).
apiRoutes.use("*", sessionMiddleware);

apiRoutes.get("/status", (c) => c.json({ ok: true, platform: c.var.platform.name }));

// Area A: authentication, users, settings, audit log, test helpers.
apiRoutes.route("/", authRoutes);
apiRoutes.route("/", userRoutes);
apiRoutes.route("/", settingsRoutes);
apiRoutes.route("/", auditRoutes);
apiRoutes.route("/_test", testAuthRoutes);
apiRoutes.route("/_test", testLinksRoutes);

// Area D: statistics (and public statistics under /public/stats).
apiRoutes.route("/", statsRoutes);
apiRoutes.route("/_test", testStatsRoutes);
