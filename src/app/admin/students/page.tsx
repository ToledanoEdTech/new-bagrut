"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, Users, Info, Award, Cpu, ChevronLeft } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ExportButton } from "@/components/ui/ExportButton";
import { FilterBar } from "@/components/ui/FilterBar";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  StudentForm,
  type StudentFormData,
} from "@/components/students/StudentForm";
import { StudentCardView } from "@/components/students/StudentCardView";
import {
  buildStudentsSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";
import { useAuth } from "@/components/AuthProvider";
import { hasAnyStudentEdit, canViewOutstandingBagrut } from "@/lib/permissions";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";
import type { OutstandingBagrutResult } from "@/lib/outstanding-bagrut-core";
import type { HightechBagrutResult } from "@/lib/hightech-bagrut-core";

const UNIT_OPTIONS = [3, 4, 5] as const;

type OutstandingBagrutApiData = {
  byStudentId: Record<string, OutstandingBagrutResult>;
};

type HightechBagrutApiData = {
  byStudentId: Record<string, HightechBagrutResult>;
};

type Student = {
  id: string;
  mathUnits: number;
  englishUnits: number;
  mandatorySubjectIds: string[] | null;
  user: { name: string; email: string };
  class: { id: string; name: string; examPath: { id: string; label: string } } | null;
  tracks: { id: string; name: string }[];
  track: { id: string; name: string } | null;
};

type ClassOption = { id: string; name: string };
type ClassItem = { id: string; name: string; gradeYear: string | null; examPathId: string };
type TrackOption = { id: string; name: string };
type SubjectOption = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  pathLinks?: { path: { id: string; label: string; key: string } }[];
};

const emptyForm = (classes: ClassOption[]): StudentFormData => ({
  name: "",
  email: "",
  class: classes[0] ? { id: classes[0].id, name: classes[0].name } : { id: "", name: "" },
  trackIds: [],
  mathUnits: 3,
  englishUnits: 3,
  mandatorySubjectIds: null,
});

type ClassGroup = {
  id: string;
  name: string;
  gradeYear: string | null;
  examPathLabel: string | null;
  students: Student[];
};

export default function StudentsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="תלמידים" subtitle="טוען..." />
          <div className="mt-8">
            <PageLoader variant="table" />
          </div>
        </>
      }
    >
      <StudentsPageContent />
    </Suspense>
  );
}

