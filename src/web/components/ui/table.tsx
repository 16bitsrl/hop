import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// On a phone, `stack` turns every row into a small card: cells one under the other, headers hidden.
const stacked =
  "max-md:block max-md:[&_thead]:sr-only max-md:[&_tbody]:block max-md:[&_tr]:block max-md:[&_tr]:px-4 max-md:[&_tr]:py-3 " +
  "max-md:[&_td]:block max-md:[&_td]:max-w-none max-md:[&_td]:whitespace-normal max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-left";

/** Dense, quiet table. Wrap in a Card (flush) for the bordered look. */
export function Table({ className, stack, ...rest }: HTMLAttributes<HTMLTableElement> & { stack?: boolean }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", stack && stacked, className)} {...rest} />
    </div>
  );
}
export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}
export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line", className)} {...rest} />;
}
export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-subtle/60", className)} {...rest} />;
}
export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-line px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted",
        className,
      )}
      {...rest}
    />
  );
}
/** `label` names the cell on a phone when the table is stacked (the header row is hidden there). */
export function Td({ className, label, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { label?: ReactNode }) {
  return (
    <td className={cn("px-4 py-2.5 align-middle", className)} {...rest}>
      {label && <span className="mr-1.5 text-xs text-muted md:hidden">{label}:</span>}
      {children}
    </td>
  );
}
