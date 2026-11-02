import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";
import { SwitchField } from "@/components/toggle-field";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "../../lib/cn";
import { LinkHealth } from "../data/health";
import { foldersQuery, usePatchLink, type Link } from "./api";
import { StateBadges, TagChip } from "./parts";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export function OverviewTab({ link }: { link: Link }) {
  const { t, i18n } = useTranslation("links");
  const tData = useTranslation("data").t;
  const folders = useQuery(foldersQuery);
  const patch = usePatchLink(link.id);
  const folder = folders.data?.find((f) => f.id === link.folderId);
  const dash = <span className="text-muted-foreground">{t("none")}</span>;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">{t("overview.shortLink")}</p>
              <a href={link.shortUrl} target="_blank" rel="noreferrer" data-testid="short-url" className="text-lg font-semibold break-all text-primary underline-offset-4 hover:underline">
                {link.shortUrl}
              </a>
            </div>
            <CopyButton value={link.shortUrl} label={t("copyShort")} />
          </div>
          <div className="border-t border-border pt-4">
            <SwitchField
              checked={link.enabled}
              onCheckedChange={(enabled) => patch.mutate({ enabled })}
              disabled={!link.canModify || patch.isPending}
              label={t("overview.active")}
              description={link.canModify ? t("overview.activeHint") : t("readOnly")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <dl className="-my-2.5 divide-y divide-border">
            <Row label={t("fields.url")}>
              <a href={link.url} target="_blank" rel="noreferrer" className="break-all hover:underline">
                {link.url}
              </a>
            </Row>
            <Row label={t("fields.title")}>{link.title || dash}</Row>
            <Row label={t("overview.status")}>
              <div className="flex flex-wrap gap-1.5">
                <StateBadges states={link.states} />
              </div>
            </Row>
            <Row label={tData("health.destination")}>
              <LinkHealth link={link} />
            </Row>
            <Row label={t("fields.tags")}>
              {link.tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {link.tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} />
                  ))}
                </div>
              ) : (
                dash
              )}
            </Row>
            <Row label={t("fields.folder")}>{folder?.name ?? dash}</Row>
            <Row label={t("fields.notes")}>{link.notes ? <span className="whitespace-pre-wrap">{link.notes}</span> : dash}</Row>
            <Row label={t("overview.owner")}>{link.ownerName ?? dash}</Row>
            <Row label={t("overview.clicks")}>
              <span className="tabular-nums">{link.clickCount.toLocaleString(i18n.language)}</span>
            </Row>
            <Row label={t("overview.lastClick")}>{link.lastClickedAt ? formatDateTime(link.lastClickedAt, i18n.language) : dash}</Row>
            <Row label={t("overview.created")}>{formatDateTime(link.createdAt, i18n.language)}</Row>
            <Row label={t("overview.updated")}>{formatDateTime(link.updatedAt, i18n.language)}</Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
