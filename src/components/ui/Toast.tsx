"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_MS = 4000;

const variantStyles: Record<ToastVariant, { bg: string; icon: typeof Info }> = {
  success: { bg: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  error: { bg: "border-red-200 bg-red-50 text-red-900", icon: AlertCircle },
  info: { bg: "border-primary-200 bg-primary-50 text-primary-900", icon: Info },
};

function ToastItemView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const { bg, icon: Icon } = variantStyles[item.variant];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <motion.div
      layout={!reducedMotion}
      initial={{ opacity: 0, y: reducedMotion ? 0 : -12, scale: reducedMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -8, scale: reducedMotion ? 1 : 0.98 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      role="status"
      className={clsx(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-card",
        bg
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 font-medium">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 rounded-lg p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        aria-label="סגור"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = `toast-${++idRef.current}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: addToast,
      success: (message) => addToast(message, "success"),
      error: (message) => addToast(message, "error"),
      info: (message) => addToast(message, "info"),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 top-4 z-[110] flex flex-col items-center gap-2 px-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            <AnimatePresence mode="popLayout">
              {toasts.map((item) => (
                <ToastItemView key={item.id} item={item} onDismiss={dismiss} />
              ))}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
