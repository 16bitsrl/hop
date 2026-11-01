import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";
import { CheckIcon, CopyIcon } from "./icons";

/** Copies `value` to the clipboard and says so. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions): fall back to selecting a hidden field.
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }

  return (
    <Button size="sm" onClick={copy} aria-label={label ?? t("copy")}>
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? t("copied") : (label ?? t("copy"))}
    </Button>
  );
}
