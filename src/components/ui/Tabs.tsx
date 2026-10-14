"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { prefetchRoute } from "@/lib/api-cache";

export type TabItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon?: LucideIcon;
};

export function Tabs({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="relative flex gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            onMouseEnter={() => prefetchRoute(tab.href)}
            onFocus={() => prefetchRoute(tab.href)}
            className={clsx(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors sm:gap-2 sm:px-4 sm:text-base",
              active ? "text-primary-700" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {active && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5 sm:gap-2">
              {Icon && <Icon className="hidden h-4 w-4 sm:block" />}
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
