import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
};

/** Shared with `.btn-primary` / `.btn-secondary` in globals.css — keep in sync */
export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-l from-primary-600 to-brand-600 text-white shadow-glow hover:from-primary-500 hover:to-brand-500 hover:shadow-glow-lg focus-visible:ring-primary-400",
  secondary:
    "border border-slate-200 bg-white/90 text-slate-700 shadow-soft backdrop-blur-sm hover:border-primary-200 hover:bg-white hover:text-primary-700 hover:shadow-card focus-visible:ring-primary-300",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-primary-300",
  danger:
    "bg-gradient-to-l from-red-600 to-rose-600 text-white shadow-[0_8px_24px_-6px_rgba(220,38,38,0.45)] hover:from-red-500 hover:to-rose-500 focus-visible:ring-red-300",
};

const variants = buttonVariants;

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-base rounded-xl gap-2",
  lg: "px-5 py-3 text-base rounded-xl gap-2.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
