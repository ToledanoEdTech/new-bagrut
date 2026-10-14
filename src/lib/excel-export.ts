import ExcelJS from "exceljs";
import { obligationDisplayLabel } from "@/lib/grade-components";
import { STATUS_LABELS, SUBMISSION_STATUSES } from "@/lib/grade-status";
import { calcSubjectProgressForObligations } from "@/lib/progress";
import { formatQualitativeLevel } from "@/lib/social-involvement";
import {
  formatSubjectDisplayName,
  formatSubjectWithPathLinks,
} from "@/lib/subject-display";
import type { QualitativeLevel, SubmissionStatus } from "@/lib/types";

type DataValidationRule = {
  type: string;
  operator?: string;
  allowBlank?: boolean;
  formulae: Array<string | number>;
  showErrorMessage?: boolean;
  errorStyle?: string;
  errorTitle?: string;
  error?: string;
};

type WorksheetWithValidations = ExcelJS.Worksheet & {
  dataValidations: { add: (sqref: string, rule: DataValidationRule) => void };
};

export type ExportColumn = {
  header: string;
  key: string;
  width?: number;
};

export type ExportSheet = {
  name: string;
  title?: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | null | undefined>[];
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF4F46E5" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const ALT_ROW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF8FAFC" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

function statusLabel(status: string): string {
  if (status in STATUS_LABELS) {
    return STATUS_LABELS[status as SubmissionStatus].label;
  }
  return status;
}

function autoColumnWidth(header: string, values: (string | number | null | undefined)[]): number {
  const maxLen = Math.max(
    header.length,
    ...values.map((v) => String(v ?? "").length)
  );
  return Math.min(Math.max(maxLen + 4, 10), 50);
}

export async function downloadExcel(filename: string, sheets: ExportSheet[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bagrut Manager";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const headerRowNum = sheet.title ? 2 : 1;
    const freezeRow = headerRowNum;

    const ws = workbook.addWorksheet(sheet.name, {
      views: [{ rightToLeft: true, state: "frozen", ySplit: freezeRow }],
    });

    if (sheet.title) {
      ws.mergeCells(1, 1, 1, sheet.columns.length);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = sheet.title;
      titleCell.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
      titleCell.alignment = { horizontal: "right", vertical: "middle" };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEEF2FF" },
      };
      ws.getRow(1).height = 30;
    }

    const headerRow = ws.getRow(headerRowNum);
    sheet.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.border = THIN_BORDER;
    });
    headerRow.height = 24;

    const dataStartRow = headerRowNum + 1;
    sheet.rows.forEach((row, idx) => {
      const excelRow = ws.getRow(dataStartRow + idx);
      sheet.columns.forEach((col, i) => {
        const cell = excelRow.getCell(i + 1);
        const val = row[col.key];
        cell.value = val === null || val === undefined ? "" : val;
        cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
        cell.border = THIN_BORDER;
        if (idx % 2 === 1) {
          cell.fill = ALT_ROW_FILL;
        }
      });
      excelRow.height = 20;
    });

    sheet.columns.forEach((col, i) => {
      const values = sheet.rows.map((r) => r[col.key]);
      ws.getColumn(i + 1).width =
        col.width ?? autoColumnWidth(col.header, values);
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

type StudentExportRow = {
  user: { name: string; email?: string };
  class: {
    name: string;
    gradeYear?: string | null;
    examPath?: { label: string } | null;
  } | null;
  tracks?: { name: string }[];
  track?: { name: string } | null;
  mathUnits: number;
  englishUnits: number;
};

export function buildStudentsSheet(students: StudentExportRow[]): ExportSheet {
  const sorted = [...students].sort((a, b) =>
    a.user.name.localeCompare(b.user.name, "he")
  );

  return {
    name: "תלמידים",
    title: `רשימת תלמידים (${sorted.length})`,
    columns: [
      { header: "שם", key: "name" },
      { header: "אימייל", key: "email" },
      { header: "שכבה", key: "gradeYear" },
      { header: "כיתה", key: "className" },
      { header: "מגמות", key: "tracks" },
      { header: 'מתמטיקה (יח"ל)', key: "math" },
      { header: 'אנגלית (יח"ל)', key: "english" },
      { header: "מסלול בגרות", key: "path" },
    ],
    rows: sorted.map((s) => ({
      name: s.user.name,
      email: s.user.email ?? "—",
      gradeYear: s.class?.gradeYear ?? "—",
      className: s.class?.name ?? "—",
      tracks:
        s.tracks?.length
          ? s.tracks.map((t) => t.name).join(", ")
          : s.track?.name ?? "—",
      math: s.mathUnits,
      english: s.englishUnits,
      path: s.class?.examPath?.label ?? "—",
    })),
  };
}

const SUBJECT_CATEGORIES: Record<string, string> = {
  MANDATORY: "חובה",
  MATH: "מתמטיקה",
  ENGLISH: "אנגלית",
  TRACK: "מגמה",
  EXTENSION: "הרחבה",
};

type SubjectExportRow = {
  id: string;
  name: string;
  units: number | null;
  category: string;
  obligations: Array<{
    name: string | null;
    questionnaireNumber: string | null;
    weightPercent: number;
    examType: string;
    studyMaterial: string | null;
    examEvent: string | null;
    gradeYear: string | null;
    components: Array<{ name: string; weightPercent: number }>;
    subItems: Array<{ name: string; weightPercent: number }>;
  }>;
  pathLinks?: Array<{ path: { label: string } }>;
};

export function buildSubjectsSheets(subjects: SubjectExportRow[]): ExportSheet[] {
  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name, "he"));

  const summary: ExportSheet = {
    name: "מקצועות",
    title: `רשימת מקצועות (${sorted.length})`,
    columns: [
      { header: "שם מקצוע", key: "name" },
      { header: "קטגוריה", key: "category" },
      { header: 'יח"ל', key: "units" },
      { header: "מספר מטלות", key: "obligationCount" },
      { header: "סה״כ משקל", key: "totalWeight" },
      { header: "מסלולים", key: "paths" },
    ],
    rows: sorted.map((s) => ({
      name: formatSubjectWithPathLinks(s.name, s.pathLinks, {
        units: s.units,
        category: s.category,
      }),
      category: SUBJECT_CATEGORIES[s.category] ?? s.category,
      units: s.units ?? "—",
      obligationCount: s.obligations.length,
      totalWeight: `${s.obligations.reduce((sum, o) => sum + o.weightPercent, 0)}%`,
      paths: s.pathLinks?.map((p) => p.path.label).join(", ") ?? "—",
    })),
  };

  const obligations: ExportSheet = {
    name: "מטלות",
    title: "פירוט מטלות לפי מקצוע",
    columns: [
      { header: "מקצוע", key: "subject" },
      { header: "שם מטלה", key: "taskName" },
      { header: "מספר שאלון", key: "questionnaire" },
      { header: "משקל", key: "weight" },
      { header: "סוג היבחנות", key: "examType" },
      { header: "חומר לימוד", key: "material" },
      { header: "אירוע", key: "event" },
      { header: "שכבה", key: "gradeYear" },
      { header: "שקלול פנימי", key: "components" },
      { header: "עבודות", key: "subItems" },
    ],
    rows: sorted.flatMap((s) =>
      s.obligations.map((o) => ({
        subject: formatSubjectWithPathLinks(s.name, s.pathLinks, {
          units: s.units,
          category: s.category,
        }),
        taskName: o.name ?? o.examEvent ?? "—",
        questionnaire: o.questionnaireNumber ?? "—",
        weight: `${o.weightPercent}%`,
        examType: o.examType,
        material: o.studyMaterial ?? "—",
        event: o.examEvent ?? "—",
        gradeYear: o.gradeYear ?? "—",
        components:
          o.components.length > 0
            ? o.components.map((c) => `${c.name}: ${c.weightPercent}%`).join(" · ")
            : "—",
        subItems:
          o.subItems.length > 0
            ? o.subItems.map((si) => `${si.name}: ${si.weightPercent}%`).join(" · ")
            : "—",
      }))
    ),
  };

  return [summary, obligations];
}

