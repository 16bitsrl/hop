import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { isAdmin, useMe } from "../lib/session";
import { EmptyState } from "./states";

/** Page title row. Put the main action last in `actions`. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
      <EmptyState icon={<LockIcon />} title={t("noAccess")} description={t("noAccessHint")} />
    </Card>
  );
}
