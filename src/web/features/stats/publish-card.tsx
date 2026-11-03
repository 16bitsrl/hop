import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CopyIconButton } from "@/components/copy-button";
import { SwitchField } from "@/components/toggle-field";
import { Card, CardContent } from "@/components/ui/card";
import { linkQuery, usePatchLink } from "../links/api";

/** On/off for a link's public statistics page, with its address when it is on. */
export function PublishStatsCard({ linkId }: { linkId: string }) {
  const { t } = useTranslation("stats");
  const tLinks = useTranslation("links").t;
  const link = useQuery(linkQuery(linkId));
  const patch = usePatchLink(linkId);
  if (!link.data) return null;
  const on = link.data.publicStats;
  const address = `${window.location.origin}/s/${linkId}`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <SwitchField
          checked={on}
          onCheckedChange={(publicStats) => patch.mutate({ publicStats })}
          disabled={!link.data.canModify || patch.isPending}
          label={t("public.toggle")}
          description={link.data.canModify ? t("public.toggleHint") : tLinks("readOnly")}
        />
        {on && (
          <div className="flex min-w-0 items-center gap-1">
            <a href={address} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[13px] text-primary underline-offset-4 hover:underline">
              {address}
            </a>
            <CopyIconButton value={address} label={t("public.copy")} className="shrink-0" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
