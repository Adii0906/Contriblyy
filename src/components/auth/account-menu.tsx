"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, ChevronsUpDown, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useApp, type AccountUser } from "@/lib/client/store";
import { logout } from "@/lib/client/account";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function initials(u: AccountUser | null): string {
  const src = (u?.name || u?.email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (u?.name ? (parts[1]?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ user, size = "md" }: { user: AccountUser | null; size?: "sm" | "md" }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full border-2 border-ink bg-brand font-display font-bold text-ink", size === "sm" ? "size-8 text-[12px]" : "size-9 text-[13px]")}>
      {initials(user)}
    </span>
  );
}

function useAuthLinks() {
  const [next, setNext] = useState("/app");
  useEffect(() => {
    const t = setTimeout(() => setNext(window.location.pathname.startsWith("/app") ? window.location.pathname : "/app"), 0);
    return () => clearTimeout(t);
  }, []);
  return { login: `/login?next=${encodeURIComponent(next)}`, signup: `/signup?next=${encodeURIComponent(next)}` };
}

/** Popover with account actions. `placement` up for the sidebar, down for the mobile bar. */
function Menu({ user, onClose, placement }: { user: AccountUser; onClose: () => void; placement: "up" | "down" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("a,button")?.focus(), 20);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDoc = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);
  const item = "flex h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-semibold text-ink-2 hover:bg-peach-soft hover:text-ink";
  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Account"
      initial={{ opacity: 0, y: placement === "up" ? 6 : -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: placement === "up" ? 6 : -6, scale: 0.98 }}
      transition={{ duration: 0.14 }}
      className={cn("absolute z-50 rounded-[16px] border border-line bg-paper p-1.5 shadow-[var(--shadow-lift)]", placement === "up" ? "inset-x-0 bottom-full mb-2" : "right-0 top-full mt-2 w-64")}
    >
      <div className="border-b border-line px-3 pb-2.5 pt-2">
        <p className="truncate text-[13px] font-bold text-ink">{user.name ?? "Signed in"}</p>
        <p className="truncate text-[12px] text-muted">{user.email}</p>
      </div>
      <div className="pt-1.5">
        <Link role="menuitem" href="/app/saved" onClick={onClose} className={item}>
          <Bookmark className="size-4" aria-hidden /> My saved issues
        </Link>
        <Link role="menuitem" href="/app/settings" onClick={onClose} className={item}>
          <Settings className="size-4" aria-hidden /> Settings
        </Link>
        <button
          role="menuitem"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await logout();
            onClose();
            router.push("/");
            useApp.getState().toast("info", "You're logged out.");
          }}
          className={cn(item, "text-bad hover:bg-bad-soft hover:text-bad")}
        >
          <LogOut className="size-4" aria-hidden /> {busy ? "Logging out" : "Log out"}
        </button>
      </div>
    </motion.div>
  );
}

/** Sidebar footer: account card when signed in, sign-up / log-in when not. */
export function SidebarAccount() {
  const auth = useApp((s) => s.auth);
  const [open, setOpen] = useState(false);
  const links = useAuthLinks();
  const menuId = useId();

  if (auth.status === "loading") return <div className="skeleton mt-auto h-[76px] rounded-[16px]" aria-hidden />;

  if (auth.status === "unconfigured") {
    return (
      <div className="mt-auto rounded-[16px] border border-line bg-canvas p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-white">
            <UserRound className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[13px] font-bold">Guest</p>
            <p className="text-[11px] text-muted">Accounts not configured</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">Skills stay in this browser. Saving issues needs accounts.</p>
      </div>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <div className="mt-auto rounded-[18px] border border-line bg-canvas p-4">
        <p className="font-display text-[15px] font-bold leading-snug">Keep your issues everywhere</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Save issues and preferences to an account you can open on any device.</p>
        <div className="mt-3.5 grid gap-2">
          <Link href={links.signup} className={buttonVariants({ variant: "primary", size: "md" })}>
            Create account
          </Link>
          <Link href={links.login} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <LogIn aria-hidden /> Log in
          </Link>
        </div>
      </div>
    );
  }

  const user = auth.user!;
  return (
    <div className="relative mt-auto">
      <AnimatePresence>{open && <Menu user={user} onClose={() => setOpen(false)} placement="up" />}</AnimatePresence>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-[16px] border border-line bg-canvas p-3 text-left transition-colors hover:border-brand/50"
      >
        <Avatar user={user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-ink">{user.name ?? user.email}</span>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ok">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden /> Signed in
          </span>
        </span>
        <ChevronsUpDown className="size-4 text-muted" aria-hidden />
      </button>
    </div>
  );
}

/** Compact account control for the mobile top bar. */
export function MobileAccount() {
  const auth = useApp((s) => s.auth);
  const [open, setOpen] = useState(false);
  const links = useAuthLinks();
  if (auth.status === "loading") return <span className="skeleton size-8 rounded-full" aria-hidden />;
  if (auth.status === "unconfigured") return <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-semibold text-ink-2">Guest</span>;
  if (auth.status === "signed-out") {
    return (
      <div className="flex items-center gap-1.5">
        <Link href={links.login} className="rounded-[9px] px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
          Log in
        </Link>
        <Link href={links.signup} className={buttonVariants({ variant: "primary", size: "sm" })}>
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((o) => !o)} className="rounded-full">
        <Avatar user={auth.user} size="sm" />
      </button>
      <AnimatePresence>{open && <Menu user={auth.user!} onClose={() => setOpen(false)} placement="down" />}</AnimatePresence>
    </div>
  );
}