function StudentsPageContent() {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canEdit = session ? hasAnyStudentEdit(session) : false;
  const canOutstandingBagrut = session ? canViewOutstandingBagrut(session) : false;
  const confirm = useConfirm();
  const toast = useToast();

  const { data: students = [], loading: studentsLoading, error: studentsError, mutate: refreshStudents } =
    useApi<Student[]>("/api/students");
  const { data: classesRaw = [], mutate: refreshClasses } = useApi<ClassItem[]>("/api/classes");
  const { data: tracks = [], mutate: refreshTracks } = useApi<TrackOption[]>("/api/tracks");
  const { data: allSubjects = [] } = useApi<SubjectOption[]>("/api/subjects");
  const { data: outstandingData } = useApi<OutstandingBagrutApiData>(
    canOutstandingBagrut ? "/api/students/outstanding-bagrut" : null
  );
  const { data: hightechData } = useApi<HightechBagrutApiData>(
    canOutstandingBagrut ? "/api/students/hightech-bagrut" : null
  );
  const classes: ClassOption[] = classesRaw.map((c) => ({ id: c.id, name: c.name }));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<StudentFormData | null>(null);
  const [newForm, setNewForm] = useState<StudentFormData>(() => emptyForm([]));
  const [saveError, setSaveError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editExamPathId, setEditExamPathId] = useState<string | null>(null);
  const [newExamPathId, setNewExamPathId] = useState<string | null>(null);

  const candidateFromUrl = searchParams.get("candidate");
  const initialCandidate: "all" | "outstanding" | "hightech" =
    candidateFromUrl === "outstanding" || candidateFromUrl === "hightech"
      ? candidateFromUrl
      : "all";

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [filterGradeYear, setFilterGradeYear] = useState(() => searchParams.get("grade") ?? "");
  const [filterClassId, setFilterClassId] = useState(() => searchParams.get("class") ?? "");
  const [filterTrackId, setFilterTrackId] = useState(() => searchParams.get("track") ?? "");
  const [filterMathUnits, setFilterMathUnits] = useState(() => searchParams.get("math") ?? "");
  const [filterEnglishUnits, setFilterEnglishUnits] = useState(
    () => searchParams.get("english") ?? ""
  );
  const [candidateFilter, setCandidateFilter] = useState<"all" | "outstanding" | "hightech">(
    initialCandidate
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const syncFiltersToUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (filterGradeYear) params.set("grade", filterGradeYear);
    if (filterClassId) params.set("class", filterClassId);
    if (filterTrackId) params.set("track", filterTrackId);
    if (filterMathUnits) params.set("math", filterMathUnits);
    if (filterEnglishUnits) params.set("english", filterEnglishUnits);
    if (candidateFilter !== "all") params.set("candidate", candidateFilter);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    router.replace(next, { scroll: false });
  }, [
    search,
    filterGradeYear,
    filterClassId,
    filterTrackId,
    filterMathUnits,
    filterEnglishUnits,
    candidateFilter,
    pathname,
    router,
  ]);

  useEffect(() => {
    const t = setTimeout(syncFiltersToUrl, 250);
    return () => clearTimeout(t);
  }, [syncFiltersToUrl]);

  const outstandingByStudentId = outstandingData?.byStudentId ?? {};
  const hightechByStudentId = hightechData?.byStudentId ?? {};
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const availableGradeYears = useMemo(() => {
    const present = new Set(
      classesRaw
        .map((c) => normalizeGradeYear(c.gradeYear))
        .filter((gy): gy is string => !!gy)
    );
    return CANONICAL_GRADE_YEARS.filter((gy) => present.has(gy));
  }, [classesRaw]);

  const classOptionsForFilter = useMemo(() => {
    let list = [...classesRaw];
    if (filterGradeYear) {
      list = list.filter(
        (c) => normalizeGradeYear(c.gradeYear) === filterGradeYear
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [classesRaw, filterGradeYear]);

  const sortedTracks = useMemo(
    () => [...tracks].sort((a, b) => a.name.localeCompare(b.name, "he")),
    [tracks]
  );

  const advancedFilterCount = [
    filterGradeYear,
    filterClassId,
    filterTrackId,
    filterMathUnits,
    filterEnglishUnits,
  ].filter(Boolean).length;

  const hasActiveFilters =
    !!search.trim() || advancedFilterCount > 0 || candidateFilter !== "all";

  function clearFilters() {
    setSearch("");
    setFilterGradeYear("");
    setFilterClassId("");
    setFilterTrackId("");
    setFilterMathUnits("");
    setFilterEnglishUnits("");
    setCandidateFilter("all");
  }

  function onGradeYearChange(value: string) {
    setFilterGradeYear(value);
    if (filterClassId) {
      const cls = classesRaw.find((c) => c.id === filterClassId);
      if (value && normalizeGradeYear(cls?.gradeYear) !== value) {
        setFilterClassId("");
      }
    }
  }

  function openStudent(studentId: string) {
    setShowNew(false);
    setEditingId(null);
    setForm(null);
    setSelectedStudentId(studentId);
  }

  function backToList() {
    setSelectedStudentId(null);
  }

  function examPathIdForClass(classId: string) {
    return classesRaw.find((c) => c.id === classId)?.examPathId ?? null;
  }

  const classGroups = useMemo(() => {
    const classMeta = new Map(classesRaw.map((c) => [c.id, c]));
    const groups = new Map<string, ClassGroup>();

    for (const student of students) {
      const classId = student.class?.id ?? "__none__";
      const meta = student.class ? classMeta.get(student.class.id) : null;

      if (!groups.has(classId)) {
        groups.set(classId, {
          id: classId,
          name: student.class?.name ?? "ללא כיתה",
          gradeYear: meta?.gradeYear ?? null,
          examPathLabel: student.class?.examPath?.label ?? null,
          students: [],
        });
      }
      groups.get(classId)!.students.push(student);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        students: group.students.sort((a, b) =>
          a.user.name.localeCompare(b.user.name, "he")
        ),
      }))
      .sort((a, b) => {
        if (a.id === "__none__") return 1;
        if (b.id === "__none__") return -1;
        return a.name.localeCompare(b.name, "he");
      });
  }, [students, classesRaw]);

  const filteredClassGroups = useMemo(() => {
    const q = search.trim();
    const qLower = q.toLowerCase();
    return classGroups
      .filter((group) => {
        if (filterClassId && group.id !== filterClassId) return false;
        if (
          filterGradeYear &&
          normalizeGradeYear(group.gradeYear) !== filterGradeYear
        ) {
          return false;
        }
        return true;
      })
      .map((group) => ({
        ...group,
        students: group.students.filter((s) => {
          if (
            candidateFilter === "outstanding" &&
            !outstandingByStudentId[s.id]?.isCandidate
          ) {
            return false;
          }
          if (candidateFilter === "hightech" && !hightechByStudentId[s.id]?.isCandidate) {
            return false;
          }
          if (filterMathUnits && s.mathUnits !== Number(filterMathUnits)) {
            return false;
          }
          if (filterEnglishUnits && s.englishUnits !== Number(filterEnglishUnits)) {
            return false;
          }
          if (filterTrackId) {
            const trackIds =
              s.tracks?.map((t) => t.id) ?? (s.track ? [s.track.id] : []);
            if (!trackIds.includes(filterTrackId)) return false;
          }
          if (!q) return true;
          const trackNames =
            s.tracks?.map((t) => t.name).join(" ") ?? s.track?.name ?? "";
          return (
            s.user.name.includes(q) ||
            s.user.email.toLowerCase().includes(qLower) ||
            group.name.includes(q) ||
            trackNames.includes(q)
          );
        }),
      }))
      .filter((group) => group.students.length > 0);
  }, [
    classGroups,
    search,
    filterGradeYear,
    filterClassId,
    filterTrackId,
    filterMathUnits,
    filterEnglishUnits,
    candidateFilter,
    outstandingByStudentId,
    hightechByStudentId,
  ]);

  const filteredStudents = useMemo(
    () => filteredClassGroups.flatMap((g) => g.students),
    [filteredClassGroups]
  );

  const filteredCount = filteredStudents.length;

  async function load() {
    await Promise.all([refreshStudents(), refreshClasses(), refreshTracks()]);
  }

  function startEdit(s: Student) {
    if (!s.class) return;
    setShowNew(false);
    setEditingId(s.id);
    setSaveError("");
    setEditExamPathId(examPathIdForClass(s.class.id));
    setForm({
      name: s.user.name,
      email: s.user.email,
      class: { id: s.class.id, name: s.class.name },
      trackIds: s.tracks?.map((t) => t.id) ?? (s.track ? [s.track.id] : []),
      mathUnits: s.mathUnits,
      englishUnits: s.englishUnits,
      mandatorySubjectIds: s.mandatorySubjectIds,
    });
  }

  function openNewForm() {
    setEditingId(null);
    setForm(null);
    setSaveError("");
    const initialClass = classes[0];
    setNewExamPathId(initialClass ? examPathIdForClass(initialClass.id) : null);
    setNewForm(emptyForm(classes));
    setShowNew(true);
  }

  async function createNew() {
    if (!newForm.name.trim() || !newForm.email.trim() || !newForm.class.id) {
      setSaveError("יש למלא שם, אימייל וכיתה");
      return;
    }
    setCreating(true);
    setSaveError("");
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newForm.name,
          email: newForm.email,
          classId: newForm.class.id,
          trackIds: newForm.trackIds,
          mathUnits: newForm.mathUnits,
          englishUnits: newForm.englishUnits,
          mandatorySubjectIds: newForm.mandatorySubjectIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "שגיאה ביצירת תלמיד");
        return;
      }
      setShowNew(false);
      setNewForm(emptyForm(classes));
      toast.success("התלמיד נוצר בהצלחה");
      load();
    } catch {
      setSaveError("שגיאת רשת — לא ניתן ליצור תלמיד");
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    if (!editingId || !form) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: form.name,
          email: form.email,
          classId: form.class.id,
          trackIds: form.trackIds,
          mathUnits: form.mathUnits,
          englishUnits: form.englishUnits,
          mandatorySubjectIds: form.mandatorySubjectIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "שגיאה בשמירה");
        return;
      }
      setEditingId(null);
      setForm(null);
      toast.success("נשמר בהצלחה");
      load();
    } catch {
      setSaveError("שגיאת רשת — לא ניתן לשמור");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<boolean> {
    const ok = await confirm({
      title: "מחיקת תלמיד",
      description: "למחוק תלמיד זה? פעולה זו אינה ניתנת לביטול.",
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return false;
    await fetch(`/api/students?id=${id}`, { method: "DELETE" });
    toast.success("התלמיד נמחק");
    load();
    return true;
  }

  async function handleExport() {
    const classMeta = new Map(classesRaw.map((c) => [c.id, c]));
    const rows = filteredStudents.map((s) => ({
      ...s,
      class: s.class
        ? {
            ...s.class,
            gradeYear: classMeta.get(s.class.id)?.gradeYear ?? null,
          }
        : null,
    }));
    await downloadExcel(`תלמידים_${exportTimestamp()}.xlsx`, [
      buildStudentsSheet(rows),
    ]);
  }

  function trackText(s: Student) {
    return s.tracks?.length
      ? s.tracks.map((t) => t.name).join(", ")
      : s.track?.name ?? "—";
  }

  const pageTitle = selectedStudent
    ? selectedStudent.user.name
    : canEdit
      ? "ניהול תלמידים"
      : "תלמידים";
  const pageSubtitle = selectedStudent
    ? `כרטיס תלמיד · ${selectedStudent.class?.name ?? "ללא כיתה"}`
    : canEdit
      ? "הוספה ידנית, עריכת שיוכים, מגמות, מקצועות חובה, רמות יחידות (מתמטיקה/אנגלית) וכיתות"
      : "צפייה בתלמידים לפי ההרשאות שהוגדרו";

  if (studentsLoading && students.length === 0) {
    return (
      <>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  if (studentsError && students.length === 0) {
    return (
      <>
        <PageHeader title={pageTitle} subtitle={pageSubtitle} />
        <Alert variant="error" className="mt-6">
          {studentsError}
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title={pageTitle} subtitle={pageSubtitle}>
        {!selectedStudentId && (
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton onExport={handleExport} disabled={filteredCount === 0} />
            {canEdit && (
              <Button
                onClick={openNewForm}
                disabled={classes.length === 0}
                className="shrink-0"
                title={classes.length === 0 ? "יש ליצור כיתה לפני הוספת תלמיד" : undefined}
              >
                <Plus className="h-4 w-4" />
                תלמיד חדש
              </Button>
            )}
          </div>
        )}
      </PageHeader>

      <AnimatePresence mode="wait">
        {selectedStudentId ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="mt-4"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" onClick={backToList}>
                <ChevronLeft className="h-4 w-4" />
                חזרה לרשימת התלמידים
              </Button>
              {canEdit && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const deleted = await remove(selectedStudentId);
                    if (deleted) backToList();
                  }}
                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                  מחיקת תלמיד
                </Button>
              )}
            </div>
            <StudentCardView studentId={selectedStudentId} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
      <div className="mt-6 space-y-3">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="חיפוש לפי שם, אימייל, כיתה או מגמה..."
          activeFilterCount={advancedFilterCount + (candidateFilter !== "all" ? 1 : 0)}
          onClear={hasActiveFilters ? clearFilters : undefined}
          defaultExpanded={advancedFilterCount > 0}
          quickFilters={
            canOutstandingBagrut ? (
              <>
                <Button
                  variant={candidateFilter === "outstanding" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() =>
                    setCandidateFilter((v) => (v === "outstanding" ? "all" : "outstanding"))
                  }
                >
                  <Award className="h-4 w-4" />
                  מצטיינת
                </Button>
                <Button
                  variant={candidateFilter === "hightech" ? "primary" : "secondary"}
                  size="sm"
                  onClick={() =>
                    setCandidateFilter((v) => (v === "hightech" ? "all" : "hightech"))
                  }
                >
                  <Cpu className="h-4 w-4" />
                  הייטק
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="w-[9.5rem]">
            <label className="label">שכבה</label>
            <Select
              value={filterGradeYear}
              onChange={(e) => onGradeYearChange(e.target.value)}
              aria-label="סינון לפי שכבה"
            >
              <option value="">הכל</option>
              {availableGradeYears.map((gy) => (
                <option key={gy} value={gy}>
                  {gy}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[9.5rem]">
            <label className="label">כיתת אם</label>
            <Select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              aria-label="סינון לפי כיתת אם"
            >
              <option value="">הכל</option>
              {classOptionsForFilter.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[11rem]">
            <label className="label">מגמה</label>
            <Select
              value={filterTrackId}
              onChange={(e) => setFilterTrackId(e.target.value)}
              aria-label="סינון לפי מגמה"
            >
              <option value="">הכל</option>
              {sortedTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[8.5rem]">
            <label className="label">מתמטיקה</label>
            <Select
              value={filterMathUnits}
              onChange={(e) => setFilterMathUnits(e.target.value)}
              aria-label="סינון לפי יחידות מתמטיקה"
            >
              <option value="">הכל</option>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u} יח״ל
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[8.5rem]">
            <label className="label">אנגלית</label>
            <Select
              value={filterEnglishUnits}
              onChange={(e) => setFilterEnglishUnits(e.target.value)}
              aria-label="סינון לפי יחידות אנגלית"
            >
              <option value="">הכל</option>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u} יח״ל
                </option>
              ))}
            </Select>
          </div>
        </FilterBar>
        <p className="text-sm text-slate-500">
          {filteredCount} תלמידים
          {hasActiveFilters ? " (מסונן)" : ""}
        </p>
      </div>

      {saveError && !showNew && !editingId && (
        <Alert variant="error" className="mt-4" onClose={() => setSaveError("")}>
          {saveError}
        </Alert>
      )}

      {showNew && (
        <Card className="mt-6 p-6">
          <h3 className="font-semibold">תלמיד חדש</h3>
          {saveError && (
            <Alert variant="error" className="mt-4" onClose={() => setSaveError("")}>
              {saveError}
            </Alert>
          )}
          <div className="mt-4">
            <StudentForm
              form={newForm}
              onChange={setNewForm}
              classes={classes}
              tracks={tracks}
              allSubjects={allSubjects}
              examPathId={newExamPathId}
              onClassChange={(classId) =>
                setNewExamPathId(examPathIdForClass(classId))
              }
              onSubmit={createNew}
              onCancel={() => {
                setShowNew(false);
                setNewExamPathId(null);
                setSaveError("");
              }}
              submitting={creating}
              submitLabel="יצירה"
            />
          </div>
        </Card>
      )}

      <div className="mt-8 space-y-6">
        {classGroups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="אין תלמידים במערכת"
            description="הוסיפו תלמידים ידנית או ייבאו מקובץ אקסל"
            actionLabel={canEdit ? "תלמיד חדש" : undefined}
            onAction={canEdit ? openNewForm : undefined}
          />
        ) : filteredClassGroups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="לא נמצאו תוצאות"
            description="לא נמצאו תלמידים התואמים לסינון הנוכחי"
            actionLabel={hasActiveFilters ? "נקה סינון" : undefined}
            onAction={hasActiveFilters ? clearFilters : undefined}
          />
        ) : (
          filteredClassGroups.map((group) => (
            <section key={group.id}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
                <h2 className="text-h2 text-slate-900">{group.name}</h2>
                <span className="text-base text-slate-500">
                  {group.students.length} תלמידים
                  {(group.gradeYear || group.examPathLabel) &&
                    ` · ${[group.gradeYear, group.examPathLabel].filter(Boolean).join(" · ")}`}
                </span>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {group.students.map((s) => (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openStudent(s.id)}
                        className="min-w-0 flex-1 text-right transition hover:opacity-80"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{s.user.name}</p>
                          {canOutstandingBagrut && outstandingByStudentId[s.id]?.isCandidate && (
                            <OutstandingBagrutBadge
                              size="sm"
                              tier={outstandingByStudentId[s.id]?.tier ?? undefined}
                            />
                          )}
                          {canOutstandingBagrut && hightechByStudentId[s.id]?.isCandidate && (
                            <HightechBagrutBadge size="sm" />
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-500" dir="ltr">
                          {s.user.email}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">{trackText(s)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          מתמטיקה {s.mathUnits} · אנגלית {s.englishUnits}
                        </p>
                      </button>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(s)}
                            disabled={!s.class}
                            title={!s.class ? "לא ניתן לערוך תלמיד ללא כיתה" : "עריכה"}
                            aria-label="עריכה"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(s.id)}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="מחיקה"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {canEdit && !s.class && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                        <Info className="h-3 w-3" />
                        יש לשייך כיתה לפני עריכה
                      </p>
                    )}
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <Card variant="flat" className="hidden overflow-hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] table-fixed text-base">
                    <colgroup>
                      <col className="w-[20%]" />
                      <col className="w-[24%]" />
                      <col className="w-[20%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      {canOutstandingBagrut && <col className="w-[12%]" />}
                      {canEdit && <col className="w-[8%]" />}
                    </colgroup>
                    <thead className="bg-slate-50/80">
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold">שם</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold">אימייל</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-semibold">מגמות</th>
                        <th scope="col" className="px-4 py-3 text-center text-xs font-semibold">מתמטיקה</th>
                        <th scope="col" className="px-4 py-3 text-center text-xs font-semibold">אנגלית</th>
                        {canOutstandingBagrut && (
                          <th className="px-4 py-3 text-center text-xs font-semibold">
                            תגים
                          </th>
                        )}
                        {canEdit && (
                          <th className="px-4 py-3 text-right text-xs font-semibold">פעולות</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.students.map((s) => (
                        <tr
                          key={s.id}
                          onClick={() => openStudent(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openStudent(s.id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`פתח כרטיס תלמיד ${s.user.name}`}
                          className="cursor-pointer transition-colors even:bg-slate-50/40 hover:bg-primary-50/30 focus-visible:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
                        >
                          <td className="truncate px-4 py-3 font-semibold text-slate-800">
                            {s.user.name}
                          </td>
                          <td className="truncate px-4 py-3 text-slate-500" dir="ltr">
                            {s.user.email}
                          </td>
                          <td className="truncate px-4 py-3 text-slate-600">{trackText(s)}</td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                            {s.mathUnits}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                            {s.englishUnits}
                          </td>
                          {canOutstandingBagrut && (
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1.5">
                                {outstandingByStudentId[s.id]?.isCandidate && (
                                  <OutstandingBagrutBadge
                                    size="sm"
                                    tier={outstandingByStudentId[s.id]?.tier ?? undefined}
                                  />
                                )}
                                {hightechByStudentId[s.id]?.isCandidate && (
                                  <HightechBagrutBadge size="sm" />
                                )}
                                {!outstandingByStudentId[s.id]?.isCandidate &&
                                  !hightechByStudentId[s.id]?.isCandidate && (
                                    <span className="text-sm text-slate-300">—</span>
                                  )}
                              </div>
                            </td>
                          )}
                          {canEdit && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(s)}
                                  disabled={!s.class}
                                  title={
                                    !s.class ? "לא ניתן לערוך תלמיד ללא כיתה" : "עריכה"
                                  }
                                  aria-label="עריכה"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => remove(s.id)}
                                  className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                  aria-label="מחיקה"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          ))
        )}
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet
        open={!!editingId && !!form}
        onClose={() => {
          setEditingId(null);
          setForm(null);
          setEditExamPathId(null);
          setSaveError("");
        }}
        title="עריכת תלמיד"
      >
        {form && (
          <>
            {saveError && (
              <Alert variant="error" className="mb-4" onClose={() => setSaveError("")}>
                {saveError}
              </Alert>
            )}
            <StudentForm
              form={form}
              onChange={setForm}
              classes={classes}
              tracks={tracks}
              allSubjects={allSubjects}
              examPathId={editExamPathId}
              onClassChange={(classId) =>
                setEditExamPathId(examPathIdForClass(classId))
              }
              onSubmit={save}
              onCancel={() => {
                setEditingId(null);
                setForm(null);
                setEditExamPathId(null);
                setSaveError("");
              }}
              submitting={saving}
            />
          </>
        )}
      </Sheet>
    </>
  );
}
