import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlertIcon, PlusIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, qs } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useMe } from "../../lib/session";
import { domainsQuery, foldersQuery, tagsQuery, type Link } from "./api";
import { folderOptions, TagInput } from "./parts";

type PageMeta = { title: string | null; description: string | null; image: string | null };

/** Looks up the page title of a destination (A3). */
export function fetchMeta(url: string) {
  return api<PageMeta>(`/api/links/meta${qs({ url })}`);
}

export function CreateLinkDialog({ open, onClose, initialUrl = "" }: { open: boolean; onClose: () => void; initialUrl?: string }) {
  const { t } = useTranslation("links");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        <CreateForm onClose={onClose} initialUrl={initialUrl} />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ onClose, initialUrl }: { onClose: () => void; initialUrl: string }) {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const domains = useQuery(domainsQuery);
  const tags = useQuery(tagsQuery);
  const folders = useQuery(foldersQuery);

  const [url, setUrl] = useState(initialUrl);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState("");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [folderId, setFolderId] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const titleTouched = useRef(false);
  const lastLookup = useRef("");

  const domainList = domains.data ?? [];
  const chosenDomain =
    domainId || (domainList.find((d) => d.id === me.defaultDomainId) ?? domainList.find((d) => d.isDefault) ?? domainList[0])?.id || "";

  async function lookUp() {
    const value = url.trim();
    if (!/^https?:\/\//i.test(value) || titleTouched.current || lastLookup.current === value) return;
    lastLookup.current = value;
    setLookingUp(true);
    try {
      const meta = await fetchMeta(value);
      if (!titleTouched.current && lastLookup.current === value && meta.title) setTitle(meta.title);
    } catch {
      /* the title is optional */
    } finally {
      setLookingUp(false);
    }
  }

  // A link that arrives pre-filled (shared to hop) gets its title looked up right away.
  useEffect(() => {
    if (initialUrl) void lookUp();
    // Only once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = useMutation({
    mutationFn: () =>
      api<{ link: Link }>("/api/links", {
        body: {
          url: url.trim(),
          slug: slug.trim() || null,
          title: title.trim() || null,
          domainId: chosenDomain || null,
          tags: tagNames,
          folderId: folderId || null,
          // Without a title (lookup not finished or nothing found) the server looks it up.
          fetchMeta: !title.trim(),
        },
      }),
    onSuccess: async ({ link }) => {
      await queryClient.invalidateQueries({ queryKey: ["links"] });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
      onClose();
      void navigate({ to: "/links/$id", params: { id: link.id } });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }


  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FormField label={t("fields.url")}>
        {(id) => (
          <Input id={id} type="url" required autoFocus placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => void lookUp()} />
        )}
      </FormField>
      <FormField label={t("fields.slug")} hint={t("fields.slugHint")}>
        {(id) => <Input id={id} value={slug} maxLength={64} autoComplete="off" onChange={(e) => setSlug(e.target.value)} />}
      </FormField>
      {domainList.length > 1 && (
        <FormField label={t("fields.domain")}>
          {(id) => <OptionSelect id={id} value={chosenDomain} onValueChange={setDomainId} options={domainList.map((d) => ({ value: d.id, label: d.host }))} />}
        </FormField>
      )}
      <FormField
        label={t("fields.title")}
        hint={
          lookingUp ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner className="size-3" />
              {t("create.lookingUp")}
            </span>
          ) : undefined
        }
      >
        {(id) => (
          <Input
            id={id}
            value={title}
            maxLength={300}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
          />
        )}
      </FormField>
      <FormField label={t("fields.tags")}>
        {(id) => <TagInput id={id} value={tagNames} onChange={setTagNames} suggestions={(tags.data ?? []).map((x) => x.name)} />}
      </FormField>
      <FormField label={t("fields.folder")}>
        {(id) => (
          <OptionSelect id={id} value={folderId} onValueChange={setFolderId} options={folderOptions(folders.data ?? [], [{ value: "", label: t("folders.none") }])} />
        )}
      </FormField>
      {create.error && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] text-destructive">
          <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {errorMessage(tc, create.error)}
        </p>
      )}
      <DialogFooter className="mt-1">
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {!create.isPending && <PlusIcon data-icon="inline-start" />}
          {t("create.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
