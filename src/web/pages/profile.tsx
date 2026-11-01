import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  KeyIcon,
  PlusIcon,
  Select,
  useToast,
} from "../components/ui";
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
      <div className="flex max-w-2xl flex-col gap-6">
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
  const toast = useToast();
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
      <CardHeader title={t("account.title")} />
      <CardBody>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ name });
          }}
        >
          <Field label={t("account.name")}>{(id) => <Input id={id} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t("account.email")}>{(id) => <Input id={id} value={me.email} readOnly disabled />}</Field>
          <div>
            <Button type="submit" variant="primary" loading={update.isPending} disabled={!name.trim() || name === me.name}>
              {t("common:save")}
            </Button>
          </div>
        </form>
      </CardBody>
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
      <CardHeader title={t("preferences.title")} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label={t("preferences.language")}>
          {(id) => (
            <Select
              id={id}
              value={i18n.language.startsWith("it") ? "it" : "en"}
              onChange={(e) => {
                const lang = e.target.value as Language;
                setLanguage(lang);
                update.mutate({ locale: lang });
              }}
            >
              <option value="en">{t("common:locale.en")}</option>
              <option value="it">{t("common:locale.it")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("preferences.theme")}>
          {(id) => (
            <Select id={id} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              {(["system", "light", "dark"] as Theme[]).map((v) => (
                <option key={v} value={v}>
                  {t(`preferences.themes.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {me.role !== "viewer" && (domains.data?.length ?? 0) > 0 && (
          <Field label={t("preferences.defaultDomain")} hint={t("preferences.defaultDomainHint")} className="sm:col-span-2">
            {(id) => (
              <Select id={id} value={me.defaultDomainId ?? ""} onChange={(e) => update.mutate({ defaultDomainId: e.target.value || null })}>
                <option value="">{t("preferences.sharedDefault")}</option>
                {domains.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.host}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation("profile");
  const toast = useToast();
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
      <CardHeader title={t("password.title")} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t("password.current")}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label={t("password.new")} hint={t("password.hint")} error={error}>
            {(id) => (
              <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            )}
          </Field>
          <div>
            <Button type="submit" loading={busy}>
              {t("password.submit")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

type PasskeyRow = { id: string; name?: string | null; createdAt?: string | Date | null };

function PasskeysCard() {
  const { t, i18n } = useTranslation("profile");
  const toast = useToast();
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
    <Card>
      <CardHeader
        title={t("passkeys.title")}
        description={t("passkeys.description")}
        action={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            {t("passkeys.add")}
          </Button>
        }
      />
      {list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line">
          {list.data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-muted">
                  <KeyIcon />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name || t("passkeys.unnamed")}</p>
                  {p.createdAt && <p className="text-xs text-muted">{t("passkeys.addedOn", { date: formatDate(p.createdAt, i18n.language) })}</p>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(p)}>
                {t("passkeys.remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        list.data && <EmptyState icon={<KeyIcon />} title={t("passkeys.empty")} />
      )}

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
    <Dialog open={open} onClose={onClose} title={t("passkeys.addTitle")} description={t("passkeys.addText")}>
      <AddPasskeyForm onClose={onClose} onAdded={onAdded} />
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
      <Field label={t("passkeys.name")} error={error}>
        {(id) => <Input id={id} autoFocus placeholder={t("passkeys.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common:cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("passkeys.submit")}
        </Button>
      </div>
    </form>
  );
}
