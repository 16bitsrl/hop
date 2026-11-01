import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, RequireAdmin } from "../components/page";
import { Button, Card, EmptyState, Field, HistoryIcon, PageSpinner, Select, Table, TBody, Td, Th, THead, Tr } from "../components/ui";
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

  const users = useQuery({ queryKey: ["users", "directory"], queryFn: () => api<{ users: { id: string; name: string }[] }>("/api/users/directory") });
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

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label={t("user")}>
          {(id) => (
            <Select id={id} value={filters.userId} onChange={(e) => setFilter("userId", e.target.value)}>
              <option value="">{t("allUsers")}</option>
              {users.data?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("type")}>
          {(id) => (
            <Select id={id} value={filters.entityType} onChange={(e) => setFilter("entityType", e.target.value)}>
              <option value="">{t("allTypes")}</option>
              {data?.entityTypes.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("action")}>
          {(id) => (
            <Select id={id} value={filters.action} onChange={(e) => setFilter("action", e.target.value)}>
              <option value="">{t("allActions")}</option>
              {data?.actions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {!data ? (
        <PageSpinner />
      ) : (
        <Card>
          {data.items.length === 0 ? (
            <EmptyState icon={<HistoryIcon />} title={filtered ? t("emptyFiltered") : t("empty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>{t("columns.when")}</Th>
                  <Th>{t("columns.user")}</Th>
                  <Th>{t("columns.action")}</Th>
                  <Th>{t("columns.item")}</Th>
                  <Th>{t("columns.details")}</Th>
                </tr>
              </THead>
              <TBody>
                {data.items.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDateTime(e.ts, i18n.language)}</Td>
                    <Td className="whitespace-nowrap">{e.userName ?? t("system")}</Td>
                    <Td>
                      <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">{e.action}</code>
                    </Td>
                    <Td className="text-[13px]">
                      <span className="text-muted">{e.entityType}</span>
                      {e.entityId && <span className="ml-1.5 break-all font-mono text-xs">{e.entityId}</span>}
                    </Td>
                    <Td className="max-w-64 truncate font-mono text-xs text-muted" title={e.data ? JSON.stringify(e.data) : undefined}>
                      {e.data ? JSON.stringify(e.data) : ""}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {data && data.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span>{t("total", { count: data.total })}</span>
          <div className="flex items-center gap-2">
            <span>{t("page", { page, pages })}</span>
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("common:previous")}
            </Button>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t("common:next")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
