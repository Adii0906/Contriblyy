"use client";

import { AnimatePresence, motion } from "motion/react";
import { MessageSquareWarning, UserRoundX } from "lucide-react";
import { useState } from "react";
import { Scratch, ScratchTitle, Scribble, ScratchX, Tick } from "@/components/ui/marks";
import { cn } from "@/lib/utils";

/* ILLUSTRATION ONLY: three fictional outcomes for the same kind of issue. */

type Tone = "ok" | "warn" | "bad";
interface Scenario {
  id: string;
  tab: string;
  badge: string;
  badgeCls: string;
  title: string;
  repo: string;
  checks: { label: string; value: string; tone: Tone }[];
  warning?: { title: string; detail: string; tone: "warn" | "bad"; icon: typeof UserRoundX };
  verdict: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "promising",
    tab: "Promising",
    badge: "Promising",
    badgeCls: "bg-brand text-ink",
    title: "Add retry with backoff to the webhook sender",
    repo: "example-org/inkwell #77",
    checks: [
      { label: "Assignment", value: "Unassigned", tone: "ok" },
      { label: "Claims", value: "No claims found", tone: "ok" },
      { label: "Pull requests", value: "No linked PR", tone: "ok" },
      { label: "Maintainers", value: "Maintainers active", tone: "ok" },
    ],
    verdict: "No major blocking signals in the checks performed.",
  },
  {
    id: "review",
    tab: "Needs review",
    badge: "Needs review",
    badgeCls: "bg-warn-soft text-warn ring-1 ring-inset ring-warn/25",
    title: "Support custom date formats in the CSV exporter",
    repo: "example-org/ledgerline #301",
    checks: [
      { label: "Assignment", value: "Unassigned", tone: "ok" },
      { label: "Claims", value: "Possible claim", tone: "warn" },
      { label: "Pull requests", value: "No linked PR", tone: "ok" },
      { label: "Maintainers", value: "Some maintainer activity", tone: "ok" },
    ],
    warning: { title: "Possible claim", detail: "@sam-k asked to work on it 9 days ago. Ask on the thread first.", tone: "warn", icon: MessageSquareWarning },
    verdict: "Someone may be on it. Worth a comment before you start.",
  },
  {
    id: "blocked",
    tab: "Not recommended",
    badge: "Not recommended",
    badgeCls: "bg-bad text-white uppercase tracking-[0.04em]",
    title: "Migrate settings page to the new form library",
    repo: "example-org/harbor #58",
    checks: [
      { label: "Assignment", value: "Unassigned", tone: "ok" },
      { label: "Claims", value: "No claims found", tone: "ok" },
      { label: "Pull requests", value: "Open PR linked", tone: "bad" },
      { label: "Maintainers", value: "Maintainer inactive", tone: "bad" },
    ],
    warning: { title: "Maintainer inactive", detail: "No maintainer comments in the last 90 days, and an open PR already closes this issue.", tone: "bad", icon: UserRoundX },
    verdict: "GitHub still shows it as open and unassigned.",
  },
];

const toneColor: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };

export function VerificationDemo() {
  const [active, setActive] = useState(SCENARIOS[2]!.id);
  const s = SCENARIOS.find((x) => x.id === active)!;
  const blocked = s.id === "blocked";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
      <div>
        <div role="tablist" aria-label="Example outcomes" className="inline-flex flex-wrap gap-1 rounded-[14px] border border-line-strong bg-paper p-1">
          {SCENARIOS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={active === x.id}
              aria-controls="demo-card"
              onClick={() => setActive(x.id)}
              className={cn("relative h-9 rounded-[10px] px-3.5 text-[13px] font-bold transition-colors", active === x.id ? "text-ink" : "text-muted hover:text-ink")}
            >
              {active === x.id && <motion.span layoutId="demo-tab" className="absolute inset-0 -z-0 rounded-[10px] bg-peach" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative z-10">{x.tab}</span>
            </button>
          ))}
        </div>
        <ul className="mt-7 space-y-4 text-[15px] leading-relaxed text-ink-2">
          <li className="flex gap-3">
            <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Tick className="size-3" /></span>
            Green only appears when a check returned a positive result.
          </li>
          <li className="flex gap-3">
            <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-bad-soft text-bad"><ScratchX className="size-2.5" animate={false} /></span>
            Red marks are drawn only when a check returns blocking evidence, never as decoration.
          </li>
          <li className="flex gap-3">
            <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-sand text-muted text-[11px] font-bold">?</span>
            A check that has not reported says &ldquo;Not verified yet&rdquo;.
          </li>
        </ul>
      </div>

      <div id="demo-card" role="tabpanel" className="relative">
        <span className="absolute -top-7 right-0 text-xs font-medium text-muted">Example data</span>
        <AnimatePresence mode="wait">
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 10, rotate: -0.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={cn("relative overflow-hidden rounded-[20px] border bg-paper shadow-[var(--shadow-lift)]", blocked ? "border-bad/25" : "border-line")}
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[5px]", s.id === "promising" ? "bg-brand" : s.id === "review" ? "bg-[#e9b45c]" : "bg-[repeating-linear-gradient(135deg,var(--bad)_0_4px,#f6b4ae_4px_8px)]")} />
            <div className="py-5 pl-7 pr-5 sm:pl-8 sm:pr-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs text-muted">{s.repo}</span>
                <span className={cn("inline-flex h-[26px] items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-bold", s.badgeCls)}>
                  {s.id === "promising" && <Tick />}
                  {blocked && <ScratchX />}
                  {s.badge}
                </span>
              </div>
              <p className={cn("mt-2 font-display text-[21px] font-bold leading-snug tracking-[-0.02em]", blocked ? "text-ink/55" : "text-ink")}><ScratchTitle on={blocked}>{s.title}</ScratchTitle></p>
              <p className="mt-1.5 text-sm text-ink-2">{s.verdict}</p>
              {s.warning && (
                <div className={cn("mt-4 flex gap-3 rounded-xl px-3.5 py-3", s.warning.tone === "bad" ? "bg-bad-soft" : "bg-warn-soft")}>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", s.warning.tone === "bad" ? "bg-bad text-white" : "bg-warn/15 text-warn")}>
                    <s.warning.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className={cn("inline-block text-[12px] font-extrabold uppercase tracking-[0.06em]", s.warning.tone === "bad" ? "text-bad" : "text-warn")}>
                      {s.warning.title}
                      {s.warning.tone === "bad" && <Scribble className="-mt-0.5" />}
                    </p>
                    <p className="mt-0.5 text-[13.5px] text-ink-2">{s.warning.detail}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="ml-[5px] grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
              {s.checks.map((c, i) => (
                <div key={c.label} className="bg-paper px-4 py-3">
                  <div className="text-[11px] font-semibold text-muted">{c.tone === "bad" ? <Scratch>{c.label}</Scratch> : c.label}</div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.07 }} className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: toneColor[c.tone] }}>
                    {c.tone === "ok" && <Tick />}
                    {c.value}
                  </motion.div>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
