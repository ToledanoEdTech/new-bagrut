import clsx from "clsx";
import { Cpu } from "lucide-react";

type HightechBagrutBadgeProps = {
  className?: string;
  size?: "sm" | "md";
  /**
   * Use "onDark" when the badge sits on a dark/colored background (e.g. the
   * primary gradient hero), so it renders as a solid high-contrast pill.
   */
  variant?: "default" | "onDark";
};

export function HightechBagrutBadge({
  className,
  size = "md",
  variant = "default",
}: HightechBagrutBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset",
        variant === "onDark"
          ? "border border-white/40 bg-white text-sky-700 ring-white/40 shadow-sm"
          : "border border-sky-200 bg-gradient-to-l from-sky-50 to-cyan-50 text-sky-800 ring-sky-100",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
    >
      <Cpu className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      מועמד לבגרות הייטק
    </span>
  );
}
