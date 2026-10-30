"use client";

import { motion, AnimatePresence } from "motion/react";
import type { CheckKey, CheckRun } from "@/lib/types";
import { CHECK_ORDER } from "@/lib/verify/assess";
import { cn } from "@/lib/utils";
import { CHECK_SHORT, summarize, TONE_COLOR } from "./meta";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Six segments, one per check. A segment takes its colour only when that check
 * has actually reported back from the server; until then it shows a sheen.
 */
export function SignalRail({
  checks,
  scanning,
  size = "md",
  className,
}: {
  checks: Partial<Record<CheckKey, CheckRun<unknown>>>;
  scanning: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-1.5 w-3.5" : "h-[7px] w-5";
  return (
    <div className={cn("flex items-center gap-[3px]", className)} role="list" aria-label="Verification signals">
      {CHECK_ORDER.map((k) => {
        const run = checks[k];
        const s = summarize(k, run);
        const resolved = Boolean(run);
        return (
          <Tooltip key={k} content={`${CHECK_SHORT[k]}: ${resolved ? s.text : scanning ? "checking" : "not verified yet"}`}>
            <span role="listitem" tabIndex={0} aria-label={`${CHECK_SHORT[k]}: ${resolved ? s.text : scanning ? "checking" : "not verified yet"}`} className={cn("relative block overflow-hidden rounded-full bg-idle", dims)}>
              {!resolved && scanning && <span aria-hidden className="absolute inset-y-0 left-0 w-1/2 animate-sheen bg-gradient-to-r from-transparent via-brand/70 to-transparent" />}
              <AnimatePresence>
                {resolved && (
                  <motion.span
                    key={s.tone}
                    aria-hidden
                    className="absolute inset-0 origin-left rounded-full"
                    style={{ background: TONE_COLOR[s.tone], opacity: s.tone === "failed" ? 0.5 : 1 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </AnimatePresence>
              {resolved && s.tone === "failed" && <span aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_2px,rgba(255,255,255,0.8)_2px_4px)]" />}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