type ClassExportRow = {
  name: string;
  gradeYear: string | null;
  examPath: { label: string } | null;
  homeroomTeacher?: { name: string; email: string } | null;
  _count: { students: number };
};

export function buildClassesSheet(classes: ClassExportRow[]): ExportSheet {
  const sorted = [...classes].sort((a, b) => a.name.localeCompare(b.name, "he"));

  return {
    name: "כיתות",
    title: `רשימת כיתות (${sorted.length})`,
    columns: [
      { header: "שם כיתה", key: "name" },
      { header: "שכבה", key: "gradeYear" },
      { header: "מחנך", key: "homeroom" },
      { header: "תוכנית חובה", key: "path" },
      { header: "מספר תלמידים", key: "students" },
    ],
    rows: sorted.map((c) => ({
      name: c.name,
      gradeYear: c.gradeYear ?? "—",
      homeroom: c.homeroomTeacher
        ? c.homeroomTeacher.name || c.homeroomTeacher.email
        : "לא הוגדר מחנך",
      path: c.examPath?.label ?? "ללא תוכנית",
      students: c._count.students,
    })),
  };
}

type StaffExportRow = { name: string; email: string; role: string };

export function buildStaffSheet(staff: StaffExportRow[]): ExportSheet {
  const sorted = [...staff].sort((a, b) => a.name.localeCompare(b.name, "he"));

  return {
    name: "צוות",
    title: `רשימת צוות (${sorted.length})`,
    columns: [
      { header: "שם", key: "name" },
      { header: "אימייל", key: "email" },
      { header: "תפקיד", key: "role" },
    ],
    rows: sorted.map((s) => ({
      name: s.name,
      email: s.email,
      role: s.role === "ADMIN" ? "מנהל" : "מורה",
    })),
  };
}

