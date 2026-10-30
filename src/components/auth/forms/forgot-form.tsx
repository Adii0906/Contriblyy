"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { emailSchema } from "@/lib/auth/schemas";
import { Button } from "@/components/ui/button";
import { AuthHeading, Field, FormAlert, postJson } from "../auth-ui";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
    setBusy(true);
    setError(null);
    const r = await postJson("/api/auth/forgot", { email: parsed.data });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? "Could not send the email. Try again.");
    setSent(true);
  };

  if (sent) {
    return (
      <div>
        <span className="grid size-14 place-items-center rounded-[16px] border-2 border-ink bg-brand text-ink shadow-[4px_4px_0_var(--ink)]">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <AuthHeading title="Check your email">
          If an account exists for <span className="font-bold text-ink">{email}</span>, we sent a link to set a new password. It expires after a short time and works once.
        </AuthHeading>
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to log in
        </Link>
      </div>
    );
  }

  return (
    <>
      <AuthHeading eyebrow="Forgot your password?" title="Reset your password">
        Enter the email you signed up with and we&rsquo;ll send you a link to choose a new one.
      </AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        {error && <FormAlert tone="bad">{error}</FormAlert>}
        <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Sending link" : "Send reset link"}
        </Button>
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to log in
        </Link>
      </form>
    </>
  );
}
