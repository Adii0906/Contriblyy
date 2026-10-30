import type { Profile } from "@/lib/types";
import { getSkill } from "@/lib/skills";

/** Human label for a query id like "python" or "combo:python+custom-graphql". */
export function querySkillName(id: string, profile: Profile | null): string {
  const one = (x: string) => profile?.skills.find((s) => s.id === x)?.label ?? getSkill(x)?.label ?? x;
  return id.startsWith("combo:") ? id.slice(6).split("+").map(one).join(" + ") : one(id);
}
