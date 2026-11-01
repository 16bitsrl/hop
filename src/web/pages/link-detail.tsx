import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { Button, Card, ConfirmDialog, EmptyState, PageSpinner, Tabs, useToast } from "../components/ui";
import { linkQuery } from "../features/links/api";
import { EditTab } from "../features/links/edit-tab";
import { HistoryTab } from "../features/links/history-tab";
import { OverviewTab } from "../features/links/overview-tab";
import { ShareTab } from "../features/links/share-tab";
import { SmartTab } from "../features/links/smart-tab";
import { LinkStats } from "../features/stats/link-stats";
import { api, ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";

type TabId = "overview" | "edit" | "smart" | "share" | "history" | "stats";

export function LinkDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("overview");
  const [confirming, setConfirming] = useState(false);
  const { data: link, error, isPending } = useQuery(linkQuery(id));

  const remove = useMutation({
    mutationFn: () => api(`/api/links/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirming(false);
      queryClient.removeQueries({ queryKey: ["link", id] });
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success(t("deleted"));
      void navigate({ to: "/links" });
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  if (isPending) return <PageSpinner />;
  if (error || !link) {
    return (
      <Card>
        <EmptyState
          title={error instanceof ApiError && error.status === 404 ? t("notFound") : tc("errors:generic")}
          action={
            <RouterLink to="/links">
              <Button>{tc("goHome")}</Button>
            </RouterLink>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <RouterLink to="/links" className="mb-3 inline-block text-[13px] text-muted hover:text-fg">
        ← {tc("nav.links")}
      </RouterLink>
      <PageHeader
        title={link.title || link.slug}
        description={link.shortUrl}
        actions={
          <span title={link.canModify ? undefined : t("readOnly")}>
            <Button variant="danger" disabled={!link.canModify} onClick={() => setConfirming(true)}>
              {t("delete")}
            </Button>
          </span>
        }
      />
      <Tabs
        tabs={[
          { id: "overview", label: t("tabs.overview") },
          { id: "edit", label: t("tabs.edit") },
          { id: "smart", label: t("tabs.smart") },
          { id: "share", label: t("tabs.share") },
          { id: "history", label: t("tabs.history") },
          { id: "stats", label: t("tabs.stats") },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div role="tabpanel" className="mt-6">
        {tab === "overview" && <OverviewTab link={link} />}
        {tab === "edit" && <EditTab key={link.id} link={link} />}
        {tab === "smart" && <SmartTab key={link.id} link={link} />}
        {tab === "share" && <ShareTab key={link.id} link={link} />}
        {tab === "history" && <HistoryTab linkId={link.id} />}
        {tab === "stats" && <LinkStats linkId={link.id} />}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        danger
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description", { link: link.shortUrl })}
        confirmLabel={t("confirmDelete.confirm")}
      />
    </>
  );
}
