import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { CircleAlertIcon } from "lucide-react";
import { InvalidBackupError, restoreBackup } from "../features/data/restore";
import { errorMessage } from "../lib/errors";
import { appConfigQuery } from "../lib/session";

/** Restore a backup into a new, empty installation. Open to everyone until the first account exists. */
export function RestorePage() {
  const { t } = useTranslation("data");
  const tc = useTranslation().t;
  const tAuth = useTranslation("auth").t;
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ ...appConfigQuery, staleTime: 0 });
  const [file, setFile] = useState<File | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      await restoreBackup(file, (d, total) => setProgress({ done: d, total }), setupToken);
      queryClient.removeQueries();
      setDone(true);
    } catch (err) {
      setError(err instanceof InvalidBackupError ? t("restore.page.invalidFile") : errorMessage(tc, err));
    }
    setProgress(null);
  }

  if (done) {
    return (
      <AuthCard title={t("restore.page.done")} description={t("restore.page.doneText")}>
        <div data-testid="restore-done">
          <Link to="/login" className={buttonVariants({ className: "w-full" })}>
            {t("restore.page.signIn")}
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (config && !config.setupRequired) {
    return (
      <AuthCard title={t("restore.page.title")}>
        <p className="text-sm text-muted-foreground">{t("restore.page.notEmpty")}</p>
        <Link to="/login" className="tap-link mt-4 inline-block text-[13px] text-muted-foreground hover:text-foreground hover:underline">
          {t("restore.page.signIn")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("restore.page.title")} description={t("restore.page.description")}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <FormField label={t("restore.page.file")}>
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".ndjson,.gz,application/gzip,application/x-ndjson,text/plain"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground file:transition-colors hover:file:bg-muted"
            />
          )}
        </FormField>
        {config?.setupTokenRequired && (
          <FormField label={t("restore.page.setupToken")} hint={tAuth("setup.setupTokenHint")}>
            {(id) => <Input id={id} type="password" autoComplete="off" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)} />}
          </FormField>
        )}
        {progress && (
          <div role="status" className="flex flex-col gap-1.5">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : null} />
            <p className="text-[13px] text-muted-foreground">{progress.total ? t("restore.page.progress", { done: progress.done, total: progress.total }) : t("restore.page.working")}</p>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" loading={!!progress} disabled={!file}>
          {t("restore.page.submit")}
        </Button>
        <Link to="/setup" className="tap-link text-center text-[13px] text-muted-foreground hover:text-foreground hover:underline">
          {t("restore.page.back")}
        </Link>
      </form>
    </AuthCard>
  );
}
