"use client";

import { KeyRound } from "lucide-react";
import { useApp } from "@/lib/client/store";

/** Shown only in live mode when the server has no GitHub token configured. */
export function TokenNotice() {
  const server = useApp((s) => s.server);
  if (!server || server.mode !== "live" || server.token) return null;
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-warn/25 bg-warn-soft p-4 text-sm">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p className="text-ink-2">
        <span className="font-bold text-ink">No GitHub token on the server.</span> Unauthenticated GitHub allows 10 searches a minute and 60 API calls an hour, so verification will stall quickly. Add GITHUB_TOKEN to .env.local and restart.
      </p>
    </div>
  );
}
