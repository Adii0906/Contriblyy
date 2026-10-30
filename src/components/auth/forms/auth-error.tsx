"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button-variants";
import { AuthHeading } from "../auth-ui";

const COPY: Record<string, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Verification and reset links work once and only for a limited time. Request a new one." },
  invalid: { title: "This link isn't valid", body: "The link is incomplete. Open it straight from the email, or request a new one." },
  unconfigured: { title: "Accounts aren't set up", body: "This server has no Supabase project configured." },
};

export function AuthErrorView() {
  const reason = useSearchParams().get("reason") ?? "invalid";
  const c = COPY[reason] ?? COPY.invalid!;
  return (
    <>
      <AuthHeading eyebrow="Link problem" title={c.title}>
        {c.body}
      </AuthHeading>
      <div className="grid gap-2.5">
        <Link href="/login" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Log in
        </Link>
        <Link href="/forgot-password" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Reset password
        </Link>
      </div>
      <p className="mt-4 text-center text-[13px] text-muted">Didn&rsquo;t verify your email yet? Log in and we&rsquo;ll offer to resend the link.</p>
    </>
  );
}
