"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey, useFocusTrap } from "./useFocusTrap";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  useFocusTrap(panelRef, open);
  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "sheet-title" : undefined}
            className={clsx(
              "absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-200/70 bg-white shadow-xl",
              className ?? "max-w-lg"
            )}
            initial={{ x: reducedMotion ? 0 : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reducedMotion ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
          >
            {title && (
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 id="sheet-title" className="text-lg font-semibold text-slate-900">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
