import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardBody, CopyButton, Switch } from "../../components/ui";
import { formatDateTime } from "../../lib/cn";
import { foldersQuery, usePatchLink, type Link } from "./api";
import { StateBadges, TagChip } from "./parts";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export function OverviewTab({ link }: { link: Link }) {
  const { t, i18n } = useTranslation("links");
  const folders = useQuery(foldersQuery);
  const patch = usePatchLink(link.id);
  const folder = folders.data?.find((f) => f.id === link.folderId);
  const dash = <span className="text-muted">{t("none")}</span>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-muted">{t("overview.shortLink")}</p>
              <a href={link.shortUrl} target="_blank" rel="noreferrer" data-testid="short-url" className="break-all text-lg font-semibold text-accent hover:underline">
                {link.shortUrl}
              </a>
            </div>
            <CopyButton value={link.shortUrl} label={t("copyShort")} />
          </div>
          <div className="border-t border-line pt-4">
            <Switch
              checked={link.enabled}
              onChange={(enabled) => patch.mutate({ enabled })}
              disabled={!link.canModify || patch.isPending}
              label={t("overview.active")}
              description={link.canModify ? t("overview.activeHint") : t("readOnly")}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <dl className="divide-y divide-line">
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
            <Row label={t("overview.clicks")}>{link.clickCount.toLocaleString(i18n.language)}</Row>
            <Row label={t("overview.lastClick")}>{link.lastClickedAt ? formatDateTime(link.lastClickedAt, i18n.language) : dash}</Row>
            <Row label={t("overview.created")}>{formatDateTime(link.createdAt, i18n.language)}</Row>
            <Row label={t("overview.updated")}>{formatDateTime(link.updatedAt, i18n.language)}</Row>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
