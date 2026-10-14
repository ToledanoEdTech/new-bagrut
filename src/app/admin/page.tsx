"use client";
import { useState } from "react";
import { StatCardGrid } from "@/components/ui/StatCardGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";
import { Sheet } from "@/components/ui/Sheet";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";
import { StudentCardView } from "@/components/students/StudentCardView";
import clsx from "clsx";
import {
  Users,
  BookOpen,
  Upload,
  ClipboardList,
  Target,
  Sparkles,
  AlertTriangle,
  ChevronLeft,
  Award,
  Cpu,
  TrendingUp,
  School,
  Bell,
  ChevronDown,
  UserCog,
  Grid3X3,
  Settings,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useApi } from "@/hooks/useApi";
import { canImportStudents, canManageStructure } from "@/lib/roles";
import {
  hasAnyGradeWrite,
  hasAnyStudentEdit,
  hasAnyStudentView,
  canViewOutstandingBagrut,
  isFullAdmin,
} from "@/lib/permissions";
import type {
  AdminDashboardResponse,
  DataQualityAlerts,
  GradeGaps,
  GradeRemindersSummary,
  HightechBagrutPreview,
  NegativeGradeGapItem,
  OverdueGradeGapItem,
  OutstandingBagrutPreview,
  SchoolProgress,
} from "@/lib/admin-dashboard";

