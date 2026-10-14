"use client";

import { Plus, X, Check } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { defaultGradeEntryDueDate } from "@/lib/grade-due-date";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";
import { ObligationGradeYearOverrideButton } from "@/components/subjects/ObligationGradeYearOverridesModal";
import type { OverrideModalTarget } from "@/components/subjects/ObligationGradeYearOverridesModal";

export type WeightedItem = { name: string; weightPercent: number };

export type SubItemDraft = WeightedItem & {
  gradeEntryDueDate: string;
  /** ריק = יורש את שכבת המטלה */
  gradeYear: string;
};

export type ObligationDraft = {
  id?: string;
  questionnaireNumber: string;
  name: string;
  weightPercent: number;
  examType: string;
  studyMaterial: string;
  examEvent: string;
  gradeYear: string;
  gradeEntryDueDate: string;
  components: WeightedItem[];
  subItems: SubItemDraft[];
};

export const EMPTY_OBLIGATION: ObligationDraft = {
  questionnaireNumber: "",
  name: "",
  weightPercent: 0,
  examType: "פנימי",
  studyMaterial: "",
  examEvent: "",
  gradeYear: "",
  gradeEntryDueDate: defaultGradeEntryDueDate(),
  components: [{ name: "ציון פנימי", weightPercent: 100 }],
  subItems: [],
};

function WeightedListEditor({
  label,
  hint,
  items,
  onChange,
}: {
  label: string;
  hint?: string;
  items: WeightedItem[];
  onChange: (items: WeightedItem[]) => void;
}) {
  const total = items.reduce((s, i) => s + (i.weightPercent || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-slate-700">{label}</span>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange([...items, { name: "", weightPercent: 0 }])}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus className="h-3 w-3" />
          הוסף
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">אין פריטים</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input flex-1 py-1.5 text-sm"
                placeholder="שם"
                value={item.name}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], name: e.target.value };
                  onChange(next);
                }}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="input w-24 py-1.5 text-sm"
                placeholder="%"
                value={item.weightPercent || ""}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = {
                    ...next[i],
                    weightPercent: parseFloat(e.target.value) || 0,
                  };
                  onChange(next);
                }}
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="px-1 text-red-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-400">סה&quot;כ: {total.toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}

function SubItemsListEditor({
  items,
  onChange,
  obligationGradeYear,
  onManageGradeYearOverride,
  getSubItemOverrideCount,
}: {
  items: SubItemDraft[];
  onChange: (items: SubItemDraft[]) => void;
  obligationGradeYear?: string;
  onManageGradeYearOverride?: (
    sortOrder: number,
    label: string,
    defaultGradeYear: string | null
  ) => void;
  getSubItemOverrideCount?: (sortOrder: number) => number;
}) {
  const total = items.reduce((s, i) => s + (i.weightPercent || 0), 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-slate-700">עבודות / תת-מטלות</span>
          <p className="text-xs text-slate-400">כמה אחוז כל עבודה שווה מתוך המטלה הכללית</p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...items,
              {
                name: "",
                weightPercent: 0,
                gradeEntryDueDate: defaultGradeEntryDueDate(),
                gradeYear: "",
              },
            ])
          }
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <Plus className="h-3 w-3" />
          הוסף
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">אין פריטים</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const sortOrder = i;
            const defaultSubGradeYear =
              normalizeGradeYear(item.gradeYear) ??
              normalizeGradeYear(obligationGradeYear) ??
              null;
            return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-[8rem] flex-1 py-1.5 text-sm"
                placeholder="שם"
                value={item.name}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], name: e.target.value };
                  onChange(next);
                }}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="input w-20 py-1.5 text-sm"
                placeholder="%"
                value={item.weightPercent || ""}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = {
                    ...next[i],
                    weightPercent: parseFloat(e.target.value) || 0,
                  };
                  onChange(next);
                }}
              />
              <select
                className="input w-32 py-1.5 text-sm"
                title="שכבה לתת-מטלה (ריק = כמו המטלה)"
                value={item.gradeYear || ""}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], gradeYear: e.target.value };
                  onChange(next);
                }}
              >
                <option value="">כמו המטלה</option>
                {CANONICAL_GRADE_YEARS.map((gy) => (
                  <option key={gy} value={gy}>
                    {gy}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="input w-36 py-1.5 text-sm"
                dir="ltr"
                title="תאריך יעד להזנה"
                value={item.gradeEntryDueDate || defaultGradeEntryDueDate()}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], gradeEntryDueDate: e.target.value };
                  onChange(next);
                }}
              />
              {onManageGradeYearOverride && (
                <ObligationGradeYearOverrideButton
                  compact
                  overrideCount={getSubItemOverrideCount?.(sortOrder) ?? 0}
                  onClick={() =>
                    onManageGradeYearOverride(
                      sortOrder,
                      item.name || `תת-מטלה ${i + 1}`,
                      defaultSubGradeYear
                    )
                  }
                />
              )}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="px-1 text-red-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            );
          })}
          <p className="text-xs text-slate-400">סה&quot;כ: {total.toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}

