import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlertIcon, CircleCheckIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { splitCsv } from "../../../shared/csv";
import { api } from "../../lib/api";
import { BATCH_SIZE } from "../../lib/batches";
import { downloadBlob } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errors";

type PreviewRow = { line: number; url: string; slug: string; title: string; errors: string[] };
type Preview = { rows: PreviewRow[]; validCount: number };
type Result = { created: number; failed: { line: number; errors: string[] }[] };

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("links");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>
        <ImportFlow onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const check = useMutation({
    mutationFn: (text: string) => api<Preview>("/api/links/import/preview", { body: { csv: text } }),
    onSuccess: setPreview,
    onError: (e) => {
      setPreview(null);
      toast.error(errorMessage(tc, e));
    },
  });

  const run = useMutation({
    // Long files go in batches (the server takes a few rows per request); the person sees one progress and one report.
    mutationFn: async () => {
      const parts = splitCsv(csv, BATCH_SIZE);
      const total: Result = { created: 0, failed: [] };
      for (const part of parts) {
        const r = await api<Result>("/api/links/import", { body: { csv: part.csv, lineOffset: part.lineOffset } });
        total.created += r.created;
        total.failed.push(...r.failed);
        setProgress({ done: Math.min(part.lineOffset + BATCH_SIZE, preview?.rows.length ?? 0), total: preview?.rows.length ?? 0 });
      }
      return total;
    },
    onSuccess: async (r) => {
      setResult(r);
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
    onSettled: () => setProgress(null),
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setResult(null);
    check.mutate(text);
  }

  async function template() {
    const res = await fetch("/api/links/import/template", { credentials: "same-origin" });
    downloadBlob(await res.blob(), "hop-links-template.csv");
  }

  const problems = preview ? preview.rows.length - preview.validCount : 0;

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CircleCheckIcon className="size-4 text-success" aria-hidden="true" />
          {t("import.created", { count: result.created })}
        </p>
        {result.failed.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleAlertIcon className="size-4 text-warning" aria-hidden="true" />
              {t("import.skipped", { count: result.failed.length })}
            </p>
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto pl-6 text-[13px] text-muted-foreground">
              {result.failed.map((f) => (
                <li key={f.line}>{t("import.lineProblem", { line: f.line, problems: f.errors.map((c) => t(`import.errors.${c}`, { defaultValue: c })).join(", ") })}</li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter className="mt-1">
          <Button onClick={onClose}>{tc("done")}</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label={t("import.file")} className="min-w-64 flex-1" hint={t("import.columns")}>
          {(id) => <Input id={id} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} />}
        </FormField>
        <Button variant="outline" className="sm:mb-6" onClick={() => void template()}>
          <DownloadIcon data-icon="inline-start" />
          {t("import.template")}
        </Button>
      </div>

      {preview && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">
              <CircleCheckIcon data-icon="inline-start" aria-hidden="true" />
              {t("import.ready", { count: preview.validCount })}
            </Badge>
            {problems > 0 && (
              <Badge variant="destructive">
                <CircleAlertIcon data-icon="inline-start" aria-hidden="true" />
                {t("import.problems", { count: problems })}
              </Badge>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>{t("import.line")}</TableHead>
                  <TableHead>{t("fields.url")}</TableHead>
                  <TableHead>{t("import.slugColumn")}</TableHead>
                  <TableHead>{t("import.statusColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="text-muted-foreground tabular-nums">{r.line}</TableCell>
                    <TableCell className="max-w-64 truncate" title={r.url}>
                      {r.url}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.slug || t("import.generated")}</TableCell>
                    <TableCell>
                      {r.errors.length === 0 ? (
                        <span className="text-success">{t("import.ok")}</span>
                      ) : (
                        <span className="text-destructive">{r.errors.map((c) => t(`import.errors.${c}`, { defaultValue: c })).join(" ")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <DialogFooter className="mt-1 sm:items-center">
        {progress && progress.total > 0 && (
          <p role="status" className="text-[13px] text-muted-foreground tabular-nums sm:mr-auto">
            {t("import.progress", { done: progress.done, total: progress.total })}
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button disabled={!preview || preview.validCount === 0} loading={run.isPending} onClick={() => run.mutate()}>
          {!run.isPending && <UploadIcon data-icon="inline-start" />}
          {t("import.run", { count: preview?.validCount ?? 0 })}
        </Button>
      </DialogFooter>
    </div>
  );
}
