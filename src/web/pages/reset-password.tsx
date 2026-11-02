import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { authClient } from "../lib/auth-client";

export function ResetPasswordPage() {
  const { t } = useTranslation("auth");
    const navigate = useNavigate();
  const { token, error: urlError } = useSearch({ from: "/reset-password" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token || urlError) {
    return (
      <AuthCard title={t("reset.title")}>
        <p className="text-sm text-muted-foreground">{t("reset.invalid")} {t("reset.requestAnother")}</p>
        <Link to="/login" className="tap-link mt-4 block text-center text-[13px] text-muted-foreground hover:text-foreground hover:underline">
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
        <FormField label={t("reset.newPassword")} hint={t("reset.hint")}>
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
          {t("reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
