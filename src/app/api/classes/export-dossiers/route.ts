import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { requireStaff, requireStudentView } from "@/lib/api-auth";

export const runtime = "nodejs";
import { buildClassDossiers } from "@/lib/student-dossier";
import {
  buildClassDossiersExcelBuffer,
  buildStudentDossierExcelBuffer,
  classDossiersExcelFilename,
  studentDossierExcelFilename,
} from "@/lib/excel-dossier";
import {
  buildClassDossiersPdfBuffer,
  buildStudentDossierPdfBuffer,
  classDossiersPdfFilename,
  studentDossierPdfFilename,
} from "@/lib/pdf-dossier";

export async function GET(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  const params = new URL(req.url).searchParams;
  const classId = params.get("classId");
  const format = params.get("format");
  const mode = params.get("mode") ?? "single";
  if (!classId) {
    return NextResponse.json({ error: "חסר מזהה כיתה" }, { status: 400 });
  }
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "פורמט ייצוא לא נתמך" }, { status: 400 });
  }
  if (mode !== "single" && mode !== "zip") {
    return NextResponse.json({ error: "מצב ייצוא לא נתמך" }, { status: 400 });
  }

  const viewError = await requireStudentView(session, { classId });
  if (viewError) return viewError;

  const result = await buildClassDossiers(classId, "staff");
  if (!result) {
    return NextResponse.json({ error: "כיתה לא נמצאה" }, { status: 404 });
  }

  try {
    if (mode === "single") {
      const buffer =
        format === "xlsx"
          ? await buildClassDossiersExcelBuffer(result.className, result.dossiers)
          : await buildClassDossiersPdfBuffer(result.className, result.dossiers);
      const filename =
        format === "xlsx"
          ? classDossiersExcelFilename(result.className)
          : classDossiersPdfFilename(result.className);
      const asciiFallback = format === "xlsx" ? "class-dossiers.xlsx" : "class-dossiers.pdf";
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/pdf",
          "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const zip = new JSZip();
    for (const dossier of result.dossiers) {
      const fileBuffer =
        format === "xlsx"
          ? await buildStudentDossierExcelBuffer(dossier)
          : await buildStudentDossierPdfBuffer(dossier);
      const filename =
        format === "xlsx" ? studentDossierExcelFilename(dossier) : studentDossierPdfFilename(dossier);
      zip.file(filename, fileBuffer);
    }

    const archive = await zip.generateAsync({ type: "nodebuffer" });
    const zipName = `תיקי_תלמידים_${result.className}_${format}.zip`;
    return new NextResponse(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="class-dossiers.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("class dossier export failed", err);
    const message =
      err instanceof Error && err.message ? err.message : "הייצוא נכשל. נסו שוב.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
