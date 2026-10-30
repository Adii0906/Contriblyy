"use client";

import { useRouter } from "next/navigation";
import { Database, KeyRound, LogOut, RefreshCw, Search, Server, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { logout } from "@/lib/client/account";
import { Avatar } from "@/components/auth/account-menu";
import { buttonVariants } from "@/components/ui/button-variants";
import { useApp } from "@/lib/client/store";
import { loadServerStatus } from "@/lib/client/actions";
import { PageHeading } from "@/components/app/results";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Row({ icon: Icon, title, body, children }: { icon: typeof Server; title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex max-w-[60ch] gap-3.5">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-peach-soft text-brand-ink">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <p className="font-bold">{title}</p>
          {body && <div className="mt-0.5 text-sm text-ink-2">{body}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Card({ id, title, action, children }: { id: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5 sm:px-6">
        <h2 id={id} className="font-display text-[17px] font-bold">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const server = useApp((s) => s.server);
  const clearLocal = useApp((s) => s.clearLocalData);
  const auth = useApp((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    void loadServerStatus();
  }, []);

  const quota = (q?: { remaining: number; limit: number; resetAt: string } | null) =>
    q ? `${q.remaining} of ${q.limit} left, resets ${new Date(q.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "unknown";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading eyebrow="Preferences" title="Settings" />

      <AccountCard />

      <Card id="verification" title="Verification">
        <Row icon={ShieldCheck} title="Verify results automatically" body="Runs all six checks on each result as it arrives. Turn off to save GitHub API budget and verify on demand.">
          <button
            type="button"
            role="switch"
            aria-checked={settings.autoVerify}
            onClick={() => setSettings({ autoVerify: !settings.autoVerify })}
            className={cn("relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors", settings.autoVerify ? "border-ink bg-brand" : "border-line-strong bg-sand")}
          >
            <span className="sr-only">Verify results automatically</span>
            <span className={cn("absolute left-0 top-[2px] size-[18px] rounded-full bg-ink shadow transition-transform", settings.autoVerify ? "translate-x-[23px]" : "translate-x-[3px] bg-muted")} />
          </button>
        </Row>
      </Card>

      <Card
        id="connection"
        title="GitHub connection"
        action={
          <Button size="sm" variant="ghost" onClick={() => void loadServerStatus()}>
            <RefreshCw /> Refresh
          </Button>
        }
      >
        <Row icon={Server} title="Data source" body={server ? (server.mode === "test" ? "Test mode: local fixture server with fictional repositories." : "Live GitHub API.") : "Checking"} />
        <Row icon={KeyRound} title="Server token" body={server ? (server.token ? "A GitHub token is configured on the server. It never reaches the browser." : "No token configured. Limits are very low without one.") : "Checking"} />
        <Row icon={Search} title="Search budget" body={server?.ok ? quota(server.search) : (server?.error ?? "Checking")} />
        <Row icon={Database} title="API budget" body={server?.ok ? quota(server.core) : "Unavailable"} />
      </Card>

      <Card id="data" title="Data in this browser">
        <Row
          icon={UserRound}
          title={auth.status === "signed-in" ? "Synced to your account" : "Guest mode"}
          body={
            auth.status === "signed-in"
              ? "Saved issues, skills, availability and filters are stored in your account. Search history stays in this browser."
              : "You are not signed in. Skills, history and filters are kept in this browser's local storage and are only sent with the searches you run."
          }
        />
        <Row icon={Database} title="Clear local data" body="Removes skills, history and filters cached in this browser. Your account and saved issues are not affected.">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm("Remove Contribly data cached in this browser?")) {
                clearLocal();
                router.push("/onboarding");
              }
            }}
          >
            Clear data
          </Button>
        </Row>
      </Card>
    </div>
  );
}

function AccountCard() {
  const auth = useApp((s) => s.auth);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (auth.status === "loading") return <div className="skeleton h-40 rounded-[22px]" aria-hidden />;
  if (auth.status === "unconfigured") {
    return (
      <Card id="account" title="Account">
        <Row icon={UserRound} title="Accounts not configured" body="This server has no Supabase project, so accounts and saved issues are unavailable." />
      </Card>
    );
  }
  if (auth.status !== "signed-in" || !auth.user) {
    return (
      <Card id="account" title="Account">
        <Row icon={UserRound} title="You're not signed in" body="Create an account to save issues and keep your preferences on every device.">
          <div className="flex gap-2">
            <Link href="/login?next=%2Fapp%2Fsettings" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Log in
            </Link>
            <Link href="/signup?next=%2Fapp%2Fsettings" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Create account
            </Link>
          </div>
        </Row>
      </Card>
    );
  }
  const u = auth.user;
  return (
    <Card id="account" title="Account">
      <div className="flex items-center gap-3.5 px-5 py-4 sm:px-6">
        <Avatar user={u} />
        <div className="min-w-0">
          <p className="truncate font-bold">{u.name ?? u.email}</p>
          <p className="truncate text-sm text-muted">{u.email}</p>
        </div>
        <span className={cn("ml-auto shrink-0 rounded-[8px] px-2 py-1 text-[12px] font-bold", u.emailVerified ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>{u.emailVerified ? "Email verified" : "Email not verified"}</span>
      </div>
      <Row icon={KeyRound} title="Password" body="We'll email you a link to set a new password.">
        <Link href="/forgot-password" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Reset password
        </Link>
      </Row>
      <Row icon={LogOut} title="Log out" body="Ends the session in this browser. Your saved issues stay in your account.">
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await logout();
            router.push("/");
            useApp.getState().toast("info", "You're logged out.");
          }}
        >
          {busy ? "Logging out" : "Log out"}
        </Button>
      </Row>
    </Card>
  );
}
