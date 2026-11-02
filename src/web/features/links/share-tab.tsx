import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, SparklesIcon, WandSparklesIcon, XIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { OptionSelect } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { ApiError } from "../../lib/api";
import { downloadBlob } from "../../lib/clipboard";
import { errorMessage } from "../../lib/errors";
import { applyUtm, parseUtm, UTM_FIELDS, type Utm } from "../../lib/utm";
import { usePatchLink, type Link } from "./api";
import { fetchMeta } from "./create-dialog";
import { ReadOnlyNotice, SectionCard } from "./edit-tab";
import { qrPng, qrSvg } from "./qr";

export function ShareTab({ link }: { link: Link }) {
  return (
    <div className="flex flex-col gap-5">
      <ReadOnlyNotice show={!link.canModify} />
      <UtmCard link={link} />
      <QrCard link={link} />
      <SocialCard link={link} />
    </div>
  );
}

/* ---------------- D1: UTM builder ---------------- */

function UtmCard({ link }: { link: Link }) {
  const { t } = useTranslation("links");
  const patch = usePatchLink(link.id);
  const [utm, setUtm] = useState<Utm>(() => parseUtm(link.url));
  const result = applyUtm(link.url, utm);
  const unchanged = result === link.url;

  return (
    <SectionCard title={t("utm.title")} description={t("utm.description")} className="flex flex-col gap-4">
        <fieldset disabled={!link.canModify} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UTM_FIELDS.map((f) => (
            <FormField key={f} label={t(`utm.${f}`)} hint={t(`utm.${f}Hint`)}>
              {(id) => <Input id={id} value={utm[f]} onChange={(e) => setUtm((cur) => ({ ...cur, [f]: e.target.value }))} />}
            </FormField>
          ))}
        </fieldset>
        <div className="rounded-lg border border-border bg-muted/60 px-3.5 py-3">
          <p className="text-[13px] font-medium">{t("utm.result")}</p>
          <code data-testid="utm-result" className="mt-1 block break-all font-mono text-xs">
            {result}
          </code>
        </div>
        <div>
          <Button disabled={!link.canModify || unchanged} loading={patch.isPending} onClick={() => patch.mutate({ url: result })}>
            {!patch.isPending && <WandSparklesIcon data-icon="inline-start" />}
            {t("utm.apply")}
          </Button>
        </div>
    </SectionCard>
  );
}

/* ---------------- D2: QR code ---------------- */

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

function QrCard({ link }: { link: Link }) {
  const { t } = useTranslation("links");
  const [foreground, setForeground] = useState("#000000");
  const [background, setBackground] = useState("#ffffff");
  const [size, setSize] = useState("512");
  const [logo, setLogo] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const opts = { text: link.shortUrl, foreground, background, size: Number(size), logo };

  useEffect(() => {
    let cancelled = false;
    qrSvg({ text: link.shortUrl, foreground, background, size: 256, logo })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [link.shortUrl, foreground, background, logo]);

  async function onLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) return toast.error(t("qr.logoTooBig"));
    setLogo(await readAsDataUrl(file));
  }

  const download = useMutation({
    mutationFn: async (kind: "svg" | "png") => {
      if (kind === "svg") downloadBlob(new Blob([await qrSvg(opts)], { type: "image/svg+xml" }), `${link.slug}.svg`);
      else downloadBlob(await qrPng(opts), `${link.slug}.png`);
    },
    onError: () => toast.error(t("qr.failed")),
  });

  return (
    <SectionCard title={t("qr.title")} description={t("qr.description")} className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div
          className="size-48 shrink-0 overflow-hidden rounded-lg border border-border [&>svg]:size-full"
          style={{ background }}
          aria-label={t("qr.preview")}
          role="img"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t("qr.foreground")}>
              {(id) => <Input id={id} type="color" className="p-1" value={foreground} onChange={(e) => setForeground(e.target.value)} />}
            </FormField>
            <FormField label={t("qr.background")}>
              {(id) => <Input id={id} type="color" className="p-1" value={background} onChange={(e) => setBackground(e.target.value)} />}
            </FormField>
            <FormField label={t("qr.size")}>
              {(id) => <OptionSelect id={id} value={size} onValueChange={setSize} options={["256", "512", "1024", "2048"].map((n) => ({ value: n, label: `${n} px` }))} />}
            </FormField>
          </div>
          <FormField label={t("qr.logo")} hint={t("qr.logoHint")}>
            {(id) => (
              <div className="flex items-center gap-2">
                <Input id={id} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => void onLogo(e)} />
                {logo && (
                  <Button variant="outline" onClick={() => setLogo(null)}>
                    <XIcon data-icon="inline-start" />
                    {t("qr.removeLogo")}
                  </Button>
                )}
              </div>
            )}
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button loading={download.isPending && download.variables === "svg"} onClick={() => download.mutate("svg")}>
              {!(download.isPending && download.variables === "svg") && <DownloadIcon data-icon="inline-start" />}
              {t("qr.downloadSvg")}
            </Button>
            <Button variant="outline" loading={download.isPending && download.variables === "png"} onClick={() => download.mutate("png")}>
              {!(download.isPending && download.variables === "png") && <DownloadIcon data-icon="inline-start" />}
              {t("qr.downloadPng")}
            </Button>
          </div>
        </div>
    </SectionCard>
  );
}

