"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

type AlertVariant = "info" | "success" | "warning" | "error";

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
};

const styles: Record<AlertVariant, { container: string; icon: string }> = {
  info: {
    container: "border-primary-200 bg-primary-50 text-primary-900",
    icon: "text-primary-600",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-600",
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "text-amber-600",
  },
  error: {
    container: "border-red-200 bg-red-50 text-red-900",
    icon: "text-red-600",
  },
};

const icons: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function Alert({
  variant = "info",
  title,
  children,
  onClose,
  className,
}: AlertProps) {
  const Icon = icons[variant];
  const style = styles[variant];

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={clsx(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        style.container,
        className
      )}
    >
      <Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", style.icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={clsx(title && "mt-0.5")}>{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
