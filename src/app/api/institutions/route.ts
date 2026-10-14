import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/api-auth";
import { actorFromSession, recordActivity } from "@/lib/activity-log";
import {
  createInstitution,
  deleteInstitution,
  InstitutionError,
  listInstitutions,
  updateInstitution,
} from "@/lib/firestore/institutions";

export const dynamic = "force-dynamic";

function errorResponse(err: unknown) {
  if (err instanceof InstitutionError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: "שגיאה בשמירת המוסד" }, { status: 500 });
}

export async function GET() {
  try {
    const institutions = await listInstitutions();
    return NextResponse.json(institutions, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לטעון את רשימת המוסדות" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requirePlatformAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const institution = await createInstitution(body?.name);
    void recordActivity({
      actor: actorFromSession(session),
      action: "institution.create",
      category: "other",
      entityType: "institution",
      entityId: institution.id,
      summaryHe: `נוסף מוסד חינוך: ${institution.name}`,
    });
    return NextResponse.json(institution);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePlatformAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const institution = await updateInstitution(body?.id, body?.name);
    void recordActivity({
      actor: actorFromSession(session),
      action: "institution.update",
      category: "other",
      entityType: "institution",
      entityId: institution.id,
      summaryHe: `עודכן שם מוסד חינוך: ${institution.name}`,
    });
    return NextResponse.json(institution);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePlatformAdmin();
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  try {
    const institution = await deleteInstitution(id);
    void recordActivity({
      actor: actorFromSession(session),
      action: "institution.delete",
      category: "other",
      entityType: "institution",
      entityId: institution.id,
      summaryHe: `נמחק מוסד חינוך: ${institution.name}`,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
