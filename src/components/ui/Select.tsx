import clsx from "clsx";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { FormField, fieldErrorClass } from "./FormField";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  wrapperClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, className, wrapperClassName, id, children, ...props },
  ref
) {
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, "-")}` : undefined);

  const select = (
    <select
      ref={ref}
      id={selectId}
      className={clsx("input", fieldErrorClass(error), className)}
      aria-invalid={error ? true : undefined}
      {...props}
    >
      {children}
    </select>
  );

  if (!label && !error && !hint) return select;

  return (
    <FormField
      label={label}
      error={error}
      hint={hint}
      required={required}
      htmlFor={selectId}
      className={wrapperClassName}
    >
      {select}
    </FormField>
  );
});
