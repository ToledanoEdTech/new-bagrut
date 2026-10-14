import { Loader2 } from "lucide-react";
import { Skeleton } from "./Skeleton";

export function PageLoader({
  variant = "spinner",
}: {
  variant?: "spinner" | "skeleton" | "dashboard" | "table";
}) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="card overflow-hidden">
        <Skeleton className="h-12 rounded-none" />
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mx-4 my-3 h-10 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "skeleton") {
    return (
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
    </div>
  );
}
