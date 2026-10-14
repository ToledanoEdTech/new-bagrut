import clsx from "clsx";

export function ProgressBar({
  value,
  className,
  color = "primary",
}: {
  value: number;
  className?: string;
  color?: "primary" | "success" | "warning" | "onDark";
}) {
  const fills = {
    primary: "from-primary-500 to-brand-600",
    success: "from-emerald-500 to-teal-500",
    warning: "from-amber-500 to-orange-500",
    /** High-contrast fill for dark teal/brand hero backgrounds */
    onDark: "from-amber-300 to-yellow-200",
  };

  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className={clsx(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200/70 shadow-inner",
        className
      )}
    >
      <div
        className={clsx(
          "relative h-full rounded-full bg-gradient-to-l transition-all duration-700 ease-out",
          fills[color]
        )}
        style={{ width: `${clamped}%` }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </div>
  );
}
