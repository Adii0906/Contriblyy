"use client";

import type { IssueSummary, Verification } from "@/lib/types";
import type { PreferencesPayload } from "@/lib/preferences";
import type { SavedIssueDTO } from "@/lib/saved/schemas";
import { issueKey } from "@/lib/match/rank";
import { EMPTY_FILTERS, useApp, type AccountUser, type SavedIssue } from "./store";

/* ---------------- fetch helper ---------------- */

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; code?: string; kind?: string };
}

async function api<T = Record<string, unknown>>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult<T>["data"];
    if (res.status === 401 && data?.code === "unauthenticated") handleSessionLost();
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach Contribly. Check your connection." } as ApiResult<T>["data"] };
  }
}

export { api as accountApi };

/* ---------------- session ---------------- */

let explicitLogout = false;

/** A protected call came back 401: the session expired or was revoked elsewhere. */
function handleSessionLost() {
  const s = useApp.getState();
  if (s.auth.status !== "signed-in" || explicitLogout) return;
  s.setAuth({ status: "signed-out", user: null, expired: true });
  s.setSaved({});
  useApp.setState({ savedStatus: "idle", prefsStatus: "idle" });
  s.openAuthPrompt({ reason: "expired" });
}

export async function loadSession(opts: { quiet?: boolean } = {}): Promise<AccountUser | null> {
  const r = await api<{ configured: boolean; user: AccountUser | null }>("/api/auth/session");
  const s = useApp.getState();
  if (!r.ok) {
    if (!opts.quiet) s.setAuth({ status: s.auth.status === "loading" ? "signed-out" : s.auth.status });
    return null;
  }
  if (!r.data.configured) {
    s.setAuth({ status: "unconfigured", user: null });
    return null;
  }
  const prev = s.auth;
  if (r.data.user) {
    const changedUser = prev.user?.id !== r.data.user.id;
    s.setAuth({ status: "signed-in", user: r.data.user, expired: false });
    if (changedUser || s.prefsStatus === "idle") await afterSignIn();
    return r.data.user;
  }
  if (prev.status === "signed-in") handleSessionLost();
  else s.setAuth({ status: "signed-out", user: null });
  return null;
}

/** Load the account's preferences and saved issues, then offer any pending save. */
export async function afterSignIn() {
  await loadPreferences();
  await loadSaved();
  const pending = readPendingSave();
  if (pending) useApp.getState().openAuthPrompt(null);
}

export async function logout() {
  explicitLogout = true;
  await api("/api/auth/logout", { method: "POST", body: {} });
  const s = useApp.getState();
  s.clearAccountState();
  s.setAuth({ status: "signed-out", user: null, expired: false });
  clearPendingSave();
  explicitLogout = false;
}

/* ---------------- saved issues ---------------- */

function toSaved(dto: SavedIssueDTO): SavedIssue {
  return { issue: dto.issue, verification: dto.verification, savedAt: dto.savedAt };
}

export async function loadSaved() {
  const s = useApp.getState();
  if (s.auth.status !== "signed-in") return;
  useApp.setState({ savedStatus: "loading" });
  const r = await api<{ items: SavedIssueDTO[] }>("/api/saved");
  if (!r.ok) {
    useApp.setState({ savedStatus: "error" });
    return;
  }
  const map: Record<string, SavedIssue> = {};
  for (const it of r.data.items) map[issueKey(it.issue)] = toSaved(it);
  useApp.setState({ saved: map, savedStatus: "ready" });
}

const inflight = new Set<string>();

/**
 * Save or unsave. Signed out: keeps the issue as a pending intent (this tab
 * only) and asks the user to log in or sign up. Signed in: optimistic update,
 * rolled back if the server refuses.
 */
export async function toggleSave(issue: IssueSummary, verification?: Verification) {
  const key = issueKey(issue);
  if (useApp.getState().auth.status === "loading") {
    // Clicked before the session finished loading: resolve it first instead of guessing.
    await loadSession({ quiet: true });
    if (useApp.getState().auth.status === "loading") useApp.getState().setAuth({ status: "signed-out" });
  }
  const s = useApp.getState();
  if (s.auth.status === "unconfigured") {
    s.openAuthPrompt({ reason: "unconfigured" });
    return;
  }
  if (s.auth.status !== "signed-in") {
    writePendingSave(issue, verification);
    s.openAuthPrompt({ reason: "save", issueTitle: issue.title });
    return;
  }
  if (inflight.has(key)) return;
  inflight.add(key);
  const before = s.saved[key];
  try {
    if (before) {
      s.putSaved(key, null);
      const r = await api("/api/saved", { method: "DELETE", body: { githubIssueId: issue.id } });
      if (!r.ok) {
        useApp.getState().putSaved(key, before);
        if (r.status !== 401) s.toast("bad", r.data.error ?? "Could not remove this issue.");
      } else s.toast("info", "Removed from saved issues.");
    } else {
      s.putSaved(key, { issue, verification, savedAt: new Date().toISOString() });
      const r = await api<{ item: SavedIssueDTO }>("/api/saved", { method: "POST", body: { issue, verification } });
      if (!r.ok) {
        useApp.getState().putSaved(key, null);
        if (r.status === 401) writePendingSave(issue, verification);
        else s.toast("bad", r.data.error ?? "Could not save this issue.");
      } else {
        useApp.getState().putSaved(key, toSaved(r.data.item));
        s.toast("ok", "Saved to your account.");
      }
    }
  } finally {
    inflight.delete(key);
  }
}

