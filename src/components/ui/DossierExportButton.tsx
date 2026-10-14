"use client";

import { useMemo, useState } from "react";
import { Download, FileArchive, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { downloadFromApi } from "@/lib/download-file";

type ExportFormat = "xlsx" | "pdf";
type ExportMode = "single" | "zip";

type StudentExportProps = {
  kind: "student";
  studentId?: string | null;
  label?: string;
  audience?: "student" | "staff";
  className?: string;
};

type ClassExportProps = {
  kind: "class";
  classId?: string | null;
  classLabel?: string;
  label?: string;
  className?: string;
};

type Props = StudentExportProps | ClassExportProps;

export function DossierExportButton(props: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [mode, setMode] = useState<ExportMode>("single");
  const [loading, setLoading] = useState(false);

  const disabled =
    props.kind === "student"
      ? props.audience === "student"
        ? false
        : !props.studentId
      : !props.classId;

  const title =
    props.kind === "student" ? "ייצוא תיק תלמיד" : "ייצוא תיקי תלמידים";

  const endpoint = useMemo(() => {
    if (props.kind === "student") {
      if (props.audience === "student") {
        return `/api/students/export?format=${format}`;
      }
      if (!props.studentId) return null;
      return `/api/students/export?studentId=${encodeURIComponent(props.studentId)}&format=${format}`;
    }
    if (!props.classId) return null;
    return `/api/classes/export-dossiers?classId=${encodeURIComponent(props.classId)}&format=${format}&mode=${mode}`;
  }, [props, format, mode]);

  async function handleExport() {
    if (!endpoint) return;
    setLoading(true);
    try {
      await downloadFromApi(endpoint);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "הייצוא נכשל");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={disabled || loading}
        className={props.className}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {props.label ?? (props.kind === "student" ? "ייצוא תיק תלמיד" : "ייצוא תיקי תלמידים")}
      </Button>

      <Modal open={open} onClose={() => !loading && setOpen(false)} title={title} size="sm">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">פורמט קובץ</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={format === "pdf" ? "primary" : "secondary"}
                onClick={() => setFormat("pdf")}
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>
              <Button
                type="button"
                variant={format === "xlsx" ? "primary" : "secondary"}
                onClick={() => setFormat("xlsx")}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>
          </div>

          {props.kind === "class" && (
            <div>
              <p className="text-sm font-semibold text-slate-900">אופן הייצוא לכיתה</p>
              <div className="mt-3 space-y-2">
                <Button
                  type="button"
                  variant={mode === "single" ? "primary" : "secondary"}
                  onClick={() => setMode("single")}
                  className="w-full justify-center"
                >
                  <FileText className="h-4 w-4" />
                  קובץ אחד ארוך
                </Button>
                <Button
                  type="button"
                  variant={mode === "zip" ? "primary" : "secondary"}
                  onClick={() => setMode("zip")}
                  className="w-full justify-center"
                >
                  <FileArchive className="h-4 w-4" />
                  קובץ לכל תלמיד ב-ZIP
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {props.kind === "student"
              ? "הקובץ יכלול זהות תלמיד, סיכום, כל המקצועות, ציונים, תתי-מטלות ומטלות פתוחות."
              : "הקובץ יכלול תיק מלא לכל תלמיד בכיתה. במצב קובץ אחד, כל תלמיד יופיע ברצף; במצב ZIP ייווצר קובץ נפרד לכל תלמיד."}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              ביטול
            </Button>
            <Button type="button" onClick={() => void handleExport()} disabled={!endpoint || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {loading ? "מייצא..." : "הורד"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
