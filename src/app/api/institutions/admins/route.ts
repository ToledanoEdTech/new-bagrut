import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requirePlatformAdmin } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase/admin";
import { belongsToInstitution, runWithInstitution } from "@/lib/institution-scope";
import { actorFromSession, recordActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { error, session } = await requirePlatformAdmin();
  if (error || !session) return error;

  const body = await req.json();
  const institutionId = typeof body?.institutionId === "string" ? body.institutionId : "";
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

  if (!institutionId) {
    return NextResponse.json({ error: "בחרו מוסד" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "הזינו אימייל תקין" }, { status: 400 });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: "הזינו שם של המנהל" }, { status: 400 });
  }

  const institution = await adminDb.collection("institutions").doc(institutionId).get();
  if (!institution.exists) {
    return NextResponse.json({ error: "המוסד לא נמצא" }, { status: 404 });
  }

  const existing = await adminDb.collection("staff").where("email", "==", email).get();
  const match = existing.docs.find((doc) => belongsToInstitution(doc.data(), institutionId));
  const now = new Date().toISOString();

  const saved = match
    ? await match.ref
        .update({
          name,
          role: "ADMIN",
          institutionId,
          permissions: FieldValue.delete(),
          updatedAt: now,
        })
        .then(() => ({ id: match.id, email, name, updated: true }))
    : await adminDb
        .collection("staff")
        .add({
          email,
          name,
          role: "ADMIN",
          institutionId,
          createdAt: now,
        })
        .then((doc) => ({ id: doc.id, email, name, updated: false }));

  await runWithInstitution(institutionId, () =>
    recordActivity({
      actor: actorFromSession(session),
      action: "staff.create",
      category: "staff",
      entityType: "staff",
      entityId: saved.id,
      summaryHe: `מונה מנהל למוסד: ${name}`,
      meta: { email, institutionId },
    })
  );

  return NextResponse.json(saved);
}
