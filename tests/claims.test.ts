import { describe, expect, it } from "vitest";
import { classifyComment, detectClaims, claimStatus } from "@/lib/verify/claims";
import { NOW, fixtureIssue, toComments } from "./helpers";

describe("classifyComment", () => {
  it.each([
    ["I'm working on a fix for this, PR soon.", "active"],
    ["I'll take this one", "active"],
    ["I'm taking this issue.", "active"],
    ["/assign", "active"],
    ["Hi! I'd like to work on this issue", "request"],
    ["Can I work on this?", "request"],
    ["Please assign this to me", "request"],
    ["Is anyone working on this?", "interest"],
    ["Is this still available?", "interest"],
    ["Sorry, I'm no longer working on this.", "release"],
    ["This also happens on Windows.", null],
    ["> I'm working on a fix\nThanks for the update", null],
  ])("%s -> %s", (text, kind) => {
    expect(classifyComment(text).kind).toBe(kind);
  });

  it("ignores intent inside code blocks", () => {
    expect(classifyComment("```\n# I'm working on a fix\n```\nstack trace above").kind).toBeNull();
  });
});

describe("detectClaims with fixtures", () => {
  it("unacknowledged recent request is a possible claim", () => {
    const i = fixtureIssue("quillstack", 118);
    const d = detectClaims(toComments(i._comments), { now: NOW });
    expect(d.status).toBe("possible");
    expect(d.claims[0]?.author).toBe("aria-dev");
    expect(d.claims[0]?.kind).toBe("request");
    expect(d.claims[0]?.ageDays).toBe(6);
    expect(d.claims[0]?.excerpt).toMatch(/like to work on this/);
  });

  it("recent active claim acknowledged by a maintainer is active", () => {
    const i = fixtureIssue("orbit-ui", 57);
    const d = detectClaims(toComments(i._comments), { now: NOW });
    expect(d.status).toBe("active");
    expect(d.claims[0]?.acknowledged).toBe(true);
    expect(d.maintainerCommentedAt).not.toBeNull();
  });

  it("old acknowledged claim with no follow up is stale", () => {
    const i = fixtureIssue("quillstack", 140);
    const d = detectClaims(toComments(i._comments), { now: NOW });
    expect(d.status).toBe("stale");
    expect(d.claims[0]?.ageDays).toBeGreaterThan(90);
  });

  it("maintainer asking if anyone is working is interest, not a claim", () => {
    const i = fixtureIssue("orbit-ui", 70);
    const d = detectClaims(toComments(i._comments), { now: NOW });
    expect(d.status).toBe("none");
    expect(d.interestOnly).toBe(1);
  });

  it("a later release cancels the claim", () => {
    const base = { association: "NONE", url: "#" };
    const d = detectClaims(
      [
        { ...base, id: 1, author: "a", body: "I'll take this", createdAt: "2026-10-20T00:00:00Z" },
        { ...base, id: 2, author: "a", body: "I won't be able to finish this, sorry", createdAt: "2026-10-22T00:00:00Z" },
      ],
      { now: NOW },
    );
    expect(d.status).toBe("none");
  });

  it("bots are ignored", () => {
    const d = detectClaims([{ id: 1, author: "stale[bot]", association: "NONE", body: "I'm working on it", createdAt: NOW.toISOString(), url: "#" }], { now: NOW });
    expect(d.claims).toHaveLength(0);
  });

  it("age uses the claimant's latest comment", () => {
    const base = { association: "NONE", url: "#" };
    const d = detectClaims(
      [
        { ...base, id: 1, author: "a", body: "I'm working on this", createdAt: "2026-07-01T00:00:00Z" },
        { ...base, id: 2, author: "a", body: "Still on it, almost done", createdAt: "2026-10-20T00:00:00Z" },
      ],
      { now: NOW },
    );
    expect(d.claims[0]?.ageDays).toBe(4);
    expect(d.status).toBe("active");
  });

  it("reports scanned vs total comments", () => {
    const d = detectClaims([], { now: NOW, commentsTotal: 250 });
    expect(d.commentsScanned).toBe(0);
    expect(d.commentsTotal).toBe(250);
    expect(claimStatus([])).toBe("none");
  });
});
