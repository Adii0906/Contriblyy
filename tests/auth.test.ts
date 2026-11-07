import { describe, expect, it } from "vitest";
import { safeHref, safeNext } from "@/lib/auth/redirect";
import { loginSchema, passwordRequirements, passwordStrength, resetSchema, signupSchema } from "@/lib/auth/schemas";
import { mapAuthError } from "@/lib/auth/errors";
import { fromRow, issueSummarySchema, saveRequestSchema, toInsertRow } from "@/lib/saved/schemas";
import { preferencesSchema } from "@/lib/preferences";
import { summary, fakeVerification } from "./helpers";

describe("safeNext (open redirect protection)", () => {
  it.each([
    ["/app/saved", "/app/saved"],
    ["/app?tab=1#x", "/app?tab=1#x"],
    ["/reset-password", "/reset-password"],
  ])("allows %s", (input, out) => expect(safeNext(input)).toBe(out));

  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "http:/evil.example",
    "/app\n/x",
    "",
    "app/saved",
    "/auth/confirm?next=//evil",
    "/api/saved",
    "x".repeat(600),
  ])("rejects %s", (input) => expect(safeNext(input, "/app")).toBe("/app"));

  it("rejects non-strings", () => {
    expect(safeNext(undefined)).toBe("/app");
    expect(safeNext({ toString: () => "/app/saved" })).toBe("/app");
  });
});

describe("safeHref", () => {
  it("keeps http(s) links and neutralises others", () => {
    expect(safeHref("https://github.com/a/b")).toBe("https://github.com/a/b");
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("data:text/html,x")).toBe("#");
    expect(safeHref(42)).toBe("#");
  });
});

describe("auth validation", () => {
  it("validates signup input", () => {
    expect(signupSchema.safeParse({ name: "Ada", email: "a@b.co", password: "Rishibhai@123" }).success).toBe(true);
    expect(signupSchema.safeParse({ email: "a@b.co", password: "Rishibhai@123" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "  ", email: "a@b.co", password: "Rishibhai@123" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "Ada", email: "nope", password: "Rishibhai@123" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "Ada", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "Ada", email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "<script>", email: "a@b.co", password: "Rishibhai@123" }).success).toBe(false);
    const validName = signupSchema.parse({ name: " Ada ", email: " a@b.co ", password: "Rishibhai@123" });
    expect(validName.name).toBe("Ada");
    expect(validName.email).toBe("a@b.co");
  });
  it("enforces the same character-category policy on signup and password reset", () => {
    const missingPolicyPassword = "rishibhai123";
    expect(signupSchema.safeParse({ name: "Ada", email: "a@b.co", password: missingPolicyPassword }).success).toBe(false);
    expect(resetSchema.safeParse({ password: missingPolicyPassword }).success).toBe(false);
    expect(resetSchema.safeParse({ password: "Rishibhai@123" }).success).toBe(true);
    expect(passwordRequirements("Rishibhai@123").every((requirement) => requirement.met)).toBe(true);
    expect(passwordRequirements("rishibhai123").find((requirement) => requirement.id === "uppercase")?.met).toBe(false);
    expect(passwordRequirements("RISHIBHAI@123").find((requirement) => requirement.id === "lowercase")?.met).toBe(false);
    expect(passwordRequirements("Rishibhai123").find((requirement) => requirement.id === "special")?.met).toBe(false);
    expect(passwordRequirements("Rishibhai@").find((requirement) => requirement.id === "number")?.met).toBe(false);
  });
  it("login requires a password", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "", password: "valid-password" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "valid-password" }).success).toBe(true);
  });
  it("password strength guidance", () => {
    expect(passwordStrength("short").label).toBe("Weak");
    expect(passwordStrength("Rishi@12").label).toBe("Fair");
    expect(passwordStrength("Rishibhai@123").label).toBe("Strong");
  });
});

describe("auth error mapping never leaks internals", () => {
  it.each([
    ["invalid_credentials", "credentials"],
    ["email_not_confirmed", "unverified"],
    ["user_already_exists", "exists"],
    ["weak_password", "weak"],
    ["over_request_rate_limit", "rate"],
    ["over_email_send_rate_limit", "rate"],
    ["otp_expired", "expired"],
    ["same_password", "same"],
    ["unexpected_failure", "generic"],
  ])("%s -> %s", (code, kind) => {
    const f = mapAuthError({ code, message: "internal: db row 123 violated constraint" });
    expect(f.kind).toBe(kind);
    expect(f.message).not.toMatch(/internal|constraint/);
  });
  it("gives existing accounts a safe login path", () => {
    const failure = mapAuthError({ code: "user_already_exists" });
    expect(failure.status).toBe(409);
    expect(failure.message).toMatch(/Log in instead/);
  });
  it("distinguishes request and email-send rate limits", () => {
    expect(mapAuthError({ code: "over_request_rate_limit" }).message).toMatch(/network/);
    expect(mapAuthError({ code: "over_email_send_rate_limit" }).message).toMatch(/Email sending/);
  });
});

describe("saved issue payloads", () => {
  it("round-trips an issue and never includes user_id", () => {
    const issue = summary("quillstack", 101, ["python"]);
    const row = toInsertRow(issue, fakeVerification("promising"));
    expect(Object.keys(row)).not.toContain("user_id");
    const back = fromRow({ ...row, created_at: "2026-10-25T00:00:00Z" });
    expect(back?.issue).toEqual(issue);
    expect(back?.verification?.result.assessment).toBe("promising");
  });

  it("rejects non-GitHub links and oversized fields", () => {
    const issue = summary("quillstack", 101, ["python"]);
    expect(issueSummarySchema.safeParse({ ...issue, url: "javascript:alert(1)" }).success).toBe(false);
    expect(issueSummarySchema.safeParse({ ...issue, url: "https://evil.example/fixture-labs/quillstack/issues/101" }).success).toBe(false);
    expect(issueSummarySchema.safeParse({ ...issue, title: "x".repeat(600) }).success).toBe(false);
    expect(issueSummarySchema.safeParse({ ...issue, repo: { ...issue.repo, owner: "../etc" } }).success).toBe(false);
    expect(saveRequestSchema.safeParse({ issue, verification: { ...fakeVerification("promising"), checks: { blob: "x".repeat(70_000) } } }).success).toBe(false);
  });

  it("falls back to indexed columns when a stored snapshot is unreadable", () => {
    const dto = fromRow({ github_issue_id: "77", repo_owner: "o", repo_name: "r", issue_number: 5, title: "T", url: "https://github.com/o/r/issues/5", snapshot: { broken: true }, verification: null, created_at: "2026-10-25T00:00:00Z" });
    expect(dto?.issue.id).toBe(77);
    expect(dto?.issue.repo.fullName).toBe("o/r");
    expect(dto?.verification).toBeUndefined();
  });
});

describe("preferences payload", () => {
  const ok = { skills: [{ id: "python", label: "Python", proficiency: "comfortable" }], time: "5-8", scope: "any", autoVerify: true, filters: {} };
  it("accepts a valid payload", () => expect(preferencesSchema.safeParse(ok).success).toBe(true));
  it("rejects unknown enum values and empty skills", () => {
    expect(preferencesSchema.safeParse({ ...ok, time: "lots" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, skills: [] }).success).toBe(false);
  });
});
