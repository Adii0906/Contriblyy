"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownWideNarrow, BookmarkPlus, Clock, RefreshCw, Search, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApp, type Filters, type RunKind, type StatusFilter } from "@/lib/client/store";
import { enqueueVerification, runDiscover } from "@/lib/client/actions";
import { filterCount, useRankedRun, type RankedRow } from "@/lib/client/use-ranked";
import { getSkill } from "@/lib/skills";
import { querySkillName } from "@/lib/client/skill-name";
import { IssueCard, IssueCardSkeleton } from "@/components/issue/issue-card";
import { FilterMenu, type FilterOption } from "./filter-menu";
import { EmptySearchArt, ErrorArt } from "./illustrations";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

/* ---------------- header pieces ---------------- */

export function PageHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div>
      {eyebrow && <p className="mb-2 text-[14px] font-semibold text-brand-ink">{eyebrow}</p>}
      <h1 className="font-display text-[clamp(2rem,4vw,2.9rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance">{title}</h1>
      {children && <div className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

/** Profile skills as toggle chips that filter the feed. */
export function SkillChips({ interactive = true }: { interactive?: boolean }) {
  const profile = useApp((s) => s.profile);
  const selected = useApp((s) => s.filters.skills);
  const setFilters = useApp((s) => s.setFilters);
  if (!profile) return null;
  const toggle = (id: string) => setFilters({ skills: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  const level = { learning: 1, comfortable: 2, experienced: 3 } as const;
  const bars = (p: keyof typeof level, on: boolean) => (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cn("w-[3px] rounded-full", n <= level[p] ? (on ? "bg-ink" : "bg-brand") : on ? "bg-ink/25" : "bg-line-strong")} style={{ height: 4 + n * 3 }} />
      ))}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2" role={interactive ? "group" : undefined} aria-label={interactive ? "Filter by skill" : "Your skills"}>
      {interactive && (
        <button
          type="button"
          aria-pressed={selected.length === 0}
          onClick={() => setFilters({ skills: [] })}
          className={cn("h-9 rounded-[10px] px-3.5 text-[13px] font-bold transition-colors", selected.length === 0 ? "bg-ink text-white" : "border border-line-strong bg-paper text-ink-2 hover:text-ink")}
        >
          All skills
        </button>
      )}
      {profile.skills.map((s) => {
        const on = interactive && selected.includes(s.id);
        const cls = cn("inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-bold transition-colors", on ? "border-brand bg-brand text-ink" : "border-line-strong bg-paper text-ink", interactive && !on && "hover:border-brand/60");
        return interactive ? (
          <button key={s.id} type="button" aria-pressed={on} aria-label={`${s.label}, ${s.proficiency}`} onClick={() => toggle(s.id)} className={cls}>
            {s.label}
            {bars(s.proficiency, on)}
          </button>
        ) : (
          <span key={s.id} className={cls} title={s.proficiency}>
            {s.label}
            {bars(s.proficiency, false)}
            <span className="sr-only">{s.proficiency}</span>
          </span>
        );
      })}
      <Link href="/app/skills" className="h-9 rounded-[10px] px-2.5 text-[13px] font-semibold leading-9 text-brand-ink hover:bg-peach-soft">
        Edit skills
      </Link>
    </div>
  );
}

export function SearchBox({ kind }: { kind: RunKind }) {
  const run = useApp((s) => s.runs[kind]);
  const [q, setQ] = useState(run.keywords);
  return (
    <form
      role="search"
      className="search-glow max-w-3xl rounded-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        void runDiscover(kind, { keywords: q });
      }}
    >
      <div className="relative rounded-[16px] border border-line-strong bg-paper shadow-[var(--shadow-card)] transition-colors focus-within:border-transparent">
        <label htmlFor="issue-search" className="sr-only">
          Search issues by keyword
        </label>
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="issue-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Narrow by keyword: auth, pagination, accessibility"
          maxLength={80}
          className="h-[58px] w-full rounded-[16px] bg-transparent pl-[52px] pr-32 text-[16px] font-medium placeholder:font-normal placeholder:text-muted focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {q && (
            <button type="button" aria-label="Clear keywords" onClick={() => setQ("")} className="grid size-9 place-items-center rounded-lg text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          )}
          <Button type="submit" variant="primary" className="h-[42px]" disabled={run.status === "loading"}>
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ---------------- metrics ---------------- */

