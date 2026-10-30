"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/lib/client/store";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** Sends returning guests straight to recommendations, new visitors to onboarding. */
export function StartLink({
  className,
  size = "lg",
  variant = "primary",
  children = "Find my first issue",
  arrow = true,
}: {
  className?: string;
  size?: "md" | "lg" | "sm";
  variant?: "primary" | "ink";
  children?: React.ReactNode;
  arrow?: boolean;
}) {
  const hasProfile = useApp((s) => s.hydrated && Boolean(s.profile));
  return (
    <Link href={hasProfile ? "/app/recommended" : "/onboarding"} className={cn(buttonVariants({ variant, size }), "group", className)}>
      {children}
      {arrow && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />}
    </Link>
  );
}

/**
 * Landing header actions. Guests (and the brief moment before the session is
 * known) see Log in and Create account; signed-in users get their dashboard.
 */
export function LandingAccount() {
  const status = useApp((s) => s.auth.status);
  if (status === "signed-in") {
    return (
      <Link href="/app" className={cn(buttonVariants({ variant: "ink", size: "sm" }), "ml-1")}>
        Open dashboard
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1 sm:gap-1.5" data-testid="landing-auth">
      <Link href="/login" className="inline-flex h-9 items-center rounded-[10px] px-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-peach-soft hover:text-ink sm:px-3">
        Log in
      </Link>
      <Link href="/signup" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "h-9 px-3 sm:px-3.5")}>
        Create account
      </Link>
    </div>
  );
}
