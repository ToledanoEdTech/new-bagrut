"use client";

import clsx from "clsx";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { useCallback, useRef, useState, type DragEvent } from "react";

const ACCEPT = ".xlsx,.xls,.csv";

type FileUploadProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  error?: string;
  className?: string;
};

export function FileUpload({
  file,
  onFileChange,
  accept = ACCEPT,
  error,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const next = files?.[0] ?? null;
      onFileChange(next);
    },
    [onFileChange]
  );

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2",
          dragging && "border-primary-500 bg-primary-50/50",
          error && "border-red-300 bg-red-50/30",
          file && !error && "border-emerald-300 bg-emerald-50/30",
          !dragging && !error && !file && "border-slate-200 bg-slate-50 hover:border-primary-400 hover:bg-primary-50/30"
        )}
      >
        {file ? (
          <>
            <FileSpreadsheet className="h-10 w-10 text-emerald-500" aria-hidden />
            <span className="mt-3 text-sm font-semibold text-slate-700">{file.name}</span>
            <span className="mt-1 text-xs text-slate-500">לחץ או גרור קובץ אחר להחלפה</span>
          </>
        ) : (
          <>
            <Upload
              className={clsx("h-10 w-10", dragging ? "text-primary-500" : "text-slate-400")}
              aria-hidden
            />
            <span className="mt-3 text-sm font-medium text-slate-600">
              {dragging ? "שחרר כאן" : "לחץ לבחירת קובץ או גרור לכאן"}
            </span>
            <span className="mt-1 text-xs text-slate-400">XLSX, XLS, CSV</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {file && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFileChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-red-600"
        >
          <X className="h-3 w-3" />
          הסר קובץ
        </button>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
