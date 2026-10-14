import clsx from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";
import { FormField, fieldErrorClass } from "./FormField";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, className, wrapperClassName, id, ...props },
  ref
) {
  const inputId = id ?? (label ? `input-${label.replace(/\s+/g, "-")}` : undefined);

  const input = (
    <input
      ref={ref}
      id={inputId}
      className={clsx("input", fieldErrorClass(error), className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
      {...props}
    />
  );

  if (!label && !error && !hint) return input;

  return (
    <FormField
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={inputId}
      className={wrapperClassName}
    >
      {input}
    </FormField>
  );
});
