"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useBranding } from "@/components/BrandingProvider";
import { SchoolMark } from "@/components/ui/SiteLogos";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { SCHOOL_LOGO_MAX_BYTES } from "@/lib/branding";

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export function SchoolLogoSettings() {
  const { hasCustomLogo, refresh } = useBranding();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > SCHOOL_LOGO_MAX_BYTES) {
        toast.error("הקובץ גדול מדי. הגודל המרבי הוא 450KB");
        return;
      }

      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);
      setBusy("upload");
      try {
        const body = new FormData();
        body.append("logo", file);
        const res = await fetch("/api/branding", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "שגיאה בהעלאת הלוגו");
        await refresh();
        toast.success("לוגו בית הספר עודכן ומוצג באתר");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "שגיאה בהעלאת הלוגו");
      } finally {
        setBusy(null);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      }
    },
    [refresh, toast]
  );

  const remove = useCallback(async () => {
    setBusy("remove");
    try {
      const res = await fetch("/api/branding", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "שגיאה בהסרת הלוגו");
      await refresh();
      toast.success("הוחזר הלוגו המקורי");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בהסרת הלוגו");
    } finally {
      setBusy(null);
    }
  }, [refresh, toast]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
        <div className="flex items-center justify-center bg-gradient-to-bl from-primary-800 via-brand-800 to-primary-950 p-6">
          <div className="rounded-2xl bg-white p-3 shadow-card">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="תצוגה מקדימה של הלוגו"
                className="h-24 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <SchoolMark className="h-24 w-auto max-w-[160px] object-contain" />
            )}
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">לוגו בית הספר</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              הלוגו מופיע בעמוד הכניסה, בדשבורד הבית ובתפריט האתר. מנהל המערכת
              ומנהל בית הספר יכולים להחליף אותו.
            </p>
          </div>

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
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              "flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed px-4 py-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400",
              dragging
                ? "border-primary-500 bg-primary-50"
                : "border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-primary-50/40"
            )}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-soft ring-1 ring-slate-200">
              {busy === "upload" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">
                {busy === "upload" ? "מעלים את הלוגו..." : "גררו לכאן לוגו, או לחצו לבחירה"}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                PNG, JPG או WebP · עד 450KB · רקע שקוף מומלץ
              </span>
            </span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />

          {hasCustomLogo && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void remove()}
              disabled={busy !== null}
              className="text-slate-500"
            >
              {busy === "remove" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              החזרת הלוגו המקורי
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
