"use client";

import { DossierExportButton } from "@/components/ui/DossierExportButton";
import { PageLoader } from "@/components/ui/PageLoader";
import { useApi } from "@/hooks/useApi";
import {
  StudentDashboardContent,
  type StudentDashboardData,
} from "@/components/students/StudentDashboardContent";

type Props = {
  studentId: string;
  apiPath?: string;
};

export function StudentCardView({ studentId, apiPath }: Props) {
  const endpoint = apiPath ?? `/api/students/dashboard?studentId=${studentId}`;
  const { data, loading } = useApi<StudentDashboardData>(endpoint);

  if (loading && !data) {
    return <PageLoader variant="dashboard" />;
  }

  if (!data) {
    return <div className="text-center text-base text-slate-500">שגיאה בטעינת הנתונים</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DossierExportButton kind="student" studentId={studentId} label="ייצוא תיק תלמיד" />
      </div>
      <StudentDashboardContent data={data} subjectsTitle="מקצועות" audience="staff" />
    </div>
  );
}
