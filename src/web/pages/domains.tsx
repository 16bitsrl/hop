import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { Card, EmptyState, GlobeIcon } from "../components/ui";

/** Placeholder: the domains area replaces this page. */
export function DomainsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.domains")} />
      <Card>
        <EmptyState icon={<GlobeIcon />} title={t("comingSoon")} />
      </Card>
    </>
  );
}
