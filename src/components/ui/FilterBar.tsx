"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Filter, X, ChevronDown } from "lucide-react";
import { Button } from "./Button";
import { SearchInput } from "./SearchInput";

type FilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Quick toggles always visible (e.g. candidate filters) */
  quickFilters?: ReactNode;
  /** Advanced filters shown behind "סינון" */
  children?: ReactNode;
  activeFilterCount?: number;
  onClear?: () => void;
  className?: string;
  /** Start with advanced filters expanded */
  defaultExpanded?: boolean;
};

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "חיפוש...",
  quickFilters,
  children,
  activeFilterCount = 0,
  onClear,
  className,
  defaultExpanded = false,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || activeFilterCount > 0);
  const hasAdvanced = !!children;

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="max-w-md flex-1"
        />
        {quickFilters}
        {hasAdvanced && (
          <Button
            type="button"
            variant={expanded || activeFilterCount > 0 ? "primary" : "secondary"}
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <Filter className="h-4 w-4" />
            סינון
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown
              className={clsx("h-4 w-4 transition-transform", expanded && "rotate-180")}
            />
          </Button>
        )}
        {onClear && (activeFilterCount > 0 || !!search.trim()) && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
            נקה
          </Button>
        )}
      </div>

      {hasAdvanced && expanded && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 p-3">
          {children}
        </div>
      )}
    </div>
  );
}
