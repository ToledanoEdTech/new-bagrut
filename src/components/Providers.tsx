"use client";

import { AuthProvider } from "./AuthProvider";
import { BrandingProvider } from "./BrandingProvider";
import { CacheEpochSync } from "./CacheEpochSync";
import { ConfirmProvider } from "./ui/ConfirmDialog";
import { ToastProvider } from "./ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <BrandingProvider>
        <CacheEpochSync />
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </BrandingProvider>
    </AuthProvider>
  );
}
