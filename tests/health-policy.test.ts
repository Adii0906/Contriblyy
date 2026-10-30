import { describe, expect, it } from "vitest";
import { assessMaintainers, assessRepo, type RepoInput } from "@/lib/verify/health";
import { scanPolicies } from "@/lib/verify/policy";
import { NOW, fx } from "./helpers";

function repoInput(name: string, overrides: Partial<RepoInput> = {}): RepoInput {
  const r = fx.repos[name];
  const cutoff = NOW.getTime() - 90 * 86_400_000;
  const commits = r.commits ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = (r.pulls as any[]).map((p) => p.merged_at).filter(Boolean).sort();
  return {
    archived: r.meta.archived,
    disabled: r.meta.disabled,
    language: r.meta.language,
    topics: r.meta.topics,
    stars: r.meta.stargazers_count,
    pushedAt: r.meta.pushed_at,
    commits90: r.commitsFail ? null : commits.length,
    commitsCapped: Boolean(r.commitsHasMore),
    lastCommitAt: commits[0]?.commit.committer.date ?? r.latestCommit?.[0]?.commit.committer.date ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    merged90: merged.filter((d: any) => Date.parse(d) >= cutoff).length,
    lastMergedAt: merged.at(-1) ?? null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const comments = (name: string) => fx.repos[name].repoComments.map((c: any) => ({ author: c.user.login, association: c.author_association, createdAt: c.created_at, isBot: c.user.type === "Bot" }));

describe("repository health", () => {
  it("busy repo is recently active", () => {
    const d = assessRepo(repoInput("quillstack"), NOW);
    expect(d.activity).toBe("recently-active");
    expect(d.reasons.join(" ")).toMatch(/42 commits/);
  });
  it("capped commit count is shown as 100+", () => {
    expect(assessRepo(repoInput("orbit-ui"), NOW).reasons[0]).toMatch(/100\+ commits/);
  });
  it("quiet repo is limited, not dead", () => {
    const d = assessRepo(repoInput("tidepool"), NOW);
    expect(d.activity).toBe("limited");
    expect(d.reasons.join(" ")).toMatch(/Quiet does not mean abandoned/);
  });
  it("archived repo", () => {
    expect(assessRepo(repoInput("relic-cli"), NOW).activity).toBe("archived");
  });
  it("commits unreadable but merges present -> some", () => {
    expect(assessRepo(repoInput("datasmith"), NOW).activity).toBe("some");
  });
  it("no data at all -> insufficient", () => {
    expect(assessRepo(repoInput("quillstack", { commits90: null, merged90: null }), NOW).activity).toBe("insufficient");
  });
});

describe("maintainer activity", () => {
  it("responsive when maintainers comment often", () => {
    const d = assessMaintainers(comments("quillstack"), 15, NOW);
    expect(d.activity).toBe("responsive");
    expect(d.distinctMaintainers90).toBe(2);
    expect(d.contributorComments90).toBeGreaterThan(0);
  });
  it("quiet when only old maintainer comments", () => {
    expect(assessMaintainers(comments("tidepool"), 0, NOW).activity).toBe("quiet");
  });
  it("insufficient with no sample and no merges", () => {
    expect(assessMaintainers([], 0, NOW).activity).toBe("insufficient");
  });
  it("never promises a reply", () => {
    expect(assessMaintainers(comments("quillstack"), 15, NOW).reasons.join(" ")).toMatch(/does not promise/);
  });
});

describe("policy scan", () => {
  const doc = (name: string, text: string) => ({ name, url: `https://example.test/${name}`, text });

  it("detects AI restriction with evidence", () => {
    const d = scanPolicies([doc("CONTRIBUTING", fx.repos["orbit-ui"].contributing)]);
    expect(d.status).toBe("restriction");
    const ai = d.findings.find((f) => f.type === "ai-restricted");
    expect(ai?.severity).toBe("warning");
    expect(ai?.excerpt).toMatch(/AI-generated will not be accepted/);
    expect(d.findings.some((f) => f.type === "cla")).toBe(true);
  });
  it("detects assignment requirement and DCO", () => {
    const d = scanPolicies([doc("CONTRIBUTING", fx.repos.quillstack.contributing)]);
    expect(d.status).toBe("requirements");
    expect(d.findings.map((f) => f.type)).toEqual(["assignment-required", "dco"]);
  });
  it("no explicit restriction detected", () => {
    const d = scanPolicies([doc("CONTRIBUTING", fx.repos.datasmith.contributing), doc("README", fx.repos.datasmith.readme)]);
    expect(d.status).toBe("none-detected");
    expect(d.findings).toHaveLength(0);
  });
  it("no docs", () => expect(scanPolicies([]).status).toBe("no-docs"));
  it("AI disclosure without restriction is info", () => {
    const d = scanPolicies([doc("CONTRIBUTING", "If you used AI tools, please disclose it in the PR description.")]);
    expect(d.findings[0]?.type).toBe("ai-disclosure");
    expect(d.status).toBe("requirements");
  });
  it("mentioning AI as a project topic is not a restriction", () => {
    const d = scanPolicies([doc("README", "This library helps you run large language models locally. We welcome pull requests.")]);
    expect(d.status).toBe("none-detected");
  });
});
