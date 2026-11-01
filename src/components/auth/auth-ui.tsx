"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Eye, EyeOff, TriangleAlert, CircleCheck } from "lucide-react";
import { useId, useState } from "react";
import { Logo } from "@/components/brand";
import { Tick, ScratchX } from "@/components/ui/marks";
import { TestModeBanner } from "@/components/app/test-mode-banner";
import { passwordStrength } from "@/lib/auth/schemas";
import { cn } from "@/lib/utils";

/** Split layout: form on warm white, brand panel in orange. */
export function AuthLayout({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TestModeBanner />
      <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,0.85fr)]">
        <div className="flex flex-col px-5 py-6 sm:px-10">
          <header className="flex items-center justify-between">
            <Logo />
            <Link href="/app" className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-2 hover:text-ink">
              Browse without an account
            </Link>
          </header>
          <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              {children}
            </motion.div>
          </main>
        </div>
        <aside className="relative hidden overflow-hidden bg-brand lg:block" aria-hidden>
          <div className="dot-grid absolute inset-0 opacity-40" />
          <svg className="absolute -right-24 -top-24 size-[420px] opacity-25" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" fill="none" stroke="#202020" strokeWidth="2" strokeDasharray="4 9" strokeLinecap="round" />
          </svg>
          <div className="relative flex h-full flex-col justify-center px-12 xl:px-16">{aside ?? <DefaultAside />}</div>
        </aside>
      </div>
    </div>
  );
}

function DefaultAside() {
  const rows = [
    { t: "Unassigned", ok: true },
    { t: "No claims in comments", ok: true },
    { t: "No linked pull request", ok: true },
    { t: "Maintainer replied this week", ok: true },
  ];
  return (
    <div className="max-w-md">
      <p className="font-display text-[44px] font-bold leading-[1] tracking-[-0.045em] text-ink">Your issues, on every device.</p>
      <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-ink/75">Save the issues worth your time, with the evidence that made them worth it.</p>
      <div className="mt-9 rotate-[-2deg] rounded-[20px] border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
        <p className="font-mono text-[11px] text-muted">example-org/quillnote #184</p>
        <p className="mt-1 font-display text-[17px] font-bold leading-snug">Add cursor pagination to the notes API</p>
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <li key={r.t} className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="grid size-4 place-items-center rounded-full bg-ok-soft text-ok">{r.ok ? <Tick className="size-2.5" animate={false} /> : <ScratchX className="size-2.5" animate={false} />}</span>
              {r.t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">Illustration with example data</p>
      </div>
    </div>
  );
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="text-[13px] font-bold text-brand-ink">{eyebrow}</p>}
      <h1 className="mt-1.5 font-display text-[clamp(2rem,4vw,2.6rem)] font-bold leading-[1.05] tracking-[-0.04em]">{title}</h1>
      {children && <div className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

const inputCls =
  "h-12 w-full rounded-[12px] border-2 border-line-strong bg-paper px-3.5 text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus-visible:shadow-none aria-[invalid=true]:border-bad";

export function Field({
  label,
  hint,
  error,
  optional,
  required,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; optional?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[13px] font-bold text-ink">
        <span>
          {label}
          {required && <span aria-hidden="true" className="ml-1 text-bad">*</span>}
        </span>
        {optional && <span className="text-[12px] font-medium text-muted">Optional</span>}
      </label>
      <input id={id} aria-label={label} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={inputCls} {...input} />
      {error ? (
        <p id={`${id}-err`} aria-live="polite" className="mt-1.5 text-[13px] font-semibold text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  error,
  showStrength,
  email,
  extra,
  required,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; showStrength?: boolean; email?: string; extra?: React.ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const value = String(input.value ?? "");
  const strength = showStrength && value ? passwordStrength(value, email) : null;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-bold text-ink">
          {label}
          {required && <span aria-hidden="true" className="ml-1 text-bad">*</span>}
        </label>
        {extra}
      </div>
      <div className="relative">
        <input id={id} aria-label={label} type={visible ? "text" : "password"} required={required} aria-invalid={Boolean(error)} aria-describedby={`${id}-desc`} className={cn(inputCls, "pr-12")} {...input} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[9px] text-muted hover:bg-peach-soft hover:text-ink"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <div id={`${id}-desc`}>
        {error && <p className="mt-1.5 text-[13px] font-semibold text-bad">{error}</p>}
        {strength && !error && (
          <div className="mt-2" aria-live="polite">
            <div className="flex gap-1" aria-hidden>
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={cn("h-1.5 flex-1 rounded-full transition-colors duration-200", n <= strength.score ? (strength.score <= 1 ? "bg-bad" : strength.score === 2 ? "bg-[#e9b45c]" : strength.score === 3 ? "bg-brand" : "bg-ok") : "bg-line")}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">
              <span className="font-bold text-ink-2">{strength.label}.</span> {strength.tips[0] ?? "Looks good."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: "bad" | "ok" | "info"; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-[12px] px-3.5 py-3 text-[14px] leading-snug", tone === "bad" ? "bg-bad-soft text-ink" : tone === "ok" ? "bg-ok-soft text-ink" : "bg-peach-soft text-ink")}
    >
      {tone === "bad" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden /> : <CircleCheck className={cn("mt-0.5 size-4 shrink-0", tone === "ok" ? "text-ok" : "text-brand-ink")} aria-hidden />}
      <div>{children}</div>
    </motion.div>
  );
}

export async function postJson<T = Record<string, unknown>>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; kind?: string; status?: string; field?: string } }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach Contribly. Check your connection and try again." } as T & { error?: string } };
  }
}
