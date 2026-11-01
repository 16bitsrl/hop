import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, Field, Input } from "../components/ui";
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { body: { name, email, password } });
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
        <Field label={t("setup.name")}>
          {(id) => <Input id={id} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t("setup.email")}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t("setup.password")} hint={t("setup.passwordHint")}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy} className="mt-1">
          {t("setup.submit")}
        </Button>
        <Link to="/restore" className="text-center text-[13px] text-muted hover:text-fg hover:underline">
          {tData("restore.link")}
        </Link>
      </form>
    </AuthCard>
  );
}
