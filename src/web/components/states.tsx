import type { ReactNode } from "react";
import { InboxIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Nothing to show yet. Give it the icon of the thing that is missing. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <InboxIcon />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** Shown when data could not be loaded, with a way to try again. */
export function ErrorState({ onRetry, retrying, className }: { onRetry: () => void; retrying?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <Empty role="alert" className={cn("py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive-soft text-destructive">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{t("loadFailed")}</EmptyTitle>
        <EmptyDescription>{t("loadFailedHint")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCwIcon data-icon="inline-start" />}
          {t("retry")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Centered spinner, for loading whose layout is not known in advance. */
export function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-40 items-center justify-center text-muted-foreground", className)}>
      <Spinner className="size-5" />
    </div>
  );
}

/** Placeholder rows for a table or list while it loads. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("loading")} className={cn("flex flex-col divide-y", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
