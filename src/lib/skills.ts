// Skill catalog. Drives onboarding chips, search query building and matching.

export type SkillKind = "language" | "framework" | "tool" | "domain";

export interface SkillDef {
  id: string;
  label: string;
  kind: SkillKind;
  /** GitHub `language:` qualifier value, for language skills */
  ghLanguage?: string;
  /** Repository languages that count as evidence for this skill */
  repoLanguages?: string[];
  /** Words that indicate the skill in issue text/labels (lowercase) */
  keywords: string[];
  /** Search keyword for framework/tool/domain queries */
  searchTerm?: string;
}

export const SKILLS: SkillDef[] = [
  { id: "python", label: "Python", kind: "language", ghLanguage: "Python", repoLanguages: ["Python", "Jupyter Notebook"], keywords: ["python", "pip", "pytest", "django", "flask", "pandas", ".py"] },
  { id: "javascript", label: "JavaScript", kind: "language", ghLanguage: "JavaScript", repoLanguages: ["JavaScript"], keywords: ["javascript", "js", "node", "npm", "eslint"] },
  { id: "typescript", label: "TypeScript", kind: "language", ghLanguage: "TypeScript", repoLanguages: ["TypeScript"], keywords: ["typescript", "ts", "types", "tsconfig"] },
  { id: "java", label: "Java", kind: "language", ghLanguage: "Java", repoLanguages: ["Java", "Kotlin"], keywords: ["java", "jvm", "maven", "gradle", "spring"] },
  { id: "cpp", label: "C++", kind: "language", ghLanguage: "C++", repoLanguages: ["C++", "C"], keywords: ["c++", "cpp", "cmake", "stl"] },
  { id: "go", label: "Go", kind: "language", ghLanguage: "Go", repoLanguages: ["Go"], keywords: ["golang", "go module", "goroutine", "go"] },
  { id: "rust", label: "Rust", kind: "language", ghLanguage: "Rust", repoLanguages: ["Rust"], keywords: ["rust", "cargo", "crate", "clippy"] },
  { id: "csharp", label: "C#", kind: "language", ghLanguage: "C#", repoLanguages: ["C#"], keywords: ["c#", "csharp", ".net", "dotnet"] },
  { id: "php", label: "PHP", kind: "language", ghLanguage: "PHP", repoLanguages: ["PHP"], keywords: ["php", "laravel", "composer"] },
  { id: "ruby", label: "Ruby", kind: "language", ghLanguage: "Ruby", repoLanguages: ["Ruby"], keywords: ["ruby", "rails", "gem"] },
  { id: "kotlin", label: "Kotlin", kind: "language", ghLanguage: "Kotlin", repoLanguages: ["Kotlin"], keywords: ["kotlin", "android"] },
  { id: "swift", label: "Swift", kind: "language", ghLanguage: "Swift", repoLanguages: ["Swift"], keywords: ["swift", "ios", "swiftui"] },
  { id: "react", label: "React", kind: "framework", searchTerm: "react", repoLanguages: ["TypeScript", "JavaScript"], keywords: ["react", "jsx", "tsx", "component", "hook", "usestate"] },
  { id: "nextjs", label: "Next.js", kind: "framework", searchTerm: "nextjs", repoLanguages: ["TypeScript", "JavaScript"], keywords: ["next.js", "nextjs", "app router", "server component"] },
  { id: "vue", label: "Vue", kind: "framework", searchTerm: "vue", repoLanguages: ["Vue", "TypeScript", "JavaScript"], keywords: ["vue", "nuxt", "pinia"] },
  { id: "fastapi", label: "FastAPI", kind: "framework", searchTerm: "fastapi", repoLanguages: ["Python"], keywords: ["fastapi", "pydantic", "starlette", "uvicorn", "endpoint"] },
  { id: "django", label: "Django", kind: "framework", searchTerm: "django", repoLanguages: ["Python"], keywords: ["django", "orm", "migration"] },
  { id: "sql", label: "SQL", kind: "domain", searchTerm: "sql", keywords: ["sql", "postgres", "postgresql", "mysql", "sqlite", "query", "database", "schema", "migration"] },
  { id: "docker", label: "Docker", kind: "tool", searchTerm: "docker", repoLanguages: ["Dockerfile", "Shell"], keywords: ["docker", "dockerfile", "container", "compose", "image"] },
  { id: "kubernetes", label: "Kubernetes", kind: "tool", searchTerm: "kubernetes", keywords: ["kubernetes", "k8s", "helm", "kubectl"] },
  { id: "ml", label: "Machine Learning", kind: "domain", searchTerm: "machine learning", repoLanguages: ["Python", "Jupyter Notebook"], keywords: ["machine learning", "model", "training", "pytorch", "tensorflow", "inference", "neural", "ml"] },
  { id: "data", label: "Data Science", kind: "domain", searchTerm: "data analysis", repoLanguages: ["Python", "Jupyter Notebook", "R"], keywords: ["pandas", "numpy", "dataframe", "notebook", "visualization", "dataset", "plot"] },
  { id: "devops", label: "CI / DevOps", kind: "tool", searchTerm: "github actions", keywords: ["ci", "github actions", "workflow", "pipeline", "deploy", "yaml"] },
  { id: "docs", label: "Documentation", kind: "domain", searchTerm: "documentation", keywords: ["documentation", "docs", "readme", "typo", "guide", "tutorial"] },
  { id: "testing", label: "Testing", kind: "domain", searchTerm: "tests", keywords: ["test", "tests", "unit test", "coverage", "pytest", "jest", "vitest"] },
  { id: "css", label: "CSS / UI", kind: "domain", searchTerm: "css", repoLanguages: ["CSS", "SCSS", "HTML"], keywords: ["css", "style", "layout", "responsive", "tailwind", "ui", "accessibility", "a11y"] },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}

/** Build a definition for a user-typed custom skill. */
export function customSkillDef(id: string, label: string): SkillDef {
  const term = label.trim().toLowerCase();
  return { id, label, kind: "domain", searchTerm: term, keywords: [term] };
}

export function resolveSkill(id: string, label: string): SkillDef {
  return getSkill(id) ?? customSkillDef(id, label);
}

export function slugifySkill(label: string): string {
  return (
    "custom-" +
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9+#.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
  );
}
