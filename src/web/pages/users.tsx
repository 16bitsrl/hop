import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader, RequireAdmin } from "../components/page";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  Dialog,
  EmptyState,
  Field,
  Input,
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
import { AllApiKeysCard } from "../features/api-keys/keys";
import { api } from "../lib/api";
import { formatDate } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { appConfigQuery, useMe, type Role } from "../lib/session";

type UserRow = { id: string; name: string; email: string; role: Role; disabled: boolean; createdAt: string };
type InviteRow = { id: string; email: string; role: Role; expiresAt: string };

const ROLES: Role[] = ["admin", "member", "viewer"];

export function UsersPage() {
  return (
    <RequireAdmin>
      <UsersContent />
    </RequireAdmin>
  );
}

function UsersContent() {
  const { t, i18n } = useTranslation("users");
  const me = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [disableFor, setDisableFor] = useState<UserRow | null>(null);
  const [revokeFor, setRevokeFor] = useState<InviteRow | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: UserRow[] }>("/api/users") });
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => api<{ invites: InviteRow[] }>("/api/invites") });

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; disabled?: boolean }) => api(`/api/users/${id}`, { method: "PATCH", body }),
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      if (vars.role) toast.success(t("roleUpdated"));
      else toast.success(vars.disabled ? t("userDisabled") : t("userEnabled"));
      setDisableFor(null);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
      toast.success(t("revoked"));
      setRevokeFor(null);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (users.isPending || invites.isPending) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            <PlusIcon />
            {t("invite")}
          </Button>
        }
      />

      <Card>
        <Table stack>
          <THead>
            <tr>
              <Th>{t("columns.user")}</Th>
              <Th>{t("columns.role")}</Th>
              <Th>{t("columns.status")}</Th>
              <Th className="text-right">{t("columns.actions")}</Th>
            </tr>
          </THead>
          <TBody>
            {users.data?.users.map((u) => {
              const self = u.id === me.id;
              return (
                <Tr key={u.id}>
                  <Td>
                    <div className="font-medium">
                      {u.name}
                      {self && <span className="ml-2 text-xs font-normal text-muted">{t("you")}</span>}
                    </div>
                    <div className="text-[13px] text-muted">{u.email}</div>
                  </Td>
                  <Td label={t("columns.role")}>
                    <Select
                      className="w-36"
                      aria-label={t("roleFor", { email: u.email })}
                      value={u.role}
                      disabled={self || patch.isPending}
                      onChange={(e) => patch.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`common:roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td label={t("columns.status")}>{u.disabled ? <Badge tone="red">{t("disabled")}</Badge> : <Badge tone="green">{t("active")}</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5 max-md:-ml-2.5 max-md:justify-start">
                      <Button size="sm" variant="ghost" onClick={() => setResetFor(u)}>
                        {t("resetPassword")}
                      </Button>
                      {!self &&
                        (u.disabled ? (
                          <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: u.id, disabled: false })}>
                            {t("enable")}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setDisableFor(u)}>
                            {t("disable")}
                          </Button>
                        ))}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <p className="mt-2 text-[13px] text-muted">{t("roleHelp")}</p>

      <h2 className="mb-3 mt-8 text-sm font-semibold tracking-tight">{t("pending")}</h2>
      <Card>
        {invites.data?.invites.length ? (
          <Table stack>
            <THead>
              <tr>
                <Th>{t("columns.user")}</Th>
                <Th>{t("columns.role")}</Th>
                <Th>{t("columns.expires")}</Th>
                <Th className="text-right">{t("columns.actions")}</Th>
              </tr>
            </THead>
            <TBody>
              {invites.data.invites.map((i) => (
                <Tr key={i.id}>
                  <Td className="font-medium">{i.email}</Td>
                  <Td label={t("columns.role")}>{t(`common:roles.${i.role}`)}</Td>
                  <Td className="text-muted" label={t("columns.expires")}>{formatDate(i.expiresAt, i18n.language)}</Td>
                  <Td className="text-right max-md:-ml-2.5 max-md:text-left">
                    <Button size="sm" variant="ghost" onClick={() => setRevokeFor(i)}>
                      {t("revoke")}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState title={t("pendingEmpty")} />
        )}
      </Card>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
      {resetFor && <ResetDialog user={resetFor} onClose={() => setResetFor(null)} />}
      <ConfirmDialog
        open={!!disableFor}
        onClose={() => setDisableFor(null)}
        title={t("disableTitle", { name: disableFor?.name })}
        description={t("disableText")}
        confirmLabel={t("disable")}
        danger
        loading={patch.isPending}
        onConfirm={() => disableFor && patch.mutate({ id: disableFor.id, disabled: true })}
      />
      <ConfirmDialog
        open={!!revokeFor}
        onClose={() => setRevokeFor(null)}
        title={t("revokeTitle")}
        description={t("revokeText", { email: revokeFor?.email })}
        confirmLabel={t("revoke")}
        danger
        loading={revoke.isPending}
        onConfirm={() => revokeFor && revoke.mutate(revokeFor.id)}
      />
      <AllApiKeysCard />
    </>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("users");
  return (
    <Dialog open={open} onClose={onClose} title={t("inviteTitle")} description={t("inviteText")}>
      <InviteForm onClose={onClose} />
    </Dialog>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const { data: config } = useQuery(appConfigQuery);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api<{ id: string; url: string; emailed: boolean }>("/api/invites", { body: { email, role } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["invites"] }),
    onError: (e) => setError(errorMessage(t, e)),
  });

  if (create.data) {
    const { url, emailed } = create.data;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{emailed ? t("inviteSent") : config?.mailConfigured ? t("inviteMailFailed") : t("inviteNoMail")}</p>
        <Field label={t("inviteLink")} hint={t("inviteLinkHint")}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} readOnly value={url} onFocus={(e) => e.target.select()} />
              <CopyButton value={url} />
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            {t("common:done")}
          </Button>
        </div>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label={t("email")}>
        {(id) => <Input id={id} type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label={t("role")} hint={t("roleHelp")}>
        {(id) => (
          <Select id={id} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`common:roles.${r}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>{t("common:cancel")}</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t("create")}
        </Button>
      </div>
    </form>
  );
}

function ResetDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { t } = useTranslation("users");
  // One link per opening: the query is dropped as soon as the dialog closes.
  const link = useQuery({
    queryKey: ["reset-link", user.id],
    queryFn: () => api<{ url: string }>(`/api/users/${user.id}/reset-link`, { method: "POST", body: {} }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("resetTitle", { name: user.name })}
      description={t("resetText")}
      footer={
        <Button variant="primary" onClick={onClose}>
          {t("common:done")}
        </Button>
      }
    >
      {link.data ? (
        <Field label={t("resetLink")}>
          {(id) => (
            <div className="flex gap-2">
              <Input id={id} readOnly value={link.data.url} onFocus={(e) => e.target.select()} />
              <CopyButton value={link.data.url} />
            </div>
          )}
        </Field>
      ) : (
        <PageSpinner />
      )}
    </Dialog>
  );
}
