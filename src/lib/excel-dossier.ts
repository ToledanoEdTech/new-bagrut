import ExcelJS from "exceljs";
import { exportTimestamp } from "@/lib/excel-export";
import type { StudentDossier } from "@/lib/student-dossier";

// ── Palette ──────────────────────────────────────────────────────────────
const COLOR = {
  primary: "FF4338CA",
  primaryDark: "FF312E81",
  primaryLight: "FFEEF2FF",
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
  mutedBg: "FFF1F5F9",
  mutedText: "FF334155",
};

const fillOf = (argb: string): ExcelJS.Fill => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

const borderThin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR.slate200 } },
  left: { style: "thin", color: { argb: COLOR.slate200 } },
  bottom: { style: "thin", color: { argb: COLOR.slate200 } },
  right: { style: "thin", color: { argb: COLOR.slate200 } },
};

function statusFill(statusLabel: string): { bg: string; fg: string } | null {
  if (statusLabel === "נבדק") return { bg: COLOR.successBg, fg: COLOR.successText };
  if (statusLabel === "חסר ציון" || statusLabel === "לא עבר")
    return { bg: COLOR.dangerBg, fg: COLOR.dangerText };
  if (statusLabel === "בתהליך" || statusLabel === "הוגש")
    return { bg: COLOR.warningBg, fg: COLOR.warningText };
  if (statusLabel === "פטור") return { bg: COLOR.mutedBg, fg: COLOR.mutedText };
  return { bg: COLOR.infoBg, fg: COLOR.infoText };
}

function baseWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "מערכת מעקב בגרות";
  workbook.company = "ישיבה תיכונית";
  workbook.created = new Date();
  return workbook;
}

function safeSheetName(name: string, used: Set<string>) {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, " ").trim() || "תלמיד";
  const base = cleaned.slice(0, 31);
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
}

// ── Banner ───────────────────────────────────────────────────────────────
function drawBanner(
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  metaLine: string,
  colCount: number
) {
  ws.mergeCells(1, 1, 1, colCount);
  ws.mergeCells(2, 1, 2, colCount);
  ws.mergeCells(3, 1, 3, colCount);

  const brand = ws.getCell(1, 1);
  brand.value = "מערכת מעקב בגרות · ישיבה תיכונית";
  brand.font = { size: 10, color: { argb: "FFC7D2FE" }, bold: true };
  brand.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  brand.fill = fillOf(COLOR.primary);
  ws.getRow(1).height = 20;

  const titleCell = ws.getCell(2, 1);
  titleCell.value = title;
  titleCell.font = { size: 18, color: { argb: COLOR.white }, bold: true };
  titleCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  titleCell.fill = fillOf(COLOR.primary);
  ws.getRow(2).height = 30;

  const subCell = ws.getCell(3, 1);
  subCell.value = `${subtitle}   ·   ${metaLine}`;
  subCell.font = { size: 10.5, color: { argb: "FFE0E7FF" } };
  subCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  subCell.fill = fillOf(COLOR.primary);
  ws.getRow(3).height = 20;

  // spacing row
  ws.getRow(4).height = 6;
}

// ── KPI strip ────────────────────────────────────────────────────────────
type Kpi = {
  label: string;
  value: string | number;
  tone: "primary" | "success" | "info" | "warning" | "danger";
  subtitle?: string;
};

