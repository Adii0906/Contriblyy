"use client";

import type { CheckKey, CheckRun, DiscoverResponse, IssueSummary, VerifyEvent } from "@/lib/types";
import { issueKey } from "@/lib/match/rank";
import { useApp, type RunKind, type ServerStatus } from "./store";
import { refreshSavedSnapshot } from "./account";

/* ---------------- discovery ---------------- */

export async function runDiscover(kind: RunKind, opts: { keywords?: string; page?: number } = {}) {
  const { profile, setRun, addHistory, runs } = useApp.getState();
  if (!profile || profile.skills.length === 0) return;
  const page = opts.page ?? 1;
  const keywords = (opts.keywords ?? (page > 1 ? runs[kind].keywords : "")).trim();
  if (page === 1) setRun(kind, { status: "loading", error: null, keywords, issues: [], page: 1, hasMore: false, partial: false });
  else setRun(kind, { loadingMore: true });

  try {
    const res = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: profile.skills, scope: profile.scope, keywords: keywords || undefined, page }),
    });
    const json = (await res.json()) as DiscoverResponse & { error?: string; resetAt?: string };
    if (!res.ok) {
      const rateLimited = res.status === 429;
      setRun(kind, { status: page === 1 ? "error" : "ready", loadingMore: false, error: { message: json.error ?? `Search failed (${res.status})`, rateLimited, resetAt: json.resetAt } });
      if (page === 1) addHistory({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, keywords, skills: profile.skills.map((s) => s.label), results: 0, partial: false, error: json.error });
      return;
    }
    const prev = useApp.getState().runs[kind];
    const seen = new Set(prev.issues.map((i) => i.id));
    const issues = page === 1 ? json.issues : [...prev.issues, ...json.issues.filter((i) => !seen.has(i.id))];
    setRun(kind, {
      status: "ready",
      loadingMore: false,
      issues,
      queries: json.queries,
      page,
      hasMore: json.hasMore,
      partial: json.partial,
      fetchedAt: json.fetchedAt,
      cached: json.cached,
      error: null,
    });
    if (page === 1) {
      addHistory({ id: crypto.randomUUID(), at: new Date().toISOString(), kind, keywords, skills: profile.skills.map((s) => s.label), results: json.issues.length, partial: json.partial });
    }
    if (useApp.getState().settings.autoVerify) enqueueVerification(page === 1 ? issues : json.issues);
  } catch {
    setRun(kind, { status: page === 1 ? "error" : "ready", loadingMore: false, error: { message: "Could not reach the Contribly server. Check your connection and try again.", rateLimited: false } });
  }
}

/* ---------------- verification queue ---------------- */

const CONCURRENCY = 4;
const queue: { key: string; issue: IssueSummary; force: boolean }[] = [];
let active = 0;

export function enqueueVerification(issues: IssueSummary[], force = false) {
  const { verify, setVerify } = useApp.getState();
  for (const issue of issues) {
    const key = issueKey(issue);
    const st = verify[key];
    if (!force && st && (st.status === "done" || st.status === "running" || st.status === "queued")) continue;
    if (queue.some((q) => q.key === key)) continue;
    setVerify(key, { status: "queued", checks: force ? {} : (st?.checks ?? {}), error: undefined });
    queue.push({ key, issue, force });
  }
  pump();
}

export function recheck(issue: IssueSummary) {
  const key = issueKey(issue);
  const idx = queue.findIndex((q) => q.key === key);
  if (idx >= 0) queue.splice(idx, 1);
  // Keep the previous verdict for ranking until the fresh one arrives, so the card does not jump.
  useApp.getState().setVerify(key, { status: "queued", checks: {}, error: undefined });
  queue.unshift({ key, issue, force: true });
  pump();
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    active++;
    void verifyOne(job.key, job.issue, job.force).finally(() => {
      active--;
      pump();
    });
  }
}

async function verifyOne(key: string, issue: IssueSummary, force: boolean) {
  const { setVerify, setCheck } = useApp.getState();
  setVerify(key, { status: "running" });
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: issue.repo.owner, repo: issue.repo.name, number: issue.number, force }),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setVerify(key, { status: "error", error: j.error ?? `Verification failed (${res.status})` });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as VerifyEvent;
        if (ev.type === "check") setCheck(key, ev.check as CheckKey, ev.run as CheckRun<unknown>);
        else if (ev.type === "done") {
          setVerify(key, { status: "done", verification: ev.verification, checks: ev.verification.checks as Partial<Record<CheckKey, CheckRun<unknown>>> });
          void refreshSavedSnapshot(key, ev.verification);
        } else if (ev.type === "error") setVerify(key, { status: "error", error: ev.error });
      }
    }
    if (useApp.getState().verify[key]?.status === "running") setVerify(key, { status: "error", error: "Verification ended early. Try a recheck." });
  } catch {
    setVerify(key, { status: "error", error: "Lost connection while verifying." });
  }
}

/* ---------------- server status ---------------- */

export async function loadServerStatus(): Promise<void> {
  try {
    const res = await fetch("/api/status", { method: "POST" });
    const json = (await res.json()) as ServerStatus;
    useApp.getState().setServer(json);
  } catch {
    useApp.getState().setServer({ mode: "live", token: false, ok: false, error: "Server unreachable" });
  }
}
