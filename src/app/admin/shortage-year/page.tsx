"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Layers,
  School,
  Search,
  User,
} from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { StudentCombobox } from "@/components/students/StudentCombobox";
import { useToast } from "@/components/ui/Toast";
import { downloadFromApi } from "@/lib/download-file";
import { hasAnyGradeWrite } from "@/lib/permissions";
import { CANONICAL_GRADE_YEARS } from "@/lib/grade-year";
import type {
  ShortageYearEntry,
  ShortageYearGroupBy,
  ShortageYearReport,
  ShortageYearScope,
} from "@/lib/shortage-year-report";

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

type DetailTab = "remaining" | "done" | "all";

const GROUP_OPTIONS: Array<{
  id: ShortageYearGroupBy;
  label: string;
  description: string;
  icon: typeof School;
}> = [
  {
    id: "gradeYear",
    label: "לפי שכבה",
    description: "כל הכיתות והתלמידים בשכבה שנבחרה",
    icon: Layers,
  },
  {
    id: "class",
    label: "לפי כיתה",
    description: "סיכום לכל תלמיד בכיתה — מה הושלם ומה נותר",
    icon: School,
  },
  {
    id: "student",
    label: "לפי תלמיד",
    description: "פירוט מטלות של תלמיד אחד",
    icon: User,
  },
];

const YEAR_OPTIONS: Array<{
  id: ShortageYearScope;
  label: string;
  description: string;
}> = [
  {
    id: "previous",
    label: "שנה שעברה",
    description: "מטלות משכבות קודמות — מה כבר נעשה ומה עדיין פתוח",
  },
  {
    id: "current",
    label: "השנה הנוכחית",
    description: "מטלות של השכבה הנוכחית בלבד",
  },
  {
    id: "all",
    label: "דוח כולל",
    description: "כל המטלות שחלות עד כה — שנים קודמות והשנה יחד",
  },
];

function buildReportUrl(
  groupBy: ShortageYearGroupBy,
  yearScope: ShortageYearScope,
  filterValue: string,
  exportFormat?: "xlsx" | "pdf"
): string | null {
  if (!filterValue) return null;
  const params = new URLSearchParams({ groupBy, yearScope });
  if (groupBy === "gradeYear") params.set("gradeYear", filterValue);
  else if (groupBy === "class") params.set("classId", filterValue);
  else params.set("studentId", filterValue);
  if (exportFormat) {
    params.set("format", exportFormat);
    return `/api/reports/shortage-year/export?${params.toString()}`;
  }
  return `/api/reports/shortage-year?${params.toString()}`;
}

function ChoiceCard({
  active,
  title,
  description,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon?: typeof School;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-2xl border p-4 text-right transition-all",
        active
          ? "border-primary-300 bg-primary-50/80 ring-2 ring-primary-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {Icon && (
          <span
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              active ? "bg-white text-primary-600 shadow-soft" : "bg-slate-100 text-slate-500"
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </button>
  );
}

