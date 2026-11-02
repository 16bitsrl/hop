import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, Field, Input, KeyIcon, PageSpinner } from "../components/legacy";
import { authClient } from "../lib/auth-client";
import { ssoErrorMessage } from "../lib/errors";
import { appConfigQuery, meQuery } from "../lib/session";

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { data: config } = useQuery(appConfigQuery);
  const { error: urlError } = useSearch({ from: "/login" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(urlError ? ssoErrorMessage(t, urlError) : null);
  const [busy, setBusy] = useState(false);

  if (!config) return <PageSpinner />;

  async function enter() {
    queryClient.removeQueries({ queryKey: meQuery.queryKey });
    await navigate({ to: "/links" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (err) {
      setError(err.code === "FAILED_TO_CREATE_SESSION" ? t("login.notAllowed") : t("login.wrong"));
      return;
    }
    await enter();
  }

  async function passkey() {
    setError(null);
    const res = await authClient.signIn.passkey();
    if (res?.error) {
      setError(t("errors:passkey_failed"));
      return;
    }
    if (res?.data) await enter();
  }

  async function sso() {
    await authClient.signIn.social({ provider: "oidc", callbackURL: "/links", errorCallbackURL: "/login" });
  }

  return (
    <AuthCard title={t("login.title")} description={t("login.description")}>
      <div className="flex flex-col gap-4">
        {config.passwordLogin && (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <Field label={t("login.email")}>
              {(id) => <Input id={id} type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label={t("login.password")}>
              {(id) => (
                <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            <Button type="submit" variant="primary" loading={busy} className="mt-1">
              {t("login.submit")}
            </Button>
            <Link to="/forgot-password" className="tap-link text-center text-[13px] text-muted-foreground hover:text-foreground hover:underline">
              {t("login.forgot")}
            </Link>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        {config.passwordLogin && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("login.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        <div className="flex flex-col gap-2">
          {config.oidc && (
            <Button onClick={sso} className="w-full">
              {config.oidc.label}
            </Button>
          )}
          <Button onClick={passkey} className="w-full">
            <KeyIcon />
            {t("login.passkey")}
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
