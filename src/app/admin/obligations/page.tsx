"use client";

import { useMemo, useState, Fragment } from "react";
import { Save, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ExportButton } from "@/components/ui/ExportButton";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { invalidateCache } from "@/lib/api-cache";
import { downloadExcel, exportTimestamp } from "@/lib/excel-export";
import { defaultGradeEntryDueDate, resolveGradeEntryDueDate } from "@/lib/grade-due-date";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";
import {
  hasSeparateComponentGrades,
  hasSubItemGrades,
  normalizeComponents,
  normalizeSubItems,
} from "@/lib/grade-components";
import {
  ObligationGradeYearOverrideButton,
  ObligationGradeYearOverridesModal,
  type OverrideModalTarget,
} from "@/components/subjects/ObligationGradeYearOverridesModal";
import {
  countOverridesForSubItem,
} from "@/lib/obligation-grade-year-overrides";
import type { ObligationClassGradeYearOverride } from "@/lib/types";

type SubItem = {
  name: string;
  weightPercent: number;
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

type WeightedItem = { name: string; weightPercent: number; sortOrder?: number };

type Subject = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  teacherId?: string | null;
  pathLinks?: Array<{ path: { label: string } }>;
  obligations: Obligation[];
};

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ClassItem = {
  id: string;
  name: string;
  gradeYear: string | null;
};

type OverrideModalState = OverrideModalTarget | null;

type EditableField =
  | "name"
  | "questionnaireNumber"
  | "weightPercent"
  | "examType"
  | "examEvent"
  | "gradeYear"
  | "gradeEntryDueDate"
  | "studyMaterial";

type RowEdits = Partial<Record<EditableField, string | number | null>>;

const CATEGORY_LABELS: Record<string, string> = {
  MANDATORY: "חובה",
  MATH: "מתמטיקה",
  ENGLISH: "אנגלית",
  TRACK: "מגמה",
  EXTENSION: "הרחבה",
};

function subjectDetails(subject: Subject): string {
  const parts: string[] = [];
  if (subject.units != null) parts.push(`${subject.units} יח"ל`);
  const pathLabels = (subject.pathLinks ?? [])
    .map((pl) => pl.path.label)
    .filter(Boolean);
  if (pathLabels.length > 0) parts.push(pathLabels.join(", "));
  if (parts.length === 0) {
    return CATEGORY_LABELS[subject.category] ?? subject.category;
  }
  return parts.join(" · ");
}

function obligationHasBreakdown(obligation: Obligation): boolean {
  const components = normalizeComponents(obligation.components ?? []);
  const subItems = normalizeSubItems(obligation.subItems ?? []);
  return hasSubItemGrades(subItems) || hasSeparateComponentGrades(components) || components.length > 0;
}

