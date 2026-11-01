import { useTranslation } from "react-i18next";
import { Card, CardBody, CardHeader } from "../../components/ui";
import { YourlsImport } from "./yourls-import";

const buttonClass =
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg shadow-sm transition-colors hover:bg-subtle";

/** Settings > Data: import from YOURLS, backup and export, restore instructions. */
export function DataTab() {
  const { t } = useTranslation("data");
  return (
    <>
      <YourlsImport />
      <Card>
        <CardHeader title={t("backup.title")} description={t("backup.description")} />
        <CardBody className="flex flex-wrap items-center gap-3">
          <a href="/api/data/backup?gzip=1" download className={buttonClass}>
            {t("backup.download")}
          </a>
          <a href="/api/data/links.csv" download className={buttonClass}>
            {t("backup.csv")}
          </a>
          <span className="text-[13px] text-muted">{t("backup.csvHint")}</span>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("restore.title")} description={t("restore.description")} />
      </Card>
    </>
  );
}
