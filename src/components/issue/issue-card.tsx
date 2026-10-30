"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  Archive,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  CircleSlash,
  FileText,
  GitPullRequestArrow,
  MessageSquareWarning,
  ShieldAlert,
  SquareArrowOutUpRight,
  UserRound,
  UserRoundX,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { CheckKey, IssueSummary } from "@/lib/types";
import type { MatchResult } from "@/lib/match/score";
import { useApp, type VerifyState } from "@/lib/client/store";
import { recheck } from "@/lib/client/actions";
import { toggleSave } from "@/lib/client/account";
import { issueKey } from "@/lib/match/rank";
import { CHECK_ORDER } from "@/lib/verify/assess";
import { cn, labelTone, timeAgo } from "@/lib/utils";
import { SignalRail } from "@/components/verify/signal-rail";
import { AssessmentBadge, type BadgeState } from "@/components/verify/assessment-badge";
import { EvidencePanel } from "@/components/verify/evidence-panel";
import { CHECK_SHORT, summarize, TONE_COLOR } from "@/components/verify/meta";
import { deriveWarnings, type CardWarning } from "@/components/verify/warnings";
import { Scratch, ScratchTitle, Scribble, Tick } from "@/components/ui/marks";
import { Tooltip } from "@/components/ui/tooltip";

const ICONS: Record<CheckKey, typeof Activity> = {
  assignment: UserRound,
  claims: MessageSquareWarning,
  prs: GitPullRequestArrow,
  repo: Activity,
  maintainers: Users,
  policy: FileText,
};

const WARN_ICON: Record<CheckKey, typeof Activity> = {
  assignment: CircleSlash,
  claims: MessageSquareWarning,
  prs: GitPullRequestArrow,
  repo: Archive,
  maintainers: UserRoundX,
  policy: ShieldAlert,
};

const TIER_LABEL = { strong: "Strong match", good: "Good match", partial: "Partial match", weak: "Weak match" } as const;

export function badgeStateOf(v: VerifyState | undefined): BadgeState {
  if (!v) return "unchecked";
  if (v.status === "queued") return "queued";
  if (v.status === "running") return "checking";
  if (v.status === "error") return "error";
  return v.verification?.result.assessment ?? "unchecked";
}

/** Match points as a ring. Points come from the real scoring factors. */
function ScoreRing({ match, muted }: { match: MatchResult; muted: boolean }) {
  const reduce = useReducedMotion();
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, match.points)) / 100;
  return (
    <Tooltip content={`Match ${match.points}/100 from skills, level, time and repository activity. Open evidence for the breakdown.`}>
      <div tabIndex={0} className="flex shrink-0 flex-col items-center gap-1 rounded-xl" aria-label={`Match score ${match.points} out of 100, ${TIER_LABEL[match.tier]}`}>
        <div className="relative grid size-[60px] place-items-center">
          <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="26" cy="26" r={r} fill="none" stroke="var(--sand)" strokeWidth="5" />
            <motion.circle
              cx="26"
              cy="26"
              r={r}
              fill="none"
              stroke={muted ? "var(--line-strong)" : "var(--brand)"}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
              animate={{ strokeDashoffset: c * (1 - pct) }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            />
          </svg>
          <span className={cn("font-display text-lg font-bold tabular-nums", muted ? "text-muted" : "text-ink")}>{match.points}</span>
        </div>
        <span className={cn("whitespace-nowrap text-[11px] font-semibold", muted ? "text-muted" : match.tier === "strong" ? "text-brand-ink" : "text-ink-2")}>{TIER_LABEL[match.tier]}</span>
      </div>
    </Tooltip>
  );
}

function WarningNote({ w, index }: { w: CardWarning; index: number }) {
  const Icon = WARN_ICON[w.check];
  const bad = w.severity === "bad";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className={cn("flex gap-3 rounded-xl px-3.5 py-3", bad ? "bg-bad-soft" : "bg-warn-soft")}
      role="note"
    >
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", bad ? "bg-bad text-white" : "bg-warn/15 text-warn")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className={cn("inline-block text-[12px] font-extrabold uppercase tracking-[0.06em]", bad ? "text-bad" : "text-warn")}>
          {w.title}
          {bad && <Scribble className="-mt-0.5" />}
        </p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{w.detail}</p>
      </div>
    </motion.div>
  );
}

