import ExcelJS from "exceljs";
import { exportTimestamp } from "@/lib/excel-export";
import type { ShortageYearEntry, ShortageYearReport } from "@/lib/shortage-year-report";

const COLOR = {
  primary: "FF0D9488",
  primaryDark: "FF115E59",
  primaryLight: "FFF0FDFA",
  slate900: "FF0F172A",
  slate700: "FF334155",
  slate500: "FF64748B",
  slate200: "FFE2E8F0",
  slate100: "FFF1F5F9",
  slate50: "FFF8FAFC",
  white: "FFFFFFFF",
  successBg: "FFD1FAE5",
  successText: "FF065F46",
  dangerBg: "FFFEE2E2",
  dangerText: "FF991B1B",
  warningBg: "FFFEF3C7",
  warningText: "FF92400E",
  infoBg: "FFDBEAFE",
  infoText: "FF1E40AF",
};

const fillOf = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR.slate200 } },
  left: { style: "thin", color: { argb: COLOR.slate200 } },
  bottom: { style: "thin", color: { argb: COLOR.slate200 } },
  right: { style: "thin", color: { argb: COLOR.slate200 } },
};

function applyCell(
  cell: ExcelJS.Cell,
  value: string | number,
  opts?: {
    bold?: boolean;
    size?: number;
    color?: string;
    bg?: string;
    align?: ExcelJS.Alignment["horizontal"];
    wrap?: boolean;
  }
) {
  cell.value = value;
  cell.font = {
    bold: opts?.bold,
    size: opts?.size ?? 11,
    color: { argb: opts?.color ?? COLOR.slate900 },
    name: "Calibri",
  };
  cell.alignment = {
    horizontal: opts?.align ?? "right",
    vertical: "middle",
    wrapText: opts?.wrap ?? true,
  };
  cell.border = thinBorder;
  if (opts?.bg) cell.fill = fillOf(opts.bg);
}

function drawBanner(ws: ExcelJS.Worksheet, title: string, subtitle: string, colCount: number) {
  ws.mergeCells(1, 1, 1, colCount);
  ws.mergeCells(2, 1, 2, colCount);
  ws.mergeCells(3, 1, 3, colCount);

  applyCell(ws.getCell(1, 1), "ישיבה תיכונית צביה אלישיב · מערכת מעקב בגרות", {
    bold: true,
    size: 10,
    color: "FFCCFBF1",
    bg: COLOR.primary,
  });
  ws.getRow(1).height = 20;

  applyCell(ws.getCell(2, 1), title, {
    bold: true,
    size: 18,
    color: COLOR.white,
    bg: COLOR.primary,
  });
  ws.getRow(2).height = 30;

  applyCell(ws.getCell(3, 1), subtitle, {
    size: 10.5,
    color: "FFE6FFFA",
    bg: COLOR.primaryDark,
  });
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 8;
}

function drawKpis(
  ws: ExcelJS.Worksheet,
  startRow: number,
  kpis: Array<{ label: string; value: string | number; bg: string; fg: string }>,
  colCount: number
) {
  const cardWidth = Math.max(1, Math.floor(colCount / kpis.length));
  kpis.forEach((kpi, index) => {
    const startCol = index * cardWidth + 1;
    const endCol = index === kpis.length - 1 ? colCount : startCol + cardWidth - 1;
    ws.mergeCells(startRow, startCol, startRow, endCol);
    ws.mergeCells(startRow + 1, startCol, startRow + 1, endCol);
    applyCell(ws.getCell(startRow, startCol), kpi.label, {
      size: 9,
      color: COLOR.slate700,
      bg: kpi.bg,
      bold: true,
    });
    applyCell(ws.getCell(startRow + 1, startCol), kpi.value, {
      size: 18,
      color: kpi.fg,
      bg: kpi.bg,
      bold: true,
    });
  });
  ws.getRow(startRow).height = 18;
  ws.getRow(startRow + 1).height = 26;
}

function writeTable(
  ws: ExcelJS.Worksheet,
  startRow: number,
  headers: string[],
  rows: Array<Array<string | number>>,
  rowFill?: (row: Array<string | number>, index: number) => string | undefined
) {
  headers.forEach((header, i) => {
    applyCell(ws.getCell(startRow, i + 1), header, {
      bold: true,
      size: 11,
      color: COLOR.white,
      bg: COLOR.primaryDark,
    });
  });
  ws.getRow(startRow).height = 22;

  rows.forEach((row, idx) => {
    const bg = rowFill?.(row, idx) ?? (idx % 2 === 1 ? COLOR.slate50 : COLOR.white);
    row.forEach((value, i) => {
      applyCell(ws.getCell(startRow + 1 + idx, i + 1), value, { bg, size: 10 });
    });
    ws.getRow(startRow + 1 + idx).height = 18;
  });
}

