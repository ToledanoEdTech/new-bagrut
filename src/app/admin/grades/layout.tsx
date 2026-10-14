"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { User, ClipboardList, Upload } from "lucide-react";

const TABS = [
  { href: "/admin/grades", label: "לפי תלמיד", exact: true, icon: User },
  { href: "/admin/grades/matrix", label: "לפי מטלה", icon: ClipboardList },
  { href: "/admin/grades/import", label: "ייבוא", icon: Upload },
];

export default function GradesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="הזנת ציונים"
        subtitle="הזנת ציונים לפי תלמיד או לפי מטלה"
      />
      <div className="mt-6">
        <Tabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
