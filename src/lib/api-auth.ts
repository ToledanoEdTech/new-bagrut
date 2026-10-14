import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-server";
import type { AuthSession, Role } from "@/lib/types";
import {
  canManageStructure,
  canImportStudents,
  isStaffRole,
} from "@/lib/roles";
import {
  canEditStudents,
  canWriteGrades,
  hasAnyGradeWrite,
  hasAnyStudentEdit,
  hasAnyStudentView,
  type PermissionContext,
} from "@/lib/permissions";
import { resolvePermissionContext } from "@/lib/permission-resolve";
import { canViewStudentAccess } from "@/lib/permission-students";

type AuthResult =
  | { error: NextResponse; session: null }
  | { error: null; session: AuthSession };

export async function requireAuth(): Promise<AuthResult> {
  const session = await getAuthSession();
  if (!session) {
    return { error: NextResponse.json({ error: "לא מחובר" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function requireRole(...roles: Role[]): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.error) return result;
  if (!roles.includes(result.session.role)) {
    return { error: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }), session: null };
  }
  return result;
}

export async function requireStaff(): Promise<AuthResult> {
  const result = await requireAuth();
  if (result.error) return result;
  if (!isStaffRole(result.session.role)) {
    return { error: NextResponse.json({ error: "אין הרשאה" }, { status: 403 }), session: null };
  }
  return result;
}

export async function requireAdmin(): Promise<AuthResult> {
  return requireRole("ADMIN");
}

export async function requireStudent(): Promise<AuthResult> {
  const result = await requireRole("STUDENT");
  if (result.error) return result;
  if (!result.session.studentId) {
    return { error: NextResponse.json({ error: "לא נמצא פרופיל תלמיד" }, { status: 404 }), session: null };
  }
  return result;
}

export function checkPermission(
  session: AuthSession,
  action: "structure" | "import" | "grades" | "students" | "students:edit"
): boolean {
  switch (action) {
    case "structure":
      return canManageStructure(session.role);
    case "import":
      return canImportStudents(session.role);
    case "grades":
      return hasAnyGradeWrite(session);
    case "students":
      return hasAnyStudentView(session);
    case "students:edit":
      return hasAnyStudentEdit(session);
    default:
      return false;
  }
}

export async function requireGradeWrite(
  session: AuthSession,
  ctx: PermissionContext
): Promise<NextResponse | null> {
  const resolved = await resolvePermissionContext(ctx);
  if (!canWriteGrades(session, resolved)) {
    return NextResponse.json({ error: "אין הרשאה לעריכת ציונים" }, { status: 403 });
  }
  return null;
}

export async function requireStudentView(
  session: AuthSession,
  ctx: PermissionContext
): Promise<NextResponse | null> {
  if (!(await canViewStudentAccess(session, ctx))) {
    return NextResponse.json({ error: "אין הרשאה לצפייה בתלמידים" }, { status: 403 });
  }
  return null;
}

export async function requireStudentEdit(
  session: AuthSession,
  ctx: PermissionContext
): Promise<NextResponse | null> {
  const resolved = await resolvePermissionContext(ctx);
  if (!canEditStudents(session, resolved)) {
    return NextResponse.json({ error: "אין הרשאה לעריכת נתוני תלמידים" }, { status: 403 });
  }
  return null;
}
