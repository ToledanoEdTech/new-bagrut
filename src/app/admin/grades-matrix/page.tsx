"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Grid3X3, ClipboardList } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { PageLoader } from "@/components/ui/PageLoader";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportButton } from "@/components/ui/ExportButton";
import { Sheet } from "@/components/ui/Sheet";
import { GradeOverviewGrid } from "@/components/grades/GradeOverviewGrid";
import { SubjectGroupPicker } from "@/components/grades/SubjectGroupPicker";
import { StudentCardView } from "@/components/students/StudentCardView";
import { CANONICAL_GRADE_YEARS, normalizeGradeYear } from "@/lib/grade-year";
import {
  buildOverviewGridSheet,
  downloadExcel,
  exportTimestamp,
} from "@/lib/excel-export";
import type {
  OverviewColumn,
  OverviewGridResponse,
  OverviewRow,
} from "@/lib/grade-overview-grid";

type ScopeMode = "class" | "gradeYear";
type ClassItem = { id: string; name: string; gradeYear: string | null };

function parseInitialSubjects(searchParams: URLSearchParams): string[] {
  const multi = searchParams.get("subjects");
  if (multi) {
    return multi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single =
    searchParams.get("subjectGroup") ?? searchParams.get("subjectId") ?? "";
  return single ? [single] : [];
}

export default function GradesMatrixReportPage() {
  return (
    <Suspense fallback={<PageLoader variant="table" />}>
      <GradesMatrixReportContent />
    </Suspense>
  );
}

function GradesMatrixReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: classes = [] } = useApi<ClassItem[]>("/api/classes/list");

  const [scopeMode, setScopeMode] = useState<ScopeMode>(
    searchParams.get("classId") ? "class" : "gradeYear"
  );
  const [classId, setClassId] = useState(searchParams.get("classId") ?? "");
  const [gradeYear, setGradeYear] = useState(
    normalizeGradeYear(searchParams.get("gradeYear")) ?? ""
  );
  const [filterClassId, setFilterClassId] = useState("");
  const [trackId, setTrackId] = useState(searchParams.get("trackId") ?? "");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() =>
    parseInitialSubjects(searchParams)
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const availableGradeYears = useMemo(() => {
    const present = new Set(
      classes
        .map((c) => normalizeGradeYear(c.gradeYear))
        .filter((gy): gy is string => !!gy)
    );
    return CANONICAL_GRADE_YEARS.filter((gy) => present.has(gy));
  }, [classes]);

  const classesInLayer = useMemo(() => {
    if (!gradeYear) return classes;
    return classes.filter(
      (c) => normalizeGradeYear(c.gradeYear) === gradeYear
    );
  }, [classes, gradeYear]);

  const effectiveClassId =
    scopeMode === "class" ? classId : filterClassId || null;

  const drillSubjectGroup =
    selectedSubjects.length === 1 ? selectedSubjects[0]! : null;

  // Summary grid for all/multiple subjects; drill into one subject for
  // assignment columns + a dedicated final-grade column.
  const gridQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (scopeMode === "class") {
      if (!classId) return null;
      params.set("classId", classId);
    } else {
      if (!gradeYear) return null;
      params.set("gradeYear", gradeYear);
      if (filterClassId) params.set("classId", filterClassId);
    }
    if (trackId) params.set("trackId", trackId);
    if (drillSubjectGroup) params.set("subjectGroup", drillSubjectGroup);
    return `/api/grades/matrix/grid?${params.toString()}`;
  }, [scopeMode, classId, gradeYear, filterClassId, trackId, drillSubjectGroup]);

  const { data, error } = useApi<OverviewGridResponse>(gridQuery);

  const dataIsCurrent =
    !!data && (data.filters.subjectGroup ?? null) === (drillSubjectGroup ?? null);

  // Drop selections that are no longer in the loaded subject list
  useEffect(() => {
    if (!data?.subjects.length || selectedSubjects.length === 0) return;
    const valid = new Set(data.subjects.map((s) => s.key));
    const next = selectedSubjects.filter((k) => valid.has(k));
    if (next.length !== selectedSubjects.length) setSelectedSubjects(next);
  }, [data?.subjects, selectedSubjects]);

  const visibleColumns = useMemo(() => {
    if (!data || !dataIsCurrent) return [] as OverviewColumn[];
    if (selectedSubjects.length === 0 || drillSubjectGroup) return data.columns;
    const allowed = new Set(selectedSubjects);
    return data.columns.filter((c) => allowed.has(c.subjectGroup));
  }, [data, dataIsCurrent, selectedSubjects, drillSubjectGroup]);

  const showClassColumn =
    scopeMode === "gradeYear" &&
    !filterClassId &&
    (data?.rows.some((r) => !!r.className) ?? false);

  function resetSubjects() {
    setSelectedSubjects([]);
  }

  function entryHrefForCell(row: OverviewRow, col: OverviewColumn): string {
    const cell = row.cells[col.key];
    const params = new URLSearchParams();
    if (effectiveClassId || row.classId) {
      params.set("classId", effectiveClassId || row.classId);
    } else if (gradeYear) {
      params.set("gradeYear", gradeYear);
    }
    params.set("subjectId", cell?.subjectId || col.subjectId);
    if (col.kind === "obligation") {
      params.set("obligationId", cell?.obligationId || col.obligationId);
    }
    return `/admin/grades/matrix?${params.toString()}`;
  }

  function handleCellClick(row: OverviewRow, col: OverviewColumn) {
    router.push(entryHrefForCell(row, col));
  }

  function scopeTitle(): string {
    if (scopeMode === "class") {
      const cls = classes.find((c) => c.id === classId);
      return cls ? `כיתה ${cls.name}` : "כיתה";
    }
    if (filterClassId) {
      const cls = classes.find((c) => c.id === filterClassId);
      return cls ? `כיתה ${cls.name}` : gradeYear;
    }
    return gradeYear || "מטריצת ציונים";
  }

  function columnExportHeader(col: OverviewColumn): string {
    if (col.kind === "final") return "ציון סופי";
    if (col.kind === "obligation") {
      return drillSubjectGroup ? col.label : `${col.subjectName} · ${col.shortLabel}`;
    }
    return col.subjectName;
  }

  async function handleExport() {
    if (!data || !dataIsCurrent || visibleColumns.length === 0) return;

    const subjectLabel =
      selectedSubjects.length === 0
        ? "כל המקצועות"
        : selectedSubjects.length === 1
          ? data.subjects.find((s) => s.key === selectedSubjects[0])?.name ?? "מקצוע"
          : `${selectedSubjects.length} מקצועות`;

    const sheet = buildOverviewGridSheet({
      title: `מטריצת ציונים — ${scopeTitle()} — ${subjectLabel}${
        trackId
          ? ` — מגמה ${data.tracks.find((t) => t.id === trackId)?.name ?? ""}`
          : ""
      }`,
      showClass: showClassColumn,
      columns: visibleColumns.map((c) => ({
        key: c.key,
        header: columnExportHeader(c),
      })),
      rows: data.rows.map((r) => {
        const cells: Record<string, string | number | null> = {};
        for (const col of visibleColumns) {
          const cell = r.cells[col.key];
          if (!cell?.relevant) {
            cells[col.key] = "·";
          } else if (col.kind === "final") {
            cells[col.key] = cell.isFinal ? cell.display ?? "—" : "—";
          } else {
            cells[col.key] = cell.display ?? "—";
          }
        }
        return {
          studentName: r.studentName,
          className: r.className,
          trackNames: r.trackNames,
          cells,
        };
      }),
    });

    const safeScope = scopeTitle().replace(/[/\\?*[\]]/g, "-");
    const safeSubject = subjectLabel.replace(/[/\\?*[\]]/g, "-");
    await downloadExcel(
      `ציונים_${safeSubject}_${safeScope}_${exportTimestamp()}.xlsx`,
      [sheet]
    );
  }

  return (
    <>
      <PageHeader
        title="מטריצת ציונים"
        subtitle="סקירת ציונים לפי שכבה, כיתה, מגמה ומקצוע. מקצוע אחד מציג מטלות וציון סופי."
      >
        <ExportButton
          onExport={handleExport}
          disabled={!dataIsCurrent || visibleColumns.length === 0 || !data?.rows.length}
          label="ייצוא לאקסל"
        />
      </PageHeader>

      <div className="mt-6 space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <p className="text-sm text-slate-500">
              בחרו מקצוע אחד כדי לראות את ציוני המטלות ועמודת ציון סופי
              (מתמלאת רק כשכל המטלות הושלמו). ייצוא האקסל משקף את הסינון
              הנוכחי. לחיצה על תלמיד פותחת כרטיס; לחיצה על תא מובילה להזנה.
            </p>
            <Link
              href="/admin/grades/matrix"
              className="btn-secondary w-full justify-center px-3 py-2 text-sm sm:w-auto sm:shrink-0"
            >
              <ClipboardList className="h-4 w-4" />
              הזנה לפי מטלה
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="w-full sm:w-[9rem]">
              <label className="label">היקף</label>
              <Select
                value={scopeMode}
                onChange={(e) => {
                  setScopeMode(e.target.value as ScopeMode);
                  setClassId("");
                  setGradeYear("");
                  setFilterClassId("");
                  setTrackId("");
                  resetSubjects();
                }}
                aria-label="היקף מטריצה"
              >
                <option value="gradeYear">לפי שכבה</option>
                <option value="class">לפי כיתה</option>
              </Select>
            </div>

            {scopeMode === "gradeYear" ? (
              <>
                <div className="w-full sm:w-[9rem]">
                  <label className="label">שכבה</label>
                  <Select
                    value={gradeYear}
                    onChange={(e) => {
                      setGradeYear(e.target.value);
                      setFilterClassId("");
                      setTrackId("");
                      resetSubjects();
                    }}
                    aria-label="שכבה"
                  >
                    <option value="">בחרו שכבה</option>
                    {availableGradeYears.map((gy) => (
                      <option key={gy} value={gy}>
                        {gy}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-full sm:w-[10rem]">
                  <label className="label">כיתה</label>
                  <Select
                    value={filterClassId}
                    onChange={(e) => {
                      setFilterClassId(e.target.value);
                      setTrackId("");
                      resetSubjects();
                    }}
                    disabled={!gradeYear}
                    aria-label="סינון כיתה"
                  >
                    <option value="">כל הכיתות</option>
                    {classesInLayer.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            ) : (
              <div className="w-full sm:w-[11rem]">
                <label className="label">כיתה</label>
                <Select
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setTrackId("");
                    resetSubjects();
                  }}
                  aria-label="כיתה"
                >
                  <option value="">בחרו כיתה</option>
                  {[...classes]
                    .sort((a, b) => a.name.localeCompare(b.name, "he"))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.gradeYear ? ` (${c.gradeYear})` : ""}
                      </option>
                    ))}
                </Select>
              </div>
            )}

            <div className="w-full sm:w-[11rem]">
              <label className="label">מגמה</label>
              <Select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={!gridQuery}
                aria-label="סינון מגמה"
              >
                <option value="">הכל</option>
                {(data?.tracks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="w-full min-w-0 sm:min-w-[14rem] sm:flex-1">
              <SubjectGroupPicker
                options={data?.subjects ?? []}
                selected={selectedSubjects}
                onChange={setSelectedSubjects}
                disabled={!gridQuery || !data}
              />
            </div>

            {(trackId || selectedSubjects.length > 0 || filterClassId) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  setTrackId("");
                  resetSubjects();
                  setFilterClassId("");
                }}
              >
                נקה סינון
              </Button>
            )}
          </div>
        </Card>

        {!gridQuery && (
          <EmptyState
            icon={Grid3X3}
            title="בחרו שכבה או כיתה"
            description="לאחר הבחירה תוצג מטריצת ציונים. בחרו מקצוע אחד כדי לייצא מטלות וציון סופי."
          />
        )}

        {gridQuery && !dataIsCurrent && <PageLoader variant="table" />}

        {error && <Alert variant="error">{error}</Alert>}

        {data && dataIsCurrent && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
              <p>
                {data.stats.studentCount} תלמידים · {visibleColumns.length} עמודות
                {drillSubjectGroup ? (
                  <span className="text-primary-600">
                    {" "}
                    (מטלות המקצוע + ציון סופי)
                  </span>
                ) : selectedSubjects.length > 0 ? (
                  <span className="text-primary-600">
                    {" "}
                    (מסונן: {selectedSubjects.length} מקצועות)
                  </span>
                ) : null}
              </p>
              <ExportButton
                onExport={handleExport}
                disabled={visibleColumns.length === 0 || data.rows.length === 0}
                label="ייצוא לאקסל"
                size="sm"
              />
            </div>

            {visibleColumns.length === 0 ? (
              <EmptyState
                icon={Grid3X3}
                title="אין עמודות להצגה"
                description="בחרו לפחות מקצוע אחד, או נקו את הסינון כדי להציג את כל המקצועות."
                actionLabel="הצג הכל"
                onAction={resetSubjects}
              />
            ) : (
              <GradeOverviewGrid
                columns={visibleColumns}
                rows={data.rows}
                showClassColumn={showClassColumn}
                onCellClick={handleCellClick}
                onStudentClick={setSelectedStudentId}
              />
            )}
          </>
        )}
      </div>

      <Sheet
        open={selectedStudentId != null}
        onClose={() => setSelectedStudentId(null)}
        title="כרטיס תלמיד"
        className="max-w-3xl"
      >
        {selectedStudentId && <StudentCardView studentId={selectedStudentId} />}
      </Sheet>
    </>
  );
}
