import { buildFixtures, graphqlForIssue } from "../fixtures/github-fixtures.mjs";
import type { CommentInput } from "@/lib/verify/claims";
import type { IssueSummary, Profile, Verification } from "@/lib/types";
import { normalizeIssue, type RawSearchIssue } from "@/lib/discovery/normalize";

export const NOW = new Date("2026-10-24T06:00:00.000Z");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fx: any = buildFixtures(NOW);
export { graphqlForIssue };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fixtureIssue(repo: string, number: number): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = fx.issues.find((x: any) => x._repo === repo && x.number === number);
  if (!i) throw new Error(`no fixture ${repo}#${number}`);
  return i;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toComments(raw: any[]): CommentInput[] {
  return raw.map((c) => ({
    id: c.id,
    author: c.user.login,
    association: c.author_association,
    body: c.body,
    createdAt: c.created_at,
    url: c.html_url,
    isBot: c.user.type === "Bot",
  }));
}

export function summary(repo: string, number: number, foundBy: string[] = []): IssueSummary {
  const raw = fixtureIssue(repo, number) as RawSearchIssue;
  const s = normalizeIssue(raw, foundBy);
  if (!s) throw new Error("normalize failed");
  return s;
}

export function profile(p: Partial<Profile> = {}): Profile {
  return {
    skills: [
      { id: "python", label: "Python", proficiency: "comfortable" },
      { id: "sql", label: "SQL", proficiency: "learning" },
    ],
    time: "5-8",
    scope: "any",
    updatedAt: NOW.toISOString(),
    ...p,
  };
}

export function fakeVerification(assessment: Verification["result"]["assessment"], repoActivity: "recently-active" | "limited" = "recently-active", language = "Python"): Verification {
  return {
    key: "x",
    checkedAt: NOW.toISOString(),
    cached: false,
    result: { assessment, reasons: [], incomplete: [] },
    checks: {
      repo: {
        status: "ok",
        data: {
          activity: repoActivity,
          archived: false,
          disabled: false,
          language,
          topics: [],
          stars: 1,
          pushedAt: null,
          commits90: 10,
          commitsCapped: false,
          lastCommitAt: null,
          merged90: 3,
          lastMergedAt: null,
          reasons: [],
        },
      },
    },
  };
}
