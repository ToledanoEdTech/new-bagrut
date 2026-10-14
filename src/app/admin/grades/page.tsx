"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SubjectCard } from "@/components/subjects/SubjectCard";
import {
  calcWeightedComponentScore,
  calcPartialWeightedSubItemScore,
  completeWeightOverrides,
  getObligationWeightItems,
  normalizeComponents,
  normalizeSubItems,
  applyWeightOverrides,
  resolveObligationGradeScore,
  roundGradeScore,
} from "@/lib/grade-components";
import { calcSubjectProgressForObligations } from "@/lib/progress";
import { autoStatusOnScore, emptyGradeFields } from "@/lib/grade-status";
import type { ObligationClassGradeYearOverride, QualitativeLevel, SubmissionStatus } from "@/lib/types";
import { Save, Loader2, ChevronRight, ChevronLeft, ArrowLeft, AlertCircle, Check } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { StudentCombobox } from "@/components/students/StudentCombobox";
import { Alert } from "@/components/ui/Alert";
import { ExportButton } from "@/components/ui/ExportButton";
import { UnsavedChangesBanner } from "@/components/ui/UnsavedChangesBanner";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  buildStudentGradesSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import { prefetch, invalidateCache, invalidateStudentDashboardCaches } from "@/lib/api-cache";

type Student = {
  id: string;
  mathUnits: number;
  englishUnits: number;
  user: { name: string };
  class: { id: string; examPathId: string; name: string; gradeYear?: string | null };
  track: { id: string; name: string } | null;
};

type Subject = {
  id: string;
  name: string;
  pathLabels?: string[];
  displayName?: string;
  category?: string | null;
  units: number | null;
  obligations: Array<{
    id: string;
    questionnaireNumber: string | null;
    name: string | null;
    weightPercent: number;
    examType: string;
    studyMaterial: string | null;
    examEvent: string | null;
    gradeYear: string | null;
    components: Array<{ name: string; weightPercent: number; sortOrder?: number }>;
    subItems: Array<{ name: string; weightPercent: number; sortOrder?: number }>;
  }>;
};

type Grade = {
  obligationId: string;
  score: number | null;
  qualitativeLevel?: QualitativeLevel | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  componentWeightOverrides?: Record<number, number> | null;
  subItemWeightOverrides?: Record<number, number> | null;
  status: string;
};

