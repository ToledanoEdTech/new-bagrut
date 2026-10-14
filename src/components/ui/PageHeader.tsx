"use client";

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { usePageMeta } from "@/components/layout/PageMetaContext";
import { Breadcrumb, type BreadcrumbItem } from "./Breadcrumb";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  variant?: "default" | "gradient";
  className?: string;
  breadcrumb?: BreadcrumbItem[];
};

export function PageHeader({
  title,
  subtitle,
  children,
  variant = "default",
  className,
  breadcrumb,
}: PageHeaderProps) {
  const { setMeta } = usePageMeta();

  useEffect(() => {
    setMeta({ title, subtitle });
    return () => setMeta({});
  }, [title, subtitle, setMeta]);

  if (variant === "gradient") {
    return (
      <header
        className={clsx(
          "relative -mx-4 -mt-4 overflow-hidden bg-primary-700 px-6 py-9 text-white shadow-glow lg:-mx-8 lg:-mt-8 lg:rounded-b-[2rem] lg:px-9",
          className
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-l from-primary-700 via-brand-700 to-primary-800" />
        <div className="absolute inset-0 bg-mesh-hero opacity-50" />
        <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <p className="mb-2 text-xs font-semibold tracking-wide text-primary-100/80">
            ישיבה תיכונית צביה אלישיב · מערכת מעקב בגרות
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 max-w-2xl text-base text-primary-100/90">{subtitle}</p>
              )}
            </div>
            {children}
          </div>
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="mt-4">
              <Breadcrumb items={breadcrumb} variant="light" />
            </div>
          )}
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        className={clsx(
          "-mx-4 -mt-4 mb-2 border-b border-slate-200/70 bg-white/80 px-6 py-6 backdrop-blur-sm lg:-mx-8 lg:-mt-8 lg:px-8",
          className
        )}
      >
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-400">
          ישיבה תיכונית צביה אלישיב
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-h1 text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-base text-slate-500">{subtitle}</p>}
          </div>
          {children}
        </div>
      </header>
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
    </>
  );
}
