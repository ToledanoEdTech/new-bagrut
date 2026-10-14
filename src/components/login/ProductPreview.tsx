"use client";

import clsx from "clsx";
import { BookOpen, ClipboardCheck, Users } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";

const STATS = [
  { label: "תלמידים", value: "248", icon: Users, color: "primary" as const },
  { label: "מקצועות", value: "12", icon: BookOpen, color: "success" as const },
  { label: "ציונים", value: "1.4k", icon: ClipboardCheck, color: "warning" as const },
];

const STAT_STYLES = {
  primary: "bg-primary-50 text-primary-600 ring-primary-100",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  warning: "bg-amber-50 text-amber-600 ring-amber-100",
};

export function ProductPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={clsx(
        "relative mx-auto w-full",
        compact ? "max-w-[19rem]" : "max-w-md",
        !compact && "lg:-rotate-1 lg:shadow-card-hover"
      )}
      aria-hidden="true"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card ring-1 ring-slate-100/80">
        <div className="relative overflow-hidden px-4 py-3.5">
          <div className="absolute inset-0 bg-gradient-to-l from-primary-700 via-brand-700 to-primary-800" />
          <div className="absolute inset-0 bg-mesh-hero opacity-50" />
          <div className="relative">
            <p className="text-sm font-bold text-white">דשבורד מנהל</p>
            <p className="mt-0.5 text-xs text-primary-100/85">סקירה כללית של מערכת מעקב הבגרות</p>
          </div>
        </div>

        <div className={clsx("space-y-3", compact ? "p-3" : "p-4")}>
          <div className="grid grid-cols-3 gap-2">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-2 text-center"
                >
                  <span
                    className={clsx(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset",
                      STAT_STYLES[stat.color]
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="mt-1.5 text-sm font-extrabold text-slate-900">{stat.value}</p>
                  <p className="text-[10px] font-medium text-slate-500">{stat.label}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">מתמטיקה — 5 יח״ל</p>
                <p className="mt-0.5 text-xs text-slate-500">6 מתוך 9 חובות הושלמו</p>
              </div>
              <span className="badge-success shrink-0">82</span>
            </div>
            <ProgressBar value={68} className="mt-2.5" color="primary" />
          </div>

          {!compact && (
            <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">אנגלית — 5 יח״ל</p>
                  <p className="mt-0.5 text-xs text-slate-500">4 מתוך 7 חובות הושלמו</p>
                </div>
                <span className="badge-warning shrink-0">74</span>
              </div>
              <ProgressBar value={57} className="mt-2.5" color="warning" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
