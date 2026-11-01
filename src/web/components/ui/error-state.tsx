import { useTranslation } from "react-i18next";
import { Button } from "./button";

/** Shown when data could not be loaded, with a way to try again. */
export function ErrorState({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{t("loadFailed")}</p>
      <p className="max-w-sm text-[13px] leading-snug text-muted">{t("loadFailedHint")}</p>
      <div className="mt-3">
        <Button onClick={onRetry} loading={retrying}>
          {t("retry")}
        </Button>
      </div>
    </div>
  );
}
