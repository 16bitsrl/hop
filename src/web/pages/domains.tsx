import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  GlobeIcon,
  Input,
  PageSpinner,
  PlusIcon,
  Switch,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useToast,
} from "../components/legacy";
import { domainsQuery, type Domain } from "../features/links/api";
import { api, ApiError } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { isAdmin, useMe } from "../lib/session";

export function DomainsPage() {
  const { t } = useTranslation("domains");
  const tc = useTranslation().t;
  const me = useMe();
  const admin = isAdmin(me);
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(domainsQuery);
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
            <Button variant="primary" onClick={() => setEditing("new")}>
              <PlusIcon />
              {t("add")}
            </Button>
          )
        }
      />
      {isPending ? (
        <PageSpinner />
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<GlobeIcon />} title={t("empty")} description={admin ? t("emptyHint") : undefined} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table stack>
            <THead>
              <tr>
                <Th>{t("columns.domain")}</Th>
                <Th className="text-right">{t("columns.links")}</Th>
                <Th>{t("columns.root")}</Th>
                <Th>{t("columns.notFound")}</Th>
                {admin && (
                  <Th>
                    <span className="sr-only">{t("columns.actions")}</span>
                  </Th>
                )}
              </tr>
            </THead>
            <TBody>
              {data.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <span className="font-medium">{d.host}</span> {d.isDefault && <Badge tone="green">{t("default")}</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums max-md:text-left" label={t("columns.links")}>{d.linkCount}</Td>
                  <Td className="max-w-56 truncate text-muted-foreground" label={t("columns.root")} title={d.rootUrl ?? undefined}>
                    {d.rootUrl ?? t("builtIn")}
                  </Td>
                  <Td className="max-w-56 truncate text-muted-foreground" label={t("columns.notFound")} title={d.notFoundUrl ?? undefined}>
                    {d.notFoundUrl ?? t("builtIn")}
                  </Td>
                  {admin && (
                    <Td className="whitespace-nowrap text-right max-md:-ml-2.5 max-md:text-left">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(d)}>
                        {t("delete")}
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? t("add") : t("editTitle")} description={t("formHint")}>
        {editing && <DomainForm domain={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
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
      <Field label={t("fields.host")} hint={t("fields.hostHint")} error={fieldError("host", t("errors.host"))}>
        {(id) => <Input id={id} required autoFocus placeholder="go.example.com" value={host} onChange={(e) => setHost(e.target.value)} />}
      </Field>
      <Field label={t("fields.root")} hint={t("fields.rootHint")} error={fieldError("rootUrl", t("errors.url"))}>
        {(id) => <Input id={id} placeholder="https://" value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} />}
      </Field>
      <Field label={t("fields.notFound")} hint={t("fields.notFoundHint")} error={fieldError("notFoundUrl", t("errors.url"))}>
        {(id) => <Input id={id} placeholder="https://" value={notFoundUrl} onChange={(e) => setNotFoundUrl(e.target.value)} />}
      </Field>
      <Switch checked={isDefault} onChange={setIsDefault} disabled={domain?.isDefault} label={t("fields.default")} description={t("fields.defaultHint")} />
      {generalError && (
        <p role="alert" className="text-[13px] text-destructive">
          {generalError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{tc("cancel")}</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {domain ? tc("save") : t("add")}
        </Button>
      </div>
    </form>
  );
}
