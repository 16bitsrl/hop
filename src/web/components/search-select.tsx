import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type SearchOption = { value: string; label: string };

/**
 * A select you can type into to filter, for long lists (people, folders).
 *   <SearchSelect id={id} value={ownerId} onValueChange={setOwnerId} options={users} empty={t("noMatch")} />
 * `id` ties it to a <label>; without a visible label, pass `aria-label`.
 */
export function SearchSelect({
  options,
  value,
  onValueChange,
  id,
  empty,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  options: SearchOption[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  /** Shown when nothing matches what was typed. */
  empty: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox<SearchOption>
      items={options}
      value={selected}
      disabled={disabled}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(o) => {
        if (o) onValueChange(o.value);
      }}
    >
      <ComboboxInput id={id} aria-label={ariaLabel} placeholder={placeholder} disabled={disabled} className={className ?? "w-full"} />
      <ComboboxContent>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList>
          {(o: SearchOption) => (
            <ComboboxItem key={o.value} value={o}>
              {o.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
