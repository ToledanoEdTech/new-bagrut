"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  BookOpen,
  ChevronLeft,
  Search,
} from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { SearchInput } from "@/components/ui/SearchInput";
import { invalidateCache } from "@/lib/api-cache";
import { formatSubjectWithPathLinks } from "@/lib/subject-display";
import type { ExamPathType, SubjectCategory } from "@/lib/types";

type ExamPath = {
  id: string;
  key: string;
  label: string;
  pathType: ExamPathType;
  description: string | null;
  subjectIds: string[];
  _count?: { classes: number };
};

type Subject = {
  id: string;
  name: string;
  units: number | null;
  category: SubjectCategory | string;
  pathLinks?: Array<{ path: { label: string; id: string } }>;
};

const PATH_TYPE_LABELS: Record<ExamPathType, string> = {
  REGULAR: "רגילה",
  BEIT_MIDRASH: "בית מדרש",
  MEUBAR_HINUCH: 'מב"ר / חנ"מ',
};

const CATEGORY_LABELS: Record<string, string> = {
  MANDATORY: "חובה",
  MATH: "מתמטיקה",
  ENGLISH: "אנגלית",
  TRACK: "מגמה",
  EXTENSION: "הרחבה",
  SOCIAL: "מעורבות חברתית",
};

const CATEGORY_ORDER = [
  "MANDATORY",
  "SOCIAL",
  "MATH",
  "ENGLISH",
  "TRACK",
  "EXTENSION",
];

type EditorForm = {
  label: string;
  description: string;
  pathType: ExamPathType;
  subjectIds: string[];
};

const EMPTY_FORM: EditorForm = {
  label: "",
  description: "",
  pathType: "REGULAR",
  subjectIds: [],
};

