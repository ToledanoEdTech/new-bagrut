import clsx from "clsx";
import { Award } from "lucide-react";
import type { OutstandingBagrutTier } from "@/lib/outstanding-bagrut-core";

type OutstandingBagrutBadgeProps = {
  className?: string;
  size?: "sm" | "md";
  /**
   * Use "onDark" when the badge sits on a dark/colored background (e.g. the
   * primary gradient hero), so it renders as a solid high-contrast pill.
   */
  variant?: "default" | "onDark";
  /**
   * רמת המועמדות שקובעת את צבע התגית. אם לא מועבר — ברירת מחדל "yellow"
   * לשמירת תאימות לאחור.
   */
  tier?: OutstandingBagrutTier;
};

const TIER_STYLES: Record<OutstandingBagrutTier, { default: string; onDark: string }> = {
  red: {
    default: "border border-red-200 bg-gradient-to-l from-red-50 to-rose-50 text-red-800 ring-red-100",
    onDark: "border border-white/40 bg-white text-red-700 ring-white/40 shadow-sm",
  },
  yellow: {
    default:
      "border border-amber-200 bg-gradient-to-l from-amber-50 to-yellow-50 text-amber-800 ring-amber-100",
    onDark: "border border-white/40 bg-white text-amber-700 ring-white/40 shadow-sm",
  },
  green: {
    default:
      "border border-emerald-200 bg-gradient-to-l from-emerald-50 to-green-50 text-emerald-800 ring-emerald-100",
    onDark: "border border-white/40 bg-white text-emerald-700 ring-white/40 shadow-sm",
  },
};

export function OutstandingBagrutBadge({
  className,
  size = "md",
  variant = "default",
  tier = "yellow",
}: OutstandingBagrutBadgeProps) {
  const tierStyle = TIER_STYLES[tier];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold ring-1 ring-inset",
        variant === "onDark" ? tierStyle.onDark : tierStyle.default,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
    >
      <Award className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      מועמד לבגרות מצטיינת
    </span>
  );
}