function entryRows(entries: ShortageYearEntry[], hideStudent: boolean): Array<Array<string | number>> {
  return entries.map((e) => {
    const cols: Array<string | number> = [];
    if (!hideStudent) cols.push(e.studentName);
    cols.push(
      e.className,
      e.obligationGradeYear ?? "—",
      e.subjectLabel,
      e.taskLabel,
      e.dueDate || "—",
      e.statusLabel,
      e.isComplete ? "הושלם" : e.isOverdue ? "נותר · באיחור" : "נותר",
      e.resultLabel
    );
    return cols;
  });
}

function entryHeaders(hideStudent: boolean): string[] {
  return [
    ...(hideStudent ? [] : ["תלמיד"]),
    "כיתה",
    "שכבת מטלה",
    "מקצוע",
    "מטלה",
    "תאריך יעד",
    "סטטוס",
    "מצב",
    "תוצאה / ציון",
  ];
}

export async function buildShortageYearExcelBuffer(report: ShortageYearReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "מערכת מעקב בגרות";
  workbook.created = new Date();

  const hideStudent = report.filter.groupBy === "student";
  const title = `דוח חוסרים — ${report.filterLabel}`;
  const subtitle = `${report.groupByLabel} · ${report.yearScopeLabel} · הופק ב־${report.generatedAt}`;
  const { totals } = report;

  const summary = workbook.addWorksheet("סיכום", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 8 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });

  const summaryCols = 8;
  drawBanner(summary, title, subtitle, summaryCols);
  drawKpis(
    summary,
    5,
    [
      { label: "סה״כ מטלות", value: totals.total, bg: COLOR.primaryLight, fg: COLOR.primaryDark },
      { label: "הושלמו", value: totals.done, bg: COLOR.successBg, fg: COLOR.successText },
      { label: "נותרו", value: totals.remaining, bg: COLOR.dangerBg, fg: COLOR.dangerText },
      { label: "באיחור", value: totals.overdue, bg: COLOR.warningBg, fg: COLOR.warningText },
      { label: "אחוז השלמה", value: `${totals.donePercent}%`, bg: COLOR.infoBg, fg: COLOR.infoText },
    ],
    5
  );
  summary.mergeCells(5, 6, 6, 8);
  applyCell(
    summary.getCell(5, 6),
    `${totals.studentCount} תלמידים · ${totals.classCount} כיתות`,
    { bg: COLOR.slate100, color: COLOR.slate700, size: 11, bold: true }
  );

  const groupHeaders =
    report.filter.groupBy === "gradeYear"
      ? ["כיתה", "שכבה", "תלמידים", "סה״כ", "הושלם", "נותר", "באיחור", "השלמה"]
      : report.filter.groupBy === "class"
        ? ["תלמיד", "כיתה", "תלמידים", "סה״כ", "הושלם", "נותר", "באיחור", "השלמה"]
        : ["מקצוע", "שכבת מטלה", "תלמידים", "סה״כ", "הושלם", "נותר", "באיחור", "השלמה"];

  writeTable(
    summary,
    8,
    groupHeaders,
    report.groups.map((g) => [
      g.label,
      g.subtitle ?? "—",
      g.studentCount,
      g.total,
      g.done,
      g.remaining,
      g.overdue,
      `${g.donePercent}%`,
    ]),
    (row) => (Number(row[5]) > 0 ? "FFFFF1F2" : "FFF0FDF4")
  );

  [22, 16, 12, 10, 10, 10, 10, 10].forEach((w, i) => {
    summary.getColumn(i + 1).width = w;
  });

  const remaining = report.entries.filter((e) => !e.isComplete);
  const done = report.entries.filter((e) => e.isComplete);

  function addDetailSheet(name: string, rows: ShortageYearEntry[], emptyNote: string) {
    const ws = workbook.addWorksheet(name, {
      views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });
    const headers = entryHeaders(hideStudent);
    drawBanner(ws, `${name} — ${report.filterLabel}`, subtitle, headers.length);
    if (rows.length === 0) {
      ws.mergeCells(5, 1, 5, headers.length);
      applyCell(ws.getCell(5, 1), emptyNote, { bg: COLOR.slate50, color: COLOR.slate500 });
    } else {
      writeTable(ws, 5, headers, entryRows(rows, hideStudent), (row) => {
        const state = String(row[row.length - 2]);
        if (state.includes("באיחור")) return COLOR.dangerBg;
        if (state === "הושלם") return COLOR.successBg;
        return undefined;
      });
    }
    const widths = hideStudent ? [12, 14, 22, 34, 14, 14, 16, 14] : [20, 12, 14, 22, 32, 14, 14, 16, 14];
    widths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }

  addDetailSheet("נותר לעשות", remaining, "אין מטלות שנותרו בטווח שנבחר.");
  addDetailSheet("מה הושלם", done, "אין מטלות שהושלמו בטווח שנבחר.");

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function shortageYearExcelFilename(report: ShortageYearReport): string {
  const safe = (report.filterLabel || "דוח").replace(/[^\w\u0590-\u05FF]+/g, "_").slice(0, 40);
  return `דוח_חוסרים_${report.yearScopeLabel}_${safe}_${exportTimestamp()}.xlsx`;
}
