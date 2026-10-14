"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_SCHOOL_NAME,
  schoolLogoUrl,
  type PublicBranding,
} from "@/lib/branding";

type BrandingContextValue = {
  schoolName: string;
  schoolLogoUrl: string | null;
  hasCustomLogo: boolean;
  updatedAt: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue>({
  schoolName: DEFAULT_SCHOOL_NAME,
  schoolLogoUrl: null,
  hasCustomLogo: false,
  updatedAt: null,
  loading: true,
  refresh: async () => {},
});

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PublicBranding | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/branding", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as PublicBranding;
      setData(json);
    } catch {
      // Keep the default mark if branding cannot be loaded.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasCustomLogo = Boolean(data?.hasCustomLogo);
  const updatedAt = data?.updatedAt ?? null;
  const logoUrl = hasCustomLogo ? schoolLogoUrl(updatedAt) : null;

  useEffect(() => {
    if (!logoUrl) return;
    let icon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = logoUrl;
  }, [logoUrl]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      schoolName: data?.schoolName || DEFAULT_SCHOOL_NAME,
      schoolLogoUrl: logoUrl,
      hasCustomLogo,
      updatedAt,
      loading,
      refresh,
    }),
    [data?.schoolName, hasCustomLogo, loading, logoUrl, refresh, updatedAt]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
