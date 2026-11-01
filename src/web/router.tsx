import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, Link, Outlet, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Shell } from "./components/shell";
import { Button } from "./components/ui";
import { rememberShared } from "./lib/share";
import { appConfigQuery, meQuery } from "./lib/session";
import { AuditPage } from "./pages/audit";
import { DashboardPage } from "./pages/dashboard";
import { DomainsPage } from "./pages/domains";
import { ForgotPasswordPage } from "./pages/forgot-password";
import { InvitePage } from "./pages/invite";
import { LinkDetailPage } from "./pages/link-detail";
import { LinksPage } from "./pages/links";
import { LinkStatsPage } from "./pages/link-stats";
import { LoginPage } from "./pages/login";
import { ApiHelpPage } from "./pages/api-help";
import { ProfilePage } from "./pages/profile";
import { RestorePage } from "./pages/restore";
import { PublicStatsPage } from "./pages/public-stats";
import { ResetPasswordPage } from "./pages/reset-password";
import { SettingsPage } from "./pages/settings";
import { SetupPage } from "./pages/setup";
import { UsersPage } from "./pages/users";

export type RouterContext = { queryClient: QueryClient };

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-muted">{t("notFound")}</p>
      <Link to="/links">
        <Button>{t("goHome")}</Button>
      </Link>
    </div>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

/* ---------------- public pages (no shell) ---------------- */

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (s: Record<string, unknown>): { error?: string } => (typeof s.error === "string" ? { error: s.error } : {}),
  beforeLoad: async ({ context: { queryClient } }) => {
    const config = await queryClient.ensureQueryData(appConfigQuery);
    if (config.setupRequired) throw redirect({ to: "/setup" });
    if (await queryClient.ensureQueryData(meQuery)) throw redirect({ to: "/links" });
  },
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: async ({ context: { queryClient } }) => {
    const config = await queryClient.ensureQueryData(appConfigQuery);
    if (!config.setupRequired) throw redirect({ to: "/login" });
  },
  component: SetupPage,
});

// Restoring a backup into a new, empty installation (open until the first account exists).
const restoreRoute = createRoute({ getParentRoute: () => rootRoute, path: "/restore", component: RestorePage });

const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: ForgotPasswordPage });

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  validateSearch: (s: Record<string, unknown>): { token?: string; error?: string } => ({
    ...(typeof s.token === "string" ? { token: s.token } : {}),
    ...(typeof s.error === "string" ? { error: s.error } : {}),
  }),
  component: ResetPasswordPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  validateSearch: (s: Record<string, unknown>): { error?: string } => (typeof s.error === "string" ? { error: s.error } : {}),
  component: InvitePage,
});

// Public statistics of a link (when its owner turned them on): no sign-in, no shell.
const publicStatsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/s/$linkId", component: PublicStatsPage });

/* ---------------- signed-in pages (inside the shell) ---------------- */

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const config = await queryClient.ensureQueryData(appConfigQuery);
    if (config.setupRequired) throw redirect({ to: "/setup" });
    if (!(await queryClient.ensureQueryData(meQuery))) {
      // A link shared to hop before signing in is picked up again after the sign-in.
      if (location.pathname === "/links") rememberShared(location.search as Record<string, unknown>);
      throw redirect({ to: "/login" });
    }
  },
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/links" });
  },
});

/*
 * Other areas: replace the page component in src/web/pages/<name>.tsx, and add
 * child routes (for example /links/$id) here, with `getParentRoute: () => appRoute`,
 * then list them in appRoute.addChildren([...]) below.
 */
const linksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/links",
  validateSearch: (s: Record<string, unknown>): { state?: string; share?: string; url?: string; text?: string } => ({
    ...(typeof s.state === "string" ? { state: s.state } : {}),
    ...(typeof s.share === "string" ? { share: s.share } : {}),
    ...(typeof s.url === "string" ? { url: s.url } : {}),
    ...(typeof s.text === "string" ? { text: s.text } : {}),
  }),
  component: LinksPage,
});
const linkDetailRoute = createRoute({ getParentRoute: () => appRoute, path: "/links/$id", component: LinkDetailPage });
const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: "/dashboard", component: DashboardPage });
const domainsRoute = createRoute({ getParentRoute: () => appRoute, path: "/domains", component: DomainsPage });
const usersRoute = createRoute({ getParentRoute: () => appRoute, path: "/users", component: UsersPage });
const auditRoute = createRoute({ getParentRoute: () => appRoute, path: "/audit", component: AuditPage });
const linkStatsRoute = createRoute({ getParentRoute: () => appRoute, path: "/stats/$linkId", component: LinkStatsPage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: SettingsPage });
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: "/profile", component: ProfilePage });
const apiHelpRoute = createRoute({ getParentRoute: () => appRoute, path: "/api-help", component: ApiHelpPage });

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  restoreRoute,
  forgotRoute,
  resetRoute,
  inviteRoute,
  publicStatsRoute,
  appRoute.addChildren([indexRoute, linksRoute, linkDetailRoute, dashboardRoute, linkStatsRoute, domainsRoute, usersRoute, auditRoute, settingsRoute, profileRoute, apiHelpRoute]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
