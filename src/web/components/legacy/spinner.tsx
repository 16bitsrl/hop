import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

export function Spinner({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 animate-spin text-current", className)}
      fill="none"
      role="status"
      aria-label={t("loading")}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Centered spinner for whole-page loading. */
export function PageSpinner() {
  return (
    <div className="flex min-h-40 items-center justify-center text-muted-foreground">
      <Spinner className="size-5" />
    </div>
  );
}
