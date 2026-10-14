import { NextRequest, NextResponse } from "next/server";
import {
  createExamPath,
  deleteExamPath,
  listExamPaths,
  updateExamPath,
} from "@/lib/firestore";
import { requireAdmin, requireStaff } from "@/lib/api-auth";
import type { ExamPathType } from "@/lib/types";

const PATH_TYPES = new Set<ExamPathType>([
  "REGULAR",
  "BEIT_MIDRASH",
  "MEUBAR_HINUCH",
]);

function parsePathType(value: unknown): ExamPathType | undefined {
  if (typeof value !== "string") return undefined;
  return PATH_TYPES.has(value as ExamPathType) ? (value as ExamPathType) : undefined;
}

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  return NextResponse.json(await listExamPaths());
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const label = typeof body.label === "string" ? body.label : "";
    if (!label.trim()) {
      return NextResponse.json({ error: "שם תוכנית הוא שדה חובה" }, { status: 400 });
    }

    const pathType = parsePathType(body.pathType);
    if (body.pathType != null && !pathType) {
      return NextResponse.json({ error: "סוג תוכנית לא תקין" }, { status: 400 });
    }

    const subjectIds = Array.isArray(body.subjectIds)
      ? body.subjectIds.filter((id: unknown): id is string => typeof id === "string")
      : undefined;

    const path = await createExamPath({
      label,
      description: typeof body.description === "string" ? body.description : null,
      pathType,
      subjectIds,
      key: typeof body.key === "string" ? body.key : undefined,
    });
    return NextResponse.json(path);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
    }

    const pathType = parsePathType(body.pathType);
    if (body.pathType != null && !pathType) {
      return NextResponse.json({ error: "סוג תוכנית לא תקין" }, { status: 400 });
    }

    const subjectIds = Array.isArray(body.subjectIds)
      ? body.subjectIds.filter((id: unknown): id is string => typeof id === "string")
      : undefined;

    const path = await updateExamPath(id, {
      label: typeof body.label === "string" ? body.label : undefined,
      description:
        body.description === undefined
          ? undefined
          : typeof body.description === "string"
            ? body.description
            : null,
      pathType,
      subjectIds,
      key: typeof body.key === "string" ? body.key : undefined,
    });

    if (!path) {
      return NextResponse.json({ error: "תוכנית לא נמצאה" }, { status: 404 });
    }
    return NextResponse.json(path);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  try {
    await deleteExamPath(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 400 }
    );
  }
}