function drawKpis(ws: ExcelJS.Worksheet, startRow: number, kpis: Kpi[], colCount: number) {
  const cardsPerRow = 4;
  const cardWidth = Math.floor(colCount / cardsPerRow);
  const labelRow = startRow;
  const valueRow = startRow + 1;
  const subRow = startRow + 2;

  ws.getRow(labelRow).height = 18;
  ws.getRow(valueRow).height = 26;
  ws.getRow(subRow).height = 16;

  kpis.forEach((kpi, index) => {
    const startCol = index * cardWidth + 1;
    const endCol = startCol + cardWidth - 2; // leave a gap column between cards
    ws.mergeCells(labelRow, startCol, labelRow, endCol);
    ws.mergeCells(valueRow, startCol, valueRow, endCol);
    ws.mergeCells(subRow, startCol, subRow, endCol);

    const toneColor =
      kpi.tone === "success"
        ? COLOR.successText
        : kpi.tone === "danger"
          ? COLOR.dangerText
          : kpi.tone === "warning"
            ? COLOR.warningText
            : kpi.tone === "info"
              ? COLOR.infoText
              : COLOR.primary;
    const toneBg =
      kpi.tone === "success"
        ? COLOR.successBg
        : kpi.tone === "danger"
          ? COLOR.dangerBg
          : kpi.tone === "warning"
            ? COLOR.warningBg
            : kpi.tone === "info"
              ? COLOR.infoBg
              : COLOR.primaryLight;

    const labelCell = ws.getCell(labelRow, startCol);
    labelCell.value = kpi.label;
    labelCell.font = { size: 10, color: { argb: COLOR.slate700 }, bold: true };
    labelCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    labelCell.fill = fillOf(toneBg);
    labelCell.border = {
      top: { style: "medium", color: { argb: toneColor } },
      left: { style: "thin", color: { argb: COLOR.slate200 } },
      right: { style: "thin", color: { argb: COLOR.slate200 } },
    };

    const valueCell = ws.getCell(valueRow, startCol);
    valueCell.value = kpi.value;
    valueCell.font = { size: 20, color: { argb: toneColor }, bold: true };
    valueCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    valueCell.fill = fillOf(toneBg);
    valueCell.border = {
      left: { style: "thin", color: { argb: COLOR.slate200 } },
      right: { style: "thin", color: { argb: COLOR.slate200 } },
    };

    const subCell = ws.getCell(subRow, startCol);
    subCell.value = kpi.subtitle ?? "";
    subCell.font = { size: 9, color: { argb: COLOR.slate500 } };
    subCell.alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    subCell.fill = fillOf(toneBg);
    subCell.border = {
      bottom: { style: "thin", color: { argb: COLOR.slate200 } },
      left: { style: "thin", color: { argb: COLOR.slate200 } },
      right: { style: "thin", color: { argb: COLOR.slate200 } },
    };
  });
}

// ── Section header ───────────────────────────────────────────────────────
function drawSectionTitle(
  ws: ExcelJS.Worksheet,
  row: number,
  title: string,
  colCount: number,
  tone: "primary" | "danger" | "warning" | "info" = "primary"
) {
  ws.mergeCells(row, 1, row, colCount);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = {
    size: 12,
    bold: true,
    color: { argb: COLOR.white },
  };
  cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  cell.fill = fillOf(
    tone === "danger"
      ? COLOR.dangerText
      : tone === "warning"
        ? COLOR.warningText
        : tone === "info"
          ? COLOR.infoText
          : COLOR.primaryDark
  );
  ws.getRow(row).height = 22;
}

// ── Identity mini-table ──────────────────────────────────────────────────
function drawIdentity(
  ws: ExcelJS.Worksheet,
  startRow: number,
  entries: Array<[string, string | number | null]>,
  colCount: number
) {
  const cols = 3; // 3 label-value pairs per row
  const pairWidth = Math.floor(colCount / cols);
  let row = startRow;
  let col = 1;
  entries.forEach((entry, index) => {
    if (entry[1] == null || entry[1] === "") return;
    const labelStart = col;
    const labelEnd = col + 1;
    const valueStart = col + 2;
    const valueEnd = col + pairWidth - 1;
    ws.mergeCells(row, labelStart, row, labelEnd);
    ws.mergeCells(row, valueStart, row, valueEnd);

    const labelCell = ws.getCell(row, labelStart);
    labelCell.value = entry[0];
    labelCell.font = { size: 9.5, color: { argb: COLOR.slate500 }, bold: true };
    labelCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    labelCell.fill = fillOf(COLOR.slate50);
    labelCell.border = borderThin;

    const valueCell = ws.getCell(row, valueStart);
    valueCell.value = entry[1];
    valueCell.font = { size: 10.5, color: { argb: COLOR.slate900 }, bold: true };
    valueCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    valueCell.fill = fillOf(COLOR.white);
    valueCell.border = borderThin;

    ws.getRow(row).height = 22;

    col += pairWidth;
    if ((index + 1) % cols === 0) {
      row += 1;
      col = 1;
    }
  });
}

