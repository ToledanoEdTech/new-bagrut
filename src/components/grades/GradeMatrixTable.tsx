"use client";

import { useRef, useCallback, useSyncExternalStore } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { STATUS_LABELS, SUBMISSION_STATUSES, hasClearableGradeEntry } from "@/lib/grade-status";
import {
  applyWeightOverrides,
  calcPartialWeightedItemScore,
  calcWeightedComponentScore,
  hasSeparateComponentGrades,
  isWeightedScoreComplete,
} from "@/lib/grade-components";
import {
  SOCIAL_INVOLVEMENT_LABELS,
  SOCIAL_INVOLVEMENT_LEVELS,
} from "@/lib/social-involvement";
import type { QualitativeLevel, SubmissionStatus } from "@/lib/types";

const DESKTOP_MQ = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_MQ);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MQ).matches;
}

/** SSR / hydration: מעדיפים פריסת מובייל כדי למנוע גלילה אופקית */
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false);
}

export type MatrixComponent = {
  name: string;
  weightPercent: number;
  sortOrder: number;
};

/** עריכת אחוז השקלול של המשבצת הנבחרת, לכל תלמיד בנפרד */
export type MatrixWeightColumn = {
  defaultWeightPercent: number;
  /** שאר הרכיבים במטלה — היתרה עד 100% מתחלקת ביניהם */
  otherPartNames: string[];
};

export type MatrixRow = {
  studentId: string;
  studentName: string;
  className?: string | null;
  score: number | null;
  /** ציון משוקלל כמו בכרטיס התלמיד (כשמוצגים רכיבים מרובים) */
  resolvedScore?: number | null;
  qualitativeLevel?: QualitativeLevel | null;
  componentScores?: Record<number, number | null> | null;
  componentWeightOverrides?: Record<number, number> | null;
  /** האחוז שחל על המשבצת הנבחרת אצל תלמיד זה */
  weightPercent?: number | null;
  status: SubmissionStatus;
};

export type MatrixField =
  | "score"
  | "status"
  | "qualitativeLevel"
  | "weightPercent"
  | `componentScore:${number}`;

type Props = {
  rows: MatrixRow[];
  components?: MatrixComponent[];
  /** מעורבות חברתית — בחירת הערכה איכותית במקום ציון מספרי */
  qualitative?: boolean;
  /** הצגת עמודת כיתה (הזנה לפי שכבה) */
  showClass?: boolean;
  weightColumn?: MatrixWeightColumn | null;
  onChange: (
    studentId: string,
    field: MatrixField,
    value: number | null | SubmissionStatus | QualitativeLevel | ""
  ) => void;
  onClear?: (studentId: string) => void;
};

function StatusSelect({
  value,
  onChange,
  className = "input w-full py-2 text-sm",
}: {
  value: SubmissionStatus;
  onChange: (status: SubmissionStatus) => void;
  className?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as SubmissionStatus)}
    >
      {SUBMISSION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s].label}
        </option>
      ))}
    </select>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:px-2 sm:py-1.5"
      title="מחיקת הציון והחזרה למצב שלא הוזן"
      onClick={onClick}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      נקה
    </button>
  );
}

function WeightInput({
  value,
  defaultWeightPercent,
  className,
  onChange,
}: {
  value: number | null | undefined;
  defaultWeightPercent: number;
  className: string;
  onChange: (value: number | null) => void;
}) {
  const isCustom = value != null && Math.abs(value - defaultWeightPercent) > 0.01;
  return (
    <input
      type="number"
      min={0}
      max={100}
      step="any"
      inputMode="decimal"
      className={clsx(
        className,
        isCustom && "border-amber-400 bg-amber-50 font-semibold text-amber-900"
      )}
      placeholder={String(defaultWeightPercent)}
      title={
        isCustom
          ? `אחוז מותאם לתלמיד זה (ברירת המחדל: ${defaultWeightPercent}%)`
          : `ברירת המחדל של המטלה: ${defaultWeightPercent}%`
      }
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : parseFloat(raw));
      }}
    />
  );
}

/** אותו כלל כמו resolveObligationGradeScore לציון משוקלל מרכיבים */
function resolveMatrixWeightedScore(
  components: MatrixComponent[],
  row: MatrixRow
): number | null {
  const effective = applyWeightOverrides(components, row.componentWeightOverrides);
  if (isWeightedScoreComplete(effective, row.componentScores)) {
    return calcWeightedComponentScore(effective, row.componentScores);
  }
  return calcPartialWeightedItemScore(effective, row.componentScores);
}

