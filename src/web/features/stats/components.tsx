import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartColumnIcon, DownloadIcon } from "lucide-react";
import { EmptyState } from "../../components/states";
import { buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { cn } from "../../lib/utils";
import { useFormat } from "./format";
import type { StatsParams } from "./queries";
import { browserTimeZone, defaultRange, RANGE_IDS, resolveRange, toDateInput, type RangeState } from "./range";
import type { Bucket, Row, Summary, TargetRow } from "./types";

/* ------------------------------ controls ------------------------------ */

/** Range, bots toggle and the query parameters they produce (null while a custom range is invalid). */
export function useStatsControls() {
  const [range, setRange] = useState<RangeState>(() => defaultRange());
  const [bots, setBots] = useState(false);
  const params = useMemo<StatsParams | null>(() => {
    const r = resolveRange(range);
    return r ? { ...r, tz: browserTimeZone(), bots } : null;
    // The range is resolved when it changes, so numbers stay put while the page is open.
  }, [range, bots]);
  return { range, setRange, bots, setBots, params };
}

export function RangePicker({ value, onChange }: { value: RangeState; onChange: (r: RangeState) => void }) {
  const { t } = useTranslation("stats");
  const invalid = value.id === "custom" && !resolveRange(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("range.label")} className="inline-flex flex-wrap rounded-lg bg-muted p-[3px]">
        {RANGE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={value.id === id}
            onClick={() => {
              if (id === "custom" && value.id !== "custom") {
                const d = defaultRange();
                onChange({ id, from: d.from, to: d.to });
              } else onChange({ ...value, id });
            }}
            className={cn(
              "h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap outline-none transition-[color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9",
              value.id === id ? "bg-card text-foreground shadow-(--shadow-raised) dark:bg-accent" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`range.${id}`)}
          </button>
        ))}
      </div>
      {value.id === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {t("range.from")}
            <Input
              type="date"
              className="w-36"
              value={value.from}
              max={toDateInput(new Date())}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {t("range.to")}
            <Input
              type="date"
              className="w-36"
              value={value.to}
              max={toDateInput(new Date())}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </label>
          {invalid && (
            <p role="alert" className="text-[13px] text-destructive">
              {t("range.invalid")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const linkClass = buttonVariants({ variant: "outline", size: "sm" });

/** Plain download links: the browser sends the session cookie. */
export function ExportLinks({ clicksUrl, summaryUrl }: { clicksUrl: string; summaryUrl: string }) {
  const { t } = useTranslation("stats");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={summaryUrl} download className={linkClass}>
        <DownloadIcon data-icon="inline-start" />
        {t("export.summary")}
      </a>
      <a href={clicksUrl} download className={linkClass}>
        <DownloadIcon data-icon="inline-start" />
        {t("export.clicks")}
      </a>
    </div>
  );
}

/* ------------------------------ KPI tiles ------------------------------ */

/** One number with its label. Pass `value={undefined}` while it loads. */
export function Kpi({ id, label, value, hint }: { id: string; label: string; value: ReactNode; hint?: string }) {
  return (
    <div data-testid={`kpi-${id}`} className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-(--shadow-raised)">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 mb-1 h-6 w-20" />
      ) : (
        <p data-testid={`kpi-${id}-value`} className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Clicks, unique visitors and (optionally) bot clicks. */
export function KpiRow({ data, withBots = true, extra }: { data: Summary | undefined; withBots?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const v = (n: number | undefined) => (n === undefined ? undefined : f.number(n));
  return (
    <div className={cn("grid grid-cols-2 gap-3", withBots || extra ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
      <Kpi id="clicks" label={t("kpi.clicks")} value={v(data?.totals.clicks)} />
      <Kpi id="visitors" label={t("kpi.visitors")} value={v(data?.totals.visitors)} hint={t("kpi.visitorsHint")} />
      {withBots && <Kpi id="bots" label={t("kpi.bots")} value={v(data?.totals.bots)} hint={t("kpi.botsHint")} />}
      {extra}
    </div>
  );
}

/* ------------------------------ time series ------------------------------ */

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

function SeriesTooltip({
  active,
  payload,
  bucket,
}: {
  active?: boolean;
  payload?: { payload: { key: string; clicks: number } }[];
  bucket: Bucket;
}) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-[13px] text-popover-foreground shadow-(--shadow-overlay)">
      <p className="text-muted-foreground">{f.bucket(p.key, bucket, true)}</p>
      <p className="font-medium tabular-nums">{t("chart.clicks", { count: p.clicks, formatted: f.number(p.clicks) })}</p>
    </div>
  );
}

export function SeriesChart({ data, title }: { data: Summary | undefined; title?: string }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const series = data?.series ?? [];
  const bucket = data?.range.bucket ?? "day";
  const empty = !!data && data.totals.clicks === 0 && series.every((p) => p.clicks === 0);
  const common = {
    data: series,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="key"
        tickFormatter={(k: string) => f.bucket(k, bucket)}
        tick={axisTick}
        tickLine={false}
        axisLine={{ stroke: "var(--border)" }}
        minTickGap={24}
      />
      <YAxis
        allowDecimals={false}
        width={40}
        tick={axisTick}
        tickLine={false}
        axisLine={false}
        tickFormatter={(n: number) => f.number(n)}
      />
      <Tooltip cursor={{ fill: "var(--muted)", stroke: "var(--border)" }} content={<SeriesTooltip bucket={bucket} />} />
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? t("chart.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!data ? (
          <Skeleton role="status" aria-label={t("common:loading")} className="h-60 w-full" />
        ) : empty ? (
          <EmptyState icon={<ChartColumnIcon />} title={t("empty.title")} description={t("empty.hint")} />
        ) : (
          <div
            role="img"
            aria-label={t("chart.label", { clicks: f.number(data?.totals.clicks ?? 0) })}
            data-testid="series-chart"
            className="h-60 w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              {series.length > 45 ? (
                <AreaChart {...common}>
                  {axes}
                  <Area isAnimationActive={false} type="monotone" dataKey="clicks" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.16} />
                </AreaChart>
              ) : (
                <BarChart {...common}>
                  {axes}
                  <Bar isAnimationActive={false} dataKey="clicks" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={36} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ breakdowns ------------------------------ */

type BreakdownItem = { id: string; label: ReactNode; sub?: ReactNode; clicks: number };

/** Ranked list with a bar behind each name. `total` is what the percentages are relative to. */
export function BreakdownTable({
  id,
  title,
  items,
  total,
  className,
}: {
  id: string;
  title: string;
  items: BreakdownItem[];
  total: number;
  className?: string;
}) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const max = Math.max(1, ...items.map((i) => i.clicks));
  return (
    <Card data-testid={`breakdown-${id}`} className={cn("gap-0 pb-0", className)}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{t("noData")}</p>
      ) : (
        <Table>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>{title}</TableHead>
              <TableHead>{t("kpi.clicks")}</TableHead>
              <TableHead>{t("share")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="relative w-full max-w-0 py-2">
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-2.5 rounded-md bg-chart-1/14"
                    style={{ width: `calc(${(item.clicks / max) * 100}% - 0.5rem)` }}
                  />
                  <span className="relative block truncate">
                    {item.label}
                    {item.sub && <span className="ml-1.5 text-xs text-muted-foreground">{item.sub}</span>}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{f.number(item.clicks)}</TableCell>
                <TableCell className="w-14 pl-0 text-right text-[13px] tabular-nums text-muted-foreground">
                  {total > 0 ? f.percent(item.clicks / total) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

const UNKNOWN = "__unknown__";

const toItems = (rows: Row[], label: (key: string | null) => string): BreakdownItem[] =>
  rows.map((r) => ({ id: r.key ?? UNKNOWN, label: label(r.key), clicks: r.clicks }));

/** Referrers, countries, cities, devices, operating systems, browsers and languages. */
export function Breakdowns({ data, show = ["referrers", "countries", "cities", "devices", "os", "browsers", "languages"] }: {
  data: Summary | undefined;
  show?: string[];
}) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  if (!data) return <BreakdownsSkeleton count={show.length} />;
  const total = data.totals.clicks;
  const deviceName = (k: string | null) => (k ? t(`devices.${k}`, { defaultValue: k }) : t("unknown"));
  const has = (k: string) => show.includes(k);
  return (
    <div className={cn("grid gap-4", show.length > 1 && "lg:grid-cols-2")}>
      {has("referrers") && (
        <BreakdownTable id="referrers" title={t("breakdown.referrers")} total={total} items={toItems(data.referrers, (k) => k ?? t("direct"))} />
      )}
      {has("countries") && (
        <BreakdownTable id="countries" title={t("breakdown.countries")} total={total} items={toItems(data.countries, f.country)} />
      )}
      {has("cities") && data.cities && (
        <BreakdownTable
          id="cities"
          title={t("breakdown.cities")}
          total={total}
          items={data.cities.map((c) => ({ id: `${c.key}|${c.country}`, label: c.key, sub: c.country ? f.country(c.country) : undefined, clicks: c.clicks }))}
        />
      )}
      {has("devices") && <BreakdownTable id="devices" title={t("breakdown.devices")} total={total} items={toItems(data.devices, deviceName)} />}
      {has("os") && <BreakdownTable id="os" title={t("breakdown.os")} total={total} items={toItems(data.os, (k) => k ?? t("unknown"))} />}
      {has("browsers") && (
        <BreakdownTable id="browsers" title={t("breakdown.browsers")} total={total} items={toItems(data.browsers, (k) => k ?? t("unknown"))} />
      )}
      {has("languages") && (
        <BreakdownTable id="languages" title={t("breakdown.languages")} total={total} items={toItems(data.languages, f.language)} />
      )}
    </div>
  );
}

/** Placeholder cards while the breakdowns load. */
export function BreakdownsSkeleton({ count = 2 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("loading")} className={cn("grid gap-4", count > 1 && "lg:grid-cols-2")}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="gap-0 pb-0">
          <CardHeader className="border-b">
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <div className="flex flex-col gap-3 p-4">
            {[70, 45, 30].map((w) => (
              <div key={w} className="flex items-center gap-4">
                <Skeleton className="h-5" style={{ width: `${w}%` }} />
                <Skeleton className="ml-auto h-3.5 w-8" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------ A/B tests and rules ------------------------------ */

function shortUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return (u.host + (u.pathname === "/" ? "" : u.pathname) + u.search).replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Clicks per destination: main, each rule and each A/B variant. Only worth showing with more than one. */
export function TargetsCard({ targets }: { targets: TargetRow[] }) {
  const { t } = useTranslation("stats");
  const total = targets.reduce((n, x) => n + x.clicks, 0);
  const name = (target: string) => {
    const [kind, index] = target.split(":");
    if (kind === "rule") return t("targets.rule", { n: Number(index) + 1 });
    if (kind === "variant") {
      const i = Number(index);
      return t("targets.variant", { name: i < 26 ? String.fromCharCode(65 + i) : String(i + 1) });
    }
    return t("targets.main");
  };
  return (
    <BreakdownTable
      id="targets"
      title={t("targets.title")}
      total={total}
      className="lg:col-span-2"
      items={targets.map((x) => ({
        id: x.target,
        label: name(x.target),
        sub: shortUrl(x.url),
        clicks: x.clicks,
      }))}
    />
  );
}
