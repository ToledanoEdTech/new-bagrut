import { NextRequest, NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/auth-server";
import { requirePlatformAdmin } from "@/lib/api-auth";
import { getInstitution } from "@/lib/firestore/institutions";
import { INSTITUTION_COOKIE } from "@/lib/institution-scope";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { error } = await requirePlatformAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const institutionId = typeof body?.institutionId === "string" ? body.institutionId : "";
  const institution = await getInstitution(institutionId);
  if (!institution) {
    return NextResponse.json({ error: "המוסד לא נמצא" }, { status: 404 });
  }

  const response = NextResponse.json({ institutionId: institution.id, name: institution.name });
  response.cookies.set(INSTITUTION_COOKIE, institution.id, authCookieOptions());
  return response;
}