function SaveButton({ saved, onClick, title, className }: { saved: boolean; onClick: () => void; title: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
      className={cn("grid size-9 place-items-center rounded-[10px] border transition-colors", saved ? "border-brand bg-brand text-ink" : "border-line text-muted hover:border-ink/30 hover:text-ink", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(saved)} initial={{ scale: 0.5, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 28 }}>
          {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

export function IssueCard({ issue, match, verify, index = 0 }: { issue: IssueSummary; match: MatchResult; verify?: VerifyState; index?: number }) {
  const key = issueKey(issue);
  const [open, setOpen] = useState(false);
  const saved = useApp((s) => Boolean(s.saved[key]));

  const scanning = verify?.status === "running" || verify?.status === "queued";
  const checks = verify?.checks ?? {};
  const state = badgeStateOf(verify);
  const v = verify?.verification;
  const settled = verify?.status === "done";
  const blocked = state === "likely-unavailable";
  const warnings = deriveWarnings(checks);
  const panelId = `evidence-${issue.id}`;
  const save = () => void toggleSave(issue, v);

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-[18px] border bg-paper shadow-[var(--shadow-card)] transition-[box-shadow,border-color] duration-200",
        blocked ? "border-bad/25" : state === "promising" ? "border-line hover:border-brand/50 hover:shadow-[var(--shadow-lift)]" : "border-line hover:border-line-strong",
      )}
      aria-labelledby={`title-${issue.id}`}
    >
      {/* Status rail: orange promising, amber review, hatched red when not recommended */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[5px] bg-line",
          state === "promising" && "bg-brand",
          state === "needs-review" && "bg-[#e9b45c]",
          blocked && "bg-[repeating-linear-gradient(135deg,var(--bad)_0_4px,#f6b4ae_4px_8px)]",
          (state === "checking" || state === "queued") && "bg-peach",
        )}
      />
      {verify?.status === "running" && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-brand to-transparent" />
        </span>
      )}

      <div className="relative flex gap-5 py-5 pl-6 pr-5 sm:pl-8 sm:pr-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <a href={issue.repo.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[12px] text-muted hover:text-ink">
              {issue.repo.fullName} <span className="opacity-80">#{issue.number}</span>
            </a>
            <AssessmentBadge state={state} />
            <span className={cn("ml-auto rounded-[8px] px-2 py-0.5 text-[12px] font-bold tabular-nums sm:hidden", blocked ? "bg-sand text-muted" : "bg-peach-soft text-brand-ink")} aria-label={`Match score ${match.points} out of 100`}>
              {match.points} match
            </span>
          </div>

          <h3 id={`title-${issue.id}`} className={cn("mt-2 font-display text-[19px] font-bold leading-[1.25] tracking-[-0.02em] text-pretty sm:text-[21px]", blocked ? "text-ink/55" : "text-ink")}>
            <a href={issue.url} target="_blank" rel="noreferrer" className="decoration-brand decoration-2 underline-offset-4 hover:underline">
              <ScratchTitle on={blocked}>{issue.title}</ScratchTitle>
            </a>
          </h3>

          <p className={cn("mt-2 max-w-[68ch] text-[14px] leading-relaxed", blocked ? "text-muted" : "text-ink-2")}>{match.explanation}</p>

          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {match.matched.map((h) => (
              <span key={h.skill.id} className={cn("inline-flex h-[26px] items-center rounded-[8px] px-2.5 text-[12px] font-bold", blocked ? "bg-sand text-muted" : "bg-peach text-[#8a3510]")}>
                {h.skill.label}
              </span>
            ))}
            {issue.labels.slice(0, 4).map((l) => (
              <span key={l.name} className="inline-flex h-[26px] max-w-44 items-center gap-1.5 rounded-[8px] border border-line px-2 text-[12px] font-medium text-ink-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: labelTone(l.color).dot }} aria-hidden />
                <span className="truncate">{l.name}</span>
              </span>
            ))}
            {issue.labels.length > 4 && <span className="text-xs text-muted">+{issue.labels.length - 4}</span>}
          </div>

          {settled && warnings.length > 0 && (
            <div className="mt-4 grid gap-2">
              {warnings.slice(0, 2).map((w, i) => <WarningNote key={w.check} w={w} index={i} />)}
              {warnings.length > 2 && <p className="text-xs text-muted">+{warnings.length - 2} more in evidence</p>}
            </div>
          )}
        </div>

        <div className="hidden flex-col items-end justify-between gap-4 sm:flex">
          <Tooltip content={saved ? "Remove from saved" : "Save issue"}>
            <SaveButton saved={saved} onClick={save} title={issue.title} />
          </Tooltip>
          <ScoreRing match={match} muted={blocked} />
        </div>
      </div>

      {/* Check strip */}
      <div className="ml-[5px] grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {CHECK_ORDER.map((k) => {
          const s = summarize(k, checks[k]);
          const Icon = ICONS[k];
          const resolved = Boolean(checks[k]);
          return (
            <div key={k} className="bg-paper px-4 py-3 sm:px-5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <Icon className="size-3.5" aria-hidden />
                {s.tone === "bad" && resolved ? <Scratch>{CHECK_SHORT[k]}</Scratch> : CHECK_SHORT[k]}
              </div>
              <div
                className="mt-1 flex items-start gap-1.5 text-[13px] font-semibold leading-snug"
                style={{ color: s.tone === "pending" ? "var(--muted)" : s.tone === "neutral" || s.tone === "failed" ? "var(--ink-2)" : TONE_COLOR[s.tone] }}
              >
                {resolved && s.tone === "ok" && <Tick className="mt-[3px] size-3 shrink-0" />}
                {resolved ? s.text : scanning ? <span className="skeleton mt-1 block h-3 w-20" /> : <span className="font-medium">Not verified yet</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-[#fffcf8] px-4 py-2.5 sm:px-5">
        <SignalRail checks={checks} scanning={scanning} size="sm" />
        <span className="text-xs text-muted">{scanning ? "Verifying" : v ? `Checked ${timeAgo(v.checkedAt)}${v.cached ? " (cached)" : ""}` : "Not verified yet"}</span>
        <div className="ml-auto flex items-center gap-1">
          <SaveButton saved={saved} onClick={save} title={issue.title} className="size-8 sm:hidden" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-peach-soft hover:text-ink"
          >
            {open ? "Hide evidence" : "Show evidence"}
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
              <ChevronDown className="size-4" />
            </motion.span>
          </button>
          <a href={issue.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink hover:bg-peach-soft">
            View on GitHub <SquareArrowOutUpRight className="size-3.5" />
          </a>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <EvidencePanel
              checks={checks}
              result={settled ? v?.result : undefined}
              match={match}
              checkedAt={settled ? v?.checkedAt : undefined}
              cached={settled ? v?.cached : undefined}
              scanning={scanning}
              error={verify?.status === "error" ? verify.error : undefined}
              onRecheck={() => recheck(issue)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export function IssueCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-paper shadow-[var(--shadow-card)]" aria-hidden>
      <div className="flex gap-5 py-5 pl-8 pr-6">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="skeleton h-3 w-44" />
            <div className="skeleton h-6 w-24 rounded-lg" />
          </div>
          <div className="skeleton mt-3.5 h-6 w-3/4" />
          <div className="skeleton mt-3 h-3 w-full max-w-xl" />
          <div className="skeleton mt-2 h-3 w-2/3 max-w-md" />
          <div className="mt-4 flex gap-2">
            <div className="skeleton h-6 w-16 rounded-lg" />
            <div className="skeleton h-6 w-24 rounded-lg" />
            <div className="skeleton h-6 w-20 rounded-lg" />
          </div>
        </div>
        <div className="skeleton hidden size-[60px] rounded-full sm:block" />
      </div>
      <div className="h-[62px] border-t border-line bg-[#fffcf8]" />
    </div>
  );
}
