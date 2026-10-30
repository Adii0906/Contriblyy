"use client";

import { motion } from "motion/react";
import { Search, ShieldCheck, Sparkles } from "lucide-react";

const STAGES = [
  { n: "01", name: "Discover", icon: Search, body: "Searches GitHub with your languages, frameworks and level. Not limited to Hacktoberfest or good-first-issue labels." },
  { n: "02", name: "Verify", icon: ShieldCheck, body: "Reads assignees, comment claims, linked pull requests, repository and maintainer activity, and contribution rules." },
  { n: "03", name: "Match", icon: Sparkles, body: "Ranks what is left by your skills, proficiency and weekly time, and explains every recommendation." },
];

export function Workflow() {
  return (
    <ol className="relative grid gap-5 md:grid-cols-3">
      {/* Flowing connector behind the cards (desktop) */}
      <svg aria-hidden className="pointer-events-none absolute left-[16%] right-[16%] top-[52px] hidden h-4 w-[68%] md:block" viewBox="0 0 100 4" preserveAspectRatio="none">
        <motion.path
          d="M0 2 L100 2"
          stroke="var(--brand)"
          strokeWidth="3"
          strokeDasharray="6 7"
          vectorEffect="non-scaling-stroke"
          fill="none"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-20%" }}
          transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
      {STAGES.map((s, i) => (
        <motion.li
          key={s.n}
          className="relative rounded-[22px] border border-line bg-paper p-6 shadow-[var(--shadow-card)] sm:p-7"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ delay: 0.2 + i * 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between">
            <span className="grid size-12 place-items-center rounded-[14px] border-2 border-ink bg-brand text-ink shadow-[3px_3px_0_var(--ink)]">
              <s.icon className="size-5" aria-hidden />
            </span>
            <span className="font-display text-5xl font-bold leading-none tracking-[-0.04em] text-peach">{s.n}</span>
          </div>
          <h3 className="mt-6 font-display text-[26px] font-bold tracking-[-0.03em]">{s.name}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}
