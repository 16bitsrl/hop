import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, CloseIcon } from "../../components/ui";
import { controlClass } from "../../components/ui/input";
import { cn } from "../../lib/cn";
import type { LinkState, TagRef } from "./api";

export function TagChip({ tag }: { tag: Pick<TagRef, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-subtle px-1.5 py-0.5 text-xs font-medium text-fg">
      <span className="size-2 rounded-full" style={{ background: tag.color ?? "var(--muted)" }} aria-hidden="true" />
      {tag.name}
    </span>
  );
}

const stateTone = { active: "green", disabled: "neutral", expired: "amber", broken: "red", protected: "blue" } as const;

/** Badges for what is notable about a link. "Active" only shows when nothing else does. */
export function StateBadges({ states }: { states: LinkState[] }) {
  const { t } = useTranslation("links");
  return (
    <>
      {states.map((s) => (
        <Badge key={s} tone={stateTone[s]}>
          {t(`states.${s}`)}
        </Badge>
      ))}
    </>
  );
}

/** Chips plus a text box. Enter or a comma adds a tag; new names are created when the link is saved. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  disabled,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("links");
  const [text, setText] = useState("");
  const listId = useId();

  function add(raw: string) {
    const name = raw.trim();
    if (name && !value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
    setText("");
  }

  return (
    <div className={cn(controlClass, "flex min-h-8 flex-wrap items-center gap-1.5 py-1", disabled && "opacity-70")}>
      {value.map((name) => (
        <span key={name} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5 text-xs font-medium">
          {name}
          {!disabled && (
            <button type="button" aria-label={t("tags.remove", { name })} onClick={() => onChange(value.filter((v) => v !== name))} className="text-muted hover:text-fg">
              <CloseIcon width={12} height={12} />
            </button>
          )}
        </span>
      ))}
      <input
        id={id}
        list={listId}
        disabled={disabled}
        value={text}
        placeholder={value.length ? "" : t("tags.placeholder")}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
        className="min-w-24 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted/70"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
