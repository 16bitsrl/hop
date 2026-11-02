import { useId, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** On/off setting with its label and optional description; the switch sits on the right. */
export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <Label id={`${id}-label`} htmlFor={id} className="text-sm leading-snug">
          {label}
        </Label>
        {description && (
          <p id={`${id}-desc`} className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v)}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </div>
  );
}

/** Checkbox with a clickable label next to it. */
export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v)} disabled={disabled} aria-labelledby={`${id}-label`} />
      <Label id={`${id}-label`} htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
