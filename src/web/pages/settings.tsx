import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CardSkeleton } from "../components/card-skeleton";
import { CopyButton } from "../components/copy-button";
import { FormField } from "../components/form-field";
import { OptionSelect } from "../components/option-select";
import { PageHeader, RequireAdmin } from "../components/page";
import { ErrorState } from "../components/states";
import { SwitchField } from "../components/toggle-field";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { DataTab } from "../features/data/data-tab";
import { HealthSettingsCard } from "../features/data/health";
import { LinksSettings } from "../features/links/links-settings";
import { RetentionCard } from "../features/stats/retention-card";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { toast } from "../lib/toast";
import { appConfigQuery, type Role } from "../lib/session";

type Settings = {
  auth: { passwordLogin: boolean };
  oidc: {
    enabled: boolean;
    discoveryUrl: string;
    clientId: string;
    hasClientSecret: boolean;
    label: string;
    autoCreate: boolean;
    allowedDomains: string[];
    defaultRole: Role;
  };
  smtp: { host: string; port: number; user: string; from: string; tls: "none" | "starttls" | "ssl"; hasPass: boolean };
  smtpFromEnvironment: boolean;
  redirectUri: string;
};

const settingsQuery = { queryKey: ["settings"], queryFn: () => api<Settings>("/api/settings"), staleTime: 0 };

export function SettingsPage() {
  return (
    <RequireAdmin>
      <SettingsContent />
    </RequireAdmin>
  );
}

type Tab = "signin" | "email" | "links" | "stats" | "data";
const TABS: Tab[] = ["signin", "email", "links", "stats", "data"];

