import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireStudentView } from "@/lib/api-auth";

export const runtime = "nodejs";
import { buildStudentDossier } from "@/lib/student-dossier";
import {
  buildStudentDossierExcelBuffer,
  studentDossierExcelFilename,
} from "@/lib/excel-dossier";
import {
  buildStudentDossierPdfBuffer,
  studentDossierPdfFilename,
} from "@/lib/pdf-dossier";

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error || !session) return error;

  const params = new URL(req.url).searchParams;
  const requestedId = params.get("studentId");
  const format = params.get("format");
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "פורמט ייצוא לא נתמך" }, { status: 400 });
  }

  let studentId = requestedId;
  let audience: "student" | "staff" = "staff";

  if (session.role === "STUDENT") {
    audience = "student";
    studentId = session.studentId;
    if (!studentId) {
      return NextResponse.json({ error: "לא נמצא פרופיל תלמיד" }, { status: 404 });
    }
    if (requestedId && requestedId !== studentId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }
  } else {
    if (!studentId) {
      return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
    }
    const viewError = await requireStudentView(session, { studentId });
    if (viewError) return viewError;
  }

  const dossier = await buildStudentDossier(studentId!, audience);
  if (!dossier) {
    return NextResponse.json({ error: "לא נמצא תלמיד" }, { status: 404 });
  }

  try {
    const buffer =
      format === "xlsx"
        ? await buildStudentDossierExcelBuffer(dossier)
        : await buildStudentDossierPdfBuffer(dossier);
    const filename =
      format === "xlsx" ? studentDossierExcelFilename(dossier) : studentDossierPdfFilename(dossier);
    const asciiFallback = format === "xlsx" ? "student-dossier.xlsx" : "student-dossier.pdf";
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
    console.error("student dossier export failed", err);
    const message =
      err instanceof Error && err.message ? err.message : "הייצוא נכשל. נסו שוב.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
