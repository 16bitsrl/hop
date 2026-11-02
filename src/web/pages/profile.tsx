import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/page";
import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { setLanguage, type Language } from "../i18n";
import { api } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { formatDate } from "../lib/cn";
import { errorMessage } from "../lib/errors";
import { MyApiKeysCard } from "../features/api-keys/keys";
import { domainsQuery } from "../features/links/api";
import { appConfigQuery, meQuery, useMe, type Me } from "../lib/session";
import { useTheme, type Theme } from "../lib/theme";

export function ProfilePage() {
  const { t } = useTranslation("profile");
  const { data: config } = useQuery(appConfigQuery);
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex max-w-2xl flex-col gap-5">
        <AccountCard />
        <PreferencesCard />
        {config?.passwordLogin !== false && <PasswordCard />}
        <PasskeysCard />
        <MyApiKeysCard />
      </div>
    </>
  );
}

function useUpdateMe() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<Me, "name" | "locale" | "defaultDomainId">>) => api<{ user: Me }>("/api/me", { method: "PATCH", body }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(meQuery.queryKey, user);
      toast.success(t("saved"));
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
}

function AccountCard() {
  const { t } = useTranslation("profile");
  const me = useMe();
  const [name, setName] = useState(me.name);
  const update = useUpdateMe();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name });
          }}
        >
          <FormField label={t("account.name")}>{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}</FormField>
          <FormField label={t("account.email")}>{(id) => <Input id={id} value={me.email} readOnly disabled />}</FormField>
          <div>
            <Button type="submit" loading={update.isPending} disabled={!name.trim() || name === me.name}>
              {t("common:save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PreferencesCard() {
  const { t, i18n } = useTranslation("profile");
  const [theme, setTheme] = useTheme();
  const update = useUpdateMe();
  const me = useMe();
  const domains = useQuery(domainsQuery);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("preferences.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("preferences.language")}>
          {(id) => (
            <OptionSelect<Language>
              id={id}
              className="w-full"
              value={i18n.language.startsWith("it") ? "it" : "en"}
              options={[
                { value: "en", label: t("common:locale.en") },
                { value: "it", label: t("common:locale.it") },
              ]}
              onValueChange={(lang) => {
                setLanguage(lang);
                update.mutate({ locale: lang });
              }}
            />
          )}
        </FormField>
        <FormField label={t("preferences.theme")}>
          {(id) => (
            <OptionSelect<Theme>
              id={id}
              className="w-full"
              value={theme}
              options={(["system", "light", "dark"] as Theme[]).map((v) => ({ value: v, label: t(`preferences.themes.${v}`) }))}
              onValueChange={setTheme}
            />
          )}
        </FormField>
        {me.role !== "viewer" && (domains.data?.length ?? 0) > 0 && (
          <FormField label={t("preferences.defaultDomain")} hint={t("preferences.defaultDomainHint")} className="sm:col-span-2">
            {(id) => (
              <OptionSelect
                id={id}
                className="w-full"
                value={me.defaultDomainId ?? ""}
                options={[{ value: "", label: t("preferences.sharedDefault") }, ...(domains.data ?? []).map((d) => ({ value: d.id, label: d.host }))]}
                onValueChange={(v) => update.mutate({ defaultDomainId: v || null })}
              />
            )}
          </FormField>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation("profile");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changePassword({ currentPassword: current, newPassword: next });
    setBusy(false);
    if (err) {
      setError(err.code === "INVALID_PASSWORD" ? t("password.wrong") : t("errors:generic"));
      return;
    }
    setCurrent("");
    setNext("");
    toast.success(t("password.changed"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("password.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField label={t("password.current")}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </FormField>
          <FormField label={t("password.new")} hint={t("password.hint")} error={error}>
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={next} onChange={(e) => setNext(e.target.value)} />
            )}
          </FormField>
          <div>
            <Button type="submit" variant="outline" loading={busy}>
              {t("password.submit")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type PasskeyRow = { id: string; name?: string | null; createdAt?: string | Date | null };

function PasskeysCard() {
  const { t, i18n } = useTranslation("profile");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PasskeyRow | null>(null);

  const list = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw error;
      return (data ?? []) as PasskeyRow[];
    },
    staleTime: 0,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["passkeys"] });
      toast.success(t("passkeys.removed"));
      setRemoving(null);
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>{t("passkeys.title")}</CardTitle>
        <CardDescription>{t("passkeys.description")}</CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" />
            {t("passkeys.add")}
          </Button>
        </CardAction>
      </CardHeader>
      <div className="border-t">
        {list.isPending ? (
          <ListSkeleton rows={1} />
        ) : list.isError ? (
          <ErrorState onRetry={() => list.refetch()} retrying={list.isFetching} />
        ) : list.data.length > 0 ? (
          <ul className="divide-y">
            {list.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <KeyRoundIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name || t("passkeys.unnamed")}</p>
                    {p.createdAt && <p className="text-xs text-muted-foreground tabular-nums">{t("passkeys.addedOn", { date: formatDate(p.createdAt, i18n.language) })}</p>}
                  </div>
                </div>
                <Button size="sm" variant="destructive-ghost" onClick={() => setRemoving(p)}>
                  {t("passkeys.remove")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<KeyRoundIcon />} title={t("passkeys.empty")} className="py-8" />
        )}
      </div>

      <AddPasskeyDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={async () => {
          await queryClient.invalidateQueries({ queryKey: ["passkeys"] });
          toast.success(t("passkeys.added"));
          setAdding(false);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t("passkeys.removeTitle")}
        description={t("passkeys.removeText")}
        confirmLabel={t("passkeys.remove")}
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}

function AddPasskeyDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation("profile");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("passkeys.addTitle")}</DialogTitle>
          <DialogDescription>{t("passkeys.addText")}</DialogDescription>
        </DialogHeader>
        <AddPasskeyForm onClose={onClose} onAdded={onAdded} />
      </DialogContent>
    </Dialog>
  );
}

function AddPasskeyForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation("profile");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setBusy(false);
    if (res?.error) {
      setError(t("passkeys.failed"));
      return;
    }
    onAdded();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={t("passkeys.name")} error={error}>
        {(id) => <Input id={id} autoFocus placeholder={t("passkeys.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />}
      </FormField>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common:cancel")}
        </Button>
        <Button type="submit" loading={busy}>
          {t("passkeys.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
