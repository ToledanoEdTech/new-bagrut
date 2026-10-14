import { NextRequest, NextResponse } from "next/server";
import {
  createClass,
  deleteClass,
  listClasses,
  updateClass,
} from "@/lib/firestore";
import { requireAdmin } from "@/lib/api-auth";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(await listClasses());
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const cls = await createClass({
      name: typeof body.name === "string" ? body.name : "",
      gradeYear: typeof body.gradeYear === "string" ? body.gradeYear : null,
      examPathId: typeof body.examPathId === "string" ? body.examPathId : "",
      homeroomTeacherId:
        typeof body.homeroomTeacherId === "string" && body.homeroomTeacherId
          ? body.homeroomTeacherId
          : null,
    });
    return NextResponse.json(cls);
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
    if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

    const patch: Parameters<typeof updateClass>[1] = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.gradeYear === "string") patch.gradeYear = body.gradeYear || null;
    if (typeof body.examPathId === "string") patch.examPathId = body.examPathId;
    if (body.homeroomTeacherId !== undefined) {
      patch.homeroomTeacherId =
        typeof body.homeroomTeacherId === "string" && body.homeroomTeacherId
          ? body.homeroomTeacherId
          : null;
    }
    const cls = await updateClass(id, patch);
    return NextResponse.json(cls);
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
    await deleteClass(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה" },
      { status: 400 }
    );
  }
}
