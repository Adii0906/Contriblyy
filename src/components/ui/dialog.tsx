"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/** Accessible modal: focus moves in, Tab is trapped, Escape and backdrop close, focus returns. */
export function Dialog({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const titleId = labelledBy ?? `${autoId}-title`;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    const t = setTimeout(() => (node?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0])?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-end p-3 sm:place-items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="relative w-full max-w-[440px] overflow-hidden rounded-[24px] border border-line bg-paper shadow-[0_30px_80px_-20px_rgba(32,20,10,0.45)]"
          >
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-[10px] text-muted hover:bg-peach-soft hover:text-ink">
              <X className="size-4" />
            </button>
            {title && (
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
