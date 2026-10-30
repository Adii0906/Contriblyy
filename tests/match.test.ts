import { describe, expect, it } from "vitest";
import { inferLevel, inferScope, scoreIssue, skillHits } from "@/lib/match/score";
import { rankIssues, issueKey } from "@/lib/match/rank";
import { NOW, fakeVerification, profile, summary } from "./helpers";
import type { Verification } from "@/lib/types";

describe("skill hits", () => {
  it("combines language and SQL keywords", () => {
    const issue = summary("quillstack", 118, ["python"]);
    const hits = skillHits(issue, profile().skills);
    expect(hits.map((h) => h.skill.id)).toEqual(["python", "sql"]);
  });
  it("uses repository language from verification", () => {
    const issue = summary("datasmith", 33, []);
    const without = skillHits(issue, profile().skills);
    const withRepo = skillHits(issue, profile().skills, { language: "Python", topics: [] });
    expect(without.find((h) => h.skill.id === "python")).toBeUndefined();
    expect(withRepo.find((h) => h.skill.id === "python")).toBeDefined();
  });
  it("no overlap -> empty", () => {
    expect(skillHits(summary("tidepool", 12, []), profile().skills)).toHaveLength(0);
  });
});

describe("level and scope inference", () => {
  it("beginner from label", () => expect(inferLevel(summary("quillstack", 101)).value).toBe("beginner"));
  it("intermediate from help wanted", () => expect(inferLevel(summary("tidepool", 12)).value).toBe("intermediate"));
  it("typo is quick", () => expect(inferScope(summary("quillstack", 124)).value).toBe("quick"));
  it("does not invent scope without signal", () => {
    const s = inferScope(summary("tidepool", 12));
    expect(s.value).toBe("unclear");
    expect(s.basis).toMatch(/not enough signal/);
  });
});

describe("scoreIssue", () => {
  it("strong fit for a Python + SQL learner gets a natural explanation", () => {
    const r = scoreIssue(summary("quillstack", 101, ["python", "combo:python+sql"]), profile(), fakeVerification("promising"));
    expect(["strong", "good"]).toContain(r.tier);
    expect(r.explanation).toMatch(/^Recommended because you/);
    expect(r.explanation).toMatch(/No major blocking signals/);
    expect(r.factors.reduce((a, f) => a + f.points, 0)).toBe(r.points);
  });

  it("proficiency matters: advanced-looking task for a learner scores lower", () => {
    const issue = summary("quillstack", 101, ["python"]);
    const learner = scoreIssue(issue, profile({ skills: [{ id: "python", label: "Python", proficiency: "learning" }] }));
    const hard = { ...issue, labels: [{ name: "difficulty: hard", color: "000" }] };
    const learnerHard = scoreIssue(hard, profile({ skills: [{ id: "python", label: "Python", proficiency: "learning" }] }));
    expect(learnerHard.points).toBeLessThan(learner.points);
    expect(learnerHard.explanation).toMatch(/stretch/);
  });

  it("time budget penalises multi-day work for 2-4h/week", () => {
    const issue = { ...summary("quillstack", 101, ["python"]), labels: [{ name: "size/XL", color: "000" }] };
    const small = scoreIssue(issue, profile({ time: "2-4" }));
    const big = scoreIssue(issue, profile({ time: "15+" }));
    expect(small.points).toBeLessThan(big.points);
  });

  it("uncertain scope is stated, not guessed", () => {
    const r = scoreIssue(summary("quillstack", 118, ["python"]), profile());
    expect(r.explanation).toMatch(/time it needs is uncertain/);
  });
});

describe("ranking", () => {
  const issues = [summary("quillstack", 101, ["python"]), summary("orbit-ui", 57, []), summary("quillstack", 118, ["python"]), summary("datasmith", 33, ["python"])];
  const ver: Record<string, Verification> = {
    [issueKey(issues[0]!)]: fakeVerification("likely-unavailable"),
    [issueKey(issues[2]!)]: fakeVerification("promising"),
    [issueKey(issues[3]!)]: fakeVerification("needs-review"),
  };

  it("verification takes precedence over match score", () => {
    const ranked = rankIssues(issues, profile(), ver, issueKey);
    expect(ranked[0]?.issue.number).toBe(118);
    expect(ranked.at(-1)?.issue.number).toBe(101); // best match but likely unavailable
  });

  it("unverified issues sit between promising and needs review", () => {
    const ranked = rankIssues(issues, profile(), ver, issueKey);
    expect(ranked.map((r) => r.bucket)).toEqual([0, 1, 2, 3]);
  });

  it("diversifies skills inside a bucket", () => {
    const p = profile({
      skills: [
        { id: "python", label: "Python", proficiency: "comfortable" },
        { id: "react", label: "React", proficiency: "comfortable" },
      ],
    });
    const pool = [summary("quillstack", 101, ["python"]), summary("quillstack", 124, ["python"]), summary("orbit-ui", 70, ["react"])];
    const ranked = rankIssues(pool, p, {}, issueKey);
    const firstTwo = ranked.slice(0, 2).map((r) => r.match.primarySkillId);
    expect(new Set(firstTwo).size).toBe(2);
  });

  it("recent sort still keeps blocked issues last", () => {
    const ranked = rankIssues(issues, profile(), ver, issueKey, "recent");
    expect(ranked.at(-1)?.bucket).toBe(3);
  });

  it("NOW helper is stable", () => expect(NOW.toISOString()).toBe("2026-10-24T06:00:00.000Z"));
});
