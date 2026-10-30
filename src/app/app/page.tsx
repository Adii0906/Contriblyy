"use client";

import { FilterBar, Metrics, PageHeading, ResultList, SearchBox, SkillChips, useAutoRun, useRankedRun } from "@/components/app/results";
import { TokenNotice } from "@/components/app/token-notice";
import { useApp } from "@/lib/client/store";

export default function DiscoverPage() {
  useAutoRun("discover");
  const { run, rows, filtered } = useRankedRun("discover");
  const returning = useApp((s) => s.history.length > 1);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="space-y-6">
        <PageHeading eyebrow={returning ? "Welcome back" : "Welcome to Contribly"} title="Your next contribution starts here." />
        <SearchBox kind="discover" />
        <SkillChips />
      </header>
      <TokenNotice />
      {run.status !== "error" && <Metrics rows={rows} partial={run.partial} />}
      {run.issues.length > 0 && <FilterBar rows={rows} />}
      <ResultList kind="discover" rows={filtered} />
    </div>
  );
}
