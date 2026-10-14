import {
  findObligation,
  getClassById,
  getStudentById,
} from "@/lib/firestore";
import type { PermissionContext, ResolvedPermissionContext } from "@/lib/permissions";

export async function resolvePermissionContext(
  ctx: PermissionContext
): Promise<ResolvedPermissionContext> {
  let classId = ctx.classId;
  let subjectId = ctx.subjectId;
  let gradeYear = ctx.gradeYear;

  if (ctx.studentId && !classId) {
    const student = await getStudentById(ctx.studentId);
    classId = student?.classId;
  }

  if (ctx.obligationId && !subjectId) {
    const found = await findObligation(ctx.obligationId);
    subjectId = found?.subject.id;
  }

  if (classId && gradeYear === undefined) {
    const cls = await getClassById(classId);
    gradeYear = cls?.gradeYear ?? null;
  }

  return { classId, subjectId, gradeYear };
}