// ── List alert block ─────────────────────────────────────────────────────
function drawAlertList(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  items: string[],
  colCount: number,
  tone: "danger" | "warning" | "info"
): number {
  drawSectionTitle(ws, startRow, title, colCount, tone);
  const bg =
    tone === "danger"
      ? COLOR.dangerBg
      : tone === "warning"
        ? COLOR.warningBg
        : COLOR.infoBg;
  const fg =
    tone === "danger"
      ? COLOR.dangerText
      : tone === "warning"
        ? COLOR.warningText
        : COLOR.infoText;
  if (items.length === 0) {
    ws.mergeCells(startRow + 1, 1, startRow + 1, colCount);
    const cell = ws.getCell(startRow + 1, 1);
    cell.value = "אין רשומות";
    cell.font = { color: { argb: COLOR.slate500 }, italic: true };
    cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    cell.fill = fillOf(COLOR.slate50);
    ws.getRow(startRow + 1).height = 20;
    return startRow + 2;
  }
  items.forEach((item, index) => {
    const row = startRow + 1 + index;
    ws.mergeCells(row, 1, row, colCount);
    const cell = ws.getCell(row, 1);
    cell.value = `•   ${item}`;
    cell.font = { size: 10, color: { argb: fg } };
    cell.alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    cell.fill = fillOf(bg);
    ws.getRow(row).height = 20;
  });
  return startRow + 1 + items.length;
}