type GradeSubjectExport = {
  name: string;
  displayName?: string;
  pathLabels?: string[];
  category?: string | null;
  units: number | null;
  obligations: Array<{
    id: string;
    name: string | null;
    questionnaireNumber: string | null;
    examType: string;
    weightPercent: number;
    components?: Array<{ weightPercent: number; sortOrder?: number; name?: string }>;
    subItems?: Array<{
      weightPercent: number;
      sortOrder?: number;
      name?: string;
      gradeYear?: string | null;
    }>;
  }>;
};

type GradeExportRow = {
  obligationId: string;
  score: number | null;
  status: string;
  qualitativeLevel?: QualitativeLevel | null;
  componentScores?: Record<number, number | null> | null;
  subItemScores?: Record<number, number | null> | null;
  componentWeightOverrides?: Record<number, number> | null;
  subItemWeightOverrides?: Record<number, number> | null;
};

function subjectFinalGradeLabel(
  subject: GradeSubjectExport,
  grades: GradeExportRow[]
): string {
  const progress = calcSubjectProgressForObligations(
    subject.obligations.map((o) => ({
      id: o.id,
      weightPercent: o.weightPercent,
      components: o.components ?? [],
      subItems: o.subItems ?? [],
    })),
    grades,
    undefined,
    { name: subject.name, category: subject.category }
  );
  if (!progress.isFinal) return "—";
  if (progress.estimatedGrade != null) return String(progress.estimatedGrade);
  return formatQualitativeLevel(progress.qualitativeLevel) ?? "—";
}

