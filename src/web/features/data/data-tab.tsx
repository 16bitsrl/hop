import { DownloadIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { YourlsImport } from "./yourls-import";

const linkClass = buttonVariants({ variant: "outline" });

/** Settings > Data: import from YOURLS, backup and export, restore instructions. */
export function DataTab() {
  const { t } = useTranslation("data");
  return (
    <>
      <YourlsImport />
      <Card>
        <CardHeader>
          <CardTitle>{t("backup.title")}</CardTitle>
          <CardDescription>{t("backup.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <a href="/api/data/backup?gzip=1" download className={linkClass}>
            <DownloadIcon data-icon="inline-start" />
            {t("backup.download")}
          </a>
          <a href="/api/data/links.csv" download className={linkClass}>
            <DownloadIcon data-icon="inline-start" />
            {t("backup.csv")}
          </a>
          <span className="text-[13px] text-muted-foreground">{t("backup.csvHint")}</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("restore.title")}</CardTitle>
          <CardDescription>{t("restore.description")}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
