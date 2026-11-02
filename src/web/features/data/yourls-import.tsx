import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon, ArrowRightIcon, RotateCcwIcon, UploadIcon } from "lucide-react";
import { FormField } from "../../components/form-field";
import { OptionSelect } from "../../components/option-select";
import { SearchSelect } from "../../components/search-select";
import { Button, buttonVariants } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/cn";
import { errorMessage } from "../../lib/errors";
import { useMe } from "../../lib/session";
import { mysqlDateToMs } from "../../../shared/yourls-dump";
import { domainsQuery } from "../links/api";
import {
  findConflicts,
  isValidTimeZone,
  runImport,
  summarizeDump,
  type DumpSummary,
  type ImportOptions,
  type ImportProgress,
  type ImportReport,
} from "./yourls";

type Step =
  | { kind: "choose"; error?: string }
  | { kind: "reading"; fraction: number }
  | { kind: "summary" }
  | { kind: "options" }
  | { kind: "running"; progress: ImportProgress }
  | { kind: "done"; report: ImportReport };

const REDIRECT_TYPES = [302, 301, 307, 308] as const;
const num = (n: number, lang: string) => n.toLocaleString(lang);

/** Wizard: upload, summary, options, import with progress, report. */
export function YourlsImport() {
  const { t, i18n } = useTranslation("data");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const me = useMe();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<DumpSummary | null>(null);
  const [opts, setOpts] = useState<Omit<ImportOptions, "domainId"> & { domainId: string }>({
    domainId: "",
    ownerId: me.id,
    redirectType: 302,
    onConflict: "skip",
    timeZone: "UTC",
  });

  const domains = useQuery(domainsQuery);
  const directory = useQuery({ queryKey: ["users-directory"], queryFn: () => api<{ users: { id: string; name: string }[] }>("/api/users/directory") });
  const domainId = opts.domainId || domains.data?.find((d) => d.isDefault)?.id || domains.data?.[0]?.id || "";
  const conflicts = useQuery({
    queryKey: ["yourls-conflicts", domainId, file?.name, file?.size],
    queryFn: () => findConflicts(domainId, summary!.links),
    enabled: step.kind === "options" && !!domainId && !!summary,
    staleTime: 0,
  });
  const tzValid = isValidTimeZone(opts.timeZone);

  async function choose(f: File) {
    setFile(f);
    setStep({ kind: "reading", fraction: 0 });
    try {
      const s = await summarizeDump(f, (fraction) => setStep({ kind: "reading", fraction }));
      if (s.links.length === 0) {
        setStep({ kind: "choose", error: t("yourls.noLinks") });
        return;
      }
      setSummary(s);
      setStep({ kind: "summary" });
    } catch {
      setStep({ kind: "choose", error: t("yourls.readFailed") });
    }
  }

  async function start() {
    if (!file || !summary) return;
    setStep({ kind: "running", progress: { phase: "links", done: 0, total: summary.links.length } });
    try {
      const report = await runImport(file, summary, { ...opts, domainId }, (progress) => setStep({ kind: "running", progress }));
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      setStep({ kind: "done", report });
    } catch (e) {
      setStep({ kind: "choose", error: errorMessage(tc, e) });
    }
  }

  const reset = () => {
    setFile(null);
    setSummary(null);
    setStep({ kind: "choose" });
  };

  return (
    <Card data-testid="yourls-import">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="size-4 text-muted-foreground" aria-hidden />
          {t("yourls.title")}
        </CardTitle>
        <CardDescription>{t("yourls.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {step.kind === "choose" && (
          <>
            <FormField label={t("yourls.file")} hint={t("yourls.fileHint")} error={step.error}>
              {(id, aria) => (
                <input
                  id={id}
                  {...aria}
                  type="file"
                  accept=".sql,.gz,application/sql,application/gzip,text/plain"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void choose(f);
                  }}
                  className="block w-full rounded-lg border border-dashed border-input p-2 text-sm text-muted-foreground transition-colors hover:border-ring file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-card file:px-3 file:text-sm file:font-medium file:text-foreground file:shadow-(--shadow-raised) hover:file:bg-muted"
                />
              )}
            </FormField>
          </>
        )}

        {step.kind === "reading" && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
            <Spinner />
            {t("yourls.reading")} {Math.round(step.fraction * 100)}%
          </div>
        )}

        {step.kind === "summary" && summary && (
          <>
            <h3 className="text-sm font-semibold">{t("yourls.summary.title")}</h3>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("yourls.summary.links")} value={num(summary.links.length, i18n.language)} id="import-links" />
              <Stat label={t("yourls.summary.clicks")} value={num(summary.clickCount, i18n.language)} id="import-clicks" />
              <Stat
                label={t("yourls.summary.firstClick")}
                value={summary.firstClick ? formatDate(mysqlDateToMs(summary.firstClick) ?? 0, i18n.language) : "–"}
              />
              <Stat
                label={t("yourls.summary.lastClick")}
                value={summary.lastClick ? formatDate(mysqlDateToMs(summary.lastClick) ?? 0, i18n.language) : "–"}
              />
              <Stat label={t("yourls.summary.orphans")} value={num(summary.orphanClicks, i18n.language)} id="import-orphans" hint={t("yourls.summary.orphansHint")} />
              <Stat label={t("yourls.summary.lifetime")} value={num(summary.lifetimeClicks, i18n.language)} hint={t("yourls.summary.lifetimeHint")} />
              <Stat label={t("yourls.summary.prefix")} value={summary.prefix || t("yourls.summary.none")} />
            </dl>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                <ArrowLeftIcon data-icon="inline-start" />
                {t("yourls.back")}
              </Button>
              <Button onClick={() => setStep({ kind: "options" })}>
                {t("yourls.continue")}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </>
        )}

        {step.kind === "options" && summary && (
          <>
            <h3 className="text-sm font-semibold">{t("yourls.options.title")}</h3>
            {domains.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("yourls.options.noDomains")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t("yourls.options.domain")} hint={t("yourls.options.domainHint")}>
                  {(id) => (
                    <OptionSelect
                      id={id}
                      value={domainId}
                      onValueChange={(v) => setOpts({ ...opts, domainId: v })}
                      options={(domains.data ?? []).map((d) => ({ value: d.id, label: d.host }))}
                    />
                  )}
                </FormField>
                <FormField label={t("yourls.options.owner")}>
                  {(id) => (
                    <SearchSelect
                      id={id}
                      value={opts.ownerId}
                      onValueChange={(v) => setOpts({ ...opts, ownerId: v })}
                      options={(directory.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))}
                      empty={t("yourls.options.noOwnerMatch")}
                    />
                  )}
                </FormField>
                <FormField label={t("yourls.options.redirectType")} hint={t("yourls.options.redirectHint")}>
                  {(id) => (
                    <OptionSelect
                      id={id}
                      value={String(opts.redirectType)}
                      onValueChange={(v) => setOpts({ ...opts, redirectType: Number(v) as ImportOptions["redirectType"] })}
                      options={REDIRECT_TYPES.map((r) => ({ value: String(r), label: String(r) }))}
                    />
                  )}
                </FormField>
                <FormField label={t("yourls.options.timeZone")} hint={t("yourls.options.timeZoneHint")} error={tzValid ? undefined : t("yourls.options.timeZoneInvalid")}>
                  {(id) => (
                    <>
                      <Input id={id} list="yourls-time-zones" value={opts.timeZone} onChange={(e) => setOpts({ ...opts, timeZone: e.target.value.trim() })} />
                      <datalist id="yourls-time-zones">
                        <option value="UTC" />
                        {Intl.supportedValuesOf("timeZone").map((z) => (
                          <option key={z} value={z} />
                        ))}
                      </datalist>
                    </>
                  )}
                </FormField>
              </div>
            )}

            <div className="flex flex-col gap-2" data-testid="import-conflicts">
              {conflicts.isPending ? (
                <p className="text-sm text-muted-foreground">{t("yourls.options.checking")}</p>
              ) : (conflicts.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t("yourls.options.noConflicts")}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">{t("yourls.options.conflicts", { count: conflicts.data!.length })}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="conflict" className="size-4 accent-primary" checked={opts.onConflict === "skip"} onChange={() => setOpts({ ...opts, onConflict: "skip" })} />
                    <span>{t("yourls.options.skip")}</span>
                  </label>
                  <p className="-mt-1 pl-6 text-[13px] text-muted-foreground">{t("yourls.options.skipHint")}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="conflict" className="size-4 accent-primary" checked={opts.onConflict === "overwrite"} onChange={() => setOpts({ ...opts, onConflict: "overwrite" })} />
                    <span>{t("yourls.options.overwrite")}</span>
                  </label>
                  <p className="-mt-1 pl-6 text-[13px] text-muted-foreground">{t("yourls.options.overwriteHint")}</p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep({ kind: "summary" })}>
                <ArrowLeftIcon data-icon="inline-start" />
                {t("yourls.back")}
              </Button>
              <Button disabled={!domainId || !tzValid || conflicts.isPending} onClick={() => void start()}>
                {t("yourls.options.start")}
              </Button>
            </div>
          </>
        )}

        {step.kind === "running" && (
          <div className="flex flex-col gap-3" role="status">
            <h3 className="text-sm font-semibold">{t("yourls.progress.title")}</h3>
            <div
              role="progressbar"
              aria-label={t("yourls.progress.title")}
              aria-valuemin={0}
              aria-valuemax={step.progress.total || 1}
              aria-valuenow={step.progress.done}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${(step.progress.done / (step.progress.total || 1)) * 100}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t(step.progress.phase === "links" ? "yourls.progress.links" : "yourls.progress.clicks", {
                done: num(step.progress.done, i18n.language),
                total: num(step.progress.total, i18n.language),
              })}
            </p>
            <p className="text-[13px] text-muted-foreground">{t("yourls.progress.keepOpen")}</p>
          </div>
        )}

        {step.kind === "done" && (
          <Report report={step.report} host={domains.data?.find((d) => d.id === domainId)?.host ?? ""} onAgain={reset} />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, id, hint }: { label: string; value: string; id?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5" title={hint}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd data-testid={id} className="mt-0.5 text-lg font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Report({ report, host, onAgain }: { report: ImportReport; host: string; onAgain: () => void }) {
  const { t, i18n } = useTranslation("data");
  const n = (v: number) => num(v, i18n.language);
  return (
    <>
      <h3 className="text-sm font-semibold">{t("yourls.report.title")}</h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("yourls.report.created")} value={n(report.created)} id="report-created" />
        <Stat label={t("yourls.report.updated")} value={n(report.updated)} id="report-updated" />
        <Stat label={t("yourls.report.skipped")} value={n(report.skipped)} id="report-skipped" />
        <Stat label={t("yourls.report.failed")} value={n(report.failed.length)} id="report-failed" />
        <Stat label={t("yourls.report.clicks")} value={n(report.clicksImported)} id="report-clicks" />
        <Stat label={t("yourls.report.duplicates")} value={n(report.clicksDuplicates)} id="report-duplicates" />
        <Stat label={t("yourls.report.orphans")} value={n(report.clicksOrphans)} id="report-orphans" />
      </dl>
      {report.totals && (
        <p className="text-sm text-muted-foreground">
          {t("yourls.report.check", { host, links: n(report.totals.links), clicks: n(report.totals.lifetimeClicks), history: n(report.totals.importedClicks) })}
        </p>
      )}
      {report.failed.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">{t("yourls.report.problems")}</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {report.failed.slice(0, 20).map((f) => (
              <li key={f.keyword}>
                <code className="font-mono text-xs">{f.keyword}</code>: {t(`yourls.report.reasons.${f.error}`, { defaultValue: f.error })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Link to="/links" className={buttonVariants()}>
          {t("yourls.report.viewLinks")}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
        <Button variant="outline" onClick={onAgain}>
          <RotateCcwIcon data-icon="inline-start" />
          {t("yourls.report.again")}
        </Button>
      </div>
    </>
  );
}
