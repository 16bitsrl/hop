import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/page";
import { ArrowLeftIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { bookmarklet } from "../lib/share";

function Code({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted p-3 pr-24 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={children} />
      </div>
    </div>
  );
}

function Section({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{text}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Help page for people who want to use the API from scripts. Examples use this installation's address. */
export function ApiHelpPage() {
  const { t } = useTranslation("apiKeys");
  const base = window.location.origin;
  const auth = `-H "Authorization: Bearer hop_your_key_here"`;
  return (
    <>
      <Link to="/profile" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        {t("help.back")}
      </Link>
      <PageHeader title={t("help.title")} description={t("help.description")} />
      <div className="flex max-w-3xl flex-col gap-4">
        <Section title={t("help.auth.title")} text={t("help.auth.text")}>
          <Code>{`Authorization: Bearer hop_your_key_here`}</Code>
          <Code>{`curl ${auth} \\\n  ${base}/api/me`}</Code>
        </Section>
        <Section title={t("help.list.title")} text={t("help.list.text")}>
          <Code>{`curl ${auth} \\\n  "${base}/api/links?q=pricing&page=1"`}</Code>
        </Section>
        <Section title={t("help.create.title")} text={t("help.create.text")}>
          <Code>{`curl -X POST ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com/long/page","slug":"summer","title":"Summer sale","tags":["promo"]}' \\\n  ${base}/api/links`}</Code>
        </Section>
        <Section title={t("help.update.title")} text={t("help.update.text")}>
          <Code>{`curl -X PATCH ${auth} \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com/new-page","enabled":true}' \\\n  ${base}/api/links/LINK_ID`}</Code>
        </Section>
        <Section title={t("help.remove.title")} text={t("help.remove.text")}>
          <Code>{`curl -X DELETE ${auth} \\\n  ${base}/api/links/LINK_ID`}</Code>
        </Section>
        <Section title={t("help.stats.title")} text={t("help.stats.text")}>
          <Code>{`curl ${auth} \\\n  "${base}/api/stats/summary?linkId=LINK_ID"`}</Code>
        </Section>
        <Section title={t("help.bookmarklet.title")} text={t("help.bookmarklet.text")}>
          <Code>{bookmarklet(base)}</Code>
        </Section>
        <Section title={t("help.errors.title")} text={t("help.errors.text")}>
          <Code>{`{ "error": "invalid_request", "fields": ["url"] }`}</Code>
        </Section>
      </div>
    </>
  );
}
