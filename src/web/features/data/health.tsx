import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardBody, CardHeader, Field, PageSpinner, Select, Switch, useToast } from "../../components/legacy";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/cn";
import { errorMessage } from "../../lib/errors";
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
  const { data } = useQuery(settingsQuery);
  return data ? <HealthForm initial={data} /> : <PageSpinner />;
}

function HealthForm({ initial }: { initial: HealthSettings }) {
  const { t } = useTranslation("data");
  const tc = useTranslation().t;
  const toast = useToast();
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
      <CardHeader title={t("health.title")} description={t("health.description")} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Switch checked={value.enabled} onChange={(enabled) => setValue({ ...value, enabled })} label={t("health.enabled")} description={t("health.enabledHint")} />
          <Field label={t("health.every")} className="sm:max-w-xs">
            {(id) => (
              <Select id={id} value={value.recheckDays} disabled={!value.enabled} onChange={(e) => setValue({ ...value, recheckDays: Number(e.target.value) })}>
                {(DAYS.includes(value.recheckDays) ? DAYS : [...DAYS, value.recheckDays].sort((a, b) => a - b)).map((d) => (
                  <option key={d} value={d}>
                    {t("health.days", { count: d })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t("health.save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

/** Dashboard card: a few broken links and a way to see them all. */
export function BrokenLinksCard() {
  const { t } = useTranslation("data");
  const { data } = useQuery({
    queryKey: ["links", "broken-dashboard"],
    queryFn: () => api<{ items: Link[]; total: number }>("/api/links?state=broken&pageSize=5"),
    staleTime: 0,
  });
  return (
    <Card data-testid="dash-broken">
      <CardHeader
        title={t("health.dashboardTitle")}
        action={
          data && data.total > 0 ? (
            <RouterLink to="/links" search={{ state: "broken" }} className="text-[13px] font-medium text-primary hover:underline">
              {t("health.viewAll", { count: data.total })}
            </RouterLink>
          ) : undefined
        }
      />
      {!data?.items.length ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">{t("health.dashboardEmpty")}</p>
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
  const toast = useToast();
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
        <Button size="sm" loading={check.isPending} onClick={() => check.mutate()}>
          {t("health.checkNow")}
        </Button>
      )}
    </div>
  );
}
