"use client";

import { Search, X } from "lucide-react";
import clsx from "clsx";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "חיפוש...",
  className,
}: SearchInputProps) {
  return (
    <div className={clsx("relative", className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        className="input w-full py-2.5 ps-10 pe-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="נקה חיפוש"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
