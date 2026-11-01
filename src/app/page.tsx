import Link from "next/link";
import { CircleDot, Clock3, GitPullRequestArrow, MessageSquareText, Minus, ScrollText, UserRoundX } from "lucide-react";
import { Logo } from "@/components/brand";
import { LandingAccount, StartLink } from "@/components/landing/start-link";
import { Intro, INTRO_BOOT_SCRIPT } from "@/components/landing/intro";
import { HeroStage } from "@/components/landing/hero-stage";
import { Workflow } from "@/components/landing/workflow";
import { VerificationDemo } from "@/components/landing/verification-demo";
import { Reveal } from "@/components/landing/reveal";
import { CommunityReviews } from "@/components/landing/community-reviews";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const HIDDEN_SIGNALS = [
  { icon: MessageSquareText, title: "Someone already said “I’m on it”", body: "The claim sits in the comments. The sidebar still says no one is assigned." },
  { icon: GitPullRequestArrow, title: "A pull request is in flight", body: "An open PR already closes the issue, in a tab you never opened." },
  { icon: Clock3, title: "No one is reviewing", body: "The last maintainer reply was months ago, so your PR could sit unread." },
  { icon: ScrollText, title: "The rules say otherwise", body: "CONTRIBUTING asks you to be assigned first, or does not accept AI-generated changes." },
];

const COMPARE = [
  { what: "Finds open issues by language and label", github: "Yes", contribly: "Yes, built from your skills and level" },
  { what: "Reads comments for “I’d like to work on this”", github: "You read every thread yourself", contribly: "Detected, dated and linked" },
  { what: "Finds pull requests that already fix it", github: "Hidden in the timeline", contribly: "Linked PRs separated from loose mentions" },
  { what: "Tells you if maintainers are around", github: "Not shown", contribly: "Recent maintainer comments, counted" },
  { what: "Checks CONTRIBUTING and AI policies", github: "Not shown", contribly: "Restrictions quoted with a link" },
  { what: "Fits the issue to your time", github: "Not shown", contribly: "Scope estimated, or marked unclear" },
];

const FACTS: [string, string][] = [
  ["6", "checks per issue"],
  ["3", "clear verdicts"],
  ["0", "accounts needed"],
];

