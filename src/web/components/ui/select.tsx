import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { controlClass, useFieldAria } from "./input";

/** Native select with the same look as Input. Pass <option> children. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        controlClass,
        "h-8 appearance-none bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat pr-7",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        className,
      )}
      {...useFieldAria(rest.id)}
      {...rest}
    >
      {children}
    </select>
  );
}
