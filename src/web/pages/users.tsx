import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BanIcon, CircleCheckIcon, KeyRoundIcon, MailIcon, UserPlusIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { PageHeader, RequireAdmin } from "@/components/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { AllApiKeysCard } from "../features/api-keys/keys";
import { api } from "../lib/api";
import { formatDate } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { appConfigQuery, useMe, type Role } from "../lib/session";

type UserRow = { id: string; name: string; email: string; role: Role; disabled: boolean; createdAt: string };
type InviteRow = { id: string; email: string; role: Role; expiresAt: string };

const ROLES: Role[] = ["admin", "member", "viewer"];

function useRoleOptions() {
  const { t } = useTranslation("users");
  return ROLES.map((r) => ({ value: r, label: t(`common:roles.${r}`) }));
}

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
  const queryClient = useQueryClient();
  const roleOptions = useRoleOptions();
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

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlusIcon data-icon="inline-start" />
            {t("invite")}
          </Button>
        }
      />

      <Card className="gap-0 py-0">
        {users.isPending ? (
          <ListSkeleton rows={3} />
        ) : users.isError ? (
          <ErrorState onRetry={() => users.refetch()} retrying={users.isFetching} />
        ) : (
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.users.map((u) => {
                const self = u.id === me.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.name}
                        {self && (
                          <Badge variant="outline" className="ml-2 align-middle">
                            {t("you")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[13px] text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell label={t("columns.role")} className="max-md:flex max-md:items-center">
                      <OptionSelect
                        size="sm"
                        className="w-36"
                        aria-label={t("roleFor", { email: u.email })}
                        value={u.role}
                        disabled={self || patch.isPending}
                        options={roleOptions}
                        onValueChange={(role) => role !== u.role && patch.mutate({ id: u.id, role })}
                      />
                    </TableCell>
                    <TableCell label={t("columns.status")}>
                      {u.disabled ? (
                        <Badge variant="destructive">
                          <BanIcon data-icon="inline-start" />
                          {t("disabled")}
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <CircleCheckIcon data-icon="inline-start" />
                          {t("active")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 max-md:-ml-2.5 max-md:justify-start">
                        <Button size="sm" variant="ghost" onClick={() => setResetFor(u)}>
                          <KeyRoundIcon data-icon="inline-start" />
                          {t("resetPassword")}
                        </Button>
                        {!self &&
                          (u.disabled ? (
                            <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: u.id, disabled: false })}>
                              {t("enable")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="destructive-ghost" onClick={() => setDisableFor(u)}>
                              {t("disable")}
                            </Button>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <p className="mt-2 text-[13px] text-muted-foreground">{t("roleHelp")}</p>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-tight">{t("pending")}</h2>
      <Card className="gap-0 py-0">
        {invites.isPending ? (
          <ListSkeleton rows={2} />
        ) : invites.isError ? (
          <ErrorState onRetry={() => invites.refetch()} retrying={invites.isFetching} />
        ) : invites.data.invites.length ? (
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.user")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
                <TableHead>{t("columns.expires")}</TableHead>
                <TableHead className="text-right">{t("columns.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.data.invites.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.email}</TableCell>
                  <TableCell label={t("columns.role")}>{t(`common:roles.${i.role}`)}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums" label={t("columns.expires")}>
                    {formatDate(i.expiresAt, i18n.language)}
                  </TableCell>
                  <TableCell className="text-right max-md:-ml-2.5 max-md:text-left">
                    <Button size="sm" variant="destructive-ghost" onClick={() => setRevokeFor(i)}>
                      {t("revoke")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState icon={<MailIcon />} title={t("pendingEmpty")} className="py-8" />
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteText")}</DialogDescription>
        </DialogHeader>
        <InviteForm onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("users");
  const queryClient = useQueryClient();
  const roleOptions = useRoleOptions();
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
      <>
        <div className="flex flex-col gap-4">
          <p className="text-sm">{emailed ? t("inviteSent") : config?.mailConfigured ? t("inviteMailFailed") : t("inviteNoMail")}</p>
          <FormField label={t("inviteLink")} hint={t("inviteLinkHint")}>
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} readOnly value={url} onFocus={(e) => e.target.select()} />
                <CopyButton value={url} size="default" />
              </div>
            )}
          </FormField>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("common:done")}</Button>
        </DialogFooter>
      </>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={t("email")}>
        {(id) => <Input id={id} type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
      </FormField>
      <FormField label={t("role")} hint={t("roleHelp")}>
        {(id) => <OptionSelect id={id} className="w-full" value={role} onValueChange={setRole} options={roleOptions} />}
      </FormField>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="mt-1">
        <Button variant="outline" onClick={onClose}>
          {t("common:cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("create")}
        </Button>
      </DialogFooter>
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetTitle", { name: user.name })}</DialogTitle>
          <DialogDescription>{t("resetText")}</DialogDescription>
        </DialogHeader>
        {link.data ? (
          <FormField label={t("resetLink")}>
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} readOnly value={link.data.url} onFocus={(e) => e.target.select()} />
                <CopyButton value={link.data.url} size="default" />
              </div>
            )}
          </FormField>
        ) : link.isError ? (
          <ErrorState onRetry={() => link.refetch()} retrying={link.isFetching} className="py-6" />
        ) : (
          <div role="status" aria-label={t("common:loading")} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("common:done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
