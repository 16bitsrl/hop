import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, ConfirmDialog, Dialog, Field, Input, Select, useToast } from "../../components/legacy";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { canCreate, useMe } from "../../lib/session";
import { foldersQuery, folderTree, type Folder } from "./api";

export function FoldersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("links");
  return (
    <Dialog open={open} onClose={onClose} title={t("folders.title")} description={t("folders.description")}>
      <FoldersBody />
    </Dialog>
  );
}

function FoldersBody() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const me = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery(foldersQuery);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<Folder | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["folders"] });
    await queryClient.invalidateQueries({ queryKey: ["links"] });
  };
  const onError = (e: unknown) => toast.error(errorMessage(tc, e));

  const add = useMutation({
    mutationFn: () => api("/api/folders", { body: { name: name.trim(), parentId: parentId || null } }),
    onSuccess: async () => {
      setName("");
      await refresh();
    },
    onError,
  });
  const rename = useMutation({
    mutationFn: (f: { id: string; name: string }) => api(`/api/folders/${f.id}`, { method: "PATCH", body: { name: f.name.trim() } }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/folders/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
    onError,
  });

  const tree = folderTree(data ?? []);

  return (
    <div className="flex flex-col gap-4">
      {tree.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("folders.empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tree.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2" style={{ paddingLeft: `${0.75 + f.depth * 1.25}rem` }}>
              {editing?.id === f.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename.mutate(editing);
                  }}
                >
                  <Input aria-label={t("folders.renameField")} autoFocus value={editing.name} onChange={(e) => setEditing({ id: f.id, name: e.target.value })} />
                  <Button type="submit" size="sm" variant="primary" loading={rename.isPending}>
                    {tc("save")}
                  </Button>
                  <Button size="sm" onClick={() => setEditing(null)}>
                    {tc("cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 truncate text-sm">
                    {f.name} <span className="text-muted-foreground">({f.linkCount})</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" disabled={!f.canModify} title={f.canModify ? undefined : t("folders.notYours")} aria-label={t("folders.rename", { name: f.name })} onClick={() => setEditing({ id: f.id, name: f.name })}>
                      {t("folders.renameButton")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!f.canModify} title={f.canModify ? undefined : t("folders.notYours")} aria-label={t("folders.delete", { name: f.name })} onClick={() => setRemoving(f)}>
                      {t("delete")}
                    </Button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canCreate(me) && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("folders.newName")}>{(id) => <Input id={id} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t("folders.parent")}>
              {(id) => (
                <Select id={id} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">{t("folders.topLevel")}</option>
                  {tree.map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}
                      {f.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={!name.trim()} loading={add.isPending}>
              {t("folders.add")}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        danger
        title={t("folders.confirmTitle")}
        description={t("folders.confirmText", { name: removing?.name ?? "" })}
        confirmLabel={t("folders.confirmButton")}
      />
    </div>
  );
}
