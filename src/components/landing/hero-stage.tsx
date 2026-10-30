"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ScratchTitle, ScratchX, Tick } from "@/components/ui/marks";
import { cn } from "@/lib/utils";

/*
  ILLUSTRATION ONLY. Fictional example data, labelled in the UI.
  Phases: 0 discover, 1 verify (checks tick in), 2 a second card is struck out,
  3 recommendation revealed. Loops; reduced motion shows the final frame.
*/

const CHECKS = ["Unassigned", "No claims in 6 comments", "No linked PR", "31 commits in 90 days", "Maintainer replied 2 days ago", "No explicit restriction"];
const STEPS = [
  { name: "Discover", icon: Search },
  { name: "Verify", icon: ShieldCheck },
  { name: "Match", icon: Sparkles },
];

export function HeroStage() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduce) {
      at(0, () => {
        setPhase(3);
        setTicks(CHECKS.length);
      });
      return () => timers.forEach(clearTimeout);
    }
    at(0, () => {
      setPhase(0);
      setTicks(0);
    });
    at(1700, () => setPhase(1));
    CHECKS.forEach((_, i) => at(2100 + i * 520, () => setTicks(i + 1)));
    at(2100 + CHECKS.length * 520 + 300, () => setPhase(2));
    at(2100 + CHECKS.length * 520 + 1800, () => setPhase(3));
    at(2100 + CHECKS.length * 520 + 8400, () => setCycle((c) => c + 1));
    return () => timers.forEach(clearTimeout);
  }, [reduce, cycle]);

  const activeStep = phase === 0 ? 0 : phase < 3 ? 1 : 2;

  return (
    <figure className="relative" aria-label="Illustration of Contribly checking example issues">
      <div className="dot-grid relative overflow-hidden rounded-[26px] border border-line-strong bg-paper/70 p-4 shadow-[var(--shadow-lift)] sm:p-6">
        {/* corner ticks */}
        <span aria-hidden className="absolute left-3 top-3 size-3 border-l-2 border-t-2 border-brand/60" />
        <span aria-hidden className="absolute bottom-3 right-3 size-3 border-b-2 border-r-2 border-brand/60" />

        {/* Step rail */}
        <div className="relative mx-auto mb-5 flex max-w-sm items-center justify-between px-2">
          <svg aria-hidden className="absolute left-[34px] right-[34px] top-1/2 h-1 w-[calc(100%-68px)] -translate-y-1/2 overflow-visible" viewBox="0 0 100 2" preserveAspectRatio="none">
            <line x1="0" y1="1" x2="100" y2="1" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <motion.line x1="0" y1="1" x2="100" y2="1" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={false} animate={{ pathLength: activeStep / 2 }} transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
          {STEPS.map((s, i) => {
            const on = i <= activeStep;
            return (
              <div key={s.name} className="relative z-10 flex flex-col items-center gap-1.5">
                <motion.span
                  animate={{ scale: i === activeStep ? 1.08 : 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("grid size-10 place-items-center rounded-[12px] border-2 transition-colors duration-300", on ? "border-ink bg-brand text-ink" : "border-line-strong bg-paper text-muted")}
                >
                  <s.icon className="size-[18px]" aria-hidden />
                </motion.span>
                <span className={cn("text-[11px] font-bold", on ? "text-ink" : "text-muted")}>{s.name}</span>
              </div>
            );
          })}
        </div>

        <div className="relative flex flex-col gap-3 sm:block sm:min-h-[350px]">
          {/* Struck-out card (behind) */}
          <motion.div
            className="relative w-[94%] self-end rotate-[2deg] rounded-2xl border border-line bg-paper p-4 shadow-[var(--shadow-card)] sm:absolute sm:right-0 sm:top-0 sm:w-[70%] sm:rotate-[3deg]"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: phase >= 0 ? 1 : 0, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-[10.5px] text-muted">example-org/lumen-ui #212</span>
              <AnimatePresence>
                {phase >= 2 && (
                  <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="ml-auto inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-bad px-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.05em] text-white">
                    <ScratchX className="size-2.5" /> Not recommended
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <p className={cn("mt-1.5 font-display text-[14px] font-bold leading-snug transition-colors duration-500", phase >= 2 ? "text-ink/45" : "text-ink")}>
              <ScratchTitle on={phase >= 2}>Focus ring missing on segmented control</ScratchTitle>
            </p>
            <AnimatePresence>
              {phase >= 2 && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-1 text-[11px] font-semibold text-bad">
                  Open pull request already closes this issue
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Main card */}
          <motion.div
            className="relative mb-4 w-full rounded-2xl border border-line bg-paper p-4 pb-10 shadow-[var(--shadow-lift)] sm:absolute sm:bottom-0 sm:left-0 sm:mb-0 sm:w-[84%] sm:p-5 sm:pb-10"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted">example-org/quillnote #184</span>
              <span className="ml-auto inline-flex h-5 items-center rounded-md bg-peach px-1.5 text-[10px] font-bold text-[#8a3510]">Python</span>
              <span className="inline-flex h-5 items-center rounded-md bg-peach px-1.5 text-[10px] font-bold text-[#8a3510]">SQL</span>
            </div>
            <p className="mt-2 font-display text-[16px] font-bold leading-snug tracking-[-0.01em] sm:text-[17px]">Add cursor pagination to the notes API</p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {CHECKS.map((c, i) => {
                const done = i < ticks;
                return (
                  <li key={c} className="flex items-center gap-2 text-[11.5px]">
                    <span className={cn("grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-300", done ? "bg-ok-soft text-ok" : phase === 1 && i === ticks ? "bg-peach text-brand-ink" : "bg-sand text-transparent")}>
                      {done ? <Tick className="size-2.5" /> : phase === 1 && i === ticks ? <span className="size-1.5 animate-ping rounded-full bg-brand" /> : null}
                    </span>
                    <span className={cn("truncate transition-colors duration-300", done ? "text-ink-2" : "text-muted/70")}>{c}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-dashed border-line-strong pt-3">
              <span className="text-[11px] text-muted">Matched to Python and SQL, a few hours of work</span>
              <span className="font-display text-sm font-bold tabular-nums text-ink">82</span>
            </div>

            {/* Recommendation stamp */}
            <AnimatePresence>
              {phase === 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -7 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="absolute -bottom-5 right-4 rounded-[12px] border-[2.5px] border-ink bg-brand px-3 py-1.5 font-display text-[13px] font-bold uppercase tracking-[0.04em] text-ink shadow-[3px_3px_0_var(--ink)]"
                >
                  Recommended
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Floating decorations */}
          <span aria-hidden className="absolute left-[4%] top-[22%] hidden animate-float rounded-lg border border-line bg-paper px-2 py-1 text-[10.5px] font-semibold text-ink-2 shadow-[var(--shadow-card)] sm:inline-flex">
            <span className="mr-1.5 mt-[3px] size-2 rounded-full bg-[#7057ff]" /> good first issue
          </span>
          <span aria-hidden className="absolute bottom-[46%] right-[3%] hidden animate-float-b rounded-lg bg-ink px-2 py-1 font-mono text-[10px] text-white shadow-lg sm:inline-flex">
            6 checks
          </span>
        </div>
      </div>
      <figcaption className="mt-3 flex items-center gap-2 text-xs font-medium text-muted">
        <span className="inline-block size-1.5 rounded-full bg-brand" aria-hidden />
        Illustration with example data, not live GitHub results
      </figcaption>
    </figure>
  );
}
