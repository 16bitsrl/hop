import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";

/** Where the installers of the command line app live. */
const INSTALL = "https://raw.githubusercontent.com/16bitsrl/hop/main/cli";

/** A command or a piece of code, with a button to copy it. */
export function Code({ children }: { children: string }) {
  return (
    // The button sits beside the text, not over it: a long command scrolls in its own space.
    <div className="flex items-start gap-2 rounded-lg border bg-muted p-1.5 pl-3">
      <pre className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[12.5px] leading-relaxed">{children}</pre>
      <CopyButton value={children} />
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium">{label}</p>
      {children}
    </div>
  );
}

/** How to install the command line app and sign it in to this installation. */
export function CliCommands() {
  const { t } = useTranslation("apiKeys");
  return (
    <div className="flex flex-col gap-3">
      <Labeled label={t("help.cli.unix")}>
        <Code>{`curl -fsSL ${INSTALL}/install.sh | sh`}</Code>
      </Labeled>
      <Labeled label={t("help.cli.windows")}>
        <Code>{`irm ${INSTALL}/install.ps1 | iex`}</Code>
      </Labeled>
      <Labeled label={t("help.cli.login")}>
        <Code>{`hop login ${window.location.origin}`}</Code>
      </Labeled>
    </div>
  );
}
