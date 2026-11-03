import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { ErrorState } from "../components/states";
import { SwitchField } from "../components/toggle-field";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  Breakdowns,
  BreakdownsSkeleton,
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

/** Team dashboard: the whole installation over a period. */
export function DashboardPage() {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const { range, setRange, bots, setBots, params } = useStatsControls();
  const { data, isError, isFetching, refetch } = useDashboard(params);

  return (
    <>
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <RangePicker value={range} onChange={setRange} />
          <div className="flex flex-wrap items-center gap-4">
            <SwitchField checked={bots} onCheckedChange={setBots} label={t("includeBots")} className="items-center" />
            {params && <ExportLinks clicksUrl={exportUrl("clicks", null, params)} summaryUrl={exportUrl("summary", null, params)} />}
          </div>
        </div>
        {isError && !data ? (
          <Card>
            <ErrorState onRetry={() => refetch()} retrying={isFetching} />
          </Card>
        ) : (
          <>
            <KpiRow
              data={data}
              extra={<Kpi id="links" label={t("kpi.links")} value={data ? f.number(data.linkCount) : undefined} hint={t("kpi.linksHint")} />}
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
          </>
        )}
      </div>
    </>
  );
}

function TopLinks({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  if (!data) return <BreakdownsSkeleton count={1} />;
  const total = data?.totals.clicks ?? 0;
  return (
    <BreakdownTable
      id="top-links"
      title={t("dashboard.topLinks")}
      total={total}
      items={(data?.topLinks ?? []).map((l) => ({
        id: l.id,
        label: (
          <Link to="/links/$id/$tab" params={{ id: l.id, tab: "stats" }} className="hover:underline">
            {l.title || `${l.host}/${l.slug}`}
          </Link>
        ),
        sub: l.title ? `${l.host}/${l.slug}` : undefined,
        clicks: l.clicks,
      }))}
    />
  );
}

/** Placeholder rows for the small dashboard tables. */
function RowsSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-3 p-4">
      {[60, 45, 52].map((w) => (
        <div key={w} className="flex items-center gap-4">
          <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
          <Skeleton className="ml-auto h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}

function RecentLinks({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  return (
    <Card data-testid="dash-recent" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>{t("dashboard.recent")}</CardTitle>
      </CardHeader>
      {!data ? (
        <RowsSkeleton />
      ) : !data.recentLinks.length ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{t("dashboard.noLinks")}</p>
      ) : (
        <Table stack>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>{t("dashboard.link")}</TableHead>
              <TableHead>{t("dashboard.createdBy")}</TableHead>
              <TableHead>{t("dashboard.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recentLinks.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="w-full max-w-0 truncate">
                  <Link to="/links/$id/$tab" params={{ id: l.id, tab: "stats" }} className="font-mono text-[13px] hover:underline">
                    {l.host}/{l.slug}
                  </Link>
                  {l.title && <span className="ml-1.5 text-xs text-muted-foreground">{l.title}</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">{l.ownerName}</TableCell>
                <TableCell className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted-foreground">{f.date(l.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function LinksByOwner({ data }: { data: Dashboard | undefined }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  return (
    <Card data-testid="dash-owners" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>{t("dashboard.byOwner")}</CardTitle>
      </CardHeader>
      {!data ? (
        <RowsSkeleton />
      ) : !data.linksByOwner.length ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{t("dashboard.noLinks")}</p>
      ) : (
        <Table>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>{t("dashboard.owner")}</TableHead>
              <TableHead>{t("dashboard.links")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.linksByOwner.map((o) => (
              <TableRow key={o.ownerId ?? "none"}>
                <TableCell className="w-full">{o.name ?? t("dashboard.noOwner")}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{f.number(o.links)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
