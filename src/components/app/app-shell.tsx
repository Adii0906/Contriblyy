"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "motion/react";
import { Bookmark, Compass, History, Settings, Sparkles, SlidersHorizontal, Star } from "lucide-react";
import { MobileAccount, SidebarAccount } from "@/components/auth/account-menu";
import { Logo } from "@/components/brand";
import { useApp } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { TestModeBanner } from "./test-mode-banner";

const NAV = [
  { href: "/app", label: "Discover", icon: Compass },
  { href: "/app/recommended", label: "Recommended", icon: Sparkles },
  { href: "/app/saved", label: "Saved issues", short: "Saved", icon: Bookmark },
  { href: "/app/history", label: "Search history", short: "History", icon: History },
  { href: "/app/skills", label: "My skills", short: "Skills", icon: SlidersHorizontal },
  { href: "/app/review", label: "Write a Review", icon: Star },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useApp((s) => s.hydrated);
  const profile = useApp((s) => s.profile);
  const savedCount = useApp((s) => Object.keys(s.saved).length);
  const authStatus = useApp((s) => s.auth.status);
  const prefsStatus = useApp((s) => s.prefsStatus);
  // Wait for the session (and, when signed in, the account's preferences) before deciding.
  const settled = hydrated && authStatus !== "loading" && (authStatus !== "signed-in" || prefsStatus === "ready" || prefsStatus === "error");
  const ready = settled && Boolean(profile);

  useEffect(() => {
    if (settled && !profile) router.replace("/onboarding");
  }, [settled, profile, router]);

  const active = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <div className="min-h-dvh">
      <TestModeBanner />
      <div className="mx-auto flex max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-paper px-4 py-6 lg:flex">
          <Logo href="/" className="px-2" />
          <nav aria-label="Dashboard" className="mt-10 space-y-1">
            {NAV.map((n) => {
              const on = active(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn("relative flex h-10 items-center gap-3 rounded-[11px] px-3 text-[14px] font-semibold transition-colors", on ? "text-ink" : "text-ink-2 hover:bg-peach-soft hover:text-ink")}
                >
                  {on && (
                    <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[11px] bg-peach" transition={{ type: "spring", stiffness: 520, damping: 40 }}>
                      <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand" />
                    </motion.span>
                  )}
                  <n.icon className={cn("relative z-10 size-[18px]", on ? "text-brand-ink" : "text-muted")} aria-hidden />
                  <span className="relative z-10">{n.label}</span>
                  {n.href === "/app/saved" && savedCount > 0 && (
                    <span className={cn("relative z-10 ml-auto grid h-5 min-w-5 place-items-center rounded-md px-1 text-[11px] font-bold", on ? "bg-brand text-ink" : "bg-sand text-ink-2")}>{savedCount}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <SidebarAccount />
        </aside>

        <div className="min-w-0 flex-1">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <Logo href="/" />
              <MobileAccount />
            </div>
            <nav aria-label="Dashboard" className="scroll-thin flex gap-1 overflow-x-auto px-3 pb-2.5">
              {NAV.map((n) => {
                const on = active(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold", on ? "bg-brand text-ink" : "text-ink-2")}
                  >
                    <n.icon className="size-4" aria-hidden />
                    {n.short ?? n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <main className="px-4 pb-24 pt-7 sm:px-8 lg:px-10 lg:pt-10">
            {!ready && <ShellSkeleton />}
            <div hidden={!ready}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-96 max-w-full" />
      <div className="skeleton h-14 w-full max-w-3xl rounded-2xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}
