"use client";

import { useRouter } from "next/navigation";
import { Play, Sparkles, Search, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useApp } from "@/lib/client/store";
import { runDiscover } from "@/lib/client/actions";
import { PageHeading } from "@/components/app/results";
import { EmptyHistoryArt } from "@/components/app/illustrations";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  const history = useApp((s) => s.history);
  const clear = useApp((s) => s.clearHistory);
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <PageHeading eyebrow="Kept in this browser" title="Search history">
          Your last 50 searches. Run any of them again with your current skills.
        </PageHeading>
        {history.length > 0 && (
          <Button variant="ghost" onClick={() => window.confirm("Clear all search history?") && clear()}>
            Clear history
          </Button>
        )}
      </header>

      {history.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border-2 border-dashed border-line-strong bg-paper/60 px-6 py-16 text-center">
          <EmptyHistoryArt />
          <p className="mt-4 font-display text-xl font-bold">No searches yet</p>
          <p className="mt-1.5 text-sm text-ink-2">Searches from Discover and Recommended appear here.</p>
        </div>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-line-strong">
          {history.map((h, i) => {
            const Icon = h.error ? TriangleAlert : h.kind === "recommended" ? Sparkles : Search;
            return (
              <motion.li key={h.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="relative flex gap-4">
                <span className={cn("relative z-10 mt-3 grid size-10 shrink-0 place-items-center rounded-[12px] border-2", h.error ? "border-bad/30 bg-bad-soft text-bad" : "border-line-strong bg-paper text-brand-ink")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3 rounded-[18px] border border-line bg-paper px-5 py-4 shadow-[var(--shadow-card)]">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] font-bold">{h.keywords ? <>&ldquo;{h.keywords}&rdquo;</> : h.kind === "recommended" ? "Recommendations" : "All matching issues"}</p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">{h.skills.join(", ")}</p>
                    <p className="mt-1 text-[13px] text-ink-2">
                      {timeAgo(h.at)}.{" "}
                      {h.error ? (
                        <span className="font-semibold text-bad">Failed: {h.error}</span>
                      ) : (
                        <>
                          <span className="font-semibold text-ink">{h.results}</span> result{h.results === 1 ? "" : "s"}
                          {h.partial ? ", partial" : ""}.
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void runDiscover("discover", { keywords: h.keywords });
                      router.push("/app");
                    }}
                  >
                    <Play /> Run again
                  </Button>
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
