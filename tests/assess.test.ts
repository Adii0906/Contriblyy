import { describe, expect, it } from "vitest";
import { assess } from "@/lib/verify/assess";
import type { VerificationChecks } from "@/lib/types";

function clean(): VerificationChecks {
  return {
    assignment: { status: "ok", data: { state: "open", assignees: [], locked: false } },
    claims: { status: "ok", data: { status: "none", claims: [], commentsScanned: 2, commentsTotal: 2, interestOnly: 0, maintainerCommentedAt: null } },
    prs: { status: "ok", data: { status: "none", prs: [], source: "graphql", complete: true } },
    repo: {
      status: "ok",
      data: { activity: "recently-active", archived: false, disabled: false, language: "Python", topics: [], stars: 1, pushedAt: null, commits90: 20, commitsCapped: false, lastCommitAt: null, merged90: 5, lastMergedAt: null, reasons: [] },
    },
    maintainers: {
      status: "ok",
      data: { activity: "responsive", maintainerComments30: 6, maintainerComments90: 10, distinctMaintainers90: 2, contributorComments90: 5, lastMaintainerCommentAt: null, sampleSize: 30, sampleSpanDays: 40, reasons: [] },
    },
    policy: { status: "ok", data: { status: "none-detected", findings: [], docsChecked: [] } },
  };
}

const claim = { commentId: 1, author: "a", association: "NONE", acknowledged: false, released: false, createdAt: "", url: "#", excerpt: "" };

describe("assessment rules", () => {
  it("all clear -> promising", () => {
    expect(assess(clean()).assessment).toBe("promising");
  });

  it("assigned -> likely unavailable", () => {
    const c = clean();
    c.assignment = { status: "ok", data: { state: "open", assignees: ["someone"], locked: false } };
    const r = assess(c);
    expect(r.assessment).toBe("likely-unavailable");
    expect(r.reasons[0]?.text).toMatch(/@someone/);
  });

  it("closed issue -> likely unavailable", () => {
    const c = clean();
    c.assignment = { status: "ok", data: { state: "closed", assignees: [], locked: false } };
    expect(assess(c).assessment).toBe("likely-unavailable");
  });

  it("active claim -> likely unavailable", () => {
    const c = clean();
    c.claims = { status: "ok", data: { status: "active", claims: [{ ...claim, kind: "active", ageDays: 2 }], commentsScanned: 1, commentsTotal: 1, interestOnly: 0, maintainerCommentedAt: null } };
    expect(assess(c).assessment).toBe("likely-unavailable");
  });

  it("possible claim -> needs review", () => {
    const c = clean();
    c.claims = { status: "ok", data: { status: "possible", claims: [{ ...claim, kind: "request", ageDays: 6 }], commentsScanned: 1, commentsTotal: 1, interestOnly: 0, maintainerCommentedAt: null } };
    const r = assess(c);
    expect(r.assessment).toBe("needs-review");
    expect(r.reasons[0]?.text).toMatch(/6 days ago/);
  });

  it("stale claim stays promising with an info note", () => {
    const c = clean();
    c.claims = { status: "ok", data: { status: "stale", claims: [{ ...claim, kind: "request", acknowledged: true, ageDays: 130 }], commentsScanned: 2, commentsTotal: 2, interestOnly: 0, maintainerCommentedAt: null } };
    const r = assess(c);
    expect(r.assessment).toBe("promising");
    expect(r.reasons.some((x) => x.severity === "info" && /Older claim/.test(x.text))).toBe(true);
  });

  it("confirmed open PR -> likely unavailable", () => {
    const c = clean();
    c.prs = { status: "ok", data: { status: "confirmed-open", prs: [{ number: 64, title: "", url: "", state: "open", isDraft: false, author: null, createdAt: "", updatedAt: "", repo: "o/r", linkType: "closing" }], source: "graphql", complete: true } };
    expect(assess(c).assessment).toBe("likely-unavailable");
  });

  it("archived repo -> likely unavailable", () => {
    const c = clean();
    if (c.repo?.status === "ok") c.repo.data.activity = "archived";
    if (c.repo?.status === "ok") c.repo.data.archived = true;
    expect(assess(c).assessment).toBe("likely-unavailable");
  });

  it("limited activity -> needs review", () => {
    const c = clean();
    if (c.repo?.status === "ok") c.repo.data.activity = "limited";
    expect(assess(c).assessment).toBe("needs-review");
  });

  it("AI restriction -> needs review (not unavailable)", () => {
    const c = clean();
    c.policy = { status: "ok", data: { status: "restriction", findings: [{ type: "ai-restricted", severity: "warning", doc: "CONTRIBUTING", url: "", excerpt: "" }], docsChecked: [] } };
    expect(assess(c).assessment).toBe("needs-review");
  });

  it("assignment-required policy alone is informational", () => {
    const c = clean();
    c.policy = { status: "ok", data: { status: "requirements", findings: [{ type: "assignment-required", severity: "info", doc: "CONTRIBUTING", url: "", excerpt: "" }], docsChecked: [] } };
    expect(assess(c).assessment).toBe("promising");
  });

  it("any failed check -> needs review and listed as incomplete", () => {
    const c = clean();
    c.repo = { status: "failed", error: "GitHub returned 502" };
    const r = assess(c);
    expect(r.assessment).toBe("needs-review");
    expect(r.incomplete).toEqual(["repo"]);
    expect(r.reasons.some((x) => /could not be completed/.test(x.text))).toBe(true);
  });

  it("missing core check -> needs review", () => {
    const c = clean();
    delete c.claims;
    expect(assess(c).assessment).toBe("needs-review");
  });

  it("blocking beats review", () => {
    const c = clean();
    c.repo = { status: "failed", error: "x" };
    c.assignment = { status: "ok", data: { state: "open", assignees: ["z"], locked: false } };
    const r = assess(c);
    expect(r.assessment).toBe("likely-unavailable");
    expect(r.reasons[0]?.severity).toBe("blocking");
  });
});