export function ObligationEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  saveLabel = "שמירה",
  showAddAnother,
  onSaveAndAddAnother,
  compact = false,
  error,
  onClearError,
  obligationId,
  onManageGradeYearOverrides,
  getOverrideCount,
}: {
  draft: ObligationDraft;
  onChange: (d: ObligationDraft) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
  saveLabel?: string;
  showAddAnother?: boolean;
  onSaveAndAddAnother?: () => void;
  compact?: boolean;
  error?: string | null;
  onClearError?: () => void;
  /** נדרש לניהול חריגי שכבה (רק למטלה קיימת) */
  obligationId?: string;
  onManageGradeYearOverrides?: (target: OverrideModalTarget) => void;
  getOverrideCount?: (subItemSortOrder?: number | null) => number;
}) {
  const canManageOverrides = !!obligationId && !!onManageGradeYearOverrides;

  function openObligationOverrides() {
    if (!canManageOverrides) return;
    onManageGradeYearOverrides!({
      obligationId: obligationId!,
      obligationLabel: draft.name || draft.examEvent || "מטלה",
      defaultGradeYear: draft.gradeYear || null,
      subItemSortOrder: null,
    });
  }

  function openSubItemOverrides(sortOrder: number, label: string, defaultGradeYear: string | null) {
    if (!canManageOverrides) return;
    onManageGradeYearOverrides!({
      obligationId: obligationId!,
      obligationLabel: draft.name || draft.examEvent || "מטלה",
      defaultGradeYear,
      subItemSortOrder: sortOrder,
      subItemLabel: label,
    });
  }
  return (
    <div className="space-y-3 rounded-xl border border-primary-200 bg-primary-50/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">שם מטלה</label>
          <input
            className="input"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="לדוגמה: בגרות חיצונית"
          />
        </div>
        <div>
          <label className="label">מספר שאלון</label>
          <input
            className="input"
            dir="ltr"
            value={draft.questionnaireNumber}
            onChange={(e) => onChange({ ...draft, questionnaireNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="label">אחוז מהציון הסופי (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            className="input"
            value={draft.weightPercent || ""}
            onChange={(e) =>
              onChange({ ...draft, weightPercent: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <label className="label">סוג היבחנות</label>
          <select
            className="input"
            value={draft.examType}
            onChange={(e) => onChange({ ...draft, examType: e.target.value })}
          >
            <option value="פנימי">פנימי</option>
            <option value="חיצוני">חיצוני</option>
          </select>
        </div>
        <div>
          <label className="label">שכבה</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input min-w-[10rem] flex-1"
              value={draft.gradeYear}
              onChange={(e) => onChange({ ...draft, gradeYear: e.target.value })}
            >
              <option value="">בחר שכבה</option>
              {CANONICAL_GRADE_YEARS.map((gy) => (
                <option key={gy} value={gy}>
                  {gy}
                </option>
              ))}
            </select>
            {canManageOverrides && (
              <ObligationGradeYearOverrideButton
                overrideCount={getOverrideCount?.(null) ?? 0}
                onClick={openObligationOverrides}
              />
            )}
          </div>
        </div>
        <div>
          <label className="label">אירוע בחינה</label>
          <input
            className="input"
            value={draft.examEvent}
            onChange={(e) => onChange({ ...draft, examEvent: e.target.value })}
          />
        </div>
        <div>
          <label className="label">תאריך אחרון להזנת ציונים</label>
          <input
            type="date"
            className="input"
            dir="ltr"
            value={draft.gradeEntryDueDate}
            onChange={(e) => onChange({ ...draft, gradeEntryDueDate: e.target.value })}
          />
          <p className="mt-1 text-xs text-slate-400">
            לאחר תאריך זה תישלח תזכורת למורה, רכז השכבה ולמנהל
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label">חומר לימוד</label>
          <input
            className="input"
            value={draft.studyMaterial}
            onChange={(e) => onChange({ ...draft, studyMaterial: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <WeightedListEditor
          label="שקלול בתוך המטלה"
          hint="כמה אחוז כל רכיב (בחינה / הגשה / פנימי) שווה מתוך המטלה"
          items={draft.components}
          onChange={(components) => onChange({ ...draft, components })}
        />
        <SubItemsListEditor
          items={draft.subItems}
          onChange={(subItems) => onChange({ ...draft, subItems })}
          obligationGradeYear={draft.gradeYear}
          onManageGradeYearOverride={
            canManageOverrides ? openSubItemOverrides : undefined
          }
          getSubItemOverrideCount={
            canManageOverrides
              ? (sortOrder) => getOverrideCount?.(sortOrder) ?? 0
              : undefined
          }
        />
      </div>

      {!compact && error && (
        <Alert variant="error" onClose={onClearError}>
          {error}
        </Alert>
      )}

      {!compact && onSave && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary text-sm"
          >
            <Check className="h-4 w-4" />
            {saving ? "שומר..." : saveLabel}
          </button>
          {showAddAnother && onSaveAndAddAnother && (
            <button
              type="button"
              onClick={onSaveAndAddAnother}
              disabled={saving}
              className="btn-secondary text-sm"
            >
              <Plus className="h-4 w-4" />
              שמור והוסף עוד
            </button>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              ביטול
            </button>
          )}
        </div>
      )}
    </div>
  );
}
