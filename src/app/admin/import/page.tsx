"use client";

import { useState } from "react";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FileUpload } from "@/components/ui/FileUpload";
import { useToast } from "@/components/ui/Toast";
import { fetchCached } from "@/lib/api-cache";
import { downloadStudentsImportTemplate, exportTimestamp } from "@/lib/excel-export";

type StudentTemplateData = {
  classes: string[];
  tracks: string[];
  mathUnits: number[];
  englishUnits: number[];
};

export default function ImportPage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/students/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בייבוא");
        return;
      }
      setResult(data);
      if (data.created > 0) {
        toast.success(`${data.created} תלמידים יובאו בהצלחה`);
      } else if (data.skipped > 0) {
        toast.error("לא נוצרו תלמידים — בדקו את השורות שדולגו");
      } else {
        toast.error("לא נמצאו שורות תלמידים בקובץ");
      }
    } catch {
      setError("שגיאת רשת בייבוא");
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const fresh = await fetchCached<StudentTemplateData>(
        "/api/students/import/template",
        { force: true }
      );
      await downloadStudentsImportTemplate(`תבנית_תלמידים_${exportTimestamp()}.xlsx`, {
        classes: fresh.classes,
        tracks: fresh.tracks,
        mathUnits: fresh.mathUnits,
        englishUnits: fresh.englishUnits,
      });
    } finally {
      setDownloadingTemplate(false);
    }
  }

  return (
    <>
      <PageHeader
        title="ייבוא תלמידים"
        subtitle="העלאת קובץ אקסל/CSV עם רשימת תלמידים"
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span className="flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 font-medium text-primary-700">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
            1
          </span>
          הורד תבנית
        </span>
        <span className="text-slate-300">›</span>
        <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-xs text-white">
            2
          </span>
          העלה קובץ
        </span>
        <span className="text-slate-300">›</span>
        <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-xs text-white">
            3
          </span>
          תוצאות
        </span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">שלב 1–2: תבנית והעלאה</h2>
          <p className="mt-2 text-sm text-slate-500">
            הקובץ צריך לכלול: שם, אימייל, כיתה, עד 3 מגמות (אופציונלי), מתמטיקה, אנגלית
          </p>

          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => void downloadTemplate()}
              disabled={downloadingTemplate}
            >
              <Download className="h-4 w-4" />
              {downloadingTemplate ? "מוריד..." : "הורדת תבנית (Excel)"}
            </Button>
          </div>

          <div className="mt-6">
            <FileUpload file={file} onFileChange={setFile} />
          </div>

          <div className="mt-6">
            <Button onClick={handleImport} disabled={!file || loading}>
              <FileSpreadsheet className="h-4 w-4" />
              {loading ? "מייבא..." : "ייבוא"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">הוראות</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="font-bold text-primary-600">1.</span>
              הורידו את תבנית הקובץ או הכינו קובץ אקסל עם העמודות הנדרשות
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary-600">2.</span>
              עמודת האימייל תשמש ליצירת חשבון התחברות לתלמיד
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary-600">3.</span>
              סיסמת ברירת מחדל לתלמידים חדשים: student123
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary-600">4.</span>
              כיתות שלא קיימות ייווצרו אוטומטית
            </li>
          </ul>

          {error && (
            <Alert variant="error" className="mt-6" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {result && (
            <div className="mt-6 space-y-3">
              <Alert
                variant={result.created > 0 ? "success" : "warning"}
                title={result.created > 0 ? "הייבוא הושלם" : "לא נוצרו תלמידים"}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {result.created} תלמידים נוצרו, {result.skipped} דולגו
                </span>
              </Alert>
              {result.errors.length > 0 && (
                <Alert variant="error" title="שגיאות / דילוגים בייבוא">
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
