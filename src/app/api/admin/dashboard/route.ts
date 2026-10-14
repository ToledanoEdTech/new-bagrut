import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getAdminDashboardForSession } from "@/lib/admin-dashboard";

export async function GET() {
  const { error, session } = await requireStaff();
  if (error || !session) return error;

  const data = await getAdminDashboardForSession(session);
  return NextResponse.json(data);
}