export default function ShortageYearPage() {
  const { session } = useAuth();
  const toast = useToast();
  const canAccess = session ? hasAnyGradeWrite(session) : false;

  const { data: students = [], loading: studentsLoading } = useApi<Student[]>(
    canAccess ? "/api/students" : null
  );
  const { data: classes = [] } = useApi<ClassItem[]>(
    canAccess ? "/api/classes/list" : null
  );

  const [groupBy, setGroupBy] = useState<ShortageYearGroupBy>("gradeYear");
  const [yearScope, setYearScope] = useState<ShortageYearScope>("previous");
  const [filterValue, setFilterValue] = useState("");
  const [report, setReport] = useState<ShortageYearReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("remaining");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [classes]
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

  const canPreview = !!filterValue;

  const resetPreview = () => {
    setReport(null);
    setError(null);
    setQuery("");
  };

  const loadReport = useCallback(async () => {
    const url = buildReportUrl(groupBy, yearScope, filterValue);
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "שגיאה בטעינת הדוח");
        setReport(null);
        return;
      }
      setReport(json as ShortageYearReport);
      setDetailTab("remaining");
    } catch {
      setError("שגיאת רשת");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [groupBy, yearScope, filterValue]);

  async function handleExport(format: "xlsx" | "pdf") {
    const url = buildReportUrl(groupBy, yearScope, filterValue, format);
    if (!url) return;
    setExporting(format);
    try {
      await downloadFromApi(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הייצוא נכשל");
    } finally {
      setExporting(null);
    }
  }

  const filteredEntries = useMemo(() => {
    if (!report) return [];
    const source =
      detailTab === "remaining"
        ? report.entries.filter((e) => !e.isComplete)
        : detailTab === "done"
          ? report.entries.filter((e) => e.isComplete)
          : report.entries;
    const q = query.trim();
    if (!q) return source;
    return source.filter(
      (e) =>
        e.studentName.includes(q) ||
        e.className.includes(q) ||
        e.subjectLabel.includes(q) ||
        e.taskLabel.includes(q) ||
        e.statusLabel.includes(q)
    );
  }, [report, detailTab, query]);

  if (!canAccess) {
    return (
      <>
        <PageHeader title="דוח חוסרים לפי שנה" />
        <Alert variant="error" className="mt-6">
          אין הרשאה לצפייה בדוח החוסרים
        </Alert>
      </>
    );
  }

  if (studentsLoading && students.length === 0) {
    return (
      <>
        <PageHeader
          title="דוח חוסרים לפי שנה"
          subtitle="חוסרים והשלמות לפי שכבה, כיתה או תלמיד — שנה שעברה, השנה או דוח כולל"
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
        title="דוח חוסרים לפי שנה"
        subtitle="בחרו שכבה, כיתה או תלמיד — ואז האם לראות מטלות משנה שעברה, מהשנה או את הכל"
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleExport("xlsx")}
            disabled={!canPreview || loading || exporting !== null}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting === "xlsx" ? "מייצא..." : "ייצוא לאקסל"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleExport("pdf")}
            disabled={!canPreview || loading || exporting !== null}
          >
            <FileText className="h-4 w-4" />
            {exporting === "pdf" ? "מייצא..." : "ייצוא PDF"}
          </Button>
        </div>
      </PageHeader>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">1. לפי מי לרכז?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {GROUP_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              active={groupBy === option.id}
              title={option.label}
              description={option.description}
              icon={option.icon}
              onClick={() => {
                setGroupBy(option.id);
                setFilterValue("");
                resetPreview();
              }}
            />
          ))}
        </div>
      </section>

      <Card variant="flat" className="mt-5 p-5">
        <h2 className="text-sm font-semibold text-slate-600">2. בחירת יעד</h2>
        <div className="mt-3 max-w-xl">
          {groupBy === "gradeYear" && (
            <Select
              label="שכבה"
              value={filterValue}
              onChange={(e) => {
                setFilterValue(e.target.value);
                resetPreview();
              }}
            >
              <option value="">— בחר שכבה —</option>
              {CANONICAL_GRADE_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
          {groupBy === "class" && (
            <Select
              label="כיתה"
              value={filterValue}
              onChange={(e) => {
                setFilterValue(e.target.value);
                resetPreview();
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
          )}
          {groupBy === "student" && (
            <div>
              <label className="label">תלמיד</label>
              <StudentCombobox
                students={comboboxStudents}
                selectedId={filterValue}
                onSelect={(id) => {
                  setFilterValue(id);
                  resetPreview();
                }}
                placeholder="חיפוש תלמיד לפי שם או כיתה..."
              />
            </div>
          )}
        </div>
      </Card>

      <section className="mt-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">3. איזה טווח שנים?</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {YEAR_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              active={yearScope === option.id}
              title={option.label}
              description={option.description}
              icon={CalendarRange}
              onClick={() => {
                setYearScope(option.id);
                resetPreview();
              }}
            />
          ))}
        </div>
      </section>

      <div className="mt-5">
        <Button type="button" onClick={() => void loadReport()} disabled={!canPreview || loading}>
          <ClipboardList className="h-4 w-4" />
          {loading ? "טוען דוח..." : "הצג דוח"}
        </Button>
      </div>

      {error && (
        <Alert variant="error" className="mt-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {report && <ReportView report={report} />}

      {report && (
        <DetailTables
          report={report}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          query={query}
          setQuery={setQuery}
          entries={filteredEntries}
        />
      )}
    </>
  );
}

function ReportView({ report }: { report: ShortageYearReport }) {
  const { totals } = report;
  const groupTitle =
    report.filter.groupBy === "gradeYear"
      ? "לפי כיתה"
      : report.filter.groupBy === "class"
        ? "לפי תלמיד"
        : "לפי מקצוע";

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {report.filterLabel} · {report.yearScopeLabel}
          </h2>
          <p className="text-sm text-slate-500">{report.groupByLabel} · הופק ב־{report.generatedAt}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatBox label="סה״כ מטלות" value={totals.total} />
        <StatBox label="הושלמו" value={totals.done} tone="success" />
        <StatBox label="נותרו" value={totals.remaining} tone="danger" />
        <StatBox label="באיחור" value={totals.overdue} tone="warning" />
        <StatBox label="אחוז השלמה" value={`${totals.donePercent}%`} tone="info" />
      </div>

      <Card variant="flat" className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold text-slate-800">סיכום {groupTitle}</h3>
        </div>
        {report.groups.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="אין מטלות בטווח שנבחר"
            description="לא נמצאו מטלות שחלות על הבחירה בטווח השנים הזה"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-4 py-3 text-right text-xs font-semibold">
                    {report.filter.groupBy === "gradeYear"
                      ? "כיתה"
                      : report.filter.groupBy === "class"
                        ? "תלמיד"
                        : "מקצוע"}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold">
                    {report.filter.groupBy === "student" ? "שכבת מטלה" : "פירוט"}
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">סה״כ</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">הושלם</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">נותר</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">באיחור</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold">השלמה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.groups.map((g) => (
                  <tr key={g.key} className={clsx("even:bg-slate-50/40", g.remaining > 0 && "bg-red-50/30")}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{g.label}</td>
                    <td className="px-4 py-2.5 text-slate-500">{g.subtitle ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{g.total}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700">{g.done}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums font-semibold text-red-700">
                      {g.remaining}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-amber-700">{g.overdue}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          g.donePercent >= 80
                            ? "bg-emerald-100 text-emerald-800"
                            : g.donePercent >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        )}
                      >
                        {g.donePercent}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DetailTables({
  report,
  detailTab,
  setDetailTab,
  query,
  setQuery,
  entries,
}: {
  report: ShortageYearReport;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  query: string;
  setQuery: (q: string) => void;
  entries: ShortageYearEntry[];
}) {
  const remainingCount = report.entries.filter((e) => !e.isComplete).length;
  const doneCount = report.entries.filter((e) => e.isComplete).length;
  const hideStudent = report.filter.groupBy === "student";

  return (
    <Card variant="flat" className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["remaining", `נותר לעשות (${remainingCount})`],
              ["done", `מה הושלם (${doneCount})`],
              ["all", `הכל (${report.entries.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDetailTab(id)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                detailTab === id ? "bg-white text-primary-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש בפירוט..."
            className="input pr-9"
          />
        </label>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={detailTab === "remaining" ? CheckCircle2 : ClipboardList}
          title={detailTab === "remaining" ? "אין חוסרים" : "אין שורות להצגה"}
          description={
            query
              ? "לא נמצאו תוצאות לחיפוש"
              : detailTab === "remaining"
                ? "כל המטלות בטווח שנבחר הושלמו"
                : "אין מטלות שהושלמו בטווח שנבחר"
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-slate-200 text-slate-500">
                {!hideStudent && <th className="px-4 py-3 text-right text-xs font-semibold">תלמיד</th>}
                <th className="px-4 py-3 text-right text-xs font-semibold">כיתה</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">שכבת מטלה</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">מקצוע</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">מטלה</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">תאריך יעד</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">סטטוס</th>
                <th className="px-4 py-3 text-right text-xs font-semibold">מצב</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.slice(0, 150).map((entry, idx) => (
                <tr
                  key={`${entry.studentId}-${entry.obligationId}-${entry.taskLabel}-${idx}`}
                  className={clsx(
                    "even:bg-slate-50/40",
                    entry.isOverdue && "bg-red-50/40",
                    entry.isComplete && "bg-emerald-50/20"
                  )}
                >
                  {!hideStudent && (
                    <td className="px-4 py-2.5 font-medium text-slate-800">{entry.studentName}</td>
                  )}
                  <td className="px-4 py-2.5 text-slate-600">{entry.className}</td>
                  <td className="px-4 py-2.5 text-slate-600">{entry.obligationGradeYear ?? "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{entry.subjectLabel}</td>
                  <td className="px-4 py-2.5 text-slate-800">{entry.taskLabel}</td>
                  <td className="px-4 py-2.5 text-slate-600">{entry.dueDate || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{entry.statusLabel}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        entry.isComplete
                          ? "bg-emerald-100 text-emerald-800"
                          : entry.isOverdue
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {entry.isComplete ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : entry.isOverdue ? (
                        <AlertCircle className="h-3 w-3" />
                      ) : null}
                      {entry.isComplete ? `הושלם · ${entry.resultLabel}` : entry.isOverdue ? "נותר · באיחור" : "נותר"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {entries.length > 150 && (
        <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          מוצגות 150 שורות ראשונות מתוך {entries.length}. ייצאו לאקסל לקבלת הרשימה המלאה.
        </p>
      )}
    </Card>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger" | "warning" | "info";
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3",
        tone === "success" && "border-emerald-200 bg-emerald-50",
        tone === "danger" && "border-red-200 bg-red-50",
        tone === "warning" && "border-amber-200 bg-amber-50",
        tone === "info" && "border-sky-200 bg-sky-50",
        !tone && "border-slate-200 bg-white"
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={clsx(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "success" && "text-emerald-800",
          tone === "danger" && "text-red-800",
          tone === "warning" && "text-amber-800",
          tone === "info" && "text-sky-800",
          !tone && "text-slate-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}
