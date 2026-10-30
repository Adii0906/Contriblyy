// Pure contribution-policy scanner for README / CONTRIBUTING text.
import type { PolicyData, PolicyFinding, PolicyFindingType } from "@/lib/types";

export interface PolicyDoc {
  name: string;
  url: string;
  text: string;
}

const AI_TERM =
  /\b(?:ai[- ]generated|ai[- ]assisted|ai[- ]written|generative ai|gen[- ]?ai|large language models?|llms?|chatgpt|copilot|ai (?:tools?|assistants?|agents?|models?|coding)|machine[- ]generated|automated (?:pull requests|contributions))\b/i;
const AI_RESTRICT =
  /\b(?:not (?:be )?accept(?:ed)?|(?:do|does|will) not accept|don'?t accept|won'?t accept|(?:will|may) be (?:closed|rejected)|prohibit(?:ed|s)?|forbid(?:den)?|bann?ed|not (?:allowed|permitted|welcome)|disallow(?:ed)?|must not|do not (?:use|submit|open)|don'?t (?:use|submit|open)|no ai|reject(?:ed)?)\b/i;
const AI_DISCLOSE = /\b(?:disclose|disclosure|declare|must (?:mention|state|indicate|note)|label (?:it|them|your)|be transparent)\b/i;

const ASSIGN_REQUIRED = [
  /\b(?:must|need to|should|please)\s+(?:first\s+)?(?:be|get)\s+assigned\b/i,
  /\b(?:ask|request)\s+to\s+be\s+assigned\b/i,
  /\b(?:do not|don'?t|never)\s+(?:open|submit|create|send)\s+(?:a\s+)?(?:pr|pull request)s?\b[^.]{0,80}\b(?:not|without being|unless)[^.]{0,30}\bassigned\b/i,
  /\bcomment on (?:the|an) issue (?:first |before )[^.]{0,60}\b(?:work|start|begin|pr)/i,
  /\bwait (?:until|for) (?:you are|you're|a maintainer)[^.]{0,40}\bassign/i,
];
const CLA = /\b(?:CLA|contributor license agreement)\b/;
const DCO = /\b(?:DCO|developer certificate of origin|signed-off-by)\b/i;

function sentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])|\n(?=\s*[-*]\s)/)
    .map((s) => s.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 12 && s.length < 600);
}

const trim = (s: string) => (s.length > 220 ? s.slice(0, 217).trimEnd() + "..." : s);

export function scanPolicies(docs: PolicyDoc[]): PolicyData {
  const findings: PolicyFinding[] = [];
  const seen = new Set<PolicyFindingType>();
  const add = (type: PolicyFindingType, severity: PolicyFinding["severity"], doc: PolicyDoc, excerpt: string) => {
    if (seen.has(type)) return;
    seen.add(type);
    findings.push({ type, severity, doc: doc.name, url: doc.url, excerpt: trim(excerpt) });
  };

  for (const doc of docs) {
    for (const s of sentences(doc.text)) {
      if (AI_TERM.test(s)) {
        if (AI_RESTRICT.test(s)) add("ai-restricted", "warning", doc, s);
        else if (AI_DISCLOSE.test(s)) add("ai-disclosure", "info", doc, s);
      }
      if (ASSIGN_REQUIRED.some((re) => re.test(s))) add("assignment-required", "info", doc, s);
      if (CLA.test(s)) add("cla", "info", doc, s);
      if (DCO.test(s)) add("dco", "info", doc, s);
    }
  }

  // A restriction sentence wins over a disclosure sentence about the same topic.
  const filtered = seen.has("ai-restricted") ? findings.filter((f) => f.type !== "ai-disclosure") : findings;
  const order: PolicyFindingType[] = ["ai-restricted", "assignment-required", "ai-disclosure", "cla", "dco"];
  filtered.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return {
    status: docs.length === 0 ? "no-docs" : filtered.some((f) => f.severity === "warning") ? "restriction" : filtered.length ? "requirements" : "none-detected",
    findings: filtered,
    docsChecked: docs.map((d) => ({ name: d.name, url: d.url })),
  };
}

export const POLICY_LABEL: Record<PolicyFindingType, string> = {
  "ai-restricted": "Restricts AI-generated contributions",
  "ai-disclosure": "Asks you to disclose AI assistance",
  "assignment-required": "Asks contributors to get assigned or comment first",
  cla: "Requires a contributor license agreement",
  dco: "Requires signed-off commits (DCO)",
};
