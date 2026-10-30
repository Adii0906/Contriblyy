"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScopePreference, SkillSelection, TimeBudget } from "@/lib/types";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { OptionGroup, ProficiencyEditor, SCOPE, SkillPicker, TIME } from "@/components/profile/editors";
import { useApp } from "@/lib/client/store";
import { runDiscover } from "@/lib/client/actions";
import { issueKey } from "@/lib/match/rank";
import { querySkillName } from "@/lib/client/skill-name";
import { TestModeBanner } from "@/components/app/test-mode-banner";
import { cn } from "@/lib/utils";

const STEPS = [
  { name: "Skills", hint: "What you work with" },
  { name: "Proficiency", hint: "How well you know each" },
  { name: "Time", hint: "Hours you can give" },
  { name: "Discover", hint: "Search and verify" },
] as const;

export default function Onboarding() {
  const router = useRouter();
  const existing = useApp((s) => s.profile);
  const hydrated = useApp((s) => s.hydrated);
  const setProfile = useApp((s) => s.setProfile);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [skills, setSkills] = useState<SkillSelection[]>([]);
  const [time, setTime] = useState<TimeBudget>("5-8");
  const [scope, setScope] = useState<ScopePreference>("any");
  const [seeded, setSeeded] = useState(false);

  // Prefill from an existing guest profile once storage has loaded.
  if (hydrated && !seeded) {
    setSeeded(true);
    if (existing) {
      setSkills(existing.skills);
      setTime(existing.time);
      setScope(existing.scope);
    }
  }

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const start = () => {
    setProfile({ skills, time, scope, updatedAt: new Date().toISOString() });
    go(3);
    void runDiscover("recommended");
  };

  const canNext = step === 0 ? skills.length > 0 : true;

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <TestModeBanner />
      <div aria-hidden className="pointer-events-none absolute -right-48 -top-40 size-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,53,0.18),transparent)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
        <Link href={existing ? "/app" : "/"} className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-2 hover:text-ink">
          {existing ? "Back to dashboard" : "Cancel"}
        </Link>
      </header>

      <main className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-24 sm:px-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14">
        {/* Step rail */}
        <ol className="flex gap-2 lg:sticky lg:top-8 lg:h-fit lg:flex-col lg:gap-1" aria-label="Onboarding progress">
          {STEPS.map((s, i) => {
            const done = i < step;
            const on = i === step;
            return (
              <li key={s.name} aria-current={on ? "step" : undefined} className="flex-1 lg:flex-none">
                <div className={cn("flex items-center gap-3 rounded-[14px] px-0 py-0 lg:px-3 lg:py-2.5", on && "lg:bg-paper lg:shadow-[var(--shadow-card)]")}>
                  <span className={cn("hidden size-8 shrink-0 place-items-center rounded-[10px] border-2 font-display text-sm font-bold lg:grid", done ? "border-ink bg-ink text-white" : on ? "border-ink bg-brand text-ink" : "border-line-strong text-muted")}>
                    {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="w-full lg:w-auto">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line lg:hidden">
                      <motion.div className="h-full bg-brand" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
                    </div>
                    <p className={cn("mt-1.5 text-xs font-bold lg:mt-0 lg:text-[14px]", on || done ? "text-ink" : "text-muted")}>{s.name}</p>
                    <p className="hidden text-xs text-muted lg:block">{s.hint}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -30 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              aria-labelledby={`step-${step}`}
            >
              {step === 0 && (
                <>
                  <StepHead id="step-0" n={1} title="What do you work with?" body="Pick languages, frameworks and areas. You can change them any time." />
                  <SkillPicker value={skills} onChange={setSkills} />
                </>
              )}
              {step === 1 && (
                <>
                  <StepHead id="step-1" n={2} title="How well do you know each one?" body="Each skill gets its own level, so learning Go and being experienced in Python lead to different issues." />
                  <ProficiencyEditor value={skills} onChange={setSkills} />
                </>
              )}
              {step === 2 && (
                <>
                  <StepHead id="step-2" n={3} title="How much time can you give?" body="Used to favour issues that fit your week. When an issue's size is unclear, we say so instead of guessing." />
                  <OptionGroup label="Weekly availability" options={TIME} value={time} onChange={setTime} />
                  <h3 className="mb-3 mt-9 text-sm font-bold text-ink-2">Preferred task size (optional)</h3>
                  <OptionGroup label="Preferred task size" options={SCOPE} value={scope} onChange={setScope} columns={4} />
                </>
              )}
              {step === 3 && <DiscoverStep onDone={() => router.push("/app/recommended")} onBack={() => go(2)} />}
            </motion.section>
          </AnimatePresence>

          {step < 3 && (
            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
              <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0} className={cn(step === 0 && "invisible")}>
                <ArrowLeft /> Back
              </Button>
              {step < 2 ? (
                <Button variant="primary" size="lg" onClick={() => go(step + 1)} disabled={!canNext}>
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button variant="primary" size="lg" onClick={start}>
                  Find my issues <ArrowRight />
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StepHead({ id, n, title, body }: { id: string; n: number; title: string; body: string }) {
  return (
    <div className="mb-8">
      <p className="text-[13px] font-bold text-brand-ink">Step {n} of 4</p>
      <h1 id={id} className="mt-1.5 font-display text-[clamp(2rem,4vw,2.8rem)] font-bold leading-[1.05] tracking-[-0.04em]">
        {title}
      </h1>
      <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}

function DiscoverStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const run = useApp((s) => s.runs.recommended);
  const verify = useApp((s) => s.verify);
  const profile = useApp((s) => s.profile);

  const stats = useMemo(() => {
    const states = run.issues.map(issueKey).map((k) => verify[k]);
    return {
      total: states.length,
      done: states.filter((s) => s?.status === "done").length,
      failed: states.filter((s) => s?.status === "error").length,
      promising: states.filter((s) => s?.verification?.result.assessment === "promising").length,
      partialChecks: states.filter((s) => s?.verification && s.verification.result.incomplete.length > 0).length,
    };
  }, [run.issues, verify]);

  const searching = run.status === "loading";
  const searchDone = run.status === "ready";
  const verifyDone = searchDone && stats.total > 0 && stats.done + stats.failed >= stats.total;

  // Move on automatically once every check has reported back.
  useEffect(() => {
    if (verifyDone) {
      const t = setTimeout(onDone, 1400);
      return () => clearTimeout(t);
    }
  }, [verifyDone, onDone]);

  return (
    <div>
      <StepHead id="step-3" n={4} title={verifyDone ? "Your matches are ready." : "Searching and checking GitHub."} body="Every result is checked for assignment, comment claims, linked pull requests, repository and maintainer activity, and contribution policy." />

      <ol className="space-y-3">
        <ProgressRow
          state={searching ? "running" : run.status === "error" ? "error" : searchDone ? "done" : "idle"}
          title="Search GitHub"
          detail={
            searching
              ? `Running searches for ${profile?.skills.length ?? 0} skills`
              : run.status === "error"
                ? run.error?.message
                : searchDone
                  ? `${stats.total} issue${stats.total === 1 ? "" : "s"} found${run.partial ? ", some searches failed" : ""}`
                  : ""
          }
        >
          {searchDone && run.queries.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {run.queries.map((q) => (
                <li key={q.skillId} className={cn("rounded-[8px] px-2 py-1 text-xs font-semibold", q.ok ? "bg-sand text-ink-2" : "bg-bad-soft text-bad")} title={q.error}>
                  {querySkillName(q.skillId, profile)} {q.ok ? `(${q.total ?? 0})` : "failed"}
                </li>
              ))}
            </ul>
          )}
        </ProgressRow>
        <ProgressRow
          state={!searchDone ? "idle" : stats.total === 0 ? "skipped" : verifyDone ? "done" : "running"}
          title="Verify each issue"
          detail={searchDone ? (stats.total === 0 ? "Nothing to verify" : `${stats.done + stats.failed} of ${stats.total} checked${stats.failed ? `, ${stats.failed} could not be checked` : ""}${stats.partialChecks ? `, ${stats.partialChecks} with incomplete checks` : ""}`) : ""}
        >
          {searchDone && stats.total > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand">
              <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${((stats.done + stats.failed) / stats.total) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
          )}
        </ProgressRow>
        <ProgressRow state={verifyDone ? "done" : "idle"} title="Rank by skills and time" detail={verifyDone ? `${stats.promising} promising with no major blocking signals` : ""} />
      </ol>

      {run.status === "error" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void runDiscover("recommended")}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Change preferences
          </Button>
        </div>
      )}
      {searchDone && stats.total === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-paper p-5 text-sm text-ink-2">
          No open, unassigned issues matched these skills in the last few months. Add a broader skill or loosen the task size, then search again.
          <div className="mt-3">
            <Button size="sm" onClick={onBack}>
              Change preferences
            </Button>
          </div>
        </div>
      )}
      {searchDone && stats.total > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" onClick={onDone}>
            {verifyDone ? "Open my recommendations" : "See results as they arrive"} <ArrowRight />
          </Button>
          {!verifyDone && <span className="text-sm text-muted">Checks keep running on the dashboard.</span>}
        </div>
      )}
    </div>
  );
}

function ProgressRow({ state, title, detail, children }: { state: "idle" | "running" | "done" | "error" | "skipped"; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <li className={cn("flex gap-4 rounded-[18px] border bg-paper px-5 py-4 shadow-[var(--shadow-card)] transition-colors", state === "running" ? "border-brand/50" : "border-line")}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center" aria-hidden>
        {state === "running" && (
          <span className="grid size-8 place-items-center rounded-[10px] bg-peach">
            <Loader2 className="size-4 animate-spin text-brand-ink" />
          </span>
        )}
        {state === "done" && (
          <motion.span initial={{ scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="grid size-8 place-items-center rounded-[10px] bg-ink text-brand">
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        )}
        {state === "error" && (
          <span className="grid size-8 place-items-center rounded-[10px] bg-bad text-white">
            <TriangleAlert className="size-4" />
          </span>
        )}
        {(state === "idle" || state === "skipped") && <span className="size-8 rounded-[10px] border-2 border-dashed border-line-strong" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("font-display text-[16px] font-bold", state === "idle" ? "text-muted" : "text-ink")}>{title}</div>
        {detail && (
          <div className={cn("mt-0.5 text-sm", state === "error" ? "font-semibold text-bad" : "text-ink-2")} role={state === "error" ? "alert" : undefined}>
            {detail}
          </div>
        )}
        {children}
      </div>
      <span className="sr-only" aria-live="polite">
        {title}: {state}
      </span>
    </li>
  );
}
