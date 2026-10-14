"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";

export type SubjectGroupOption = {
  key: string;
  name: string;
};

export function SubjectGroupPicker({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: SubjectGroupOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedSet = new Set(selected);
  const allSelected = options.length > 0 && selected.length === options.length;
  const noneSelected = selected.length === 0;

  function toggle(key: string) {
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  function selectAll() {
    onChange(options.map((o) => o.key));
  }

  function clearAll() {
    onChange([]);
  }

  const label = noneSelected
    ? "כל המקצועות"
    : selected.length === 1
      ? options.find((o) => o.key === selected[0])?.name ?? "מקצוע אחד"
      : `${selected.length} מקצועות`;

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="label">מקצועות להצגה</label>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 shadow-soft transition",
          "hover:border-primary-200 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary-300 ring-2 ring-primary-100"
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={clsx("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
              בחר הכל
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={noneSelected}
            >
              <X className="h-3.5 w-3.5" />
              נקה
            </Button>
          </div>
          <ul
            role="listbox"
            aria-multiselectable
            className="max-h-56 overflow-y-auto py-1"
          >
            {options.map((opt) => {
              const checked = selectedSet.has(opt.key);
              return (
                <li key={opt.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(opt.key)}
                    className={clsx(
                      "flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition",
                      checked
                        ? "bg-primary-50 font-medium text-primary-800"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={clsx(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-primary-600 bg-primary-600 text-white"
                          : "border-slate-300 bg-white"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{opt.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {allSelected && (
            <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              כל המקצועות נבחרו
            </p>
          )}
        </div>
      )}
    </div>
  );
}