function SettingsContent() {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<Tab>("signin");
  const { data, isError, isFetching, refetch } = useQuery(settingsQuery);
  const needsSettings = tab === "signin" || tab === "email";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-6">
        <TabsList variant="line">
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((id) => (
          <TabsContent key={id} value={id} className="flex flex-col gap-5">
            {id === "links" ? (
              <>
                <LinksSettings />
                <HealthSettingsCard />
              </>
            ) : id === "stats" ? (
              <RetentionCard />
            ) : id === "data" ? (
              <DataTab />
            ) : !needsSettings ? null : data ? (
              id === "signin" ? <SignInTab s={data} /> : <EmailTab s={data} />
            ) : isError ? (
              <Card>
                <ErrorState onRetry={() => refetch()} retrying={isFetching} />
              </Card>
            ) : (
              <CardSkeleton />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

/** Saves one settings section, then refreshes what depends on it. */
function useSave<T>(section: string, after?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api(`/api/settings/${section}`, { method: "PUT", body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.removeQueries({ queryKey: appConfigQuery.queryKey });
      toast.success(t("saved"));
      after?.();
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
}

function SignInTab({ s }: { s: Settings }) {
  const { t } = useTranslation("settings");
  const savePassword = useSave<{ passwordLogin: boolean }>("auth");
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("password.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SwitchField
            checked={s.auth.passwordLogin}
            onCheckedChange={(passwordLogin) => savePassword.mutate({ passwordLogin })}
            disabled={savePassword.isPending}
            label={t("password.allow")}
            description={t("password.allowHint")}
          />
        </CardContent>
      </Card>
      <OidcCard s={s} />
    </>
  );
}

function OidcCard({ s }: { s: Settings }) {
  const { t } = useTranslation("settings");
  const o = s.oidc;
  const [enabled, setEnabled] = useState(o.enabled);
  const [discoveryUrl, setDiscoveryUrl] = useState(o.discoveryUrl);
  const [clientId, setClientId] = useState(o.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [label, setLabel] = useState(o.label);
  const [autoCreate, setAutoCreate] = useState(o.autoCreate);
  const [domains, setDomains] = useState(o.allowedDomains.join(", "));
  const [defaultRole, setDefaultRole] = useState<Role>(o.defaultRole);
  const save = useSave("oidc", () => setClientSecret(""));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      enabled,
      discoveryUrl,
      clientId,
      clientSecret,
      label,
      autoCreate,
      allowedDomains: domains.split(/[,\s]+/).filter(Boolean),
      defaultRole,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sso.title")}</CardTitle>
        <CardDescription>{t("sso.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <SwitchField checked={enabled} onCheckedChange={setEnabled} label={t("sso.enable")} />
          <FormField label={t("sso.discoveryUrl")} hint={t("sso.discoveryHint")}>
            {(id) => (
              <Input id={id} type="url" placeholder="https://" value={discoveryUrl} onChange={(e) => setDiscoveryUrl(e.target.value)} />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("sso.clientId")}>{(id) => <Input id={id} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />}</FormField>
            <FormField label={t("sso.clientSecret")} hint={o.hasClientSecret ? t("sso.clientSecretSet") : undefined}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  placeholder={o.hasClientSecret ? "••••••••" : ""}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              )}
            </FormField>
          </div>
          <FormField label={t("sso.label")} hint={t("sso.labelHint")} className="sm:max-w-xs">
            {(id) => <Input id={id} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />}
          </FormField>
          <SwitchField checked={autoCreate} onCheckedChange={setAutoCreate} label={t("sso.autoCreate")} description={t("sso.autoCreateHint")} />
          {autoCreate && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("sso.domains")} hint={t("sso.domainsHint")}>
                {(id) => <Input id={id} placeholder="acme.com" value={domains} onChange={(e) => setDomains(e.target.value)} />}
              </FormField>
              <FormField label={t("sso.defaultRole")}>
                {(id) => (
                  <OptionSelect
                    id={id}
                    value={defaultRole}
                    onValueChange={setDefaultRole}
                    options={(["admin", "member", "viewer"] as Role[]).map((r) => ({ value: r, label: t(`common:roles.${r}`) }))}
                  />
                )}
              </FormField>
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted px-3.5 py-3">
            <p className="text-[13px] font-medium">{t("sso.redirect")}</p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <code className="min-w-0 break-all font-mono text-xs">{s.redirectUri}</code>
              <CopyButton value={s.redirectUri} />
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{t("sso.redirectHint")}</p>
          </div>
          <div>
            <Button type="submit" loading={save.isPending}>
              {t("sso.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailTab({ s }: { s: Settings }) {
  const { t } = useTranslation("settings");
  const m = s.smtp;
  const [host, setHost] = useState(m.host);
  const [port, setPort] = useState(String(m.port));
  const [user, setUser] = useState(m.user);
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState(m.from);
  const [tls, setTls] = useState(m.tls);
  const [testTo, setTestTo] = useState("");
  const save = useSave("smtp", () => setPass(""));

  const test = useMutation({
    mutationFn: () => api("/api/settings/smtp/test", { body: { to: testTo } }),
    onSuccess: () => toast.success(t("email.testSent")),
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ host, port: Number(port) || 587, user, pass, from, tls });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("email.title")}</CardTitle>
          <CardDescription>{t("email.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {s.smtpFromEnvironment && <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info">{t("email.fromEnvironment")}</p>}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <FormField label={t("email.host")}>
                {(id) => <Input id={id} placeholder="smtp.example.com" value={host} onChange={(e) => setHost(e.target.value)} />}
              </FormField>
              <FormField label={t("email.port")}>
                {(id) => <Input id={id} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />}
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("email.user")}>{(id) => <Input id={id} autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />}</FormField>
              <FormField label={t("email.pass")} hint={m.hasPass ? t("email.passSet") : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    placeholder={m.hasPass ? "••••••••" : ""}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("email.from")} hint={t("email.fromHint")}>
                {(id) => <Input id={id} type="email" value={from} onChange={(e) => setFrom(e.target.value)} />}
              </FormField>
              <FormField label={t("email.security")}>
                {(id) => (
                  <OptionSelect
                    id={id}
                    value={tls}
                    onValueChange={setTls}
                    options={(["starttls", "ssl", "none"] as const).map((v) => ({ value: v, label: t(`email.tls.${v}`) }))}
                  />
                )}
              </FormField>
            </div>
            <div>
              <Button type="submit" loading={save.isPending}>
                {t("email.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("email.testTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              test.mutate();
            }}
          >
            <FormField label={t("email.testTo")} className="min-w-64 flex-1">
              {(id) => <Input id={id} type="email" required value={testTo} onChange={(e) => setTestTo(e.target.value)} />}
            </FormField>
            <Button type="submit" variant="outline" loading={test.isPending}>
              {!test.isPending && <SendIcon data-icon="inline-start" />}
              {t("email.testSend")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
