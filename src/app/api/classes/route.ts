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

  const { name, gradeYear, examPathId, homeroomTeacherId } = await req.json();
  const cls = await createClass({
    name,
    gradeYear,
    examPathId,
    homeroomTeacherId: homeroomTeacherId || null,
  });
  return NextResponse.json(cls);
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id, name, gradeYear, examPathId, homeroomTeacherId } = await req.json();
  const patch: Parameters<typeof updateClass>[1] = { name, gradeYear, examPathId };
  if (homeroomTeacherId !== undefined) {
    patch.homeroomTeacherId = homeroomTeacherId || null;
  }
  const cls = await updateClass(id, patch);
  return NextResponse.json(cls);
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
