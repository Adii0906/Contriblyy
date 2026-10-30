"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Info } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { Tick } from "./marks";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-16 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="pointer-events-auto inline-flex max-w-md items-center gap-2.5 rounded-[14px] bg-ink px-4 py-3 text-left text-sm font-semibold text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]"
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", t.tone === "ok" ? "bg-brand text-ink" : t.tone === "bad" ? "bg-bad text-white" : "bg-white/15 text-white")}>
              {t.tone === "ok" ? <Tick className="size-3" /> : t.tone === "bad" ? <CircleAlert className="size-3.5" aria-hidden /> : <Info className="size-3.5" aria-hidden />}
            </span>
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
