import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { Card, ChartIcon, EmptyState } from "../components/ui";

/** Placeholder: the statistics area replaces this page. */
export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.dashboard")} />
      <Card>
        <EmptyState icon={<ChartIcon />} title={t("comingSoon")} />
      </Card>
    </>
  );
}