/* ---------------- D3: social preview ---------------- */

function SocialCard({ link }: { link: Link }) {
  const { t } = useTranslation("links");
  const tc = useTranslation().t;
  const readOnly = !link.canModify;
  const patch = usePatchLink(link.id);
  const [title, setTitle] = useState(link.ogTitle ?? "");
  const [description, setDescription] = useState(link.ogDescription ?? "");
  const [image, setImage] = useState(link.ogImage ?? "");

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch("/api/media", { method: "POST", body: file, headers: { "content-type": file.type }, credentials: "same-origin" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) throw new ApiError(res.status, data?.error ?? "generic");
      return data.url;
    },
    onSuccess: setImage,
    onError: (e) => toast.error(errorMessage(tc, e)),
  });

  const fill = useMutation({
    mutationFn: () => fetchMeta(link.url),
    onSuccess: (meta) => {
      if (!meta.title && !meta.description && !meta.image) return toast.error(t("social.nothingFound"));
      if (!title && meta.title) setTitle(meta.title);
      if (!description && meta.description) setDescription(meta.description);
      if (!image && meta.image) setImage(meta.image);
    },
  });

  const shownTitle = title || link.title || link.host;
  const shownImage = /^https?:\/\//i.test(image) ? image : "";

  return (
    <SectionCard
      title={t("social.title")}
      description={t("social.description")}
      className="grid gap-6 lg:grid-cols-2"
      action={
        <Button size="sm" variant="outline" disabled={readOnly} loading={fill.isPending} onClick={() => fill.mutate()}>
          {!fill.isPending && <SparklesIcon data-icon="inline-start" />}
          {t("social.fill")}
        </Button>
      }
    >
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          <FormField label={t("social.ogTitle")}>
            {(id) => <Input id={id} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />}
          </FormField>
          <FormField label={t("social.ogDescription")}>
            {(id) => <Textarea id={id} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />}
          </FormField>
          <FormField label={t("social.imageUrl")}>
            {(id) => <Input id={id} type="url" placeholder="https://" value={image} onChange={(e) => setImage(e.target.value)} />}
          </FormField>
          <FormField label={t("social.upload")} hint={t("social.uploadHint")}>
            {(id) => (
              <Input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload.mutate(file);
                }}
              />
            )}
          </FormField>
          <div>
            <Button disabled={readOnly} loading={patch.isPending} onClick={() => patch.mutate({ ogTitle: title, ogDescription: description, ogImage: image })}>
              {t("social.save")}
            </Button>
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-[13px] font-medium">{t("social.preview")}</p>
          <div data-testid="social-card" className="overflow-hidden rounded-xl border border-border bg-card">
            {shownImage ? (
              <img src={shownImage} alt="" className="aspect-[1.91/1] w-full bg-muted object-cover" />
            ) : (
              <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-[13px] text-muted-foreground">{t("social.noImage")}</div>
            )}
            <div className="border-t border-border px-3.5 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{link.host}</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{shownTitle}</p>
              {description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{description}</p>}
            </div>
          </div>
        </div>
    </SectionCard>
  );
}
