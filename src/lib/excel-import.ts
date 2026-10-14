import * as XLSX from "xlsx";

const LISTS_SHEET_NAMES = new Set(["lists", "list"]);

/**
 * Pick the data sheet from an import workbook.
 * Templates create a hidden "Lists" sheet for dropdowns; we must not read that.
 */
export function pickImportSheet(
  workbook: XLSX.WorkBook,
  preferredNames: string[] = []
): XLSX.WorkSheet {
  const names = workbook.SheetNames;
  if (names.length === 0) {
    throw new Error("הקובץ לא מכיל גיליונות");
  }

  for (const preferred of preferredNames) {
    if (names.includes(preferred)) {
      return workbook.Sheets[preferred];
    }
  }

  const dataSheetName =
    names.find((name) => !LISTS_SHEET_NAMES.has(name.trim().toLowerCase())) ??
    names[0];

  return workbook.Sheets[dataSheetName];
}

/**
 * Detect the header row when templates put a title above the real columns.
 * Returns 0-based row index for sheet_to_json `range`.
 */
export function findHeaderRowIndex(
  sheet: XLSX.WorkSheet,
  headerHints: string[],
  maxScanRows = 15
): number {
  const normalizedHints = headerHints.map((h) => h.trim().toLowerCase());
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    { header: 1, defval: "" }
  );

  const limit = Math.min(rows.length, maxScanRows);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((cell) =>
      String(cell ?? "")
        .trim()
        .toLowerCase()
    );
    const matchCount = normalizedHints.filter((hint) => cells.includes(hint)).length;
    if (matchCount >= 2) return i;
  }

  return 0;
}

export function sheetToImportRows(
  sheet: XLSX.WorkSheet,
  headerHints: string[]
): Record<string, string>[] {
  const headerRow = findHeaderRowIndex(sheet, headerHints);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: headerRow,
    defval: "",
    raw: false,
  });

  return rows
    .map((row) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[String(key).trim()] = String(value ?? "").trim();
      }
      return normalized;
    })
    .filter((row) => Object.values(row).some((value) => value.length > 0));
}

export function parseImportWorkbook(
  buffer: Buffer,
  options: {
    preferredSheetNames?: string[];
    headerHints: string[];
  }
): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = pickImportSheet(workbook, options.preferredSheetNames);
  return sheetToImportRows(sheet, options.headerHints);
}
