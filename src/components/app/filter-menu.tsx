"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

/** Multi-select popover. Opens with Enter or Space, closes on Escape or outside click. */
export function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
  emptyText = "Nothing to filter yet",
}: {
  label: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (v: T[]) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (ref.current?.querySelector("button") as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => (listRef.current?.querySelector("input") as HTMLInputElement | null)?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors",
          selected.length ? "border-ink bg-ink text-white" : "border-line-strong bg-paper text-ink-2 hover:border-ink/30 hover:text-ink",
        )}
      >
        {label}
        {selected.length > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-md bg-brand px-1 text-[11px] font-bold text-ink">{selected.length}</span>}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            ref={listRef}
            role="group"
            aria-label={`${label} filter`}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-2 max-h-80 w-64 origin-top-left overflow-y-auto rounded-2xl border border-line bg-paper p-1.5 shadow-[var(--shadow-lift)]"
          >
            {options.length === 0 && <p className="px-3 py-2 text-xs text-muted">{emptyText}</p>}
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] hover:bg-peach-soft has-[:focus-visible]:bg-peach-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink">
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(o.value)} />
                  <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-[6px] border-2 transition-colors", on ? "border-brand bg-brand text-ink" : "border-line-strong")} aria-hidden>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.label}</span>
                  <span className="text-xs tabular-nums text-muted">{o.count}</span>
                </label>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
