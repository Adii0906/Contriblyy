// End-to-end through the real GitHub client, discovery and verification code,
// pointed at the local fixture server (test mode). No network access needed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { CheckKey } from "@/lib/types";

const PORT = 4917;
let proc: ChildProcess;
const savedToken = process.env.GITHUB_TOKEN;

beforeAll(async () => {
  proc = spawn(process.execPath, [path.resolve(__dirname, "../scripts/fixture-server.mjs"), String(PORT)], {
    env: { ...process.env, FIXTURE_LATENCY: "0" },
    stdio: "pipe",
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fixture server did not start")), 5000);
    proc.stdout!.on("data", (d) => {
      if (String(d).includes("TEST FIXTURES ONLY")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  process.env.CONTRIBLY_TEST_MODE = "1";
  process.env.GITHUB_API_URL = `http://localhost:${PORT}`;
  process.env.GITHUB_TOKEN = "test-token-not-real";
});

afterAll(() => {
  proc?.kill();
  process.env.GITHUB_TOKEN = savedToken;
  delete process.env.CONTRIBLY_TEST_MODE;
  delete process.env.GITHUB_API_URL;
});

const target = (repo: string, number: number) => ({ owner: "fixture-labs", repo, number });

describe("verification against fixture server", () => {
  it.each([
    ["quillstack", 101, "promising"],
    ["quillstack", 124, "promising"],
    ["quillstack", 118, "needs-review"], // possible claim
    ["quillstack", 130, "likely-unavailable"], // merged fixing PR
    ["orbit-ui", 57, "likely-unavailable"], // acknowledged active claim
    ["orbit-ui", 63, "likely-unavailable"], // open linked PR
    ["orbit-ui", 70, "needs-review"], // AI policy restriction
    ["tidepool", 12, "needs-review"], // limited activity, quiet maintainers
    ["relic-cli", 9, "likely-unavailable"], // archived
    ["datasmith", 33, "needs-review"], // repository metadata 502 -> repo check failed (partial verification)
    ["quillstack", 140, "promising"], // stale claim only
  ])("%s#%i -> %s", async (repo, number, expected) => {
    const { runVerification } = await import("@/lib/verify/run");
    const seen: CheckKey[] = [];
    const v = await runVerification(target(repo, number), { force: true, onCheck: (k) => seen.push(k) });
    expect(seen.sort()).toEqual(["assignment", "claims", "maintainers", "policy", "prs", "repo"]);
    expect(v.result.assessment).toBe(expected);
  });

  it("uses GraphQL when a token exists and REST timeline without", async () => {
    const { runVerification } = await import("@/lib/verify/run");
    const withToken = await runVerification(target("orbit-ui", 63), { force: true });
    expect(withToken.checks.prs?.status === "ok" && withToken.checks.prs.data.source).toBe("graphql");
    delete process.env.GITHUB_TOKEN;
    const without = await runVerification(target("orbit-ui", 63), { force: true });
    expect(without.checks.prs?.status === "ok" && without.checks.prs.data.source).toBe("rest-timeline");
    expect(without.result.assessment).toBe("likely-unavailable");
    process.env.GITHUB_TOKEN = "test-token-not-real";
  });

  it("second call is served from cache and flagged as cached", async () => {
    const { runVerification } = await import("@/lib/verify/run");
    await runVerification(target("quillstack", 101), { force: true });
    const again = await runVerification(target("quillstack", 101));
    expect(again.cached).toBe(true);
  });

  it("missing issue fails the issue checks instead of inventing data", async () => {
    const { runVerification } = await import("@/lib/verify/run");
    const v = await runVerification(target("quillstack", 9999), { force: true });
    expect(v.checks.assignment?.status).toBe("failed");
    expect(v.checks.claims?.status).toBe("failed");
    expect(v.result.assessment).toBe("needs-review");
    expect(v.result.incomplete).toContain("assignment");
  });
});

describe("discovery against fixture server", () => {
  const skills = [
    { id: "python", label: "Python", proficiency: "comfortable" as const },
    { id: "react", label: "React", proficiency: "learning" as const },
  ];

  it("returns deduped real-shaped issues", async () => {
    const { discover } = await import("@/lib/discovery/search");
    const r = await discover({ skills, scope: "any", page: 1 });
    expect(r.issues.length).toBeGreaterThan(3);
    expect(new Set(r.issues.map((i) => i.id)).size).toBe(r.issues.length);
    expect(r.partial).toBe(false);
    expect(r.issues.every((i) => i.repo.owner === "fixture-labs")).toBe(true);
  });

  it("partial results when some queries fail", async () => {
    const { discover } = await import("@/lib/discovery/search");
    const r = await discover({ skills, scope: "any", keywords: "partialsearch", page: 1 });
    expect(r.partial).toBe(true);
    expect(r.queries.some((q) => !q.ok)).toBe(true);
  });

  it("empty results", async () => {
    const { discover } = await import("@/lib/discovery/search");
    const r = await discover({ skills, scope: "any", keywords: "nothingmatches", page: 1 });
    expect(r.issues).toHaveLength(0);
  });

  it("rate limit surfaces as a typed error with a reset time", async () => {
    const { discover } = await import("@/lib/discovery/search");
    const { GitHubError } = await import("@/lib/github/client");
    await expect(discover({ skills, scope: "any", keywords: "ratelimit", page: 1 })).rejects.toBeInstanceOf(GitHubError);
    try {
      await discover({ skills, scope: "any", keywords: "ratelimit again", page: 1 });
    } catch (e) {
      expect((e as InstanceType<typeof GitHubError>).kind).toBe("rate-limit");
    }
  });
});

describe("test-mode guard", () => {
  it("ignores GITHUB_API_URL unless CONTRIBLY_TEST_MODE=1", async () => {
    const { isTestMode } = await import("@/lib/github/client");
    expect(isTestMode()).toBe(true);
    process.env.CONTRIBLY_TEST_MODE = "0";
    expect(isTestMode()).toBe(false);
    process.env.CONTRIBLY_TEST_MODE = "1";
  });
});
