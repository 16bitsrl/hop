import { useTranslation } from "react-i18next";
import { Card, EmptyState, Switch } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { Breakdowns, ExportLinks, KpiRow, RangePicker, SeriesChart, TargetsCard, useStatsControls } from "./components";
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
  const { data, error } = useSummary(linkId, params);

  if (error && !data) {
    return (
      <Card>
        <EmptyState title={errorMessage(t, error)} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <RangePicker value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-4">
          <Switch checked={bots} onChange={setBots} label={t("includeBots")} />
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
