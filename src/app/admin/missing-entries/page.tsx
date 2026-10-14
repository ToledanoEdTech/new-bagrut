"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ClipboardList, UserCog, Users } from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCardGrid } from "@/components/ui/StatCardGrid";
import { isFullAdmin } from "@/lib/permissions";
import type { MissingEntriesResponse, MissingEntryTask } from "@/lib/missing-entries";

function TaskRow({ task }: { task: MissingEntryTask }) {
  return (
    <li
      className={clsx(
        "flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3",
        task.isOverdue
          ? "border-red-100 bg-red-50/60"
          : "border-amber-100 bg-amber-50/50"
      )}
    >
      <div className="min-w-0">
        <p className="font-medium text-slate-800">{task.obligationLabel}</p>
        <p className="mt-0.5 text-sm text-slate-500">
          {task.subjectName}
          {task.gradeYear ? ` · ${task.gradeYear}` : ""}
          {task.classNames.length > 0
            ? ` · ${task.classNames.slice(0, 4).join(", ")}${
                task.classNames.length > 4 ? "…" : ""
              }`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
        <span
          className={clsx(
            "rounded-full px-2.5 py-0.5 text-xs font-bold text-white",
            task.isOverdue ? "bg-red-600" : "bg-amber-500"
          )}
        >
          {task.isOverdue ? "באיחור" : "מתקרב"}
        </span>
        <span className="text-slate-600">
          {task.missingStudentCount} תלמידים · יעד {task.gradeEntryDueDate}
        </span>
        <Link
          href={`/admin/grades/matrix?subjectId=${task.subjectId}`}
          className="text-xs font-medium text-primary-600 hover:underline"
        >
          להזנה ←
        </Link>
      </div>
    </li>
  );
}

type TaskSort = "dueDate" | "missingCount";

function compareTasks(a: MissingEntryTask, b: MissingEntryTask, sort: TaskSort) {
  if (sort === "missingCount") {
    const byMissing = b.missingStudentCount - a.missingStudentCount;
    if (byMissing !== 0) return byMissing;
  }
  return a.gradeEntryDueDate.localeCompare(b.gradeEntryDueDate);
}

export default function MissingEntriesPage() {
  const { session } = useAuth();
  const isAdmin = session ? isFullAdmin(session) : false;
  const { data, loading } = useApi<MissingEntriesResponse>(
    isAdmin ? "/api/admin/missing-entries" : null
  );
  const [tab, setTab] = useState<"teachers" | "tasks">("teachers");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [taskFilter, setTaskFilter] = useState<"all" | "overdue" | "upcoming">("all");
  const [taskSort, setTaskSort] = useState<TaskSort>("dueDate");

  const allTasks = useMemo(() => {
    if (!data) return [];
    const fromTeachers = data.teachers.flatMap((t) => t.tasks);
    const combined = [...fromTeachers, ...data.tasksWithoutTeacher];
    const seen = new Set<string>();
    return combined
      .filter((t) => {
        const key = `${t.obligationId}::${t.obligationLabel}::${t.gradeEntryDueDate}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => compareTasks(a, b, taskSort));
  }, [data, taskSort]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === "overdue") return allTasks.filter((t) => t.isOverdue);
    if (taskFilter === "upcoming") return allTasks.filter((t) => !t.isOverdue);
    return allTasks;
  }, [allTasks, taskFilter]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={UserCog}
        title="אין הרשאה"
        description="רק מנהלים יכולים לצפות בעמוד זה"
      />
    );
  }

  if (loading || !data) return <PageLoader />;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="מורים ומטלות שלא הוזנו"
        subtitle="מורים עם מועדי הזנה שחלפו או מתקרבים, ומטלות שעדיין חסרים בהן ציונים"
      />

      <StatCardGrid
        items={[
          {
            title: "מורים עם פערים",
            value: data.summary.teacherCount,
            icon: "users",
            color: data.summary.teacherCount > 0 ? "warning" : "primary",
          },
          {
            title: "מטלות באיחור",
            value: data.summary.overdueTaskCount,
            icon: "clipboard-check",
            color: data.summary.overdueTaskCount > 0 ? "danger" : "primary",
          },
          {
            title: "מטלות מתקרבות",
            value: data.summary.upcomingTaskCount,
            icon: "target",
            color: "warning",
          },
          {
            title: "ציונים חסרים באיחור",
            value: data.summary.overdueMissingStudents,
            icon: "award",
            color: data.summary.overdueMissingStudents > 0 ? "danger" : "primary",
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("teachers")}
            className={clsx(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === "teachers"
                ? "bg-primary-600 text-white shadow-soft"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            לפי מורים ({data.teachers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("tasks")}
            className={clsx(
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === "tasks"
                ? "bg-primary-600 text-white shadow-soft"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            לפי מטלות ({allTasks.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">מיון מטלות:</span>
          {(
            [
              ["dueDate", "תאריך יעד"],
              ["missingCount", "כמות חוסרים"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTaskSort(id)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                taskSort === id
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "teachers" && (
        <div className="space-y-3">
          {data.teachers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="אין מורים עם פערים"
              description="כל המורים הזינו את הציונים במועד, או שאין מועדים פתוחים"
            />
          ) : (
            data.teachers.map((t) => {
              const open = expanded.has(t.teacherId);
              return (
                <Card key={t.teacherId} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => toggle(t.teacherId)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-right hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">
                        {t.name || t.email}
                      </p>
                      <p className="text-sm text-slate-500" dir="ltr">
                        {t.email}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {t.overdueTaskCount > 0 && (
                          <span className="me-3 text-red-700">
                            {t.overdueTaskCount} באיחור · {t.overdueMissingStudents}{" "}
                            ציונים
                          </span>
                        )}
                        {t.upcomingTaskCount > 0 && (
                          <span className="text-amber-700">
                            {t.upcomingTaskCount} מתקרבות ·{" "}
                            {t.upcomingMissingStudents} ציונים
                          </span>
                        )}
                        {t.nearestDueDate && (
                          <span className="me-2 text-slate-400">
                            · הקרוב: {t.nearestDueDate}
                          </span>
                        )}
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </button>
                  {open && (
                    <ul className="space-y-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                      {[...t.tasks].sort((a, b) => compareTasks(a, b, taskSort)).map((task) => (
                        <TaskRow
                          key={`${task.obligationId}-${task.obligationLabel}-${task.gradeEntryDueDate}`}
                          task={task}
                        />
                      ))}
                    </ul>
                  )}
                </Card>
              );
            })
          )}

          {data.tasksWithoutTeacher.length > 0 && (
            <Card className="p-5">
              <h3 className="text-h3 text-slate-900">
                מטלות ללא מורה מוגדר ({data.tasksWithoutTeacher.length})
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                מקצועות אלה לא משויכים למורה בלוח המטלות
              </p>
              <ul className="mt-4 space-y-2">
                {[...data.tasksWithoutTeacher]
                  .sort((a, b) => compareTasks(a, b, taskSort))
                  .map((task) => (
                  <TaskRow
                    key={`${task.obligationId}-${task.obligationLabel}-${task.gradeEntryDueDate}`}
                    task={task}
                  />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "הכל"],
                ["overdue", "באיחור"],
                ["upcoming", "מתקרבות"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTaskFilter(id)}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  taskFilter === id
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="אין מטלות להצגה"
              description="אין מטלות שעומדות בסינון שנבחר"
            />
          ) : (
            <ul className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow
                  key={`${task.obligationId}-${task.obligationLabel}-${task.gradeEntryDueDate}`}
                  task={task}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
