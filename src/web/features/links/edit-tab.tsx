import { useQuery } from "@tanstack/react-query";
import { LockIcon, SaveIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { SwitchField } from "@/components/toggle-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { foldersQuery, tagsQuery, usePatchLink, type Link } from "./api";
import { folderOptions, TagInput } from "./parts";

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
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
      <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {t("readOnly")}
    </p>
  );
}

/** A card with a titled header and a divider, used by the link tabs. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={className}>{children}</CardContent>
    </Card>
  );
}

export function EditTab({ link }: { link: Link }) {
  const { t } = useTranslation("links");
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
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ReadOnlyNotice show={readOnly} />
      <fieldset disabled={readOnly} className="flex flex-col gap-5">
        <SectionCard title={t("edit.destination")} className="flex flex-col gap-4">
          <FormField label={t("fields.url")}>{(id) => <Input id={id} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />}</FormField>
          <FormField label={t("fields.title")}>{(id) => <Input id={id} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />}</FormField>
          <FormField label={t("fields.tags")}>
            {(id) => <TagInput id={id} value={tagNames} onChange={setTagNames} suggestions={(tags.data ?? []).map((x) => x.name)} disabled={readOnly} />}
          </FormField>
          <FormField label={t("fields.folder")} className="sm:max-w-sm">
            {(id) => (
              <OptionSelect
                id={id}
                value={folderId}
                onValueChange={setFolderId}
                disabled={readOnly}
                options={folderOptions(folders.data ?? [], [{ value: "", label: t("folders.none") }])}
              />
            )}
          </FormField>
          <FormField label={t("fields.notes")} hint={t("fields.notesHint")}>
            {(id) => <Textarea id={id} value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} />}
          </FormField>
        </SectionCard>

        <SectionCard title={t("edit.behaviour")} className="flex flex-col gap-4">
          <FormField label={t("fields.redirectType")} hint={t("fields.redirectTypeHint")} className="sm:max-w-sm">
            {(id) => (
              <OptionSelect
                id={id}
                value={redirectType}
                onValueChange={setRedirectType}
                disabled={readOnly}
                options={[302, 301, 307, 308].map((code) => ({ value: String(code), label: t(`redirectTypes.${code}`) }))}
              />
            )}
          </FormField>
          <SwitchField
            checked={forwardQuery}
            onCheckedChange={setForwardQuery}
            label={t("fields.forwardQuery")}
            description={t("fields.forwardQueryHint")}
            disabled={readOnly}
          />
        </SectionCard>

        <SectionCard title={t("edit.access")} className="flex flex-col gap-4">
          <FormField label={t("fields.password")} hint={link.hasPassword ? t("fields.passwordSet") : t("fields.passwordHint")} className="sm:max-w-sm">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </FormField>
          {link.hasPassword && (
            <div className="flex items-center gap-3">
              <Badge variant="info">
                <LockIcon data-icon="inline-start" aria-hidden="true" />
                {t("states.protected")}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly}
                loading={removePassword.isPending}
                onClick={() => removePassword.mutate({ password: null }, { onSuccess: () => toast.success(t("fields.passwordRemoved")) })}
              >
                {t("fields.removePassword")}
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("fields.expiresAt")} hint={t("fields.expiresAtHint")}>
              {(id) => <Input id={id} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
            </FormField>
            <FormField label={t("fields.maxClicks")} hint={t("fields.maxClicksHint")}>
              {(id) => <Input id={id} type="number" min={1} inputMode="numeric" className="tabular-nums" value={maxClicks} onChange={(e) => setMaxClicks(e.target.value)} />}
            </FormField>
          </div>
          <FormField label={t("fields.fallbackUrl")} hint={t("fields.fallbackUrlHint")}>
            {(id) => <Input id={id} type="url" placeholder="https://" value={fallbackUrl} onChange={(e) => setFallbackUrl(e.target.value)} />}
          </FormField>
        </SectionCard>
      </fieldset>
      <SaveBar disabled={readOnly} loading={patch.isPending}>
        {!patch.isPending && <SaveIcon data-icon="inline-start" />}
        {t("edit.save")}
      </SaveBar>
    </form>
  );
}

export function SaveBar({ disabled, loading, children, onClick }: { disabled?: boolean; loading?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <div>
      <Button type={onClick ? "button" : "submit"} disabled={disabled} loading={loading} onClick={onClick}>
        {children}
      </Button>
    </div>
  );
}
