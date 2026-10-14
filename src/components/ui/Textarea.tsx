import clsx from "clsx";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { FormField, fieldErrorClass } from "./FormField";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, className, wrapperClassName, id, ...props },
  ref
) {
  const textareaId = id ?? (label ? `textarea-${label.replace(/\s+/g, "-")}` : undefined);

  const textarea = (
    <textarea
      ref={ref}
      id={textareaId}
      className={clsx("input min-h-[100px] resize-y", fieldErrorClass(error), className)}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );

  if (!label && !error && !hint) return textarea;

  return (
    <FormField
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={textareaId}
      className={wrapperClassName}
    >
      {textarea}
    </FormField>
  );
});
