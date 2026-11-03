import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/states";
import { SwitchField } from "../../components/toggle-field";
import { Card } from "../../components/ui/card";
import { Breakdowns, ExportLinks, KpiRow, RangePicker, SeriesChart, TargetsCard, useStatsControls } from "./components";
import { PublishStatsCard } from "./publish-card";
import { exportUrl, useSummary } from "./queries";

/**
 * Statistics of one link: range picker, KPIs, clicks over time, breakdowns, A/B test and rules
 * performance, bots toggle and CSV export. Embed it in the link's "Statistics" tab:
 *
 *   <LinkStats linkId={link.id} />
 */
export function LinkStats({ linkId }: { linkId: string }) {
  const { t } = useTranslation("stats");
  const { range, setRange, bots, setBots, params } = useStatsControls();
  const { data, isError, isFetching, refetch } = useSummary(linkId, params);

  if (isError && !data) {
    return (
      <Card>
        <ErrorState onRetry={() => refetch()} retrying={isFetching} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PublishStatsCard linkId={linkId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-4">
          <SwitchField checked={bots} onCheckedChange={setBots} label={t("includeBots")} className="items-center" />
          {params && <ExportLinks clicksUrl={exportUrl("clicks", linkId, params)} summaryUrl={exportUrl("summary", linkId, params)} />}
        </div>
      </div>
      <KpiRow data={data} />
      <SeriesChart data={data} />
      {data?.targets && data.targets.length > 1 && <TargetsCard targets={data.targets} />}
      <Breakdowns data={data} />
    </div>
  );
}
