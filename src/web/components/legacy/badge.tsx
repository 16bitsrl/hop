import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "green" | "amber" | "red" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  green: "bg-success-soft text-success border-transparent",
  amber: "bg-warning-soft text-warning border-transparent",
  red: "bg-destructive-soft text-destructive border-transparent",
  blue: "bg-info-soft text-info border-transparent",
};

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
