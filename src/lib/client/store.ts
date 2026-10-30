"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CheckKey, CheckRun, IssueSummary, Profile, RepoActivity, Verification } from "@/lib/types";
import type { Level, Scope } from "@/lib/match/score";
import type { SortMode } from "@/lib/match/rank";

export type RunKind = "discover" | "recommended";

export interface RunState {
  status: "idle" | "loading" | "ready" | "error";
  issues: IssueSummary[];
  queries: { skillId: string; ok: boolean; total?: number; error?: string }[];
  page: number;
  hasMore: boolean;
  partial: boolean;
  loadingMore: boolean;
  keywords: string;
  fetchedAt: string | null;
  cached: boolean;
  error: { message: string; rateLimited: boolean; resetAt?: string } | null;
}

export interface VerifyState {
  status: "queued" | "running" | "done" | "error";
  checks: Partial<Record<CheckKey, CheckRun<unknown>>>;
  verification?: Verification;
  error?: string;
}

export type StatusFilter = "promising" | "needs-review" | "likely-unavailable" | "pending";

export interface Filters {
  languages: string[];
  skills: string[];
  labels: string[];
  levels: Level[];
  scopes: Scope[];
  activity: (RepoActivity | "pending")[];
  status: StatusFilter[];
  sort: SortMode;
}

export const EMPTY_FILTERS: Filters = { languages: [], skills: [], labels: [], levels: [], scopes: [], activity: [], status: [], sort: "best" };

export interface SavedIssue {
  issue: IssueSummary;
  savedAt: string;
  verification?: Verification;
}

export interface HistoryEntry {
  id: string;
  at: string;
  kind: RunKind;
  keywords: string;
  skills: string[];
  results: number;
  partial: boolean;
  error?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  filters: Filters;
}

export interface ServerStatus {
  mode: "live" | "test";
  token: boolean;
  ok: boolean;
  search?: { remaining: number; limit: number; resetAt: string } | null;
  core?: { remaining: number; limit: number; resetAt: string } | null;
  error?: string;
}

const emptyRun = (): RunState => ({
  status: "idle",
  issues: [],
  queries: [],
  page: 1,
  hasMore: false,
  partial: false,
  loadingMore: false,
  keywords: "",
  fetchedAt: null,
  cached: false,
  error: null,
});

export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}

export type AuthStatus = "loading" | "unconfigured" | "signed-out" | "signed-in";

export interface AuthPrompt {
  reason: "save" | "expired" | "unconfigured";
  issueTitle?: string;
}

export interface Toast {
  id: number;
  tone: "ok" | "bad" | "info";
  text: string;
}

interface AppState {
  hydrated: boolean;
  // persisted in this browser (a cache for signed-in users, the only copy for guests)
  profile: Profile | null;
  history: HistoryEntry[];
  savedFilters: SavedFilter[];
  settings: { autoVerify: boolean };
  /** Issues saved by the earlier guest-only version, kept until imported or dismissed. */
  legacySaved: Record<string, SavedIssue>;
  // account (never persisted locally; the server is the source of truth)
  auth: { status: AuthStatus; user: AccountUser | null; expired: boolean };
  saved: Record<string, SavedIssue>;
  savedStatus: "idle" | "loading" | "ready" | "error";
  prefsStatus: "idle" | "loading" | "ready" | "error";
  authPrompt: AuthPrompt | null;
  toasts: Toast[];
  // session only
  runs: Record<RunKind, RunState>;
  verify: Record<string, VerifyState>;
  filters: Filters;
  server: ServerStatus | null;

  setProfile: (p: Profile) => void;
  setRun: (k: RunKind, patch: Partial<RunState>) => void;
  resetRun: (k: RunKind) => void;
  setVerify: (key: string, patch: Partial<VerifyState>) => void;
  setCheck: (key: string, check: CheckKey, run: CheckRun<unknown>) => void;
  setSaved: (saved: Record<string, SavedIssue>) => void;
  putSaved: (key: string, item: SavedIssue | null) => void;
  addHistory: (e: HistoryEntry) => void;
  clearHistory: () => void;
  setFilters: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  saveFilter: (name: string) => void;
  deleteSavedFilter: (id: string) => void;
  setSettings: (patch: Partial<AppState["settings"]>) => void;
  setServer: (s: ServerStatus) => void;
  setAuth: (patch: Partial<AppState["auth"]>) => void;
  openAuthPrompt: (p: AuthPrompt | null) => void;
  toast: (tone: Toast["tone"], text: string) => void;
  dismissToast: (id: number) => void;
  /** Clears everything tied to the signed-in user (on logout or expiry). */
  clearAccountState: () => void;
  clearLocalData: () => void;
}

