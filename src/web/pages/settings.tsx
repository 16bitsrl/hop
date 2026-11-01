import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, RequireAdmin } from "../components/page";
import { Button, Card, CardBody, CardHeader, CopyButton, Field, Input, PageSpinner, Select, Switch, Tabs, useToast } from "../components/ui";
import { LinksSettings } from "../features/links/links-settings";
import { RetentionCard } from "../features/stats/retention-card";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
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

function SettingsContent() {
  const { t } = useTranslation("settings");
  const [tab, setTab] = useState<"signin" | "email" | "links" | "stats">("signin");
  const { data } = useQuery(settingsQuery);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs
        tabs={[
          { id: "signin", label: t("tabs.signin") },
          { id: "email", label: t("tabs.email") },
          { id: "links", label: t("tabs.links") },
          { id: "stats", label: t("tabs.stats") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-6 flex flex-col gap-6">
        {tab === "links" ? <LinksSettings /> : tab === "stats" ? <RetentionCard /> : !data ? <PageSpinner /> : tab === "signin" ? <SignInTab s={data} /> : <EmailTab s={data} />}
      </div>
    </>
  );
}

/** Saves one settings section, then refreshes what depends on it. */
function useSave<T>(section: string, after?: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
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
        <CardHeader title={t("password.title")} />
        <CardBody>
          <Switch
            checked={s.auth.passwordLogin}
            onChange={(passwordLogin) => savePassword.mutate({ passwordLogin })}
            disabled={savePassword.isPending}
            label={t("password.allow")}
            description={t("password.allowHint")}
          />
        </CardBody>
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
      <CardHeader title={t("sso.title")} description={t("sso.description")} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Switch checked={enabled} onChange={setEnabled} label={t("sso.enable")} />
          <Field label={t("sso.discoveryUrl")} hint={t("sso.discoveryHint")}>
            {(id) => (
              <Input id={id} type="url" placeholder="https://" value={discoveryUrl} onChange={(e) => setDiscoveryUrl(e.target.value)} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("sso.clientId")}>{(id) => <Input id={id} value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />}</Field>
            <Field label={t("sso.clientSecret")} hint={o.hasClientSecret ? t("sso.clientSecretSet") : undefined}>
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
            </Field>
          </div>
          <Field label={t("sso.label")} hint={t("sso.labelHint")} className="sm:max-w-xs">
            {(id) => <Input id={id} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />}
          </Field>
          <Switch checked={autoCreate} onChange={setAutoCreate} label={t("sso.autoCreate")} description={t("sso.autoCreateHint")} />
          {autoCreate && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("sso.domains")} hint={t("sso.domainsHint")}>
                {(id) => <Input id={id} placeholder="acme.com" value={domains} onChange={(e) => setDomains(e.target.value)} />}
              </Field>
              <Field label={t("sso.defaultRole")}>
                {(id) => (
                  <Select id={id} value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}>
                    {(["admin", "member", "viewer"] as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {t(`common:roles.${r}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          )}
          <div className="rounded-lg border border-line bg-subtle px-3.5 py-3">
            <p className="text-[13px] font-medium">{t("sso.redirect")}</p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <code className="min-w-0 break-all font-mono text-xs">{s.redirectUri}</code>
              <CopyButton value={s.redirectUri} />
            </div>
            <p className="mt-1.5 text-[13px] text-muted">{t("sso.redirectHint")}</p>
          </div>
          <div>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t("sso.save")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function EmailTab({ s }: { s: Settings }) {
  const { t } = useTranslation("settings");
  const toast = useToast();
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
        <CardHeader title={t("email.title")} description={t("email.description")} />
        <CardBody>
          {s.smtpFromEnvironment && <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">{t("email.fromEnvironment")}</p>}
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label={t("email.host")}>
                {(id) => <Input id={id} placeholder="smtp.example.com" value={host} onChange={(e) => setHost(e.target.value)} />}
              </Field>
              <Field label={t("email.port")}>
                {(id) => <Input id={id} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("email.user")}>{(id) => <Input id={id} autoComplete="off" value={user} onChange={(e) => setUser(e.target.value)} />}</Field>
              <Field label={t("email.pass")} hint={m.hasPass ? t("email.passSet") : undefined}>
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
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("email.from")} hint={t("email.fromHint")}>
                {(id) => <Input id={id} type="email" value={from} onChange={(e) => setFrom(e.target.value)} />}
              </Field>
              <Field label={t("email.security")}>
                {(id) => (
                  <Select id={id} value={tls} onChange={(e) => setTls(e.target.value as typeof tls)}>
                    {(["starttls", "ssl", "none"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`email.tls.${v}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div>
              <Button type="submit" variant="primary" loading={save.isPending}>
                {t("email.save")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("email.testTitle")} />
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              test.mutate();
            }}
          >
            <Field label={t("email.testTo")} className="min-w-64 flex-1">
              {(id) => <Input id={id} type="email" required value={testTo} onChange={(e) => setTestTo(e.target.value)} />}
            </Field>
            <Button type="submit" loading={test.isPending}>
              {t("email.testSend")}
            </Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
