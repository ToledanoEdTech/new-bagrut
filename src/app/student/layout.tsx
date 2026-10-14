import { RoleShell } from "@/components/layout/RoleShell";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell allowedRoles={["STUDENT"]}>{children}</RoleShell>;
}
