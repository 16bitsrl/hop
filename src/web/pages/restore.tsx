import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AuthCard } from "../components/auth-layout";
import { Button, Field } from "../components/ui";
import { InvalidBackupError, restoreBackup } from "../features/data/restore";
import { errorMessage } from "../lib/errors";
import { appConfigQuery } from "../lib/session";

/** Restore a backup into a new, empty installation. Open to everyone until the first account exists. */
export function RestorePage() {
  const { t } = useTranslation("data");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ ...appConfigQuery, staleTime: 0 });
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      await restoreBackup(file, (d, total) => setProgress({ done: d, total }));
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
          <Link to="/login">
            <Button variant="primary" className="w-full">
              {t("restore.page.signIn")}
            </Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (config && !config.setupRequired) {
    return (
      <AuthCard title={t("restore.page.title")}>
        <p className="text-sm text-muted">{t("restore.page.notEmpty")}</p>
        <Link to="/login" className="tap-link mt-4 inline-block text-[13px] text-muted hover:text-fg hover:underline">
          {t("restore.page.signIn")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("restore.page.title")} description={t("restore.page.description")}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label={t("restore.page.file")}>
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".ndjson,.gz,application/gzip,application/x-ndjson,text/plain"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg"
            />
          )}
        </Field>
        {progress && (
          <div role="status" className="flex flex-col gap-1.5">
            <progress className="h-2 w-full" max={progress.total || 1} value={progress.done} />
            <p className="text-[13px] text-muted">{progress.total ? t("restore.page.progress", { done: progress.done, total: progress.total }) : t("restore.page.working")}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={!!progress} disabled={!file}>
          {t("restore.page.submit")}
        </Button>
        <Link to="/setup" className="tap-link text-center text-[13px] text-muted hover:text-fg hover:underline">
          {t("restore.page.back")}
        </Link>
      </form>
    </AuthCard>
  );
}
