"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ClipboardList,
  School,
  BookOpen,
  User,
  Layers,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ExportButton } from "@/components/ui/ExportButton";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { StudentCombobox } from "@/components/students/StudentCombobox";
import { hasAnyGradeWrite } from "@/lib/permissions";
import { CANONICAL_GRADE_YEARS } from "@/lib/grade-year";
import {
  buildPendingTasksSheet,
  buildPendingTasksSummarySheet,
  downloadExcel,
  exportTimestamp,
  pendingTaskRowsToExport,
} from "@/lib/excel-export";
import type { PendingTaskEntry, PendingTasksGroupBy } from "@/lib/pending-tasks";

type Student = {
  id: string;
  user: { name: string };
  class: { id: string; name: string } | null;
};

type ClassItem = {
  id: string;
  name: string;
  gradeYear: string | null;
};

type SubjectItem = {
  id: string;
  name: string;
  units: number | null;
  category: string;
};

type PendingTasksResponse = {
  entries: PendingTaskEntry[];
  total: number;
  overdueCount: number;
  studentCount: number;
  classCount: number;
};

const GROUP_OPTIONS: Array<{
  id: PendingTasksGroupBy;
  label: string;
  description: string;
  icon: typeof School;
}> = [
  {
    id: "gradeYear",
    label: "לפי שכבה",
    description: "כל החוסרים של תלמידי השכבה — כולל מטלות משנים קודמות שעדיין פתוחות",
    icon: Layers,
  },
  {
    id: "class",
    label: "לפי כיתה",
    description: "למי בכיתה חסר מה — כל התלמידים עם חובות פתוחות",
    icon: School,
  },
  {
    id: "subject",
    label: "לפי מקצוע",
    description: "חוסרים במקצוע נבחר בכל הכיתות והתלמידים",
    icon: BookOpen,
  },
  {
    id: "student",
    label: "לפי תלמיד",
    description: "מה חסר לתלמיד מסוים — רשימת חובות שנותרו",
    icon: User,
  },
];

function buildReportUrl(
  groupBy: PendingTasksGroupBy,
  filterValue: string
): string | null {
  if (!filterValue) return null;
  const params = new URLSearchParams({ groupBy });
  if (groupBy === "gradeYear") params.set("gradeYear", filterValue);
  else if (groupBy === "class") params.set("classId", filterValue);
  else if (groupBy === "subject") params.set("subjectId", filterValue);
  else if (groupBy === "student") params.set("studentId", filterValue);
  return `/api/reports/pending-tasks?${params.toString()}`;
}

function buildSummaryRows(
  groupBy: PendingTasksGroupBy,
  entries: PendingTaskEntry[]
): Array<{
  groupLabel: string;
  taskCount: number;
  studentCount: number;
  overdueCount: number;
}> {
  const groups = new Map<
    string,
    { taskCount: number; studentIds: Set<string>; overdueCount: number }
  >();

  for (const entry of entries) {
    let key: string;
    if (groupBy === "gradeYear") key = entry.obligationGradeYear ?? "ללא שכבה";
    else if (groupBy === "class") key = entry.className;
    else if (groupBy === "subject") key = entry.subjectLabel;
    else key = entry.taskLabel;

    const group = groups.get(key) ?? {
      taskCount: 0,
      studentIds: new Set<string>(),
      overdueCount: 0,
    };
    group.taskCount += 1;
    group.studentIds.add(entry.studentId);
    if (entry.isOverdue) group.overdueCount += 1;
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([groupLabel, stats]) => ({
      groupLabel,
      taskCount: stats.taskCount,
      studentCount: stats.studentIds.size,
      overdueCount: stats.overdueCount,
    }))
    .sort((a, b) => b.taskCount - a.taskCount || a.groupLabel.localeCompare(b.groupLabel, "he"));
}

