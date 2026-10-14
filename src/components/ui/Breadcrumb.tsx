import clsx from "clsx";
import { ChevronLeft } from "lucide-react";

export type BreadcrumbItem = {
  label: string;
  active?: boolean;
  onClick?: () => void;
};

export function Breadcrumb({
  items,
  variant = "default",
}: {
  items: BreadcrumbItem[];
  variant?: "default" | "light";
}) {
  const isLight = variant === "light";

  return (
    <nav
      className={clsx(
        "mb-4 flex flex-wrap items-center gap-1.5 text-sm",
        isLight ? "text-primary-100/80" : "text-slate-500"
      )}
      aria-label="ניווט"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronLeft
              className={clsx("h-3.5 w-3.5 shrink-0", isLight ? "text-primary-200/60" : "text-slate-300")}
              aria-hidden
            />
          )}
          {item.onClick && !item.active ? (
            <button
              type="button"
              onClick={item.onClick}
              className={clsx(
                "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isLight
                  ? "text-primary-50 hover:text-white focus-visible:ring-white/50"
                  : "text-primary-600 hover:text-primary-700 focus-visible:ring-primary-400"
              )}
            >
              {item.label}
            </button>
          ) : (
            <span
              className={clsx(
                item.active
                  ? isLight
                    ? "font-semibold text-white"
                    : "font-semibold text-slate-900"
                  : isLight
                    ? "text-primary-100/70"
                    : "text-slate-500"
              )}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
