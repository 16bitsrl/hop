import { CircleAlertIcon, CircleCheckIcon, CirclePauseIcon, ClockAlertIcon, LockIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useFieldAria } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { Option } from "@/components/option-select";
import { folderTree, type Folder, type LinkState, type TagRef } from "./api";

export function TagChip({ tag }: { tag: Pick<TagRef, "name" | "color"> }) {
  return (
    <Badge variant="outline" className="gap-1.5 bg-muted">
      <span className="size-2 rounded-full" style={{ background: tag.color ?? "var(--muted-foreground)" }} aria-hidden="true" />
      {tag.name}
    </Badge>
  );
}

const stateStyle = {
  active: { variant: "success", Icon: CircleCheckIcon },
  disabled: { variant: "secondary", Icon: CirclePauseIcon },
  expired: { variant: "warning", Icon: ClockAlertIcon },
  broken: { variant: "destructive", Icon: CircleAlertIcon },
  protected: { variant: "info", Icon: LockIcon },
} as const;

/** Badges for what is notable about a link. "Active" only shows when nothing else does. */
export function StateBadges({ states }: { states: LinkState[] }) {
  const { t } = useTranslation("links");
  return (
    <>
      {states.map((s) => {
        const { variant, Icon } = stateStyle[s];
        return (
          <Badge key={s} variant={variant}>
            <Icon data-icon="inline-start" aria-hidden="true" />
            {t(`states.${s}`)}
          </Badge>
        );
      })}
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
  const aria = useFieldAria(id);

  function add(raw: string) {
    const name = raw.trim();
    if (name && !value.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
    setText("");
  }

  return (
    <div
      data-slot="tag-input"
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1 text-sm transition-[border-color,box-shadow] duration-150 dark:bg-muted/40",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {value.map((name) => (
        <span key={name} className="inline-flex h-5 items-center gap-1 rounded-md bg-muted pr-0.5 pl-1.5 text-xs font-medium">
          {name}
          {!disabled && (
            <button
              type="button"
              aria-label={t("tags.remove", { name })}
              onClick={() => onChange(value.filter((v) => v !== name))}
              className="relative rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground after:absolute after:-inset-2 after:content-['']"
            >
              <XIcon className="size-3" aria-hidden="true" />
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
        {...aria}
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
        className="h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

/** Folders as select options in tree order; nested ones read as "Parent / Child". */
export function folderOptions(folders: Folder[], first: Option[] = []): Option[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (f: Folder): string => {
    const parent = f.parentId ? byId.get(f.parentId) : undefined;
    return parent ? `${path(parent)} / ${f.name}` : f.name;
  };
  return [...first, ...folderTree(folders).map((f) => ({ value: f.id, label: path(f) }))];
}
