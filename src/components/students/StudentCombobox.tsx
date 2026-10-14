"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import clsx from "clsx";

export type ComboboxStudent = {
  id: string;
  user: { name: string };
  class: { name: string };
};

type StudentComboboxProps = {
  students: ComboboxStudent[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
};

export function StudentCombobox({
  students,
  selectedId,
  onSelect,
  placeholder = "חיפוש תלמיד לפי שם או כיתה...",
  className,
}: StudentComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return students;
    return students.filter(
      (s) => s.user.name.includes(q) || s.class.name.includes(q)
    );
  }, [students, query]);

  // Reset highlight to the top whenever the result set changes.
  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function choose(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[highlight];
      if (pick) choose(pick.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          className="input w-full py-2.5 ps-10 pe-10"
          value={open ? query : selected ? `${selected.user.name} · ${selected.class.name}` : query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="student-combobox-list"
          aria-autocomplete="list"
        />
        {selected && !open ? (
          <button
            type="button"
            onClick={() => {
              onSelect("");
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="נקה בחירה"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown
            className={clsx(
              "pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </div>

      {open && (
        <ul
          ref={listRef}
          id="student-combobox-list"
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">לא נמצאו תלמידים</li>
          ) : (
            results.map((s, i) => {
              const isActive = i === highlight;
              const isSelected = s.id === selectedId;
              return (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setHighlight(i)}
                  onClick={() => choose(s.id)}
                  className={clsx(
                    "flex cursor-pointer items-center justify-between gap-2 px-4 py-2 text-sm",
                    isActive ? "bg-primary-50 text-primary-900" : "text-slate-700"
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{s.user.name}</span>
                    <span className="text-slate-400"> · {s.class.name}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
