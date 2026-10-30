"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import type {
  AssessmentResult,
  AssignmentData,
  CheckKey,
  CheckRun,
  ClaimsData,
  MaintainerData,
  PolicyData,
  PrData,
  RepoData,
} from "@/lib/types";
import { CHECK_LABEL, CHECK_ORDER } from "@/lib/verify/assess";
import { POLICY_LABEL } from "@/lib/verify/policy";
import type { MatchResult } from "@/lib/match/score";
import { cn, timeAgo } from "@/lib/utils";
import { safeHref } from "@/lib/auth/redirect";
import { summarize, TONE_COLOR } from "./meta";
import { Button } from "@/components/ui/button";

const gh = (login: string) => `https://github.com/${login}`;

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={safeHref(href)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-ink underline decoration-brand/40 underline-offset-2 hover:decoration-brand">
      {children}
    </a>
  );
}

function Quote({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <blockquote className={cn("border-l-[3px] pl-3 text-[13.5px] leading-relaxed text-ink", tone === "warn" ? "border-warn" : "border-brand")}>
      {children}
    </blockquote>
  );
}

function Detail({ check, run }: { check: CheckKey; run: CheckRun<unknown> }) {
  if (run.status === "failed") return <p className="text-ink-2">This check could not finish ({run.error}). It is shown as not verified, never as a pass or a fail. Recheck to try again.</p>;
  switch (check) {
    case "assignment": {
      const d = run.data as AssignmentData;
      return (
        <p className="text-ink-2">
          Issue is {d.state}
          {d.assignees.length ? (
            <> and assigned to {d.assignees.map((a, i) => <span key={a}>{i > 0 && ", "}<A href={gh(a)}>@{a}</A></span>)}.</>
          ) : (
            <> with no assignee. Unassigned is where checking starts, not proof it is free.</>
          )}
          {d.locked && " The conversation is locked."}
        </p>
      );
    }
    case "claims": {
      const d = run.data as ClaimsData;
      return (
        <div className="space-y-3">
          {d.claims.length === 0 ? (
            <p className="text-ink-2">
              No intent to work on it in {d.commentsScanned} comment{d.commentsScanned === 1 ? "" : "s"}
              {d.commentsScanned < d.commentsTotal ? ` (of ${d.commentsTotal}; first and last pages read)` : ""}.
            </p>
          ) : (
            d.claims.map((c) => (
              <figure key={c.commentId} className="space-y-1.5">
                <Quote>&ldquo;{c.excerpt}&rdquo;</Quote>
                <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-3.5 text-xs text-muted">
                  <A href={gh(c.author)}>@{c.author}</A>
                  <span>{c.kind === "active" ? "says they are working on it" : "asked to work on it"}</span>
                  {c.acknowledged && <span className="font-semibold text-warn">maintainer agreed</span>}
                  {c.released && <span>later stepped back</span>}
                  <span>last active {c.ageDays === 0 ? "today" : `${c.ageDays} days ago`}</span>
                  <A href={c.url}>
                    comment <ExternalLink className="size-3" />
                  </A>
                </figcaption>
              </figure>
            ))
          )}
          {d.claims.length > 0 && <p className="text-xs text-muted">Activity within 30 days counts as active, up to 90 days as uncertain, older as stale. Asking on the thread is the surest check.</p>}
          {d.interestOnly > 0 && <p className="text-xs text-muted">{d.interestOnly} comment{d.interestOnly === 1 ? "" : "s"} asked whether someone is working on it.</p>}
          {d.maintainerCommentedAt && <p className="text-xs text-muted">A maintainer last commented here {timeAgo(d.maintainerCommentedAt)}.</p>}
        </div>
      );
    }
    case "prs": {
      const d = run.data as PrData;
      const linkText = { closing: "closing link", connected: "linked in sidebar", mention: "mentions this issue" } as const;
      return (
        <div className="space-y-2">
          {d.prs.length === 0 ? (
            <p className="text-ink-2">No pull request references this issue in the data GitHub returned.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.prs.map((p) => (
                <li key={p.url} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px]">
                  <span className={cn("rounded-md px-1.5 py-px text-[11px] font-bold", p.state === "open" ? "bg-bad-soft text-bad" : p.state === "merged" ? "bg-ink text-white" : "bg-sand text-muted")}>
                    {p.isDraft && p.state === "open" ? "draft" : p.state}
                  </span>
                  <A href={p.url}>
                    <span className="font-mono text-xs">#{p.number}</span> {p.title}
                  </A>
                  <span className="text-xs text-muted">
                    {linkText[p.linkType]}
                    {p.author ? `, by @${p.author}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Source: {d.source === "graphql" ? "GitHub closing references and timeline (GraphQL)" : "issue timeline cross references (REST)"}.
            {!d.complete && " The timeline was longer than what was scanned, so this is not exhaustive."}
          </p>
        </div>
      );
    }
    case "repo": {
      const d = run.data as RepoData;
      return (
        <div className="space-y-1">
          <ul className="space-y-1 text-ink-2">
            {d.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="text-xs text-muted">
            {d.language ? `${d.language}. ` : ""}
            {d.stars.toLocaleString()} stars. 90-day window for commits and merges.
          </p>
        </div>
      );
    }
    case "maintainers": {
      const d = run.data as MaintainerData;
      return (
        <ul className="space-y-1 text-ink-2">
          {d.reasons.map((r, i) => <li key={r} className={i === d.reasons.length - 1 ? "text-xs text-muted" : ""}>{r}</li>)}
          {d.lastMaintainerCommentAt && <li className="text-xs text-muted">Latest maintainer comment {timeAgo(d.lastMaintainerCommentAt)}.</li>}
        </ul>
      );
    }
    case "policy": {
      const d = run.data as PolicyData;
      return (
        <div className="space-y-3">
          {d.findings.length === 0 ? (
            <p className="text-ink-2">
              No explicit restriction detected. <span className="text-muted">That does not mean AI-generated contributions are welcome; read the guidelines before you start.</span>
            </p>
          ) : (
            d.findings.map((f) => (
              <figure key={f.type} className="space-y-1.5">
                <figcaption className={cn("text-xs font-bold", f.severity === "warning" ? "text-warn" : "text-ink-2")}>{POLICY_LABEL[f.type]}</figcaption>
                <Quote tone={f.severity === "warning" ? "warn" : "neutral"}>&ldquo;{f.excerpt}&rdquo;</Quote>
                <div className="pl-3.5 text-xs">
                  <A href={f.url}>
                    {f.doc} <ExternalLink className="size-3" />
                  </A>
                </div>
              </figure>
            ))
          )}
          <p className="text-xs text-muted">
            Read: {d.docsChecked.length ? d.docsChecked.map((x, i) => <span key={x.url}>{i > 0 && ", "}<A href={x.url}>{x.name}</A></span>) : "no README or CONTRIBUTING found"}.
          </p>
        </div>
      );
    }
  }
}

export function EvidencePanel({
  checks,
  result,
  match,
  checkedAt,
  cached,
  scanning,
  error,
  onRecheck,
}: {
  checks: Partial<Record<CheckKey, CheckRun<unknown>>>;
  result?: AssessmentResult;
  match: MatchResult;
  checkedAt?: string;
  cached?: boolean;
  scanning: boolean;
  error?: string;
  onRecheck: () => void;
}) {
  return (
    <div className="grid gap-8 border-t border-dashed border-line-strong bg-[#fffcf8] px-5 pb-6 pt-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_290px]">
      <dl className="divide-y divide-line">
        {CHECK_ORDER.map((k) => {
          const run = checks[k];
          const s = summarize(k, run);
          return (
            <div key={k} className="grid gap-1.5 py-4 text-sm first:pt-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-5">
              <dt className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
                <span className="size-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[s.tone] }} aria-hidden />
                {CHECK_LABEL[k]}
              </dt>
              <dd className="min-w-0 leading-relaxed">
                {run ? (
                  <>
                    <p className="mb-1 font-semibold" style={{ color: s.tone === "ok" ? "var(--ok)" : s.tone === "neutral" || s.tone === "failed" ? "var(--ink)" : TONE_COLOR[s.tone] }}>
                      {s.text}
                    </p>
                    <Detail check={k} run={run} />
                  </>
                ) : scanning ? (
                  <span className="inline-flex items-center gap-2 text-muted">
                    <span className="skeleton inline-block h-3 w-40" /> checking
                  </span>
                ) : (
                  <span className="text-muted">Not verified yet.</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <aside className="space-y-7 text-sm">
        <section aria-labelledby="why">
          <h4 id="why" className="mb-2.5 font-display text-base font-bold">Why this verdict</h4>
          {error && <p className="mb-2 font-medium text-bad">{error}</p>}
          {result ? (
            result.reasons.length ? (
              <ul className="space-y-2">
                {result.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 leading-snug">
                    <span className="mt-[6px] size-2 shrink-0 rounded-full" style={{ background: r.severity === "blocking" ? "var(--bad)" : r.severity === "review" ? "var(--warn)" : "var(--line-strong)" }} aria-hidden />
                    <span className={r.severity === "info" ? "text-muted" : "text-ink-2"}>{r.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">No major blocking signals detected in the checks performed.</p>
            )
          ) : (
            <p className="text-muted">{scanning ? "Waiting for every check to report back." : "Not verified yet."}</p>
          )}
          <p className="mt-3 text-xs text-muted">Observed from public GitHub data. An evidence-based assessment, not a guarantee.</p>
        </section>

        <section aria-labelledby="fit">
          <h4 id="fit" className="mb-1 font-display text-base font-bold">How it fits you</h4>
          <p className="mb-3 text-xs text-muted">Estimated from labels, text and your profile.</p>
          <ul className="space-y-3.5">
            {match.factors.map((f) => (
              <li key={f.key}>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-ink">{f.label}</span>
                  <span className="tabular-nums text-muted">
                    {f.points}/{f.max}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(f.points / f.max) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{f.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
          <span>
            {checkedAt ? (
              <>
                Checked {timeAgo(checkedAt)}
                {cached ? " (cached)" : ""}
              </>
            ) : scanning ? (
              "Checking now"
            ) : (
              "Not verified yet"
            )}
          </span>
          <Button size="sm" variant="secondary" onClick={onRecheck} disabled={scanning}>
            <RefreshCw className={cn(scanning && "animate-spin")} /> {scanning ? "Checking" : "Recheck"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
