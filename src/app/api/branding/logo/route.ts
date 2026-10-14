import { NextResponse } from "next/server";
import { getSchoolBranding } from "@/lib/firestore/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const branding = await getSchoolBranding();
  if (!branding.logoBase64 || !branding.contentType) {
    return new NextResponse(null, { status: 404 });
  }

  const bytes = Buffer.from(branding.logoBase64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": branding.contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
