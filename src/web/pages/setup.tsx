import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleAlertIcon } from "lucide-react";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { errorMessage } from "../lib/errors";
import { appConfigQuery, meQuery } from "../lib/session";

/** First run: creates the first administrator. */
export function SetupPage() {
  const { t } = useTranslation("auth");
  const tData = useTranslation("data").t;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const { data: config } = useQuery(appConfigQuery);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { body: { name, email, password, ...(setupToken ? { setupToken } : {}) } });
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) throw new Error(err.message);
      queryClient.removeQueries({ queryKey: appConfigQuery.queryKey });
      queryClient.removeQueries({ queryKey: meQuery.queryKey });
      await navigate({ to: "/links" });
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("setup.title")} description={t("setup.description")}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <FormField label={t("setup.name")}>
          {(id) => <Input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={t("setup.email")}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </FormField>
        <FormField label={t("setup.password")} hint={t("setup.passwordHint")}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </FormField>
        {config?.setupTokenRequired && (
          <FormField label={t("setup.setupToken")} hint={t("setup.setupTokenHint")}>
            {(id) => <Input id={id} type="password" autoComplete="off" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)} />}
          </FormField>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" loading={busy} className="mt-1">
          {t("setup.submit")}
        </Button>
        <Link to="/restore" className="tap-link text-center text-[13px] text-muted-foreground hover:text-foreground hover:underline">
          {tData("restore.link")}
        </Link>
      </form>
    </AuthCard>
  );
}