let toastSeq = 0;

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      profile: null,
      history: [],
      savedFilters: [],
      settings: { autoVerify: true },
      legacySaved: {},
      auth: { status: "loading", user: null, expired: false },
      saved: {},
      savedStatus: "idle",
      prefsStatus: "idle",
      authPrompt: null,
      toasts: [],
      runs: { discover: emptyRun(), recommended: emptyRun() },
      verify: {},
      filters: EMPTY_FILTERS,
      server: null,

      setProfile: (p) => set({ profile: p, runs: { discover: emptyRun(), recommended: emptyRun() } }),
      setRun: (k, patch) => set((s) => ({ runs: { ...s.runs, [k]: { ...s.runs[k], ...patch } } })),
      resetRun: (k) => set((s) => ({ runs: { ...s.runs, [k]: emptyRun() } })),
      setVerify: (key, patch) =>
        set((s) => ({ verify: { ...s.verify, [key]: { ...(s.verify[key] ?? { status: "queued", checks: {} }), ...patch } } })),
      setCheck: (key, check, run) =>
        set((s) => {
          const prev = s.verify[key] ?? { status: "running" as const, checks: {} };
          return { verify: { ...s.verify, [key]: { ...prev, checks: { ...prev.checks, [check]: run } } } };
        }),
      setSaved: (saved) => set({ saved }),
      putSaved: (key, item) =>
        set((s) => {
          const saved = { ...s.saved };
          if (item) saved[key] = item;
          else delete saved[key];
          return { saved };
        }),
      addHistory: (e) => set((s) => ({ history: [e, ...s.history].slice(0, 50) })),
      clearHistory: () => set({ history: [] }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      clearFilters: () => set((s) => ({ filters: { ...EMPTY_FILTERS, sort: s.filters.sort } })),
      saveFilter: (name) =>
        set((s) => ({ savedFilters: [{ id: crypto.randomUUID(), name: name.slice(0, 40), filters: get().filters }, ...s.savedFilters].slice(0, 12) })),
      deleteSavedFilter: (id) => set((s) => ({ savedFilters: s.savedFilters.filter((f) => f.id !== id) })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setServer: (server) => set({ server }),
      setAuth: (patch) => set((s) => ({ auth: { ...s.auth, ...patch } })),
      openAuthPrompt: (authPrompt) => set({ authPrompt }),
      toast: (tone, text) => {
        const id = ++toastSeq;
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, tone, text }] }));
        setTimeout(() => get().dismissToast(id), 4500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      clearAccountState: () =>
        set({
          profile: null,
          saved: {},
          savedStatus: "idle",
          prefsStatus: "idle",
          history: [],
          savedFilters: [],
          settings: { autoVerify: true },
          runs: { discover: emptyRun(), recommended: emptyRun() },
          filters: EMPTY_FILTERS,
        }),
      clearLocalData: () =>
        set({ profile: null, legacySaved: {}, history: [], savedFilters: [], settings: { autoVerify: true }, runs: { discover: emptyRun(), recommended: emptyRun() }, verify: {}, filters: EMPTY_FILTERS }),
    }),
    {
      name: "contribly:guest:v1",
      version: 2,
      skipHydration: true,
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          // Private mode or blocked storage: fall back to memory for this session.
          const mem = new Map<string, string>();
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
        }
      }),
      // v1 stored saved issues in this browser. They move to legacySaved so the
      // user can import them into their account; they are no longer the source of truth.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { saved, ...rest } = p;
          return { ...rest, legacySaved: (saved as Record<string, SavedIssue> | undefined) ?? {} };
        }
        return p;
      },
      partialize: (s) => ({ profile: s.profile, history: s.history, savedFilters: s.savedFilters, settings: s.settings, legacySaved: s.legacySaved }),
      onRehydrateStorage: () => () => {
        useApp.setState({ hydrated: true });
      },
    },
  ),
);
