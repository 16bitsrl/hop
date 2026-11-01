import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody, CardHeader, EmptyState, Input, Table, TBody, Td, Th, THead, Tr } from "../../components/ui";
import { ChartIcon } from "../../components/ui/icons";
import { cn } from "../../lib/cn";
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
      <div role="group" aria-label={t("range.label")} className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5 shadow-sm">
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
              "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              value.id === id ? "bg-subtle text-fg shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-muted hover:text-fg",
            )}
          >
            {t(`range.${id}`)}
          </button>
        ))}
      </div>
      {value.id === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t("range.from")}
            <Input
              type="date"
              className="h-8 w-36"
              value={value.from}
              max={toDateInput(new Date())}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            {t("range.to")}
            <Input
              type="date"
              className="h-8 w-36"
              value={value.to}
              max={toDateInput(new Date())}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </label>
          {invalid && (
            <p role="alert" className="text-[13px] text-danger">
              {t("range.invalid")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const linkClass =
  "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-fg shadow-sm transition-colors hover:bg-subtle";

/** Plain download links: the browser sends the session cookie. */
export function ExportLinks({ clicksUrl, summaryUrl }: { clicksUrl: string; summaryUrl: string }) {
  const { t } = useTranslation("stats");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={summaryUrl} download className={linkClass}>
        {t("export.summary")}
      </a>
      <a href={clicksUrl} download className={linkClass}>
        {t("export.clicks")}
      </a>
    </div>
  );
}

/* ------------------------------ KPI tiles ------------------------------ */

export function Kpi({ id, label, value, hint }: { id: string; label: string; value: ReactNode; hint?: string }) {
  return (
    <div data-testid={`kpi-${id}`} className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[13px] text-muted">{label}</p>
      <p data-testid={`kpi-${id}-value`} className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Clicks, unique visitors and (optionally) bot clicks. */
export function KpiRow({ data, withBots = true, extra }: { data: Summary | undefined; withBots?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation("stats");
  const f = useFormat();
  const v = (n: number | undefined) => (n === undefined ? "–" : f.number(n));
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", withBots || extra ? "lg:grid-cols-4" : "lg:grid-cols-2")}>
      <Kpi id="clicks" label={t("kpi.clicks")} value={v(data?.totals.clicks)} />
      <Kpi id="visitors" label={t("kpi.visitors")} value={v(data?.totals.visitors)} hint={t("kpi.visitorsHint")} />
      {withBots && <Kpi id="bots" label={t("kpi.bots")} value={v(data?.totals.bots)} hint={t("kpi.botsHint")} />}
      {extra}
    </div>
  );
}

/* ------------------------------ time series ------------------------------ */

const axisTick = { fill: "var(--muted)", fontSize: 12 };

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
    <div className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] shadow-lg">
      <p className="text-muted">{f.bucket(p.key, bucket, true)}</p>
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
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis
        dataKey="key"
        tickFormatter={(k: string) => f.bucket(k, bucket)}
        tick={axisTick}
        tickLine={false}
        axisLine={{ stroke: "var(--line-strong)" }}
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
      <Tooltip cursor={{ fill: "var(--subtle)", stroke: "var(--line-strong)" }} content={<SeriesTooltip bucket={bucket} />} />
    </>
  );

  return (
    <Card>
      <CardHeader title={title ?? t("chart.title")} />
      <CardBody>
        {empty ? (
          <EmptyState icon={<ChartIcon />} title={t("empty.title")} description={t("empty.hint")} />
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
                  <Area type="monotone" dataKey="clicks" stroke="var(--accent)" strokeWidth={2} fill="var(--accent)" fillOpacity={0.14} />
                </AreaChart>
              ) : (
                <BarChart {...common}>
                  {axes}
                  <Bar dataKey="clicks" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={36} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
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
    <Card data-testid={`breakdown-${id}`} className={className}>
      <CardHeader title={title} />
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">{t("noData")}</p>
      ) : (
        <Table>
          <THead className="sr-only">
            <tr>
              <Th>{title}</Th>
              <Th>{t("kpi.clicks")}</Th>
              <Th>{t("share")}</Th>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => (
              <Tr key={item.id}>
                <Td className="relative w-full max-w-0 py-2">
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-3 rounded bg-accent/12"
                    style={{ width: `calc(${(item.clicks / max) * 100}% - 0.5rem)` }}
                  />
                  <span className="relative block truncate">
                    {item.label}
                    {item.sub && <span className="ml-1.5 text-xs text-muted">{item.sub}</span>}
                  </span>
                </Td>
                <Td className="text-right font-medium tabular-nums">{f.number(item.clicks)}</Td>
                <Td className="w-14 pl-0 text-right text-[13px] tabular-nums text-muted">
                  {total > 0 ? f.percent(item.clicks / total) : ""}
                </Td>
              </Tr>
            ))}
          </TBody>
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
  if (!data) return null;
  const total = data.totals.clicks;
  const deviceName = (k: string | null) => (k ? t(`devices.${k}`, { defaultValue: k }) : t("unknown"));
  const has = (k: string) => show.includes(k);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
