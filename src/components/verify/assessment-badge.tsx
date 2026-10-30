"use client";

import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { Assessment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScratchX, Tick } from "@/components/ui/marks";

export type BadgeState = Assessment | "checking" | "queued" | "error" | "unchecked";

export const BADGE_LABEL: Record<BadgeState, string> = {
  promising: "Promising",
  "needs-review": "Needs review",
  "likely-unavailable": "Not recommended",
  checking: "Checking",
  queued: "Queued",
  error: "Check failed",
  unchecked: "Not verified yet",
};

const STYLE: Record<BadgeState, string> = {
  promising: "bg-brand text-ink",
  "needs-review": "bg-warn-soft text-warn ring-1 ring-inset ring-warn/25",
  "likely-unavailable": "bg-bad text-white",
  checking: "bg-peach-soft text-brand-ink ring-1 ring-inset ring-brand/30",
  queued: "bg-sand text-muted",
  error: "bg-sand text-ink-2 ring-1 ring-inset ring-line-strong",
  unchecked: "bg-sand text-muted",
};

/** Verdict badge. Shapes back up colour: tick, half disc, scratched X, spinner. */
export function AssessmentBadge({ state, className }: { state: BadgeState; className?: string }) {
  return (
    <motion.span
      key={state}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 30 }}
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-bold",
        state === "likely-unavailable" ? "uppercase tracking-[0.04em]" : "",
        STYLE[state],
        className,
      )}
    >
      {state === "promising" && <Tick className="size-3" />}
      {state === "likely-unavailable" && <ScratchX className="size-3" />}
      {state === "needs-review" && (
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
          <circle cx="5" cy="5" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1.3a3.7 3.7 0 0 1 0 7.4z" fill="currentColor" />
        </svg>
      )}
      {state === "checking" && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {BADGE_LABEL[state]}
    </motion.span>
  );
}
