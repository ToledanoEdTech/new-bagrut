import clsx from "clsx";
import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  /** default = static panel (no hover lift). interactive = clickable surface. */
  variant?: "default" | "interactive" | "flat";
  className?: string;
};

export function Card({ children, variant = "default", className }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200/70 bg-white transition-all duration-300 ease-out",
        variant === "default" && "shadow-soft",
        variant === "interactive" &&
          "cursor-pointer shadow-card hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-card-hover",
        variant === "flat" && "shadow-none",
        className
      )}
    >
      {children}
    </div>
  );
}