/** Keep the stored evidence snapshot current after a recheck of a saved issue. */
export async function refreshSavedSnapshot(key: string, verification: Verification) {
  const s = useApp.getState();
  const cur = s.saved[key];
  if (!cur || s.auth.status !== "signed-in") return;
  if (cur.verification?.checkedAt === verification.checkedAt) return;
  s.putSaved(key, { ...cur, verification });
  await api("/api/saved", { method: "POST", body: { issue: cur.issue, verification } });
}

export async function importLegacySaved(): Promise<{ imported: number } | { error: string }> {
  const s = useApp.getState();
  const items = Object.values(s.legacySaved).slice(0, 50).map((x) => ({ issue: x.issue, verification: x.verification }));
  if (!items.length) return { imported: 0 };
  const r = await api<{ imported: number }>("/api/saved/import", { method: "POST", body: { items } });
  if (!r.ok) return { error: r.data.error ?? "Import failed." };
  useApp.setState({ legacySaved: {} });
  await loadSaved();
  return { imported: r.data.imported };
}

/* ---------------- pending save (survives the login redirect, this tab only) ---------------- */

const PENDING_KEY = "contribly:pending-save";
const PENDING_TTL = 60 * 60_000;

interface Pending {
  issue: IssueSummary;
  verification?: Verification;
  at: number;
}

function writePendingSave(issue: IssueSummary, verification?: Verification) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ issue, verification, at: Date.now() } satisfies Pending));
  } catch {
    /* storage blocked: the prompt still works, the issue just won't be offered after login */
  }
}

export function readPendingSave(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p?.issue?.id || Date.now() - p.at > PENDING_TTL) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearPendingSave() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export async function confirmPendingSave(): Promise<boolean> {
  const p = readPendingSave();
  clearPendingSave();
  if (!p) return false;
  const s = useApp.getState();
  if (s.saved[issueKey(p.issue)]) {
    s.toast("info", "That issue is already in your saved issues.");
    return true;
  }
  await toggleSave(p.issue, p.verification);
  return true;
}

/* ---------------- preferences ---------------- */

let applying = false;

export async function loadPreferences() {
  const s = useApp.getState();
  if (s.auth.status !== "signed-in") return;
  useApp.setState({ prefsStatus: "loading" });
  const r = await api<{ preferences: (PreferencesPayload & { updatedAt: string }) | null }>("/api/preferences");
  if (!r.ok) {
    useApp.setState({ prefsStatus: "error" });
    return;
  }
  const p = r.data.preferences;
  if (p) {
    applying = true;
    useApp.setState((st) => ({
      profile: { skills: p.skills, time: p.time, scope: p.scope, updatedAt: p.updatedAt },
      settings: { ...st.settings, autoVerify: p.autoVerify },
      filters: p.filters.current ?? EMPTY_FILTERS,
      savedFilters: p.filters.saved ?? [],
      runs: st.profile && JSON.stringify(st.profile.skills) === JSON.stringify(p.skills) && st.profile.time === p.time && st.profile.scope === p.scope ? st.runs : { discover: { ...st.runs.discover, status: "idle" }, recommended: { ...st.runs.recommended, status: "idle" } },
    }));
    applying = false;
    useApp.setState({ prefsStatus: "ready" });
  } else {
    useApp.setState({ prefsStatus: "ready" });
    // First sign-in: keep what the user set up as a guest.
    if (s.profile) await pushPreferences();
  }
}

function payload(): PreferencesPayload | null {
  const s = useApp.getState();
  if (!s.profile || s.profile.skills.length === 0) return null;
  return { skills: s.profile.skills, time: s.profile.time, scope: s.profile.scope, autoVerify: s.settings.autoVerify, filters: { current: s.filters, saved: s.savedFilters } };
}

async function pushPreferences() {
  const body = payload();
  if (!body) return;
  const r = await api("/api/preferences", { method: "PUT", body });
  if (!r.ok && r.status !== 401) useApp.getState().toast("bad", r.data.error ?? "Could not save your preferences.");
}

/** Keeps the account's preferences in sync with local edits. Returns an unsubscribe function. */
export function startPreferenceSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useApp.subscribe((st, prev) => {
    if (applying || st.auth.status !== "signed-in" || st.prefsStatus !== "ready") return;
    if (st.profile === prev.profile && st.settings === prev.settings && st.savedFilters === prev.savedFilters && st.filters === prev.filters) return;
    clearTimeout(timer);
    timer = setTimeout(() => void pushPreferences(), 800);
  });
  return () => {
    clearTimeout(timer);
    unsub();
  };
}
