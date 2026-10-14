"use client";

import { useMemo } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatSubjectWithPathLinks } from "@/lib/subject-display";

export type StudentFormData = {
  name: string;
  email: string;
  class: { id: string; name: string };
  trackIds: string[];
  mathUnits: number;
  englishUnits: number;
  mandatorySubjectIds: string[] | null;
};

type ClassOption = { id: string; name: string };
type TrackOption = { id: string; name: string };
type SubjectOption = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  pathLinks?: { path: { id: string; label: string; key: string } }[];
};

type StudentFormProps = {
  form: StudentFormData;
  onChange: (form: StudentFormData) => void;
  classes: ClassOption[];
  tracks: TrackOption[];
  allSubjects: SubjectOption[];
  examPathId: string | null;
  onClassChange?: (classId: string, examPathId: string | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting?: boolean;
  submitLabel?: string;
};

function mandatoryForPath(pathId: string | null, allSubjects: SubjectOption[]) {
  return allSubjects.filter(
    (s) =>
      s.category === "MANDATORY" &&
      (pathId ? s.pathLinks?.some((l) => l.path.id === pathId) : false)
  );
}

function otherMandatoryForPath(pathId: string | null, allSubjects: SubjectOption[]) {
  const pathIds = new Set(mandatoryForPath(pathId, allSubjects).map((s) => s.id));
  return allSubjects.filter((s) => s.category === "MANDATORY" && !pathIds.has(s.id));
}

function effectiveMandatoryIds(
  mandatorySubjectIds: string[] | null,
  pathMandatory: SubjectOption[]
) {
  if (mandatorySubjectIds === null) return pathMandatory.map((s) => s.id);
  return mandatorySubjectIds;
}

export function StudentForm({
  form,
  onChange,
  classes,
  tracks,
  allSubjects,
  examPathId,
  onClassChange,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = "שמירה",
}: StudentFormProps) {
  const pathMandatory = useMemo(
    () => mandatoryForPath(examPathId, allSubjects),
    [allSubjects, examPathId]
  );
  const otherMandatory = useMemo(
    () => otherMandatoryForPath(examPathId, allSubjects),
    [allSubjects, examPathId]
  );

  function toggleMandatorySubject(subjectId: string) {
    const pathIds = pathMandatory.map((s) => s.id);
    const selected = effectiveMandatoryIds(form.mandatorySubjectIds, pathMandatory);
    const next = selected.includes(subjectId)
      ? selected.filter((id) => id !== subjectId)
      : [...selected, subjectId];
    const isDefault =
      next.length === pathIds.length && pathIds.every((id) => next.includes(id));
    onChange({ ...form, mandatorySubjectIds: isDefault ? null : next });
  }

  function isMandatorySelected(subjectId: string) {
    return effectiveMandatoryIds(form.mandatorySubjectIds, pathMandatory).includes(subjectId);
  }

  function toggleTrack(trackId: string) {
    const trackIds = form.trackIds.includes(trackId)
      ? form.trackIds.filter((id) => id !== trackId)
      : [...form.trackIds, trackId];
    onChange({ ...form, trackIds });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="שם"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          required
        />
        <Input
          label="אימייל"
          dir="ltr"
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          required
        />
        <Select
          label="כיתה"
          value={form.class.id}
          onChange={(e) => {
            const classId = e.target.value;
            onChange({
              ...form,
              class: {
                id: classId,
                name: classes.find((c) => c.id === classId)?.name ?? "",
              },
              mandatorySubjectIds: null,
            });
            onClassChange?.(classId, null);
          }}
          required
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="מתמטיקה"
          value={form.mathUnits}
          onChange={(e) => onChange({ ...form, mathUnits: parseInt(e.target.value) })}
        >
          {[3, 4, 5].map((u) => (
            <option key={u} value={u}>
              {u} יח&quot;ל
            </option>
          ))}
        </Select>
        <Select
          label="אנגלית"
          value={form.englishUnits}
          onChange={(e) => onChange({ ...form, englishUnits: parseInt(e.target.value) })}
        >
          {[3, 4, 5].map((u) => (
            <option key={u} value={u}>
              {u} יח&quot;ל
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="label">מגמות</label>
        <div className="flex flex-wrap gap-2">
          {tracks.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={form.trackIds.includes(t.id)}
                onChange={() => toggleTrack(t.id)}
                className="rounded"
              />
              {t.name}
            </label>
          ))}
        </div>
      </div>

      {(pathMandatory.length > 0 || otherMandatory.length > 0) && (
        <div className="space-y-4">
          <div>
            <label className="label">מקצועות חובה</label>
            <p className="mb-2 text-xs text-slate-500">
              ניתן להסיר מקצועות ממסלול הכיתה, או להוסיף מקצועות חובה ממסלולים אחרים
            </p>
          </div>
          {pathMandatory.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">מסלול הכיתה</p>
              <div className="flex flex-wrap gap-2">
                {pathMandatory.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={isMandatorySelected(s.id)}
                      onChange={() => toggleMandatorySubject(s.id)}
                      className="rounded"
                    />
                    {formatSubjectWithPathLinks(s.name, s.pathLinks, {
                      units: s.units,
                      category: s.category,
                    })}
                  </label>
                ))}
              </div>
            </div>
          )}
          {otherMandatory.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">ממסלולים אחרים</p>
              <div className="flex flex-wrap gap-2">
                {otherMandatory.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={isMandatorySelected(s.id)}
                      onChange={() => toggleMandatorySubject(s.id)}
                      className="rounded"
                    />
                    <span>
                      {formatSubjectWithPathLinks(s.name, s.pathLinks, {
                        units: s.units,
                        category: s.category,
                      })}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button onClick={onSubmit} size="sm" disabled={submitting}>
          <Save className="h-4 w-4" />
          {submitting ? "שומר..." : submitLabel}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="sm">
          <X className="h-4 w-4" />
          ביטול
        </Button>
      </div>
    </div>
  );
}
