"use client";

import clsx from "clsx";
import type { OverviewCell, OverviewColumn, OverviewRow } from "@/lib/grade-overview-grid";

function cellTone(cell: OverviewCell, kind?: OverviewColumn["kind"]): string {
  if (!cell.relevant) return "bg-slate-50 text-slate-300";
  if (kind === "final" && !cell.filled) return "bg-slate-50 text-slate-400";
  if (!cell.filled) return "bg-amber-50/80 text-amber-800";
  if (cell.status === "EXEMPT") return "bg-slate-100 text-slate-600";
  if (cell.status === "MISSING") return "bg-red-50 text-red-700";
  if (cell.score != null) {
    if (cell.score >= 80) return "bg-emerald-50 text-emerald-800";
    if (cell.score >= 55) return "bg-sky-50 text-sky-800";
    return "bg-red-50 text-red-700";
  }
  return "bg-emerald-50/70 text-emerald-800";
}

function emptyCell(): OverviewCell {
  return {
    display: null,
    score: null,
    status: null,
    relevant: false,
    filled: false,
  };
}

export function GradeOverviewGrid({
  columns,
  rows,
  showClassColumn,
  onCellClick,
  onStudentClick,
}: {
  columns: OverviewColumn[];
  rows: OverviewRow[];
  showClassColumn: boolean;
  onCellClick?: (row: OverviewRow, column: OverviewColumn) => void;
  onStudentClick?: (studentId: string) => void;
}) {
  if (columns.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        אין עמודות להצגה בטווח שנבחר. נסו לבחור מקצוע אחר או להרחיב את הסינון.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        לא נמצאו תלמידים התואמים לסינון.
      </p>
    );
  }

  return (
    <div className="-mx-4 sm:mx-0">
      {/* רמז גלילה אופקית במובייל */}
      <p className="mb-2 px-4 text-center text-xs text-slate-400 sm:hidden">
        החליקו ימינה ושמאלה לצפייה בכל העמודות
      </p>

      <div
        className={clsx(
          "overflow-auto overscroll-x-contain rounded-none border-y border-slate-200/70 bg-white shadow-soft",
          "max-h-[min(75dvh,42rem)] touch-pan-x touch-pan-y",
          "sm:mx-0 sm:rounded-2xl sm:border",
          /* iOS momentum scrolling */
          "[-webkit-overflow-scrolling:touch]"
        )}
      >
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">מטריצת ציונים</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 right-0 z-40 w-8 border-b border-l border-slate-200 bg-slate-50 px-1.5 py-2.5 text-center text-[10px] font-semibold text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] sm:w-10 sm:px-3 sm:py-3 sm:text-xs"
              >
                #
              </th>
              <th
                scope="col"
                className="sticky top-0 right-8 z-40 min-w-[6.5rem] max-w-[7.5rem] border-b border-l border-slate-200 bg-slate-50 px-2 py-2.5 text-right text-[10px] font-semibold text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] sm:right-10 sm:min-w-[9rem] sm:max-w-none sm:px-3 sm:py-3 sm:text-xs"
              >
                תלמיד
              </th>
              {showClassColumn && (
                <th
                  scope="col"
                  className="sticky top-0 z-30 min-w-[3.5rem] border-b border-slate-200 bg-slate-50 px-1.5 py-2.5 text-right text-[10px] font-semibold text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] sm:min-w-[5rem] sm:px-3 sm:py-3 sm:text-xs"
                >
                  כיתה
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={
                    col.kind === "obligation"
                      ? `${col.subjectName} — ${col.label}`
                      : col.kind === "final"
                        ? `${col.subjectName} — ציון סופי`
                        : `${col.subjectName} (וריאנט לפי מסלול/יחידות של כל תלמיד)`
                  }
                  className={clsx(
                    "sticky top-0 z-30 border-b border-slate-200 px-1 py-2.5 text-center text-[10px] font-semibold leading-tight shadow-[0_1px_0_0_rgb(226_232_240)] sm:px-2 sm:py-3 sm:text-xs",
                    col.kind === "final"
                      ? "min-w-[4.5rem] max-w-[6.5rem] bg-primary-50 text-primary-800 sm:min-w-[5.75rem] sm:max-w-[8rem]"
                      : "min-w-[3.25rem] max-w-[5.5rem] bg-slate-50 text-slate-600 sm:min-w-[4.5rem] sm:max-w-[7rem]"
                  )}
                >
                  <span className="line-clamp-2">
                    {col.kind === "obligation"
                      ? col.shortLabel
                      : col.kind === "final"
                        ? "ציון סופי"
                        : col.subjectName}
                  </span>
                  {col.kind === "subject" && (
                    <span className="mt-0.5 hidden text-[10px] font-normal text-slate-400 sm:block">
                      {col.obligationCount} מטלות
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const even = idx % 2 === 1;
              const stickyBg = even ? "bg-slate-50" : "bg-white";
              return (
                <tr key={row.studentId} className={even ? "bg-slate-50/40" : "bg-white"}>
                  <td
                    className={clsx(
                      "sticky right-0 z-10 w-8 border-b border-l border-slate-100 px-1.5 py-1.5 text-center text-[11px] text-slate-400 sm:w-10 sm:px-3 sm:py-2 sm:text-sm",
                      stickyBg
                    )}
                  >
                    {idx + 1}
                  </td>
                  <td
                    className={clsx(
                      "sticky right-8 z-10 max-w-[7.5rem] border-b border-l border-slate-100 px-2 py-1.5 sm:right-10 sm:max-w-none sm:px-3 sm:py-2",
                      stickyBg
                    )}
                  >
                    {onStudentClick ? (
                      <button
                        type="button"
                        onClick={() => onStudentClick(row.studentId)}
                        className="block w-full truncate text-start text-xs font-semibold text-slate-800 hover:text-primary-700 sm:text-sm"
                      >
                        {row.studentName}
                      </button>
                    ) : (
                      <span className="block truncate text-xs font-semibold text-slate-800 sm:text-sm">
                        {row.studentName}
                      </span>
                    )}
                    {row.trackNames.length > 0 && (
                      <p className="hidden truncate text-[11px] text-slate-400 sm:block">
                        {row.trackNames.join(", ")}
                      </p>
                    )}
                  </td>
                  {showClassColumn && (
                    <td className="border-b border-slate-100 px-1.5 py-1.5 text-[11px] text-slate-600 sm:px-3 sm:py-2 sm:text-sm">
                      {row.className}
                    </td>
                  )}
                  {columns.map((col) => {
                    const cell = row.cells[col.key] ?? emptyCell();
                    const clickable =
                      cell.relevant && !!onCellClick && col.kind !== "final";
                    return (
                      <td
                        key={col.key}
                        className="border-b border-slate-100 p-0.5 text-center sm:p-1"
                      >
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => onCellClick(row, col)}
                            className={clsx(
                              "mx-auto flex h-8 min-w-[2.75rem] items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums transition hover:ring-2 hover:ring-primary-300 active:scale-95 sm:h-9 sm:min-w-[3.25rem] sm:rounded-lg sm:px-1.5 sm:text-xs",
                              cellTone(cell, col.kind)
                            )}
                            title={`${row.studentName} — ${col.label}`}
                          >
                            {cell.display ?? "—"}
                          </button>
                        ) : (
                          <span
                            className={clsx(
                              "mx-auto flex h-8 min-w-[2.75rem] items-center justify-center rounded-md px-1 text-[11px] font-semibold tabular-nums sm:h-9 sm:min-w-[3.25rem] sm:rounded-lg sm:px-1.5 sm:text-xs",
                              cellTone(cell, col.kind)
                            )}
                            title={
                              col.kind === "final"
                                ? `${row.studentName} — ציון סופי`
                                : `${row.studentName} — ${col.label}`
                            }
                          >
                            {cell.relevant ? cell.display ?? "—" : "·"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
