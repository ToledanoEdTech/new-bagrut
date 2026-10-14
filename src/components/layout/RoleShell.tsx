"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PageLoader } from "@/components/ui/PageLoader";
import { AppShell } from "./AppShell";
import type { Role } from "@/lib/types";

export function RoleShell({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: Role[];
}) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const isAllowed = session ? allowedRoles.includes(session.role) : false;

  useEffect(() => {
    if (loading) return;
    if (!session || !allowedRoles.includes(session.role)) {
      router.replace("/login");
    }
  }, [loading, session, allowedRoles, router]);

  if (loading || !session || !isAllowed) {
    return <PageLoader />;
  }

  return <AppShell role={session.role}>{children}</AppShell>;
}
