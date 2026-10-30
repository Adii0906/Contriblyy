"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CloudUpload, LogIn, RefreshCw, TriangleAlert } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useApp, type VerifyState } from "@/lib/client/store";
import { enqueueVerification } from "@/lib/client/actions";
import { importLegacySaved, loadSaved } from "@/lib/client/account";
import { scoreIssue } from "@/lib/match/score";
import { IssueCard, IssueCardSkeleton } from "@/components/issue/issue-card";
import { PageHeading } from "@/components/app/results";
import { EmptyBookmarkArt } from "@/components/app/illustrations";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { timeAgo } from "@/lib/utils";

export default function SavedPage() {
  const auth = useApp((s) => s.auth);
  const saved = useApp((s) => s.saved);
  const savedStatus = useApp((s) => s.savedStatus);
  const verify = useApp((s) => s.verify);
  const profile = useApp((s) => s.profile);
  const legacyCount = useApp((s) => Object.keys(s.legacySaved).length);

  const items = useMemo(() => {
    if (!profile) return [];
    return Object.entries(saved)
      .sort((a, b) => Date.parse(b[1].savedAt) - Date.parse(a[1].savedAt))
      .map(([key, s]) => {
        // A recheck in this session wins; otherwise show the evidence stored with the save.
        const live = verify[key];
        const v: VerifyState | undefined = live ?? (s.verification ? { status: "done", checks: s.verification.checks, verification: { ...s.verification, cached: true } } : undefined);
        return { key, saved: s, verify: v, match: scoreIssue(s.issue, profile, v?.verification) };
      });
  }, [saved, verify, profile]);

  const signedIn = auth.status === "signed-in";

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <PageHeading eyebrow={signedIn ? (auth.user?.email ?? "Your account") : "Your account"} title="Saved issues">
          {signedIn ? "Saved to your account, so they follow you to any device. Evidence is stored with each issue; recheck before you start." : "Save issues to an account to keep them across devices."}
        </PageHeading>
        {signedIn && items.length > 0 && (
          <Button onClick={() => enqueueVerification(items.map((i) => i.saved.issue), true)}>
            <RefreshCw /> Recheck all
          </Button>
        )}
      </header>

      {signedIn && legacyCount > 0 && <LegacyImport count={legacyCount} />}

      {auth.status === "loading" || (signedIn && (savedStatus === "loading" || savedStatus === "idle")) ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading saved issues">
          <IssueCardSkeleton />
          <IssueCardSkeleton />
        </div>
      ) : auth.status === "unconfigured" ? (
        <Empty title="Accounts aren't set up on this server" body="Saving issues needs a Supabase project. Searching and verification still work." />
      ) : !signedIn ? (
        <Empty title={auth.expired ? "Your session expired" : "Log in to see your saved issues"} body="Your saved issues live in your account, not in this browser.">
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Link href="/signup?next=%2Fapp%2Fsaved" className={buttonVariants({ variant: "primary" })}>
              Create account
            </Link>
            <Link href="/login?next=%2Fapp%2Fsaved" className={buttonVariants({ variant: "secondary" })}>
              <LogIn aria-hidden /> Log in
            </Link>
          </div>
        </Empty>
      ) : savedStatus === "error" ? (
        <div role="alert" className="flex flex-col items-center rounded-[22px] border border-bad/20 bg-paper px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <TriangleAlert className="size-7 text-bad" aria-hidden />
          <p className="mt-3 font-display text-xl font-bold">Could not load your saved issues</p>
          <p className="mt-1.5 max-w-md text-sm text-ink-2">Your issues are safe in your account. Check your connection and try again.</p>
          <Button variant="primary" className="mt-5" onClick={() => void loadSaved()}>
            <RefreshCw /> Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <Empty title="Nothing saved yet" body="Use the bookmark on any issue card to keep it here, along with the evidence from when you saved it.">
          <Link href="/app/recommended" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
            See recommendations <ArrowRight aria-hidden />
          </Link>
        </Empty>
      ) : (
        <ul className="space-y-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((i, idx) => (
              <li key={i.key}>
                <p className="mb-2 px-1 text-xs font-semibold text-muted">Saved {timeAgo(i.saved.savedAt)}</p>
                <IssueCard issue={i.saved.issue} match={i.match} verify={i.verify} index={idx} />
              </li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[22px] border-2 border-dashed border-line-strong bg-paper/60 px-6 py-16 text-center">
      <EmptyBookmarkArt />
      <p className="mt-4 font-display text-xl font-bold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-2">{body}</p>
      {children}
    </div>
  );
}

function LegacyImport({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div role="status" className="flex flex-wrap items-center gap-4 rounded-[18px] border border-brand/40 bg-peach-soft px-5 py-4">
      <CloudUpload className="size-5 shrink-0 text-brand-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-ink-2">
        <span className="font-bold text-ink">
          {count} issue{count === 1 ? "" : "s"} saved in this browser
        </span>{" "}
        from before accounts existed. Add them to your account?
        {msg && <span className="mt-1 block font-semibold text-bad">{msg}</span>}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => useApp.setState({ legacySaved: {} })}>
          Discard
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await importLegacySaved();
            setBusy(false);
            if ("error" in r) setMsg(r.error);
            else useApp.getState().toast("ok", `Imported ${r.imported} issue${r.imported === 1 ? "" : "s"}.`);
          }}
        >
          {busy ? "Importing" : "Import"}
        </Button>
      </div>
    </div>
  );
}
