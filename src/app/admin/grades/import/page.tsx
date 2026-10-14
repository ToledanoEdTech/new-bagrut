"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Download, Loader2, CheckCircle2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { FileUpload } from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/Toast";
import { StudentCombobox } from "@/components/students/StudentCombobox";
import {
  downloadGradesImportTemplate,
  downloadFullGradesTemplate,
  exportTimestamp,
  type FullGradesTemplateRow,
} from "@/lib/excel-export";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";

type ScopeMode = "class" | "gradeYear" | "student";

type ClassItem = { id: string; name: string; gradeYear: string | null };

type StudentItem = {
  id: string;
  user: { name: string };
  class: { id: string; name: string };
};

type TemplateData = {
  classes: string[];
  subjects: string[];
  obligations: string[];
  statuses: string[];
  subjectOptions: Array<{
    id: string;
    name: string;
    obligations: Array<{
      id: string;
      label: string;
      tasks: Array<{
        sortOrder: number;
        taskName: string;
        taskKind: "single" | "component" | "subItem";
        weightPercent: number;
      }>;
    }>;
  }>;
  classStudents?: string[];
  studentCount?: number;
};

export default function GradesImportPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const [scopeMode, setScopeMode] = useState<ScopeMode>("gradeYear");
  const [classId, setClassId] = useState("");
  const [gradeYear, setGradeYear] = useState("");
  const [studentId, setStudentId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [obligationLabel, setObligationLabel] = useState("");
  const [taskSortOrder, setTaskSortOrder] = useState("");
  const [downloading, setDownloading] = useState<"empty" | "filled" | "full" | null>(null);

  const { data: classes = [] } = useApi<ClassItem[]>("/api/classes/list");
  const { data: students = [] } = useApi<StudentItem[]>("/api/students");

  const availableGradeYears = useMemo(() => {
    const present = new Set(
      classes
        .map((c) => normalizeGradeYear(c.gradeYear))
        .filter((gy): gy is string => !!gy)
    );
    return CANONICAL_GRADE_YEARS.filter((gy) => present.has(gy));
  }, [classes]);

  const comboboxStudents = useMemo(
    () =>
      [...students].sort((a, b) =>
        a.user.name.localeCompare(b.user.name, "he")
      ),
    [students]
  );

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId),
    [students, studentId]
  );

  const scopeReady =
    scopeMode === "class"
      ? !!classId
      : scopeMode === "student"
        ? !!studentId
        : !!gradeYear;

  const templateKey = scopeReady
    ? scopeMode === "class"
      ? `/api/grades/import/template?classId=${encodeURIComponent(classId)}`
      : scopeMode === "student"
        ? `/api/grades/import/template?studentId=${encodeURIComponent(studentId)}`
        : `/api/grades/import/template?gradeYear=${encodeURIComponent(gradeYear)}`
    : "/api/grades/import/template";
  const { data: templateData, loading: templateLoading } =
    useApi<TemplateData>(templateKey);

  const selectedClass = classes.find((c) => c.id === classId);

  const selectedSubject = useMemo(
    () => templateData?.subjectOptions.find((s) => s.id === subjectId),
    [templateData, subjectId]
  );

  const obligationOptions = useMemo(() => {
    return selectedSubject?.obligations ?? [];
  }, [selectedSubject]);

  const selectedObligation = useMemo(
    () => obligationOptions.find((o) => o.label === obligationLabel),
    [obligationOptions, obligationLabel]
  );

  const taskOptions = useMemo(() => {
    const tasks = selectedObligation?.tasks ?? [];
    if (tasks.length <= 1) return [];
    return tasks;
  }, [selectedObligation]);

  const selectedTask = useMemo(
    () => taskOptions.find((t) => String(t.sortOrder) === taskSortOrder),
    [taskOptions, taskSortOrder]
  );

  useEffect(() => {
    setClassId("");
    setGradeYear("");
    setStudentId("");
    setSubjectId("");
    setObligationLabel("");
    setTaskSortOrder("");
  }, [scopeMode]);

  useEffect(() => {
    setSubjectId("");
    setObligationLabel("");
    setTaskSortOrder("");
  }, [classId, gradeYear, studentId]);

  useEffect(() => {
    setObligationLabel("");
    setTaskSortOrder("");
  }, [subjectId]);

  useEffect(() => {
    setTaskSortOrder("");
  }, [obligationLabel]);

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    // Guard against a hung request — Vercel serverless functions can be killed
    // silently, and without this we'd never leave the loading state.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120_000);

    try {
      const res = await fetch("/api/grades/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      let data: { updated?: number; skipped?: number; errors?: string[]; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        if (!res.ok) {
          setError(
            res.status === 504 || res.status === 408
              ? "הבקשה נעצרה — הקובץ גדול מדי לעיבוד בבת אחת. נסו לפצל אותו לקבצים קטנים יותר (למשל לפי כיתה)."
              : `שגיאת שרת (${res.status}) — לא ניתן היה לפרש את התשובה מהשרת.`
          );
          toast.error("הייבוא נכשל");
          return;
        }
        throw new Error("response-not-json");
      }

      if (!res.ok) {
        const msg = data.error ?? `שגיאה בייבוא (${res.status})`;
        setError(msg);
        toast.error(msg);
        return;
      }

      const normalized = {
        updated: data.updated ?? 0,
        skipped: data.skipped ?? 0,
        errors: data.errors ?? [],
      };
      setResult(normalized);

      if (normalized.updated > 0) {
        toast.success(
          `${normalized.updated} ציונים עודכנו בהצלחה${
            normalized.skipped > 0 ? ` · ${normalized.skipped} דולגו` : ""
          }`
        );
      } else if (normalized.errors.length > 0) {
        toast.error(
          `הייבוא הסתיים ללא עדכונים — נמצאו ${normalized.errors.length} שגיאות בקובץ`
        );
      } else {
        toast.info("לא נמצאו שורות לעדכון בקובץ");
      }
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === "AbortError";
      const msg = aborted
        ? "הבקשה נעצרה לאחר 2 דקות — הקובץ ככל הנראה גדול מדי. נסו לפצל אותו לפי כיתה."
        : "שגיאת רשת בייבוא — בדקו את החיבור ונסו שוב";
      setError(msg);
      toast.error(msg);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  async function downloadEmptyTemplate() {
    if (!templateData) return;
    setDownloading("empty");
    try {
      await downloadGradesImportTemplate(`תבנית_ציונים_${exportTimestamp()}.xlsx`, {
        classes: templateData.classes,
        subjects: templateData.subjects,
        obligations: templateData.obligations,
        statuses: templateData.statuses,
      });
    } finally {
      setDownloading(null);
    }
  }

  function buildScopeParams(): URLSearchParams {
    if (scopeMode === "class") return new URLSearchParams({ classId });
    if (scopeMode === "student") return new URLSearchParams({ studentId });
    return new URLSearchParams({ gradeYear });
  }

  function buildFilledTemplateQuery(): string {
    const params = buildScopeParams();
    if (subjectId) params.set("subjectId", subjectId);
    if (selectedObligation?.id) params.set("obligationId", selectedObligation.id);
    if (taskSortOrder) params.set("taskSortOrder", taskSortOrder);
    return params.toString();
  }

  function scopeDisplayName(): string {
    if (scopeMode === "class") {
      return selectedClass?.name.replace(/[/\\?*[\]]/g, "-") ?? "כיתה";
    }
    if (scopeMode === "student") {
      return selectedStudent?.user.name.replace(/[/\\?*[\]]/g, "-") ?? "תלמיד";
    }
    return gradeYear.replace(/[/\\?*[\]]/g, "-") || "שכבה";
  }

  function buildFilledFilename(): string {
    const parts = [scopeDisplayName()];
    if (selectedSubject?.name) {
      parts.push(selectedSubject.name.replace(/[/\\?*[\]]/g, "-"));
    }
    if (obligationLabel) {
      parts.push(obligationLabel.slice(0, 30).replace(/[/\\?*[\]]/g, "-"));
    }
    if (selectedTask?.taskName) {
      parts.push(selectedTask.taskName.slice(0, 20).replace(/[/\\?*[\]]/g, "-"));
    }
    return `ציונים_${parts.join("_")}_${exportTimestamp()}.xlsx`;
  }

  function buildFilledTitle(rowCount: number): string {
    const parts = [
      scopeMode === "class"
        ? (selectedClass?.name ?? "כיתה")
        : scopeMode === "student"
          ? (selectedStudent?.user.name ?? "תלמיד")
          : gradeYear,
    ];
    if (selectedSubject?.name) parts.push(selectedSubject.name);
    if (obligationLabel) parts.push(obligationLabel);
    if (selectedTask?.taskName) parts.push(selectedTask.taskName);
    return `קובץ הזנת ציונים — ${parts.join(" · ")} (${rowCount} שורות)`;
  }

  function emptyRowsMessage(): string {
    if (scopeMode === "gradeYear") {
      return "לא נמצאו שורות לפי הבחירה — בדקו שהמקצוע/מטלה רלוונטיים לשכבה";
    }
    if (scopeMode === "student") {
      return "לא נמצאו שורות לפי הבחירה — בדקו שהמקצוע/מטלה רלוונטיים לתלמיד";
    }
    return "לא נמצאו שורות לפי הבחירה — בדקו שהמקצוע/מטלה רלוונטיים לכיתה";
  }

  function noStudentsMessage(): string {
    if (scopeMode === "gradeYear") return "אין תלמידים בשכבה זו";
    if (scopeMode === "student") return "תלמיד לא נמצא";
    return "אין תלמידים בכיתה זו";
  }

  async function downloadFilledTemplate() {
    if (!templateData || !scopeReady) return;
    const scopedStudents = templateData.classStudents ?? [];
    if (scopedStudents.length === 0) return;

    setDownloading("filled");
    try {
      const res = await fetch(
        `/api/grades/import/filled-template?${buildFilledTemplateQuery()}`
      );
      const data = (await res.json()) as {
        className: string;
        statuses: string[];
        rows: FullGradesTemplateRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "שגיאה בהורדת הקובץ");
        return;
      }
      if (data.rows.length === 0) {
        setError(emptyRowsMessage());
        return;
      }
      await downloadFullGradesTemplate(buildFilledFilename(), {
        className: data.className,
        statuses: data.statuses,
        rows: data.rows,
        title: buildFilledTitle(data.rows.length),
      });
    } catch {
      setError("שגיאת רשת בהורדת הקובץ");
    } finally {
      setDownloading(null);
    }
  }

  async function downloadFullScopeFile() {
    if (!scopeReady) return;
    setDownloading("full");
    try {
      const res = await fetch(
        `/api/grades/import/full-template?${buildScopeParams().toString()}`
      );
      const data = (await res.json()) as {
        className: string;
        statuses: string[];
        rows: FullGradesTemplateRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "שגיאה בהורדת הקובץ");
        return;
      }
      const safeName = scopeDisplayName();
      await downloadFullGradesTemplate(
        `ציונים_מלא_${safeName}_${exportTimestamp()}.xlsx`,
        { className: data.className, statuses: data.statuses, rows: data.rows }
      );
    } catch {
      setError("שגיאת רשת בהורדת הקובץ");
    } finally {
      setDownloading(null);
    }
  }

  const studentCount =
    templateData?.studentCount ?? templateData?.classStudents?.length ?? 0;

  const filledButtonLabel =
    studentCount > 0
      ? scopeMode === "student"
        ? "תבנית לפי בחירה (תלמיד אחד)"
        : `תבנית לפי בחירה (${studentCount} תלמידים)`
      : "תבנית לפי בחירה";

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">העלאת קובץ ציונים</h2>
          <p className="mt-2 text-sm text-slate-500">
            הקובץ צריך לכלול: כיתה, מקצוע, מטלה, שם תלמיד, ציון/הערכה, סטטוס
            (ובמידת הצורך גם רכיב/תת-מטלה).
            למעורבות חברתית בעמודת הציון יש להזין: לא עבר, עבר, עבר בהצלחה או עבר בהצטיינות.
            כדי למחוק ציון שהוזן בטעות — השאירו את תא הציון ריק ובסטטוס בחרו «לא התחיל».
          </p>

          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">שינוי אחוזי שקלול למועד מסוים</p>
            <p className="mt-1">
              עמודת «אחוז שקלול (%)» מגיעה מלאה באחוז שחל היום על התלמיד. שינוי
              הערך חל על ההזנה של אותו תלמיד בלבד — הגדרת המקצוע לא משתנה, ושאר
              התלמידים ממשיכים באחוזי ברירת המחדל.
            </p>
            <p className="mt-1">
              היתרה עד 100% מתחלקת אוטומטית בין שאר הרכיבים: אם באנגלית שאלון E
              ברירת המחדל היא 70% בחינה ו-30% הגשה, מספיק לכתוב 60 בשורת הבחינה
              וההגשה תהפוך ל-40% לאותם תלמידים. להחזרת ברירת המחדל — כתבו שוב את
              האחוז המקורי.
            </p>
          </div>

          <div className="mt-6">
            <FileUpload file={file} onFileChange={setFile} />
          </div>

          <div className="mt-6">
            <Button onClick={handleImport} disabled={!file || loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {loading ? "מייבא..." : "ייבוא"}
            </Button>
          </div>

          {error && (
            <Alert variant="error" className="mt-4" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <Alert
                variant={result.updated > 0 ? "success" : "warning"}
                title="הייבוא הושלם"
                onClose={() => setResult(null)}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.updated} ציונים עודכנו, {result.skipped} דולגו
                </span>
              </Alert>
              {result.errors.length > 0 && (
                <Alert variant="error" title={`שגיאות בייבוא (${result.errors.length})`}>
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs leading-relaxed">
                    {result.errors.map((e, i) => (
                      <li key={i} className="border-b border-red-100 pb-2 last:border-b-0 last:pb-0">
                        {e}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">הורדת תבנית</h2>
            <p className="mt-2 text-sm text-slate-500">
              תבנית אקסל עם רשימות בחירה לכיתה, מקצוע, מטלה וסטטוס
            </p>

            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => void downloadEmptyTemplate()}
                disabled={!templateData || downloading !== null}
              >
                {downloading === "empty" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                תבנית ריקה
              </Button>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-700">
                תבנית מוכנה עם תלמידים
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                הורידו קובץ עם שמות התלמידים וציונים קיימים — נשאר רק למלא את
                התאים הריקים. ניתן לבחור לפי שכבה, לפי כיתה או לפי תלמיד, ולסנן
                לפי מקצוע, מטלה או תת-מטלה.
              </p>

              <div className="mt-4 mb-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={scopeMode === "gradeYear" ? "primary" : "secondary"}
                  onClick={() => setScopeMode("gradeYear")}
                >
                  לפי שכבה
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scopeMode === "class" ? "primary" : "secondary"}
                  onClick={() => setScopeMode("class")}
                >
                  לפי כיתה
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scopeMode === "student" ? "primary" : "secondary"}
                  onClick={() => setScopeMode("student")}
                >
                  לפי תלמיד
                </Button>
              </div>

              <div className="mt-4 grid gap-3">
                {scopeMode === "gradeYear" ? (
                  <Select
                    label="שכבה"
                    value={gradeYear}
                    onChange={(e) => setGradeYear(e.target.value)}
                  >
                    <option value="">— בחר שכבה —</option>
                    {availableGradeYears.map((gy) => (
                      <option key={gy} value={gy}>
                        {gy}
                      </option>
                    ))}
                  </Select>
                ) : scopeMode === "class" ? (
                  <Select
                    label="כיתה"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                  >
                    <option value="">— בחר כיתה —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.gradeYear ? ` (${c.gradeYear})` : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div>
                    <label className="label">תלמיד</label>
                    <StudentCombobox
                      students={comboboxStudents}
                      selectedId={studentId}
                      onSelect={setStudentId}
                    />
                  </div>
                )}

                <Select
                  label="מקצוע (אופציונלי)"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  disabled={!scopeReady || templateLoading}
                >
                  <option value="">— כל המקצועות —</option>
                  {(templateData?.subjectOptions ?? []).map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="מטלה (אופציונלי)"
                  value={obligationLabel}
                  onChange={(e) => setObligationLabel(e.target.value)}
                  disabled={!subjectId}
                >
                  <option value="">— כל המטלות —</option>
                  {obligationOptions.map((o) => (
                    <option key={o.id} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                {taskOptions.length > 0 && (
                  <Select
                    label="תת-מטלה (אופציונלי)"
                    value={taskSortOrder}
                    onChange={(e) => setTaskSortOrder(e.target.value)}
                  >
                    <option value="">— כל תתי המטלות —</option>
                    {taskOptions.map((task) => (
                      <option key={task.sortOrder} value={String(task.sortOrder)}>
                        {task.taskName}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  onClick={() => void downloadFilledTemplate()}
                  disabled={!scopeReady || !templateData || studentCount === 0 || downloading !== null}
                >
                  {downloading === "filled" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {filledButtonLabel}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => void downloadFullScopeFile()}
                  disabled={!scopeReady || studentCount === 0 || downloading !== null}
                >
                  {downloading === "full" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  קובץ מלא — כל המטלות והרכיבים
                </Button>
              </div>

              {scopeReady && !templateLoading && studentCount === 0 && (
                <p className="mt-2 text-sm text-amber-600">
                  {noStudentsMessage()}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">הוראות</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-2">
                <span className="font-bold text-primary-600">1.</span>
                הורידו תבנית ריקה או תבנית עם תלמידים לפי שכבה, כיתה או תלמיד
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary-600">2.</span>
                בחרו שכבה, כיתה או תלמיד, ואופציונלית מקצוע / מטלה / תת-מטלה
                לסינון הקובץ
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary-600">3.</span>
                ציונים שכבר הוזנו יופיעו בקובץ — מלאו רק תאים ריקים. למחיקת
                ציון: רוקנו את תא הציון ובסטטוס בחרו «לא התחיל»
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-primary-600">4.</span>
                שורות עם שגיאות ידווחו — שאר השורות ייובאו
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
