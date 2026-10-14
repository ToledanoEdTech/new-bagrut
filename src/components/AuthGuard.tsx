"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Role } from "@/lib/types";
import { isStaffRole } from "@/lib/roles";

function roleHome(role: Role) {
  return role === "STUDENT" ? "/student" : "/admin";
}

export function AuthGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role: Role;
}) {
  const router = useRouter();
  const { session, loading } = useAuth();

  const roleMatches =
    session &&
    (role === "STUDENT"
      ? session.role === "STUDENT"
      : isStaffRole(session.role) && session.role === role);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!roleMatches) {
      router.replace(roleHome(session.role));
    }
  }, [loading, session, roleMatches, router]);

  if (loading || !session || !roleMatches) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
      </div>
    );
  }

  return <>{children}</>;
}
