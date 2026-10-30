"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useState } from "react";
import type { Profile } from "@/lib/types";
import { useApp } from "@/lib/client/store";
import { OptionGroup, ProficiencyEditor, SCOPE, SkillPicker, TIME } from "@/components/profile/editors";
import { PageHeading } from "@/components/app/results";
import { Button } from "@/components/ui/button";

export default function SkillsPage() {
  const profile = useApp((s) => s.profile);
  if (!profile) return null;
  return <SkillsEditor profile={profile} />;
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[22px] border border-line bg-paper p-5 shadow-[var(--shadow-card)] sm:p-7">
      <h2 id={id} className="font-display text-xl font-bold tracking-[-0.02em]">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SkillsEditor({ profile }: { profile: Profile }) {
  const setProfile = useApp((s) => s.setProfile);
  const [draft, setDraft] = useState<Profile>(profile);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify({ ...draft, updatedAt: "" }) !== JSON.stringify({ ...profile, updatedAt: "" });

  const save = () => {
    setProfile({ ...draft, updatedAt: new Date().toISOString() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading eyebrow="Your profile" title="My skills">
        Changes apply to your next search. Saved issues are kept.
      </PageHeading>

      <Section id="levels" title="Levels" hint="How well you know each skill shapes the difficulty of what you see.">
        {draft.skills.length ? <ProficiencyEditor value={draft.skills} onChange={(skills) => setDraft({ ...draft, skills })} removable /> : <p className="text-sm font-semibold text-bad">Pick at least one skill below.</p>}
      </Section>

      <Section id="add" title="Skills">
        <SkillPicker value={draft.skills} onChange={(skills) => setDraft({ ...draft, skills })} />
      </Section>

      <Section id="time" title="Weekly availability">
        <OptionGroup label="Weekly availability" options={TIME} value={draft.time} onChange={(time) => setDraft({ ...draft, time })} />
        <h3 className="mb-3 mt-7 text-sm font-bold text-ink-2">Preferred task size</h3>
        <OptionGroup label="Preferred task size" options={SCOPE} value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} columns={4} />
      </Section>

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-[18px] border border-line-strong bg-paper/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur">
        <AnimatePresence>
          {saved && (
            <motion.span role="status" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="mr-auto inline-flex items-center gap-1.5 pl-2 text-sm font-semibold text-ok">
              <Check className="size-4" aria-hidden /> Saved. Your next search uses these skills.
            </motion.span>
          )}
        </AnimatePresence>
        <Button variant="ghost" onClick={() => setDraft(profile)} disabled={!dirty}>
          Discard
        </Button>
        <Button variant="primary" onClick={save} disabled={!dirty || draft.skills.length === 0}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
