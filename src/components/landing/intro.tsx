"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/brand";
import { cn } from "@/lib/utils";

/*
  First-visit intro. Whether it plays is decided before first paint by
  INTRO_BOOT_SCRIPT (rendered inline in the landing page), which sets
  <html data-intro="play">. CSS keeps the overlay hidden otherwise, so returning
  visitors never see a flash. It never plays with prefers-reduced-motion.
  Append ?intro=1 to the URL to replay it.
*/

export const INTRO_KEY = "contribly:intro-seen";

export const INTRO_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var force=/[?&]intro=1(?:&|$)/.test(location.search);var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(force||(!reduce&&!localStorage.getItem('${INTRO_KEY}'))){d.setAttribute('data-intro','play');}}catch(e){}})();`;

export const PHRASES = [
  "Start your first contribution.",
  "Build real-world experience.",
  "Work on projects that matter.",
  "Make your GSoC journey count.",
];

const START_MS = 200; // pause before each phrase starts typing
const CHAR_MS = 31;
const HOLD_MS = 530;
const OUT_MS = 300;
const LAST_HOLD_MS = 700;
const EXIT_MS = 1350;

/*
  The sequence is driven by the clock, not by chained timers, so a slow device
  or a busy main thread drops frames instead of stretching the intro.
  Total: about 9.0s including the exit transition.
*/
type Segment = {
  index: number;
  typeStart: number;
  typeEnd: number;
  outStart: number;
  end: number;
};
const TIMELINE: Segment[] = (() => {
  let t = 0;
  return PHRASES.map((p, index) => {
    const last = index === PHRASES.length - 1;
    const typeStart = t + START_MS;
    const typeEnd = typeStart + p.length * CHAR_MS;
    const outStart = typeEnd + (last ? LAST_HOLD_MS : HOLD_MS);
    const end = last ? outStart : outStart + OUT_MS;
    t = end;
    return { index, typeStart, typeEnd, outStart, end };
  });
})();

type Stage = "typing" | "out" | "exit" | "done";

export function Intro() {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState(0);
  const [stage, setStage] = useState<Stage>("typing");
  const skipRef = useRef<HTMLButtonElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => void>(() => {});

  const finish = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setStage("done");
    document.documentElement.removeAttribute("data-intro");
    setActive(false);
  }, []);

  const exit = useCallback(() => {
    if (exitTimer.current) return;
    stopRef.current();
    setStage("exit");
    exitTimer.current = setTimeout(finish, EXIT_MS);
  }, [finish]);

  // Decide once on mount, from the attribute the boot script set.
  useEffect(() => {
    if (document.documentElement.getAttribute("data-intro") !== "play") return;
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* storage blocked: it may play again next time, which is harmless */
    }
    const t = setTimeout(() => {
      setActive(true);
      skipRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Typing sequence, derived from elapsed time on every frame.
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() - t0;
      const seg = TIMELINE.find((x) => t < x.end) ?? null;
      if (!seg) {
        exit();
        return;
      }
      const len = PHRASES[seg.index]!.length;
      setIndex(seg.index);
      setChars(
        t < seg.typeStart
          ? 0
          : Math.min(len, Math.floor((t - seg.typeStart) / CHAR_MS) + 1),
      );
      setStage((s) =>
        s === "exit" || s === "done" ? s : t >= seg.outStart ? "out" : "typing",
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => cancelAnimationFrame(raf);
    stopRef.current = stop;
    return stop;
  }, [active, exit]);

  // Escape skips; Tab stays on the Skip button while the intro covers the page.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
      if (e.key === "Tab") {
        e.preventDefault();
        skipRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, exit]);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  if (stage === "done") return null;

  const phrase = PHRASES[index]!;
  const exiting = stage === "exit";

  return (
    <div
      className="intro-overlay fixed inset-0 z-[100]"
      role="region"
      aria-label="Contribly introduction"
      data-intro-stage={stage}
    >
      {/* Panel that lifts away to reveal the landing page */}
      <motion.div
        className="absolute inset-0 flex flex-col overflow-hidden bg-canvas"
        initial={false}
        animate={exiting ? { y: "-100%" } : { y: 0 }}
        transition={
          exiting
            ? { duration: 0.9, delay: 0.45, ease: [0.76, 0, 0.24, 1] }
            : { duration: 0 }
        }
      >
        <div aria-hidden className="dot-grid absolute inset-0 opacity-60" />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,53,0.28),transparent)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-56 -left-40 size-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,53,0.14),transparent)]"
        />

        <div className="relative flex items-center gap-2.5 px-6 pt-6 sm:px-10 sm:pt-8">
          <LogoMark />
          <span className="font-display text-[19px] font-bold tracking-[-0.035em]">
            contribly
          </span>
        </div>

        <div className="relative flex flex-1 items-center px-6 sm:px-10 lg:px-20">
          <p className="sr-only">{PHRASES.join(" ")}</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={index}
              aria-hidden
              initial={{ opacity: 0, y: 18 }}
              animate={
                stage === "out"
                  ? { opacity: 0, y: -26, filter: "blur(6px)" }
                  : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              transition={{
                duration: stage === "out" ? OUT_MS / 1000 : 0.4,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="max-w-[16ch] font-display text-[clamp(2.5rem,7.2vw,6rem)] font-bold leading-[0.98] tracking-[-0.045em] text-ink text-balance"
              data-intro-phrase={index}
            >
              {phrase.slice(0, chars)}
              <span className="intro-cursor ml-[0.04em] inline-block h-[0.82em] w-[0.09em] translate-y-[0.08em] rounded-[2px] bg-brand align-baseline" />
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="relative flex items-end justify-between gap-6 px-6 pb-6 sm:px-10 sm:pb-8">
          <ol className="flex w-40 gap-1.5 sm:w-56" aria-hidden>
            {PHRASES.map((p, i) => (
              <li
                key={p}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-strong/70"
              >
                <motion.span
                  className="block h-full origin-left rounded-full bg-brand"
                  initial={false}
                  animate={{
                    scaleX:
                      i < index
                        ? 1
                        : i === index
                          ? chars / PHRASES[i]!.length
                          : 0,
                  }}
                  transition={{ duration: 0.2, ease: "linear" }}
                />
              </li>
            ))}
          </ol>
          <button
            ref={skipRef}
            type="button"
            onClick={() => exit()}
            disabled={exiting}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-[11px] bg-ink px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] transition-[transform,opacity] hover:bg-[#333] active:scale-[0.97]",
              exiting && "opacity-0",
            )}
          >
            Skip intro
            <kbd className="hidden rounded-[5px] bg-white/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white/80 sm:inline">
              Esc
            </kbd>
          </button>
        </div>
      </motion.div>

      {/* Orange sweep that wipes in just before the panel lifts */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 origin-bottom bg-brand"
        initial={{ scaleY: 0 }}
        animate={
          exiting
            ? { scaleY: [0, 1, 1], y: ["0%", "0%", "-100%"] }
            : { scaleY: 0 }
        }
        transition={
          exiting
            ? { duration: 0.95, times: [0, 0.4, 1], ease: [0.76, 0, 0.24, 1] }
            : { duration: 0 }
        }
      />
    </div>
  );
}