// ── Summary sheet ────────────────────────────────────────────────────────
function addSummarySheet(
  workbook: ExcelJS.Workbook,
  dossier: StudentDossier,
  sheetNames: Set<string>
) {
  const COL_COUNT = 12;
  const ws = workbook.addWorksheet(
    safeSheetName(`${dossier.studentName} - סיכום`, sheetNames),
    {
      views: [{ rightToLeft: true, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    }
  );
  setColumnWidths(ws, Array.from({ length: COL_COUNT }, () => 10));

  drawBanner(
    ws,
    `תיק תלמיד — ${dossier.identity.name}`,
    `כיתה ${dossier.identity.className}${dossier.identity.gradeYear ? ` · ${dossier.identity.gradeYear}` : ""}`,
    `הופק בתאריך ${dossier.exportedAt}`,
    COL_COUNT
  );

  // KPIs
  drawKpis(ws, 5, [
    {
      label: "התקדמות כללית",
      value: `${dossier.summary.overallProgress.toFixed(0)}%`,
      tone: "primary",
    },
    {
      label: "ממוצע בגרות משוקלל",
      value: dossier.summary.weightedAverage ?? "—",
      subtitle: `${dossier.summary.gradedSubjectsCount} מקצועות · ${dossier.summary.weightedUnits} יח"ל`,
      tone: "info",
    },
    {
      label: "חובות שהושלמו",
      value: `${dossier.summary.completedObligations}/${dossier.summary.totalObligations}`,
      tone: "success",
    },
    {
      label: "זכאות לבגרות",
      value: dossier.summary.bagrutEligibilityLabel,
      subtitle: dossier.summary.bagrutEligibilityMessage ?? undefined,
      tone:
        dossier.summary.bagrutEligibilityLabel === "זכאי"
          ? "success"
          : dossier.summary.bagrutEligibilityLabel === "לא זכאי"
            ? "danger"
            : "warning",
    },
  ], COL_COUNT);

  // Identity
  ws.getRow(8).height = 8;
  drawSectionTitle(ws, 9, "פרטי תלמיד", COL_COUNT);
  drawIdentity(
    ws,
    10,
    [
      ["שם", dossier.identity.name],
      ["אימייל", dossier.identity.email],
      ["כיתה", dossier.identity.className],
      ["שכבה", dossier.identity.gradeYear],
      ["מסלול בגרות", dossier.identity.examPathLabel],
      ["מגמות", dossier.identity.trackLabel],
      ['מתמטיקה (יח"ל)', dossier.identity.mathUnits],
      ['אנגלית (יח"ל)', dossier.identity.englishUnits],
      ["הרחבות", dossier.identity.extensions],
    ],
    COL_COUNT
  );

  // Candidacy
  let row = 14;
  drawSectionTitle(ws, row, "מעמד וזכאות", COL_COUNT);
  row += 1;
  const candidacyEntries: Array<[string, string | number | null]> = [
    [
      "בגרות מצטיינת",
      dossier.summary.outstandingTierLabel
        ? `${dossier.summary.outstandingLabel} — ${dossier.summary.outstandingTierLabel}`
        : dossier.summary.outstandingLabel,
    ],
    [
      "חוסרי מצטיינת",
      dossier.summary.outstandingMissingReasons.join(" | ") || "—",
    ],
    ["בגרות הייטק", dossier.summary.hightechLabel],
    [
      "חוסרי הייטק",
      dossier.summary.hightechMissingReasons.join(" | ") || "—",
    ],
    ["סיבות אי-זכאות", dossier.summary.bagrutEligibilityDetails.join(" | ") || "—"],
  ];
  drawIdentity(ws, row, candidacyEntries, COL_COUNT);
  row += Math.ceil(candidacyEntries.length / 3);

  // Alerts
  row += 1;
  row = drawAlertList(
    ws,
    row,
    `ציונים חסרים (${dossier.alerts.missingGrades.length})`,
    dossier.alerts.missingGrades.map(
      (entry) => `${entry.subjectLabel} — ${entry.obligationLabel}`
    ),
    COL_COUNT,
    "danger"
  );
  row += 1;
  row = drawAlertList(
    ws,
    row,
    `ציונים שליליים (${dossier.alerts.negativeGrades.length})`,
    dossier.alerts.negativeGrades.map(
      (entry) => `${entry.subjectLabel} — ${entry.obligationLabel} — ציון ${entry.score}`
    ),
    COL_COUNT,
    "warning"
  );
  row += 1;
  drawAlertList(
    ws,
    row,
    `מטלות פתוחות להגשה (${dossier.alerts.pendingTasks.length})`,
    dossier.alerts.pendingTasks.map(
      (task) =>
        `${task.subjectLabel} — ${task.taskLabel} — עד ${task.dueDate}${task.isOverdue ? " (באיחור)" : ""}`
    ),
    COL_COUNT,
    "info"
  );
}

// ── Subjects sheet ───────────────────────────────────────────────────────
function addSubjectsSheet(
  workbook: ExcelJS.Workbook,
  dossier: StudentDossier,
  sheetNames: Set<string>
) {
  const ws = workbook.addWorksheet(
    safeSheetName(`${dossier.studentName} - מקצועות`, sheetNames),
    {
      views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 4 }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    }
  );

  const COL_COUNT = 8;
  setColumnWidths(ws, [34, 10, 16, 14, 12, 12, 14, 46]);

  drawBanner(
    ws,
    `מקצועות וציונים — ${dossier.identity.name}`,
    `כיתה ${dossier.identity.className}`,
    `הופק בתאריך ${dossier.exportedAt}`,
    COL_COUNT
  );

  // Table header (row 5)
  const headers = [
    "מקצוע / מטלה",
    "משקל",
    "סוג היבחנות",
    "סטטוס",
    "ציון",
    "שכבה",
    "תאריך יעד",
    "רכיבים / תתי-מטלות / הערות",
  ];
  const headerRow = ws.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: COLOR.white }, size: 10.5 };
    cell.fill = fillOf(COLOR.primaryDark);
    cell.alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  let currentRow = 6;
  dossier.subjects.forEach((subject) => {
    // Subject header row
    ws.mergeCells(currentRow, 1, currentRow, COL_COUNT);
    const subjectCell = ws.getCell(currentRow, 1);
    const subjectMeta = subject.qualitativeLevelLabel
      ? subject.qualitativeLevelLabel
      : subject.estimatedGrade != null
        ? `ציון ${subject.estimatedGrade}`
        : "טרם דורג";
    subjectCell.value = `${subject.label}   ·   ${subject.progressPercent.toFixed(0)}% · ${subjectMeta} · ${subject.isFinal ? "סופי" : "ביניים"}`;
    subjectCell.font = { size: 11.5, bold: true, color: { argb: COLOR.primaryDark } };
    subjectCell.fill = fillOf(COLOR.primaryLight);
    subjectCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    subjectCell.border = {
      top: { style: "medium", color: { argb: COLOR.primary } },
      bottom: { style: "thin", color: { argb: COLOR.slate200 } },
    };
    ws.getRow(currentRow).height = 22;
    currentRow += 1;

    if (subject.obligations.length === 0) {
      ws.mergeCells(currentRow, 1, currentRow, COL_COUNT);
      const emptyCell = ws.getCell(currentRow, 1);
      emptyCell.value = "אין מטלות רלוונטיות לשכבה זו";
      emptyCell.font = { color: { argb: COLOR.slate500 }, italic: true };
      emptyCell.alignment = { horizontal: "right", vertical: "middle", indent: 2 };
      emptyCell.fill = fillOf(COLOR.slate50);
      ws.getRow(currentRow).height = 18;
      currentRow += 1;
      return;
    }

    subject.obligations.forEach((obligation, index) => {
      const row = ws.getRow(currentRow);
      const rowFill = index % 2 === 1 ? fillOf(COLOR.slate50) : fillOf(COLOR.white);
      const values: Array<string | number> = [
        obligation.label,
        `${obligation.weightPercent}%`,
        obligation.examType,
        obligation.statusLabel,
        obligation.score ?? "—",
        obligation.gradeYear ?? "—",
        obligation.dueDate ?? "—",
        "", // details filled below
      ];
      const details: string[] = [];
      if (obligation.components.length > 0) {
        details.push(
          `רכיבים: ${obligation.components
            .map((c) => `${c.name} ${c.score ?? "—"} (${c.weightPercent}%)`)
            .join(" · ")}`
        );
      }
      if (obligation.subItems.length > 0) {
        details.push(
          `תתי-מטלות: ${obligation.subItems
            .map((s) => `${s.name} ${s.score ?? "—"} (${s.weightPercent}%)`)
            .join(" · ")}`
        );
      }
      if (obligation.notes) details.push(`הערות: ${obligation.notes}`);
      values[7] = details.join("\n") || "—";

      values.forEach((value, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = value;
        cell.fill = rowFill;
        cell.border = borderThin;
        cell.font = { size: 10, color: { argb: COLOR.slate900 } };
        cell.alignment = {
          horizontal: "right",
          vertical: "middle",
          indent: 1,
          wrapText: true,
        };
      });

      // Status pill
      const statusPill = statusFill(obligation.statusLabel);
      if (statusPill) {
        const statusCell = row.getCell(4);
        statusCell.fill = fillOf(statusPill.bg);
        statusCell.font = { bold: true, color: { argb: statusPill.fg }, size: 10 };
        statusCell.alignment = { horizontal: "center", vertical: "middle" };
      }

      // Score highlighted
      const scoreCell = row.getCell(5);
      scoreCell.font = { bold: true, color: { argb: COLOR.slate900 }, size: 11 };
      scoreCell.alignment = { horizontal: "center", vertical: "middle" };

      row.height = Math.max(20, 14 * Math.max(1, details.length));
      currentRow += 1;
    });
  });

  // Footer note
  currentRow += 1;
  ws.mergeCells(currentRow, 1, currentRow, COL_COUNT);
  const footer = ws.getCell(currentRow, 1);
  footer.value = `סה"כ ${dossier.subjects.length} מקצועות · הופק ${dossier.exportedAt}`;
  footer.font = { italic: true, color: { argb: COLOR.slate500 }, size: 9.5 };
  footer.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
}

