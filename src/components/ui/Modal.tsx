"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey, useFocusTrap } from "./useFocusTrap";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
  size = "md",
}: ModalProps) {
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
            className={clsx(
              "relative w-full rounded-2xl border border-slate-200/70 bg-white shadow-card",
              sizes[size],
              className
            )}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
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
            <div className={clsx(!title && "pt-6", "max-h-[85vh] overflow-y-auto px-6 pb-6")}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
