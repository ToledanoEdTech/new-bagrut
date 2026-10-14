"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Pencil, Trash2, Save, X, ChevronLeft, Users, GraduationCap } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DossierExportButton } from "@/components/ui/DossierExportButton";
import { ExportButton } from "@/components/ui/ExportButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/components/AuthProvider";
import { canViewOutstandingBagrut, hasAnyStudentEdit } from "@/lib/permissions";
import { StudentCardView } from "@/components/students/StudentCardView";
import { OutstandingBagrutBadge } from "@/components/students/OutstandingBagrutBadge";
import { HightechBagrutBadge } from "@/components/students/HightechBagrutBadge";
import type { OutstandingBagrutResult } from "@/lib/outstanding-bagrut-core";
import type { HightechBagrutResult } from "@/lib/hightech-bagrut-core";
import {
  buildClassStudentsSheet,
  buildClassesSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";

type ExamPath = { id: string; label: string; key: string };
type StaffMember = { id: string; name: string; email: string; role: string };
type ClassItem = {
  id: string;
  name: string;
  gradeYear: string | null;
  examPath: ExamPath | null;
  homeroomTeacherId?: string | null;
  homeroomTeacher?: { id: string; name: string; email: string } | null;
  _count: { students: number };
};

type Student = {
  id: string;
  mathUnits: number;
  englishUnits: number;
  user: { name: string };
  class: { id: string; name: string } | null;
  track: { name: string } | null;
  tracks: { name: string }[];
};

type View = "classes" | "students" | "detail";

export default function ClassesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { session } = useAuth();
  const canOutstandingBagrut = session ? canViewOutstandingBagrut(session) : false;
  const canEditStudents = session ? hasAnyStudentEdit(session) : false;
  const [view, setView] = useState<View>("classes");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gradeYear: "",
    examPathId: "",
    homeroomTeacherId: "",
  });

  const { data: classes = [], loading, mutate: refreshClasses } = useApi<ClassItem[]>("/api/classes");
  const { data: paths = [], mutate: refreshPaths } = useApi<ExamPath[]>("/api/paths");
  const { data: staff = [] } = useApi<StaffMember[]>("/api/staff");
  const { data: students = [], loading: studentsLoading, mutate: refreshStudents } = useApi<Student[]>(
    view !== "classes" ? "/api/students" : null
  );
  const { data: outstandingData } = useApi<{
    byStudentId: Record<string, OutstandingBagrutResult>;
  }>(
    view !== "classes" && canOutstandingBagrut
      ? "/api/students/outstanding-bagrut"
      : null
  );
  const { data: hightechData } = useApi<{
    byStudentId: Record<string, HightechBagrutResult>;
  }>(
    view !== "classes" && canOutstandingBagrut
      ? "/api/students/hightech-bagrut"
      : null
  );

  const outstandingByStudentId = outstandingData?.byStudentId ?? {};
  const hightechByStudentId = hightechData?.byStudentId ?? {};

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return students
      .filter((s) => s.class?.id === selectedClassId)
      .sort((a, b) => a.user.name.localeCompare(b.user.name, "he"));
  }, [students, selectedClassId]);

  const pageTitle =
    view === "detail"
      ? (selectedStudent?.user.name ?? "כרטיס תלמיד")
      : view === "students" && selectedClass
        ? selectedClass.name
        : "כיתות";
  const pageSubtitle =
    view === "detail" && selectedClass
      ? `${selectedClass.name}${selectedClass.gradeYear ? ` · ${selectedClass.gradeYear}` : ""}`
      : view === "students" && selectedClass
        ? `${selectedClass.gradeYear ? `${selectedClass.gradeYear} · ` : ""}${selectedClass.examPath?.label ?? "ללא תוכנית"} · ${classStudents.length} תלמידים`
        : "";

  async function load() {
    await Promise.all([refreshClasses(), refreshPaths()]);
    if (paths.length && !form.examPathId) {
      setForm((f) => ({ ...f, examPathId: paths[0].id }));
    }
  }

  async function saveNew() {
    await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowNew(false);
    setForm({ name: "", gradeYear: "", examPathId: paths[0]?.id ?? "", homeroomTeacherId: "" });
    toast.success("הכיתה נוצרה בהצלחה");
    load();
  }

  async function saveEdit(id: string) {
    await fetch("/api/classes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...form }),
    });
    setEditing(null);
    toast.success("נשמר בהצלחה");
    load();
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: "מחיקת כיתה",
      description: `למחוק את הכיתה "${name}"? פעולה זו אינה ניתנת לביטול.`,
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/classes?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) toast.error(data.error);
    else {
      toast.success("הכיתה נמחקה");
      load();
    }
  }

  async function removeStudent(id: string): Promise<boolean> {
    const ok = await confirm({
      title: "מחיקת תלמיד",
      description: "למחוק תלמיד זה? פעולה זו אינה ניתנת לביטול.",
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return false;
    const res = await fetch(`/api/students?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "שגיאה במחיקה");
      return false;
    }
    toast.success("התלמיד נמחק");
    await Promise.all([refreshStudents(), refreshClasses()]);
    return true;
  }

  function openClass(classId: string) {
    setSelectedClassId(classId);
    setSelectedStudentId(null);
    setView("students");
  }

  function openStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setView("detail");
  }

  function backToClasses() {
    setView("classes");
    setSelectedClassId(null);
    setSelectedStudentId(null);
  }

  function backToStudents() {
    setView("students");
    setSelectedStudentId(null);
  }

  async function handleExport() {
    if (view === "students" && selectedClass) {
      const rows = classStudents.map((s) => ({
        ...s,
        class: s.class
          ? {
              ...s.class,
              gradeYear: selectedClass.gradeYear,
              examPath: selectedClass.examPath,
            }
          : null,
      }));
      await downloadExcel(
        `תלמידים_${selectedClass.name}_${exportTimestamp()}.xlsx`,
        [buildClassStudentsSheet(selectedClass.name, rows)]
      );
      return;
    }

    await downloadExcel(`כיתות_${exportTimestamp()}.xlsx`, [buildClassesSheet(classes)]);
  }

  if (loading && classes.length === 0) {
    return <PageLoader />;
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {view !== "classes" && (
            <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
          )}
          {view !== "classes" && pageSubtitle && (
            <p className="mt-0.5 text-sm text-slate-500">{pageSubtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "detail" && (
            <>
              <ExportButton
                onExport={handleExport}
                disabled={view === "students" ? classStudents.length === 0 : classes.length === 0}
                label={view === "students" ? "ייצוא תלמידי כיתה" : "ייצוא כיתות"}
              />
              {view === "students" && selectedClass ? (
                <DossierExportButton
                  kind="class"
                  classId={selectedClass.id}
                  label="ייצוא תיקי תלמידים"
                />
              ) : null}
            </>
          )}
          {view === "classes" && (
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4" />
              כיתה חדשה
            </Button>
          )}
        </div>
      </div>

      <Breadcrumb
        items={[
          {
            label: "כיתות",
            active: view === "classes",
            onClick: view !== "classes" ? backToClasses : undefined,
          },
          ...(view !== "classes" && selectedClass
            ? [
                {
                  label: selectedClass.name,
                  active: view === "students",
                  onClick: view === "detail" ? backToStudents : undefined,
                },
              ]
            : []),
          ...(view === "detail" && selectedStudent
            ? [{ label: selectedStudent.user.name, active: true }]
            : []),
        ]}
      />

      <AnimatePresence mode="wait">
        {view === "detail" && selectedStudentId ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="mt-4"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" onClick={backToStudents}>
                <ChevronLeft className="h-4 w-4" />
                חזרה לרשימת התלמידים
              </Button>
              {canEditStudents && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const deleted = await removeStudent(selectedStudentId);
                    if (deleted) backToStudents();
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
        ) : view === "students" && selectedClass ? (
          <motion.div
            key="students"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="mt-4"
          >
            <Button variant="secondary" onClick={backToClasses} className="mb-4">
              <ChevronLeft className="h-4 w-4" />
              חזרה לכיתות
            </Button>
            {studentsLoading && classStudents.length === 0 ? (
              <PageLoader variant="table" />
            ) : classStudents.length === 0 ? (
              <EmptyState
                icon={Users}
                title="אין תלמידים בכיתה זו"
                description="הוסיפו תלמידים לכיתה או ייבאו מקובץ אקסל"
              />
            ) : (
              <Card variant="flat" className="divide-y divide-slate-100 overflow-hidden">
                {classStudents.map((student) => {
                  const trackLabel =
                    student.tracks?.length > 0
                      ? student.tracks.map((t) => t.name).join(", ")
                      : student.track?.name;

                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => openStudent(student.id)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right transition hover:bg-slate-50"
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-medium text-slate-900">
                            {student.user.name}
                          </p>
                          {canOutstandingBagrut && outstandingByStudentId[student.id]?.isCandidate && (
                            <OutstandingBagrutBadge
                              size="sm"
                              tier={outstandingByStudentId[student.id]?.tier ?? undefined}
                            />
                          )}
                          {canOutstandingBagrut && hightechByStudentId[student.id]?.isCandidate && (
                            <HightechBagrutBadge size="sm" />
                          )}
                        </div>
                        <p className="mt-0.5 text-base text-slate-500">
                          מתמטיקה {student.mathUnits} יח&quot;ל · אנגלית {student.englishUnits}{" "}
                          יח&quot;ל
                          {trackLabel ? ` · ${trackLabel}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </Card>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="classes"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >

      {showNew && (
        <div className="mt-6 card p-6">
          <h3 className="font-semibold">כיתה חדשה</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">שם כיתה</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={'י"א3'}
              />
            </div>
            <div>
              <label className="label">שכבה</label>
              <select
                className="input"
                value={form.gradeYear}
                onChange={(e) => setForm({ ...form, gradeYear: e.target.value })}
              >
                <option value="">בחר שכבה</option>
                <option value="שכבת ט">שכבת ט</option>
                <option value="שכבת י">שכבת י</option>
                <option value="שכבת יא">שכבת יא</option>
                <option value="שכבת יב">שכבת יב</option>
              </select>
            </div>
            <div>
              <label className="label">תוכנית חובה</label>
              <select
                className="input"
                value={form.examPathId}
                onChange={(e) => setForm({ ...form, examPathId: e.target.value })}
              >
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">מחנך</label>
              <select
                className="input"
                value={form.homeroomTeacherId}
                onChange={(e) => setForm({ ...form, homeroomTeacherId: e.target.value })}
              >
                <option value="">לא הוגדר מחנך</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={saveNew}>שמירה</Button>
            <Button variant="secondary" onClick={() => setShowNew(false)}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <Card key={c.id} variant="interactive" className="p-5">
            {editing === c.id ? (
              <div className="space-y-3">
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <select
                  className="input"
                  value={form.gradeYear}
                  onChange={(e) => setForm({ ...form, gradeYear: e.target.value })}
                >
                  <option value="שכבת ט">שכבת ט</option>
                  <option value="שכבת י">שכבת י</option>
                  <option value="שכבת יא">שכבת יא</option>
                  <option value="שכבת יב">שכבת יב</option>
                </select>
                <select
                  className="input"
                  value={form.examPathId}
                  onChange={(e) => setForm({ ...form, examPathId: e.target.value })}
                >
                  {paths.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={form.homeroomTeacherId}
                  onChange={(e) => setForm({ ...form, homeroomTeacherId: e.target.value })}
                >
                  <option value="">לא הוגדר מחנך</option>
                  {staff.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button onClick={() => saveEdit(c.id)} className="flex-1">
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <button
                    type="button"
                    onClick={() => openClass(c.id)}
                    className="min-w-0 flex-1 text-right transition hover:opacity-80"
                  >
                    <h3 className="text-h3 text-slate-900">{c.name}</h3>
                    <p className="mt-1 text-base text-slate-500">{c.gradeYear}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm">
                      <GraduationCap className="h-4 w-4 shrink-0 text-slate-400" />
                      {c.homeroomTeacher ? (
                        <span className="text-slate-600">
                          מחנך: {c.homeroomTeacher.name || c.homeroomTeacher.email}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">לא הוגדר מחנך</span>
                      )}
                    </p>
                  </button>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(c.id);
                        setForm({
                          name: c.name,
                          gradeYear: c.gradeYear ?? "",
                          examPathId: c.examPath?.id ?? paths[0]?.id ?? "",
                          homeroomTeacherId: c.homeroomTeacherId ?? "",
                        });
                      }}
                      aria-label="עריכה"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(c.id, c.name)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="מחיקה"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openClass(c.id)}
                  className="mt-4 w-full rounded-xl bg-primary-50 px-3 py-2 text-right transition hover:bg-primary-100"
                >
                  <p className="text-xs text-primary-600">תוכנית חובה</p>
                  <p className="text-base font-medium text-primary-800">
                    {c.examPath?.label ?? "ללא תוכנית"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => openClass(c.id)}
                  className="mt-3 flex w-full items-center gap-2 text-base text-slate-500 transition hover:text-primary-600"
                >
                  <Users className="h-4 w-4" />
                  {c._count.students} תלמידים
                </button>
              </>
            )}
          </Card>
        ))}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
