import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheckIcon, RefreshCwIcon } from "lucide-react";
import { CardSkeleton } from "../../components/card-skeleton";
import { FormField } from "../../components/form-field";
import { OptionSelect } from "../../components/option-select";
import { ErrorState } from "../../components/states";
import { SwitchField } from "../../components/toggle-field";
import { Button } from "../../components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/cn";
import { errorMessage } from "../../lib/errors";
import { toast } from "../../lib/toast";
import { useMe } from "../../lib/session";
import type { Link } from "../links/api";

type HealthSettings = { enabled: boolean; recheckDays: number };
const DAYS = [1, 3, 7, 14, 30];

const settingsQuery = {
  queryKey: ["health-settings"],
  queryFn: () => api<HealthSettings>("/api/links-health/settings"),
  staleTime: 0,
};

/** Settings card (admins): turn the broken link check on or off and choose how often links are rechecked. */
export function HealthSettingsCard() {
  const { data, isError, isFetching, refetch } = useQuery(settingsQuery);
  if (data) return <HealthForm initial={data} />;
  if (isError)
    return (
      <Card>
        <ErrorState onRetry={() => refetch()} retrying={isFetching} />
      </Card>
    );
  return <CardSkeleton fields={1} />;
}

function HealthForm({ initial }: { initial: HealthSettings }) {
  const { t } = useTranslation("data");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: () => api("/api/links-health/settings", { method: "PUT", body: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
      toast.success(tc("saved"));
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Card data-testid="health-settings">
      <CardHeader>
        <CardTitle>{t("health.title")}</CardTitle>
        <CardDescription>{t("health.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <SwitchField checked={value.enabled} onCheckedChange={(enabled) => setValue({ ...value, enabled })} label={t("health.enabled")} description={t("health.enabledHint")} />
          <FormField label={t("health.every")} className="sm:max-w-xs">
            {(id) => (
              <OptionSelect
                id={id}
                value={String(value.recheckDays)}
                disabled={!value.enabled}
                onValueChange={(v) => setValue({ ...value, recheckDays: Number(v) })}
                options={(DAYS.includes(value.recheckDays) ? DAYS : [...DAYS, value.recheckDays].sort((a, b) => a - b)).map((d) => ({
                  value: String(d),
                  label: t("health.days", { count: d }),
                }))}
              />
            )}
          </FormField>
          <div>
            <Button type="submit" loading={save.isPending}>
              {t("health.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Dashboard card: a few broken links and a way to see them all. */
export function BrokenLinksCard() {
  const { t } = useTranslation("data");
  const tc = useTranslation().t;
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ["links", "broken-dashboard"],
    queryFn: () => api<{ items: Link[]; total: number }>("/api/links?state=broken&pageSize=5"),
    staleTime: 0,
  });
  return (
    <Card data-testid="dash-broken" className="gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>{t("health.dashboardTitle")}</CardTitle>
        {data && data.total > 0 && (
          <CardAction>
            <RouterLink to="/links" search={{ state: "broken" }} className="text-[13px] font-medium text-primary hover:underline">
              {t("health.viewAll", { count: data.total })}
            </RouterLink>
          </CardAction>
        )}
      </CardHeader>
      {isError && !data ? (
        <ErrorState onRetry={() => refetch()} retrying={isFetching} className="py-8" />
      ) : !data ? (
        <div role="status" aria-label={tc("loading")} className="flex flex-col gap-3 px-5 py-4">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>
      ) : !data.items.length ? (
        <p className="flex items-center justify-center gap-2 px-5 py-6 text-[13px] text-muted-foreground">
          <CircleCheckIcon className="size-4 text-success" aria-hidden />
          {t("health.dashboardEmpty")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <RouterLink to="/links/$id" params={{ id: l.id }} className="min-w-0 truncate font-mono text-[13px] hover:underline">
                {l.host}/{l.slug}
              </RouterLink>
              <span className="shrink-0 text-xs text-muted-foreground">{codeText(t, l.healthCode)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function codeText(t: (k: string, o?: Record<string, unknown>) => string, code: number | null) {
  if (code === null) return "";
  return code === 0 ? t("health.noAnswer") : t("health.code", { code });
}

/** Row of the link overview: the last verdict and a button to check right now. */
export function LinkHealth({ link }: { link: Link }) {
  const { t, i18n } = useTranslation("data");
  const tc = useTranslation().t;
  const me = useMe();
  const queryClient = useQueryClient();
  const check = useMutation({
    mutationFn: () => api<{ link: Link }>(`/api/links/${link.id}/check`, { method: "POST", body: {} }),
    onSuccess: async ({ link: fresh }) => {
      queryClient.setQueryData(["link", link.id], fresh);
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success(t("health.result"));
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  const failing = link.healthStatus !== "broken" && (link.healthCode === 0 || link.healthCode === 404 || link.healthCode === 410 || (link.healthCode ?? 0) >= 500);
  const verdict = link.healthStatus === "broken" ? t("health.broken") : failing ? t("health.failing") : link.healthStatus === "ok" ? t("health.ok") : t("health.notChecked");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>{verdict}</span>
      {link.healthCode !== null && (
        <span data-testid="health-code" className="text-muted-foreground">
          {codeText(t, link.healthCode)}
          {link.healthCheckedAt ? `, ${t("health.checkedAt", { when: formatDateTime(link.healthCheckedAt, i18n.language) })}` : ""}
        </span>
      )}
      {me.role !== "viewer" && (
        <Button size="sm" variant="outline" loading={check.isPending} onClick={() => check.mutate()}>
          {!check.isPending && <RefreshCwIcon data-icon="inline-start" />}
          {t("health.checkNow")}
        </Button>
      )}
    </div>
  );
}
