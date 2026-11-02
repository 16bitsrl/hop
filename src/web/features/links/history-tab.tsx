import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { HistoryIcon } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/cn";

type Entry = {
  id: number;
  ts: string;
  userId: string | null;
  userName: string | null;
  action: string;
  data: { before?: Record<string, unknown>; after?: Record<string, unknown>; bulk?: boolean; source?: string } | null;
};

/** One value of a changed field, in words. */
function useFormat() {
  const { t, i18n } = useTranslation("links");
  return (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return t("history.empty");
    if (typeof value === "boolean") return value ? t("history.yes") : t("history.no");
    if (key === "expiresAt" && typeof value === "string") return formatDateTime(value, i18n.language);
    if (key === "tags" && Array.isArray(value)) return value.length ? value.join(", ") : t("history.empty");
    if (key === "rules") return t("history.rules", { count: (value as unknown[]).length });
    if (key === "variants") return t("history.variants", { count: (value as unknown[]).length });
    if (key === "redirectType") return t(`redirectTypes.${value as number}`, { defaultValue: String(value) });
    return String(value);
  };
}

const VERBS: Record<string, string> = { "link.create": "created", "link.update": "updated", "link.delete": "deleted" };

export function HistoryTab({ linkId }: { linkId: string }) {
  const { t, i18n } = useTranslation("links");
  const format = useFormat();
  const history = useQuery({
    queryKey: ["link-history", linkId],
    queryFn: () => api<{ items: Entry[] }>(`/api/links/${linkId}/history`),
    staleTime: 0,
  });

  if (history.isPending) {
    return (
      <Card className="gap-0 py-0">
        <ListSkeleton rows={3} />
      </Card>
    );
  }
  if (history.isError) {
    return (
      <Card>
        <ErrorState onRetry={() => history.refetch()} retrying={history.isFetching} />
      </Card>
    );
  }
  const items = history.data?.items ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={<HistoryIcon />} title={t("history.noChanges")} description={t("history.emptyHint")} />
      </Card>
    );
  }

  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y divide-border">
        {items.map((entry) => {
          const verb = VERBS[entry.action] ?? "updated";
          const before = entry.data?.before ?? {};
          const after = entry.data?.after ?? {};
          const keys = verb === "updated" ? Object.keys(after) : [];
          return (
            <li key={entry.id} data-testid="history-entry">
              <div className="flex flex-col gap-2 px-(--card-spacing) py-4">
                <p className="text-sm">
                  <span className="font-medium">{entry.userName ?? t("history.system")}</span>{" "}
                  {t(`history.verb.${verb}`)}
                  {entry.data?.bulk ? <span className="text-muted-foreground"> {t("history.bulk")}</span> : null}
                  {entry.data?.source === "import" ? <span className="text-muted-foreground"> {t("history.imported")}</span> : null}
                  <span className="text-muted-foreground tabular-nums"> · {formatDateTime(entry.ts, i18n.language)}</span>
                </p>
                {keys.length > 0 && (
                  <dl className="flex flex-col gap-1 text-[13px]">
                    {keys.map((key) => (
                      <div key={key} className="grid gap-x-3 sm:grid-cols-[140px_1fr]">
                        <dt className="text-muted-foreground">{t(`history.fields.${key}`, { defaultValue: key })}</dt>
                        <dd className="min-w-0 break-words">
                          <span className="text-muted-foreground line-through decoration-muted-foreground/50">{format(key, before[key])}</span>
                          <span className="mx-1.5 text-muted-foreground" aria-label={t("history.changedTo")}>
                            →
                          </span>
                          <span>{format(key, after[key])}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
