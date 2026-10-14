import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

type UnsavedChangesBannerProps = {
  visible: boolean;
  message?: string;
  children?: ReactNode;
  className?: string;
};

export function UnsavedChangesBanner({
  visible,
  message = "יש שינויים לא שמורים",
  children,
  className,
}: UnsavedChangesBannerProps) {
  if (!visible) return null;

  return (
    <div
      className={clsx(
        "sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:-mx-8 lg:px-8",
        className
      )}
      role="status"
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        {message}
      </div>
      {children}
    </div>
  );
}
