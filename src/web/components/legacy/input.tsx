import { createContext, useContext, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full rounded-md border border-input bg-card px-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 " +
  "transition-colors hover:border-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 " +
  "aria-invalid:border-destructive aria-invalid:focus:ring-destructive/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70";

const FieldContext = createContext<{ id: string; describedBy?: string; invalid: boolean } | null>(null);

/** aria-describedby and aria-invalid for the control a surrounding <Field> labels (matched by id). */
export function useFieldAria(id: string | undefined) {
  const field = useContext(FieldContext);
  if (!field || field.id !== id) return {};
  return { "aria-describedby": field.describedBy, "aria-invalid": field.invalid || undefined };
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-8", className)} {...useFieldAria(rest.id)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 py-1.5", className)} {...useFieldAria(rest.id)} {...rest} />;
}

export const controlClass = control;

/**
 * Label + control + hint/error, wired together. Input, Textarea and Select given the id get
 * aria-describedby (hint or error) and aria-invalid (error) on their own; spread the second
 * argument onto any other control.
 *   <Field label="Email">{(id) => <Input id={id} type="email" />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string, aria: { "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const describedBy = error || hint ? noteId : undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {children(id, { "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
        {error ? (
          <p id={noteId} role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={noteId} className="text-[13px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
