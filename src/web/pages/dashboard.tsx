import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { Card, CardHeader, Switch, Table, TBody, Td, Th, THead, Tr } from "../components/ui";
import {
  Breakdowns,
  BreakdownTable,
  ExportLinks,
  Kpi,
  KpiRow,
  RangePicker,
  SeriesChart,
  useStatsControls,
} from "../features/stats/components";
import { BrokenLinksCard } from "../features/data/health";
import { useFormat } from "../features/stats/format";
import { exportUrl, useDashboard } from "../features/stats/queries";
import type { Dashboard } from "../features/stats/types";
import { errorMessage } from "../lib/errors";

/** Team dashboard: the whole installation over a period. */
export function DashboardPage() {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const { range, setRange, bots, setBots, params } = useStatsControls();
  const { data, error } = useDashboard(params);

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <RangePicker value={range} onChange={setRange} />
          <div className="flex flex-wrap items-center gap-4">
            <Switch checked={bots} onChange={setBots} label={t("includeBots")} />
            {params && <ExportLinks clicksUrl={exportUrl("clicks", null, params)} summaryUrl={exportUrl("summary", null, params)} />}
          </div>
        </div>
        {error && !data && <p role="alert" className="text-sm text-danger">{errorMessage(t, error)}</p>}
        <KpiRow
          data={data}
          extra={<Kpi id="links" label={t("kpi.links")} value={data ? f.number(data.linkCount) : "–"} hint={t("kpi.linksHint")} />}
        />
        <SeriesChart data={data} />
        <div className="grid gap-4 lg:grid-cols-2">
          <TopLinks data={data} />
          <Breakdowns data={data} show={["countries"]} />
        </div>
        <Breakdowns data={data} show={["referrers", "devices"]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <RecentLinks data={data} />
          <LinksByOwner data={data} />
        </div>
        <BrokenLinksCard />
      </div>
    </>
  );
}

function TopLinks({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  const total = data?.totals.clicks ?? 0;
  return (
    <BreakdownTable
      id="top-links"
      title={t("dashboard.topLinks")}
      total={total}
      items={(data?.topLinks ?? []).map((l) => ({
        id: l.id,
        label: (
          <Link to="/stats/$linkId" params={{ linkId: l.id }} className="hover:underline">
            {l.title || `${l.host}/${l.slug}`}
          </Link>
        ),
        sub: l.title ? `${l.host}/${l.slug}` : undefined,
        clicks: l.clicks,
      }))}
    />
  );
}

function RecentLinks({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  return (
    <Card data-testid="dash-recent">
      <CardHeader title={t("dashboard.recent")} />
      {!data?.recentLinks.length ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">{t("dashboard.noLinks")}</p>
      ) : (
        <Table stack>
          <THead className="sr-only">
            <tr>
              <Th>{t("dashboard.link")}</Th>
              <Th>{t("dashboard.createdBy")}</Th>
              <Th>{t("dashboard.created")}</Th>
            </tr>
          </THead>
          <TBody>
            {data.recentLinks.map((l) => (
              <Tr key={l.id}>
                <Td className="max-w-0 w-full truncate">
                  <Link to="/stats/$linkId" params={{ linkId: l.id }} className="font-mono text-[13px] hover:underline">
                    {l.host}/{l.slug}
                  </Link>
                  {l.title && <span className="ml-1.5 text-xs text-muted">{l.title}</span>}
                </Td>
                <Td className="whitespace-nowrap text-[13px] text-muted">{l.ownerName}</Td>
                <Td className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted">{f.date(l.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function LinksByOwner({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  return (
    <Card data-testid="dash-owners">
      <CardHeader title={t("dashboard.byOwner")} />
      {!data?.linksByOwner.length ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">{t("dashboard.noLinks")}</p>
      ) : (
        <Table>
          <THead className="sr-only">
            <tr>
              <Th>{t("dashboard.owner")}</Th>
              <Th>{t("dashboard.links")}</Th>
            </tr>
          </THead>
          <TBody>
            {data.linksByOwner.map((o) => (
              <Tr key={o.ownerId ?? "none"}>
                <Td className="w-full">{o.name ?? t("dashboard.noOwner")}</Td>
                <Td className="text-right font-medium tabular-nums">{f.number(o.links)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
