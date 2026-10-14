import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("animate-pulse rounded-lg bg-slate-200/80", className)} />
  );
}
