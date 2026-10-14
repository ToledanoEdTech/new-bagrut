import type { Role } from "./types";

export const ADMIN_EMAILS = [
  "yossitole@gmail.com",
  "yosseftole@zvialod.com",
] as const;

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(
    email.toLowerCase().trim() as (typeof ADMIN_EMAILS)[number]
  );
}

export function isStaffRole(role: Role): boolean {
  return role === "ADMIN" || role === "TEACHER";
}

export function canManageStructure(role: Role): boolean {
  return role === "ADMIN";
}

export function canImportStudents(role: Role): boolean {
  return role === "ADMIN";
}

export function canEditGrades(role: Role): boolean {
  return role === "ADMIN" || role === "TEACHER";
}

export function canViewStudents(role: Role): boolean {
  return role === "ADMIN" || role === "TEACHER";
}

export function resolveRoleForEmail(
  email: string,
  existingRole?: Role | null
): Role | null {
  const normalized = email.toLowerCase().trim();
  if (isAdminEmail(normalized)) return "ADMIN";
  if (existingRole === "TEACHER") return "TEACHER";
  if (existingRole === "STUDENT") return "STUDENT";
  return null;
}
