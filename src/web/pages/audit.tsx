import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, RequireAdmin } from "../components/page";
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { FormField } from "../components/form-field";
import { OptionSelect } from "../components/option-select";
import { SearchSelect } from "../components/search-select";
import { EmptyState, ErrorState } from "../components/states";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { directoryQuery } from "../features/links/api";
import { api, qs } from "../lib/api";
import { formatDateTime } from "../lib/cn";

type Entry = {
  id: number;
  ts: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  data: unknown;
};
type AuditResponse = { items: Entry[]; total: number; page: number; pageSize: number; entityTypes: string[]; actions: string[] };

type TFn = (key: string, options?: { defaultValue?: string }) => string;

/** Friendly name of an action code like "link.update"; unknown codes show as they are. */
function actionLabel(t: TFn, action: string) {
  return t(`actions.${action.replace(".", "_")}`, { defaultValue: action });
}
function entityLabel(t: TFn, type: string) {
  return t(`entities.${type}`, { defaultValue: type });
}

/** The thing the entry is about, in words: an email, a name or an address when there is one. */
function itemLabel(t: TFn, e: Entry) {
  if (e.entityType === "settings" && e.entityId) return t(`settingsAreas.${e.entityId}`, { defaultValue: e.entityId });
  if (e.entityType === "data" && e.entityId) return t(`dataItems.${e.entityId}`, { defaultValue: e.entityId });
  const data = (e.data ?? {}) as Record<string, unknown> & { before?: Record<string, unknown>; after?: Record<string, unknown> };
  const record = data.after ?? data.before ?? data;
  for (const key of ["email", "slug", "host", "name"]) {
    const value = record[key] ?? data[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function AuditPage() {
  return (
    <RequireAdmin>
      <AuditContent />
    </RequireAdmin>
  );
}

function AuditContent() {
  const { t, i18n } = useTranslation("audit");
  const [filters, setFilters] = useState({ userId: "", entityType: "", action: "" });
  const [page, setPage] = useState(1);

  const users = useQuery(directoryQuery);
  const log = useQuery({
    queryKey: ["audit", filters, page],
    queryFn: () => api<AuditResponse>(`/api/audit${qs({ ...filters, page })}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  const data = log.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Object.values(filters).some(Boolean);
  const columns = [t("columns.when"), t("columns.user"), t("columns.action"), t("columns.item"), t("columns.details")];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <FormField label={t("user")}>
          {(id) => (
            <SearchSelect
              id={id}
              value={filters.userId}
              onValueChange={(v) => setFilter("userId", v)}
              options={[{ value: "", label: t("allUsers") }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
              empty={t("noUserMatch")}
            />
          )}
        </FormField>
        <FormField label={t("type")}>
          {(id) => (
            <OptionSelect
              id={id}
              className="w-full"
              value={filters.entityType}
              onValueChange={(v) => setFilter("entityType", v)}
              options={[{ value: "", label: t("allTypes") }, ...(data?.entityTypes ?? []).map((v) => ({ value: v, label: entityLabel(t, v) }))]}
            />
          )}
        </FormField>
        <FormField label={t("action")}>
          {(id) => (
            <OptionSelect
              id={id}
              className="w-full"
              value={filters.action}
              onValueChange={(v) => setFilter("action", v)}
              options={[{ value: "", label: t("allActions") }, ...(data?.actions ?? []).map((v) => ({ value: v, label: actionLabel(t, v) }))]}
            />
          )}
        </FormField>
      </div>

      {log.isError && !data ? (
        <Card>
          <ErrorState onRetry={() => log.refetch()} retrying={log.isFetching} />
        </Card>
      ) : data && data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<HistoryIcon />} title={filtered ? t("emptyFiltered") : t("empty")} />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <Table stack aria-busy={!data || undefined}>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i} aria-hidden>
                      <TableCell>
                        <Skeleton className="h-3.5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-3.5 w-32" />
                      </TableCell>
                      <TableCell className="max-md:hidden">
                        <Skeleton className="h-3.5 w-40" />
                      </TableCell>
                    </TableRow>
                  ))
                : data.items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground md:text-[13px]">
                        {formatDateTime(e.ts, i18n.language)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{e.userName ?? t("system")}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{actionLabel(t, e.action)}</TableCell>
                      <TableCell className="text-[13px]">
                        <span className="text-muted-foreground">{entityLabel(t, e.entityType)}</span>
                        {itemLabel(t, e) && <span className="ml-1.5 break-all">{itemLabel(t, e)}</span>}
                        {e.entityId && !itemLabel(t, e) && (
                          <span className="ml-1.5 break-all font-mono text-xs text-muted-foreground" title={e.entityId}>
                            {e.entityId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-64 truncate font-mono text-xs text-muted-foreground max-md:hidden!"
                        title={e.data ? JSON.stringify(e.data) : undefined}
                      >
                        {e.data ? JSON.stringify(e.data) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && data.total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
          <span className="tabular-nums">{t("total", { count: data.total })}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{t("page", { page, pages })}</span>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeftIcon data-icon="inline-start" />
              {t("common:previous")}
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t("common:next")}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
