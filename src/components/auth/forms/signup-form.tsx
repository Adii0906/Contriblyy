"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { emailSchema, nameSchema, passwordSchema, passwordStrength } from "@/lib/auth/schemas";
import { safeNext } from "@/lib/auth/redirect";
import { loadSession, readPendingSave } from "@/lib/client/account";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { AuthHeading, Field, FormAlert, PasswordField, postJson } from "../auth-ui";

type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

export function SignupForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get("next"), "/app");
  const [hasPending, setHasPending] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHasPending(Boolean(readPendingSave())), 0);
    return () => clearTimeout(t);
  }, []);
  const intentSave = params.get("intent") === "save" || hasPending;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<{ message: string; kind?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const validate = (): Errors => {
    const e: Errors = {};
    const n = nameSchema.safeParse(name);
    if (!n.success) e.name = n.error.issues[0]?.message;
    const em = emailSchema.safeParse(email);
    if (!em.success) e.email = em.error.issues[0]?.message;
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) e.password = pw.error.issues[0]?.message;
    else if (passwordStrength(password, email).score <= 1) e.password = "That password is easy to guess. Make it longer or less predictable.";
    if (!confirm) e.confirm = "Confirm your password.";
    else if (confirm !== password) e.confirm = "Passwords don't match.";
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError(null);
    const r = await postJson<{ status?: string }>("/api/auth/signup", { name: name.trim(), email: email.trim(), password, next });
    setBusy(false);
    if (!r.ok) return setFormError({ message: r.data.error ?? "Could not create your account.", kind: r.data.kind });
    if (r.data.status === "verify-email") return setSentTo(email.trim());
    await loadSession();
    useApp.getState().toast("ok", "Account created. You're signed in.");
    router.replace(next);
  };

  if (sentTo) return <CheckEmail email={sentTo} onRestart={() => setSentTo(null)} />;

  return (
    <>
      <AuthHeading eyebrow={intentSave ? "Create an account to save that issue" : "Free, no card needed"} title="Create your account">
        Already have one?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-bold text-brand-ink underline decoration-brand/40 underline-offset-4 hover:decoration-brand">
          Log in
        </Link>
      </AuthHeading>
      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        {formError && (
          <FormAlert tone="bad">
            {formError.message}
            {formError.kind === "exists" && (
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-1 block font-bold text-brand-ink underline underline-offset-2">
                Go to log in
              </Link>
            )}
          </FormAlert>
        )}
        <Field label="Name" name="name" autoComplete="name" required value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} placeholder="How we greet you" maxLength={60} />
        <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} placeholder="you@example.com" />
        <PasswordField label="Password" name="new-password" autoComplete="new-password" required value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} showStrength email={email} maxLength={72} />
        <PasswordField label="Confirm password" name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }} error={errors.confirm} maxLength={72} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Creating account" : "Create account"}
          {!busy && <ArrowRight aria-hidden />}
        </Button>
        <p className="text-center text-[12.5px] leading-relaxed text-muted">We store your name, email, skills and the issues you save. Nothing else.</p>
      </form>
    </>
  );
}

function CheckEmail({ email, onRestart }: { email: string; onRestart: () => void }) {
  const [cooldown, setCooldown] = useState(60);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  return (
    <div>
      <motion.span initial={{ scale: 0.5, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18 }} className="grid size-14 place-items-center rounded-[16px] border-2 border-ink bg-brand text-ink shadow-[4px_4px_0_var(--ink)]">
        <MailCheck className="size-6" aria-hidden />
      </motion.span>
      <AuthHeading title="Check your email">
        We sent a verification link to <span className="font-bold text-ink">{email}</span>. Open it to finish creating your account. Your account isn&rsquo;t active until you do.
      </AuthHeading>
      <div className="space-y-3">
        {state === "sent" && <FormAlert tone="ok">If that address can receive a link, a new one is on its way.</FormAlert>}
        {state === "error" && <FormAlert tone="bad">Could not resend right now. Wait a minute and try again.</FormAlert>}
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={cooldown > 0 || state === "sending"}
          onClick={async () => {
            setState("sending");
            const r = await postJson("/api/auth/resend", { email });
            setState(r.ok ? "sent" : "error");
            setCooldown(60);
          }}
        >
          {state === "sending" ? "Sending" : cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
        </Button>
        <p className="text-center text-[13px] text-muted">
          Wrong address?{" "}
          <button type="button" onClick={onRestart} className="font-bold text-brand-ink hover:underline">
            Start over
          </button>
        </p>
        <p className="text-center text-[12.5px] text-muted">The link can be opened on any device. Check your spam folder if it doesn&rsquo;t arrive in a few minutes.</p>
      </div>
    </div>
  );
}
