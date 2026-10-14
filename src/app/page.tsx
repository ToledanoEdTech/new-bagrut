import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-server";
import { isStaffRole } from "@/lib/roles";
import { hasAnyGradeWrite } from "@/lib/permissions";

export default async function Home() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role === "TEACHER" && hasAnyGradeWrite(session)) {
    redirect("/admin/grades");
  }
  if (isStaffRole(session.role)) redirect("/admin");
  redirect("/student");
}
