"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, ChevronsDown, ChevronsUp } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ExportButton } from "@/components/ui/ExportButton";
import { SearchInput } from "@/components/ui/SearchInput";
import {
  buildSubjectsSheets,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import { formatSubjectWithPathLinks } from "@/lib/subject-display";
import {
  ObligationEditor,
  EMPTY_OBLIGATION,
  type ObligationDraft,
} from "@/components/subjects/ObligationEditor";
import {
  ObligationGradeYearOverrideButton,
  ObligationGradeYearOverridesModal,
  type OverrideModalTarget,
} from "@/components/subjects/ObligationGradeYearOverridesModal";
import { countOverridesForSubItem } from "@/lib/obligation-grade-year-overrides";
import type { ObligationClassGradeYearOverride } from "@/lib/types";
import { defaultGradeEntryDueDate, resolveGradeEntryDueDate } from "@/lib/grade-due-date";

type WeightedItem = { name: string; weightPercent: number };
type SubItem = WeightedItem & {
  sortOrder?: number;
  gradeEntryDueDate?: string | null;
  gradeYear?: string | null;
};

type Obligation = {
  id: string;
  questionnaireNumber: string | null;
  name: string | null;
  weightPercent: number;
  examType: string;
  studyMaterial: string | null;
  examEvent: string | null;
  gradeYear: string | null;
  gradeEntryDueDate?: string | null;
  sortOrder: number;
  components: WeightedItem[];
  subItems: SubItem[];
};

type Subject = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  obligations: Obligation[];
  pathLinks: Array<{ path: { label: string } }>;
};

const categories: Record<string, string> = {
  MANDATORY: "חובה",
  MATH: "מתמטיקה",
  ENGLISH: "אנגלית",
  TRACK: "מגמה",
  EXTENSION: "הרחבה",
  SOCIAL: "מעורבות חברתית",
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: body.error || `שגיאה ${res.status}` };
  }
  return { data: body as T };
}

function obligationToDraft(o?: Obligation): ObligationDraft {
  if (!o) return { ...EMPTY_OBLIGATION };
  return {
    id: o.id,
    questionnaireNumber: o.questionnaireNumber ?? "",
    name: o.name ?? "",
    weightPercent: o.weightPercent,
    examType: o.examType,
    studyMaterial: o.studyMaterial ?? "",
    examEvent: o.examEvent ?? "",
    gradeYear: o.gradeYear ?? "",
    gradeEntryDueDate: resolveGradeEntryDueDate(o.gradeEntryDueDate),
    components: o.components.map(({ name, weightPercent }) => ({ name, weightPercent })),
    subItems: o.subItems.map(({ name, weightPercent, gradeEntryDueDate, gradeYear }) => ({
      name,
      weightPercent,
      gradeEntryDueDate: resolveGradeEntryDueDate(gradeEntryDueDate),
      gradeYear: gradeYear ?? "",
    })),
  };
}

function draftToPayload(draft: ObligationDraft, subjectId: string, sortOrder: number) {
  return {
    subjectId,
    questionnaireNumber: draft.questionnaireNumber || null,
    name: draft.name || null,
    weightPercent: draft.weightPercent,
    examType: draft.examType,
    studyMaterial: draft.studyMaterial || null,
    examEvent: draft.examEvent || null,
    gradeYear: draft.gradeYear || null,
    gradeEntryDueDate: draft.gradeEntryDueDate || defaultGradeEntryDueDate(),
    sortOrder,
    components: draft.components,
    subItems: draft.subItems.map((si) => ({
      name: si.name,
      weightPercent: si.weightPercent,
      gradeEntryDueDate: si.gradeEntryDueDate,
      gradeYear: si.gradeYear || null,
    })),
  };
}

