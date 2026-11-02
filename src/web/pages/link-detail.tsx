import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, LinkIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page";
import { EmptyState } from "@/components/states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { linkQuery } from "../features/links/api";
import { EditTab } from "../features/links/edit-tab";
import { HistoryTab } from "../features/links/history-tab";
import { OverviewTab } from "../features/links/overview-tab";
import { ShareTab } from "../features/links/share-tab";
import { SmartTab } from "../features/links/smart-tab";
import { LinkStats } from "../features/stats/link-stats";
import { api, ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";

const TABS = ["overview", "edit", "smart", "share", "history", "stats"] as const;
type TabId = (typeof TABS)[number];

function BackLink() {
  const tc = useTranslation().t;
  return (
    <RouterLink to="/links" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      {tc("nav.links")}
    </RouterLink>
  );
}

/** Same shape as the loaded page: header, tabs, the first card. */
function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("loading")}>
      <Skeleton className="mb-4 h-3.5 w-16" />
      <Skeleton className="mb-2 h-6 w-64 max-w-full" />
      <Skeleton className="mb-6 h-3.5 w-48" />
      <Skeleton className="mb-6 h-9 w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

export function LinkDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
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

  if (isPending) return <DetailSkeleton />;
  if (error || !link) {
    return (
      <Card>
        <EmptyState
          icon={<LinkIcon />}
          title={error instanceof ApiError && error.status === 404 ? t("notFound") : tc("errors:generic")}
          action={
            <RouterLink to="/links" className={buttonVariants({ variant: "outline" })}>
              {tc("goHome")}
            </RouterLink>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={link.title || link.slug}
        description={link.shortUrl}
        actions={
          <span title={link.canModify ? undefined : t("readOnly")}>
            <Button variant="destructive" disabled={!link.canModify} onClick={() => setConfirming(true)}>
              <Trash2Icon data-icon="inline-start" />
              {t("delete")}
            </Button>
          </span>
        }
      />
      {/* flex-col here: the shared Tabs root never turns into a column on its own. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="flex-col gap-6">
        <TabsList variant="line">
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab link={link} />
        </TabsContent>
        <TabsContent value="edit">
          <EditTab key={link.id} link={link} />
        </TabsContent>
        <TabsContent value="smart">
          <SmartTab key={link.id} link={link} />
        </TabsContent>
        <TabsContent value="share">
          <ShareTab key={link.id} link={link} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab linkId={link.id} />
        </TabsContent>
        <TabsContent value="stats">
          <LinkStats linkId={link.id} />
        </TabsContent>
      </Tabs>
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
