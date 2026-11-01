import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  Dialog,
  Field,
  Input,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useToast,
} from "../../components/ui";
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
  const toast = useToast();
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
      <Td className="whitespace-nowrap text-[13px] text-muted">{k.lastUsedAt ? formatDateTime(k.lastUsedAt, i18n.language) : t("neverUsed")}</Td>
      <Td>{k.revokedAt ? <Badge tone="neutral">{t("revoked")}</Badge> : <Badge tone="green">{t("active")}</Badge>}</Td>
    </>
  );
}

/** Profile card: create and revoke my keys. */
export function MyApiKeysCard() {
  const { t, i18n } = useTranslation("apiKeys");
  const tc = useTranslation().t;
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery(myKeys);
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
    <Card data-testid="api-keys">
      <CardHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link to="/api-help" className="text-[13px] font-medium text-accent hover:underline">
            {t("helpLink")}
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label={t("name")} className="min-w-56 flex-1">
            {(id) => <Input id={id} maxLength={60} placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
            {t("create")}
          </Button>
        </form>
        {data && data.keys.length === 0 ? (
          <p className="text-[13px] text-muted">{t("empty")}</p>
        ) : (
          data && (
            <Table>
              <THead>
                <tr>
                  <Th>{t("columns.name")}</Th>
                  <Th>{t("columns.key")}</Th>
                  <Th>{t("columns.lastUsed")}</Th>
                  <Th>{t("columns.status")}</Th>
                  <Th>
                    <span className="sr-only">{t("revoke")}</span>
                  </Th>
                </tr>
              </THead>
              <TBody>
                {data.keys.map((k) => (
                  <Tr key={k.id}>
                    <Td className="font-medium">
                      {k.name}
                      <span className="block text-xs font-normal text-muted">{formatDateTime(k.createdAt, i18n.language)}</span>
                    </Td>
                    <Td className="font-mono text-[13px] text-muted">{k.prefix}…</Td>
                    <Status k={k} />
                    <Td className="text-right">
                      {!k.revokedAt && (
                        <Button size="sm" variant="ghost" onClick={() => setRevoking(k)}>
                          {t("revoke")}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )
        )}
      </CardBody>

      <Dialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={t("created.title")}
        description={t("created.text")}
        footer={
          <Button variant="primary" onClick={() => setSecret(null)}>
            {t("created.done")}
          </Button>
        }
      >
        <div className="flex items-center gap-2 rounded-md border border-line bg-subtle p-3">
          <code data-testid="new-key-secret" className="min-w-0 flex-1 break-all font-mono text-[13px]">
            {secret}
          </code>
          {secret && <CopyButton value={secret} label={tc("copy")} />}
        </div>
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
  const { data } = useQuery(allKeys);
  const [revoking, setRevoking] = useState<AdminKey | null>(null);
  const revoke = useRevoke(() => setRevoking(null));
  return (
    <Card data-testid="all-api-keys" className="mt-8">
      <CardHeader title={t("adminTitle")} description={t("adminDescription")} />
      {data && data.keys.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted">{t("adminEmpty")}</p>
      ) : (
        data && (
          <Table>
            <THead>
              <tr>
                <Th>{t("columns.user")}</Th>
                <Th>{t("columns.name")}</Th>
                <Th>{t("columns.key")}</Th>
                <Th>{t("columns.lastUsed")}</Th>
                <Th>{t("columns.status")}</Th>
                <Th>
                  <span className="sr-only">{t("revoke")}</span>
                </Th>
              </tr>
            </THead>
            <TBody>
              {data.keys.map((k) => (
                <Tr key={k.id}>
                  <Td>
                    {k.userName}
                    <span className="block text-xs text-muted">{k.userEmail}</span>
                  </Td>
                  <Td className="font-medium">{k.name}</Td>
                  <Td className="font-mono text-[13px] text-muted">{k.prefix}…</Td>
                  <Status k={k} />
                  <Td className="text-right">
                    {!k.revokedAt && (
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(k)}>
                        {t("revoke")}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )
      )}
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
