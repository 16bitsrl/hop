import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, type ButtonProps } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** How long the check stays before the copy icon comes back. */
const COPIED_MS = 1500;

/** Copy that turns into a check for a moment. The two icons crossfade and scale. */
function SwapIcon({ copied }: { copied: boolean }) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
      <CopyIcon
        className={cn("absolute size-4 transition-[opacity,scale] duration-200 ease-(--ease-snappy)", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")}
      />
      <CheckIcon
        className={cn("absolute size-4 text-primary transition-[opacity,scale] duration-200 ease-(--ease-snappy)", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")}
      />
    </span>
  );
}

function useCopy(value: string, onCopied?: () => void) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    await copyText(value);
    setCopied(true);
    onCopied?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }
  return { copied, copy };
}

/** Button with a label ("Copy", then "Copied"). */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "outline",
  className,
}: {
  value: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const { t } = useTranslation();
  const { copied, copy } = useCopy(value);
  return (
    <Button size={size} variant={variant} onClick={copy} aria-label={label ?? t("copy")} data-copied={copied || undefined} className={className}>
      <SwapIcon copied={copied} />
      <span aria-live="polite">{copied ? t("copied") : (label ?? t("copy"))}</span>
    </Button>
  );
}

/** Icon-only copy button, for tight rows. `label` names it for screen readers and the tooltip. */
export function CopyIconButton({ value, label, onCopied, className }: { value: string; label: string; onCopied?: () => void; className?: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopy(value, onCopied);
  return (
    <Button size="icon-sm" variant="ghost" onClick={copy} aria-label={label} title={copied ? t("copied") : label} data-copied={copied || undefined} className={className}>
      <SwapIcon copied={copied} />
    </Button>
  );
}
