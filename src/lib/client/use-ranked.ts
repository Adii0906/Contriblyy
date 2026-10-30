"use client";

import { useMemo } from "react";
import type { IssueSummary, RepoActivity } from "@/lib/types";
import { issueKey, rankIssues, type RankedIssue } from "@/lib/match/rank";
import { getSkill } from "@/lib/skills";
import { useApp, type Filters, type RunKind, type StatusFilter, type VerifyState } from "./store";

export interface RankedRow extends RankedIssue {
  key: string;
  verify?: VerifyState;
  language: string | null;
  activity: RepoActivity | "pending";
  status: StatusFilter;
}

export function issueLanguage(issue: IssueSummary, v?: VerifyState): string | null {
  const repo = v?.verification?.checks.repo;
  if (repo?.status === "ok") return (repo.data as { language: string | null }).language;
  for (const id of issue.foundBy) {
    const lang = getSkill(id)?.ghLanguage;
    if (lang) return lang;
  }
  return null;
}

function toRows(ranked: RankedIssue[], verify: Record<string, VerifyState>): RankedRow[] {
  return ranked.map((r) => {
    const key = issueKey(r.issue);
    const v = verify[key];
    const repo = v?.checks.repo;
    return {
      ...r,
      key,
      verify: v,
      language: issueLanguage(r.issue, v),
      activity: repo?.status === "ok" ? (repo.data as { activity: RepoActivity }).activity : "pending",
      status: v?.verification?.result.assessment ?? "pending",
    };
  });
}

export function applyFilters(rows: RankedRow[], f: Filters): RankedRow[] {
  return rows.filter(
    (r) =>
      (!f.languages.length || (r.language && f.languages.includes(r.language))) &&
      (!f.skills.length || r.match.matched.some((h) => f.skills.includes(h.skill.id))) &&
      (!f.labels.length || r.issue.labels.some((l) => f.labels.includes(l.name))) &&
      (!f.levels.length || f.levels.includes(r.match.level.value)) &&
      (!f.scopes.length || f.scopes.includes(r.match.scope.value)) &&
      (!f.activity.length || f.activity.includes(r.activity)) &&
      (!f.status.length || f.status.includes(r.status)),
  );
}

export function filterCount(f: Filters): number {
  return f.languages.length + f.skills.length + f.labels.length + f.levels.length + f.scopes.length + f.activity.length + f.status.length;
}

export function useRankedRun(kind: RunKind, sortOverride?: Filters["sort"]) {
  const run = useApp((s) => s.runs[kind]);
  const verify = useApp((s) => s.verify);
  const profile = useApp((s) => s.profile);
  const filters = useApp((s) => s.filters);

  const rows = useMemo(() => {
    if (!profile) return [];
    // Pass verification results only once complete, so ranking never jumps on partial data.
    const done: Record<string, NonNullable<VerifyState["verification"]>> = {};
    for (const [k, v] of Object.entries(verify)) if (v.verification) done[k] = v.verification;
    return toRows(rankIssues(run.issues, profile, done, issueKey, sortOverride ?? filters.sort), verify);
  }, [run.issues, verify, profile, filters.sort, sortOverride]);

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  return { run, rows, filtered, filters };
}