export default function ReportsPage() {
  const { session } = useAuth();
  const canAccess = session ? hasAnyGradeWrite(session) : false;

  const { data: students = [], loading: studentsLoading } = useApi<Student[]>(
    canAccess ? "/api/students" : null
  );
  const { data: classes = [] } = useApi<ClassItem[]>(
    canAccess ? "/api/classes/list" : null
  );
  const { data: subjects = [] } = useApi<SubjectItem[]>(
    canAccess ? "/api/subjects" : null
  );

  const [groupBy, setGroupBy] = useState<PendingTasksGroupBy>("class");
  const [filterValue, setFilterValue] = useState("");
  const [preview, setPreview] = useState<PendingTasksResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const gradeYears = useMemo(() => [...CANONICAL_GRADE_YEARS], []);

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [classes]
  );

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [subjects]
  );

  const comboboxStudents = useMemo(
    () =>
      students
        .filter((s) => s.class)
        .map((s) => ({
          id: s.id,
          user: s.user,
          class: { name: s.class!.name },
        })),
    [students]
  );

  const filterLabel = useMemo(() => {
    if (!filterValue) return "";
    if (groupBy === "gradeYear") return filterValue;
    if (groupBy === "class") {
      return sortedClasses.find((c) => c.id === filterValue)?.name ?? "";
    }
    if (groupBy === "subject") {
      return sortedSubjects.find((s) => s.id === filterValue)?.name ?? "";
    }
    return students.find((s) => s.id === filterValue)?.user.name ?? "";
  }, [groupBy, filterValue, sortedClasses, sortedSubjects, students]);

  const canPreview = !!filterValue;

  const loadPreview = useCallback(async () => {
    const url = buildReportUrl(groupBy, filterValue);
    if (!url) return;

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error ?? "שגיאה בטעינת הדוח");
        setPreview(null);
        return;
      }
      setPreview(json as PendingTasksResponse);
    } catch {
      setPreviewError("שגיאת רשת");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [groupBy, filterValue]);

  async function handleExport() {
    const url = buildReportUrl(groupBy, filterValue);
    if (!url) return;

    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
      setPreviewError(json.error ?? "שגיאה בייצוא");
      return;
    }

    const data = json as PendingTasksResponse;
    const exportRows = pendingTaskRowsToExport(data.entries);
    const title = `חוסרים — ${filterLabel} (${data.total})`;
    const sheets = [
      buildPendingTasksSheet({
        title,
        rows: exportRows,
        hideStudentColumn: groupBy === "student",
      }),
    ];

    if (groupBy !== "student" && data.entries.length > 0) {
      const summaryDimension: PendingTasksGroupBy =
        groupBy === "class" ? "subject" : "class";
      sheets.unshift(
        buildPendingTasksSummarySheet({
          title: `סיכום — ${filterLabel}`,
          rows: buildSummaryRows(summaryDimension, data.entries),
        })
      );
    }

    const safeName = filterLabel.replace(/[^\w\u0590-\u05FF]+/g, "_").slice(0, 40);
    await downloadExcel(`חוסרים_${safeName}_${exportTimestamp()}.xlsx`, sheets);
  }

  function handleGroupChange(next: PendingTasksGroupBy) {
    setGroupBy(next);
    setFilterValue("");
    setPreview(null);
    setPreviewError(null);
  }

  if (!canAccess) {
    return (
      <>
        <PageHeader title="מרכז חוסרים" />
        <Alert variant="error" className="mt-6">
          אין הרשאה לצפייה במרכז החוסרים
        </Alert>
      </>
    );
  }

  if (studentsLoading && students.length === 0) {
    return (
      <>
        <PageHeader
          title="מרכז חוסרים"
          subtitle="ריכוז חובות וציונים שטרם הושלמו — לפי מקצוע, כיתה, שכבה או תלמיד"
        />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="מרכז חוסרים"
        subtitle="בחרו איך לחלק את התצוגה — וראו למי חסר מה. אפשר גם לייצא לאקסל"
      >
        <ExportButton
          onExport={handleExport}
          disabled={!canPreview || previewLoading}
          label="ייצוא לאקסל"
        />
      </PageHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GROUP_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = groupBy === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleGroupChange(option.id)}
              className={clsx(
                "rounded-2xl border p-4 text-right transition-all",
                active
                  ? "border-primary-300 bg-primary-50/80 ring-2 ring-primary-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{option.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                </div>
                <span
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-white text-primary-600 shadow-soft" : "bg-slate-100 text-slate-500"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Card variant="flat" className="mt-6 p-5">
        <h2 className="text-base font-semibold text-slate-800">בחרו איך לרכז את החוסרים</h2>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          {groupBy === "gradeYear" && (
            <div className="min-w-[200px] flex-1">
              <label className="label">שכבה</label>
              <Select
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">— בחר שכבה —</option>
                {gradeYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {groupBy === "class" && (
            <div className="min-w-[200px] flex-1">
              <label className="label">כיתה</label>
              <Select
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">— בחר כיתה —</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.gradeYear ? ` (${c.gradeYear})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {groupBy === "subject" && (
            <div className="min-w-[200px] flex-1">
              <label className="label">מקצוע</label>
              <Select
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">— בחר מקצוע —</option>
                {sortedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.units != null ? ` (${s.units} יח"ל)` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {groupBy === "student" && (
            <div className="min-w-[280px] flex-1">
              <label className="label">תלמיד</label>
              <StudentCombobox
                students={comboboxStudents}
                selectedId={filterValue}
                onSelect={(id) => {
                  setFilterValue(id);
                  setPreview(null);
                }}
                placeholder="חיפוש תלמיד לפי שם או כיתה..."
              />
            </div>
          )}

          <Button
            type="button"
            onClick={() => void loadPreview()}
            disabled={!canPreview || previewLoading}
          >
            <ClipboardList className="h-4 w-4" />
            {previewLoading ? "טוען..." : "הצג חוסרים"}
          </Button>
        </div>
      </Card>

      {previewError && (
        <Alert variant="error" className="mt-4" onClose={() => setPreviewError(null)}>
          {previewError}
        </Alert>
      )}

      {preview && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-slate-500">סה״כ חוסרים: </span>
              <strong className="text-slate-900">{preview.total}</strong>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <span className="text-slate-500">תלמידים עם חוסרים: </span>
              <strong className="text-slate-900">{preview.studentCount}</strong>
            </div>
            {groupBy !== "student" && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <span className="text-slate-500">כיתות: </span>
                <strong className="text-slate-900">{preview.classCount}</strong>
              </div>
            )}
            {preview.overdueCount > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{preview.overdueCount}</strong> באיחור
                </span>
              </div>
            )}
          </div>

          {preview.entries.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="אין חוסרים"
              description="לא נמצאו חובות או ציונים שטרם הושלמו עבור הבחירה הנוכחית"
            />
          ) : (
            <Card variant="flat" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50/80">
                    <tr className="border-b border-slate-200 text-slate-500">
                      {groupBy !== "student" && (
                        <th className="px-4 py-3 text-right text-xs font-semibold">תלמיד</th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-semibold">כיתה</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold">שכבת מטלה</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold">מקצוע</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold">מה חסר</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold">תאריך יעד</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.entries.slice(0, 100).map((entry, idx) => (
                      <tr
                        key={`${entry.studentId}-${entry.obligationId}-${entry.taskLabel}-${idx}`}
                        className={clsx(
                          "even:bg-slate-50/40",
                          entry.isOverdue && "bg-red-50/40"
                        )}
                      >
                        {groupBy !== "student" && (
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {entry.studentName}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-slate-600">{entry.className}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {entry.obligationGradeYear ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{entry.subjectLabel}</td>
                        <td className="px-4 py-2.5 text-slate-800">{entry.taskLabel}</td>
                        <td className="px-4 py-2.5 text-slate-600">{entry.dueDate}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              entry.isOverdue
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {entry.statusLabel}
                            {entry.isOverdue ? " · באיחור" : ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.entries.length > 100 && (
                <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                  מוצגות 100 שורות ראשונות מתוך {preview.entries.length}. ייצא לאקסל לקבלת הרשימה המלאה.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
