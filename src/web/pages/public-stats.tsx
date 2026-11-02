import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChartNoAxesColumnIcon } from "lucide-react";
import { EmptyState, ErrorState } from "../components/states";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Breakdowns, KpiRow, RangePicker, SeriesChart, useStatsControls } from "../features/stats/components";
import { usePublicSummary } from "../features/stats/queries";
import { ApiError } from "../lib/api";

/** Read-only statistics of a link, reachable without signing in at /s/<linkId> when its owner turned them on. */
export function PublicStatsPage() {
  const { t } = useTranslation("stats");
  const { linkId } = useParams({ from: "/s/$linkId" });
  const { range, setRange, params } = useStatsControls();
  const { data, error, isFetching, refetch } = usePublicSummary(linkId, params);
  const notPublic = error instanceof ApiError && error.status === 404;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center gap-2">
        <img src="/icon.svg" alt="" className="size-6" />
        <span className="text-[15px] font-semibold tracking-tight">hop</span>
      </header>
      {notPublic ? (
        <Card>
          <EmptyState icon={<ChartNoAxesColumnIcon />} title={t("public.off")} description={t("public.offHint")} />
        </Card>
      ) : error && !data ? (
        <Card>
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </Card>
      ) : (
        <>
          <div>
            <p className="text-[13px] text-muted-foreground">{t("public.title")}</p>
            <h1 className="text-xl font-semibold tracking-tight">
              {data?.link ? `${data.link.host}/${data.link.slug}` : <Skeleton className="my-1 h-5 w-48" />}
            </h1>
            {data?.link?.title && <p className="mt-0.5 text-[13px] text-muted-foreground">{data.link.title}</p>}
          </div>
          <RangePicker value={range} onChange={setRange} />
          <KpiRow data={data} withBots={false} />
          <SeriesChart data={data} />
          <Breakdowns data={data} show={["referrers", "countries", "devices", "os", "browsers", "languages"]} />
        </>
      )}
    </div>
  );
}
