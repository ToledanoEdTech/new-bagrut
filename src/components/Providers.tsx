"use client";

import { AuthProvider } from "./AuthProvider";
import { CacheEpochSync } from "./CacheEpochSync";
import { ConfirmProvider } from "./ui/ConfirmDialog";
import { ToastProvider } from "./ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CacheEpochSync />
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
