import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Input, Select } from "../../components/ui";
import { api, qs } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useMe } from "../../lib/session";
import { domainsQuery, foldersQuery, folderTree, tagsQuery, type Link } from "./api";
import { TagInput } from "./parts";

type PageMeta = { title: string | null; description: string | null; image: string | null };

/** Looks up the page title of a destination (A3). */
export function fetchMeta(url: string) {
  return api<PageMeta>(`/api/links/meta${qs({ url })}`);
}

export function CreateLinkDialog({ open, onClose, initialUrl = "" }: { open: boolean; onClose: () => void; initialUrl?: string }) {
  const { t } = useTranslation("links");
  return (
    <Dialog open={open} onClose={onClose} title={t("create.title")} description={t("create.description")}>
      <CreateForm onClose={onClose} initialUrl={initialUrl} />
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
          // The form already looked the title up: don't wait for the destination again.
          fetchMeta: false,
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
      <Field label={t("fields.url")}>
        {(id) => (
          <Input
            id={id}
            type="url"
            required
            autoFocus
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => void lookUp()}
          />
        )}
      </Field>
      <Field label={t("fields.slug")} hint={t("fields.slugHint")}>
        {(id) => <Input id={id} value={slug} maxLength={64} autoComplete="off" onChange={(e) => setSlug(e.target.value)} />}
      </Field>
      {domainList.length > 1 && (
        <Field label={t("fields.domain")}>
          {(id) => (
            <Select id={id} value={chosenDomain} onChange={(e) => setDomainId(e.target.value)}>
              {domainList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.host}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label={t("fields.title")} hint={lookingUp ? t("create.lookingUp") : undefined}>
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
      </Field>
      <Field label={t("fields.tags")}>
        {(id) => <TagInput id={id} value={tagNames} onChange={setTagNames} suggestions={(tags.data ?? []).map((x) => x.name)} />}
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
      {create.error && (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(tc, create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>{tc("cancel")}</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t("create.submit")}
        </Button>
      </div>
    </form>
  );
}
