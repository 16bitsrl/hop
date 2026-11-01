import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, Field, Input, useToast } from "../components/ui";
import { authClient } from "../lib/auth-client";

export function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const toast = useToast();
  const navigate = useNavigate();
  const { token, error: urlError } = useSearch({ from: "/reset-password" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token || urlError) {
    return (
      <AuthCard title={t("reset.title")}>
        <p className="text-sm text-muted">{t("reset.invalid")} {t("reset.requestAnother")}</p>
        <Link to="/login" className="tap-link mt-4 block text-center text-[13px] text-muted hover:text-fg hover:underline">
          {t("forgot.back")}
        </Link>
      </AuthCard>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    if (err) {
      setError(err.code === "INVALID_TOKEN" ? t("reset.invalid") : t("errors:generic"));
      return;
    }
    toast.success(t("reset.done"));
    await navigate({ to: "/login" });
  }

  return (
    <AuthCard title={t("reset.title")}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label={t("reset.newPassword")} hint={t("reset.hint")}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {t("reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