// ── Pending sheet ────────────────────────────────────────────────────────
function addPendingSheet(
  workbook: ExcelJS.Workbook,
  dossier: StudentDossier,
  sheetNames: Set<string>
) {
  const ws = workbook.addWorksheet(
    safeSheetName(`${dossier.studentName} - מטלות`, sheetNames),
    { views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 4 }] }
  );
  const COL_COUNT = 5;
  setColumnWidths(ws, [30, 42, 16, 16, 12]);

  drawBanner(
    ws,
    `מטלות פתוחות — ${dossier.identity.name}`,
    `${dossier.alerts.pendingTasks.length} מטלות פתוחות`,
    dossier.exportedAt,
    COL_COUNT
  );

  const headers = ["מקצוע", "מטלה", "תאריך יעד", "סטטוס", "באיחור"];
  const headerRow = ws.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: COLOR.white }, size: 10.5 };
    cell.fill = fillOf(COLOR.primaryDark);
    cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  if (dossier.alerts.pendingTasks.length === 0) {
    ws.mergeCells(6, 1, 6, COL_COUNT);
    const empty = ws.getCell(6, 1);
    empty.value = "אין מטלות פתוחות כרגע";
    empty.font = { color: { argb: COLOR.slate500 }, italic: true };
    empty.alignment = { horizontal: "right", vertical: "middle", indent: 2 };
    empty.fill = fillOf(COLOR.slate50);
    ws.getRow(6).height = 22;
    return;
  }

  dossier.alerts.pendingTasks.forEach((task, index) => {
    const row = ws.getRow(6 + index);
    const rowFill = index % 2 === 1 ? fillOf(COLOR.slate50) : fillOf(COLOR.white);
    const values = [
      task.subjectLabel,
      task.taskLabel,
      task.dueDate,
      task.statusLabel,
      task.isOverdue ? "כן" : "—",
    ];
    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.fill = rowFill;
      cell.border = borderThin;
      cell.font = { size: 10, color: { argb: COLOR.slate900 } };
      cell.alignment = { horizontal: "right", vertical: "middle", indent: 1, wrapText: true };
    });
    const statusPill = statusFill(task.statusLabel);
    if (statusPill) {
      const statusCell = row.getCell(4);
      statusCell.fill = fillOf(statusPill.bg);
      statusCell.font = { bold: true, color: { argb: statusPill.fg }, size: 10 };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };
    }
    if (task.isOverdue) {
      const overdueCell = row.getCell(5);
      overdueCell.fill = fillOf(COLOR.dangerBg);
      overdueCell.font = { bold: true, color: { argb: COLOR.dangerText }, size: 10 };
      overdueCell.alignment = { horizontal: "center", vertical: "middle" };
    }
    row.height = 22;
  });
}

