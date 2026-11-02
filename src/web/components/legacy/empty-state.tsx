import type { ReactNode } from "react";
import { InboxIcon } from "./icons";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <div className="mb-2 flex size-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
        {icon ?? <InboxIcon />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-snug text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
