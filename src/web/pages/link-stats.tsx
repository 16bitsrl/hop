import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { api } from "../lib/api";
import { LinkStats } from "../features/stats/link-stats";
import type { Summary } from "../features/stats/types";

/** Full page with the statistics of one link, at /stats/<linkId>. */
export function LinkStatsPage() {
  const { t } = useTranslation("stats");
  const { linkId } = useParams({ from: "/app/stats/$linkId" });
  // An empty range, just to learn the link's name; the numbers come from <LinkStats>.
  const { data } = useQuery({
    queryKey: ["stats", "link-title", linkId],
    queryFn: () => api<Summary>(`/api/stats/summary?linkId=${encodeURIComponent(linkId)}&from=0&to=0`),
  });
  const link = data?.link;
  const address = link ? `${link.host}/${link.slug}` : undefined;
  return (
    <>
      <PageHeader
        title={link?.title || address || t("page.title")}
        description={link?.title ? <span className="font-mono">{address}</span> : undefined}
        actions={
          <Link to="/dashboard" className="tap-link text-[13px] text-muted hover:text-fg">
            {t("page.backToDashboard")}
          </Link>
        }
      />
      <LinkStats linkId={linkId} />
    </>
  );
}
