"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { KeepAlive } from "./KeepAlive";
import { PageMetaProvider, usePageMeta } from "./PageMetaContext";
import { Sidebar } from "./Sidebar";
import { SiteLogos } from "@/components/ui/SiteLogos";
import type { Role } from "@/lib/types";

function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { meta } = usePageMeta();

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 py-3 backdrop-blur-xl lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-soft transition hover:bg-slate-50 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        aria-label="פתח תפריט"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        {meta.title ? (
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{meta.title}</p>
            {meta.subtitle && (
              <p className="truncate text-xs text-slate-500">{meta.subtitle}</p>
            )}
          </div>
        ) : (
          <SiteLogos size="header" />
        )}
      </div>
      {!meta.title && <span className="sr-only">מערכת מעקב בגרות</span>}
    </div>
  );
}

function ShellLayoutInner({
  children,
  role,
}: {
  children: React.ReactNode;
  role: Role;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar
        role={role}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          type="button"
          aria-label="סגור תפריט"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="mr-0 min-h-screen lg:mr-72">
        <MobileHeader onOpenMenu={() => setMobileOpen(true)} />

        <div className="mx-auto max-w-[1400px] p-4 lg:p-8">
          <KeepAlive>{children}</KeepAlive>
        </div>
      </main>
    </div>
  );
}

export function ShellLayout({
  children,
  role,
}: {
  children: React.ReactNode;
  role: Role;
}) {
  return (
    <PageMetaProvider>
      <ShellLayoutInner role={role}>{children}</ShellLayoutInner>
    </PageMetaProvider>
  );
}
