import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { listStaff } from "@/lib/firestore";
import { isAdminEmail } from "@/lib/roles";
import { invalidateServerCache } from "@/lib/server-cache";
import { actorFromSession, recordActivity } from "@/lib/activity-log";
import type { StaffPermission, StaffRole } from "@/lib/types";

function normalizePermissions(permissions: unknown): StaffPermission[] | undefined {
  if (!Array.isArray(permissions)) return undefined;
  return permissions as StaffPermission[];
}

async function countStaffAdmins(): Promise<number> {
  const snap = await adminDb.collection("staff").where("role", "==", "ADMIN").get();
  return snap.size;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json(await listStaff());
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  const { email, name, role, permissions } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "חסר אימייל" }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();
  if (isAdminEmail(normalized)) {
    return NextResponse.json(
      { error: "מנהל-על מוגדר בקוד ואינו ניתן לניהול מהאתר" },
      { status: 400 }
    );
  }

  const staffRole: StaffRole = role === "ADMIN" ? "ADMIN" : "TEACHER";
  const staffPermissions = staffRole === "TEACHER" ? normalizePermissions(permissions) : undefined;

  if (staffRole === "TEACHER" && (!staffPermissions || staffPermissions.length === 0)) {
    return NextResponse.json(
      { error: "יש להגדיר הרשאות למורה" },
      { status: 400 }
    );
  }

  const existing = await adminDb
    .collection("staff")
    .where("email", "==", normalized)
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: "משתמש צוות כבר קיים" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const docData: Record<string, unknown> = {
    email: normalized,
    name: name ?? normalized,
    role: staffRole,
    createdAt: now,
  };
  if (staffPermissions) {
    docData.permissions = staffPermissions;
  }

  const doc = await adminDb.collection("staff").add(docData);
  await invalidateServerCache("staff");

  const displayName = name ?? normalized;
  void recordActivity({
    actor: actorFromSession(session),
    action: "staff.create",
    category: "staff",
    entityType: "staff",
    entityId: doc.id,
    summaryHe: `נוסף חבר צוות: ${displayName} (${staffRole === "ADMIN" ? "מנהל" : "מורה"})`,
    meta: { staffId: doc.id, email: normalized, role: staffRole },
  });

  return NextResponse.json({
    id: doc.id,
    email: normalized,
    name: displayName,
    role: staffRole,
    permissions: staffPermissions,
    createdAt: now,
  });
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  const { id, name, role, permissions, gradeReminderOptOut } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
  }

  const ref = adminDb.collection("staff").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  const existing = snap.data() as {
    email: string;
    role: StaffRole;
    name: string;
  };

  if (isAdminEmail(existing.email)) {
    return NextResponse.json(
      { error: "לא ניתן לערוך מנהל-על המוגדר בקוד" },
      { status: 403 }
    );
  }

  const newRole: StaffRole | undefined =
    role === "ADMIN" ? "ADMIN" : role === "TEACHER" ? "TEACHER" : undefined;

  if (
    newRole &&
    newRole !== "ADMIN" &&
    existing.role === "ADMIN" &&
    existing.email === session.email
  ) {
    const adminCount = await countStaffAdmins();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "לא ניתן להסיר את עצמך כמנהל האחרון" },
        { status: 403 }
      );
    }
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (name !== undefined) updates.name = name;
  if (newRole) updates.role = newRole;
  if (typeof gradeReminderOptOut === "boolean") {
    updates.gradeReminderOptOut = gradeReminderOptOut;
  }

  if (newRole === "ADMIN") {
    updates.permissions = FieldValue.delete();
  } else if (permissions !== undefined) {
    const staffPermissions = normalizePermissions(permissions);
    if (!staffPermissions || staffPermissions.length === 0) {
      return NextResponse.json(
        { error: "יש להגדיר הרשאות למורה" },
        { status: 400 }
      );
    }
    updates.permissions = staffPermissions;
  } else if (newRole === "TEACHER" && existing.role === "ADMIN") {
    return NextResponse.json(
      { error: "יש להגדיר הרשאות בעת הורדת תפקיד מנהל" },
      { status: 400 }
    );
  }

  await ref.update(updates);
  await invalidateServerCache("staff");
  const updated = await ref.get();
  const updatedData = updated.data() as { name?: string; role?: StaffRole; email?: string };

  void recordActivity({
    actor: actorFromSession(session),
    action: "staff.update",
    category: "staff",
    entityType: "staff",
    entityId: id,
    summaryHe: `עודכן חבר צוות: ${updatedData.name ?? existing.name}`,
    meta: {
      staffId: id,
      email: existing.email,
      fields: Object.keys(updates).filter((k) => k !== "updatedAt"),
    },
  });

  return NextResponse.json({ id: updated.id, ...updated.data() });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error || !session) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });

  const ref = adminDb.collection("staff").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  const data = snap.data() as { email: string; role: StaffRole };

  if (isAdminEmail(data.email)) {
    return NextResponse.json(
      { error: "לא ניתן להסיר מנהל-על המוגדר בקוד" },
      { status: 403 }
    );
  }

  if (data.role === "ADMIN" && data.email === session.email) {
    const adminCount = await countStaffAdmins();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "לא ניתן להסיר את עצמך כמנהל האחרון" },
        { status: 403 }
      );
    }
  }

  await ref.delete();
  await invalidateServerCache("staff");

  void recordActivity({
    actor: actorFromSession(session),
    action: "staff.delete",
    category: "staff",
    entityType: "staff",
    entityId: id,
    summaryHe: `הוסר חבר צוות: ${data.email}`,
    meta: { staffId: id, email: data.email, role: data.role },
  });

  return NextResponse.json({ success: true });
}
