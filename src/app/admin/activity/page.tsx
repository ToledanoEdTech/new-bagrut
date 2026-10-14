"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  History,
  RefreshCw,
  UserCog,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { isFullAdmin } from "@/lib/permissions";
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ActivityEvent,
} from "@/lib/activity-log-types";

type ActivityResponse = {
  events: ActivityEvent[];
  error?: string;
};

type FilterKey = "all" | ActivityCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "הכול" },
  { key: "grades", label: ACTIVITY_CATEGORY_LABELS.grades },
  { key: "subjects", label: ACTIVITY_CATEGORY_LABELS.subjects },
  { key: "staff", label: ACTIVITY_CATEGORY_LABELS.staff },
];

function categoryIcon(category: ActivityCategory) {
  switch (category) {
    case "grades":
      return ClipboardList;
    case "subjects":
      return BookOpen;
    case "staff":
      return UserCog;
    default:
      return History;
  }
}

function categoryTone(category: ActivityCategory) {
  switch (category) {
    case "grades":
      return "bg-primary-50 text-primary-700 ring-primary-100";
    case "subjects":
      return "bg-sky-50 text-sky-700 ring-sky-100";
    case "staff":
      return "bg-violet-50 text-violet-700 ring-violet-100";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-100";
  }
}

function formatWhen(iso: string): { date: string; time: string; relative: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "—", time: "", relative: "" };
  }
  const date = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  let relative = "";
  if (mins < 1) relative = "עכשיו";
  else if (mins < 60) relative = `לפני ${mins} דק׳`;
  else if (mins < 60 * 24) relative = `לפני ${Math.floor(mins / 60)} שע׳`;
  else if (mins < 60 * 24 * 7) relative = `לפני ${Math.floor(mins / (60 * 24))} ימים`;

  return { date, time, relative };
}

function groupByDay(events: ActivityEvent[]): Array<{ day: string; items: ActivityEvent[] }> {
  const map = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const day = new Date(event.at).toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const list = map.get(day) ?? [];
    list.push(event);
    map.set(day, list);
  }
  return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon = categoryIcon(event.category);
  const when = formatWhen(event.at);

  return (
    <li className="flex gap-3 border-b border-slate-100 px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-5">
      <span
        className={clsx(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
          categoryTone(event.category)
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
              categoryTone(event.category)
            )}
          >
            {ACTIVITY_CATEGORY_LABELS[event.category]}
          </span>
          {when.relative && (
            <span className="text-xs text-slate-400">{when.relative}</span>
          )}
        </div>
        <p className="mt-1 text-[15px] font-medium leading-snug text-slate-800">
          {event.summaryHe}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {event.actorName || event.actorEmail}
          </span>
          <span className="text-slate-300">·</span>
          <span>
            {when.date} {when.time}
          </span>
        </p>
      </div>
    </li>
  );
}

export default function ActivityPage() {
  const { session } = useAuth();
  const isAdmin = session ? isFullAdmin(session) : false;
  const [filter, setFilter] = useState<FilterKey>("all");

  const apiKey = isAdmin
    ? filter === "all"
      ? "/api/admin/activity?limit=100"
      : `/api/admin/activity?limit=100&category=${filter}`
    : null;

  const { data, loading, error, mutate } = useApi<ActivityResponse>(apiKey);

  const events = data?.events ?? [];
  const groups = useMemo(() => groupByDay(events), [events]);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="שינויים אחרונים"
          subtitle="יומן פעילות במערכת — למנהלים בלבד"
        />
        <EmptyState
          icon={History}
          title="אין הרשאה"
          description="רק מנהלים יכולים לצפות ביומן השינויים."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="שינויים אחרונים"
        subtitle="הזנות ציונים, שינויי מקצועות ומטלות, ועדכוני צוות"
      >
        <Button
          type="button"
          variant="secondary"
          onClick={() => void mutate()}
          disabled={loading}
        >
          <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
          רענון
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              filter === f.key
                ? "bg-primary-600 text-white shadow-soft"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <Card className="p-6 text-center text-red-600">{error}</Card>
      ) : events.length === 0 ? (
        <EmptyState
          icon={History}
          title="אין שינויים עדיין"
          description={
            data?.error
              ? data.error
              : "כאן יופיעו הזנות ציונים, שינויי מקצועות ומטלות, ועדכוני צוות מרגע זה ואילך."
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.day}>
              <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">
                {group.day}
              </h2>
              <Card className="overflow-hidden p-0">
                <ul>
                  {group.items.map((event) => (
                    <ActivityRow key={event.id} event={event} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
