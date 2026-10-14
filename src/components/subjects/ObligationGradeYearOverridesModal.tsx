"use client";

import { useMemo, useState } from "react";
import { Layers, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import { CANONICAL_GRADE_YEARS } from "@/lib/grade-year";
import { invalidateCache } from "@/lib/api-cache";
import type { ObligationClassGradeYearOverride } from "@/lib/types";

type ClassOption = {
  id: string;
  name: string;
  gradeYear: string | null;
};

export type OverrideModalTarget = {
  obligationId: string;
  obligationLabel: string;
  defaultGradeYear: string | null;
  /** null = המטלה השלמה; מספר = תת-מטלה */
  subItemSortOrder?: number | null;
  subItemLabel?: string | null;
};

type Props = OverrideModalTarget & {
  open: boolean;
  onClose: () => void;
  classes: ClassOption[];
  overrides: ObligationClassGradeYearOverride[];
  onChanged?: () => void;
};

function matchesScope(
  override: ObligationClassGradeYearOverride,
  obligationId: string,
  subItemSortOrder: number | null
): boolean {
  if (override.obligationId !== obligationId) return false;
  const overrideSub = override.subItemSortOrder ?? null;
  return overrideSub === subItemSortOrder;
}

export function ObligationGradeYearOverridesModal({
  open,
  onClose,
  obligationId,
  obligationLabel,
  defaultGradeYear,
  subItemSortOrder = null,
  subItemLabel,
  classes,
  overrides,
  onChanged,
}: Props) {
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [effectiveGradeYear, setEffectiveGradeYear] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeSubItemSortOrder = subItemSortOrder ?? null;
  const isSubItem = scopeSubItemSortOrder != null;

  const scopedOverrides = useMemo(
    () =>
      overrides.filter((item) =>
        matchesScope(item, obligationId, scopeSubItemSortOrder)
      ),
    [overrides, obligationId, scopeSubItemSortOrder]
  );

  const takenClassIds = useMemo(() => {
    const ids = new Set<string>();
    for (const override of scopedOverrides) {
      for (const classId of override.classIds) ids.add(classId);
    }
    return ids;
  }, [scopedOverrides]);

  const availableClasses = useMemo(
    () =>
      classes
        .filter((cls) => !takenClassIds.has(cls.id))
        .sort((a, b) => a.name.localeCompare(b.name, "he")),
    [classes, takenClassIds]
  );

  function resetForm() {
    setSelectedClassIds([]);
    setEffectiveGradeYear("");
    setNote("");
    setError(null);
  }

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  }

  async function handleCreate() {
    if (selectedClassIds.length === 0) {
      setError("יש לבחור לפחות כיתה אחת");
      return;
    }
    if (!effectiveGradeYear) {
      setError("יש לבחור שכבה אפקטיבית");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/obligations/grade-year-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId,
          subItemSortOrder: scopeSubItemSortOrder,
          classIds: selectedClassIds,
          effectiveGradeYear,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");

      invalidateCache("/api/obligations/grade-year-overrides");
      resetForm();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/obligations/grade-year-overrides?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה במחיקה");

      invalidateCache("/api/obligations/grade-year-overrides");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה במחיקה");
    } finally {
      setSaving(false);
    }
  }

  function classLabel(classId: string): string {
    const cls = classes.find((item) => item.id === classId);
    if (!cls) return classId;
    return cls.gradeYear ? `${cls.name} (${cls.gradeYear})` : cls.name;
  }

  const scopeTitle = isSubItem
    ? `תת-מטלה: ${subItemLabel || `#${scopeSubItemSortOrder}`}`
    : "מטלה שלמה";

  return (
    <Modal
      open={open}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="חריגי שכבה לפי כיתות"
      size="lg"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">{obligationLabel}</p>
          <p className="mt-1 text-slate-600">היקף: {scopeTitle}</p>
          <p className="mt-1 text-slate-600">
            שכבה ברירת מחדל: {defaultGradeYear || "לא הוגדרה"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            החריג חל רק על {isSubItem ? "תת-המטלה הזו" : "המטלה השלמה"} — לא על
            {isSubItem ? " שאר תתי-המטלות" : " תתי-מטלות ספציפיות"}.
          </p>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {scopedOverrides.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">חריגים קיימים</p>
            {scopedOverrides.map((override) => (
              <div
                key={override.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">
                      ניגשות ב{override.effectiveGradeYear}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {override.classIds.map(classLabel).join(" · ")}
                    </p>
                    {override.note ? (
                      <p className="mt-1 text-xs text-slate-500">{override.note}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(override.id)}
                    disabled={saving}
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    aria-label="מחק חריג"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">אין חריגים ל{isSubItem ? "תת-מטלה זו" : "מטלה זו"}.</p>
        )}

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">הוספת חריג חדש</p>

          <div className="space-y-3">
            <div>
              <label className="label">כיתות</label>
              {availableClasses.length === 0 ? (
                <p className="text-xs text-slate-500">כל הכיתות כבר משויכות לחריג.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {availableClasses.map((cls) => (
                    <label
                      key={cls.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(cls.id)}
                        onChange={() => toggleClass(cls.id)}
                      />
                      <span className="text-sm text-slate-700">
                        {cls.name}
                        {cls.gradeYear ? ` (${cls.gradeYear})` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">שכבה אפקטיבית</label>
              <Select
                value={effectiveGradeYear}
                onChange={(e) => setEffectiveGradeYear(e.target.value)}
              >
                <option value="">בחר שכבה</option>
                {CANONICAL_GRADE_YEARS.map((gy) => (
                  <option key={gy} value={gy}>
                    {gy}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="label">הערה (אופציונלי)</label>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="למשל: מועד חורף"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
              <X className="h-4 w-4" />
              נקה
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={saving || availableClasses.length === 0}
            >
              <Plus className="h-4 w-4" />
              {saving ? "שומר..." : "הוסף חריג"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ObligationGradeYearOverrideButton({
  overrideCount,
  onClick,
  compact = false,
  label,
}: {
  overrideCount: number;
  onClick: () => void;
  compact?: boolean;
  label?: string;
}) {
  const text =
    label ??
    (overrideCount > 0 ? `${overrideCount} חריגים` : compact ? "חריג" : "חריגים");

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      title="חריגי שכבה לפי כיתות"
    >
      <Layers className="h-3.5 w-3.5" />
      {text}
    </button>
  );
}
