import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isAdmin, useMe } from "../lib/session";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";

/** Page title row. Put the main action in `actions`. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Wrap admin-only pages. Everyone else sees a short explanation. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const me = useMe();
  const { t } = useTranslation();
  if (isAdmin(me)) return <>{children}</>;
  return (
    <Card>
      <EmptyState title={t("noAccess")} description={t("noAccessHint")} />
    </Card>
  );
}
