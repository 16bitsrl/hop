import { useId, type ReactNode } from "react";
import { Field, FieldAriaProvider, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

type Aria = { "aria-describedby"?: string; "aria-invalid"?: true };

/**
 * Label + control + hint or error, wired together. Input, Textarea and SelectTrigger given the id
 * pick up aria-describedby and aria-invalid on their own; spread the second argument onto any
 * other control.
 *   <FormField label="Email" hint="...">{(id) => <Input id={id} type="email" />}</FormField>
 */
export function FormField({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string, aria: Aria) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const describedBy = error || hint ? noteId : undefined;
  return (
    <FieldAriaProvider value={{ id, describedBy, invalid: !!error }}>
      <Field className={className} data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {children(id, { "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
        {error ? <FieldError id={noteId}>{error}</FieldError> : hint ? <FieldDescription id={noteId}>{hint}</FieldDescription> : null}
      </Field>
    </FieldAriaProvider>
  );
}
