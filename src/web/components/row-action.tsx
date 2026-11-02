import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The one way to show an action on a row of a table or list: an icon button, named by `label`
 * (tooltip and screen readers). Destructive actions stay quiet and turn red on hover.
 * When `disabled`, `disabledReason` explains why on hover.
 */
export function RowAction({
  label,
  icon,
  onClick,
  danger,
  disabled,
  disabledReason,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const button = (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("text-muted-foreground", danger && "hover:bg-destructive-soft hover:text-destructive")}
    />
  );
  // A disabled button gets no pointer events, so its tooltip would never show: explain on a wrapper instead.
  if (disabled) {
    return (
      <span title={disabledReason ?? label} className="inline-flex">
        <Button size="icon-sm" variant="ghost" aria-label={label} disabled className="text-muted-foreground">
          {icon}
        </Button>
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={button}>{icon}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
