import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { GlobeIcon, PencilIcon, PlusIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { SwitchField } from "@/components/toggle-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { domainsQuery, type Domain } from "../features/links/api";
import { api, ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { isAdmin, useMe } from "../lib/session";

export function DomainsPage() {
  const { t } = useTranslation("domains");
  const tc = useTranslation().t;
  const me = useMe();
  const admin = isAdmin(me);
  const queryClient = useQueryClient();
  const domains = useQuery(domainsQuery);
  const data = domains.data;
  const [editing, setEditing] = useState<Domain | "new" | null>(null);
  const [removing, setRemoving] = useState<Domain | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/domains/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["domains"] });
      toast.success(t("deleted"));
    },
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  return (
    <>
      <PageHeader
        title={tc("nav.domains")}
        description={t("description")}
        actions={
          admin && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon data-icon="inline-start" />
              {t("add")}
            </Button>
          )
        }
      />
      {domains.isPending ? (
        <Card className="gap-0 py-0">
          <ListSkeleton rows={2} />
        </Card>
      ) : domains.isError ? (
        <Card className="gap-0 py-0">
          <ErrorState onRetry={() => domains.refetch()} retrying={domains.isFetching} />
        </Card>
      ) : !data?.length ? (
        <Card className="gap-0 py-0">
          <EmptyState icon={<GlobeIcon />} title={t("empty")} description={admin ? t("emptyHint") : undefined} />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.domain")}</TableHead>
                <TableHead className="text-right">{t("columns.links")}</TableHead>
                <TableHead>{t("columns.root")}</TableHead>
                <TableHead>{t("columns.notFound")}</TableHead>
                {admin && (
                  <TableHead>
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <span className="font-medium">{d.host}</span>
                    {d.isDefault && (
                      <Badge variant="success" className="ml-2 align-middle">
                        {t("default")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-md:text-left" label={t("columns.links")}>{d.linkCount}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" label={t("columns.root")} title={d.rootUrl ?? undefined}>
                    {d.rootUrl ?? t("builtIn")}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" label={t("columns.notFound")} title={d.notFoundUrl ?? undefined}>
                    {d.notFoundUrl ?? t("builtIn")}
                  </TableCell>
                  {admin && (
                    <TableCell className="whitespace-nowrap text-right max-md:-ml-2.5 max-md:text-left">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                        <PencilIcon data-icon="inline-start" />
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="destructive-ghost" onClick={() => setRemoving(d)}>
                        {t("delete")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("add") : t("editTitle")}</DialogTitle>
            <DialogDescription>{t("formHint")}</DialogDescription>
          </DialogHeader>
          {editing && <DomainForm domain={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        danger
        title={t("confirmTitle", { host: removing?.host ?? "" })}
        description={t("confirmText")}
        confirmLabel={t("confirmButton")}
      />
    </>
  );
}

function DomainForm({ domain, onClose }: { domain: Domain | null; onClose: () => void }) {
  const { t } = useTranslation("domains");
  const tc = useTranslation().t;
  const queryClient = useQueryClient();
  const [host, setHost] = useState(domain?.host ?? "");
  const [rootUrl, setRootUrl] = useState(domain?.rootUrl ?? "");
  const [notFoundUrl, setNotFoundUrl] = useState(domain?.notFoundUrl ?? "");
  const [isDefault, setIsDefault] = useState(domain?.isDefault ?? false);

  const save = useMutation({
    mutationFn: () => {
      const body = { host, rootUrl, notFoundUrl, ...(isDefault ? { isDefault: true } : {}) };
      return domain ? api(`/api/domains/${domain.id}`, { method: "PATCH", body }) : api("/api/domains", { body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["domains"] });
      onClose();
    },
  });

  const fields = save.error instanceof ApiError ? save.error.fields : [];
  const fieldError = (name: string, text: string) => (fields.includes(name) ? text : undefined);
  const generalError = save.error && fields.length === 0 ? errorMessage(tc, save.error) : undefined;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <FormField label={t("fields.host")} hint={t("fields.hostHint")} error={fieldError("host", t("errors.host"))}>
        {(id) => <Input id={id} required autoFocus placeholder="go.example.com" value={host} onChange={(e) => setHost(e.target.value)} />}
      </FormField>
      <FormField label={t("fields.root")} hint={t("fields.rootHint")} error={fieldError("rootUrl", t("errors.url"))}>
        {(id) => <Input id={id} placeholder="https://" value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} />}
      </FormField>
      <FormField label={t("fields.notFound")} hint={t("fields.notFoundHint")} error={fieldError("notFoundUrl", t("errors.url"))}>
        {(id) => <Input id={id} placeholder="https://" value={notFoundUrl} onChange={(e) => setNotFoundUrl(e.target.value)} />}
      </FormField>
      <SwitchField
        checked={isDefault}
        onCheckedChange={setIsDefault}
        disabled={domain?.isDefault}
        label={t("fields.default")}
        description={t("fields.defaultHint")}
      />
      {generalError && (
        <p role="alert" className="text-[13px] text-destructive">
          {generalError}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {domain ? tc("save") : t("add")}
        </Button>
      </DialogFooter>
    </form>
  );
}
