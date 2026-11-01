import { Hono } from "hono";
import { csrfGuard } from "../auth/csrf";
import { sessionMiddleware } from "../auth/session";
import type { AppEnv } from "../env";
import { auditRoutes } from "./audit";
import { authRoutes } from "./auth";
import { settingsRoutes } from "./settings";
import { statsRoutes } from "./stats";
import { testAuthRoutes } from "./test-auth";
import { userRoutes } from "./users";
import { testLinksRoutes } from "./test-links";
import { domainRoutes } from "./domains";
import { linkSettingsRoutes } from "./link-settings";
import { linksRoutes } from "./links";
import { mediaRoutes } from "./media";
import { taxonomyRoutes } from "./taxonomy";
import { testPagesRoutes } from "./test-pages";
import { testStatsRoutes } from "./test-stats";
import { apiKeyRoutes } from "./api-keys";
import { dataBackupRoutes } from "./data-backup";
import { dataImportRoutes } from "./data-import";
import { linkHealthRoutes } from "./link-health";
import { testDataRoutes } from "./test-data";

/** All JSON API routes, mounted at /api. Feature modules register here. */
export const apiRoutes = new Hono<AppEnv>();

// Changes made with a cookie must come from the app's own origin.
apiRoutes.use("*", csrfGuard);

// Every API request knows who is calling (`c.var.user`, null when signed out).
apiRoutes.use("*", sessionMiddleware);

apiRoutes.get("/status", (c) => c.json({ ok: true, platform: c.var.platform.name }));

// Area A: authentication, users, settings, audit log, test helpers.
apiRoutes.route("/", authRoutes);
apiRoutes.route("/", userRoutes);
apiRoutes.route("/", settingsRoutes);
apiRoutes.route("/", auditRoutes);
// Area B: links, domains, tags, folders, blocked destinations, media.
apiRoutes.route("/", linksRoutes);
apiRoutes.route("/", domainRoutes);
apiRoutes.route("/", taxonomyRoutes);
apiRoutes.route("/", linkSettingsRoutes);
apiRoutes.route("/", mediaRoutes);
apiRoutes.route("/_test", testPagesRoutes);
apiRoutes.route("/_test", testAuthRoutes);
apiRoutes.route("/_test", testLinksRoutes);

// Area D: statistics (and public statistics under /public/stats).
apiRoutes.route("/", statsRoutes);
apiRoutes.route("/_test", testStatsRoutes);

// Area E: data import and backup, broken link check, personal API keys.
apiRoutes.route("/", dataImportRoutes);
apiRoutes.route("/", dataBackupRoutes);
apiRoutes.route("/", linkHealthRoutes);
apiRoutes.route("/", apiKeyRoutes);
apiRoutes.route("/_test", testDataRoutes);
