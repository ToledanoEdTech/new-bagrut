"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { School, BookMarked } from "lucide-react";

const TABS = [
  { href: "/admin/classes", label: "כיתות", exact: true, icon: School },
  { href: "/admin/classes/programs", label: "תוכניות", icon: BookMarked },
];

export default function ClassesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="כיתות ותוכניות"
        subtitle='ניהול כיתות ותוכניות חובה (רגילה, בית מדרש, מב"ר/חנ"מ ועוד)'
      />
      <div className="mt-6">
        <Tabs tabs={TABS} />
      </div>
      {children}
    </>
  );
}
