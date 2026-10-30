"use client";

import { motion } from "motion/react";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import type { Proficiency, ScopePreference, SkillSelection, TimeBudget } from "@/lib/types";
import { SKILLS, slugifySkill, type SkillKind } from "@/lib/skills";
import { cn } from "@/lib/utils";

export const PROFICIENCY: { value: Proficiency; label: string; hint: string; level: number }[] = [
  { value: "learning", label: "Learning", hint: "Beginner friendly issues", level: 1 },
  { value: "comfortable", label: "Comfortable", hint: "Everyday fixes and features", level: 2 },
  { value: "experienced", label: "Experienced", hint: "Harder, open-ended work", level: 3 },
];

export const TIME: { value: TimeBudget; label: string; hint: string; bar: number }[] = [
  { value: "2-4", label: "2 to 4 hours a week", hint: "Quick fixes and small tasks", bar: 1 },
  { value: "5-8", label: "5 to 8 hours a week", hint: "A focused task each week", bar: 2 },
  { value: "9-15", label: "9 to 15 hours a week", hint: "Room for meatier changes", bar: 3 },
  { value: "15+", label: "15+ hours a week", hint: "Multi-day work is fine", bar: 4 },
];

export const SCOPE: { value: ScopePreference; label: string }[] = [
  { value: "any", label: "No preference" },
  { value: "quick", label: "A quick fix" },
  { value: "few-hours", label: "A few hours" },
  { value: "multi-day", label: "Multiple days" },
];

const GROUPS: { title: string; kinds: SkillKind[] }[] = [
  { title: "Languages", kinds: ["language"] },
  { title: "Frameworks", kinds: ["framework"] },
  { title: "Tools and areas", kinds: ["tool", "domain"] },
];

function Meter({ level, max = 3, on }: { level: number; max?: number; on: boolean }) {
  return (
    <span className="flex items-end gap-[3px]" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={cn("w-1 rounded-full transition-colors", i < level ? (on ? "bg-ink" : "bg-brand") : on ? "bg-ink/20" : "bg-line-strong")} style={{ height: 5 + i * 4 }} />
      ))}
    </span>
  );
}

export function SkillPicker({ value, onChange }: { value: SkillSelection[]; onChange: (v: SkillSelection[]) => void }) {
  const [custom, setCustom] = useState("");
  const selected = new Set(value.map((s) => s.id));
  const toggle = (id: string, label: string, isCustom = false) => {
    if (selected.has(id)) onChange(value.filter((s) => s.id !== id));
    else if (value.length < 12) onChange([...value, { id, label, proficiency: "comfortable", custom: isCustom || undefined }]);
  };
  const addCustom = () => {
    const label = custom.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!label) return;
    const known = SKILLS.find((s) => s.label.toLowerCase() === label.toLowerCase());
    const id = known?.id ?? slugifySkill(label);
    if (!selected.has(id)) toggle(id, known?.label ?? label, !known);
    setCustom("");
  };
  const customs = value.filter((s) => s.custom);

  const chip = (s: { id: string; label: string; custom: boolean }, i: number) => {
    const on = selected.has(s.id);
    return (
      <motion.button
        key={s.id}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(s.id, s.label, s.custom)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i, 14) * 0.02, duration: 0.25 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[11px] border-2 px-3.5 text-[14px] font-bold transition-[background-color,border-color,box-shadow] duration-150",
          on ? "border-ink bg-brand text-ink shadow-[2px_2px_0_var(--ink)]" : "border-line-strong bg-paper text-ink-2 hover:border-ink/40 hover:text-ink",
        )}
      >
        <span className={cn("grid size-4 place-items-center rounded-full transition-colors", on ? "bg-ink text-brand" : "border-2 border-line-strong")} aria-hidden>
          {on && <Check className="size-2.5" strokeWidth={4} />}
        </span>
        {s.label}
      </motion.button>
    );
  };

  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h3 className="mb-2.5 text-[13px] font-bold text-muted">{g.title}</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label={g.title}>
            {SKILLS.filter((s) => g.kinds.includes(s.kind)).map((s, i) => chip({ id: s.id, label: s.label, custom: false }, i))}
          </div>
        </div>
      ))}
      <div>
        <h3 className="mb-2.5 text-[13px] font-bold text-muted">Something else</h3>
        {customs.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{customs.map((c, i) => chip({ id: c.id, label: c.label, custom: true }, i))}</div>}
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <label htmlFor="custom-skill" className="sr-only">
            Add another skill
          </label>
          <input
            id="custom-skill"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Add another, like GraphQL"
            maxLength={40}
            className="h-11 flex-1 rounded-[12px] border-2 border-line-strong bg-paper px-3.5 text-sm font-medium placeholder:font-normal placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <button type="submit" className="inline-flex h-11 items-center gap-1.5 rounded-[12px] border-2 border-ink bg-paper px-4 text-sm font-bold text-ink hover:bg-peach-soft disabled:border-line-strong disabled:text-muted" disabled={!custom.trim()}>
            <Plus className="size-4" aria-hidden /> Add
          </button>
        </form>
      </div>
      <p className="text-[13px] font-semibold text-ink-2">
        <span className="text-brand-ink">{value.length}</span> selected{value.length >= 12 ? ", the maximum" : ""}
      </p>
    </div>
  );
}

