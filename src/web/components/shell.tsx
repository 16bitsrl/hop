import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ChartColumnIcon,
  GlobeIcon,
  HistoryIcon,
  Link2Icon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { setLanguage, type Language } from "../i18n";
import { authClient } from "../lib/auth-client";
import { isAdmin, useMe } from "../lib/session";

type NavItem = { to: string; label: string; icon: LucideIcon };

function NavLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-lg:min-h-10 data-[status=active]:bg-primary-soft data-[status=active]:text-primary"
    >
      <Icon className="size-4 shrink-0 opacity-80 transition-opacity group-hover:opacity-100 group-data-[status=active]:opacity-100" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function Brand() {
  return (
    <Link to="/links" className="flex w-fit items-center gap-2 rounded-md px-2.5">
      <img src="/icon.svg" alt="" className="size-6" />
      <span className="text-[15px] font-semibold tracking-tight">hop</span>
    </Link>
  );
}

function SidebarContent({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  const me = useMe();
  const main: NavItem[] = [
    { to: "/links", label: t("nav.links"), icon: Link2Icon },
    { to: "/dashboard", label: t("nav.dashboard"), icon: ChartColumnIcon },
    { to: "/domains", label: t("nav.domains"), icon: GlobeIcon },
  ];
  const admin: NavItem[] = [
    { to: "/users", label: t("nav.users"), icon: UsersIcon },
    { to: "/audit", label: t("nav.audit"), icon: HistoryIcon },
    { to: "/settings", label: t("nav.settings"), icon: SettingsIcon },
  ];
  return (
    <div className="flex h-full flex-col gap-5 py-4">
      <Brand />
      <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label={t("nav.main")}>
        {main.map((i) => (
          <NavLink key={i.to} item={i} />
        ))}
        {isAdmin(me) && (
          <>
            <p className="mt-5 mb-1 px-2.5 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">{t("nav.admin")}</p>
            {admin.map((i) => (
              <NavLink key={i.to} item={i} />
            ))}
          </>
        )}
        <div className="mt-auto pt-4">
          <NavLink item={{ to: "/profile", label: t("nav.profile"), icon: UserIcon }} />
        </div>
      </nav>
      <div className="mx-2 flex items-center gap-2.5 border-t px-1 pt-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary uppercase"
          aria-hidden="true"
        >
          {me.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{me.name}</p>
          <p className="truncate text-xs text-muted-foreground">{t(`roles.${me.role}`)}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onSignOut} aria-label={t("signOut")} title={t("signOut")}>
          <LogOutIcon />
        </Button>
      </div>
    </div>
  );
}

/** Signed-in layout: sidebar on desktop, a sheet from the left on smaller screens. Pages render in the Outlet. */
export function Shell() {
  const { t } = useTranslation();
  const me = useMe();
  const [drawer, setDrawer] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setDrawer(false), [pathname]);

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
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r bg-card lg:block">
        <SidebarContent onSignOut={signOut} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b bg-card/90 px-2 backdrop-blur lg:hidden">
        {/* Focus moves into the menu, Tab stays inside, the page behind is inert, and focus goes back to the menu button on close. */}
        <Sheet open={drawer} onOpenChange={setDrawer}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label={t("openMenu")} />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 max-w-[85%] gap-0 p-0 lg:hidden">
            <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
            <SheetDescription className="sr-only">{t("nav.main")}</SheetDescription>
            <SidebarContent onSignOut={signOut} />
          </SheetContent>
        </Sheet>
        <Brand />
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
