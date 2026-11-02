import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Switch, Textarea, useToast } from "../../components/legacy";
import { foldersQuery, folderTree, tagsQuery, usePatchLink, type Link } from "./api";
import { TagInput } from "./parts";

/** ISO date to the value of a datetime-local input (local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Shown on every tab that edits a link, when the viewer may not change it. */
export function ReadOnlyNotice({ show }: { show: boolean }) {
  const { t } = useTranslation("links");
  if (!show) return null;
  return <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">{t("readOnly")}</p>;
}

export function EditTab({ link }: { link: Link }) {
  const { t } = useTranslation("links");
  const toast = useToast();
  const readOnly = !link.canModify;
  const tags = useQuery(tagsQuery);
  const folders = useQuery(foldersQuery);
  const patch = usePatchLink(link.id);
  const removePassword = usePatchLink(link.id, { silent: true });

  const [url, setUrl] = useState(link.url);
  const [title, setTitle] = useState(link.title ?? "");
  const [tagNames, setTagNames] = useState(link.tags.map((x) => x.name));
  const [folderId, setFolderId] = useState(link.folderId ?? "");
  const [notes, setNotes] = useState(link.notes ?? "");
  const [redirectType, setRedirectType] = useState(String(link.redirectType));
  const [forwardQuery, setForwardQuery] = useState(link.forwardQuery);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState(toLocalInput(link.expiresAt));
  const [maxClicks, setMaxClicks] = useState(link.maxClicks ? String(link.maxClicks) : "");
  const [fallbackUrl, setFallbackUrl] = useState(link.fallbackUrl ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    patch.mutate(
      {
        url: url.trim(),
        title,
        tags: tagNames,
        folderId: folderId || null,
        notes,
        redirectType: Number(redirectType),
        forwardQuery,
        ...(password ? { password } : {}),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxClicks: maxClicks ? Number(maxClicks) : null,
        fallbackUrl,
      },
      { onSuccess: () => setPassword("") },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <ReadOnlyNotice show={readOnly} />
      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t("edit.destination")} />
          <CardBody className="flex flex-col gap-4">
            <Field label={t("fields.url")}>
              {(id) => <Input id={id} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />}
            </Field>
            <Field label={t("fields.title")}>
              {(id) => <Input id={id} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label={t("fields.tags")}>
              {(id) => <TagInput id={id} value={tagNames} onChange={setTagNames} suggestions={(tags.data ?? []).map((x) => x.name)} disabled={readOnly} />}
            </Field>
            <Field label={t("fields.folder")}>
              {(id) => (
                <Select id={id} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                  <option value="">{t("folders.none")}</option>
                  {folderTree(folders.data ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {"  ".repeat(f.depth)}
                      {f.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("fields.notes")} hint={t("fields.notesHint")}>
              {(id) => <Textarea id={id} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("edit.behaviour")} />
          <CardBody className="flex flex-col gap-4">
            <Field label={t("fields.redirectType")} hint={t("fields.redirectTypeHint")} className="sm:max-w-sm">
              {(id) => (
                <Select id={id} value={redirectType} onChange={(e) => setRedirectType(e.target.value)}>
                  {[302, 301, 307, 308].map((code) => (
                    <option key={code} value={code}>
                      {t(`redirectTypes.${code}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Switch checked={forwardQuery} onChange={setForwardQuery} label={t("fields.forwardQuery")} description={t("fields.forwardQueryHint")} disabled={readOnly} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("edit.access")} />
          <CardBody className="flex flex-col gap-4">
            <Field
              label={t("fields.password")}
              hint={link.hasPassword ? t("fields.passwordSet") : t("fields.passwordHint")}
              className="sm:max-w-sm"
            >
              {(id) => (
                <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
            </Field>
            {link.hasPassword && (
              <div className="flex items-center gap-3">
                <Badge tone="blue">{t("states.protected")}</Badge>
                <Button
                  size="sm"
                  disabled={readOnly}
                  loading={removePassword.isPending}
                  onClick={() => removePassword.mutate({ password: null }, { onSuccess: () => toast.success(t("fields.passwordRemoved")) })}
                >
                  {t("fields.removePassword")}
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.expiresAt")} hint={t("fields.expiresAtHint")}>
                {(id) => <Input id={id} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
              </Field>
              <Field label={t("fields.maxClicks")} hint={t("fields.maxClicksHint")}>
                {(id) => <Input id={id} type="number" min={1} inputMode="numeric" value={maxClicks} onChange={(e) => setMaxClicks(e.target.value)} />}
              </Field>
            </div>
            <Field label={t("fields.fallbackUrl")} hint={t("fields.fallbackUrlHint")}>
              {(id) => <Input id={id} type="url" placeholder="https://" value={fallbackUrl} onChange={(e) => setFallbackUrl(e.target.value)} />}
            </Field>
          </CardBody>
        </Card>
      </fieldset>
      <SaveBar disabled={readOnly} loading={patch.isPending}>
        {t("edit.save")}
      </SaveBar>
    </form>
  );
}

export function SaveBar({ disabled, loading, children, onClick }: { disabled?: boolean; loading?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <div>
      <Button type={onClick ? "button" : "submit"} variant="primary" disabled={disabled} loading={loading} onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}