export function ProficiencyEditor({ value, onChange, removable }: { value: SkillSelection[]; onChange: (v: SkillSelection[]) => void; removable?: boolean }) {
  const set = (id: string, p: Proficiency) => onChange(value.map((s) => (s.id === id ? { ...s, proficiency: p } : s)));
  return (
    <ul className="space-y-2.5">
      {value.map((s, i) => (
        <motion.li
          key={s.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex flex-col gap-3 rounded-[16px] border border-line bg-paper px-4 py-3.5 shadow-[0_1px_0_rgba(32,24,16,0.04)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
        >
          <span className="flex items-center gap-2.5 font-display text-[16px] font-bold">
            {s.label}
            {s.custom && <span className="rounded-md bg-sand px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">custom</span>}
          </span>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label={`${s.label} proficiency`} className="relative grid grid-cols-3 gap-1 rounded-[12px] bg-sand p-1">
              {PROFICIENCY.map((p) => {
                const on = s.proficiency === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={p.hint}
                    onClick={() => set(s.id, p.value)}
                    onKeyDown={(e) => {
                      const idx = PROFICIENCY.findIndex((x) => x.value === s.proficiency);
                      if (e.key === "ArrowRight") set(s.id, PROFICIENCY[(idx + 1) % 3]!.value);
                      if (e.key === "ArrowLeft") set(s.id, PROFICIENCY[(idx + 2) % 3]!.value);
                    }}
                    tabIndex={on ? 0 : -1}
                    className={cn("relative flex h-9 items-center justify-center gap-2 rounded-[9px] px-3 text-[13px] font-bold transition-colors sm:px-3.5", on ? "text-ink" : "text-muted hover:text-ink")}
                  >
                    {on && <motion.span layoutId={`prof-${s.id}`} className="absolute inset-0 rounded-[9px] bg-brand shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                    <span className="relative z-10 hidden sm:inline-flex">
                      <Meter level={p.level} on={on} />
                    </span>
                    <span className="relative z-10">{p.label}</span>
                  </button>
                );
              })}
            </div>
            {removable && (
              <button type="button" aria-label={`Remove ${s.label}`} onClick={() => onChange(value.filter((x) => x.id !== s.id))} className="grid size-9 place-items-center rounded-[10px] text-muted hover:bg-bad-soft hover:text-bad">
                <X className="size-4" />
              </button>
            )}
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: { value: T; label: string; hint?: string; bar?: number }[];
  value: T;
  onChange: (v: T) => void;
  columns?: 2 | 4;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2.5", columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2")}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") onChange(options[(i + 1) % options.length]!.value);
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") onChange(options[(i - 1 + options.length) % options.length]!.value);
            }}
            className={cn(
              "relative overflow-hidden rounded-[16px] border-2 px-4 py-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
              on ? "border-ink bg-peach shadow-[3px_3px_0_var(--ink)]" : "border-line-strong bg-paper hover:border-ink/40",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold text-ink">{o.label}</span>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-ink bg-brand" : "border-line-strong")} aria-hidden>
                {on && <span className="size-2 rounded-full bg-ink" />}
              </span>
            </span>
            {o.hint && <span className="mt-1 block text-[13px] text-ink-2">{o.hint}</span>}
            {o.bar !== undefined && (
              <span className="mt-3 flex gap-1" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={cn("h-1.5 flex-1 rounded-full", n <= o.bar! ? "bg-brand" : "bg-line-strong/70")} />
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
