import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderIcon, FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { canCreate, useMe } from "../../lib/session";
import { foldersQuery, folderTree, type Folder } from "./api";
import { folderOptions } from "./parts";

export function FoldersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("links");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("folders.title")}</DialogTitle>
          <DialogDescription>{t("folders.description")}</DialogDescription>
        </DialogHeader>
        <FoldersBody />
      </DialogContent>
    </Dialog>
  );
}

function FoldersBody() {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const me = useMe();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(foldersQuery);
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
      {isPending ? (
        <ListSkeleton rows={3} className="rounded-lg border" />
      ) : tree.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-[13px] text-muted-foreground">
          <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
          {t("folders.empty")}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {tree.map((f) => (
            <li key={f.id} className="flex min-h-11 items-center justify-between gap-3 py-1.5 pr-1.5" style={{ paddingLeft: `${0.75 + f.depth * 1.25}rem` }}>
              {editing?.id === f.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename.mutate(editing);
                  }}
                >
                  <Input aria-label={t("folders.renameField")} autoFocus value={editing.name} onChange={(e) => setEditing({ id: f.id, name: e.target.value })} />
                  <Button type="submit" size="sm" loading={rename.isPending}>
                    {tc("save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {tc("cancel")}
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-muted-foreground tabular-nums">({f.linkCount})</span>
                  </span>
                  <span className="flex shrink-0 gap-0.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={!f.canModify}
                      title={f.canModify ? t("folders.rename", { name: f.name }) : t("folders.notYours")}
                      aria-label={t("folders.rename", { name: f.name })}
                      onClick={() => setEditing({ id: f.id, name: f.name })}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="destructive-ghost"
                      disabled={!f.canModify}
                      title={f.canModify ? t("folders.delete", { name: f.name }) : t("folders.notYours")}
                      aria-label={t("folders.delete", { name: f.name })}
                      onClick={() => setRemoving(f)}
                    >
                      <Trash2Icon />
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
          className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim()) add.mutate();
          }}
        >
          <FormField label={t("folders.newName")}>{(id) => <Input id={id} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />}</FormField>
          <FormField label={t("folders.parent")}>
            {(id) => (
              <OptionSelect id={id} value={parentId} onValueChange={setParentId} options={folderOptions(data ?? [], [{ value: "", label: t("folders.topLevel") }])} />
            )}
          </FormField>
          <Button type="submit" disabled={!name.trim()} loading={add.isPending}>
            {!add.isPending && <FolderPlusIcon data-icon="inline-start" />}
            {t("folders.add")}
          </Button>
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