export function GradeMatrixTable({
  rows,
  components = [],
  qualitative = false,
  showClass = false,
  weightColumn = null,
  onChange,
  onClear,
}: Props) {
  const isDesktop = useIsDesktop();
  const multiComponent = !qualitative && hasSeparateComponentGrades(components);
  const showWeight = !qualitative && !multiComponent && weightColumn != null;
  const scoreRefs = useRef<(HTMLInputElement | null)[]>([]);
  const levelRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const scoreHeader = components[0]?.name ?? "ציון";

  const handleScoreKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = scoreRefs.current[index + 1];
        if (next) {
          next.focus();
          next.select();
        }
      }
    },
    []
  );

  const handleLevelKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLSelectElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const next = levelRefs.current[index + 1];
        if (next) next.focus();
      }
    },
    []
  );

  if (!isDesktop) {
    return (
      <div className="space-y-3">
        {rows.map((row, index) => {
          const weightedScore = multiComponent
            ? resolveMatrixWeightedScore(components, row)
            : row.score;
          const canClear = hasClearableGradeEntry(row);

          return (
            <div
              key={row.studentId}
              className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-slate-900">
                    <span className="me-1.5 text-sm font-medium text-slate-400">
                      {index + 1}.
                    </span>
                    {row.studentName}
                  </p>
                  {showClass && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      {row.className ?? "—"}
                    </p>
                  )}
                </div>
                {onClear && canClear && <ClearButton onClick={() => onClear(row.studentId)} />}
              </div>

              {qualitative ? (
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">סטטוס</span>
                    <StatusSelect
                      value={row.status}
                      onChange={(status) => onChange(row.studentId, "status", status)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">הערכה</span>
                    <select
                      ref={(el) => {
                        levelRefs.current[index] = el;
                      }}
                      className="input w-full py-2 text-sm"
                      value={row.qualitativeLevel ?? ""}
                      onChange={(e) =>
                        onChange(
                          row.studentId,
                          "qualitativeLevel",
                          (e.target.value || "") as QualitativeLevel | ""
                        )
                      }
                      onKeyDown={(e) => handleLevelKeyDown(index, e)}
                    >
                      <option value="">בחר הערכה</option>
                      {SOCIAL_INVOLVEMENT_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {SOCIAL_INVOLVEMENT_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : multiComponent ? (
                <div className="space-y-2.5">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">סטטוס</span>
                    <StatusSelect
                      value={row.status}
                      onChange={(status) => onChange(row.studentId, "status", status)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {components.map((c) => (
                      <label key={c.sortOrder} className="block min-w-0">
                        <span className="mb-1 block truncate text-xs font-medium text-slate-500">
                          {c.name} ({c.weightPercent}%)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="decimal"
                          className="input w-full py-2 text-sm"
                          placeholder="—"
                          value={row.componentScores?.[c.sortOrder] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const score = raw ? parseFloat(raw) : null;
                            onChange(row.studentId, `componentScore:${c.sortOrder}`, score);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-600">ציון משוקלל</span>
                    <span className="text-base font-bold text-primary-600">
                      {weightedScore ?? "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={clsx(
                    "grid gap-2.5",
                    showWeight
                      ? "grid-cols-[minmax(0,1fr)_5rem_5rem]"
                      : "grid-cols-[minmax(0,1fr)_5.5rem]"
                  )}
                >
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-slate-500">סטטוס</span>
                    <StatusSelect
                      value={row.status}
                      onChange={(status) => onChange(row.studentId, "status", status)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">
                      {scoreHeader}
                    </span>
                    <input
                      ref={(el) => {
                        scoreRefs.current[index] = el;
                      }}
                      type="number"
                      min={0}
                      max={100}
                      inputMode="decimal"
                      className="input w-full py-2 text-center text-base font-semibold"
                      placeholder="—"
                      value={row.score ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const score = raw ? parseFloat(raw) : null;
                        onChange(row.studentId, "score", score);
                      }}
                      onKeyDown={(e) => handleScoreKeyDown(index, e)}
                    />
                  </label>
                  {showWeight && weightColumn && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        אחוז
                      </span>
                      <WeightInput
                        value={row.weightPercent}
                        defaultWeightPercent={weightColumn.defaultWeightPercent}
                        className="input w-full py-2 text-center text-base"
                        onChange={(value) =>
                          onChange(row.studentId, "weightPercent", value)
                        }
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-base">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-slate-200 bg-slate-50 text-right">
            <th className="px-4 py-3 text-sm font-semibold text-slate-600">#</th>
            <th className="px-4 py-3 text-sm font-semibold text-slate-600">שם תלמיד</th>
            {showClass && (
              <th className="px-4 py-3 text-sm font-semibold text-slate-600">כיתה</th>
            )}
            <th className="px-4 py-3 text-sm font-semibold text-slate-600">סטטוס</th>
            {qualitative ? (
              <th className="px-4 py-3 text-sm font-semibold text-slate-600">הערכה</th>
            ) : multiComponent ? (
              <>
                {components.map((c) => (
                  <th
                    key={c.sortOrder}
                    className="px-4 py-3 text-sm font-semibold text-slate-600"
                  >
                    {c.name}
                    <span className="block text-xs font-normal normal-case text-slate-400">
                      ({c.weightPercent}%)
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                  ציון משוקלל
                </th>
              </>
            ) : (
              <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                {scoreHeader}
              </th>
            )}
            {showWeight && weightColumn && (
              <th className="px-4 py-3 text-sm font-semibold text-slate-600">
                אחוז שקלול
                <span className="block text-xs font-normal normal-case text-slate-400">
                  ברירת מחדל: {weightColumn.defaultWeightPercent}%
                </span>
              </th>
            )}
            {onClear && (
              <th className="px-4 py-3 text-sm font-semibold text-slate-600">פעולות</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const weightedScore = multiComponent
              ? resolveMatrixWeightedScore(components, row)
              : row.score;
            const canClear = hasClearableGradeEntry(row);

            return (
              <tr
                key={row.studentId}
                className="border-b border-slate-100 transition hover:bg-primary-50/30"
              >
                <td className="px-4 py-2.5 text-slate-400">{index + 1}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{row.studentName}</td>
                {showClass && (
                  <td className="px-4 py-2.5 text-slate-600">{row.className ?? "—"}</td>
                )}
                <td className="px-4 py-2.5">
                  <StatusSelect
                    value={row.status}
                    onChange={(status) => onChange(row.studentId, "status", status)}
                    className="input w-36 py-1.5 text-sm"
                  />
                </td>
                {qualitative ? (
                  <td className="px-4 py-2.5">
                    <select
                      ref={(el) => {
                        levelRefs.current[index] = el;
                      }}
                      className="input w-44 py-1.5 text-sm"
                      value={row.qualitativeLevel ?? ""}
                      onChange={(e) =>
                        onChange(
                          row.studentId,
                          "qualitativeLevel",
                          (e.target.value || "") as QualitativeLevel | ""
                        )
                      }
                      onKeyDown={(e) => handleLevelKeyDown(index, e)}
                    >
                      <option value="">בחר הערכה</option>
                      {SOCIAL_INVOLVEMENT_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {SOCIAL_INVOLVEMENT_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : multiComponent ? (
                  <>
                    {components.map((c) => (
                      <td key={c.sortOrder} className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="input w-24 py-1.5 text-sm"
                          placeholder="—"
                          value={row.componentScores?.[c.sortOrder] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const score = raw ? parseFloat(raw) : null;
                            onChange(row.studentId, `componentScore:${c.sortOrder}`, score);
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center font-semibold text-primary-600">
                      {weightedScore ?? "—"}
                    </td>
                  </>
                ) : (
                  <td className="px-4 py-2.5">
                    <input
                      ref={(el) => {
                        scoreRefs.current[index] = el;
                      }}
                      type="number"
                      min={0}
                      max={100}
                      className="input w-24 py-1.5 text-sm"
                      placeholder="—"
                      value={row.score ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const score = raw ? parseFloat(raw) : null;
                        onChange(row.studentId, "score", score);
                      }}
                      onKeyDown={(e) => handleScoreKeyDown(index, e)}
                    />
                  </td>
                )}
                {showWeight && weightColumn && (
                  <td className="px-4 py-2.5">
                    <WeightInput
                      value={row.weightPercent}
                      defaultWeightPercent={weightColumn.defaultWeightPercent}
                      className="input w-24 py-1.5 text-sm"
                      onChange={(value) =>
                        onChange(row.studentId, "weightPercent", value)
                      }
                    />
                  </td>
                )}
                {onClear && (
                  <td className="px-4 py-2.5">
                    {canClear ? (
                      <ClearButton onClick={() => onClear(row.studentId)} />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