export default function ProgramsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: paths = [], loading, mutate: refreshPaths } = useApi<ExamPath[]>("/api/paths");
  const { data: subjects = [], loading: subjectsLoading } = useApi<Subject[]>("/api/subjects");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);

  const isEditing = creating || editingId != null;

  useEffect(() => {
    if (!creating && !editingId) {
      setSubjectQuery("");
      setShowAllCategories(false);
    }
  }, [creating, editingId]);

  const editingPath = editingId ? paths.find((p) => p.id === editingId) : null;

  const selectableSubjects = useMemo(() => {
    const q = subjectQuery.trim().toLowerCase();
    return subjects
      .filter((s) => {
        if (!showAllCategories && s.category !== "MANDATORY" && s.category !== "SOCIAL") {
          return false;
        }
        if (!q) return true;
        return s.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category);
        const bi = CATEGORY_ORDER.indexOf(b.category);
        const ar = ai === -1 ? 99 : ai;
        const br = bi === -1 ? 99 : bi;
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name, "he");
      });
  }, [subjects, subjectQuery, showAllCategories]);

  const selectedSubjects = useMemo(() => {
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return form.subjectIds
      .map((id) => byId.get(id))
      .filter(Boolean) as Subject[];
  }, [form.subjectIds, subjects]);

  function openCreate() {
    setCreating(true);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(path: ExamPath) {
    setCreating(false);
    setEditingId(path.id);
    setForm({
      label: path.label,
      description: path.description ?? "",
      pathType: path.pathType,
      subjectIds: [...path.subjectIds],
    });
  }

  function closeEditor() {
    setCreating(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleSubject(subjectId: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(subjectId)
        ? f.subjectIds.filter((id) => id !== subjectId)
        : [...f.subjectIds, subjectId],
    }));
  }

  async function save() {
    if (!form.label.trim()) {
      toast.error("יש להזין שם לתוכנית");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description.trim() || null,
        pathType: form.pathType,
        subjectIds: form.subjectIds,
      };
      const res = await fetch("/api/paths", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? payload : { id: editingId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "שגיאה בשמירה");
        return;
      }
      invalidateCache("/api/paths");
      invalidateCache("/api/subjects");
      invalidateCache("/api/classes");
      toast.success(creating ? "התוכנית נוצרה בהצלחה" : "התוכנית נשמרה");
      closeEditor();
      await refreshPaths();
    } finally {
      setSaving(false);
    }
  }

  async function remove(path: ExamPath) {
    const classCount = path._count?.classes ?? 0;
    if (classCount > 0) {
      toast.error(`לא ניתן למחוק — ${classCount} כיתות משויכות לתוכנית`);
      return;
    }
    const ok = await confirm({
      title: "מחיקת תוכנית",
      description: `למחוק את התוכנית "${path.label}"? פעולה זו אינה ניתנת לביטול.`,
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return;

    const res = await fetch(`/api/paths?id=${path.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "שגיאה במחיקה");
      return;
    }
    invalidateCache("/api/paths");
    invalidateCache("/api/classes");
    toast.success("התוכנית נמחקה");
    if (editingId === path.id) closeEditor();
    await refreshPaths();
  }

  if (loading && paths.length === 0) {
    return <PageLoader />;
  }

  if (isEditing) {
    return (
      <div className="mt-4">
        <Button variant="secondary" onClick={closeEditor} className="mb-4">
          <ChevronLeft className="h-4 w-4" />
          חזרה לתוכניות
        </Button>

        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {creating ? "תוכנית חדשה" : `עריכת ${editingPath?.label ?? "תוכנית"}`}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                בחרו אילו מקצועות חובה כלולים בתוכנית. מתמטיקה, אנגלית ומגמות נקבעים לפי התלמיד.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "שומר..." : "שמירה"}
              </Button>
              <Button variant="secondary" onClick={closeEditor} disabled={saving}>
                <X className="h-4 w-4" />
                ביטול
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">שם התוכנית</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder='למשל: מב"ר / חנ"מ'
              />
            </div>
            <div>
              <label className="label">סוג</label>
              <select
                className="input"
                value={form.pathType}
                onChange={(e) =>
                  setForm({ ...form, pathType: e.target.value as ExamPathType })
                }
              >
                {(Object.keys(PATH_TYPE_LABELS) as ExamPathType[]).map((key) => (
                  <option key={key} value={key}>
                    {PATH_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">תיאור (אופציונלי)</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="תיאור קצר של התוכנית"
              />
            </div>
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">מקצועות בתוכנית</h3>
                <p className="text-sm text-slate-500">
                  נבחרו {form.subjectIds.length} מקצועות
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={showAllCategories}
                  onChange={(e) => setShowAllCategories(e.target.checked)}
                />
                הצג גם מתמטיקה / אנגלית / מגמות
              </label>
            </div>

            {selectedSubjects.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedSubjects.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSubject(s.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-800 ring-1 ring-inset ring-primary-100 transition hover:bg-primary-100"
                    title="הסר מהתוכנית"
                  >
                    {formatSubjectWithPathLinks(s.name, s.pathLinks, {
                      units: s.units,
                      category: s.category,
                    })}
                    <X className="h-3.5 w-3.5 opacity-60" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4">
              <SearchInput
                value={subjectQuery}
                onChange={setSubjectQuery}
                placeholder="חיפוש מקצוע..."
              />
            </div>

            {subjectsLoading && subjects.length === 0 ? (
              <PageLoader variant="table" />
            ) : selectableSubjects.length === 0 ? (
              <EmptyState
                icon={Search}
                title="לא נמצאו מקצועות"
                description="נסו לשנות את החיפוש או ליצור מקצוע חדש בלשונית מקצועות וחובות"
              />
            ) : (
              <div className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
                {selectableSubjects.map((s) => {
                  const checked = form.subjectIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                        checked ? "bg-white shadow-sm ring-1 ring-primary-100" : "hover:bg-white/80"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={checked}
                        onChange={() => toggleSubject(s.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">
                          {formatSubjectWithPathLinks(s.name, s.pathLinks, {
                            units: s.units,
                            category: s.category,
                          })}
                        </p>
                        <p className="text-xs text-slate-500">
                          {CATEGORY_LABELS[s.category] ?? s.category}
                          {s.units != null ? ` · ${s.units} יח"ל` : ""}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          ערכו אילו מקצועות חובה נכללים בכל תוכנית, או צרו תוכנית חדשה.
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          תוכנית חדשה
        </Button>
      </div>

      {paths.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="אין תוכניות"
          description="צרו תוכנית חובה ראשונה כדי לשייך אליה כיתות"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => {
            const subjectCount = path.subjectIds?.length ?? 0;
            const classCount = path._count?.classes ?? 0;
            return (
              <Card key={path.id} variant="interactive" className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(path)}
                    className="min-w-0 flex-1 text-right transition hover:opacity-80"
                  >
                    <h3 className="text-h3 text-slate-900">{path.label}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {PATH_TYPE_LABELS[path.pathType] ?? path.pathType}
                    </p>
                    {path.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                        {path.description}
                      </p>
                    )}
                  </button>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(path)}
                      aria-label="עריכה"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(path)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="מחיקה"
                      disabled={classCount > 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(path)}
                  className="mt-4 w-full rounded-xl bg-primary-50 px-3 py-2 text-right transition hover:bg-primary-100"
                >
                  <p className="text-xs text-primary-600">מקצועות בתוכנית</p>
                  <p className="text-base font-medium text-primary-800">
                    {subjectCount} מקצועות
                  </p>
                </button>
                <p className="mt-3 text-sm text-slate-500">
                  {classCount === 0
                    ? "אין כיתות משויכות"
                    : `${classCount} כיתות משויכות`}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
