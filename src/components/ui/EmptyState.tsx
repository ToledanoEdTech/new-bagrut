import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "./Button";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  actionHref,
  onAction,
  className,
}: EmptyStateProps) {
  let actionNode = action;
  if (!actionNode && actionLabel) {
    if (actionHref) {
      actionNode = (
        <Link href={actionHref}>
          <Button variant="primary">{actionLabel}</Button>
        </Link>
      );
    } else if (onAction) {
      actionNode = (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      );
    }
  }

  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-soft ring-1 ring-slate-100">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
      )}
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-2 max-w-md text-base text-slate-500">{description}</p>}
      {actionNode && <div className="mt-5">{actionNode}</div>}
    </div>
  );
}
