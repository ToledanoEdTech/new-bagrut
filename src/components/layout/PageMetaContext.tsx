"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PageMeta = {
  title?: string;
  subtitle?: string;
};

type PageMetaContextValue = {
  meta: PageMeta;
  setMeta: (meta: PageMeta) => void;
};

const PageMetaContext = createContext<PageMetaContextValue | null>(null);

export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({});
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <PageMetaContext.Provider value={value}>{children}</PageMetaContext.Provider>;
}

export function usePageMeta() {
  const ctx = useContext(PageMetaContext);
  if (!ctx) throw new Error("usePageMeta must be used within PageMetaProvider");
  return ctx;
}

/** Register page title/subtitle for mobile shell header */
export function useRegisterPageMeta(meta: PageMeta) {
  const { setMeta } = usePageMeta();

  useEffect(() => {
    setMeta(meta);
    return () => setMeta({});
  }, [meta.title, meta.subtitle, setMeta]);
}