export function buildStudentGradesSheet(
  studentName: string,
  className: string,
  subjects: GradeSubjectExport[],
  grades: GradeExportRow[]
): ExportSheet {
  const gradeMap = new Map(grades.map((g) => [g.obligationId, g]));

  const rows = subjects.flatMap((subject) => {
    const finalGrade = subjectFinalGradeLabel(subject, grades);
    return subject.obligations.map((o) => {
      const grade = gradeMap.get(o.id);
      return {
        subject:
          subject.displayName ??
          formatSubjectDisplayName(subject.name, {
            pathLabels: subject.pathLabels,
            units: subject.units,
            category: subject.category,
          }),
        units: subject.units ?? "—",
        task: o.name ?? "—",
        questionnaire: o.questionnaireNumber ?? "—",
        examType: o.examType,
        weight: `${o.weightPercent}%`,
        score: grade?.score ?? "—",
        status: grade ? statusLabel(grade.status) : statusLabel("NOT_STARTED"),
        finalGrade,
      };
    });
  });

  return {
    name: "ציונים",
    title: `ציונים — ${studentName} (${className})`,
    columns: [
      { header: "מקצוע", key: "subject" },
      { header: 'יח"ל', key: "units" },
      { header: "מטלה", key: "task" },
      { header: "שאלון", key: "questionnaire" },
      { header: "סוג", key: "examType" },
      { header: "משקל", key: "weight" },
      { header: "ציון", key: "score" },
      { header: "סטטוס", key: "status" },
      { header: "ציון סופי", key: "finalGrade" },
    ],
    rows,
  };
}

export function buildMatrixSheet(input: {
  className: string;
  subjectName: string;
  taskLabel: string;
  scoreHeader?: string;
  showClass?: boolean;
  rows: Array<{
    studentName: string;
    className?: string | null;
    score: number | string | null;
    status: string;
  }>;
}): ExportSheet {
  const scoreHeader = input.scoreHeader ?? "ציון";
  const showClass = input.showClass ?? false;
  return {
    name: "ציונים",
    title: `${input.className} — ${input.subjectName} — ${input.taskLabel}`,
    columns: [
      { header: "שם תלמיד", key: "studentName" },
      ...(showClass ? [{ header: "כיתה", key: "className" }] : []),
      { header: scoreHeader, key: "score" },
      { header: "סטטוס", key: "status" },
    ],
    rows: input.rows.map((r) => ({
      studentName: r.studentName,
      ...(showClass ? { className: r.className ?? "—" } : {}),
      score: r.score ?? "—",
      status: statusLabel(r.status),
    })),
  };
}

/** Overview grades matrix (students × selected subject/obligation columns). */
export function buildOverviewGridSheet(input: {
  title: string;
  showClass?: boolean;
  columns: Array<{ key: string; header: string }>;
  rows: Array<{
    studentName: string;
    className?: string | null;
    trackNames?: string[];
    cells: Record<string, string | number | null | undefined>;
  }>;
}): ExportSheet {
  const showClass = input.showClass ?? false;
  return {
    name: "מטריצת ציונים",
    title: input.title,
    columns: [
      { header: "שם תלמיד", key: "studentName", width: 22 },
      ...(showClass ? [{ header: "כיתה", key: "className", width: 12 }] : []),
      { header: "מגמות", key: "tracks", width: 18 },
      ...input.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width:
          c.header === "ציון סופי"
            ? 14
            : Math.min(Math.max(c.header.length + 2, 10), 18),
      })),
    ],
    rows: input.rows.map((r) => {
      const row: Record<string, string | number | null | undefined> = {
        studentName: r.studentName,
        ...(showClass ? { className: r.className ?? "—" } : {}),
        tracks: r.trackNames?.length ? r.trackNames.join(", ") : "—",
      };
      for (const col of input.columns) {
        const value = r.cells[col.key];
        row[col.key] = value == null || value === "" ? "—" : value;
      }
      return row;
    }),
  };
}

export function buildClassStudentsSheet(
  className: string,
  students: StudentExportRow[]
): ExportSheet {
  const sheet = buildStudentsSheet(students);
  return {
    ...sheet,
    title: `תלמידי כיתה ${className} (${students.length})`,
  };
}

const LISTS_SHEET = "Lists";
const IMPORT_COLUMNS = [
  { header: "כיתה", key: "className", width: 14 },
  { header: "מקצוע", key: "subjectName", width: 18 },
  { header: "מטלה", key: "obligationName", width: 28 },
  { header: "שם תלמיד", key: "studentName", width: 20 },
  { header: "אחוז שקלול (%)", key: "weightPercent", width: 14 },
  { header: "ציון", key: "score", width: 10 },
  { header: "סטטוס", key: "status", width: 14 },
] as const;

