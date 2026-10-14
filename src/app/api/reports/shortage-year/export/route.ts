import { NextRequest, NextResponse } from "next/server";
import { checkPermission, requireStaff } from "@/lib/api-auth";
import {
  buildShortageYearExcelBuffer,
  shortageYearExcelFilename,
} from "@/lib/excel-shortage-year";
import {
  buildShortageYearPdfBuffer,
  shortageYearPdfFilename,
} from "@/lib/pdf-shortage-year";
import {
  getShortageYearReportForSession,
  parseShortageYearSearchParams,
} from "@/lib/shortage-year-report";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  if (!checkPermission(session, "grades")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const format = params.get("format");
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "פורמט ייצוא לא נתמך" }, { status: 400 });
  }

  const parsed = parseShortageYearSearchParams(params);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const report = await getShortageYearReportForSession(session, parsed.filter);
    const buffer =
      format === "xlsx"
        ? await buildShortageYearExcelBuffer(report)
        : await buildShortageYearPdfBuffer(report);
    const filename =
      format === "xlsx" ? shortageYearExcelFilename(report) : shortageYearPdfFilename(report);
    const asciiFallback = format === "xlsx" ? "shortage-report.xlsx" : "shortage-report.pdf";
    const contentType =
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("shortage year export failed", err);
    return NextResponse.json({ error: "הייצוא נכשל. נסו שוב." }, { status: 500 });
  }
}
