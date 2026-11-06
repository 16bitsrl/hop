import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/states";
import { CircleAlertIcon } from "lucide-react";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { errorMessage, ssoErrorMessage } from "../lib/errors";
import { appConfigQuery, meQuery, type Role } from "../lib/session";

/** Someone opens the invitation link: set a name and a password, or continue with single sign-on. */
export function InvitePage() {
  const { t } = useTranslation("auth");
  const { token } = useParams({ from: "/invite/$token" });
  const { error: urlError } = useSearch({ from: "/invite/$token" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(urlError ? ssoErrorMessage(t, urlError) : null);
  const [busy, setBusy] = useState(false);

  const invite = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<{ email: string; role: Role }>(`/api/invites/by-token/${encodeURIComponent(token)}`),
    retry: false,
  });
  const { data: config } = useQuery(appConfigQuery);

  if (invite.isPending || !config) return <LoadingState className="min-h-dvh" />;
  if (invite.isError) {
    return (
      <AuthCard title={t("invite.title")}>
        <p className="text-sm">{t("invite.invalid")}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("invite.ask")}</p>
      </AuthCard>
    );
  }

  const { email, role } = invite.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/invites/by-token/${encodeURIComponent(token)}/accept`, { body: { name, password } });
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) throw new Error(err.message);
      queryClient.removeQueries({ queryKey: meQuery.queryKey });
      await navigate({ to: "/links" });
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("invite.title")} description={t("invite.description", { role: t(`common:roles.${role}`).toLowerCase() })}>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm font-medium">{email}</p>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <FormField label={t("invite.name")}>
          {(id) => <Input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={t("invite.password")} hint={t("invite.passwordHint")}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </FormField>
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" loading={busy}>
          {t("invite.submit")}
        </Button>
      </form>
      {config.oidc && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("login.or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline"
            className="w-full"
            onClick={() => authClient.signIn.social({ provider: "oidc", callbackURL: "/links", errorCallbackURL: `/invite/${token}` })}
          >
            {t("login.sso", { name: config.oidc.label })}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
