import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderInputIcon,
  LinkIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyIconButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { PageHeader } from "@/components/page";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { directoryQuery, domainsQuery, foldersQuery, tagsQuery, type Link } from "../features/links/api";
import { CreateLinkDialog } from "../features/links/create-dialog";
import { FoldersDialog } from "../features/links/folders-dialog";
import { ImportDialog } from "../features/links/import-dialog";
import { folderOptions, StateBadges, TagChip } from "../features/links/parts";
import { api, qs } from "../lib/api";
import { formatDate } from "../lib/cn";
import { inBatches } from "../lib/batches";
import { errorMessage } from "../lib/errors";
import { canCreate, useMe } from "../lib/session";
import { sharedUrl, takeRememberedShared } from "../lib/share";
import { useMediaQuery } from "../lib/use-media-query";

type Filters = { q: string; owner: string; tag: string; folder: string; domain: string; state: string; sort: string; dir: "asc" | "desc" };
type Page = { items: Link[]; total: number; page: number; pageSize: number };
type BulkAction = "addTag" | "removeTag" | "move" | "enable" | "disable" | "delete";

const PAGE_SIZE = 25;

export function LinksPage() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const me = useMe();
  const queryClient = useQueryClient();
  const desktop = useMediaQuery("(min-width: 768px)");

  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as { state?: string; share?: string; url?: string; text?: string };
  const initialState = searchParams.state;
  const [filters, setFilters] = useState<Filters>({ q: "", owner: "", tag: "", folder: "", domain: "", state: initialState ?? "", sort: "created", dir: "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [sharedLink, setSharedLink] = useState("");
  const [importing, setImporting] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [removing, setRemoving] = useState<Link | null>(null);
  const [bulkDialog, setBulkDialog] = useState<"addTag" | "removeTag" | "move" | "delete" | null>(null);

  // A link shared to hop (share sheet or bookmarklet) opens the create dialog with the address filled in.
  useEffect(() => {
    const shared = sharedUrl(searchParams) ?? takeRememberedShared();
    if (!shared) return;
    if (canCreate(me)) {
      setSharedLink(shared);
      setCreating(true);
    }
    void navigate({ to: "/links", search: initialState ? { state: initialState } : {}, replace: true });
    // Only when the page opens with a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing in the search box waits a moment before asking the server.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.q === search ? f : { ...f, q: search }));
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const users = useQuery(directoryQuery);
  const tags = useQuery(tagsQuery);
  const folders = useQuery(foldersQuery);
  const domains = useQuery(domainsQuery);
  const list = useQuery({
    queryKey: ["links", filters, page],
    queryFn: () => api<Page>(`/api/links${qs({ ...filters, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected(new Set());
  }

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(filters.q || filters.owner || filters.tag || filters.folder || filters.domain || filters.state);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/links/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      toast.success(t("deleted"));
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  const bulk = useMutation({
    // The server takes a few links per request: send the selection in batches and add up the reports.
    mutationFn: async (body: { action: BulkAction; tag?: string; folderId?: string | null }) => {
      const total = { done: 0, skipped: [] as { id: string; reason: string }[] };
      for (const ids of inBatches([...selected])) {
        const r = await api<{ done: number; skipped: { id: string; reason: string }[] }>("/api/links/bulk", { body: { ids, ...body } });
        total.done += r.done;
        total.skipped.push(...r.skipped);
      }
      return total;
    },
    onSuccess: async ({ done, skipped }) => {
      setBulkDialog(null);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      const message = t("bulk.updated", { count: done });
      if (skipped.length) (done > 0 ? toast.success : toast.error)(`${message} ${t("bulk.skipped", { count: skipped.length })}`);
      else toast.success(message);
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  const allSelected = items.length > 0 && items.every((l) => selected.has(l.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleAll = (on: boolean) => setSelected(on ? new Set(items.map((l) => l.id)) : new Set());

  const statusOptions = [
    { value: "", label: t("filters.anyStatus") },
    ...(["active", "disabled", "expired", "broken", "protected"] as const).map((s) => ({ value: s, label: t(`states.${s}`) })),
  ];
  const filterClass = "w-full md:w-auto md:min-w-36";

  return (
    <>
      <PageHeader
        title={tc("nav.links")}
        description={t("description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setOrganizing(true)}>
              <FolderIcon data-icon="inline-start" />
              {t("folders.button")}
            </Button>
            {canCreate(me) && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <UploadIcon data-icon="inline-start" />
                {t("import.button")}
              </Button>
            )}
            {canCreate(me) && (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon="inline-start" />
                {t("create.button")}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput type="search" aria-label={t("search")} placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <OwnerFilter users={users.data ?? []} value={filters.owner} onChange={(id) => setFilter("owner", id)} />
          <OptionSelect
            aria-label={t("filters.tag")}
            className={filterClass}
            value={filters.tag}
            onValueChange={(v) => setFilter("tag", v)}
            options={[{ value: "", label: t("filters.anyTag") }, ...(tags.data ?? []).map((x) => ({ value: x.id, label: x.name }))]}
          />
          <OptionSelect
            aria-label={t("filters.folder")}
            className={filterClass}
            value={filters.folder}
            onValueChange={(v) => setFilter("folder", v)}
            options={folderOptions(folders.data ?? [], [
              { value: "", label: t("filters.anyFolder") },
              { value: "none", label: t("folders.none") },
            ])}
          />
          {(domains.data?.length ?? 0) > 1 && (
            <OptionSelect
              aria-label={t("filters.domain")}
              className={filterClass}
              value={filters.domain}
              onValueChange={(v) => setFilter("domain", v)}
              options={[{ value: "", label: t("filters.anyDomain") }, ...(domains.data ?? []).map((d) => ({ value: d.id, label: d.host }))]}
            />
          )}
          <OptionSelect aria-label={t("filters.status")} className={filterClass} value={filters.state} onValueChange={(v) => setFilter("state", v)} options={statusOptions} />
          <OptionSelect
            aria-label={t("filters.sort")}
            className={filterClass}
            value={filters.sort}
            onValueChange={(v) => setFilter("sort", v)}
            options={(["created", "clicks", "lastClick", "slug"] as const).map((s) => ({ value: s, label: t(`sort.${s}`) }))}
          />
          <Button
            variant="outline"
            className="max-md:h-10"
            aria-label={t("filters.reverse")}
            title={t("filters.reverse")}
            onClick={() => setFilter("dir", filters.dir === "desc" ? "asc" : "desc")}
          >
            {filters.dir === "desc" ? <ArrowDownWideNarrowIcon data-icon="inline-start" /> : <ArrowUpNarrowWideIcon data-icon="inline-start" />}
            {t(`filters.${filters.dir}`)}
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft px-3 py-2 duration-150 animate-in fade-in-0 slide-in-from-top-1"
        >
          <span className="mr-2 text-sm font-medium tabular-nums">{t("bulk.selected", { count: selected.size })}</span>
          {canCreate(me) && (
            <>
              <Button size="sm" variant="outline" onClick={() => setBulkDialog("addTag")}>
                <TagIcon data-icon="inline-start" />
                {t("bulk.addTag")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkDialog("removeTag")}>
                {t("bulk.removeTag")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkDialog("move")}>
                <FolderInputIcon data-icon="inline-start" />
                {t("bulk.move")}
              </Button>
              <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: "enable" })}>
                <PowerIcon data-icon="inline-start" />
                {t("bulk.enable")}
              </Button>
              <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate({ action: "disable" })}>
                <PowerOffIcon data-icon="inline-start" />
                {t("bulk.disable")}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkDialog("delete")}>
                <Trash2Icon data-icon="inline-start" />
                {t("bulk.delete")}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            <XIcon data-icon="inline-start" />
            {t("bulk.clear")}
          </Button>
        </div>
      )}

      {list.isPending ? (
        <ListLoading desktop={desktop} />
      ) : list.isError ? (
        <Card>
          <ErrorState onRetry={() => list.refetch()} retrying={list.isFetching} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={filtered ? <SearchIcon /> : <LinkIcon />}
            title={filtered ? t("empty.filtered") : t("empty.title")}
            description={filtered ? undefined : t("empty.description")}
            action={
              !filtered && canCreate(me) ? (
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon data-icon="inline-start" />
                  {t("create.button")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : desktop ? (
        <Card className="gap-0 py-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox aria-label={t("bulk.selectAll")} checked={allSelected} onCheckedChange={(on) => toggleAll(on)} />
                </TableHead>
                <TableHead className="w-[32%]">{t("columns.link")}</TableHead>
                <TableHead>{t("columns.destination")}</TableHead>
                <TableHead className="hidden w-36 2xl:table-cell">{t("columns.owner")}</TableHead>
                <TableHead className="w-[16%]">{t("columns.tags")}</TableHead>
                <TableHead className="w-20 text-right">{t("columns.clicks")}</TableHead>
                <TableHead className="w-32">{t("columns.status")}</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((l) => (
                <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox aria-label={t("bulk.select", { slug: l.slug })} checked={selected.has(l.id)} onCheckedChange={(on) => toggle(l.id, on)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-1">
                      <RouterLink to="/links/$id" params={{ id: l.id }} className="truncate font-medium underline-offset-4 hover:underline">
                        <span className="text-muted-foreground">{l.host}/</span>
                        {l.slug}
                      </RouterLink>
                      <CopyIconButton value={l.shortUrl} label={t("copyShort")} onCopied={() => toast.success(tc("copied"))} className="shrink-0" />
                    </div>
                    {/* Always there, so every row has the same height. */}
                    <p className="truncate text-[13px] text-muted-foreground" aria-hidden={!l.title}>
                      {l.title || " "}
                    </p>
                  </TableCell>
                  <TableCell>
                    <a href={l.url} target="_blank" rel="noreferrer" title={l.url} className="block truncate text-muted-foreground hover:text-foreground hover:underline">
                      {l.url}
                    </a>
                  </TableCell>
                  <TableCell className="hidden truncate text-muted-foreground 2xl:table-cell">{l.ownerName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {l.tags.map((x) => (
                        <TagChip key={x.id} tag={x} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.clickCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StateBadges states={l.states} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span title={l.canModify ? undefined : t("readOnly")}>
                      <Button size="sm" variant="destructive-ghost" disabled={!l.canModify} onClick={() => setRemoving(l)}>
                        {t("delete")}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((l) => (
            <li key={l.id}>
              <Card className="py-4 data-[selected=true]:border-primary/40" data-selected={selected.has(l.id)}>
                <div className="flex items-start gap-3 px-4">
                  <div className="flex size-6 shrink-0 items-center justify-center">
                    <Checkbox aria-label={t("bulk.select", { slug: l.slug })} checked={selected.has(l.id)} onCheckedChange={(on) => toggle(l.id, on)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <RouterLink to="/links/$id" params={{ id: l.id }} className="block truncate font-medium">
                      <span className="text-muted-foreground">{l.host}/</span>
                      {l.slug}
                    </RouterLink>
                    {l.title && <p className="truncate text-[13px]">{l.title}</p>}
                    <p className="truncate text-[13px] text-muted-foreground">{l.url}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StateBadges states={l.states} />
                      {l.tags.map((x) => (
                        <TagChip key={x.id} tag={x} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                      {t("card.meta", { clicks: l.clickCount, owner: l.ownerName ?? "—", date: formatDate(l.createdAt) })}
                    </p>
                  </div>
                  <CopyIconButton value={l.shortUrl} label={t("copyShort")} onCopied={() => toast.success(tc("copied"))} className="-mt-1 -mr-1 size-10" />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <nav aria-label={t("pagination")} className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span className="tabular-nums">{t("total", { count: total })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeftIcon data-icon="inline-start" />
              {tc("previous")}
            </Button>
            <span className="tabular-nums">{t("pageOf", { page, pages })}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {tc("next")}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </nav>
      )}

      <CreateLinkDialog
        open={creating}
        initialUrl={sharedLink}
        onClose={() => {
          setCreating(false);
          setSharedLink("");
        }}
      />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <FoldersDialog open={organizing} onClose={() => setOrganizing(false)} />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        danger
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description", { link: removing?.shortUrl ?? "" })}
        confirmLabel={t("confirmDelete.confirm")}
      />
      <ConfirmDialog
        open={bulkDialog === "delete"}
        onClose={() => setBulkDialog(null)}
        onConfirm={() => bulk.mutate({ action: "delete" })}
        loading={bulk.isPending}
        danger
        title={t("bulk.confirmTitle", { count: selected.size })}
        description={t("bulk.confirmText")}
        confirmLabel={t("bulk.confirmButton")}
      />
      <TagBulkDialog
        action={bulkDialog === "addTag" || bulkDialog === "removeTag" ? bulkDialog : null}
        onClose={() => setBulkDialog(null)}
        suggestions={(tags.data ?? []).map((x) => x.name)}
        loading={bulk.isPending}
        onApply={(tag, action) => bulk.mutate({ action, tag })}
      />
      <MoveBulkDialog open={bulkDialog === "move"} onClose={() => setBulkDialog(null)} loading={bulk.isPending} onApply={(folderId) => bulk.mutate({ action: "move", folderId })} />
    </>
  );
}

/** Placeholder rows shaped like the table (or the cards on a phone) while the first page loads. */
function ListLoading({ desktop }: { desktop: boolean }) {
  const tc = useTranslation().t;
  const rows = Array.from({ length: 6 }, (_, i) => i);
  if (!desktop) {
    return (
      <ul role="status" aria-label={tc("loading")} className="flex flex-col gap-3">
        {rows.slice(0, 4).map((i) => (
          <li key={i}>
            <Card className="gap-2 px-4 py-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="mt-1 h-5 w-24" />
            </Card>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Card role="status" aria-label={tc("loading")} className="gap-0 py-0">
      <div className="h-9 border-b" />
      {rows.map((i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="size-4 shrink-0 rounded-[4px]" />
          <div className="flex w-[30%] flex-col gap-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3.5 w-10" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </Card>
  );
}

/** Owner filter: type to find a person, or pick one from the list. */
function OwnerFilter({ users, value, onChange }: { users: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation("links");
  const selected = users.find((u) => u.id === value) ?? null;
  return (
    <Combobox
      items={users}
      value={selected}
      onValueChange={(u) => onChange(u?.id ?? "")}
      itemToStringLabel={(u) => u.name}
      isItemEqualToValue={(a, b) => a.id === b.id}
    >
      <ComboboxInput aria-label={t("filters.owner")} placeholder={t("filters.anyOwner")} showClear={!!selected} className="w-full md:w-48" />
      <ComboboxContent>
        <ComboboxEmpty>{t("filters.noOwner")}</ComboboxEmpty>
        <ComboboxList>
          {(u: { id: string; name: string }) => (
            <ComboboxItem key={u.id} value={u}>
              {u.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function TagBulkDialog({
  action,
  onClose,
  suggestions,
  loading,
  onApply,
}: {
  action: "addTag" | "removeTag" | null;
  onClose: () => void;
  suggestions: string[];
  loading: boolean;
  onApply: (tag: string, action: "addTag" | "removeTag") => void;
}) {
  const { t } = useTranslation("links");
  const [tag, setTag] = useState("");
  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === "removeTag" ? t("bulk.removeTagTitle") : t("bulk.addTagTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (action && tag.trim()) onApply(tag.trim(), action);
          }}
        >
          <FormField label={t("bulk.tagName")}>
            {(id) => (
              <>
                <Input id={id} list={`${id}-tags`} autoFocus value={tag} maxLength={50} onChange={(e) => setTag(e.target.value)} />
                <datalist id={`${id}-tags`}>
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </FormField>
          <DialogFooter className="mt-1">
            <Button type="submit" loading={loading} disabled={!tag.trim()}>
              {t("bulk.apply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveBulkDialog({ open, onClose, loading, onApply }: { open: boolean; onClose: () => void; loading: boolean; onApply: (folderId: string | null) => void }) {
  const { t } = useTranslation("links");
  const folders = useQuery(foldersQuery);
  const [folderId, setFolderId] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bulk.moveTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onApply(folderId || null);
          }}
        >
          <FormField label={t("fields.folder")}>
            {(id) => (
              <OptionSelect id={id} value={folderId} onValueChange={setFolderId} options={folderOptions(folders.data ?? [], [{ value: "", label: t("folders.none") }])} />
            )}
          </FormField>
          <DialogFooter className="mt-1">
            <Button type="submit" loading={loading}>
              {t("bulk.apply")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
