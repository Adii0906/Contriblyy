import { describe, expect, it } from "vitest";
import { deriveWarnings } from "@/components/verify/warnings";
import { summarize } from "@/components/verify/meta";
import type { CheckRun, MaintainerData } from "@/lib/types";

const maint = (activity: MaintainerData["activity"], last: string | null = "2026-05-01T00:00:00Z"): CheckRun<MaintainerData> => ({
  status: "ok",
  data: { activity, maintainerComments30: 0, maintainerComments90: 0, distinctMaintainers90: 0, contributorComments90: 3, lastMaintainerCommentAt: last, sampleSize: 3, sampleSpanDays: 200, reasons: [] },
});

describe("card warnings only come from real evidence", () => {
  it("no checks -> no warnings, and summaries say not verified yet", () => {
    expect(deriveWarnings({})).toEqual([]);
    expect(summarize("maintainers", undefined)).toEqual({ tone: "pending", text: "Not verified yet" });
  });

  it("failed maintainer check never shows inactive", () => {
    const w = deriveWarnings({ maintainers: { status: "failed", error: "502" } });
    expect(w).toEqual([]);
    expect(summarize("maintainers", { status: "failed", error: "502" }).text).toBe("Could not check");
  });

  it("insufficient evidence is 'Needs review', not inactive", () => {
    expect(deriveWarnings({ maintainers: maint("insufficient") })).toEqual([]);
    expect(summarize("maintainers", maint("insufficient")).text).toBe("Needs review");
  });

  it("quiet maintainers -> red MAINTAINER INACTIVE with the dated evidence", () => {
    const [w] = deriveWarnings({ maintainers: maint("quiet") });
    expect(w?.severity).toBe("bad");
    expect(w?.title).toBe("Maintainer inactive");
    expect(w?.detail).toMatch(/No maintainer comments in the last 90 days/);
  });

  it("open linked PR and active claim are red; possible claim is amber; red sorts first", () => {
    const w = deriveWarnings({
      claims: { status: "ok", data: { status: "possible", claims: [{ commentId: 1, author: "x", association: "NONE", kind: "request", acknowledged: false, released: false, createdAt: "", ageDays: 4, url: "#", excerpt: "" }], commentsScanned: 1, commentsTotal: 1, interestOnly: 0, maintainerCommentedAt: null } },
      prs: { status: "ok", data: { status: "confirmed-open", prs: [{ number: 9, title: "", url: "u", state: "open", isDraft: false, author: null, createdAt: "", updatedAt: "", repo: "o/r", linkType: "closing" }], source: "graphql", complete: true } },
    });
    expect(w.map((x) => [x.check, x.severity])).toEqual([
      ["prs", "bad"],
      ["claims", "warn"],
    ]);
  });
});
