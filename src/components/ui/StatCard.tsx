import { LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { KeyboardEvent, MouseEvent } from "react";

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "primary",
  onClick,
  clickHint,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: "primary" | "success" | "warning" | "info" | "danger";
  onClick?: () => void;
  clickHint?: string;
}) {
  const styles = {
    primary: {
      icon: "bg-gradient-to-br from-primary-500 to-brand-600 text-white shadow-glow",
      bar: "from-primary-500 to-brand-600",
      glow: "bg-primary-400/20",
    },
    success: {
      icon: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.5)]",
      bar: "from-emerald-500 to-teal-600",
      glow: "bg-emerald-400/20",
    },
    warning: {
      icon: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-[0_8px_20px_-6px_rgba(245,158,11,0.5)]",
      bar: "from-amber-500 to-orange-600",
      glow: "bg-amber-400/20",
    },
    info: {
      icon: "bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-[0_8px_20px_-6px_rgba(14,165,233,0.5)]",
      bar: "from-sky-500 to-blue-600",
      glow: "bg-sky-400/20",
    },
    danger: {
      icon: "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-[0_8px_20px_-6px_rgba(239,68,68,0.5)]",
      bar: "from-red-500 to-rose-600",
      glow: "bg-red-400/20",
    },
  }[color];

  const interactive = !!onClick;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (!onClick) return;
    e.preventDefault();
    onClick();
  }

  return (
    <div
      className={clsx(
        "group relative h-full w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-soft transition-all duration-300 ease-out",
        interactive &&
          "cursor-pointer shadow-card hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? clickHint ?? title : undefined}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <span
        className={clsx(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-l opacity-80",
          styles.bar
        )}
      />
      <div
        className={clsx(
          "pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-60",
          styles.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1.5 truncate text-sm text-slate-400">{subtitle}</p>
          )}
          {interactive && (
            <p className="mt-1.5 text-xs font-medium text-sky-600 opacity-80 group-hover:opacity-100">
              {clickHint ?? "לחץ לפירוט"}
            </p>
          )}
        </div>
        <div
          className={clsx(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3",
            styles.icon
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
