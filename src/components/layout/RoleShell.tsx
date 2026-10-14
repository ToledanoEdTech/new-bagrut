"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const isAllowed = session ? allowedRoles.includes(session.role) : false;

  useEffect(() => {
    if (loading) return;
    if (!session || !allowedRoles.includes(session.role)) {
      router.replace("/login");
      return;
    }
    if (
      session.platformAdmin &&
      !session.institutionId &&
      !pathname.startsWith("/admin/institutions")
    ) {
      router.replace("/admin/institutions");
    }
  }, [loading, session, allowedRoles, router, pathname]);

  if (loading || !session || !isAllowed) {
    return <PageLoader />;
  }

  return <AppShell role={session.role}>{children}</AppShell>;
}
