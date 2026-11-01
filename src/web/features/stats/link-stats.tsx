import { useTranslation } from "react-i18next";
import { Card, CardBody } from "../../components/ui";

/** Placeholder: the statistics area replaces this component. */
export function LinkStats({ linkId }: { linkId: string }) {
  const { t } = useTranslation();
  return (
    <Card data-link-id={linkId}>
      <CardBody>
        <p className="text-sm text-muted">{t("comingSoon")}</p>
      </CardBody>
    </Card>
  );
}