export type GradesImportTemplateTask = {
  taskName: string;
  taskKind: "single" | "component" | "subItem";
  weightPercent: number;
};

export type GradesImportTemplateInput = {
  classes: string[];
  subjects: string[];
  obligations: string[];
  statuses: string[];
  students?: string[];
  prefilledClass?: string;
  prefilledSubject?: string;
  prefilledObligation?: string;
  /** תתי-מטלות/רכיבים של המטלה שנבחרה — ליצירת שורה לכל תת-מטלה */
  obligationTasks?: GradesImportTemplateTask[];
};

function writeListColumn(
  ws: ExcelJS.Worksheet,
  col: number,
  values: string[]
): string {
  values.forEach((value, i) => {
    ws.getCell(i + 1, col).value = value;
  });
  const colLetter = ws.getColumn(col).letter;
  return values.length > 0
    ? `${LISTS_SHEET}!$${colLetter}$1:$${colLetter}$${values.length}`
    : "";
}

function applyListValidation(
  ws: ExcelJS.Worksheet,
  columnLetter: string,
  firstDataRow: number,
  lastDataRow: number,
  range: string
) {
  if (!range) return;
  (ws as WorksheetWithValidations).dataValidations.add(
    `${columnLetter}${firstDataRow}:${columnLetter}${lastDataRow}`,
    {
    type: "list",
    allowBlank: true,
    formulae: [range],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "ערך לא תקין",
    error: "יש לבחור ערך מהרשימה",
    }
  );
}

export function buildObligationLabels(
  subjects: Array<{
    name: string;
    obligations: Array<{ name: string | null; questionnaireNumber: string | null }>;
  }>
): string[] {
  const labels = new Set<string>();
  for (const subject of subjects) {
    for (const ob of subject.obligations) {
      labels.add(obligationDisplayLabel(ob));
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b, "he"));
}

export type FullGradesTemplateRow = {
  className: string;
  subjectName: string;
  obligationName: string;
  taskName: string;
  studentName: string;
  weightPercent: number | string;
  score: number | string;
  status: string;
};

const FULL_GRADES_COLUMNS = [
  { header: "כיתה", key: "className", width: 14 },
  { header: "מקצוע", key: "subjectName", width: 20 },
  { header: "מטלה", key: "obligationName", width: 26 },
  { header: "רכיב/תת-מטלה", key: "taskName", width: 20 },
  { header: "שם תלמיד", key: "studentName", width: 20 },
  { header: "אחוז שקלול (%)", key: "weightPercent", width: 14 },
  { header: "ציון", key: "score", width: 10 },
  { header: "סטטוס", key: "status", width: 14 },
] as const;