export default function SubjectsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { data: subjects = [], loading, mutate: refreshSubjects } = useApi<Subject[]>("/api/subjects");
  const { data: classes = [] } = useApi<Array<{ id: string; name: string; gradeYear: string | null }>>(
    "/api/classes"
  );
  const {
    data: gradeYearOverrides = [],
    mutate: mutateGradeYearOverrides,
  } = useApi<ObligationClassGradeYearOverride[]>("/api/obligations/grade-year-overrides");
  const [overrideModal, setOverrideModal] = useState<OverrideModalTarget | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState({ name: "", units: 5, category: "MANDATORY" });
  const [editingObligation, setEditingObligation] = useState<string | null>(null);
  const [addingObligation, setAddingObligation] = useState<string | null>(null);
  const [obligationDraft, setObligationDraft] = useState<ObligationDraft>({ ...EMPTY_OBLIGATION });
  const [newSubjectObligations, setNewSubjectObligations] = useState<ObligationDraft[]>([
    { ...EMPTY_OBLIGATION, weightPercent: 100 },
  ]);
  const [newSubjectMeta, setNewSubjectMeta] = useState({
    name: "",
    units: 5,
    category: "MANDATORY",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getOverrideCount(obligationId: string, subItemSortOrder?: number | null) {
    if (subItemSortOrder != null) {
      return countOverridesForSubItem(gradeYearOverrides, obligationId, subItemSortOrder);
    }
    return gradeYearOverrides.filter(
      (o) => o.obligationId === obligationId && (o.subItemSortOrder ?? null) == null
    ).length;
  }

  async function load() {
    try {
      await refreshSubjects();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    }
  }

  const filtered = useMemo(() => {
    let list = subjects.filter((s) => filter === "all" || s.category === filter);

    const q = search.trim();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.includes(q) ||
          s.obligations.some(
            (o) =>
              o.name?.includes(q) ||
              o.questionnaireNumber?.includes(q) ||
              o.studyMaterial?.includes(q)
          )
      );
    }

    return list.sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [subjects, filter, search]);

  async function handleExport() {
    const exportList =
      search.trim() || filter !== "all"
        ? filtered
        : subjects.sort((a, b) => a.name.localeCompare(b.name, "he"));
    await downloadExcel(`מקצועות_${exportTimestamp()}.xlsx`, buildSubjectsSheets(exportList));
  }

  if (loading && subjects.length === 0) {
    return <PageLoader />;
  }

  async function addSubject() {
    if (!newSubjectMeta.name.trim()) {
      setError("יש להזין שם מקצוע");
      return;
    }
    for (const o of newSubjectObligations) {
      if (!o.gradeYear?.trim()) {
        setError("יש לבחור שכבה לכל מטלה");
        return;
      }
    }
    setSaving(true);
    setError(null);
    const { error: err } = await apiJson("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newSubjectMeta,
        obligations: newSubjectObligations.map((o) => ({
          name: o.name || null,
          weightPercent: o.weightPercent,
          examType: o.examType,
          questionnaireNumber: o.questionnaireNumber || null,
          studyMaterial: o.studyMaterial || null,
          examEvent: o.examEvent || null,
          gradeYear: o.gradeYear || null,
          gradeEntryDueDate: o.gradeEntryDueDate || null,
          components: o.components,
          subItems: o.subItems.map((si) => ({
            name: si.name,
            weightPercent: si.weightPercent,
            gradeEntryDueDate: si.gradeEntryDueDate,
            gradeYear: si.gradeYear || null,
          })),
        })),
      }),
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setShowNew(false);
    setNewSubjectMeta({ name: "", units: 5, category: "MANDATORY" });
    setNewSubjectObligations([{ ...EMPTY_OBLIGATION, weightPercent: 100 }]);
    toast.success("המקצוע נוצר בהצלחה");
    load();
  }

  async function saveSubject(id: string) {
    setSaving(true);
    const { error: err } = await apiJson("/api/subjects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...subjectDraft }),
    });
    setSaving(false);
    if (err) setError(err);
    else {
      setEditingSubject(null);
      toast.success("נשמר בהצלחה");
      load();
    }
  }

  async function saveObligation(subjectId: string, existingId?: string, addAnother = false) {
    if (!obligationDraft.name?.trim() && !obligationDraft.questionnaireNumber?.trim()) {
      setError("יש להזין שם מטלה או מספר שאלון");
      return;
    }
    if (!obligationDraft.gradeYear?.trim()) {
      setError("יש לבחור שכבה למטלה");
      return;
    }
    setSaving(true);
    setError(null);

    const subject = subjects.find((s) => s.id === subjectId);
    const sortOrder = existingId
      ? (subject?.obligations.find((o) => o.id === existingId)?.sortOrder ?? 0)
      : (subject?.obligations.length ?? 0);

    const payload = draftToPayload(obligationDraft, subjectId, sortOrder);
    const { error: err } = await apiJson(
      "/api/obligations",
      existingId
        ? {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, id: existingId }),
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
    );

    setSaving(false);
    if (err) {
      setError(err);
      return;
    }

    if (addAnother) {
      setObligationDraft({ ...EMPTY_OBLIGATION });
      setAddingObligation(subjectId);
      setEditingObligation(null);
    } else {
      setEditingObligation(null);
      setAddingObligation(null);
    }
    toast.success("המטלה נשמרה");
    load();
  }

  async function deleteObligation(subjectId: string, id: string) {
    const ok = await confirm({
      title: "מחיקת מטלה",
      description: "למחוק מטלה זו?",
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return;
    const { error: err } = await apiJson(
      `/api/obligations?id=${id}&subjectId=${subjectId}`,
      { method: "DELETE" }
    );
    if (err) setError(err);
    else {
      toast.success("המטלה נמחקה");
      load();
    }
  }

  async function deleteSubject(id: string) {
    const ok = await confirm({
      title: "מחיקת מקצוע",
      description: "למחוק מקצוע זה וכל המטלות שלו?",
      confirmLabel: "מחק",
      variant: "danger",
    });
    if (!ok) return;
    const { error: err } = await apiJson(`/api/subjects?id=${id}`, { method: "DELETE" });
    if (err) setError(err);
    else {
      toast.success("המקצוע נמחק");
      load();
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(filtered.map((s) => s.id)));
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  return (
    <>
      <PageHeader
        title="מקצועות ומטלות"
        subtitle="לכל מטלה: אחוז מהציון הסופי, סוג היבחנות, ושקלול פנימי / עבודות"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton onExport={handleExport} disabled={subjects.length === 0} />
          <Button type="button" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" />
            מקצוע חדש
          </Button>
        </div>
      </PageHeader>

      {error && !editingObligation && !addingObligation && !showNew && (
        <Alert variant="error" className="mt-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-slate-200/70 bg-white/90 px-4 py-4 backdrop-blur-md lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="חיפוש לפי שם מקצוע או מטלה..."
            className="max-w-md flex-1"
          />
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { key: "all", label: "הכל" },
              ...Object.entries(categories).map(([k, v]) => ({ key: k, label: v })),
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-4 py-2.5 text-base font-medium transition ${
                  filter === f.key
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={expandAll}>
              <ChevronsDown className="h-4 w-4" />
              הרחב הכל
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={collapseAll}>
              <ChevronsUp className="h-4 w-4" />
              כווץ הכל
            </Button>
          </div>
        </div>
      </div>

      {showNew && (
        <div className="mt-6 card p-6">
          <h3 className="font-semibold">מקצוע חדש</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">שם מקצוע</label>
              <input
                className="input"
                value={newSubjectMeta.name}
                onChange={(e) => setNewSubjectMeta({ ...newSubjectMeta, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">יחידות</label>
              <input
                type="number"
                className="input"
                value={newSubjectMeta.units}
                onChange={(e) =>
                  setNewSubjectMeta({ ...newSubjectMeta, units: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="label">קטגוריה</label>
              <select
                className="input"
                value={newSubjectMeta.category}
                onChange={(e) =>
                  setNewSubjectMeta({ ...newSubjectMeta, category: e.target.value })
                }
              >
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-slate-700">מטלות</h4>
              <button
                type="button"
                onClick={() =>
                  setNewSubjectObligations([...newSubjectObligations, { ...EMPTY_OBLIGATION }])
                }
                className="flex items-center gap-1 text-sm text-primary-600"
              >
                <Plus className="h-4 w-4" />
                הוסף מטלה
              </button>
            </div>
            {newSubjectObligations.map((ob, idx) => (
              <div key={idx} className="relative">
                {newSubjectObligations.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setNewSubjectObligations(newSubjectObligations.filter((_, i) => i !== idx))
                    }
                    className="absolute left-2 top-2 z-10 text-xs text-red-500"
                  >
                    הסר מטלה
                  </button>
                )}
                <ObligationEditor
                  draft={ob}
                  compact
                  onChange={(d) => {
                    const next = [...newSubjectObligations];
                    next[idx] = d;
                    setNewSubjectObligations(next);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {error && (
              <Alert variant="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={addSubject} disabled={saving} className="btn-primary">
                שמור מקצוע
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNew(false);
                  setError(null);
                }}
                className="btn-secondary"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {filtered.length === 0 && subjects.length > 0 && (
          <div className="card p-8 text-center text-slate-500">
            לא נמצאו מקצועות התואמים לחיפוש &quot;{search}&quot;
          </div>
        )}
        {filtered.map((subject) => {
          const totalWeight = subject.obligations.reduce((s, o) => s + o.weightPercent, 0);
          const isOpen = expandedIds.has(subject.id);
          const weightOk = totalWeight === 100;

          return (
            <Card key={subject.id} variant="flat" className="overflow-hidden">
              <div className="flex items-center gap-3 p-5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(subject.id)}
                  className="shrink-0 rounded-lg p-1 hover:bg-slate-100"
                  aria-label={isOpen ? "סגור" : "פתח"}
                >
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpanded(subject.id)}
                  className="min-w-0 flex-1 text-right"
                >
                  <div className="flex flex-wrap items-center justify-start gap-2">
                    <span className="badge-info">{categories[subject.category]}</span>
                    {subject.units != null && (
                      <span className="badge-muted">{subject.units} יח&quot;ל</span>
                    )}
                    <span
                      className={
                        weightOk ? "badge-success" : "badge-warning"
                      }
                    >
                      משקל {totalWeight}%
                    </span>
                    <h3 className="text-lg font-semibold">
                      {formatSubjectWithPathLinks(subject.name, subject.pathLinks, {
                        units: subject.units,
                        category: subject.category,
                      })}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {subject.obligations.length} מטלות
                    {!weightOk && " • יש לוודא שסה״כ המשקלים הוא 100%"}
                  </p>
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                  {editingSubject === subject.id ? (
                    <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="label">שם מקצוע</label>
                          <input
                            className="input"
                            value={subjectDraft.name}
                            onChange={(e) =>
                              setSubjectDraft({ ...subjectDraft, name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="label">יחידות</label>
                          <input
                            type="number"
                            className="input"
                            value={subjectDraft.units}
                            onChange={(e) =>
                              setSubjectDraft({
                                ...subjectDraft,
                                units: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="label">קטגוריה</label>
                          <select
                            className="input"
                            value={subjectDraft.category}
                            onChange={(e) =>
                              setSubjectDraft({ ...subjectDraft, category: e.target.value })
                            }
                          >
                            {Object.entries(categories).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveSubject(subject.id)}
                          disabled={saving}
                          className="btn-primary text-sm"
                        >
                          שמירה
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSubject(null)}
                          className="btn-secondary text-sm"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingObligation(subject.id);
                          setEditingObligation(null);
                          setObligationDraft({ ...EMPTY_OBLIGATION });
                          setError(null);
                        }}
                        className="btn-primary text-sm"
                      >
                        <Plus className="h-4 w-4" />
                        הוסף מטלה
                      </button>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubject(subject.id);
                            setSubjectDraft({
                              name: subject.name,
                              units: subject.units ?? 0,
                              category: subject.category,
                            });
                          }}
                          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                          ערוך מקצוע
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSubject(subject.id)}
                          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          מחק מקצוע
                        </button>
                      </div>
                    </div>
                  )}

                  {addingObligation === subject.id && (
                    <div className="mb-4">
                      <h4 className="mb-2 text-sm font-medium text-slate-700">מטלה חדשה</h4>
                      <ObligationEditor
                        draft={obligationDraft}
                        onChange={setObligationDraft}
                        onSave={() => saveObligation(subject.id)}
                        onCancel={() => {
                          setAddingObligation(null);
                          setError(null);
                        }}
                        saving={saving}
                        showAddAnother
                        onSaveAndAddAnother={() => saveObligation(subject.id, undefined, true)}
                        error={error}
                        onClearError={() => setError(null)}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    {subject.obligations.length === 0 && addingObligation !== subject.id && (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
                        אין מטלות למקצוע זה. לחץ &quot;הוסף מטלה&quot; למעלה.
                      </p>
                    )}
                    {subject.obligations.map((o) => (
                      <div key={o.id}>
                        {editingObligation === o.id ? (
                          <ObligationEditor
                            draft={obligationDraft}
                            onChange={setObligationDraft}
                            onSave={() => saveObligation(subject.id, o.id)}
                            onCancel={() => {
                              setEditingObligation(null);
                              setError(null);
                            }}
                            saving={saving}
                            error={error}
                            onClearError={() => setError(null)}
                            obligationId={o.id}
                            onManageGradeYearOverrides={setOverrideModal}
                            getOverrideCount={(subItemSortOrder) =>
                              getOverrideCount(o.id, subItemSortOrder)
                            }
                          />
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-lg font-bold text-slate-900">
                                    {o.name || o.examEvent || "מטלה"}
                                  </span>
                                  {o.questionnaireNumber && (
                                    <span className="badge-muted text-sm font-semibold" dir="ltr">
                                      שאלון {o.questionnaireNumber}
                                    </span>
                                  )}
                                  <span className="badge-warning text-sm font-semibold">
                                    {o.weightPercent}% מהסופי
                                  </span>
                                  <span
                                    className={`badge-muted text-sm font-semibold ${o.examType === "חיצוני" ? "bg-orange-50 text-orange-700" : ""}`}
                                  >
                                    {o.examType}
                                  </span>
                                  {o.gradeYear && (
                                    <span className="text-base font-medium text-slate-600">
                                      {o.gradeYear}
                                    </span>
                                  )}
                                  <ObligationGradeYearOverrideButton
                                    compact
                                    overrideCount={getOverrideCount(o.id, null)}
                                    onClick={() =>
                                      setOverrideModal({
                                        obligationId: o.id,
                                        obligationLabel: o.name || o.examEvent || "מטלה",
                                        defaultGradeYear: o.gradeYear,
                                        subItemSortOrder: null,
                                      })
                                    }
                                  />
                                </div>

                                {o.studyMaterial && (
                                  <p className="mt-3 text-base text-slate-700">
                                    <span className="font-semibold text-slate-900">חומר: </span>
                                    {o.studyMaterial}
                                  </p>
                                )}

                                {o.components.length > 0 && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="text-base font-semibold text-slate-800">
                                      שקלול במטלה:
                                    </span>
                                    {o.components.map((c, i) => (
                                      <span key={i} className="badge-muted text-sm font-medium">
                                        {c.name}: <strong>{c.weightPercent}%</strong>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {o.subItems.length > 0 && (
                                  <div className="mt-4 grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {o.subItems.map((si, i) => {
                                      const sortOrder = si.sortOrder ?? i;
                                      return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-4 py-2.5 text-base"
                                      >
                                        <div className="min-w-0">
                                          <span className="font-medium text-slate-800">
                                            {si.name}
                                          </span>
                                          {si.gradeYear && (
                                            <span className="me-2 text-xs text-slate-500">
                                              · {si.gradeYear}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <ObligationGradeYearOverrideButton
                                            compact
                                            overrideCount={getOverrideCount(o.id, sortOrder)}
                                            onClick={() =>
                                              setOverrideModal({
                                                obligationId: o.id,
                                                obligationLabel:
                                                  o.name || o.examEvent || "מטלה",
                                                defaultGradeYear:
                                                  si.gradeYear ?? o.gradeYear,
                                                subItemSortOrder: sortOrder,
                                                subItemLabel: si.name || `תת-מטלה ${i + 1}`,
                                              })
                                            }
                                          />
                                          <span className="font-semibold text-primary-600">
                                            {si.weightPercent}%
                                          </span>
                                        </div>
                                      </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingObligation(o.id);
                                    setAddingObligation(null);
                                    setObligationDraft(obligationToDraft(o));
                                    setError(null);
                                  }}
                                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteObligation(subject.id, o.id)}
                                  className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {overrideModal && (
        <ObligationGradeYearOverridesModal
          open
          onClose={() => setOverrideModal(null)}
          {...overrideModal}
          classes={classes}
          overrides={gradeYearOverrides}
          onChanged={() => {
            void mutateGradeYearOverrides();
          }}
        />
      )}
    </>
  );
}
