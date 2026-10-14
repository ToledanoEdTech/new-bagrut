"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type ConfirmVariant = "danger" | "default";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState(options);
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
      >
        {state && (
          <div>
            {state.description && (
              <p className="text-base text-slate-600">{state.description}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => close(false)}>
                {state.cancelLabel ?? "ביטול"}
              </Button>
              <Button
                variant={state.variant === "danger" ? "danger" : "primary"}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? "אישור"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
