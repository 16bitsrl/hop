import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Dialog, Field, Input, Table, TBody, Td, Th, THead, Tr, useToast } from "../../components/legacy";
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
    <Dialog open={open} onClose={onClose} title={t("import.title")} description={t("import.description")} className="max-w-3xl">
      <ImportFlow onClose={onClose} />
    </Dialog>
  );
}

function ImportFlow({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const toast = useToast();
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
        <p className="text-sm font-medium">{t("import.created", { count: result.created })}</p>
        {result.failed.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("import.skipped", { count: result.failed.length })}</p>
            <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
              {result.failed.map((f) => (
                <li key={f.line}>{t("import.lineProblem", { line: f.line, problems: f.errors.map((c) => t(`import.errors.${c}`, { defaultValue: c })).join(", ") })}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {tc("done")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("import.file")} className="min-w-64 flex-1" hint={t("import.columns")}>
          {(id) => <Input id={id} type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e)} />}
        </Field>
        <Button onClick={() => void template()}>{t("import.template")}</Button>
      </div>

      {preview && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{t("import.ready", { count: preview.validCount })}</Badge>
            {problems > 0 && <Badge tone="red">{t("import.problems", { count: problems })}</Badge>}
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            <Table>
              <THead>
                <tr>
                  <Th>{t("import.line")}</Th>
                  <Th>{t("fields.url")}</Th>
                  <Th>{t("import.slugColumn")}</Th>
                  <Th>{t("import.statusColumn")}</Th>
                </tr>
              </THead>
              <TBody>
                {preview.rows.map((r) => (
                  <Tr key={r.line}>
                    <Td className="tabular-nums text-muted-foreground">{r.line}</Td>
                    <Td className="max-w-64 truncate" title={r.url}>
                      {r.url}
                    </Td>
                    <Td className="font-mono text-xs">{r.slug || t("import.generated")}</Td>
                    <Td>
                      {r.errors.length === 0 ? (
                        <span className="text-success">{t("import.ok")}</span>
                      ) : (
                        <span className="text-destructive">{r.errors.map((c) => t(`import.errors.${c}`, { defaultValue: c })).join(" ")}</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2">
        {progress && progress.total > 0 && (
          <p role="status" className="mr-auto text-[13px] text-muted-foreground">
            {t("import.progress", { done: progress.done, total: progress.total })}
          </p>
        )}
        <Button onClick={onClose}>{tc("cancel")}</Button>
        <Button variant="primary" disabled={!preview || preview.validCount === 0} loading={run.isPending} onClick={() => run.mutate()}>
          {t("import.run", { count: preview?.validCount ?? 0 })}
        </Button>
      </div>
    </div>
  );
}
