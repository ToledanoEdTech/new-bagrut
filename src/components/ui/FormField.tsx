import clsx from "clsx";
import type { ReactNode } from "react";

type FormFieldProps = {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
};

export function FormField({
  label,
  error,
  hint,
  required,
  children,
  className,
  htmlFor,
}: FormFieldProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function fieldErrorClass(error?: string) {
  return clsx(error && "border-red-300 focus:border-red-500 focus:ring-red-100");
}