function Metric({ value, label, scope, accent }: { value: number; label: string; scope: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-line bg-paper px-4 py-3.5 shadow-[var(--shadow-card)] sm:px-5 sm:py-4">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          className={cn("font-display text-[28px] font-bold leading-none sm:text-[34px] tracking-[-0.04em] tabular-nums", accent ? "text-brand" : "text-ink")}
        >
          {value}
        </motion.div>
      </AnimatePresence>
      <div className="mt-2 text-[13px] font-semibold text-ink">{label}</div>
      <div className="text-xs text-muted">{scope}</div>
    </div>
  );
}

export function Metrics({ rows, partial }: { rows: RankedRow[]; partial: boolean }) {
  const m = useMemo(() => {
    const verified = rows.filter((r) => r.verify?.verification);
    const repos = new Map<string, string>();
    for (const r of rows) if (r.activity !== "pending") repos.set(r.issue.repo.fullName, r.activity);
    return {
      total: rows.length,
      verified: verified.length,
      promising: verified.filter((r) => r.status === "promising").length,
      strong: rows.filter((r) => r.match.tier === "strong").length,
      repos: repos.size,
      active: [...repos.values()].filter((a) => a === "recently-active").length,
    };
  }, [rows]);
  return (
    <section aria-label="Summary for this search" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric value={m.total} label="Issues discovered" scope={partial ? "this search, partial" : "this search"} />
      <Metric value={m.promising} label="No major blocking signals" scope={`of ${m.verified} verified`} accent />
      <Metric value={m.strong} label="Strong skill matches" scope={`of ${m.total} found`} />
      <Metric value={m.active} label="Recently active repos" scope={`of ${m.repos} repos checked`} />
    </section>
  );
}

/* ---------------- filters ---------------- */

const LEVEL_LABEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", unknown: "Not labelled" };
const SCOPE_LABEL: Record<string, string> = { quick: "Quick fix", "few-hours": "A few hours", "multi-day": "Multi-day", unclear: "Unclear" };
const ACTIVITY_LABEL: Record<string, string> = { "recently-active": "Recently active", some: "Some activity", limited: "Limited activity", insufficient: "Insufficient evidence", archived: "Archived", pending: "Not verified yet" };
const STATUS_LABEL: Record<StatusFilter, string> = { promising: "Promising", "needs-review": "Needs review", "likely-unavailable": "Likely unavailable", pending: "Not verified yet" };

function facet<T extends string>(rows: RankedRow[], pick: (r: RankedRow) => T[] | T | null, label: (v: T) => string, limit = 30): FilterOption<T>[] {
  const counts = new Map<T, number>();
  for (const r of rows) {
    const v = pick(r);
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    for (const x of new Set(vals)) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count, label: label(value) }));
}

