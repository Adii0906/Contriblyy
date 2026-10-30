// Pure comment-claim detection.
import type { Claim, ClaimKind, ClaimsData, ClaimStatus } from "@/lib/types";

export interface CommentInput {
  id: number;
  author: string;
  association: string; // OWNER | MEMBER | COLLABORATOR | CONTRIBUTOR | NONE | ...
  body: string;
  createdAt: string;
  url: string;
  isBot?: boolean;
}

const DAY = 86_400_000;
export const ACTIVE_FRESH_DAYS = 30;
export const REQUEST_FRESH_DAYS = 45;
export const STALE_AFTER_DAYS = 90;

export const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

const ACTIVE_PATTERNS: RegExp[] = [
  /\b(?:i'?m|i am|i've been|i have been|currently)\s+(?:already\s+)?(?:working on|looking into|on)\s+(?:it|this|that|a fix|the fix|a pr)\b/,
  /\bworking on (?:a |the )?(?:fix|pr|pull request|patch)\b/,
  /\bi(?:'ll| will)\s+(?:take|pick up|work on|handle|tackle|fix|submit a pr for|open a pr for|raise a pr for)\s+(?:this|it|that)\b/,
  /\bi'?m\s+(?:taking|picking up|tackling|claiming)\s+(?:this|it|that)\b/,
  /\bi(?:'ve| have)\s+(?:started|begun)\s+(?:working|on)\b/,
  /\b(?:pr|pull request|fix)\s+(?:is\s+)?(?:coming|incoming|on (?:the|its) way|in progress)\b/,
  /\bi(?:'ll| will)\s+(?:open|raise|submit|send)\s+(?:a\s+)?(?:pr|pull request)\b/,
  /^\s*\/(?:assign|take|claim)\b/m,
];

const REQUEST_PATTERNS: RegExp[] = [
  /\b(?:can|could|may)\s+i\s+(?:please\s+)?(?:work on|take|pick up|try|handle|attempt|tackle|solve|fix|contribute to)\b/,
  /\bi'?d\s+(?:like|love)\s+to\s+(?:work on|take|contribute|pick up|tackle|try|help with|fix|solve)\b/,
  /\bi\s+(?:want|would like|wish)\s+to\s+(?:work on|take|contribute to|fix|solve)\b/,
  /\b(?:please\s+)?assign\s+(?:this\s+)?(?:issue\s+)?(?:to\s+)?me\b/,
  /\binterested in (?:working on|taking|contributing to|fixing)\s+(?:this|it)\b/,
  /\bi\s+can\s+(?:work on|take|fix|handle)\s+(?:this|it)\b/,
];

const INTEREST_ONLY = [
  /\b(?:is|are)\s+(?:any|some)(?:one|body)\s+(?:working|still working|already working)\b/,
  /\bis\s+this\s+(?:issue\s+)?(?:still\s+)?(?:open|available|up for grabs|being worked on)\b/,
];

const RELEASE_PATTERNS = [
  /\b(?:no longer|not)\s+(?:working on|able to work on|going to work on)\s+(?:this|it)\b/,
  /\bunassign\s+me\b/,
  /\b(?:feel free|anyone can|someone else can)\s+(?:to\s+)?(?:take|pick)\s+(?:this|it|over)\b/,
  /\bi\s+(?:won'?t|can'?t|cannot)\s+(?:be able to\s+)?(?:work on|finish|continue)\b/,
];

const ACK_PATTERNS = [/\bassign(?:ed|ing)\b/, /\bgo ahead\b/, /\ball yours\b/, /\bfeel free\b/, /\bsure[,!. ]/, /\bplease (?:go ahead|do)\b/, /\bit'?s yours\b/];

export function cleanBody(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith(">"))
    .join("\n")
    .toLowerCase()
    .replace(/[‘’]/g, "'");
}

function sentenceAround(body: string, re: RegExp): string {
  const raw = body
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith(">"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => re.test(s.toLowerCase().replace(/[‘’]/g, "'")));
  const text = (hit ?? raw).trim();
  return text.length > 180 ? text.slice(0, 177).trimEnd() + "..." : text;
}

export function classifyComment(body: string): { kind: ClaimKind | "interest" | "release" | null; pattern?: RegExp } {
  const text = cleanBody(body);
  if (!text.trim()) return { kind: null };
  for (const re of RELEASE_PATTERNS) if (re.test(text)) return { kind: "release", pattern: re };
  for (const re of ACTIVE_PATTERNS) if (re.test(text)) return { kind: "active", pattern: re };
  for (const re of REQUEST_PATTERNS) if (re.test(text)) return { kind: "request", pattern: re };
  for (const re of INTEREST_ONLY) if (re.test(text)) return { kind: "interest", pattern: re };
  return { kind: null };
}

function mentions(body: string, login: string): boolean {
  return body.toLowerCase().includes(`@${login.toLowerCase()}`);
}

export function detectClaims(
  comments: CommentInput[],
  opts: { now: Date; commentsTotal?: number },
): ClaimsData {
  const now = opts.now.getTime();
  const sorted = [...comments].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const claims: Claim[] = [];
  let interestOnly = 0;
  let maintainerCommentedAt: string | null = null;
  const lastCommentBy = new Map<string, number>();

  for (const c of sorted) {
    if (c.isBot || /\[bot\]$/i.test(c.author)) continue;
    lastCommentBy.set(c.author, Date.parse(c.createdAt));
    const isMaintainer = MAINTAINER_ASSOCIATIONS.has(c.association);
    if (isMaintainer) maintainerCommentedAt = c.createdAt;

    const { kind, pattern } = classifyComment(c.body);

    // A maintainer reply after an open claim can acknowledge it.
    if (isMaintainer) {
      const text = cleanBody(c.body);
      for (const claim of claims) {
        if (claim.released || claim.acknowledged || claim.author === c.author) continue;
        const replying = mentions(c.body, claim.author) || claims.length === 1;
        if (replying && ACK_PATTERNS.some((re) => re.test(text))) claim.acknowledged = true;
      }
    }

    if (kind === "interest") {
      interestOnly++;
      continue;
    }
    if (kind === "release") {
      for (const claim of claims) if (claim.author === c.author) claim.released = true;
      continue;
    }
    if (kind === "active" || kind === "request") {
      const existing = claims.find((x) => x.author === c.author && !x.released);
      if (existing) {
        // Upgrade a request to active if the same person later says they are working on it.
        if (kind === "active") existing.kind = "active";
        continue;
      }
      claims.push({
        commentId: c.id,
        author: c.author,
        association: c.association,
        kind,
        acknowledged: false,
        released: false,
        createdAt: c.createdAt,
        ageDays: 0,
        url: c.url,
        excerpt: sentenceAround(c.body, pattern!),
      });
    }
  }

  for (const claim of claims) {
    const last = lastCommentBy.get(claim.author) ?? Date.parse(claim.createdAt);
    claim.ageDays = Math.max(0, Math.floor((now - last) / DAY));
  }

  return {
    status: claimStatus(claims),
    claims,
    commentsScanned: comments.length,
    commentsTotal: opts.commentsTotal ?? comments.length,
    interestOnly,
    maintainerCommentedAt,
  };
}

export function claimStatus(claims: Claim[]): ClaimStatus {
  const live = claims.filter((c) => !c.released);
  if (live.length === 0) return "none";
  const strong = (c: Claim) => c.kind === "active" || c.acknowledged;
  if (live.some((c) => strong(c) && c.ageDays <= ACTIVE_FRESH_DAYS)) return "active";
  if (
    live.some(
      (c) =>
        (c.kind === "request" && !c.acknowledged && c.ageDays <= REQUEST_FRESH_DAYS) ||
        (strong(c) && c.ageDays <= STALE_AFTER_DAYS),
    )
  )
    return "possible";
  return "stale";
}
