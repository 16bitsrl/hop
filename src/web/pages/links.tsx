import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { Card, EmptyState, LinkIcon } from "../components/ui";

/** Placeholder: the links area replaces this page. */
export function LinksPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("nav.links")} />
      <Card>
        <EmptyState icon={<LinkIcon />} title={t("comingSoon")} />
      </Card>
    </>
  );
}
