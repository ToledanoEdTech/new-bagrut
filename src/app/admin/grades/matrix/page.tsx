"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { ExportButton } from "@/components/ui/ExportButton";
import { useToast } from "@/components/ui/Toast";
import {
  GradeMatrixTable,
  type MatrixField,
  type MatrixRow,
  type MatrixWeightColumn,
} from "@/components/grades/GradeMatrixTable";
import { invalidateCache, invalidateStudentDashboardCaches } from "@/lib/api-cache";
import {
  buildMatrixSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import {
  makeMatrixTaskKey,
  matrixTaskLabel,
  parseMatrixTaskKey,
} from "@/lib/grade-components";
import { autoStatusOnScore, emptyGradeFields } from "@/lib/grade-status";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";
import {
  SOCIAL_INVOLVEMENT_LABELS,
  SOCIAL_INVOLVEMENT_LEVELS,
  formatQualitativeLevel,
  isSocialInvolvementSubject,
  isValidQualitativeLevel,
} from "@/lib/social-involvement";
import type { QualitativeLevel, SubmissionStatus } from "@/lib/types";

type ScopeMode = "class" | "gradeYear";

type ClassItem = { id: string; name: string; gradeYear: string | null };

type MatrixTask = {
  id: string;
  taskKind: "subItem" | "component" | "single";
  sortOrder: number;
  taskName: string;
  questionnaireNumber: string | null;
  name: string | null;
  relevantStudentCount: number;
  label: string;
};

type MatrixOptions = {
  subjects: Array<{
    id: string;
    name: string;
    displayName?: string;
    pathLabels?: string[];
    category?: string | null;
    units: number | null;
    tasks: MatrixTask[];
  }>;
};

type MatrixData = {
  class: { id: string; name: string; gradeYear: string | null } | null;
  gradeYear?: string | null;
  subject: {
    id: string;
    name: string;
    displayName?: string;
    pathLabels?: string[];
    category?: string | null;
    units: number | null;
  };
  obligation: {
    id: string;
    name: string | null;
    questionnaireNumber: string | null;
    weightPercent: number;
    examType: string;
    taskKind: "subItem" | "component" | "single" | null;
    taskSortOrder: number | null;
    components: Array<{ name: string; weightPercent: number; sortOrder: number }>;
    weightKind: "component" | "subItem";
    weightEditable: boolean;
    taskDefaultWeightPercent: number | null;
    otherWeightPartNames: string[];
  };
  rows: Array<{
    studentId: string;
    studentName: string;
    classId?: string;
    className?: string;
    weightPercent: number | null;
    grade: {
      score: number | null;
      resolvedScore?: number | null;
      qualitativeLevel?: QualitativeLevel | null;
      componentScores?: Record<number, number | null> | null;
      subItemScores?: Record<number, number | null> | null;
      componentWeightOverrides?: Record<number, number> | null;
      subItemWeightOverrides?: Record<number, number> | null;
      status: SubmissionStatus;
      notes: string | null;
    } | null;
  }>;
  notRelevantCount: number;
};

type RowState = Record<
  string,
  {
    score: number | null;
    qualitativeLevel: QualitativeLevel | null;
    /** אחוז השקלול של המשבצת הנבחרת אצל התלמיד (null = ברירת המחדל) */
    weightPercent: number | null;
    status: SubmissionStatus;
  }
>;

const EMPTY_ROW: RowState[string] = {
  score: null,
  qualitativeLevel: null,
  weightPercent: null,
  status: "NOT_STARTED",
};

export default function GradesMatrixPage() {
  return (
    <Suspense fallback={<PageLoader variant="table" />}>
      <GradesMatrixPageContent />
    </Suspense>
  );
}

function GradesMatrixPageContent() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const initialClassId = searchParams.get("classId") ?? "";
  const initialGradeYear = normalizeGradeYear(searchParams.get("gradeYear")) ?? "";
  const initialSubjectId = searchParams.get("subjectId") ?? "";
  const initialObligationId = searchParams.get("obligationId");

  const { data: classes = [], loading: classesLoading } = useApi<ClassItem[]>("/api/classes/list");
  const [scopeMode, setScopeMode] = useState<ScopeMode>(
    initialClassId ? "class" : "gradeYear"
  );
  const [classId, setClassId] = useState(initialClassId);
  const [gradeYear, setGradeYear] = useState(initialGradeYear);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [taskKey, setTaskKey] = useState("");
  const [rowState, setRowState] = useState<RowState>({});
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bulkScore, setBulkScore] = useState("");
  const [bulkLevel, setBulkLevel] = useState<QualitativeLevel | "">("");
  const [bulkWeight, setBulkWeight] = useState("");
  const pendingObligationId = useRef<string | null>(initialObligationId);
  /** Skip cascade resets caused by initial URL hydration */
  const suppressCascade = useRef(
    !!(initialClassId || initialGradeYear || initialSubjectId)
  );

  const parsedTask = parseMatrixTaskKey(taskKey);

  const availableGradeYears = useMemo(() => {
    const present = new Set(
      classes
        .map((c) => normalizeGradeYear(c.gradeYear))
        .filter((gy): gy is string => !!gy)
    );
    return CANONICAL_GRADE_YEARS.filter((gy) => present.has(gy));
  }, [classes]);

  const scopeReady =
    scopeMode === "class" ? !!classId : !!gradeYear;

  const optionsKey = scopeReady
    ? scopeMode === "class"
      ? `/api/grades/matrix/options?classId=${encodeURIComponent(classId)}`
      : `/api/grades/matrix/options?gradeYear=${encodeURIComponent(gradeYear)}`
    : null;
  const { data: options, loading: optionsLoading, error: optionsError } =
    useApi<MatrixOptions>(optionsKey);

  const matrixKey =
    scopeReady && parsedTask
      ? scopeMode === "class"
        ? `/api/grades/matrix?classId=${encodeURIComponent(classId)}&obligationId=${parsedTask.obligationId}&taskKind=${parsedTask.taskKind}&taskSortOrder=${parsedTask.sortOrder}`
        : `/api/grades/matrix?gradeYear=${encodeURIComponent(gradeYear)}&obligationId=${parsedTask.obligationId}&taskKind=${parsedTask.taskKind}&taskSortOrder=${parsedTask.sortOrder}`
      : null;
  const {
    data: matrixData,
    loading: matrixLoading,
    mutate: refreshMatrix,
    error: matrixError,
  } = useApi<MatrixData>(matrixKey);

  const components = matrixData?.obligation.components ?? [];
  const isSocial = matrixData
    ? isSocialInvolvementSubject(matrixData.subject)
    : false;
  const showClass = scopeMode === "gradeYear";

  useEffect(() => {
    if (suppressCascade.current) return;
    setClassId("");
    setGradeYear("");
    setSubjectId("");
    setTaskKey("");
    setRowState({});
    setSavedSnapshot("");
  }, [scopeMode]);

  useEffect(() => {
    if (suppressCascade.current) {
      suppressCascade.current = false;
      return;
    }
    setSubjectId("");
    setTaskKey("");
    setRowState({});
    setSavedSnapshot("");
  }, [classId, gradeYear]);

  useEffect(() => {
    if (pendingObligationId.current) return;
    setTaskKey("");
    setRowState({});
    setSavedSnapshot("");
  }, [subjectId]);

  useEffect(() => {
    if (!matrixData) {
      setRowState({});
      setSavedSnapshot("");
      return;
    }
    const initial: RowState = {};
    for (const row of matrixData.rows) {
      initial[row.studentId] = {
        score: row.grade?.score ?? null,
        qualitativeLevel: row.grade?.qualitativeLevel ?? null,
        weightPercent: row.weightPercent ?? null,
        status: row.grade?.status ?? "NOT_STARTED",
      };
    }
    setRowState(initial);
    setSavedSnapshot(JSON.stringify(initial));
    setSaveError(null);
    setBulkScore("");
    setBulkLevel("");
    setBulkWeight("");
  }, [matrixData]);

  const selectedSubject = options?.subjects.find((s) => s.id === subjectId);
  const tasks = selectedSubject?.tasks ?? [];

  // Auto-select first task for deep-linked obligationId
  useEffect(() => {
    const obId = pendingObligationId.current;
    if (!obId || !options || !subjectId) return;
    const subject = options.subjects.find((s) => s.id === subjectId);
    const match = subject?.tasks.find((t) => t.id === obId);
    if (match) {
      setTaskKey(makeMatrixTaskKey(match.id, match.taskKind, match.sortOrder));
      pendingObligationId.current = null;
    }
  }, [options, subjectId]);

  const selectedTask = tasks.find(
    (t) =>
      parsedTask &&
      t.id === parsedTask.obligationId &&
      t.taskKind === parsedTask.taskKind &&
      t.sortOrder === parsedTask.sortOrder
  );

  const tableRows: MatrixRow[] = useMemo(() => {
    if (!matrixData) return [];
    return matrixData.rows.map((r) => ({
      studentId: r.studentId,
      studentName: r.studentName,
      className: r.className ?? null,
      score: rowState[r.studentId]?.score ?? null,
      resolvedScore: r.grade?.resolvedScore ?? null,
      qualitativeLevel: rowState[r.studentId]?.qualitativeLevel ?? null,
      componentScores: r.grade?.componentScores ?? null,
      componentWeightOverrides: r.grade?.componentWeightOverrides ?? null,
      weightPercent: rowState[r.studentId]?.weightPercent ?? null,
      status: rowState[r.studentId]?.status ?? "NOT_STARTED",
    }));
  }, [matrixData, rowState]);

  const weightColumn: MatrixWeightColumn | null = useMemo(() => {
    if (!matrixData?.obligation.weightEditable) return null;
    if (matrixData.obligation.taskDefaultWeightPercent == null) return null;
    return {
      defaultWeightPercent: matrixData.obligation.taskDefaultWeightPercent,
      otherPartNames: matrixData.obligation.otherWeightPartNames,
    };
  }, [matrixData]);

  const isDirty = savedSnapshot !== "" && JSON.stringify(rowState) !== savedSnapshot;

  function handleChange(
    studentId: string,
    field: MatrixField,
    value: number | null | SubmissionStatus | QualitativeLevel | ""
  ) {
    setRowState((prev) => {
      const current = prev[studentId] ?? EMPTY_ROW;

      if (field === "qualitativeLevel") {
        const level =
          value && isValidQualitativeLevel(String(value))
            ? (value as QualitativeLevel)
            : null;
        return {
          ...prev,
          [studentId]: {
            ...current,
            score: null,
            qualitativeLevel: level,
            status: autoStatusOnScore(level ? 0 : null, current.status),
          },
        };
      }

      if (field === "weightPercent") {
        const weight = value as number | null;
        return {
          ...prev,
          [studentId]: {
            ...current,
            weightPercent:
              weight == null || isNaN(weight) ? null : weight,
          },
        };
      }

      if (field === "score" || field.startsWith("componentScore:")) {
        const score = value as number | null;
        return {
          ...prev,
          [studentId]: {
            ...current,
            score,
            qualitativeLevel: null,
            status: autoStatusOnScore(score, current.status),
          },
        };
      }

      return {
        ...prev,
        [studentId]: { ...current, status: value as SubmissionStatus },
      };
    });
    setSaveError(null);
  }

  function handleClear(studentId: string) {
    const empty = emptyGradeFields();
    setRowState((prev) => ({
      ...prev,
      [studentId]: {
        score: empty.score,
        qualitativeLevel: empty.qualitativeLevel,
        // חוזרים לאחוז ברירת המחדל של המטלה
        weightPercent: weightColumn?.defaultWeightPercent ?? null,
        status: empty.status,
      },
    }));
    setSaveError(null);
  }

  function applyBulkWeight() {
    if (!weightColumn) return;
    const weight = parseFloat(bulkWeight);
    if (isNaN(weight) || weight < 0 || weight > 100) return;

    setRowState((prev) => {
      const next = { ...prev };
      for (const row of tableRows) {
        next[row.studentId] = {
          ...(next[row.studentId] ?? EMPTY_ROW),
          weightPercent: weight,
        };
      }
      return next;
    });
    setSaveError(null);
  }

  function applyBulkScore() {
    if (isSocial) {
      if (!bulkLevel || !isValidQualitativeLevel(bulkLevel)) return;
      setRowState((prev) => {
        const next = { ...prev };
        for (const row of tableRows) {
          if (next[row.studentId]?.qualitativeLevel == null) {
            next[row.studentId] = {
              ...(next[row.studentId] ?? EMPTY_ROW),
              score: null,
              qualitativeLevel: bulkLevel,
              status: "GRADED",
            };
          }
        }
        return next;
      });
      return;
    }

    const score = parseFloat(bulkScore);
    if (isNaN(score) || score < 0 || score > 100) return;

    setRowState((prev) => {
      const next = { ...prev };
      for (const row of tableRows) {
        if (next[row.studentId]?.score == null) {
          next[row.studentId] = {
            ...(next[row.studentId] ?? EMPTY_ROW),
            score,
            qualitativeLevel: null,
            status: "GRADED",
          };
        }
      }
      return next;
    });
  }

  async function saveGrades() {
    if (!parsedTask || !matrixData) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/grades/matrix", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId: parsedTask.obligationId,
          taskKind: parsedTask.taskKind,
          taskSortOrder: parsedTask.sortOrder,
          entries: matrixData.rows.map((r) => ({
            studentId: r.studentId,
            score: isSocial ? null : (rowState[r.studentId]?.score ?? null),
            qualitativeLevel: isSocial
              ? (rowState[r.studentId]?.qualitativeLevel ?? null)
              : null,
            // תא ריק = חזרה לאחוז ברירת המחדל של המטלה
            weightPercent: weightColumn
              ? (rowState[r.studentId]?.weightPercent ??
                weightColumn.defaultWeightPercent)
              : null,
            status: rowState[r.studentId]?.status ?? "NOT_STARTED",
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "שגיאה בשמירה");
        return;
      }
      setSavedSnapshot(JSON.stringify(rowState));
      toast.success("נשמר בהצלחה");
      invalidateCache("/api/grades");
      invalidateStudentDashboardCaches();
      await refreshMatrix();
    } catch {
      setSaveError("שגיאת רשת בשמירה");
    } finally {
      setSaving(false);
    }
  }

  const taskHeaderLabel =
    selectedTask?.label ??
    (matrixData
      ? matrixTaskLabel({
          name: matrixData.obligation.name,
          questionnaireNumber: matrixData.obligation.questionnaireNumber,
          taskName: matrixData.obligation.components[0]?.name ?? (isSocial ? "הערכה" : "ציון"),
        })
      : "");

  const scopeLabel =
    scopeMode === "class"
      ? matrixData?.class?.name ?? "כיתה"
      : matrixData?.gradeYear ?? gradeYear;

  async function handleExport() {
    if (!matrixData) return;
    const safeName = scopeLabel.replace(/[/\\?*[\]]/g, "-");
    await downloadExcel(`ציונים_${safeName}_${exportTimestamp()}.xlsx`, [
      buildMatrixSheet({
        className: scopeLabel,
        subjectName: matrixData.subject.displayName ?? matrixData.subject.name,
        taskLabel: taskHeaderLabel,
        scoreHeader: isSocial ? "הערכה" : "ציון",
        showClass,
        rows: tableRows.map((r) => ({
          studentName: r.studentName,
          className: r.className,
          score: isSocial
            ? formatQualitativeLevel(r.qualitativeLevel) ?? null
            : r.score,
          status: r.status,
        })),
      }),
    ]);
  }

  if (classesLoading && classes.length === 0) {
    return <PageLoader variant="table" />;
  }

  return (
    <>
      <Card className="p-4 sm:p-6">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            variant={scopeMode === "gradeYear" ? "primary" : "secondary"}
            onClick={() => setScopeMode("gradeYear")}
          >
            לפי שכבה
          </Button>
          <Button
            type="button"
            size="sm"
            className="w-full sm:w-auto"
            variant={scopeMode === "class" ? "primary" : "secondary"}
            onClick={() => setScopeMode("class")}
          >
            לפי כיתה
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
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
          ) : (
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
          )}

          <Select
            label="מקצוע"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={!scopeReady || optionsLoading}
          >
            <option value="">— בחר מקצוע —</option>
            {(options?.subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName ?? s.name}
                {s.units &&
                s.category !== "MATH" &&
                s.category !== "ENGLISH" &&
                s.category !== "SOCIAL"
                  ? ` (${s.units} יח"ל)`
                  : ""}
              </option>
            ))}
          </Select>

          <Select
            label="מטלה"
            value={taskKey}
            onChange={(e) => setTaskKey(e.target.value)}
            disabled={!subjectId}
          >
            <option value="">— בחר מטלה —</option>
            {tasks.map((t) => (
              <option
                key={makeMatrixTaskKey(t.id, t.taskKind, t.sortOrder)}
                value={makeMatrixTaskKey(t.id, t.taskKind, t.sortOrder)}
              >
                {t.label} ({t.relevantStudentCount} תלמידים)
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {(optionsError || matrixError) && (
        <Alert variant="error" className="mt-4">
          {matrixError ?? optionsError}
        </Alert>
      )}

      {scopeReady && subjectId && !optionsLoading && tasks.length === 0 && (
        <Alert variant="warning" className="mt-4">
          אין מטלות להזנה בשכבה/כיתה שנבחרו למקצוע זה. אם תת-המטלה מוגדרת לשכבה
          הזו בתוך מטלה של שכבה מאוחרת יותר — ודאו ששדה השכבה של תת-המטלה עצמה
          (לא רק של המטלה הגדולה) מוגדר לשכבה הנכונה.
        </Alert>
      )}

      {matrixLoading && taskKey && (
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      )}

      {!matrixLoading && matrixData && taskKey && (
        <>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0 text-sm text-slate-600">
              <span className="font-medium">{matrixData.rows.length} תלמידים</span>
              {matrixData.notRelevantCount > 0 && (
                <span className="me-2 text-slate-400">
                  • {matrixData.notRelevantCount} לא רלוונטיים{" "}
                  {scopeMode === "gradeYear" ? "לשכבה זו" : "לכיתה זו"}
                </span>
              )}
              <span className="mt-0.5 block break-words text-slate-500">
                {scopeLabel}
                {" — "}
                {matrixData.subject.displayName ?? matrixData.subject.name}
                {matrixData.subject.units &&
                matrixData.subject.category !== "MATH" &&
                matrixData.subject.category !== "ENGLISH" &&
                matrixData.subject.category !== "SOCIAL"
                  ? ` (${matrixData.subject.units} יח"ל)`
                  : ""}
                {" — "}
                {taskHeaderLabel}
              </span>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              {isDirty && (
                <span className="badge-warning self-start">שינויים לא שמורים</span>
              )}
              <div className="flex min-w-0 items-center gap-2">
                {isSocial ? (
                  <select
                    className="input min-w-0 flex-1 py-2 text-sm sm:w-40 sm:flex-none sm:py-1.5 sm:text-xs"
                    value={bulkLevel}
                    onChange={(e) =>
                      setBulkLevel((e.target.value || "") as QualitativeLevel | "")
                    }
                  >
                    <option value="">הערכה</option>
                    {SOCIAL_INVOLVEMENT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {SOCIAL_INVOLVEMENT_LABELS[level]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    className="w-20 shrink-0 py-2 text-sm sm:py-1.5 sm:text-xs"
                    placeholder="ציון"
                    value={bulkScore}
                    onChange={(e) => setBulkScore(e.target.value)}
                  />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-w-0 flex-1 sm:flex-none"
                  onClick={applyBulkScore}
                >
                  החל לכל הריקים
                </Button>
              </div>
              {weightColumn && (
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    className="w-20 shrink-0 py-2 text-sm sm:py-1.5 sm:text-xs"
                    placeholder="אחוז"
                    value={bulkWeight}
                    onChange={(e) => setBulkWeight(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-w-0 flex-1 sm:flex-none"
                    onClick={applyBulkWeight}
                  >
                    אחוז שקלול לכולם
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <Button
                  onClick={saveGrades}
                  disabled={saving || !isDirty}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  שמירה
                </Button>
                <ExportButton
                  onExport={handleExport}
                  disabled={tableRows.length === 0}
                  label="ייצוא"
                  size="sm"
                  className="w-full sm:w-auto"
                />
              </div>
            </div>
          </div>

          {saveError && (
            <Alert variant="error" className="mt-4" onClose={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}

          {weightColumn && (
            <Alert variant="info" className="mt-4">
              ניתן לשנות את אחוז השקלול של «{taskHeaderLabel}» לתלמידים מסוימים
              בהזנה זו בלבד — הגדרת המקצוע נשארת {weightColumn.defaultWeightPercent}%.
              {weightColumn.otherPartNames.length > 0 && (
                <>
                  {" "}
                  היתרה עד 100% תתחלק אוטומטית בין{" "}
                  {weightColumn.otherPartNames.join(", ")}.
                </>
              )}
            </Alert>
          )}

          <div className="mt-4">
            <GradeMatrixTable
              rows={tableRows}
              components={components}
              qualitative={isSocial}
              showClass={showClass}
              weightColumn={weightColumn}
              onChange={handleChange}
              onClear={handleClear}
            />
          </div>
        </>
      )}
    </>
  );
}
