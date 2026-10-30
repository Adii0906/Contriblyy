import { describe, expect, it } from "vitest";
import { buildQueries, MAX_QUERIES, sanitizeKeywords } from "@/lib/discovery/query";
import { mergeIssues } from "@/lib/discovery/normalize";
import { NOW, summary } from "./helpers";

describe("query builder", () => {
  it("builds one query per skill plus a combination, bounded", () => {
    const qs = buildQueries(
      [
        { id: "python", label: "Python", proficiency: "comfortable" },
        { id: "sql", label: "SQL", proficiency: "learning" },
      ],
      { scope: "any", now: NOW },
    );
    expect(qs.map((q) => q.skillId)).toEqual(["python", "sql", "combo:python+sql"]);
    expect(qs[0]!.q).toContain("language:Python");
    expect(qs[0]!.q).toContain('label:"help wanted"');
    expect(qs[1]!.q).toContain('label:"good first issue"'); // learning -> beginner labels
    expect(qs.every((q) => q.q.includes("is:open") && q.q.includes("no:assignee") && q.q.includes("archived:false"))).toBe(true);
  });

  it("never exceeds the query cap", () => {
    const many = ["python", "javascript", "typescript", "go", "rust", "java", "react", "sql", "docker"].map((id) => ({ id, label: id, proficiency: "comfortable" as const }));
    expect(buildQueries(many, { scope: "any", now: NOW }).length).toBeLessThanOrEqual(MAX_QUERIES);
  });

  it("is not limited to Hacktoberfest or good-first-issue only", () => {
    const qs = buildQueries([{ id: "go", label: "Go", proficiency: "experienced" }], { scope: "any", now: NOW });
    expect(qs[0]!.q).not.toMatch(/hacktoberfest/i);
    expect(qs[0]!.q).toContain('"contributions welcome"');
  });

  it("custom skills become keyword searches", () => {
    const qs = buildQueries([{ id: "custom-graphql", label: "GraphQL", proficiency: "comfortable", custom: true }], { scope: "any", now: NOW });
    expect(qs[0]!.q).toContain("graphql in:title,body");
  });

  it("sanitizes user keywords and strips qualifiers", () => {
    expect(sanitizeKeywords('auth repo:evil/x "drop" label:foo')).toBe("auth drop");
    expect(sanitizeKeywords("a b c d e f g").split(" ")).toHaveLength(5);
  });

  it("only searches recently updated issues", () => {
    const q = buildQueries([{ id: "python", label: "Python", proficiency: "comfortable" }], { scope: "any", now: NOW })[0]!.q;
    expect(q).toMatch(/updated:>=2026-05-27/);
  });
});

describe("merge and dedupe", () => {
  it("merges foundBy and removes duplicates", () => {
    const a = summary("quillstack", 101, ["python"]);
    const b = summary("quillstack", 101, ["sql"]);
    const merged = mergeIssues([[a], [b]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.foundBy.sort()).toEqual(["python", "sql"]);
  });
  it("caps issues per repository", () => {
    const list = [101, 118, 124, 130].map((n) => summary("quillstack", n, ["python"]));
    expect(mergeIssues([list], 3)).toHaveLength(3);
  });
});
