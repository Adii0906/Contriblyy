"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { loginSchema, firstError } from "@/lib/auth/schemas";
import { safeNext } from "@/lib/auth/redirect";
import { loadSession, readPendingSave } from "@/lib/client/account";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { AuthHeading, Field, FormAlert, PasswordField, postJson } from "../auth-ui";

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"), "/app");
  const [hasPending, setHasPending] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHasPending(Boolean(readPendingSave())), 0);
    return () => clearTimeout(t);
  }, []);
  const intentSave = params.get("intent") === "save" || hasPending;
  const reset = params.get("reset") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; kind?: string } | null>(null);
  const [resent, setResent] = useState<"idle" | "sending" | "sent">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setError({ message: firstError(parsed.error) });
    setBusy(true);
    setError(null);
    const r = await postJson("/api/auth/login", { email: parsed.data.email, password, next });
    if (!r.ok) {
      setBusy(false);
      return setError({ message: r.data.error ?? "Could not log you in.", kind: r.data.kind });
    }
    await loadSession();
    useApp.getState().toast("ok", "Welcome back.");
    router.replace(next);
  };

  const resend = async () => {
    setResent("sending");
    await postJson("/api/auth/resend", { email });
    setResent("sent");
  };

  return (
    <>
      <AuthHeading eyebrow={intentSave ? "Log in to save that issue" : "Welcome back"} title="Log in to Contribly">
        New here?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-bold text-brand-ink underline decoration-brand/40 underline-offset-4 hover:decoration-brand">
          Create an account
        </Link>
      </AuthHeading>

      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        {reset && <FormAlert tone="ok">Password updated. Log in with your new password.</FormAlert>}
        {error && (
          <FormAlert tone="bad">
            {error.message}
            {error.kind === "unverified" && (
              <span className="mt-1.5 block">
                {resent === "sent" ? (
                  <span className="font-semibold text-ok">If that account exists, a new link is on its way.</span>
                ) : (
                  <button type="button" onClick={resend} disabled={resent === "sending"} className="font-bold text-brand-ink underline underline-offset-2">
                    {resent === "sending" ? "Sending" : "Resend verification email"}
                  </button>
                )}
              </span>
            )}
          </FormAlert>
        )}
        <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          extra={
            <Link href="/forgot-password" className="text-[13px] font-semibold text-brand-ink hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Logging in" : "Log in"}
          {!busy && <ArrowRight aria-hidden />}
        </Button>
      </form>
    </>
  );
}
