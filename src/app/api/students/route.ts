import { NextRequest, NextResponse } from "next/server";
import {
  createStudent,
  deleteStudent,
  enrichStudent,
  getClassById,
  getStudentByEmail,
  getStudentById,
  listStudents,
  listStudentsEnriched,
  updateStudent,
} from "@/lib/firestore";
import { resolveMandatorySubjectIdsForClass } from "@/lib/student-subjects";
import {
  checkPermission,
  requireStaff,
  requireStudentEdit,
} from "@/lib/api-auth";
import { filterStudentsForSession } from "@/lib/permission-students";

export async function GET() {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const students = await listStudentsEnriched();
  return NextResponse.json(await filterStudentsForSession(session, students));
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students:edit")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, classId, trackIds, trackId, mathUnits, englishUnits, mandatorySubjectIds } =
    body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "חסר שם תלמיד" }, { status: 400 });
  }
  if (!email?.trim()) {
    return NextResponse.json({ error: "חסר אימייל" }, { status: 400 });
  }
  if (!classId) {
    return NextResponse.json({ error: "חסרה כיתה" }, { status: 400 });
  }

  const cls = await getClassById(classId);
  if (!cls) {
    return NextResponse.json({ error: "כיתה לא נמצאה" }, { status: 400 });
  }

  const editError = await requireStudentEdit(session, {
    classId,
    gradeYear: cls.gradeYear,
  });
  if (editError) return editError;

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await getStudentByEmail(normalizedEmail);
  if (existing) {
    return NextResponse.json({ error: "תלמיד עם אימייל זה כבר קיים" }, { status: 409 });
  }

  const resolvedTrackIds = Array.isArray(trackIds)
    ? trackIds.filter(Boolean)
    : trackId
      ? [trackId]
      : [];

  const resolvedMathUnits = mathUnits ?? 3;
  const resolvedEnglishUnits = englishUnits ?? 3;
  if (![3, 4, 5].includes(resolvedMathUnits) || ![3, 4, 5].includes(resolvedEnglishUnits)) {
    return NextResponse.json({ error: "יחידות לימוד חייבות להיות 3, 4 או 5" }, { status: 400 });
  }

  try {
    const resolvedMandatorySubjectIds = await resolveMandatorySubjectIdsForClass(
      classId,
      mandatorySubjectIds
    );
    const student = await createStudent({
      name: name.trim(),
      email: normalizedEmail,
      classId,
      trackIds: resolvedTrackIds,
      mathUnits: resolvedMathUnits,
      englishUnits: resolvedEnglishUnits,
      extensions: null,
      mandatorySubjectIds: resolvedMandatorySubjectIds,
    });
    return NextResponse.json(await enrichStudent(student), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה ביצירת תלמיד" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students:edit")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const body = await req.json();
  const {
    id,
    classId,
    trackId,
    trackIds,
    mathUnits,
    englishUnits,
    extensions,
    mandatorySubjectIds,
    name,
    email,
  } = body;

  if (!id) {
    return NextResponse.json({ error: "חסר מזהה תלמיד" }, { status: 400 });
  }

  const resolvedTrackIds = Array.isArray(trackIds)
    ? trackIds.filter(Boolean)
    : trackId
      ? [trackId]
      : [];

  try {
    const existing = await getStudentById(id);
    if (!existing) {
      return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    }

    const targetClassId = classId ?? existing.classId;
    const targetCls = await getClassById(targetClassId);
    const editError = await requireStudentEdit(session, {
      classId: targetClassId,
      gradeYear: targetCls?.gradeYear ?? null,
      studentId: id,
    });
    if (editError) return editError;
    let resolvedMandatorySubjectIds: string[] | undefined | null = undefined;
    if (mandatorySubjectIds !== undefined) {
      resolvedMandatorySubjectIds = await resolveMandatorySubjectIdsForClass(
        targetClassId,
        mandatorySubjectIds
      );
    } else if (classId !== undefined && classId !== existing.classId) {
      resolvedMandatorySubjectIds = await resolveMandatorySubjectIdsForClass(
        targetClassId,
        existing.mandatorySubjectIds
      );
    }

    await updateStudent(id, {
      ...(classId !== undefined && { classId }),
      trackIds: resolvedTrackIds,
      ...(mathUnits !== undefined && { mathUnits }),
      ...(englishUnits !== undefined && { englishUnits }),
      ...(extensions !== undefined && { extensions }),
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(resolvedMandatorySubjectIds !== undefined && {
        mandatorySubjectIds: resolvedMandatorySubjectIds ?? null,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בעדכון תלמיד" },
      { status: 500 }
    );
  }

  const student = await listStudents().then((s) => s.find((x) => x.id === id));
  if (!student) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  return NextResponse.json(await enrichStudent(student));
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireStaff();
  if (error || !session) return error;
  if (!checkPermission(session, "students:edit")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const existing = await getStudentById(id);
  if (!existing) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }
  const cls = await getClassById(existing.classId);
  const editError = await requireStudentEdit(session, {
    classId: existing.classId,
    gradeYear: cls?.gradeYear ?? null,
    studentId: id,
  });
  if (editError) return editError;

  await deleteStudent(id);
  return NextResponse.json({ success: true });
}