// ── Class summary sheet ──────────────────────────────────────────────────
function addClassSummarySheet(
  workbook: ExcelJS.Workbook,
  className: string,
  dossiers: StudentDossier[],
  sheetNames: Set<string>
) {
  const ws = workbook.addWorksheet(
    safeSheetName(`סיכום כיתה ${className}`, sheetNames),
    { views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 5 }] }
  );
  const COL_COUNT = 6;
  setColumnWidths(ws, [26, 14, 16, 18, 18, 18]);
  drawBanner(
    ws,
    `תיקי תלמידים — ${className}`,
    `${dossiers.length} תלמידים`,
    `הופק בתאריך ${new Date().toLocaleDateString("he-IL")}`,
    COL_COUNT
  );

  const headers = [
    "שם תלמיד",
    "התקדמות",
    "ממוצע בגרות",
    "חובות שהושלמו",
    "זכאות",
    "בגרות מצטיינת",
  ];
  const headerRow = ws.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: COLOR.white }, size: 10.5 };
    cell.fill = fillOf(COLOR.primaryDark);
    cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    cell.border = borderThin;
  });
  headerRow.height = 24;

  dossiers.forEach((dossier, index) => {
    const row = ws.getRow(6 + index);
    const rowFill = index % 2 === 1 ? fillOf(COLOR.slate50) : fillOf(COLOR.white);
    const values: Array<string | number> = [
      dossier.identity.name,
      `${dossier.summary.overallProgress.toFixed(0)}%`,
      dossier.summary.weightedAverage ?? "—",
      `${dossier.summary.completedObligations}/${dossier.summary.totalObligations}`,
      dossier.summary.bagrutEligibilityLabel,
      dossier.summary.outstandingTierLabel
        ? `${dossier.summary.outstandingLabel} — ${dossier.summary.outstandingTierLabel}`
        : dossier.summary.outstandingLabel,
    ];
    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.fill = rowFill;
      cell.border = borderThin;
      cell.font = { size: 10, color: { argb: COLOR.slate900 } };
      cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    });
    const eligibilityPill =
      dossier.summary.bagrutEligibilityLabel === "זכאי"
        ? { bg: COLOR.successBg, fg: COLOR.successText }
        : dossier.summary.bagrutEligibilityLabel === "לא זכאי"
          ? { bg: COLOR.dangerBg, fg: COLOR.dangerText }
          : { bg: COLOR.warningBg, fg: COLOR.warningText };
    const eligibilityCell = row.getCell(5);
    eligibilityCell.fill = fillOf(eligibilityPill.bg);
    eligibilityCell.font = { bold: true, color: { argb: eligibilityPill.fg }, size: 10 };
    eligibilityCell.alignment = { horizontal: "center", vertical: "middle" };
    row.height = 22;
  });
}

// ── Public API ───────────────────────────────────────────────────────────
function addAllStudentSheets(
  workbook: ExcelJS.Workbook,
  dossier: StudentDossier,
  sheetNames: Set<string>
) {
  addSummarySheet(workbook, dossier, sheetNames);
  addSubjectsSheet(workbook, dossier, sheetNames);
  addPendingSheet(workbook, dossier, sheetNames);
}

export async function buildStudentDossierExcelBuffer(dossier: StudentDossier) {
  const workbook = baseWorkbook();
  addAllStudentSheets(workbook, dossier, new Set());
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildClassDossiersExcelBuffer(
  className: string,
  dossiers: StudentDossier[]
) {
  const workbook = baseWorkbook();
  const usedSheetNames = new Set<string>();
  addClassSummarySheet(workbook, className, dossiers, usedSheetNames);
  dossiers.forEach((dossier) => addAllStudentSheets(workbook, dossier, usedSheetNames));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function studentDossierExcelFilename(dossier: StudentDossier) {
  return `${dossier.filenameBase}_${exportTimestamp()}.xlsx`;
}

export function classDossiersExcelFilename(className: string) {
  return `תיקי_תלמידים_${className}_${exportTimestamp()}.xlsx`;
}
