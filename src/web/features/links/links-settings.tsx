import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BanIcon, PlusIcon, TagIcon, Trash2Icon } from "lucide-react";
import { CardSkeleton } from "../../components/card-skeleton";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { FormField } from "../../components/form-field";
import { EmptyState, ErrorState } from "../../components/states";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { toast } from "../../lib/toast";
import { tagsQuery, type Tag } from "./api";

/** Settings of the links area (admins): slug generator, blocked destinations, tags. */
export function LinksSettings() {
  return (
    <>
      <SlugCard />
      <BlockedCard />
      <TagsCard />
    </>
  );
}

function SlugCard() {
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ["settings", "slugs"],
    queryFn: () => api<{ length: number; alphabet: string }>("/api/settings/slugs"),
    staleTime: 0,
  });
  if (data) return <SlugForm initial={data} />;
  if (isError)
    return (
      <Card>
        <ErrorState onRetry={() => refetch()} retrying={isFetching} />
      </Card>
    );
  return <CardSkeleton />;
}

function SlugForm({ initial }: { initial: { length: number; alphabet: string } }) {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const [length, setLength] = useState(String(initial.length));
  const [alphabet, setAlphabet] = useState(initial.alphabet);
  const save = useMutation({
    mutationFn: () => api("/api/settings/slugs", { method: "PUT", body: { length: Number(length), alphabet } }),
    onSuccess: () => {
      toast.success(tc("saved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "slugs"] });
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.slugTitle")}</CardTitle>
        <CardDescription>{t("settings.slugDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <FormField label={t("settings.slugLength")} hint={t("settings.slugLengthHint")}>
              {(id) => <Input id={id} type="number" min={3} max={32} required value={length} onChange={(e) => setLength(e.target.value)} />}
            </FormField>
            <FormField label={t("settings.slugAlphabet")} hint={t("settings.slugAlphabetHint")}>
              {(id) => <Input id={id} required className="font-mono" value={alphabet} onChange={(e) => setAlphabet(e.target.value)} />}
            </FormField>
          </div>
          <div>
            <Button type="submit" loading={save.isPending}>
              {t("settings.slugSave")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type Blocked = { id: string; host: string; reason: string | null };

function BlockedCard() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const [host, setHost] = useState("");
  const [reason, setReason] = useState("");
  const list = useQuery({ queryKey: ["blocked-domains"], queryFn: () => api<{ blocked: Blocked[] }>("/api/blocked-domains"), staleTime: 0 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["blocked-domains"] });

  const add = useMutation({
    mutationFn: () => api("/api/blocked-domains", { body: { host, reason } }),
    onSuccess: async () => {
      setHost("");
      setReason("");
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/blocked-domains/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.blockedTitle")}</CardTitle>
        <CardDescription>{t("settings.blockedDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <FormField label={t("settings.blockedHost")}>
            {(id) => <Input id={id} required placeholder="bad-site.example" value={host} onChange={(e) => setHost(e.target.value)} />}
          </FormField>
          <FormField label={t("settings.blockedReason")}>
            {(id) => <Input id={id} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </FormField>
          <Button type="submit" loading={add.isPending}>
            {!add.isPending && <PlusIcon data-icon="inline-start" />}
            {t("settings.blockedAdd")}
          </Button>
        </form>
        {list.isError && !list.data && <ErrorState onRetry={() => list.refetch()} retrying={list.isFetching} className="py-6" />}
        {list.isPending && <RowsSkeleton />}
        {list.data && list.data.blocked.length === 0 && (
          <EmptyState icon={<BanIcon />} title={t("settings.blockedEmpty")} className="rounded-lg border border-dashed py-6" />
        )}
        {list.data && list.data.blocked.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {list.data.blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{b.host}</p>
                  {b.reason && <p className="truncate text-[13px] text-muted-foreground">{b.reason}</p>}
                </div>
                <Button size="sm" variant="ghost" aria-label={t("settings.unblock", { host: b.host })} onClick={() => remove.mutate(b.id)}>
                  {t("settings.unblockButton")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const COLOR_FALLBACK = "#888888";

function TagsCard() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const tags = useQuery(tagsQuery);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tags"] });
    await queryClient.invalidateQueries({ queryKey: ["links"] });
  };
  const update = useMutation({
    mutationFn: (v: { id: string; name?: string; color?: string }) => api(`/api/tags/${v.id}`, { method: "PATCH", body: { name: v.name, color: v.color } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/tags/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.tagsTitle")}</CardTitle>
        <CardDescription>{t("settings.tagsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {tags.isError && !tags.data && <ErrorState onRetry={() => tags.refetch()} retrying={tags.isFetching} className="py-6" />}
        {tags.isPending && <RowsSkeleton />}
        {tags.data && tags.data.length === 0 && (
          <EmptyState icon={<TagIcon />} title={t("settings.tagsEmpty")} className="rounded-lg border border-dashed py-6" />
        )}
        <ul className="divide-y divide-border">
          {tags.data?.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 py-2">
              <input
                type="color"
                aria-label={t("settings.tagColor", { name: tag.name })}
                value={tag.color ?? COLOR_FALLBACK}
                onChange={(e) => update.mutate({ id: tag.id, color: e.target.value })}
                className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
              <TagNameInput tag={tag} onRename={(name) => update.mutate({ id: tag.id, name })} />
              <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{t("settings.tagLinks", { count: tag.linkCount })}</span>
              <Button size="sm" variant="destructive-ghost" aria-label={t("settings.tagDelete", { name: tag.name })} onClick={() => setRemoving(tag)}>
                <Trash2Icon data-icon="inline-start" />
                {t("delete")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        danger
        title={t("settings.tagConfirmTitle", { name: removing?.name ?? "" })}
        description={t("settings.tagConfirmText")}
        confirmLabel={t("settings.tagConfirmButton")}
      />
    </Card>
  );
}

function RowsSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-3 py-1">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

/** Rename on blur or Enter, only when the name actually changed. */
function TagNameInput({ tag, onRename }: { tag: Tag; onRename: (name: string) => void }) {
  const { t } = useTranslation("links");
  const [name, setName] = useState(tag.name);
  const commit = () => {
    const next = name.trim();
    if (!next) setName(tag.name);
    else if (next !== tag.name) onRename(next);
  };
  return (
    <Input
      aria-label={t("settings.tagName", { name: tag.name })}
      className="min-w-0 flex-1"
      value={name}
      maxLength={50}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
    />
  );
}
