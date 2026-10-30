"use client";

import { useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Metrics, PageHeading, ResultList, SkillChips, useAutoRun, useRankedRun } from "@/components/app/results";
import { TokenNotice } from "@/components/app/token-notice";
import { Button } from "@/components/ui/button";
import { runDiscover } from "@/lib/client/actions";
import { useApp, EMPTY_FILTERS } from "@/lib/client/store";
import { applyFilters } from "@/lib/client/use-ranked";

export default function RecommendedPage() {
  useAutoRun("recommended");
  const { run, rows } = useRankedRun("recommended", "best");
  const [showBlocked, setShowBlocked] = useState(false);
  const profile = useApp((s) => s.profile);
  // Recommendations ignore Discover filters; they only hide likely-unavailable issues by default.
  const base = applyFilters(rows, EMPTY_FILTERS);
  const available = base.filter((r) => r.status !== "likely-unavailable");
  const visible = showBlocked ? base : available;
  const hidden = base.length - available.length;

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-5">
          <PageHeading eyebrow="Picked for you" title="Recommended">
            Ranked by evidence first, then by how well each issue fits your skills, level and {profile?.time} hours a week.
          </PageHeading>
          <SkillChips interactive={false} />
        </div>
        <Button onClick={() => void runDiscover("recommended")} disabled={run.status === "loading"}>
          <RefreshCw className={run.status === "loading" ? "animate-spin" : ""} /> Refresh
        </Button>
      </header>
      <TokenNotice />
      {run.status !== "error" && <Metrics rows={rows} partial={run.partial} />}
      <ResultList kind="recommended" rows={visible} limit={20} />
      {hidden > 0 && run.status === "ready" && (
        <button type="button" onClick={() => setShowBlocked((s) => !s)} className="inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold text-ink-2 hover:bg-peach-soft hover:text-ink">
          {showBlocked ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {showBlocked ? "Hide" : "Show"} {hidden} not recommended issue{hidden === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