type GradeRow = {
  obligationId: string;
  score: number | null;
  qualitativeLevel?: QualitativeLevel | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  componentWeightOverrides?: Record<number, number> | null;
  subItemWeightOverrides?: Record<number, number> | null;
  status: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function GradesPage() {
  const confirm = useConfirm();
  const { data: students = [], loading: studentsLoading } = useApi<Student[]>("/api/students");
  const { data: obligationGradeYearOverrides = [] } = useApi<
    ObligationClassGradeYearOverride[]
  >("/api/obligations/grade-year-overrides");
  const [classFilter, setClassFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [jumpSubjectId, setJumpSubjectId] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs mirroring the latest state, used by flush handlers (navigation / unmount / tab close)
  // so we always save the most recent values without re-creating the handlers.
  const gradesRef = useRef<Grade[]>([]);
  const savedSnapshotRef = useRef("");
  const selectedIdRef = useRef("");
  const savingRef = useRef(false);
  const isDirtyRef = useRef(false);
  // Tracks which student is currently loaded into the editor, so a background
  // refetch of the same student does not clobber edits that are in progress.
  const hydratedStudentRef = useRef<string | null>(null);

  // How long to wait after the last keystroke before auto-saving. Long enough that
  // typing a full multi-digit grade does not trigger a mid-entry save.
  const AUTOSAVE_DELAY_MS = 2500;

  const filteredStudents = useMemo(() => {
    const list = classFilter
      ? students.filter((s) => s.class?.id === classFilter)
      : students;
    return [...list].sort((a, b) =>
      a.user.name.localeCompare(b.user.name, "he")
    );
  }, [students, classFilter]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (s.class?.id) map.set(s.class.id, s.class.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [students]);

  const currentIndex = filteredStudents.findIndex((s) => s.id === selectedId);

  const gradesKey = selectedId ? `/api/grades?studentId=${selectedId}` : null;
  const subjectsKey = selectedId ? `/api/students/subjects?studentId=${selectedId}` : null;

  const { data: gradesData, loading: gradesLoading } = useApi<GradeRow[]>(gradesKey);
  const { data: subjects = [], loading: subjectsLoading } = useApi<Subject[]>(subjectsKey);

  const loading = !!selectedId && (gradesLoading || subjectsLoading) && grades.length === 0 && subjects.length === 0;
  const isDirty = savedSnapshot !== "" && JSON.stringify(grades) !== savedSnapshot;

  useEffect(() => {
    gradesRef.current = grades;
  }, [grades]);
  useEffect(() => {
    savedSnapshotRef.current = savedSnapshot;
  }, [savedSnapshot]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!selectedId) return;
    prefetch(`/api/grades?studentId=${selectedId}`);
    prefetch(`/api/students/subjects?studentId=${selectedId}`);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setGrades([]);
      setSavedSnapshot("");
      hydratedStudentRef.current = null;
      return;
    }
    if (!gradesData) return;
    // Once this student's data is loaded, never overwrite the editor from a
    // background refetch while there are unsaved edits — that was clobbering
    // grades the user was still typing.
    if (hydratedStudentRef.current === selectedId && isDirtyRef.current) return;

    const initial = gradesData.map((g) => ({
      obligationId: g.obligationId,
      score: g.score,
      qualitativeLevel: g.qualitativeLevel ?? null,
      componentScores: g.componentScores ?? null,
      subItemScores: g.subItemScores ?? null,
      componentWeightOverrides: g.componentWeightOverrides ?? null,
      subItemWeightOverrides: g.subItemWeightOverrides ?? null,
      status: g.status,
    }));
    setGrades(initial);
    setSavedSnapshot(JSON.stringify(initial));
    setSaveState("idle");
    setSaveError(null);
    hydratedStudentRef.current = selectedId;
  }, [gradesData, selectedId]);

  const saveGrades = useCallback(async () => {
    if (!selectedId) return false;
    // Snapshot the exact payload we send so the "saved" marker matches what was
    // persisted, even if the user keeps typing while the request is in flight.
    const payload = gradesRef.current;
    const payloadSnapshot = JSON.stringify(payload);
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/grades", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedId, grades: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveState("error");
        setSaveError((data as { error?: string }).error ?? "שגיאה בשמירה");
        return false;
      }
      setSavedSnapshot(payloadSnapshot);
      setSaveState("saved");
      // Invalidate so other views (dashboards, matrix) refetch fresh data, but do
      // NOT force-refetch into this editor — that would overwrite live edits.
      invalidateCache(`/api/grades?studentId=${selectedId}`);
      invalidateStudentDashboardCaches(selectedId);
      return true;
    } catch {
      setSaveState("error");
      setSaveError("שגיאת רשת בשמירה");
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !isDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveGrades();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [grades, selectedId, isDirty, saveGrades]);

  // Flush any pending edits when leaving the page or closing the tab, so a grade
  // typed just before navigating away is not lost. Uses keepalive so the request
  // survives the page teardown.
  useEffect(() => {
    function flushOnExit() {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const studentId = selectedIdRef.current;
      if (!studentId || !isDirtyRef.current || savingRef.current) return;
      try {
        fetch("/api/grades", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, grades: gradesRef.current }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // best-effort only
      }
    }

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      flushOnExit();
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushOnExit();
    };
  }, []);

  function handleGradeChange(obligationId: string, field: string, value: string | number | null) {
    setGrades((prev) => {
      const obligation = subjects
        .flatMap((s) => s.obligations)
        .find((o) => o.id === obligationId);
      const existing = prev.find((g) => g.obligationId === obligationId);

      /**
       * אחוזי שקלול מותאמים חלים על ההזנה של התלמיד הזה בלבד.
       * היתרה עד 100% מתחלקת אוטומטית בין שאר הרכיבים.
       */
      if (
        field === "weightReset" ||
        field.startsWith("componentWeight:") ||
        field.startsWith("subItemWeight:")
      ) {
        if (!obligation) return prev;
        const { kind, items } = getObligationWeightItems(obligation);
        const base: GradeRow = existing ?? {
          obligationId,
          score: null,
          qualitativeLevel: null,
          componentScores: null,
          subItemScores: null,
          componentWeightOverrides: null,
          subItemWeightOverrides: null,
          status: "NOT_STARTED",
        };

        let overrides: Record<number, number> | null = null;
        if (field !== "weightReset") {
          const sortOrder = Number(field.split(":")[1]);
          const item = items.find((i) => i.sortOrder === sortOrder);
          if (!item) return prev;
          // ניקוי השדה מחזיר את הרכיב לאחוז ברירת המחדל שלו
          const requested =
            value == null || value === "" ? item.weightPercent : Number(value);
          if (isNaN(requested) || requested < 0 || requested > 100) return prev;
          const completed = completeWeightOverrides({
            items,
            current:
              kind === "subItem"
                ? base.subItemWeightOverrides
                : base.componentWeightOverrides,
            explicit: { [sortOrder]: requested },
          });
          if (!completed.ok) return prev;
          overrides = completed.overrides;
        }

        const next: GradeRow = {
          ...base,
          componentWeightOverrides: kind === "component" ? overrides : null,
          subItemWeightOverrides: kind === "subItem" ? overrides : null,
        };
        next.score = resolveObligationGradeScore(obligation, next);

        return existing
          ? prev.map((g) => (g.obligationId === obligationId ? next : g))
          : [...prev, next];
      }

      if (field.startsWith("componentScore:")) {
        const sortOrder = Number(field.split(":")[1]);
        const rawScores = {
          ...(existing?.componentScores ?? {}),
          [sortOrder]: value as number | null,
        };
        const hasAnyScore = Object.values(rawScores).some((s) => s != null);
        const componentScores = hasAnyScore ? rawScores : null;
        const score = obligation && componentScores
          ? calcWeightedComponentScore(
              applyWeightOverrides(
                normalizeComponents(obligation.components),
                existing?.componentWeightOverrides
              ),
              componentScores
            )
          : null;
        const status = (existing?.status ?? "NOT_STARTED") as SubmissionStatus;
        const nextStatus = autoStatusOnScore(hasAnyScore ? (score ?? 0) : null, status);

        if (existing) {
          return prev.map((g) =>
            g.obligationId === obligationId
              ? { ...g, componentScores, score, status: nextStatus }
              : g
          );
        }
        return [
          ...prev,
          {
            obligationId,
            score,
            componentScores,
            subItemScores: null,
            status: nextStatus,
          },
        ];
      }

      if (field.startsWith("subItemScore:")) {
        const sortOrder = Number(field.split(":")[1]);
        const rawScores = {
          ...(existing?.subItemScores ?? {}),
          [sortOrder]: value as number | null,
        };
        const hasAnyScore = Object.values(rawScores).some((s) => s != null);
        const subItemScores = hasAnyScore ? rawScores : null;
        const score = obligation && subItemScores
          ? calcPartialWeightedSubItemScore(
              applyWeightOverrides(
                normalizeSubItems(obligation.subItems),
                existing?.subItemWeightOverrides
              ),
              subItemScores
            )
          : null;
        const status = (existing?.status ?? "NOT_STARTED") as SubmissionStatus;
        const nextStatus = autoStatusOnScore(hasAnyScore ? (score ?? 0) : null, status);

        if (existing) {
          return prev.map((g) =>
            g.obligationId === obligationId
              ? { ...g, subItemScores, score, status: nextStatus }
              : g
          );
        }
        return [
          ...prev,
          {
            obligationId,
            score,
            componentScores: null,
            subItemScores,
            status: nextStatus,
          },
        ];
      }

      if (existing) {
        const next = { ...existing, [field]: value };
        if (field === "score") {
          const rounded =
            value == null || value === ""
              ? null
              : roundGradeScore(Number(value));
          next.score = rounded;
          next.status = autoStatusOnScore(
            rounded,
            existing.status as SubmissionStatus
          );
        }
        if (field === "qualitativeLevel") {
          next.score = null;
          next.status = value
            ? autoStatusOnScore(0, existing.status as SubmissionStatus)
            : autoStatusOnScore(null, existing.status as SubmissionStatus);
        }
        return prev.map((g) => (g.obligationId === obligationId ? next : g));
      }
      const roundedScore =
        field === "score" && value != null && value !== ""
          ? roundGradeScore(Number(value))
          : field === "score"
            ? null
            : null;
      return [
        ...prev,
        {
          obligationId,
          score: field === "score" ? roundedScore : null,
          qualitativeLevel: field === "qualitativeLevel" ? (value as QualitativeLevel | null) : null,
          componentScores: null,
          subItemScores: null,
          status:
            field === "status"
              ? (value as string)
              : field === "qualitativeLevel" && value
                ? autoStatusOnScore(0, "NOT_STARTED")
                : field === "score"
                  ? autoStatusOnScore(roundedScore, "NOT_STARTED")
                  : "NOT_STARTED",
        },
      ];
    });
    setSaveState("idle");
  }

  function handleGradeClear(obligationId: string) {
    const empty = emptyGradeFields();
    setGrades((prev) => {
      const existing = prev.find((g) => g.obligationId === obligationId);
      if (existing) {
        return prev.map((g) =>
          g.obligationId === obligationId
            ? {
                ...g,
                score: empty.score,
                qualitativeLevel: empty.qualitativeLevel,
                componentScores: empty.componentScores,
                subItemScores: empty.subItemScores,
                componentWeightOverrides: empty.componentWeightOverrides,
                subItemWeightOverrides: empty.subItemWeightOverrides,
                status: empty.status,
              }
            : g
        );
      }
      return [
        ...prev,
        {
          obligationId,
          score: empty.score,
          qualitativeLevel: empty.qualitativeLevel,
          componentScores: empty.componentScores,
          subItemScores: empty.subItemScores,
          componentWeightOverrides: empty.componentWeightOverrides,
          subItemWeightOverrides: empty.subItemWeightOverrides,
          status: empty.status,
        },
      ];
    });
    setSaveState("idle");
  }

  // Save any pending edits before switching students. Returns false only if the
  // save failed and the user chose not to proceed (to avoid silent data loss).
  async function flushBeforeLeaving(): Promise<boolean> {
    if (!isDirty) return true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const ok = await saveGrades();
    if (ok) return true;
    return confirm({
      title: "השמירה נכשלה",
      description: "לא הצלחנו לשמור את השינויים. לעבור לתלמיד אחר בכל זאת? השינויים שלא נשמרו ייאבדו.",
      confirmLabel: "עבור בכל זאת",
      variant: "danger",
    });
  }

  async function navigateStudent(direction: -1 | 1) {
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= filteredStudents.length) return;
    if (!(await flushBeforeLeaving())) return;
    setSelectedId(filteredStudents[nextIndex]!.id);
  }

  async function selectStudent(id: string) {
    if (id === selectedId) return;
    if (!(await flushBeforeLeaving())) return;
    setSelectedId(id);
  }

  function jumpToSubject(subjectId: string) {
    if (!subjectId) return;
    document.getElementById(`subject-${subjectId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setJumpSubjectId(subjectId);
  }

  const selectedStudent = students.find((s) => s.id === selectedId);

  async function handleExport() {
    if (!selectedStudent) return;
    await downloadExcel(
      `ציונים_${selectedStudent.user.name}_${exportTimestamp()}.xlsx`,
      [
        buildStudentGradesSheet(
          selectedStudent.user.name,
          selectedStudent.class.name,
          subjects,
          grades
        ),
      ]
    );
  }

  if (studentsLoading && students.length === 0) {
    return <PageLoader variant="skeleton" />;
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <ExportButton
          onExport={handleExport}
          disabled={!selectedId || subjects.length === 0}
          label="ייצוא ציונים"
          className="w-full sm:w-auto"
        />
        <Link href="/admin/grades/matrix" className="btn-secondary w-full justify-center sm:w-auto">
          <ArrowLeft className="h-4 w-4" />
          הזנה לפי מטלה
        </Link>
      </div>

      <UnsavedChangesBanner visible={isDirty && saveState !== "saving"}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void saveGrades()}
          disabled={saveState === "saving"}
        >
          <Save className="h-3.5 w-3.5" />
          שמור עכשיו
        </Button>
      </UnsavedChangesBanner>

      {saveError && (
        <Alert variant="error" className="mt-4" onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}

      {selectedStudent && (
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200/70 bg-white/95 px-4 py-3 backdrop-blur-md lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-slate-900">
                {selectedStudent.user.name}
              </p>
              <p className="text-sm text-slate-500">
                {selectedStudent.class.name}
                {" · "}מתמטיקה {selectedStudent.mathUnits}
                {" · "}אנגלית {selectedStudent.englishUnits}
                {selectedStudent.track && ` · ${selectedStudent.track.name}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-sm">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={currentIndex <= 0}
                  onClick={() => navigateStudent(-1)}
                  aria-label="תלמיד קודם"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={currentIndex < 0 || currentIndex >= filteredStudents.length - 1}
                  onClick={() => navigateStudent(1)}
                  aria-label="תלמיד הבא"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  שומר...
                </span>
              )}
              {saveState === "saved" && !isDirty && (
                <span className="badge-success flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  נשמר
                </span>
              )}
              {saveState === "error" && (
                <span className="badge-danger flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  שגיאה
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="mt-4 p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <Select
            label="סנן לפי כיתה"
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setSelectedId("");
            }}
          >
            <option value="">כל הכיתות</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div>
            <label className="label">בחר תלמיד</label>
            <StudentCombobox
              students={filteredStudents}
              selectedId={selectedId}
              onSelect={(id) => void selectStudent(id)}
            />
          </div>
        </div>

        {subjects.length > 0 && (
          <div className="mt-4 max-w-md">
            <Select
              label="קפיצה למקצוע"
              value={jumpSubjectId}
              onChange={(e) => jumpToSubject(e.target.value)}
            >
              <option value="">— בחר מקצוע —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName ?? s.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      {loading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && selectedId && subjects.length > 0 && (
        <div className="mt-4 space-y-4">
            {subjects.map((subject) => {
              const subjectGrades = grades
                .filter((g) => subject.obligations.some((o) => o.id === g.obligationId))
                .map((g) => {
                  const obligation = subject.obligations.find((o) => o.id === g.obligationId);
                  if (!obligation) return g;
                  return {
                    ...g,
                    score: resolveObligationGradeScore(obligation, g),
                  };
                });
              const progress = calcSubjectProgressForObligations(
                subject.obligations,
                subjectGrades,
                selectedStudent?.class.gradeYear,
                { name: subject.name, category: subject.category }
              );

              return (
                <div key={subject.id} id={`subject-${subject.id}`} className="scroll-mt-28">
                  <SubjectCard
                    name={subject.name}
                    pathLabels={subject.pathLabels}
                    category={subject.category}
                    units={subject.units}
                    obligations={subject.obligations}
                    grades={subjectGrades}
                    progress={progress}
                    studentGradeYear={selectedStudent?.class.gradeYear}
                    classId={selectedStudent?.class.id}
                    obligationGradeYearOverrides={obligationGradeYearOverrides}
                    readOnly={false}
                    onGradeChange={handleGradeChange}
                    onGradeClear={handleGradeClear}
                  />
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}
