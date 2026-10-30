import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mark: an orange tile carrying a hand-drawn check, the "verified" gesture. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#FF6B35" />
      <rect x="1" y="1" width="30" height="30" rx="9" fill="none" stroke="#202020" strokeOpacity="0.12" />
      <path d="M8.5 16.8c2 1.4 3.6 3.1 4.9 5.2 2.6-5.6 5.9-9.6 10.3-12.6" fill="none" stroke="#202020" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className, tone = "ink" }: { href?: string; className?: string; tone?: "ink" | "light" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-lg", className)} aria-label="Contribly home">
      <LogoMark />
      <span className={cn("font-display text-[19px] font-bold tracking-[-0.035em]", tone === "light" ? "text-white" : "text-ink")}>contribly</span>
    </Link>
  );
}
