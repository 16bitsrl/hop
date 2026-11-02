import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, useToast } from "../../components/legacy";
import { usePatchLink, type Link, type LinkRule } from "./api";
import { ReadOnlyNotice, SaveBar } from "./edit-tab";

const DEVICES = ["ios", "android", "desktop", "mobile", "tablet"] as const;
type Device = (typeof DEVICES)[number];

/** A rule as the form edits it: lists are comma-separated text. */
type RuleDraft = { devices: Device[]; countries: string; languages: string; url: string; appUrl: string };
type VariantDraft = { url: string; weight: string };

const toDraft = (r: LinkRule): RuleDraft => ({
  devices: (r.devices ?? []) as Device[],
  countries: (r.countries ?? []).join(", "),
  languages: (r.languages ?? []).join(", "),
  url: r.url,
  appUrl: r.appUrl ?? "",
});
const list = (s: string) => s.split(/[\s,;]+/).filter(Boolean);
const fromDraft = (r: RuleDraft) => ({
  ...(r.devices.length ? { devices: r.devices } : {}),
  ...(list(r.countries).length ? { countries: list(r.countries).map((c) => c.toUpperCase()) } : {}),
  ...(list(r.languages).length ? { languages: list(r.languages).map((l) => l.toLowerCase()) } : {}),
  url: r.url.trim(),
  ...(r.appUrl.trim() ? { appUrl: r.appUrl.trim() } : {}),
});

export function SmartTab({ link }: { link: Link }) {
  const { t } = useTranslation("links");
  const toast = useToast();
  const readOnly = !link.canModify;
  const patch = usePatchLink(link.id);
  const [rules, setRules] = useState<RuleDraft[]>(link.rules.map(toDraft));
  const [variants, setVariants] = useState<VariantDraft[]>(link.variants.map((v) => ({ url: v.url, weight: String(v.weight) })));
  const [appUrl, setAppUrl] = useState(link.appUrl ?? "");

  const setRule = (i: number, part: Partial<RuleDraft>) => setRules((cur) => cur.map((r, j) => (j === i ? { ...r, ...part } : r)));
  const move = (i: number, by: -1 | 1) =>
    setRules((cur) => {
      const next = [...cur];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  const weights = variants.map((v) => Math.max(0, Number(v.weight) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const percent = (i: number) => (total > 0 ? Math.round((weights[i]! / total) * 100) : 0);

  function save() {
    if (variants.length === 1) {
      toast.error(t("smart.variantsMin"));
      return;
    }
    patch.mutate({
      rules: rules.map(fromDraft),
      variants: variants.map((v) => ({ url: v.url.trim(), weight: Math.max(1, Math.round(Number(v.weight) || 1)) })),
      appUrl,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ReadOnlyNotice show={readOnly} />

      <Card>
        <CardHeader
          title={t("smart.rulesTitle")}
          description={t("smart.rulesHint")}
          action={
            <Button size="sm" disabled={readOnly || rules.length >= 20} onClick={() => setRules((cur) => [...cur, { devices: [], countries: "", languages: "", url: "", appUrl: "" }])}>
              {t("smart.addRule")}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {rules.length === 0 && <p className="text-[13px] text-muted-foreground">{t("smart.noRules")}</p>}
          {rules.map((r, i) => {
            const n = i + 1;
            return (
              <fieldset key={i} disabled={readOnly} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t("smart.ruleN", { n })}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} aria-label={t("smart.moveUp", { n })} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === rules.length - 1} aria-label={t("smart.moveDown", { n })} onClick={() => move(i, 1)}>
                      ↓
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={t("smart.removeRule", { n })} onClick={() => setRules((cur) => cur.filter((_, j) => j !== i))}>
                      {t("smart.remove")}
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium">{t("smart.devices")}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {DEVICES.map((d) => (
                      <Checkbox
                        key={d}
                        label={t(`smart.device.${d}`)}
                        aria-label={`${t("smart.ruleN", { n })} ${t(`smart.device.${d}`)}`}
                        checked={r.devices.includes(d)}
                        onChange={(e) => setRule(i, { devices: e.target.checked ? [...r.devices, d] : r.devices.filter((x) => x !== d) })}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("smart.countries")} hint={t("smart.countriesHint")}>
                    {(id) => <Input id={id} aria-label={`${t("smart.ruleN", { n })} ${t("smart.countriesShort")}`} placeholder="IT, US" value={r.countries} onChange={(e) => setRule(i, { countries: e.target.value })} />}
                  </Field>
                  <Field label={t("smart.languages")} hint={t("smart.languagesHint")}>
                    {(id) => <Input id={id} aria-label={`${t("smart.ruleN", { n })} ${t("smart.languagesShort")}`} placeholder="it, en" value={r.languages} onChange={(e) => setRule(i, { languages: e.target.value })} />}
                  </Field>
                </div>
                <Field label={t("smart.destination")}>
                  {(id) => (
                    <Input id={id} type="url" required placeholder="https://" aria-label={`${t("smart.ruleN", { n })} ${t("smart.destinationShort")}`} value={r.url} onChange={(e) => setRule(i, { url: e.target.value })} />
                  )}
                </Field>
                <Field label={t("smart.appLink")} hint={t("smart.appLinkHint")}>
                  {(id) => <Input id={id} placeholder="myapp://" aria-label={`${t("smart.ruleN", { n })} ${t("smart.appLinkShort")}`} value={r.appUrl} onChange={(e) => setRule(i, { appUrl: e.target.value })} />}
                </Field>
              </fieldset>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("smart.variantsTitle")}
          description={t("smart.variantsHint")}
          action={
            <Button
              size="sm"
              disabled={readOnly || variants.length >= 10}
              onClick={() => setVariants((cur) => [...cur, { url: cur.length === 0 ? link.url : "", weight: "1" }])}
            >
              {t("smart.addVariant")}
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-3">
          {variants.length === 0 && <p className="text-[13px] text-muted-foreground">{t("smart.noVariants")}</p>}
          {variants.length === 1 && <p className="text-[13px] text-warning">{t("smart.variantsMin")}</p>}
          {variants.map((v, i) => (
            <fieldset key={i} disabled={readOnly} className="grid items-end gap-3 sm:grid-cols-[1fr_110px_56px_auto]">
              <Field label={t("smart.variantUrl", { n: i + 1 })}>
                {(id) => (
                  <Input
                    id={id}
                    type="url"
                    required
                    placeholder="https://"
                    value={v.url}
                    onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                  />
                )}
              </Field>
              <Field label={t("smart.variantWeight", { n: i + 1 })}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={1000}
                    value={v.weight}
                    onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                  />
                )}
              </Field>
              <p className="pb-1.5 text-sm font-medium tabular-nums">{percent(i)}%</p>
              <Button size="sm" variant="ghost" aria-label={t("smart.removeVariant", { n: i + 1 })} onClick={() => setVariants((cur) => cur.filter((_, j) => j !== i))}>
                {t("smart.remove")}
              </Button>
            </fieldset>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("smart.mainAppTitle")} description={t("smart.mainAppHint")} />
        <CardBody>
          <fieldset disabled={readOnly}>
            <Field label={t("smart.mainAppLabel")}>
              {(id) => <Input id={id} placeholder="myapp://" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} />}
            </Field>
          </fieldset>
        </CardBody>
      </Card>

      <SaveBar disabled={readOnly} loading={patch.isPending} onClick={save}>
        {t("smart.save")}
      </SaveBar>
    </div>
  );
}
