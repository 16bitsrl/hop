import * as React from "react"
import { cn } from "@/lib/utils"

// On a phone, `stack` turns every row into a small card: cells one under the other, headers hidden.
const stacked =
  "max-md:block max-md:[&_thead]:sr-only max-md:[&_tbody]:block max-md:[&_tr]:block max-md:[&_tr]:px-4 max-md:[&_tr]:py-3 " +
  "max-md:[&_td]:block max-md:[&_td]:max-w-none max-md:[&_td]:whitespace-normal max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-left"

/** Quiet, dense table. Put it in a Card with `className="gap-0 py-0"` for the bordered look. */
function Table({ className, stack, ...props }: React.ComponentProps<"table"> & { stack?: boolean }) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", stack && stacked, className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors duration-150 hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-4 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

/** `label` names the cell on a phone when the table is stacked (the header row is hidden there). */
function TableCell({ className, label, children, ...props }: React.ComponentProps<"td"> & { label?: React.ReactNode }) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-4 py-2.5 align-middle [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    >
      {label && <span className="mr-1.5 text-xs text-muted-foreground md:hidden">{label}:</span>}
      {children}
    </td>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