export async function downloadFullGradesTemplate(
  filename: string,
  input: {
    className: string;
    statuses: string[];
    rows: FullGradesTemplateRow[];
    title?: string;
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bagrut Manager";
  workbook.created = new Date();

  // Data sheet first; Lists is only for dropdown validations.
  const ws = workbook.addWorksheet("ייבוא ציונים", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }],
  });

  const listsWs = workbook.addWorksheet(LISTS_SHEET);
  listsWs.state = "veryHidden";
  const statusRange = writeListColumn(
    listsWs,
    1,
    input.statuses.length > 0
      ? input.statuses
      : SUBMISSION_STATUSES.map((s) => STATUS_LABELS[s].label)
  );

  ws.mergeCells(1, 1, 1, FULL_GRADES_COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value =
    input.title ??
    `קובץ הזנת ציונים מלא — ${input.className} (${input.rows.length} שורות)`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  ws.getRow(1).height = 30;

  const headerRow = ws.getRow(2);
  FULL_GRADES_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 24;

  const dataStartRow = 3;
  input.rows.forEach((row, idx) => {
    const excelRow = ws.getRow(dataStartRow + idx);
    FULL_GRADES_COLUMNS.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const val = row[col.key as keyof FullGradesTemplateRow];
      cell.value = val === null || val === undefined ? "" : val;
      cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ALT_ROW_FILL;
    });
    excelRow.height = 20;
  });

  FULL_GRADES_COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  const lastDataRow = dataStartRow + Math.max(input.rows.length, 1) - 1;
  applyListValidation(ws, "H", dataStartRow, lastDataRow, statusRange);
  (ws as WorksheetWithValidations).dataValidations.add(
    `F${dataStartRow}:F${lastDataRow}`,
    {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [0, 100],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "אחוז לא תקין",
      error: "אחוז השקלול חייב להיות בין 0 ל-100",
    }
  );
  (ws as WorksheetWithValidations).dataValidations.add(
    `G${dataStartRow}:G${lastDataRow}`,
    {
      type: "decimal",
      operator: "between",
      allowBlank: true,
      formulae: [0, 100],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "ציון לא תקין",
      error: "הציון חייב להיות בין 0 ל-100",
    }
  );

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export type StudentsImportTemplateInput = {
  classes: string[];
  tracks: string[];
  mathUnits: number[];
  englishUnits: number[];
};

const STUDENT_IMPORT_COLUMNS = [
  { header: "שם", key: "name", width: 22 },
  { header: "אימייל", key: "email", width: 26 },
  { header: "כיתה", key: "className", width: 14 },
  { header: "מגמה 1", key: "track1", width: 20 },
  { header: "מגמה 2", key: "track2", width: 20 },
  { header: "מגמה 3", key: "track3", width: 20 },
  { header: "מתמטיקה", key: "math", width: 12 },
  { header: "אנגלית", key: "english", width: 12 },
] as const;

