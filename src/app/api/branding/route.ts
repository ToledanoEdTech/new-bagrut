import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  SCHOOL_LOGO_MAX_BYTES,
  type PublicBranding,
  type SchoolLogoContentType,
} from "@/lib/branding";
import { currentInstitutionId } from "@/lib/institution-scope";
import { adminDb } from "@/lib/firebase/admin";
import {
  clearSchoolLogo,
  getSchoolBranding,
  saveSchoolLogo,
} from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

function toPublic(
  record: {
    logoBase64?: string | null;
    updatedAt?: string | null;
  },
  schoolName: string
): PublicBranding {
  return {
    schoolName,
    hasCustomLogo: Boolean(record.logoBase64),
    updatedAt: record.updatedAt ?? null,
  };
}

async function currentSchoolName(): Promise<string> {
  const institutionId = await currentInstitutionId();
  const snap = await adminDb.collection("institutions").doc(institutionId).get();
  const name = snap.get("name");
  return typeof name === "string" && name ? name : "מערכת מעקב בגרות";
}

function detectImageType(buf: Buffer): SchoolLogoContentType | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function GET() {
  try {
    const [branding, schoolName] = await Promise.all([
      getSchoolBranding(),
      currentSchoolName(),
    ]);
    return NextResponse.json(toPublic(branding, schoolName), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(toPublic({}, "מערכת מעקב בגרות"), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "לא נבחר קובץ לוגו" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }
  if (file.size > SCHOOL_LOGO_MAX_BYTES) {
    return NextResponse.json(
      { error: "הקובץ גדול מדי. הגודל המרבי הוא 450KB" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = detectImageType(buffer);
  if (!contentType) {
    return NextResponse.json(
      { error: "אפשר להעלות קובץ PNG, JPG או WebP בלבד" },
      { status: 400 }
    );
  }

  const saved = await saveSchoolLogo({
    logoBase64: buffer.toString("base64"),
    contentType,
    updatedBy: session.email,
  });

  return NextResponse.json(toPublic(saved, await currentSchoolName()));
}

export async function DELETE() {
  const { error, session } = await requireAdmin();
  if (error) return error;

  await clearSchoolLogo(session.email);
  return NextResponse.json(toPublic({}, await currentSchoolName()));
}
