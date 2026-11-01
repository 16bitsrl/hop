import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { setLanguage, type Language } from "../i18n";
import { authClient } from "../lib/auth-client";
import { cn } from "../lib/cn";
import { isAdmin, useMe } from "../lib/session";
import {
  ChartIcon,
  CloseIcon,
  GlobeIcon,
  HistoryIcon,
  LinkIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from "./ui/icons";

type NavItem = { to: string; label: string; icon: ReactNode };

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg"
      activeProps={{ className: "bg-subtle !text-fg" }}
    >
      <span className="text-current opacity-80 group-hover:opacity-100">{item.icon}</span>
      {item.label}
    </Link>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-accent-fg">h</span>
      <span className="text-[15px] font-semibold tracking-tight">hop</span>
    </div>
  );
}

function SidebarContent({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const me = useMe();
  const main: NavItem[] = [
    { to: "/links", label: t("nav.links"), icon: <LinkIcon /> },
    { to: "/dashboard", label: t("nav.dashboard"), icon: <ChartIcon /> },
    { to: "/domains", label: t("nav.domains"), icon: <GlobeIcon /> },
  ];
  const admin: NavItem[] = [
    { to: "/users", label: t("nav.users"), icon: <UsersIcon /> },
    { to: "/audit", label: t("nav.audit"), icon: <HistoryIcon /> },
    { to: "/settings", label: t("nav.settings"), icon: <SettingsIcon /> },
  ];
  return (
    <div className="flex h-full flex-col gap-4 py-4">
      <Brand />
      <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label={t("nav.main")}>
        {main.map((i) => (
          <NavLink key={i.to} item={i} />
        ))}
        {isAdmin(me) && (
          <>
            <p className="mb-1 mt-5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted/80">{t("nav.admin")}</p>
            {admin.map((i) => (
              <NavLink key={i.to} item={i} />
            ))}
          </>
        )}
        <div className="mt-auto pt-4">
          <NavLink item={{ to: "/profile", label: t("nav.profile"), icon: <UserIcon /> }} />
        </div>
      </nav>
      <div className="mx-2 flex items-center gap-2.5 border-t border-line px-1 pt-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold uppercase text-muted">
          {me.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{me.name}</p>
          <p className="truncate text-xs text-muted">{t(`roles.${me.role}`)}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          aria-label={t("signOut")}
          title={t("signOut")}
          className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
        >
          <LogOutIcon />
        </button>
      </div>
    </div>
  );
}

/** Signed-in layout: sidebar on desktop, drawer on mobile. Pages render in the Outlet. */
export function Shell() {
  const { t } = useTranslation();
  const me = useMe();
  const [drawer, setDrawer] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setDrawer(false), [pathname]);

  // Escape closes the menu on a phone.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  // The user's saved language wins over the browser's.
  useEffect(() => {
    if (me.locale === "en" || me.locale === "it") setLanguage(me.locale as Language);
  }, [me.locale]);

  async function signOut() {
    await authClient.signOut();
    // A fresh page load drops everything cached for this user. Clearing the cache in place would
    // re-render this signed-in shell without a user first.
    window.location.assign("/login");
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <SidebarContent onSignOut={signOut} />
      </aside>

      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label={t("openMenu")}
          className="rounded-md p-2 text-muted hover:bg-subtle hover:text-fg"
        >
          <MenuIcon />
        </button>
        <Brand />
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t("openMenu")}>
          <div className="absolute inset-0 bg-black/45" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85%] animate-[hop-slide_160ms_ease-out] border-r border-line bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label={t("closeMenu")}
              className={cn("absolute right-2 top-3 rounded-md p-2 text-muted hover:bg-subtle hover:text-fg")}
            >
              <CloseIcon />
            </button>
            <SidebarContent onSignOut={signOut} />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