export default function ObligationsBoardPage() {
  const toast = useToast();
  const { data: subjects = [], loading, mutate } = useApi<Subject[]>("/api/subjects");
  const { data: staff = [] } = useApi<StaffMember[]>("/api/staff");
  const { data: classes = [] } = useApi<ClassItem[]>("/api/classes");
  const {
    data: gradeYearOverrides = [],
    mutate: mutateGradeYearOverrides,
  } = useApi<ObligationClassGradeYearOverride[]>("/api/obligations/grade-year-overrides");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeYearFilter, setGradeYearFilter] = useState("");
  const [overrideModal, setOverrideModal] = useState<OverrideModalState>(null);
  const [edits, setEdits] = useState<Record<string, RowEdits>>({});
  const [subjectEdits, setSubjectEdits] = useState<Record<string, string>>({});
  const [subItemEdits, setSubItemEdits] = useState<Record<string, Record<number, string>>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teachers = useMemo(
    () =>
      staff
        .filter((m) => m.role === "TEACHER")
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "he")),
    [staff]
  );

  const staffById = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff]);

  const getOverrideCount = useMemo(() => {
    return (obligationId: string, subItemSortOrder?: number | null) => {
      if (subItemSortOrder != null) {
        return countOverridesForSubItem(gradeYearOverrides, obligationId, subItemSortOrder);
      }
      return gradeYearOverrides.filter(
        (o) => o.obligationId === obligationId && (o.subItemSortOrder ?? null) == null
      ).length;
    };
  }, [gradeYearOverrides]);

  const rows = useMemo(() => {
    const flat = subjects.flatMap((s) =>
      s.obligations.map((o) => ({ subject: s, obligation: o }))
    );
    return flat.sort((a, b) => {
      const bySubject = a.subject.name.localeCompare(b.subject.name, "he");
      if (bySubject !== 0) return bySubject;
      return a.obligation.sortOrder - b.obligation.sortOrder;
    });
  }, [subjects]);

  const gradeYears = useMemo(() => {
    const set = new Set<string>(CANONICAL_GRADE_YEARS);
    for (const { obligation } of rows) {
      if (obligation.gradeYear) set.add(obligation.gradeYear);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ subject, obligation }) => {
      if (subjectFilter && subject.id !== subjectFilter) return false;
      if (gradeYearFilter) {
        const wanted = normalizeGradeYear(gradeYearFilter);
        const parentYear = normalizeGradeYear(obligation.gradeYear);
        const subItemMatch = (obligation.subItems ?? []).some(
          (si) => normalizeGradeYear(si.gradeYear) === wanted
        );
        if (parentYear !== wanted && !subItemMatch) return false;
      }
      if (!q) return true;
      return (
        subject.name.toLowerCase().includes(q) ||
        (obligation.name ?? "").toLowerCase().includes(q) ||
        (obligation.examEvent ?? "").toLowerCase().includes(q) ||
        (obligation.questionnaireNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, subjectFilter, gradeYearFilter]);

  function fieldValue(
    obligation: Obligation,
    field: EditableField
  ): string | number {
    const edit = edits[obligation.id];
    if (edit && field in edit) {
      const v = edit[field];
      return v == null ? "" : v;
    }
    const raw = obligation[field];
    if (field === "gradeEntryDueDate") {
      return resolveGradeEntryDueDate(raw as string | null | undefined);
    }
    return raw == null ? "" : raw;
  }

  function toggleExpanded(obligationId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(obligationId)) next.delete(obligationId);
      else next.add(obligationId);
      return next;
    });
  }

  function teacherValue(subject: Subject): string {
    if (subject.id in subjectEdits) return subjectEdits[subject.id];
    return subject.teacherId ?? "";
  }

  function setTeacher(subjectId: string, teacherId: string) {
    setSubjectEdits((prev) => ({ ...prev, [subjectId]: teacherId }));
  }

  function setField(
    subjectId: string,
    obligationId: string,
    field: EditableField,
    value: string
  ) {
    setEdits((prev) => ({
      ...prev,
      [obligationId]: { ...prev[obligationId], [field]: value },
    }));
  }

  function setSubItemDue(obligationId: string, sortOrder: number, value: string) {
    setSubItemEdits((prev) => ({
      ...prev,
      [obligationId]: { ...prev[obligationId], [sortOrder]: value },
    }));
  }

  function subItemDueValue(obligation: Obligation, sortOrder: number): string {
    const edit = subItemEdits[obligation.id]?.[sortOrder];
    if (edit !== undefined) return edit;
    const si = obligation.subItems.find((s, i) => (s.sortOrder ?? i) === sortOrder);
    return resolveGradeEntryDueDate(si?.gradeEntryDueDate);
  }

  const dirtyCount =
    Object.keys(edits).length +
    Object.keys(subjectEdits).length +
    Object.values(subItemEdits).filter((m) => Object.keys(m).length > 0).length;

  async function save() {
    if (dirtyCount === 0) return;
    setSaving(true);
    setError(null);

    const subjectByObligation = new Map<string, string>();
    for (const { subject, obligation } of rows) {
      subjectByObligation.set(obligation.id, subject.id);
    }

    const obligationIds = new Set([
      ...Object.keys(edits),
      ...Object.keys(subItemEdits).filter((id) => Object.keys(subItemEdits[id] ?? {}).length > 0),
    ]);

    const updates = [...obligationIds].map((obligationId) => {
      const obligation = rows.find((r) => r.obligation.id === obligationId)?.obligation;
      const normalized: RowEdits & { subItems?: SubItem[] } = { ...(edits[obligationId] ?? {}) };
      if ("weightPercent" in normalized) {
        normalized.weightPercent =
          normalized.weightPercent === "" || normalized.weightPercent == null
            ? 0
            : Number(normalized.weightPercent);
      }
      if ("gradeEntryDueDate" in normalized) {
        normalized.gradeEntryDueDate =
          normalized.gradeEntryDueDate === "" || normalized.gradeEntryDueDate == null
            ? defaultGradeEntryDueDate()
            : normalized.gradeEntryDueDate;
      } else if (obligation && !obligation.gradeEntryDueDate) {
        normalized.gradeEntryDueDate = defaultGradeEntryDueDate();
      }

      const subEdits = subItemEdits[obligationId];
      if (subEdits && obligation) {
        normalized.subItems = obligation.subItems.map((si, i) => {
          const sortOrder = si.sortOrder ?? i;
          const dueEdit = subEdits[sortOrder];
          return {
            ...si,
            sortOrder,
            gradeEntryDueDate:
              dueEdit ??
              resolveGradeEntryDueDate(si.gradeEntryDueDate),
          };
        });
      }

      return {
        subjectId: subjectByObligation.get(obligationId)!,
        obligationId,
        patch: normalized,
      };
    });

    try {
      if (updates.length > 0) {
        const res = await fetch("/api/obligations/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "שגיאה בשמירה");
          return;
        }
      }

      const subjectIds = Object.keys(subjectEdits);
      if (subjectIds.length > 0) {
        const results = await Promise.all(
          subjectIds.map((id) =>
            fetch("/api/subjects", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, teacherId: subjectEdits[id] || null }),
            })
          )
        );
        const failed = results.find((r) => !r.ok);
        if (failed) {
          const json = await failed.json().catch(() => ({}));
          setError(json.error ?? "שגיאה בשמירת שיוך מורה");
          return;
        }
      }

      invalidateCache("/api/subjects");
      await mutate();
      setEdits({});
      setSubjectEdits({});
      setSubItemEdits({});
      const saved =
        updates.length + Object.keys(subjectEdits).length;
      toast.success(
        saved > 0 ? `${saved} עדכונים נשמרו` : "השינויים נשמרו"
      );
    } catch {
      setError("שגיאת רשת בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    await downloadExcel(`לוח_מטלות_${exportTimestamp()}.xlsx`, [
      {
        name: "מטלות",
        title: `לוח מטלות וציונים (${filteredRows.length})`,
        columns: [
          { header: "מקצוע", key: "subject" },
          { header: "מורה", key: "teacher" },
          { header: "מסלול / יח\"ל", key: "details" },
          { header: "מטלה", key: "name" },
          { header: "שאלון", key: "questionnaire" },
          { header: "אירוע", key: "event" },
          { header: "שכבה", key: "gradeYear" },
          { header: "משקל %", key: "weight" },
          { header: "תאריך הגשה", key: "due" },
          { header: "סוג", key: "examType" },
        ],
        rows: filteredRows.flatMap(({ subject, obligation }) => {
          const teacherMember = staffById.get(teacherValue(subject));
          const base = {
            subject: subject.name,
            teacher: teacherMember?.name || teacherMember?.email || "—",
            details: subjectDetails(subject),
            name: obligation.name ?? "—",
            questionnaire: obligation.questionnaireNumber ?? "—",
            event: obligation.examEvent ?? "—",
            gradeYear: obligation.gradeYear ?? "—",
            weight: obligation.weightPercent,
            due: resolveGradeEntryDueDate(obligation.gradeEntryDueDate),
            examType: obligation.examType,
            breakdown: "",
          };
          const breakdownRows: typeof base[] = [];
          for (const c of obligation.components ?? []) {
            breakdownRows.push({
              ...base,
              name: `↳ רכיב: ${c.name}`,
              weight: c.weightPercent,
              breakdown: "component",
            });
          }
          for (const si of obligation.subItems ?? []) {
            breakdownRows.push({
              ...base,
              name: `↳ תת-מטלה: ${si.name}`,
              weight: si.weightPercent,
              due: resolveGradeEntryDueDate(si.gradeEntryDueDate),
              breakdown: "subItem",
            });
          }
          return [base, ...breakdownRows];
        }),
      },
    ]);
  }

  if (loading && subjects.length === 0) {
    return (
      <>
        <PageHeader title="לוח מטלות וציונים" subtitle="עריכת נתוני כל אירועי הציון" />
        <div className="mt-8">
          <PageLoader variant="table" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="לוח מטלות וציונים"
        subtitle="טבלה מרוכזת לעריכת תאריכי הגשה, משקלים ופרטי כל אירועי הציון"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton onExport={handleExport} disabled={filteredRows.length === 0} />
          <Button onClick={save} disabled={dirtyCount === 0 || saving}>
            <Save className="h-4 w-4" />
            {saving ? "שומר..." : dirtyCount > 0 ? `שמור שינויים (${dirtyCount})` : "שמור"}
          </Button>
        </div>
      </PageHeader>

      {error && (
        <Alert variant="error" className="mt-4" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pr-9"
            placeholder="חיפוש מטלה, מקצוע, שאלון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="max-w-[220px]"
        >
          <option value="">כל המקצועות</option>
          {subjects
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "he"))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
        <Select
          value={gradeYearFilter}
          onChange={(e) => setGradeYearFilter(e.target.value)}
          className="max-w-[160px]"
        >
          <option value="">כל השכבות</option>
          {gradeYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <span className="text-sm text-slate-500">{filteredRows.length} מטלות</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const ids = filteredRows
              .filter(({ obligation }) => obligationHasBreakdown(obligation))
              .map(({ obligation }) => obligation.id);
            setExpandedIds(new Set(ids));
          }}
        >
          הרחב תתי-ציונים
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setExpandedIds(new Set())}>
          כווץ הכל
        </Button>
      </div>

      <Card variant="flat" className="mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="w-8 px-2 py-3" />
                <th className="px-3 py-3 text-right text-xs font-semibold">מקצוע</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">מורה</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">שם מטלה</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">שאלון</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">אירוע</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">שכבה</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">משקל %</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">תאריך הגשה</th>
                <th className="px-3 py-3 text-right text-xs font-semibold">סוג</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(({ subject, obligation }) => {
                const isDirty =
                  !!edits[obligation.id] ||
                  !!subItemEdits[obligation.id] ||
                  subject.id in subjectEdits;
                const hasBreakdown = obligationHasBreakdown(obligation);
                const isExpanded = expandedIds.has(obligation.id);
                const components = obligation.components ?? [];
                const subItems = obligation.subItems ?? [];

                return (
                  <Fragment key={obligation.id}>
                    <tr
                      className={isDirty ? "bg-primary-50/40" : "even:bg-slate-50/40"}
                    >
                      <td className="px-2 py-2 align-middle">
                        {hasBreakdown ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(obligation.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label={isExpanded ? "הסתר תתי-ציונים" : "הצג תתי-ציונים"}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="font-medium text-slate-800">{subject.name}</div>
                        <div className="text-xs text-slate-500">{subjectDetails(subject)}</div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <Select
                          value={teacherValue(subject)}
                          onChange={(e) => setTeacher(subject.id, e.target.value)}
                          className="min-w-[140px] py-1.5 text-sm"
                        >
                          <option value="">לא הוגדר</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name || t.email}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input py-1.5 text-sm"
                          value={fieldValue(obligation, "name")}
                          onChange={(e) =>
                            setField(subject.id, obligation.id, "name", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input w-20 py-1.5 text-sm"
                          dir="ltr"
                          value={fieldValue(obligation, "questionnaireNumber")}
                          onChange={(e) =>
                            setField(
                              subject.id,
                              obligation.id,
                              "questionnaireNumber",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input py-1.5 text-sm"
                          value={fieldValue(obligation, "examEvent")}
                          onChange={(e) =>
                            setField(subject.id, obligation.id, "examEvent", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1.5">
                          <select
                            className="input w-28 py-1.5 text-sm"
                            value={fieldValue(obligation, "gradeYear")}
                            onChange={(e) =>
                              setField(subject.id, obligation.id, "gradeYear", e.target.value)
                            }
                          >
                            <option value="">—</option>
                            {CANONICAL_GRADE_YEARS.map((gy) => (
                              <option key={gy} value={gy}>
                                {gy}
                              </option>
                            ))}
                          </select>
                          <ObligationGradeYearOverrideButton
                            overrideCount={getOverrideCount(obligation.id, null)}
                            onClick={() =>
                              setOverrideModal({
                                obligationId: obligation.id,
                                obligationLabel:
                                  obligation.name ||
                                  obligation.examEvent ||
                                  subject.name,
                                defaultGradeYear:
                                  String(fieldValue(obligation, "gradeYear") || "") || null,
                                subItemSortOrder: null,
                              })
                            }
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="input w-20 py-1.5 text-sm"
                          value={fieldValue(obligation, "weightPercent")}
                          onChange={(e) =>
                            setField(
                              subject.id,
                              obligation.id,
                              "weightPercent",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className="input w-40 py-1.5 text-sm"
                          dir="ltr"
                          value={fieldValue(obligation, "gradeEntryDueDate")}
                          onChange={(e) =>
                            setField(
                              subject.id,
                              obligation.id,
                              "gradeEntryDueDate",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input w-24 py-1.5 text-sm"
                          value={fieldValue(obligation, "examType")}
                          onChange={(e) =>
                            setField(subject.id, obligation.id, "examType", e.target.value)
                          }
                        />
                      </td>
                    </tr>
                    {isExpanded &&
                      components.map((c, i) => (
                        <tr
                          key={`${obligation.id}-c-${i}`}
                          className="bg-slate-50/60 text-slate-600"
                        >
                          <td />
                          <td />
                          <td className="px-3 py-1.5 text-xs" colSpan={1}>
                            <span className="me-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              רכיב
                            </span>
                            {c.name || `רכיב ${i + 1}`}
                          </td>
                          <td colSpan={3} />
                          <td className="px-3 py-1.5 text-sm font-medium">{c.weightPercent}%</td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    {isExpanded &&
                      subItems.map((si, i) => {
                        const sortOrder = si.sortOrder ?? i;
                        return (
                        <tr
                          key={`${obligation.id}-s-${i}`}
                          className="bg-slate-50/60 text-slate-600"
                        >
                          <td />
                          <td />
                          <td className="px-3 py-1.5 text-xs" colSpan={1}>
                            <span className="me-2 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                              תת-מטלה
                            </span>
                            {si.name || `תת-מטלה ${i + 1}`}
                          </td>
                          <td colSpan={3} />
                          <td className="px-3 py-1.5 text-sm font-medium">{si.weightPercent}%</td>
                          <td className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="date"
                                className="input w-36 py-1 text-sm"
                                dir="ltr"
                                value={subItemDueValue(obligation, sortOrder)}
                                onChange={(e) =>
                                  setSubItemDue(obligation.id, sortOrder, e.target.value)
                                }
                              />
                              <ObligationGradeYearOverrideButton
                                compact
                                overrideCount={getOverrideCount(obligation.id, sortOrder)}
                                onClick={() =>
                                  setOverrideModal({
                                    obligationId: obligation.id,
                                    obligationLabel:
                                      obligation.name ||
                                      obligation.examEvent ||
                                      subject.name,
                                    defaultGradeYear:
                                      si.gradeYear ||
                                      String(fieldValue(obligation, "gradeYear") || "") ||
                                      null,
                                    subItemSortOrder: sortOrder,
                                    subItemLabel: si.name || `תת-מטלה ${i + 1}`,
                                  })
                                }
                              />
                            </div>
                          </td>
                          <td />
                        </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

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