export function FilterBar({ rows }: { rows: RankedRow[] }) {
  const filters = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const clear = useApp((s) => s.clearFilters);
  const saveFilter = useApp((s) => s.saveFilter);
  const savedFilters = useApp((s) => s.savedFilters);
  const profile = useApp((s) => s.profile);
  const n = filterCount(filters);
  const [showSaved, setShowSaved] = useState(false);

  const skillLabel = (id: string) => profile?.skills.find((s) => s.id === id)?.label ?? getSkill(id)?.label ?? id;
  const opts = {
    languages: facet(rows, (r) => r.language, (v) => v),
    skills: facet(rows, (r) => r.match.matched.map((h) => h.skill.id), skillLabel),
    labels: facet(rows, (r) => r.issue.labels.map((l) => l.name), (v) => v, 25),
    levels: facet(rows, (r) => r.match.level.value, (v) => LEVEL_LABEL[v] ?? v),
    scopes: facet(rows, (r) => r.match.scope.value, (v) => SCOPE_LABEL[v] ?? v),
    activity: facet(rows, (r) => r.activity, (v) => ACTIVITY_LABEL[v] ?? v),
    status: facet(rows, (r) => r.status, (v) => STATUS_LABEL[v]),
  };
  const set = <K extends keyof Filters>(k: K) => (v: Filters[K]) => setFilters({ [k]: v } as Partial<Filters>);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu label="Status" options={opts.status} selected={filters.status} onChange={set("status")} />
      <FilterMenu label="Language" options={opts.languages} selected={filters.languages} onChange={set("languages")} />
      <FilterMenu label="Labels" options={opts.labels} selected={filters.labels} onChange={set("labels")} />
      <FilterMenu label="Level" options={opts.levels} selected={filters.levels} onChange={set("levels")} />
      <FilterMenu label="Time" options={opts.scopes} selected={filters.scopes} onChange={set("scopes")} />
      <FilterMenu label="Activity" options={opts.activity} selected={filters.activity} onChange={set("activity")} />
      <FilterMenu label="Skills" options={opts.skills} selected={filters.skills} onChange={set("skills")} />
      <AnimatePresence>
        {n > 0 && (
          <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1">
            <button type="button" onClick={clear} className="inline-flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-[13px] font-semibold text-bad hover:bg-bad-soft">
              <X className="size-3.5" aria-hidden /> Clear {n}
            </button>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Name this filter set", "My filters");
                if (name) saveFilter(name);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-[10px] px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-peach-soft hover:text-ink"
            >
              <BookmarkPlus className="size-3.5" aria-hidden /> Save
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {savedFilters.length > 0 && (
        <div className="relative">
          <button type="button" aria-expanded={showSaved} onClick={() => setShowSaved((s) => !s)} className="inline-flex h-9 items-center rounded-[10px] px-2.5 text-[13px] font-semibold text-muted hover:text-ink">
            Saved filters
          </button>
          {showSaved && (
            <ul className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-line bg-paper p-1.5 shadow-[var(--shadow-lift)]">
              {savedFilters.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="w-full rounded-[10px] px-3 py-2 text-left text-[13px] font-medium hover:bg-peach-soft"
                    onClick={() => {
                      setFilters(f.filters);
                      setShowSaved(false);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="ml-auto inline-flex rounded-[12px] border border-line-strong bg-paper p-1" role="radiogroup" aria-label="Sort">
        {(["best", "recent"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filters.sort === s}
            onClick={() => setFilters({ sort: s })}
            className={cn("relative inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-semibold", filters.sort === s ? "text-ink" : "text-muted hover:text-ink")}
          >
            {filters.sort === s && <motion.span layoutId="sort-pill" className="absolute inset-0 rounded-[8px] bg-peach" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {s === "best" ? <ArrowDownWideNarrow className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
              {s === "best" ? "Best match" : "Recent"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- states ---------------- */

function Notice({ tone, icon: Icon, title, children }: { tone: "warn" | "bad" | "neutral"; icon: typeof TriangleAlert; title: string; children?: React.ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex gap-3.5 rounded-2xl border p-4 text-sm sm:p-5", tone === "bad" ? "border-bad/25 bg-bad-soft" : tone === "warn" ? "border-warn/25 bg-warn-soft" : "border-line bg-paper")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone === "bad" ? "bg-bad text-white" : tone === "warn" ? "bg-warn/15 text-warn" : "bg-sand text-ink-2")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold text-ink">{title}</p>
        {children && <div className="mt-1 text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

function RunError({ kind }: { kind: RunKind }) {
  const run = useApp((s) => s.runs[kind]);
  const e = run.error;
  if (!e) return null;
  if (e.rateLimited) {
    return (
      <Notice tone="warn" icon={ShieldAlert} title="GitHub's search limit was reached">
        <p>{e.message} Results already checked stay cached, so trying again after the reset is cheap.</p>
        <p className="mt-1 text-xs text-muted">Running your own instance? Setting GITHUB_TOKEN raises the limit.</p>
        <Button size="sm" className="mt-3" onClick={() => void runDiscover(kind, { keywords: run.keywords })}>
          <RefreshCw /> Try again
        </Button>
      </Notice>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-center rounded-[22px] border border-bad/20 bg-paper px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <ErrorArt />
      <p className="mt-4 font-display text-xl font-bold">Search did not complete</p>
      <p className="mt-1.5 max-w-md text-sm text-ink-2">{e.message}</p>
      <Button size="sm" variant="primary" className="mt-5" onClick={() => void runDiscover(kind, { keywords: run.keywords })}>
        <RefreshCw /> Try again
      </Button>
    </div>
  );
}

function PartialNotice({ kind }: { kind: RunKind }) {
  const run = useApp((s) => s.runs[kind]);
  const profile = useApp((s) => s.profile);
  if (!run.partial || run.status !== "ready") return null;
  const failed = run.queries.filter((q) => !q.ok);
  return (
    <Notice tone="warn" icon={TriangleAlert} title={`Partial results: ${failed.length} of ${run.queries.length} searches failed`}>
      <p>
        Missing: {failed.map((f) => querySkillName(f.skillId, profile)).join(", ")}. {failed[0]?.error}
      </p>
    </Notice>
  );
}

/* ---------------- list ---------------- */

export function ResultList({ kind, rows, limit }: { kind: RunKind; rows: RankedRow[]; limit?: number }) {
  const run = useApp((s) => s.runs[kind]);
  const clear = useApp((s) => s.clearFilters);
  const autoVerify = useApp((s) => s.settings.autoVerify);
  const shown = limit ? rows.slice(0, limit) : rows;
  const unverified = rows.filter((r) => !r.verify).map((r) => r.issue);

  if (run.status === "loading") {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Searching GitHub">
        {Array.from({ length: 3 }, (_, i) => <IssueCardSkeleton key={i} />)}
      </div>
    );
  }
  if (run.status === "error") return <RunError kind={kind} />;
  if (run.status === "ready" && run.issues.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[22px] border-2 border-dashed border-line-strong bg-paper/60 px-6 py-14 text-center">
        <EmptySearchArt />
        <p className="mt-4 font-display text-xl font-bold">No open, unassigned issues matched</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-2">
          {run.keywords ? `Nothing for "${run.keywords}" with your skills. Try a broader keyword, or clear it.` : "Try adding a broader skill, or one you are learning, to widen the search."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {run.keywords && (
            <Button size="sm" variant="primary" onClick={() => void runDiscover(kind, { keywords: "" })}>
              Clear keyword
            </Button>
          )}
          <Link href="/app/skills" className="inline-flex h-8 items-center rounded-[9px] px-3 text-[13px] font-semibold text-brand-ink hover:bg-peach-soft">
            Edit skills
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PartialNotice kind={kind} />
      {!autoVerify && unverified.length > 0 && (
        <Notice tone="neutral" icon={ShieldAlert} title={`${unverified.length} issues not verified yet`}>
          <p>Automatic verification is off in settings.</p>
          <Button size="sm" className="mt-3" onClick={() => enqueueVerification(unverified)}>
            Verify these issues
          </Button>
        </Notice>
      )}
      {run.status === "ready" && run.issues.length > 0 && rows.length === 0 && (
        <div className="rounded-[22px] border-2 border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-2">
          No issues match these filters.{" "}
          <button type="button" onClick={clear} className="font-semibold text-brand-ink underline underline-offset-2">
            Clear filters
          </button>
        </div>
      )}
      <motion.ul layout className="space-y-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((r, i) => (
            <li key={r.key}>
              <IssueCard issue={r.issue} match={r.match} verify={r.verify} index={i} />
            </li>
          ))}
        </AnimatePresence>
      </motion.ul>
      {run.fetchedAt && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-muted">
          <span>
            Search ran {timeAgo(run.fetchedAt)}
            {run.cached ? " (served from cache)" : ""}. Links open the original issue on GitHub.
          </span>
          {run.hasMore && !limit && (
            <Button size="sm" onClick={() => void runDiscover(kind, { page: run.page + 1 })} disabled={run.loadingMore}>
              {run.loadingMore ? <RefreshCw className="animate-spin" /> : null}
              {run.loadingMore ? "Loading" : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Kick off the search for this view once, if it has not run yet. */
export function useAutoRun(kind: RunKind) {
  const status = useApp((s) => s.runs[kind].status);
  const ready = useApp((s) => s.hydrated && Boolean(s.profile) && s.auth.status !== "loading" && (s.auth.status !== "signed-in" || s.prefsStatus === "ready" || s.prefsStatus === "error"));
  useEffect(() => {
    if (ready && status === "idle") void runDiscover(kind);
  }, [kind, status, ready]);
}

export { useRankedRun };
