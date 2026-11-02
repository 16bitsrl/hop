import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/cn";
import { errorMessage } from "../../lib/errors";

type Key = { id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };
type AdminKey = Key & { userId: string; userName: string; userEmail: string };

const myKeys = { queryKey: ["api-keys"], queryFn: () => api<{ keys: Key[] }>("/api/api-keys"), staleTime: 0 };
const allKeys = { queryKey: ["api-keys", "all"], queryFn: () => api<{ keys: AdminKey[] }>("/api/admin/api-keys"), staleTime: 0 };

function useRevoke(onDone: () => void) {
  const { t } = useTranslation("apiKeys");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(t("revokedToast"));
      onDone();
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
}

function Status({ k }: { k: Key }) {
  const { t, i18n } = useTranslation("apiKeys");
  return (
    <>
      <TableCell className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums" label={t("columns.lastUsed")}>
        {k.lastUsedAt ? formatDateTime(k.lastUsedAt, i18n.language) : t("neverUsed")}
      </TableCell>
      <TableCell>{k.revokedAt ? <Badge variant="secondary">{t("revoked")}</Badge> : <Badge variant="success">{t("active")}</Badge>}</TableCell>
    </>
  );
}

function RevokeCell({ k, onRevoke }: { k: Key; onRevoke: () => void }) {
  const { t } = useTranslation("apiKeys");
  return (
    <TableCell className="text-right max-md:-ml-2.5 max-md:text-left">
      {!k.revokedAt && (
        <Button size="sm" variant="destructive-ghost" onClick={onRevoke}>
          {t("revoke")}
        </Button>
      )}
    </TableCell>
  );
}

/** Profile card: create and revoke my keys. */
export function MyApiKeysCard() {
  const { t, i18n } = useTranslation("apiKeys");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const keys = useQuery(myKeys);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Key | null>(null);
  const revoke = useRevoke(() => setRevoking(null));

  const create = useMutation({
    mutationFn: () => api<{ key: Key; secret: string }>("/api/api-keys", { body: { name } }),
    onSuccess: async (r) => {
      setSecret(r.secret);
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <Card data-testid="api-keys" className="pb-0">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <Link to="/api-help" className="tap-link text-[13px] font-medium text-primary hover:underline">
            {t("helpLink")}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <FormField label={t("name")} className="min-w-56 flex-1">
            {(id) => <Input id={id} maxLength={60} placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            {!create.isPending && <PlusIcon data-icon="inline-start" />}
            {t("create")}
          </Button>
        </form>
      </CardContent>
      <div className="border-t">
        {keys.isPending ? (
          <ListSkeleton rows={2} />
        ) : keys.isError ? (
          <ErrorState onRetry={() => keys.refetch()} retrying={keys.isFetching} />
        ) : keys.data.keys.length === 0 ? (
          <EmptyState icon={<KeyRoundIcon />} title={t("empty")} className="py-8" />
        ) : (
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.key")}</TableHead>
                <TableHead>{t("columns.lastUsed")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("revoke")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">
                    {k.name}
                    <span className="block text-xs font-normal text-muted-foreground tabular-nums">{formatDateTime(k.createdAt, i18n.language)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{k.prefix}…</TableCell>
                  <Status k={k} />
                  <RevokeCell k={k} onRevoke={() => setRevoking(k)} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={secret !== null} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("created.title")}</DialogTitle>
            <DialogDescription>{t("created.text")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code data-testid="new-key-secret" className="min-w-0 flex-1 font-mono text-[13px] break-all">
              {secret}
            </code>
            {secret && <CopyButton value={secret} label={tc("copy")} />}
          </div>
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>{t("created.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        loading={revoke.isPending}
        danger
        title={t("revokeTitle", { name: revoking?.name ?? "" })}
        description={t("revokeText")}
        confirmLabel={t("revoke")}
      />
    </Card>
  );
}

/** Users page (admins): every key of every user. */
export function AllApiKeysCard() {
  const { t } = useTranslation("apiKeys");
  const keys = useQuery(allKeys);
  const [revoking, setRevoking] = useState<AdminKey | null>(null);
  const revoke = useRevoke(() => setRevoking(null));
  return (
    <Card data-testid="all-api-keys" className="mt-8 gap-0 pb-0">
      <CardHeader className="border-b">
        <CardTitle>{t("adminTitle")}</CardTitle>
        <CardDescription>{t("adminDescription")}</CardDescription>
      </CardHeader>
      <div>
        {keys.isPending ? (
          <ListSkeleton rows={2} />
        ) : keys.isError ? (
          <ErrorState onRetry={() => keys.refetch()} retrying={keys.isFetching} />
        ) : keys.data.keys.length === 0 ? (
          <EmptyState icon={<KeyRoundIcon />} title={t("adminEmpty")} className="py-8" />
        ) : (
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.key")}</TableHead>
                <TableHead>{t("columns.lastUsed")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("revoke")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    {k.userName}
                    <span className="block text-xs text-muted-foreground">{k.userEmail}</span>
                  </TableCell>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">{k.prefix}…</TableCell>
                  <Status k={k} />
                  <RevokeCell k={k} onRevoke={() => setRevoking(k)} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        loading={revoke.isPending}
        danger
        title={t("revokeTitle", { name: revoking?.name ?? "" })}
        description={t("revokeText")}
        confirmLabel={t("revoke")}
      />
    </Card>
  );
}
