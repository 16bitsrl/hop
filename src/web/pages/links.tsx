import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  CopyIcon,
  Dialog,
  EmptyState,
  Field,
  Input,
  LinkIcon,
  PageSpinner,
  PlusIcon,
  Select,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useToast,
} from "../components/ui";
import { directoryQuery, domainsQuery, foldersQuery, folderTree, tagsQuery, type Link } from "../features/links/api";
import { CreateLinkDialog } from "../features/links/create-dialog";
import { FoldersDialog } from "../features/links/folders-dialog";
import { ImportDialog } from "../features/links/import-dialog";
import { StateBadges, TagChip } from "../features/links/parts";
import { api, qs } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { formatDate } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { canCreate, useMe } from "../lib/session";
import { useMediaQuery } from "../lib/use-media-query";

type Filters = { q: string; owner: string; tag: string; folder: string; domain: string; state: string; sort: string; dir: "asc" | "desc" };
type Page = { items: Link[]; total: number; page: number; pageSize: number };
type BulkAction = "addTag" | "removeTag" | "move" | "enable" | "disable" | "delete";

const PAGE_SIZE = 25;

export function LinksPage() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const me = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();
  const desktop = useMediaQuery("(min-width: 768px)");

  const [filters, setFilters] = useState<Filters>({ q: "", owner: "", tag: "", folder: "", domain: "", state: "", sort: "created", dir: "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [removing, setRemoving] = useState<Link | null>(null);
  const [bulkDialog, setBulkDialog] = useState<"addTag" | "removeTag" | "move" | "delete" | null>(null);

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
    mutationFn: (body: { action: BulkAction; tag?: string; folderId?: string | null }) =>
      api<{ done: number; skipped: { id: string; reason: string }[] }>("/api/links/bulk", { body: { ids: [...selected], ...body } }),
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

  async function copy(link: Link) {
    await copyText(link.shortUrl);
    toast.success(tc("copied"));
  }

  return (
    <>
      <PageHeader
        title={tc("nav.links")}
        description={t("description")}
        actions={
          <>
            <Button onClick={() => setOrganizing(true)}>{t("folders.button")}</Button>
            {canCreate(me) && <Button onClick={() => setImporting(true)}>{t("import.button")}</Button>}
            {canCreate(me) && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <PlusIcon />
                {t("create.button")}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <Input type="search" aria-label={t("search")} placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Select aria-label={t("filters.owner")} value={filters.owner} onChange={(e) => setFilter("owner", e.target.value)}>
            <option value="">{t("filters.anyOwner")}</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select aria-label={t("filters.tag")} value={filters.tag} onChange={(e) => setFilter("tag", e.target.value)}>
            <option value="">{t("filters.anyTag")}</option>
            {tags.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Select aria-label={t("filters.folder")} value={filters.folder} onChange={(e) => setFilter("folder", e.target.value)}>
            <option value="">{t("filters.anyFolder")}</option>
            <option value="none">{t("folders.none")}</option>
            {folderTree(folders.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {"  ".repeat(f.depth)}
                {f.name}
              </option>
            ))}
          </Select>
          {(domains.data?.length ?? 0) > 1 && (
            <Select aria-label={t("filters.domain")} value={filters.domain} onChange={(e) => setFilter("domain", e.target.value)}>
              <option value="">{t("filters.anyDomain")}</option>
              {domains.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.host}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label={t("filters.status")} value={filters.state} onChange={(e) => setFilter("state", e.target.value)}>
            <option value="">{t("filters.anyStatus")}</option>
            {(["active", "disabled", "expired", "broken", "protected"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`states.${s}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t("filters.sort")} value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
            {(["created", "clicks", "lastClick", "slug"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </Select>
          <Button aria-label={t("filters.reverse")} title={t("filters.reverse")} onClick={() => setFilter("dir", filters.dir === "desc" ? "asc" : "desc")}>
            {filters.dir === "desc" ? "↓" : "↑"} {t(`filters.${filters.dir}`)}
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2">
          <span className="mr-2 text-sm font-medium">{t("bulk.selected", { count: selected.size })}</span>
          {canCreate(me) && (
            <>
              <Button size="sm" onClick={() => setBulkDialog("addTag")}>
                {t("bulk.addTag")}
              </Button>
              <Button size="sm" onClick={() => setBulkDialog("removeTag")}>
                {t("bulk.removeTag")}
              </Button>
              <Button size="sm" onClick={() => setBulkDialog("move")}>
                {t("bulk.move")}
              </Button>
              <Button size="sm" onClick={() => bulk.mutate({ action: "enable" })}>
                {t("bulk.enable")}
              </Button>
              <Button size="sm" onClick={() => bulk.mutate({ action: "disable" })}>
                {t("bulk.disable")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setBulkDialog("delete")}>
                {t("bulk.delete")}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("bulk.clear")}
          </Button>
        </div>
      )}

      {list.isPending ? (
        <PageSpinner />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LinkIcon />}
            title={filtered ? t("empty.filtered") : t("empty.title")}
            description={filtered ? undefined : t("empty.description")}
            action={!filtered && canCreate(me) ? <Button variant="primary" onClick={() => setCreating(true)}>{t("create.button")}</Button> : undefined}
          />
        </Card>
      ) : desktop ? (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th className="w-10">
                  <input
                    type="checkbox"
                    aria-label={t("bulk.selectAll")}
                    className="size-4 accent-[var(--accent)]"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </Th>
                <Th>{t("columns.link")}</Th>
                <Th>{t("columns.destination")}</Th>
                <Th>{t("columns.owner")}</Th>
                <Th>{t("columns.tags")}</Th>
                <Th className="text-right">{t("columns.clicks")}</Th>
                <Th>{t("columns.status")}</Th>
                <Th>
                  <span className="sr-only">{t("columns.actions")}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {items.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={t("bulk.select", { slug: l.slug })}
                      className="size-4 accent-[var(--accent)]"
                      checked={selected.has(l.id)}
                      onChange={(e) => toggle(l.id, e.target.checked)}
                    />
                  </Td>
                  <Td className="max-w-64">
                    <div className="flex items-center gap-1.5">
                      <RouterLink to="/links/$id" params={{ id: l.id }} className="truncate font-medium hover:underline">
                        <span className="text-muted">{l.host}/</span>
                        {l.slug}
                      </RouterLink>
                      <button
                        type="button"
                        aria-label={t("copyShort")}
                        title={t("copyShort")}
                        onClick={() => void copy(l)}
                        className="shrink-0 rounded p-1 text-muted hover:bg-subtle hover:text-fg"
                      >
                        <CopyIcon />
                      </button>
                    </div>
                    {l.title && <p className="truncate text-[13px] text-muted">{l.title}</p>}
                  </Td>
                  <Td className="max-w-64">
                    <a href={l.url} target="_blank" rel="noreferrer" title={l.url} className="block truncate text-muted hover:text-fg hover:underline">
                      {l.url}
                    </a>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{l.ownerName ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {l.tags.map((x) => (
                        <TagChip key={x.id} tag={x} />
                      ))}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{l.clickCount.toLocaleString()}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <StateBadges states={l.states} />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <RouterLink to="/links/$id" params={{ id: l.id }}>
                      <Button size="sm" variant="ghost" tabIndex={-1}>
                        {t("open")}
                      </Button>
                    </RouterLink>
                    <span title={l.canModify ? undefined : t("readOnly")}>
                      <Button size="sm" variant="ghost" disabled={!l.canModify} onClick={() => setRemoving(l)}>
                        {t("delete")}
                      </Button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((l) => (
            <li key={l.id}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    label=""
                    aria-label={t("bulk.select", { slug: l.slug })}
                    checked={selected.has(l.id)}
                    onChange={(e) => toggle(l.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <RouterLink to="/links/$id" params={{ id: l.id }} className="block truncate font-medium">
                      <span className="text-muted">{l.host}/</span>
                      {l.slug}
                    </RouterLink>
                    {l.title && <p className="truncate text-[13px]">{l.title}</p>}
                    <p className="truncate text-[13px] text-muted">{l.url}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StateBadges states={l.states} />
                      {l.tags.map((x) => (
                        <TagChip key={x.id} tag={x} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t("card.meta", { clicks: l.clickCount, owner: l.ownerName ?? "—", date: formatDate(l.createdAt) })}
                    </p>
                  </div>
                  <button type="button" aria-label={t("copyShort")} onClick={() => void copy(l)} className="rounded p-2 text-muted hover:bg-subtle">
                    <CopyIcon />
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
          <span>{t("total", { count: total })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {tc("previous")}
            </Button>
            <span>{t("pageOf", { page, pages })}</span>
            <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {tc("next")}
            </Button>
          </div>
        </div>
      )}

      <CreateLinkDialog open={creating} onClose={() => setCreating(false)} />
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
    <Dialog open={!!action} onClose={onClose} title={action === "removeTag" ? t("bulk.removeTagTitle") : t("bulk.addTagTitle")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (action && tag.trim()) onApply(tag.trim(), action);
        }}
      >
        <Field label={t("bulk.tagName")}>
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
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={loading} disabled={!tag.trim()}>
            {t("bulk.apply")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveBulkDialog({ open, onClose, loading, onApply }: { open: boolean; onClose: () => void; loading: boolean; onApply: (folderId: string | null) => void }) {
  const { t } = useTranslation("links");
  const folders = useQuery(foldersQuery);
  const [folderId, setFolderId] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={t("bulk.moveTitle")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(folderId || null);
        }}
      >
        <Field label={t("fields.folder")}>
          {(id) => (
            <Select id={id} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{t("folders.none")}</option>
              {folderTree(folders.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {"  ".repeat(f.depth)}
                  {f.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={loading}>
            {t("bulk.apply")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
