import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, Field, Input, PageSpinner } from "../components/ui";
import { authClient } from "../lib/auth-client";
import { appConfigQuery } from "../lib/session";

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const { data: config } = useQuery(appConfigQuery);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!config) return <PageSpinner />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    setSent(true);
  }

  const back = (
    <Link to="/login" className="mt-4 block text-center text-[13px] text-muted hover:text-fg hover:underline">
      {t("forgot.back")}
    </Link>
  );

  if (!config.mailConfigured || !config.passwordLogin) {
    return (
      <AuthCard title={t("forgot.title")}>
        <p className="text-sm text-muted">{t("forgot.noMail")}</p>
        {back}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("forgot.title")} description={sent ? undefined : t("forgot.description")}>
      {sent ? (
        <p className="text-sm">{t("forgot.sent")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <Field label={t("forgot.email")}>
            {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" loading={busy}>
            {t("forgot.submit")}
          </Button>
        </form>
      )}
      {back}
    </AuthCard>
  );
}