function GapLinkRow({
  href,
  onClick,
  label,
  value,
  variant = "default",
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  value: number;
  variant?: "default" | "danger" | "warning";
}) {
  const bg =
    variant === "danger"
      ? "bg-red-50 hover:bg-red-100/80"
      : variant === "warning"
        ? "bg-amber-50 hover:bg-amber-100/80"
        : "bg-slate-50 hover:bg-slate-100/80";
  const text =
    variant === "danger"
      ? "text-red-700"
      : variant === "warning"
        ? "text-amber-700"
        : "text-slate-800";
  const className = clsx(
    "flex w-full items-center justify-between rounded-xl px-4 py-3 text-start transition",
    bg
  );
  const content = (
    <>
      <span className="text-slate-600">{label}</span>
      <span className={clsx("font-bold", text)}>{value}</span>
    </>
  );

  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className={className}>
          {content}
        </button>
      ) : (
        <Link href={href ?? "#"} className={className}>
          {content}
        </Link>
      )}
    </li>
  );
}
function SchoolProgressCard({ progress }: { progress: SchoolProgress }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
          <TrendingUp className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-h2 text-slate-900">התקדמות כללית</h2>
          <p className="text-sm text-slate-500">
            {progress.gradedObligationsCount} מתוך {progress.totalRelevantObligationsCount} חובות
            הושלמו
          </p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">אחוז השלמה</span>
          <span className="font-bold text-slate-900">
            {progress.overallCompletionPercent}%
          </span>
        </div>
        <ProgressBar
          value={progress.overallCompletionPercent}
          className="mt-2 h-3"
          color="success"
        />
      </div>
      {progress.estimatedAverage != null && (
        <p className="mt-4 text-sm text-slate-600">
          ממוצע משוער:{" "}
          <span className="font-bold text-slate-900">
            {progress.estimatedAverage.toFixed(1)}
          </span>
        </p>
      )}
    </Card>
  );
}
function ClassSummaryCard({ byClass }: { byClass: GradeGaps["byClass"] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100">
          <School className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-h2 text-slate-900">סיכום לפי כיתה</h2>
          <p className="text-sm text-slate-500">כיתות עם הכי הרבה חובות חסרות</p>
        </div>
      </div>
      {byClass.length === 0 ? (
        <EmptyState
          title="אין נתונים"
          description="לא נמצאו כיתות בטווח ההרשאות"
          className="mt-5 py-8"
        />
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="pb-2 text-start font-medium">כיתה</th>
                <th className="pb-2 text-center font-medium">תלמידים</th>
                <th className="pb-2 text-center font-medium">השלמה</th>
                <th className="pb-2 text-center font-medium">חסרים</th>
              </tr>
            </thead>
            <tbody>
              {byClass.map((row) => (
                <tr
                  key={row.classId}
                  className="border-b border-slate-50 last:border-0"
                >
                  <td className="py-2.5">
                    <Link
                      href="/admin/classes"
                      className="font-medium text-slate-800 hover:text-primary-600"
                    >
                      {row.className}
                    </Link>
                  </td>
                  <td className="py-2.5 text-center text-slate-600">{row.studentCount}</td>
                  <td className="py-2.5 text-center">
                    <span
                      className={clsx(
                        "font-medium",
                        row.completionPercent >= 80
                          ? "text-emerald-700"
                          : row.completionPercent >= 50
                            ? "text-amber-700"
                            : "text-red-700"
                      )}
                    >
                      {row.completionPercent}%
                    </span>
                  </td>
                  <td className="py-2.5 text-center font-bold text-amber-700">
                    {row.missingCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
function GradeYearBreakdown({ rows }: { rows: OutstandingBagrutPreview["byGradeYear"] }) {
  const visible = rows.filter((r) => r.studentCount > 0 || r.count > 0);
  if (visible.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
      {visible.map((r) => (
        <li
          key={r.gradeYear}
          className="flex items-center justify-between text-xs text-slate-600"
        >
          <span>{r.gradeYear}</span>
          <span className="tabular-nums font-medium text-slate-800">
            {r.count} ({r.percent}%)
          </span>
        </li>
      ))}
    </ul>
  );
}
function OutstandingPreviewCard({
  preview,
  onStudentClick,
}: {
  preview: OutstandingBagrutPreview;
  onStudentClick?: (studentId: string) => void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-h2 text-slate-900">בגרות מצטיינת</h2>
            <p className="text-sm text-slate-500">
              {preview.candidateCount} ({preview.candidatePercent}%) מועמדים
              {preview.greenCount > 0 && ` · ${preview.greenCount} ירוק`}
              {preview.yellowCount > 0 && ` · ${preview.yellowCount} צהוב`}
              {preview.redCount > 0 && ` · ${preview.redCount} אדום`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Link
            href="/admin/outstanding-bagrut"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            הכל
          </Link>
          <Link
            href="/admin/analytics"
            className="text-xs font-medium text-slate-500 hover:text-primary-600"
          >
            לכל הסטטיסטיקות
          </Link>
        </div>
      </div>
      <GradeYearBreakdown rows={preview.byGradeYear} />
      {preview.topCandidates.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">אין מועמדים כרגע</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {preview.topCandidates.map((c) => (
            <li key={c.studentId}>
              <button
                type="button"
                onClick={() => onStudentClick?.(c.studentId)}
                className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-start transition hover:bg-slate-100/80"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 hover:text-primary-700">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500">{c.className}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={
                      c.tier === "green"
                        ? "font-bold text-emerald-700"
                        : c.tier === "yellow"
                          ? "font-bold text-amber-700"
                          : "font-bold text-red-700"
                    }
                  >
                    {c.average.toFixed(1)}
                  </span>
                  <OutstandingBagrutBadge size="sm" tier={c.tier} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HightechPreviewCard({
  preview,
  onStudentClick,
}: {
  preview: HightechBagrutPreview;
  onStudentClick?: (studentId: string) => void;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100">
            <Cpu className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-h2 text-slate-900">בגרות הייטק</h2>
            <p className="text-sm text-slate-500">
              {preview.candidateCount} ({preview.candidatePercent}%) מועמדים
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Link
            href="/admin/hightech-bagrut"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            הכל
          </Link>
          <Link
            href="/admin/analytics"
            className="text-xs font-medium text-slate-500 hover:text-primary-600"
          >
            לכל הסטטיסטיקות
          </Link>
        </div>
      </div>
      <GradeYearBreakdown rows={preview.byGradeYear} />
      {preview.topCandidates.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">אין מועמדים כרגע</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {preview.topCandidates.map((c) => (
            <li key={c.studentId}>
              <button
                type="button"
                onClick={() => onStudentClick?.(c.studentId)}
                className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-start transition hover:bg-slate-100/80"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800 hover:text-primary-700">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500">{c.className}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-500">{c.scienceSubjectName}</span>
                  <HightechBagrutBadge size="sm" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NegativeGradesModal({
  open,
  onClose,
  items,
  onStudentClick,
}: {
  open: boolean;
  onClose: () => void;
  items: NegativeGradeGapItem[];
  onStudentClick: (studentId: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="ציונים שליליים" size="lg">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">אין ציונים שליליים</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li
              key={`${item.studentId}-${item.obligationId}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStudentClick(item.studentId);
                  }}
                  className="truncate font-medium text-slate-800 transition hover:text-primary-700"
                >
                  {item.studentName}
                </button>
                <p className="text-xs text-slate-500">
                  {item.className} · {item.subjectName} — {item.obligationLabel}
                </p>
              </div>
              <span className="shrink-0 font-bold text-red-700">{item.score}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function OverdueGradesModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: OverdueGradeGapItem[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="ציונים באיחור — טרם הוזנו" size="lg">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">אין מטלות באיחור</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li
              key={`${item.obligationId}-${item.subItemSortOrder ?? "main"}`}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {item.subjectName} — {item.obligationLabel}
                  {item.examEvent ? ` (${item.examEvent})` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  יעד: {item.gradeEntryDueDate} · {item.missingStudentCount} תלמידים
                  {item.classNames.length > 0 ? ` · ${item.classNames.join(", ")}` : ""}
                </p>
              </div>
              <Link
                href={`/admin/grades/matrix?subjectId=${item.subjectId}`}
                onClick={onClose}
                className="shrink-0 text-xs font-medium text-primary-600 hover:underline"
              >
                להזנה ←
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <Link
          href="/admin/missing-entries"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          פירוט מלא — מורים ומטלות שלא הוזנו
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </div>
    </Modal>
  );
}
function GradeRemindersCard({ summary }: { summary: GradeRemindersSummary }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-h2 text-slate-900">תזכורות ציונים</h2>
            <p className="text-sm text-slate-500">
              {summary.enabled ? "פעיל" : "כבוי"}
              {summary.lastRunAt && (
                <span className="text-slate-400">
                  {" "}
                  · ריצה אחרונה:{" "}
                  {new Date(summary.lastRunAt).toLocaleDateString("he-IL")}
                </span>
              )}
            </p>
          </div>
        </div>
        <Link href="/admin/settings" className="btn-secondary px-3 py-1.5 text-sm">
          <Settings className="h-4 w-4" />
          הגדרות
        </Link>
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        <li className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-slate-600">פריטים באיחור</span>
          <span className="font-bold text-red-700">{summary.overdueCount}</span>
        </li>
        <li className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-slate-600">יישלחו תזכורות היום</span>
          <span className="font-bold text-slate-800">{summary.wouldNotifyCount}</span>
        </li>
      </ul>
    </Card>
  );
}
function DataQualitySection({ alerts }: { alerts: DataQualityAlerts }) {
  const [open, setOpen] = useState(true);
  const total =
    alerts.studentsWithoutClass +
    alerts.classesWithoutStudents +
    alerts.subjectsWithoutObligations +
    alerts.obligationsWithoutDueDate +
    alerts.obligationsWithoutGradeYear;
  if (total === 0) return null;
  const items = [
    alerts.studentsWithoutClass > 0 && {
      label: "תלמידים ללא כיתה",
      count: alerts.studentsWithoutClass,
      href: "/admin/students",
    },
    alerts.classesWithoutStudents > 0 && {
      label: "כיתות ללא תלמידים",
      count: alerts.classesWithoutStudents,
      href: "/admin/classes",
    },
    alerts.subjectsWithoutObligations > 0 && {
      label: "מקצועות ללא חובות",
      count: alerts.subjectsWithoutObligations,
      href: "/admin/subjects",
    },
    alerts.obligationsWithoutDueDate > 0 && {
      label: "חובות ללא תאריך יעד",
      count: alerts.obligationsWithoutDueDate,
      href: "/admin/subjects",
    },
    alerts.obligationsWithoutGradeYear > 0 && {
      label: "מטלות ללא שנתון שכבה",
      count: alerts.obligationsWithoutGradeYear,
      href: "/admin/obligations",
    },
  ].filter(Boolean) as Array<{ label: string; count: number; href: string }>;
  return (
    <Card className="p-6 lg:col-span-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-start"
      >
        <Alert variant="warning" className="flex-1 border-0 p-0">
          <span>
            {total} בעיות איכות נתונים זוהו — לחץ לפרטים
          </span>
        </Alert>
        <ChevronDown
          className={clsx(
            "h-5 w-5 shrink-0 text-slate-400 transition",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <ul className="mt-4 space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 hover:bg-amber-100/80"
              >
                <span className="text-amber-900">{item.label}</span>
                <span className="font-bold text-amber-700">{item.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
export default function AdminDashboard() {
  const { session } = useAuth();
  const canStudents = session ? hasAnyStudentView(session) : false;
  const canOutstandingBagrut = session ? canViewOutstandingBagrut(session) : false;
  const { data, loading } = useApi<AdminDashboardResponse>("/api/admin/dashboard");
  const [gapsModal, setGapsModal] = useState<"negative" | "overdue" | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  if (loading && !data) {
    return <PageLoader />;
  }
  if (!data) {
    return (
      <Alert variant="error" className="mt-6">
        שגיאה בטעינת הנתונים. נסו לרענן את הדף.
      </Alert>
    );
  }
  const {
    counts,
    paths,
    gradeGaps,
    schoolProgress,
    outstandingBagrutPreview,
    hightechBagrutPreview,
    gradeRemindersSummary,
    teacherAlerts,
    dataQualityAlerts,
  } = data;
  const isAdmin = session ? isFullAdmin(session) : false;
  const isTeacher = session?.role === "TEACHER";
  const canGrades = session ? hasAnyGradeWrite(session) : false;
  const canEditStudents = session ? hasAnyStudentEdit(session) : false;
  const quickActions = [
    canGrades
      ? {
          href: "/admin/grades",
          label: "הזנת ציונים",
          icon: ClipboardList,
          variant: "primary" as const,
        }
      : null,
    canGrades
      ? {
          href: "/admin/grades-matrix",
          label: "מטריצת ציונים",
          icon: Grid3X3,
          variant: "secondary" as const,
        }
      : null,
    canStudents
      ? {
          href: "/admin/students",
          label: canEditStudents ? "עריכת תלמידים" : "תלמידים",
          icon: Users,
          variant: "secondary" as const,
        }
      : null,
    canGrades
      ? {
          href: "/admin/reports",
          label: "מרכז חוסרים",
          icon: AlertTriangle,
          variant: "secondary" as const,
        }
      : null,
    isAdmin && session && canImportStudents(session.role)
      ? {
          href: "/admin/import",
          label: "ייבוא תלמידים",
          icon: Upload,
          variant: "secondary" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    icon: typeof Users;
    variant: "primary" | "secondary";
  }>;
  const attentionTotal = gradeGaps
    ? gradeGaps.totalMissing + gradeGaps.totalNegative + gradeGaps.overdueCount
    : 0;
  return (
    <>
      <PageHeader
        variant="gradient"
        title={isTeacher ? "דשבורד מורה" : "דשבורד מנהל"}
        subtitle={
          isTeacher
            ? "התמקדו בהזנת ציונים ובפריטים שדורשים טיפול"
            : undefined
        }
      >
        {canGrades && (
          <Link
            href="/admin/grades"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-base font-semibold text-primary-700 shadow-soft transition hover:bg-primary-50"
          >
            <ClipboardList className="h-5 w-5" />
            להזנת ציונים
          </Link>
        )}
      </PageHeader>

      {/* Primary: attention first */}
      {gradeGaps && (
        <Card className="mt-8 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-h2 text-slate-900">מה דורש טיפול היום</h2>
                <p className="text-sm text-slate-500">
                  {attentionTotal > 0
                    ? `${attentionTotal} פריטים שדורשים תשומת לב`
                    : "אין פריטים דחופים כרגע"}
                </p>
              </div>
            </div>
            {canGrades && (
              <Link
                href="/admin/reports"
                className="text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                למרכז החוסרים
                <ChevronLeft className="inline h-4 w-4" />
              </Link>
            )}
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <GapLinkRow
              href="/admin/grades"
              label="חובות חסרות"
              value={gradeGaps.totalMissing}
              variant="warning"
            />
            <GapLinkRow
              onClick={() => setGapsModal("negative")}
              label="ציונים שליליים"
              value={gradeGaps.totalNegative}
              variant={gradeGaps.totalNegative > 0 ? "danger" : "default"}
            />
            <GapLinkRow
              onClick={() => setGapsModal("overdue")}
              label="באיחור"
              value={gradeGaps.overdueCount}
              variant={gradeGaps.overdueCount > 0 ? "danger" : "default"}
            />
            <GapLinkRow
              href="/admin/grades"
              label="יעדים קרובים (14 יום)"
              value={gradeGaps.upcomingCount}
            />
          </ul>
          {(gradeGaps.topMissingSubjects.length > 0 ||
            gradeGaps.topNegativeSubjects.length > 0) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {gradeGaps.topMissingSubjects.length > 0 && (
                <div className="rounded-xl border border-slate-100 px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    מקצועות עם הכי הרבה חסרים
                  </p>
                  <ul className="space-y-1 text-sm">
                    {gradeGaps.topMissingSubjects.map((s) => (
                      <li key={s.subjectId} className="flex justify-between text-slate-700">
                        <span className="truncate">{s.subjectName}</span>
                        <span className="shrink-0 font-bold text-amber-700">{s.missingCount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {gradeGaps.topNegativeSubjects.length > 0 && (
                <div className="rounded-xl border border-slate-100 px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    מקצועות עם ציונים שליליים
                  </p>
                  <ul className="space-y-1 text-sm">
                    {gradeGaps.topNegativeSubjects.map((s) => (
                      <li key={s.subjectId} className="flex justify-between text-slate-700">
                        <span className="truncate">{s.subjectName}</span>
                        <span className="shrink-0 font-bold text-red-700">{s.negativeCount}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {quickActions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={clsx(
                  action.variant === "primary" ? "btn-primary" : "btn-secondary",
                  "px-3 py-2 text-sm"
                )}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <StatCardGrid
          items={[
            { title: "תלמידים", value: counts.students, icon: "users", color: "primary" },
            { title: "כיתות", value: counts.classes, icon: "school", color: "info" },
            {
              title: "מקצועות",
              value: counts.subjects,
              subtitle: `${counts.obligations} חובות`,
              icon: "book-open",
              color: "success",
            },
            {
              title: "ציונים שהוזנו",
              value: counts.gradedCount,
              icon: "clipboard-check",
              color: "warning",
            },
          ]}
        />
      </div>
      {(schoolProgress || gradeGaps) && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {schoolProgress && <SchoolProgressCard progress={schoolProgress} />}
          {gradeGaps && <ClassSummaryCard byClass={gradeGaps.byClass} />}
        </div>
      )}

      {/* Secondary: programs & previews behind toggle */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-start shadow-soft transition hover:bg-slate-50"
        >
          <span className="flex items-center gap-2 font-semibold text-slate-800">
            <Sparkles className="h-5 w-5 text-primary-600" />
            תוכניות בגרות ומידע נוסף
          </span>
          <ChevronDown
            className={clsx("h-5 w-5 text-slate-400 transition", showMore && "rotate-180")}
          />
        </button>
        {showMore && (
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            {outstandingBagrutPreview && (
              <OutstandingPreviewCard
                preview={outstandingBagrutPreview}
                onStudentClick={setSelectedStudentId}
              />
            )}
            {hightechBagrutPreview && (
              <HightechPreviewCard
                preview={hightechBagrutPreview}
                onStudentClick={setSelectedStudentId}
              />
            )}
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
                  <Target className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-h2 text-slate-900">תוכניות חובה</h2>
                  <p className="text-sm text-slate-500">{counts.paths} תוכניות מוגדרות</p>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {paths.map((p) => (
                  <Link
                    key={p.id}
                    href="/admin/subjects"
                    className="group flex items-center gap-3 rounded-xl border border-transparent bg-slate-50 px-4 py-3 transition hover:border-primary-100 hover:bg-white hover:shadow-soft"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-l from-primary-500 to-brand-500" />
                    <span className="min-w-0 flex-1 text-base font-medium text-slate-700 group-hover:text-slate-900">
                      {p.label}
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-primary-500" />
                  </Link>
                ))}
              </div>
              {isAdmin && session && canManageStructure(session.role) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link href="/admin/classes" className="btn-secondary px-3 py-1.5 text-sm">
                    <School className="h-4 w-4" />
                    כיתות
                  </Link>
                  <Link href="/admin/subjects" className="btn-secondary px-3 py-1.5 text-sm">
                    <BookOpen className="h-4 w-4" />
                    מקצועות
                  </Link>
                  {canOutstandingBagrut && (
                    <Link href="/admin/analytics" className="btn-secondary px-3 py-1.5 text-sm">
                      <BarChart3 className="h-4 w-4" />
                      סטטיסטיקות
                    </Link>
                  )}
                  <Link href="/admin/staff" className="btn-secondary px-3 py-1.5 text-sm">
                    <UserCog className="h-4 w-4" />
                    צוות
                  </Link>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
      {teacherAlerts &&
        (teacherAlerts.upcoming.length > 0 || teacherAlerts.overdue.length > 0) && (
          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                סיכום מורים עם מועדי הזנה פתוחים
              </p>
              <Link
                href="/admin/missing-entries"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                פירוט מלא — מורים ומטלות שלא הוזנו
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
                  <Bell className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-h3 text-slate-900">מורים שמועד ההזנה שלהם מתקרב</h3>
                  <p className="text-sm text-slate-500">בשבוע הקרוב, ועדיין לא הוזנו ציונים</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {teacherAlerts.upcoming.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    אין מורים עם מועד מתקרב
                  </p>
                ) : (
                  teacherAlerts.upcoming.map((t) => (
                    <div
                      key={t.teacherId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{t.name || t.email}</p>
                        <p className="text-xs text-slate-500">
                          {t.upcomingCount} מטלות · {t.upcomingMissingStudents} ציונים חסרים
                          {t.nearestDueDate ? ` · הקרוב ביותר: ${t.nearestDueDate}` : ""}
                        </p>
                      </div>
                      <span className="badge-warning shrink-0">{t.upcomingCount}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-100">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-h3 text-slate-900">ציונים באיחור — טרם הוזנו</h3>
                  <p className="text-sm text-slate-500">מועד ההזנה חלף וחסרים ציונים</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {teacherAlerts.overdue.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    אין ציונים באיחור
                  </p>
                ) : (
                  teacherAlerts.overdue.map((t) => (
                    <div
                      key={t.teacherId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{t.name || t.email}</p>
                        <p className="text-xs text-slate-500">
                          {t.overdueCount} מטלות · {t.overdueMissingStudents} ציונים חסרים
                        </p>
                      </div>
                      <span className="badge-danger shrink-0">{t.overdueCount}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
          </div>
        )}
      {gradeRemindersSummary && (
        <div className="mt-8 max-w-md">
          <GradeRemindersCard summary={gradeRemindersSummary} />
        </div>
      )}
      {dataQualityAlerts && (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <DataQualitySection alerts={dataQualityAlerts} />
        </div>
      )}

      {gradeGaps && (
        <>
          <NegativeGradesModal
            open={gapsModal === "negative"}
            onClose={() => setGapsModal(null)}
            items={gradeGaps.negativeItems}
            onStudentClick={setSelectedStudentId}
          />
          <OverdueGradesModal
            open={gapsModal === "overdue"}
            onClose={() => setGapsModal(null)}
            items={gradeGaps.overdueItems}
          />
        </>
      )}

      <Sheet
        open={selectedStudentId != null}
        onClose={() => setSelectedStudentId(null)}
        title="כרטיס תלמיד"
        className="max-w-3xl"
      >
        {selectedStudentId && <StudentCardView studentId={selectedStudentId} />}
      </Sheet>
    </>
  );
}
