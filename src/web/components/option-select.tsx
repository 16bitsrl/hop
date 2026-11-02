import type { ReactNode } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type Option<T extends string = string> = { value: T; label: ReactNode; disabled?: boolean }

// "" (often "any" in filters) would read as "nothing selected": it travels as a sentinel inside.
const EMPTY = "__empty__"
const enc = (v: string) => (v === "" ? EMPTY : v)
const dec = <T extends string>(v: string) => (v === EMPTY ? "" : v) as T

/**
 * A select for a plain list of options (the common case), built on the shadcn Select.
 *   <OptionSelect id={id} value={role} onValueChange={setRole} options={[{ value: "admin", label: "Admin" }]} />
 * `id` ties it to a <label>; without a visible label, pass `aria-label`.
 */
export function OptionSelect<T extends string>({
  options,
  value,
  onValueChange,
  id,
  disabled,
  className,
  size,
  placeholder,
  "aria-label": ariaLabel,
}: {
  options: Option<T>[]
  value: T
  onValueChange: (value: T) => void
  id?: string
  disabled?: boolean
  className?: string
  size?: "sm" | "default"
  placeholder?: ReactNode
  "aria-label"?: string
}) {
  return (
    <Select<string>
      items={options.map((o) => ({ value: enc(o.value), label: o.label }))}
      value={enc(value)}
      disabled={disabled}
      onValueChange={(v) => {
        if (v !== null) onValueChange(dec<T>(v))
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className} size={size}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={enc(o.value)} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
