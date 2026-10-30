// Pure query builder for GitHub issue search. No server imports so it can be unit tested.
import type { Proficiency, ScopePreference, SkillSelection } from "@/lib/types";
import { resolveSkill } from "@/lib/skills";

export interface SearchQuery {
  skillId: string; // primary skill (or "combo:a+b")
  skillIds: string[];
  q: string;
}

export const MAX_QUERIES = 6;

const BEGINNER_LABELS = ['"good first issue"', '"good-first-issue"', '"beginner"', '"first-timers-only"', '"easy"'];
const OPEN_LABELS = ['"help wanted"', '"good first issue"', '"contributions welcome"', '"up for grabs"', '"accepting prs"'];

function labelsFor(p: Proficiency, scope: ScopePreference): string {
  // GitHub ORs comma separated values inside one label: qualifier.
  if (p === "learning" || scope === "quick") return `label:${BEGINNER_LABELS.join(",")}`;
  return `label:${OPEN_LABELS.join(",")}`;
}

function quoteTerm(term: string): string {
  const clean = term.replace(/["\\]/g, "").trim();
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

export function sanitizeKeywords(raw: string | undefined): string {
  if (!raw) return "";
  // Drop qualifiers the user might type (label:, repo:, etc.) to keep queries bounded.
  return raw
    .split(/\s+/)
    .filter((w) => w && !w.includes(":"))
    .map((w) => w.replace(/[^\p{L}\p{N}+#.\-]/gu, ""))
    .filter(Boolean)
    .slice(0, 5)
    .join(" ")
    .slice(0, 80);
}

export function baseQualifiers(now: Date, maxAgeDays = 150): string {
  const since = new Date(now.getTime() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  return [
    "is:issue",
    "is:open",
    "is:public",
    "no:assignee",
    "archived:false",
    "comments:<40",
    `updated:>=${since}`,
    '-label:"wontfix"',
    '-label:"duplicate"',
    '-label:"invalid"',
  ].join(" ");
}

const PROF_ORDER: Record<Proficiency, number> = { experienced: 0, comfortable: 1, learning: 2 };

/**
 * Turn a profile into a bounded set of search queries:
 * one per skill (strongest first) plus up to two language+topic combinations.
 */
export function buildQueries(
  skills: SkillSelection[],
  opts: { scope: ScopePreference; keywords?: string; now: Date },
): SearchQuery[] {
  const base = baseQualifiers(opts.now);
  const kw = sanitizeKeywords(opts.keywords);
  const kwPart = kw ? ` ${kw.split(" ").map(quoteTerm).join(" ")} in:title,body` : "";

  const sorted = [...skills].sort((a, b) => PROF_ORDER[a.proficiency] - PROF_ORDER[b.proficiency]);
  const out: SearchQuery[] = [];
  const seen = new Set<string>();
  const push = (sq: SearchQuery) => {
    if (seen.has(sq.q) || out.length >= MAX_QUERIES) return;
    seen.add(sq.q);
    out.push(sq);
  };

  const languages = sorted.filter((s) => resolveSkill(s.id, s.label).kind === "language");
  const topics = sorted.filter((s) => resolveSkill(s.id, s.label).kind !== "language");

  // Combination queries first get a reserved slot so mixed skills are represented.
  const combos: SearchQuery[] = [];
  for (const lang of languages) {
    for (const topic of topics) {
      const ld = resolveSkill(lang.id, lang.label);
      const td = resolveSkill(topic.id, topic.label);
      if (!ld.ghLanguage || !td.searchTerm) continue;
      if (td.repoLanguages && !td.repoLanguages.includes(ld.ghLanguage)) continue;
      const weaker = PROF_ORDER[lang.proficiency] > PROF_ORDER[topic.proficiency] ? lang : topic;
      combos.push({
        skillId: `combo:${lang.id}+${topic.id}`,
        skillIds: [lang.id, topic.id],
        q: `${base} language:${quoteTerm(ld.ghLanguage)} ${quoteTerm(td.searchTerm)} in:title,body ${labelsFor(weaker.proficiency, opts.scope)}${kwPart}`,
      });
    }
  }

  const singles: SearchQuery[] = sorted.map((s) => {
    const def = resolveSkill(s.id, s.label);
    const target = def.ghLanguage
      ? `language:${quoteTerm(def.ghLanguage)}`
      : `${quoteTerm(def.searchTerm ?? def.label)} in:title,body`;
    return { skillId: s.id, skillIds: [s.id], q: `${base} ${target} ${labelsFor(s.proficiency, opts.scope)}${kwPart}` };
  });

  const comboSlots = Math.min(2, combos.length, Math.max(0, MAX_QUERIES - Math.min(singles.length, 4)));
  singles.slice(0, MAX_QUERIES - comboSlots).forEach(push);
  combos.slice(0, comboSlots).forEach(push);
  singles.slice(MAX_QUERIES - comboSlots).forEach(push);
  return out;
}
