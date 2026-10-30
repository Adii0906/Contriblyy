// Pure, explainable matching. Produces points per factor plus plain-language reasons.
import type { Assessment, IssueSummary, Profile, Proficiency, RepoActivity, SkillSelection, TimeBudget, Verification } from "@/lib/types";
import { resolveSkill } from "@/lib/skills";

export type Level = "beginner" | "intermediate" | "advanced" | "unknown";
export type Scope = "quick" | "few-hours" | "multi-day" | "unclear";
export type MatchTier = "strong" | "good" | "partial" | "weak";

export interface SkillHit {
  skill: SkillSelection;
  score: number; // 0..6
  evidence: string[];
}

export interface MatchFactor {
  key: "skills" | "level" | "time" | "activity";
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface MatchResult {
  tier: MatchTier;
  points: number; // 0..100, shown only as a tier plus factor breakdown
  matched: SkillHit[];
  primarySkillId: string | null;
  level: { value: Level; basis: string };
  scope: { value: Scope; basis: string };
  factors: MatchFactor[];
  explanation: string;
}

const BEGINNER_LABEL = /\b(good[ -]?first[ -]?issue|beginner|first[ -]?timers?[ -]?only|easy|starter|newcomer|low[ -]?hanging|difficulty[:/ -]*(easy|low)|level[:/ -]*easy|good first contribution)\b/i;
const ADVANCED_LABEL = /\b(hard|complex|advanced|difficulty[:/ -]*(hard|high)|expert|architecture|breaking[ -]?change|epic|research)\b/i;
const INTERMEDIATE_LABEL = /\b(medium|intermediate|difficulty[:/ -]*(medium|moderate)|help[ -]?wanted)\b/i;

const QUICK_LABEL = /\b(typo|size[:/ -]*(xs|s|small)|quick[ -]?(fix|win)|trivial|tiny|small)\b/i;
const LARGE_LABEL = /\b(size[:/ -]*(l|xl|large)|epic|large|big|multi[ -]?day|feature[ -]?request|roadmap)\b/i;
const DOCS_LABEL = /\b(docs?|documentation)\b/i;

function textOf(issue: IssueSummary) {
  return {
    title: issue.title.toLowerCase(),
    labels: issue.labels.map((l) => l.name.toLowerCase()).join(" | "),
    body: issue.bodyText.toLowerCase(),
  };
}

function hasWord(hay: string, kw: string): boolean {
  if (/^[a-z0-9]+$/.test(kw)) return new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`).test(hay);
  return hay.includes(kw);
}

export function skillHits(issue: IssueSummary, skills: SkillSelection[], repo?: { language: string | null; topics: string[] }): SkillHit[] {
  const t = textOf(issue);
  const hits: SkillHit[] = [];
  for (const s of skills) {
    const def = resolveSkill(s.id, s.label);
    let score = 0;
    const evidence: string[] = [];
    if (issue.foundBy.includes(s.id)) {
      score += def.kind === "language" ? 3 : 2;
      evidence.push(def.kind === "language" ? `repository uses ${def.label}` : `found by your ${def.label} search`);
    }
    if (repo?.language) {
      if (def.ghLanguage && repo.language === def.ghLanguage && !issue.foundBy.includes(s.id)) {
        score += 3;
        evidence.push(`repository uses ${def.label}`);
      } else if (!def.ghLanguage && def.repoLanguages?.includes(repo.language)) score += 0.5;
    }
    if (repo?.topics.some((tp) => def.keywords.some((k) => tp.includes(k.replace(/\s+/g, "-"))))) {
      score += 1.5;
      evidence.push("repository topics");
    }
    const kws = def.keywords.filter((k) => k.length > 1);
    const inTitle = kws.find((k) => hasWord(t.title, k));
    const inLabels = kws.find((k) => hasWord(t.labels, k));
    const inBody = kws.filter((k) => hasWord(t.body, k));
    if (inTitle) {
      score += 2;
      evidence.push(`"${inTitle}" in the title`);
    }
    if (inLabels) {
      score += 1.5;
      if (!inTitle) evidence.push(`"${inLabels}" label`);
    }
    if (inBody.length) score += Math.min(1.5, inBody.length * 0.5);
    score = Math.min(6, score);
    if (score >= 2) hits.push({ skill: s, score, evidence });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export function inferLevel(issue: IssueSummary): { value: Level; basis: string } {
  const labels = issue.labels.map((l) => l.name);
  const beginner = labels.find((l) => BEGINNER_LABEL.test(l));
  if (beginner) return { value: "beginner", basis: `"${beginner}" label` };
  const adv = labels.find((l) => ADVANCED_LABEL.test(l));
  if (adv) return { value: "advanced", basis: `"${adv}" label` };
  const mid = labels.find((l) => INTERMEDIATE_LABEL.test(l));
  if (mid) return { value: "intermediate", basis: `"${mid}" label` };
  return { value: "unknown", basis: "no difficulty label" };
}

export function inferScope(issue: IssueSummary): { value: Scope; basis: string } {
  const labels = issue.labels.map((l) => l.name);
  const quick = labels.find((l) => QUICK_LABEL.test(l));
  const large = labels.find((l) => LARGE_LABEL.test(l));
  if (large) return { value: "multi-day", basis: `"${large}" label` };
  if (quick) return { value: "quick", basis: `"${quick}" label` };
  if (issue.taskCount >= 5) return { value: "multi-day", basis: `${issue.taskCount} task checkboxes` };
  if (/\btypo\b/i.test(issue.title) || (labels.some((l) => DOCS_LABEL.test(l)) && issue.bodyLength < 800)) {
    return { value: "quick", basis: "small documentation change" };
  }
  if (issue.bodyLength > 0 && issue.bodyLength < 2500 && issue.taskCount <= 2 && issue.codeBlocks <= 2 && labels.some((l) => BEGINNER_LABEL.test(l))) {
    return { value: "few-hours", basis: "beginner label and a short, focused description" };
  }
  return { value: "unclear", basis: "not enough signal to estimate" };
}

const LEVEL_FIT: Record<Proficiency, Record<Level, number>> = {
  learning: { beginner: 25, intermediate: 10, advanced: 2, unknown: 9 },
  comfortable: { beginner: 20, intermediate: 25, advanced: 10, unknown: 14 },
  experienced: { beginner: 13, intermediate: 22, advanced: 25, unknown: 16 },
};

const TIME_FIT: Record<TimeBudget, Record<Scope, number>> = {
  "2-4": { quick: 20, "few-hours": 17, "multi-day": 3, unclear: 9 },
  "5-8": { quick: 16, "few-hours": 20, "multi-day": 9, unclear: 11 },
  "9-15": { quick: 12, "few-hours": 18, "multi-day": 17, unclear: 12 },
  "15+": { quick: 10, "few-hours": 16, "multi-day": 20, unclear: 12 },
};

const ACTIVITY_POINTS: Record<RepoActivity | "pending", number> = {
  "recently-active": 15,
  some: 11,
  limited: 4,
  insufficient: 6,
  archived: 0,
  pending: 7,
};

const PROF_WORD: Record<Proficiency, string> = { learning: "are learning", comfortable: "are comfortable with", experienced: "have experience with" };
const SCOPE_WORD: Record<Scope, string> = { quick: "a quick fix", "few-hours": "a few hours of work", "multi-day": "a multi-day task", unclear: "unclear in scope" };

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

export function scoreIssue(issue: IssueSummary, profile: Profile, verification?: Verification): MatchResult {
  const repoData = verification?.checks.repo?.status === "ok" ? verification.checks.repo.data : undefined;
  const matched = skillHits(issue, profile.skills, repoData ? { language: repoData.language, topics: repoData.topics } : undefined);
  const primary = matched[0];
  const level = inferLevel(issue);
  const scope = inferScope(issue);

  // Skills (max 40)
  let skillPts = 0;
  if (primary) skillPts = primary.score >= 4 ? 28 : primary.score >= 3 ? 22 : 15;
  skillPts += Math.min(12, matched.slice(1).filter((h) => h.score >= 2.5).length * 6);

  // Level (max 25), judged against the proficiency of the best matching skill
  const prof: Proficiency = primary?.skill.proficiency ?? "learning";
  const levelPts = primary ? LEVEL_FIT[prof][level.value] : 5;

  // Time (max 20) + scope preference
  let timePts = TIME_FIT[profile.time][scope.value];
  if (profile.scope !== "any" && scope.value !== "unclear") timePts = Math.max(0, Math.min(20, timePts + (profile.scope === scope.value ? 3 : -4)));

  // Activity (max 15)
  const activity: RepoActivity | "pending" = repoData?.activity ?? "pending";
  const actPts = ACTIVITY_POINTS[activity];

  const points = Math.round(skillPts + levelPts + timePts + actPts);
  const tier: MatchTier = !primary ? "weak" : points >= 72 ? "strong" : points >= 55 ? "good" : points >= 38 ? "partial" : "weak";

  const factors: MatchFactor[] = [
    { key: "skills", label: "Skill fit", points: skillPts, max: 40, note: primary ? matched.map((h) => `${h.skill.label}${h.evidence[0] ? ` (${h.evidence[0]})` : ""}`).join(", ") : "No clear overlap with your skills" },
    { key: "level", label: "Level fit", points: levelPts, max: 25, note: level.value === "unknown" ? "Difficulty not labelled" : `Looks ${level.value} (${level.basis})` },
    { key: "time", label: "Time fit", points: timePts, max: 20, note: scope.value === "unclear" ? "Scope could not be estimated" : `Looks like ${SCOPE_WORD[scope.value]} (${scope.basis})` },
    { key: "activity", label: "Repository activity", points: actPts, max: 15, note: activity === "pending" ? "Waiting for verification" : activity.replace("-", " ") },
  ];

  return {
    tier,
    points,
    matched,
    primarySkillId: primary?.skill.id ?? null,
    level,
    scope,
    factors,
    explanation: explain({ matched, level, scope, assessment: verification?.result.assessment, profile }),
  };
}

function explain(x: {
  matched: SkillHit[];
  level: { value: Level };
  scope: { value: Scope };
  assessment?: Assessment;
  profile: Profile;
}): string {
  const parts: string[] = [];
  if (x.matched.length) {
    const top = x.matched.slice(0, 2);
    const sameProf = top.every((h) => h.skill.proficiency === top[0]!.skill.proficiency);
    parts.push(
      sameProf
        ? `you ${PROF_WORD[top[0]!.skill.proficiency]} ${joinList(top.map((h) => h.skill.label))}`
        : `you ${PROF_WORD[top[0]!.skill.proficiency]} ${top[0]!.skill.label} and ${PROF_WORD[top[1]!.skill.proficiency]} ${top[1]!.skill.label}`,
    );
  }
  const prof = x.matched[0]?.skill.proficiency;
  if (x.level.value !== "unknown" && prof) {
    const fits = LEVEL_FIT[prof][x.level.value] >= 20;
    parts.push(fits ? `it looks ${x.level.value === "beginner" ? "beginner friendly" : x.level.value} which suits your level` : `it looks ${x.level.value}, which may stretch your current level`);
  }
  if (x.scope.value !== "unclear") parts.push(`it appears to be ${SCOPE_WORD[x.scope.value]}`);
  else parts.push("the time it needs is uncertain");

  const lead = x.assessment === "promising" ? "Recommended because" : "Matches because";
  const head = x.matched.length ? `${lead} ${joinList(parts)}.` : `Weak skill overlap. ${parts.length ? joinList(parts).replace(/^./, (c) => c.toUpperCase()) + "." : ""}`;
  const tail =
    x.assessment === "promising"
      ? " No major blocking signals were found in the checks performed."
      : x.assessment === "needs-review"
        ? " Some signals need a look before you start."
        : x.assessment === "likely-unavailable"
          ? " Evidence suggests it is already taken or blocked."
          : " Verification is still running.";
  return head + tail;
}