export default function Landing() {
  return (
    <div className="relative overflow-x-clip">
      {/* Runs before first paint: decides whether the first-visit intro plays. */}
      <script dangerouslySetInnerHTML={{ __html: INTRO_BOOT_SCRIPT }} />
      <Intro />
      <header className="relative z-20 mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-5 min-[380px]:px-5 sm:px-8">
        <Logo className="shrink-0 max-[359px]:[&>span]:sr-only" />
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:text-ink lg:inline">How it works</a>
          <a href="#different" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 hover:text-ink lg:inline">Why Contribly</a>
          <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-line-strong lg:block" />
          <LandingAccount />
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-24 size-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(255,107,53,0.22),transparent)]" />
          <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pb-24 lg:pt-10 [&>*]:min-w-0">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-3 py-1 text-[13px] font-semibold text-ink-2">
                <span className="size-2 rounded-full bg-brand" aria-hidden /> For open-source contributors
              </p>
              <h1 className="mt-6 font-display text-[clamp(2.9rem,6.6vw,5.4rem)] font-bold leading-[0.98] tracking-[-0.045em] text-balance">Stop chasing issues that go nowhere.</h1>
              <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-ink-2">
                Find open-source issues that match your skills. Contribly checks the signals GitHub doesn&rsquo;t, so you can spend more time contributing and less time investigating.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <StartLink />
                <a href="#how" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>See how it works</a>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line-strong pt-5">
                {FACTS.map(([n, l]) => (
                  <div key={l}>
                    <dt className="sr-only">{l}</dt>
                    <dd className="font-display text-3xl font-bold tracking-[-0.03em] text-brand-ink">{n}</dd>
                    <dd className="mt-0.5 text-[13px] text-muted">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <HeroStage />
          </div>
        </section>

        {/* Problem: charcoal band */}
        <section className="relative bg-ink text-white">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal>
              <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance">Open and unassigned is where checking starts.</h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/70">
                The labels look inviting. Nobody is assigned. You spend an evening on a fix, open a pull request, and find out someone got there first.
              </p>
              <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
                <CircleDot className="size-4 text-[#4ade80]" aria-hidden />
                <span className="font-semibold">Open</span>
                <span className="h-4 w-px bg-white/20" aria-hidden />
                <UserRoundX className="size-4 text-white/60" aria-hidden />
                <span className="text-white/70">No one assigned</span>
              </div>
              <p className="mt-2 text-xs text-white/50">All a quick look at GitHub tells you.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {HIDDEN_SIGNALS.map((s) => (
                  <li key={s.title} className="rounded-[18px] border border-white/10 bg-white/[0.04] p-5">
                    <span className="grid size-9 place-items-center rounded-[10px] bg-brand text-ink">
                      <s.icon className="size-[18px]" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-display text-[17px] font-bold tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/65">{s.body}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-28">
          <Reveal className="max-w-2xl">
            <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.04em]">Three passes before an issue reaches you.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">Each pass removes a reason an issue might waste your time.</p>
          </Reveal>
          <div className="mt-14">
            <Workflow />
          </div>
        </section>

        {/* Verification demo */}
        <section className="border-y border-line bg-peach-soft">
          <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-8">
            <Reveal className="mb-12 max-w-2xl">
              <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.04em]">See the verdict, and the reason behind it.</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
                Every issue ends up promising, needs review, or not recommended. Each warning links to the comment, pull request or policy line it came from.
              </p>
            </Reveal>
            <Reveal delay={0.05}>
              <VerificationDemo />
            </Reveal>
          </div>
        </section>

        {/* Different */}
        <section id="different" className="mx-auto max-w-[1200px] scroll-mt-8 px-5 py-24 sm:px-8 lg:py-28">
          <Reveal className="grid gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="font-display text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.04em]">Not another issue search.</h2>
            <p className="max-w-[50ch] text-[17px] leading-relaxed text-ink-2">GitHub search finds issues. Contribly does the reading you would otherwise do in a dozen tabs, and tells you plainly when it could not check something.</p>
          </Reveal>
          <Reveal delay={0.05} className="mt-12">
            <div className="overflow-hidden rounded-[22px] border border-line bg-paper shadow-[var(--shadow-card)]">
              <div className="hidden grid-cols-[1.2fr_1fr_1fr] border-b border-line bg-[#fffcf8] text-[13px] font-bold md:grid">
                <span className="px-6 py-4 text-muted">What you need to know</span>
                <span className="px-6 py-4 text-muted">GitHub issue search</span>
                <span className="flex items-center gap-2 border-l-[3px] border-brand bg-peach-soft px-6 py-4 text-ink">
                  <span className="size-2 rounded-full bg-brand" aria-hidden /> Contribly
                </span>
              </div>
              <dl className="divide-y divide-line">
                {COMPARE.map((r) => (
                  <div key={r.what} className="grid gap-1 md:grid-cols-[1.2fr_1fr_1fr] md:gap-0">
                    <dt className="px-6 pt-5 font-display text-[16px] font-bold md:py-5">{r.what}</dt>
                    <dd className="flex items-center gap-2 px-6 text-[14.5px] text-muted md:py-5">
                      <span className="font-semibold text-ink-2 md:hidden">GitHub:</span>
                      {r.github === "Not shown" ? <Minus className="size-4" aria-hidden /> : null}
                      {r.github}
                    </dd>
                    <dd className="px-6 pb-5 text-[14.5px] font-semibold text-ink md:border-l-[3px] md:border-brand md:bg-peach-soft/60 md:py-5">
                      <span className="text-brand-ink md:hidden">Contribly: </span>
                      {r.contribly}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </section>

        <CommunityReviews />

        {/* Final CTA */}
        <section className="px-5 pb-20 sm:px-8">
          <Reveal className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[30px] bg-brand px-6 py-16 text-center sm:px-12 sm:py-20">
            <svg aria-hidden className="pointer-events-none absolute -left-10 -top-10 size-64 opacity-30" viewBox="0 0 200 200">
              <path d="M20 120 C 60 40, 140 40, 180 110" fill="none" stroke="#202020" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
            </svg>
            <svg aria-hidden className="pointer-events-none absolute -bottom-12 -right-6 size-72 opacity-30" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="70" fill="none" stroke="#202020" strokeWidth="3" strokeDasharray="4 9" strokeLinecap="round" />
            </svg>
            <p className="relative mx-auto max-w-3xl font-display text-[clamp(2.1rem,5vw,3.9rem)] font-bold leading-[1.02] tracking-[-0.045em] text-ink text-balance">
              Find the right issue. Check the signals. Make your contribution count.
            </p>
            <div className="relative mt-9 flex justify-center">
              <StartLink variant="ink" />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
          <Logo />
          <p>Uses public GitHub data. Verdicts are evidence, not guarantees.</p>
          <Link href="/app" className="font-semibold text-ink-2 hover:text-ink">Open dashboard</Link>
        </div>
      </footer>
    </div>
  );
}
