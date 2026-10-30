"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bookmark, Clock, KeyRound, LogIn } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { clearPendingSave, confirmPendingSave, readPendingSave } from "@/lib/client/account";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { LogoMark } from "@/components/brand";
import { cn } from "@/lib/utils";

function authHref(path: "/login" | "/signup", next: string) {
  return `${path}?next=${encodeURIComponent(next)}&intent=save`;
}

/** Shown when a signed-out user tries to save, or when a session expires. */
export function AuthPromptDialog() {
  const prompt = useApp((s) => s.authPrompt);
  const close = () => useApp.getState().openAuthPrompt(null);
  const pathname = usePathname();
  const next = pathname.startsWith("/app") ? pathname : "/app";

  return (
    <Dialog open={Boolean(prompt)} onClose={close} labelledBy="auth-prompt-title">
      <div className="relative overflow-hidden bg-brand px-6 pb-6 pt-7">
        <svg aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-44 opacity-25" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" fill="none" stroke="#202020" strokeWidth="3" strokeDasharray="4 9" strokeLinecap="round" />
        </svg>
        <span className="relative grid size-11 place-items-center rounded-[13px] border-2 border-ink bg-paper text-ink shadow-[3px_3px_0_var(--ink)]">
          {prompt?.reason === "expired" ? <Clock className="size-5" aria-hidden /> : prompt?.reason === "unconfigured" ? <KeyRound className="size-5" aria-hidden /> : <Bookmark className="size-5" aria-hidden />}
        </span>
        <h2 id="auth-prompt-title" className="relative mt-4 font-display text-[24px] font-bold leading-tight tracking-[-0.03em] text-ink">
          {prompt?.reason === "expired" ? "Your session expired" : prompt?.reason === "unconfigured" ? "Accounts aren't set up here" : "Save it to your account"}
        </h2>
      </div>
      <div className="px-6 pb-6 pt-5">
        {prompt?.reason === "save" && (
          <>
            {prompt.issueTitle && (
              <p className="rounded-[12px] border border-line bg-canvas px-3.5 py-2.5 text-[14px] font-semibold text-ink">
                <span className="line-clamp-2">{prompt.issueTitle}</span>
              </p>
            )}
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">Create a free account to keep issues and preferences on every device. We&rsquo;ll hold on to this issue and offer to save it as soon as you&rsquo;re in.</p>
            <div className="mt-5 grid gap-2.5">
              <Link href={authHref("/signup", next)} onClick={close} data-autofocus className={buttonVariants({ variant: "primary", size: "lg" })}>
                Create account
              </Link>
              <Link href={authHref("/login", next)} onClick={close} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <LogIn aria-hidden /> Log in
              </Link>
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-lg py-2 text-[13px] font-semibold text-muted hover:text-ink"
              onClick={() => {
                clearPendingSave();
                close();
              }}
            >
              Keep browsing without saving
            </button>
          </>
        )}
        {prompt?.reason === "expired" && (
          <>
            <p className="text-[14.5px] leading-relaxed text-ink-2">For your security you were signed out. Log in again to keep saving issues; your saved issues are safe in your account.</p>
            <div className="mt-5 grid gap-2.5">
              <Link href={`/login?next=${encodeURIComponent(next)}`} onClick={close} data-autofocus className={buttonVariants({ variant: "primary", size: "lg" })}>
                Log in again
              </Link>
              <Button variant="ghost" onClick={close}>
                Not now
              </Button>
            </div>
          </>
        )}
        {prompt?.reason === "unconfigured" && (
          <>
            <p className="text-[14.5px] leading-relaxed text-ink-2">Saving needs accounts, and this server has no Supabase project configured. Searching and verification still work.</p>
            <Button className="mt-5 w-full" onClick={close} data-autofocus>
              Got it
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** After signing in, offers to save the issue the user picked while signed out. */
export function PendingSaveDialog() {
  const signedIn = useApp((s) => s.auth.status === "signed-in");
  const savedReady = useApp((s) => s.savedStatus === "ready");
  const pathname = usePathname();
  const [pending, setPending] = useState<ReturnType<typeof readPendingSave>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only offer inside the dashboard, never on top of auth pages such as /reset-password.
    if (!signedIn || !savedReady || !pathname.startsWith("/app")) return;
    const p = readPendingSave();
    const t = setTimeout(() => setPending(p), 0);
    return () => clearTimeout(t);
  }, [signedIn, savedReady, pathname]);

  const close = () => {
    clearPendingSave();
    setPending(null);
  };

  return (
    <Dialog open={Boolean(pending)} onClose={close} labelledBy="pending-title">
      <div className="px-6 pb-6 pt-7">
        <LogoMark className="size-10" />
        <h2 id="pending-title" className="mt-4 font-display text-[24px] font-bold leading-tight tracking-[-0.03em]">
          You&rsquo;re in. Save this issue?
        </h2>
        <p className="mt-2 text-[14.5px] text-ink-2">You picked this before signing in.</p>
        {pending && (
          <div className="mt-4 rounded-[14px] border border-line bg-canvas px-4 py-3">
            <p className="font-mono text-[11.5px] text-muted">
              {pending.issue.repo.fullName} #{pending.issue.number}
            </p>
            <p className="mt-1 font-display text-[16px] font-bold leading-snug">{pending.issue.title}</p>
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Not now
          </Button>
          <Button
            variant="primary"
            data-autofocus
            disabled={busy}
            className={cn(busy && "opacity-70")}
            onClick={async () => {
              setBusy(true);
              await confirmPendingSave();
              setBusy(false);
              setPending(null);
            }}
          >
            <Bookmark aria-hidden /> {busy ? "Saving" : "Save issue"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
