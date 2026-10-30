"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/*
  Hand-drawn editorial marks. Paths are deliberately uneven so they read as an
  annotation made with a marker, not a mechanical line. Stroke width stays
  constant at any size (non-scaling-stroke).
*/

const draw = (delay = 0) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { pathLength: { duration: 0.42, delay, ease: [0.65, 0, 0.35, 1] as const }, opacity: { duration: 0.01, delay } },
});

/** Two crossing strokes drawn over the child: "struck out after review". */
export function Scratch({ children, className, color = "var(--bad)", animate = true }: { children: React.ReactNode; className?: string; color?: string; animate?: boolean }) {
  const reduce = useReducedMotion();
  const anim = animate && !reduce;
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-1 inset-y-0 h-full w-[calc(100%+0.5rem)] overflow-visible">
        <motion.path
          d="M1 13.5 C 18 11.8, 34 12.6, 52 10.2 S 84 8.8, 99 6.4"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          {...(anim ? draw(0.05) : {})}
        />
        <motion.path
          d="M3 7.5 C 22 9.4, 41 9.9, 60 12.2 S 88 14.6, 98 15.4"
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeOpacity="0.85"
          vectorEffect="non-scaling-stroke"
          {...(anim ? draw(0.28) : {})}
        />
      </svg>
    </span>
  );
}

/** Rough underline used beneath warning labels and brand highlights. */
export function Scribble({ className, color = "var(--bad)", animate = true }: { className?: string; color?: string; animate?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <svg aria-hidden viewBox="0 0 120 10" preserveAspectRatio="none" className={cn("block h-2 w-full overflow-visible", className)}>
      <motion.path
        d="M2 6.2 C 22 3.6, 40 7.8, 62 4.9 S 98 3.8, 118 5.6"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        {...(animate && !reduce ? draw(0.1) : {})}
      />
    </svg>
  );
}

/** Small hand-drawn X used inside "Not recommended" badges. */
export function ScratchX({ className, animate = true }: { className?: string; animate?: boolean }) {
  const reduce = useReducedMotion();
  const a = animate && !reduce;
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("size-3", className)}>
      <motion.path d="M2.2 2.6 C 4.6 4.8, 7.2 7.4, 9.8 9.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...(a ? draw(0) : {})} />
      <motion.path d="M9.6 2.2 C 7.4 4.6, 4.9 7.1, 2.4 9.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...(a ? draw(0.18) : {})} />
    </svg>
  );
}

/** Hand-drawn tick for verified positives. */
export function Tick({ className, animate = true }: { className?: string; animate?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("size-3", className)}>
      <motion.path d="M2 6.6c1 .7 1.9 1.6 2.6 2.7C6 6.4 7.7 4.3 10.1 2.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...(animate && !reduce ? draw(0) : {})} />
    </svg>
  );
}

/**
 * Full-title scratch for NOT RECOMMENDED issues. Wraps the whole title text in
 * one inline element; the stroke is a cloned background (see .scratch-text in
 * globals.css), so wrapped titles are struck on every line, edge to edge.
 * Draws in once when `on` becomes true.
 */
export function ScratchTitle({ on, children, className }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("scratch-text", className)} data-on={on ? "true" : "false"} data-scratch-title={on ? "" : undefined}>
      {children}
    </span>
  );
}