export async function downloadStudentsImportTemplate(
  filename: string,
  input: StudentsImportTemplateInput
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bagrut Manager";
  workbook.created = new Date();

  // Data sheet first so older importers that read sheet 0 still work.
  const ws = workbook.addWorksheet("ייבוא תלמידים", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }],
  });

  const listsWs = workbook.addWorksheet(LISTS_SHEET);
  listsWs.state = "veryHidden";

  const classRange = writeListColumn(listsWs, 1, input.classes);
  const trackRange = writeListColumn(listsWs, 2, input.tracks);
  const mathRange = writeListColumn(listsWs, 3, input.mathUnits.map(String));
  const englishRange = writeListColumn(listsWs, 4, input.englishUnits.map(String));

  ws.mergeCells(1, 1, 1, STUDENT_IMPORT_COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "תבנית ייבוא תלמידים";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2FF" },
  };
  ws.getRow(1).height = 30;

  const headerRow = ws.getRow(2);
  STUDENT_IMPORT_COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 24;

  const rowCount = 100;
  const dataStartRow = 3;

  for (let idx = 0; idx < rowCount; idx++) {
    const excelRow = ws.getRow(dataStartRow + idx);
    STUDENT_IMPORT_COLUMNS.forEach((_, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = "";
      cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ALT_ROW_FILL;
    });
    excelRow.height = 20;
  }

  STUDENT_IMPORT_COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  const lastDataRow = dataStartRow + rowCount - 1;
  applyListValidation(ws, "C", dataStartRow, lastDataRow, classRange);
  applyListValidation(ws, "D", dataStartRow, lastDataRow, trackRange);
  applyListValidation(ws, "E", dataStartRow, lastDataRow, trackRange);
  applyListValidation(ws, "F", dataStartRow, lastDataRow, trackRange);
  applyListValidation(ws, "G", dataStartRow, lastDataRow, mathRange);
  applyListValidation(ws, "H", dataStartRow, lastDataRow, englishRange);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadGradesImportTemplate(
  filename: string,
  input: GradesImportTemplateInput
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bagrut Manager";
  workbook.created = new Date();

  const tasks = input.obligationTasks ?? [];
  // עמודת הרכיב נדרשת כדי לכוון ציון או אחוז שקלול למשבצת מסוימת;
  // אפשר לוותר עליה רק כשידוע שלמטלה יש משבצת אחת בלבד.
  const useTaskColumn = tasks.length !== 1;
  const columns = useTaskColumn ? FULL_GRADES_COLUMNS : IMPORT_COLUMNS;

  // Data sheet first; Lists is only for dropdown validations.
  const ws = workbook.addWorksheet("ייבוא ציונים", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 2 }],
  });

  const listsWs = workbook.addWorksheet(LISTS_SHEET);
  listsWs.state = "veryHidden";

  const classRange = writeListColumn(listsWs, 1, input.classes);
  const subjectRange = writeListColumn(listsWs, 2, input.subjects);
  const obligationRange = writeListColumn(listsWs, 3, input.obligations);
  const statusRange = writeListColumn(
    listsWs,
    4,
    input.statuses.length > 0
      ? input.statuses
      : SUBMISSION_STATUSES.map((s) => STATUS_LABELS[s].label)
  );
  const studentRange = writeListColumn(listsWs, 5, input.students ?? []);
  const taskRange = useTaskColumn
    ? writeListColumn(
        listsWs,
        6,
        tasks.map((t) => t.taskName)
      )
    : "";

  const title = input.students?.length
    ? `תבנית ייבוא ציונים — ${input.prefilledClass ?? "כיתה"} (${input.students.length} תלמידים)`
    : "תבנית ייבוא ציונים";

  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E293B" } };
  titleCell.alignment = { horizontal: "right", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2FF" },
  };
  ws.getRow(1).height = 30;

  const headerRow = ws.getRow(2);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 24;

  type PrefilledRow = {
    className: string;
    subjectName: string;
    obligationName: string;
    studentName: string;
    weightPercent: number | string;
    score: string;
    status: string;
    taskName?: string;
  };

  let prefilledRows: PrefilledRow[] = [];
  if (input.students) {
    if (useTaskColumn) {
      for (const studentName of input.students) {
        for (const task of tasks) {
          prefilledRows.push({
            className: input.prefilledClass ?? "",
            subjectName: input.prefilledSubject ?? "",
            obligationName: input.prefilledObligation ?? "",
            taskName: task.taskName,
            studentName,
            weightPercent: task.weightPercent,
            score: "",
            status: "",
          });
        }
      }
    } else {
      const defaultWeight =
        tasks.length === 1 ? tasks[0]!.weightPercent : "";
      prefilledRows = input.students.map((studentName) => ({
        className: input.prefilledClass ?? "",
        subjectName: input.prefilledSubject ?? "",
        obligationName: input.prefilledObligation ?? "",
        studentName,
        weightPercent: defaultWeight,
        score: "",
        status: "",
      }));
    }
  }

  const rowCount = Math.max(prefilledRows.length, 50);
  const dataStartRow = 3;

  for (let idx = 0; idx < rowCount; idx++) {
    const rowData = prefilledRows[idx];
    const excelRow = ws.getRow(dataStartRow + idx);
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const val = rowData?.[col.key as keyof PrefilledRow];
      cell.value = val === null || val === undefined ? "" : val;
      cell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) {
        cell.fill = ALT_ROW_FILL;
      }
    });
    excelRow.height = 20;
  }

  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  const lastDataRow = dataStartRow + rowCount - 1;
  if (useTaskColumn) {
    applyListValidation(ws, "A", dataStartRow, lastDataRow, classRange);
    applyListValidation(ws, "B", dataStartRow, lastDataRow, subjectRange);
    applyListValidation(ws, "C", dataStartRow, lastDataRow, obligationRange);
    applyListValidation(ws, "D", dataStartRow, lastDataRow, taskRange);
    if (studentRange) {
      applyListValidation(ws, "E", dataStartRow, lastDataRow, studentRange);
    }
    applyListValidation(ws, "H", dataStartRow, lastDataRow, statusRange);
    (ws as WorksheetWithValidations).dataValidations.add(
      `F${dataStartRow}:F${lastDataRow}`,
      {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "אחוז לא תקין",
        error: "אחוז השקלול חייב להיות בין 0 ל-100",
      }
    );
    (ws as WorksheetWithValidations).dataValidations.add(
      `G${dataStartRow}:G${lastDataRow}`,
      {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "ציון לא תקין",
        error: "הציון חייב להיות בין 0 ל-100",
      }
    );
  } else {
    applyListValidation(ws, "A", dataStartRow, lastDataRow, classRange);
    applyListValidation(ws, "B", dataStartRow, lastDataRow, subjectRange);
    applyListValidation(ws, "C", dataStartRow, lastDataRow, obligationRange);
    if (studentRange) {
      applyListValidation(ws, "D", dataStartRow, lastDataRow, studentRange);
    }
    applyListValidation(ws, "G", dataStartRow, lastDataRow, statusRange);
    (ws as WorksheetWithValidations).dataValidations.add(
      `E${dataStartRow}:E${lastDataRow}`,
      {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "אחוז לא תקין",
        error: "אחוז השקלול חייב להיות בין 0 ל-100",
      }
    );
    (ws as WorksheetWithValidations).dataValidations.add(
      `F${dataStartRow}:F${lastDataRow}`,
      {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [0, 100],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "ציון לא תקין",
        error: "הציון חייב להיות בין 0 ל-100",
      }
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export type PendingTaskExportRow = {
  studentName: string;
  className: string;
  gradeYear: string;
  obligationGradeYear: string;
  subjectLabel: string;
  taskLabel: string;
  dueDate: string;
  statusLabel: string;
  overdueLabel: string;
};

export function buildPendingTasksSheet(input: {
  title: string;
  rows: PendingTaskExportRow[];
  hideStudentColumn?: boolean;
}): ExportSheet {
  const columns: ExportColumn[] = [
    ...(input.hideStudentColumn
      ? []
      : [{ header: "שם תלמיד", key: "studentName" as const }]),
    { header: "כיתה", key: "className" },
    { header: "שכבת תלמיד", key: "gradeYear" },
    { header: "שכבת מטלה", key: "obligationGradeYear" },
    { header: "מקצוע", key: "subjectLabel" },
    { header: "מטלה", key: "taskLabel" },
    { header: "תאריך יעד", key: "dueDate" },
    { header: "סטטוס", key: "statusLabel" },
    { header: "באיחור", key: "overdueLabel" },
  ];

  return {
    name: "משימות",
    title: input.title,
    columns,
    rows: input.rows.map((row) => ({
      ...row,
      gradeYear: row.gradeYear || "—",
      obligationGradeYear: row.obligationGradeYear || "—",
    })),
  };
}

export function buildPendingTasksSummarySheet(input: {
  title: string;
  rows: Array<{
    groupLabel: string;
    taskCount: number;
    studentCount: number;
    overdueCount: number;
  }>;
}): ExportSheet {
  return {
    name: "סיכום",
    title: input.title,
    columns: [
      { header: "קבוצה", key: "groupLabel" },
      { header: "מספר משימות", key: "taskCount" },
      { header: "תלמידים", key: "studentCount" },
      { header: "באיחור", key: "overdueCount" },
    ],
    rows: input.rows,
  };
}

export function pendingTaskRowsToExport(
  entries: Array<{
    studentName: string;
    className: string;
    gradeYear: string | null;
    obligationGradeYear?: string | null;
    subjectLabel: string;
    taskLabel: string;
    dueDate: string;
    statusLabel: string;
    isOverdue: boolean;
  }>
): PendingTaskExportRow[] {
  return entries.map((e) => ({
    studentName: e.studentName,
    className: e.className,
    gradeYear: e.gradeYear ?? "—",
    obligationGradeYear: e.obligationGradeYear ?? "—",
    subjectLabel: e.subjectLabel,
    taskLabel: e.taskLabel,
    dueDate: e.dueDate,
    statusLabel: e.statusLabel,
    overdueLabel: e.isOverdue ? "כן" : "—",
  }));
}
