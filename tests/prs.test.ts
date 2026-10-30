import { describe, expect, it } from "vitest";
import { bodyClosesIssue, buildPrData, classifyPrs, parseGraphqlPrs, parseRestTimeline } from "@/lib/verify/prs";
import type { PrRef } from "@/lib/types";
import { fixtureIssue, graphqlForIssue } from "./helpers";

const pr = (o: Partial<PrRef>): PrRef => ({
  number: 1,
  title: "t",
  url: `u${o.number ?? 1}`,
  state: "open",
  isDraft: false,
  author: "x",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  repo: "o/r",
  linkType: "mention",
  ...o,
});

describe("classifyPrs", () => {
  it("none", () => expect(classifyPrs([])).toBe("none"));
  it("open closing PR is confirmed", () => expect(classifyPrs([pr({ linkType: "closing" })])).toBe("confirmed-open"));
  it("connected PR counts as confirmed", () => expect(classifyPrs([pr({ linkType: "connected" })])).toBe("confirmed-open"));
  it("merged closing PR", () => expect(classifyPrs([pr({ state: "merged", linkType: "closing" })])).toBe("merged"));
  it("open mention is only possible", () => expect(classifyPrs([pr({ linkType: "mention" })])).toBe("possible"));
  it("closed unmerged only", () => expect(classifyPrs([pr({ state: "closed", linkType: "closing" })])).toBe("closed-only"));
});

describe("closing keyword parsing", () => {
  it("detects same-repo closing keywords", () => {
    expect(bodyClosesIssue("Closes #63", 63, true)).toBe(true);
    expect(bodyClosesIssue("fixes: #63", 63, true)).toBe(true);
    expect(bodyClosesIssue("Related to #63", 63, true)).toBe(false);
    expect(bodyClosesIssue("Fixes #630", 63, true)).toBe(false);
  });
  it("cross-repo PR needs an owner/repo prefix", () => {
    expect(bodyClosesIssue("Fixes #63", 63, false)).toBe(false);
    expect(bodyClosesIssue("Fixes fixture-labs/orbit-ui#63", 63, false)).toBe(true);
  });
});

describe("REST timeline fixtures", () => {
  it("open PR with Closes keyword -> confirmed-open", () => {
    const i = fixtureIssue("orbit-ui", 63);
    const prs = parseRestTimeline(i._timeline, 63, "fixture-labs/orbit-ui");
    const data = buildPrData(prs, "rest-timeline", true);
    expect(data.status).toBe("confirmed-open");
    expect(data.prs[0]?.number).toBe(64);
  });
  it("merged fixing PR -> merged", () => {
    const i = fixtureIssue("quillstack", 130);
    const data = buildPrData(parseRestTimeline(i._timeline, 130, "fixture-labs/quillstack"), "rest-timeline", true);
    expect(data.status).toBe("merged");
  });
  it("no timeline -> none", () => {
    const i = fixtureIssue("quillstack", 101);
    expect(buildPrData(parseRestTimeline(i._timeline, 101, "fixture-labs/quillstack"), "rest-timeline", true).status).toBe("none");
  });
});

describe("GraphQL fixtures", () => {
  it("parses closedByPullRequestsReferences and dedupes with timeline", () => {
    const i = fixtureIssue("orbit-ui", 63);
    const parsed = parseGraphqlPrs(graphqlForIssue(i));
    expect(parsed).not.toBeNull();
    const data = buildPrData(parsed!.prs, "graphql", parsed!.complete);
    expect(data.prs).toHaveLength(1);
    expect(data.prs[0]?.linkType).toBe("closing");
    expect(data.status).toBe("confirmed-open");
    expect(data.complete).toBe(true);
  });
  it("missing issue returns null", () => {
    expect(parseGraphqlPrs({ repository: null })).toBeNull();
  });
});
