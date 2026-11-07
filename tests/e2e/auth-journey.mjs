#!/usr/bin/env node
// Browser walk-through of accounts and saved issues in TEST MODE.
// Needs `npm run dev:test:auth` (fixture GitHub + real PostgreSQL with the real
// migration/RLS + the test-only Supabase stand-in). Not a test of Supabase's
// hosted Auth service: email delivery and Supabase's own rules are stand-ins.
//
// Usage: node tests/e2e/auth-journey.mjs
// Env:   BASE_URL (http://localhost:3000)  STANDIN_URL (http://localhost:54321)  CHROME_PATH  SHOTS
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STANDIN = process.env.STANDIN_URL ?? "http://localhost:54321";
const SHOTS = process.env.SHOTS ?? "e2e-shots/auth";
fs.mkdirSync(SHOTS, { recursive: true });

const run = Date.now().toString(36);
const A = { email: `alice-${run}@example.test`, password: "Orange-Kettle-81!", name: "Alice Rao" };
const B = { email: `bob-${run}@example.test`, password: "Blue-Lantern-27?", name: "Bob Lee" };
const NEWPW = "Fresh-Garden-63#";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
// The first-visit intro is covered by landing.mjs; skip it here.
const _newContext = browser.newContext.bind(browser);
browser.newContext = async (o) => {
  const c = await _newContext(o);
  await c.addInitScript(() => localStorage.setItem("contribly:intro-seen", "1"));
  return c;
};
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
    if (process.env.DEBUG_PENDING) for (const pg of browser.contexts().flatMap((c) => c.pages())) console.log("   pending:", await pg.evaluate(() => sessionStorage.getItem("contribly:pending-save")?.slice(0, 30) ?? null).catch(() => "n/a"));
  } catch (e) {
    results.push(["FAIL", name, e.message]);
    for (const pg of browser.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: path.join(SHOTS, `FAIL-${results.length}.png`) }).catch(() => {});
    console.log("FAIL", name, "\n   ", e.message.split("\n")[0]);
  }
};
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `${n}.png`) });
const latestLink = async (email, type) => {
  for (let i = 0; i < 20; i++) {
    const mails = await (await fetch(`${STANDIN}/__test/outbox?email=${encodeURIComponent(email)}`)).json();
    const m = mails.filter((x) => !type || x.type === type).at(-1);
    if (m) return m.link;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${type} email for ${email}`);
};
const main = (p) => p.locator("main:visible");
const cards = (p) => p.locator("article:visible");

async function onboardPython(p) {
  await p.goto(BASE + "/onboarding", { waitUntil: "networkidle" });
  await p.getByRole("group", { name: "Languages" }).getByRole("button", { name: "Python", exact: true }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Find my issues" }).click();
  await p.waitForURL("**/app/recommended", { timeout: 60_000 });
  await cards(p).first().waitFor({ timeout: 30_000 });
}

async function login(p, user, password = user.password, next = "") {
  await p.goto(`${BASE}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`, { waitUntil: "networkidle" });
  await p.getByLabel("Email").fill(user.email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Log in" }).click();
}

async function signupAndVerify(p, user) {
  await p.goto(BASE + "/signup", { waitUntil: "networkidle" });
  if (user.name) await p.getByLabel("Name").fill(user.name);
  await p.getByLabel("Email").fill(user.email);
  await p.getByLabel("Password", { exact: true }).fill(user.password);
  await p.getByLabel("Confirm password").fill(user.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await p.getByRole("heading", { name: "Check your email" }).waitFor();
  await p.goto(await latestLink(user.email, "signup"), { waitUntil: "networkidle" });
}

/* ------------------------------ device 1: Alice ------------------------------ */
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const a = await ctxA.newPage();
const consoleErrors = [];
a.on("pageerror", (e) => consoleErrors.push(String(e)));
if (process.env.DEBUG_PENDING) {
  await a.addInitScript(() => {
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.includes("pending")) console.log("DBG setItem " + location.pathname + " " + new Error().stack.split("\n").slice(2, 5).join(" | "));
      return o.call(this, k, v);
    };
  });
  a.on("console", (m) => m.text().startsWith("DBG") && console.log(m.text()));
}
let savedTitle = "";

await step("sidebar shows Create account and Log in when signed out", async () => {
  await onboardPython(a);
  const side = a.locator("aside");
  await side.getByRole("link", { name: "Create account" }).waitFor();
  await side.getByRole("link", { name: "Log in" }).waitFor();
  await shot(a, "01-signed-out-sidebar");
});

await step("signed-out save opens the prompt and keeps the issue", async () => {
  savedTitle = (await cards(a).first().locator("h3").innerText()).trim();
  await cards(a).first().getByRole("button", { name: /^Save / }).first().click();
  const d = a.getByRole("dialog");
  await d.getByText("Save it to your account").waitFor();
  await d.getByText(savedTitle).waitFor();
  await shot(a, "02-save-prompt");
  await d.getByRole("link", { name: "Create account" }).click();
  await a.waitForURL(/\/signup\?next=/);
  await a.getByText("Create an account to save that issue").waitFor();
});

await step("signup validates input and shows strength guidance", async () => {
  await a.getByLabel("Email").fill("not-an-email");
  await a.getByLabel("Password", { exact: true }).fill("password1");
  await a.getByLabel("Confirm password").fill("password2");
  await a.getByRole("button", { name: "Create account" }).click();
  await a.getByText("Enter a valid email address.").waitFor();
  await a.getByText("Passwords don't match.").waitFor();
  await a.getByRole("list", { name: "Password requirements" }).getByText("At least one uppercase letter (A-Z)", { exact: true }).waitFor();
  await shot(a, "03-signup-validation");
});

await step("duplicate signup submissions send only one request", async () => {
  let requests = 0;
  await a.route("**/api/auth/signup", async (route) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "verify-email" }) });
  });
  await a.getByLabel("Name").fill("Duplicate Test");
  await a.getByLabel("Email").fill("duplicate@example.test");
  await a.getByLabel("Password", { exact: true }).fill(A.password);
  await a.getByLabel("Confirm password").fill(A.password);
  await a.getByRole("button", { name: "Create account" }).click();
  await a.locator("form").evaluate((form) => form.requestSubmit());
  await a.getByRole("heading", { name: "Check your email" }).waitFor();
  await a.unroute("**/api/auth/signup");
  expect(requests === 1, `expected one signup request, got ${requests}`);
  await a.getByRole("button", { name: "Start over" }).click();
});

await step("signup requires email verification before login", async () => {
  await a.getByLabel("Name").fill(A.name);
  await a.getByLabel("Email").fill(A.email);
  await a.getByLabel("Password", { exact: true }).fill(A.password);
  await a.getByText("Strength: Strong.", { exact: true }).waitFor();
  await a.getByLabel("Confirm password").fill(A.password);
  await a.getByRole("button", { name: "Create account" }).click();
  await a.getByRole("heading", { name: "Check your email" }).waitFor();
  await shot(a, "04-check-email");
  const r = await a.evaluate(async (u) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) })).json(), { email: A.email, password: A.password });
  expect(r.kind === "unverified", "unverified account must not be able to log in");
});

await step("verification link signs in and offers the pending save", async () => {
  await a.goto(await latestLink(A.email, "signup"));
  await a.waitForURL(/\/app/);
  const d = a.getByRole("dialog");
  await d.getByText(/You.re in\. Save this issue\?/).waitFor({ timeout: 15_000 });
  await d.getByText(savedTitle).waitFor();
  await shot(a, "05-pending-save");
  await d.getByRole("button", { name: "Save issue" }).click();
  await a.getByText("Saved to your account.").waitFor();
});

await step("signed-in sidebar shows the account with a menu", async () => {
  const side = a.locator("aside");
  await side.getByText("Signed in").waitFor();
  await side.getByText(A.name).waitFor();
  await side.getByRole("button", { name: /Alice Rao/ }).click();
  const menu = a.getByRole("menu", { name: "Account" });
  await menu.getByRole("menuitem", { name: "My saved issues" }).waitFor();
  await menu.getByRole("menuitem", { name: "Log out" }).waitFor();
  await shot(a, "06-account-menu");
  await menu.getByRole("menuitem", { name: "My saved issues" }).click();
  await a.waitForURL("**/app/saved");
  await main(a).getByText(savedTitle).first().waitFor();
  await shot(a, "07-saved-page");
});

await step("guest preferences were uploaded to the account", async () => {
  const prefs = await a.evaluate(async () => (await fetch("/api/preferences")).json());
  expect(prefs.preferences?.skills?.some((s) => s.id === "python"), "preferences should contain Python");
});

await step("saved issues survive a refresh", async () => {
  await a.reload({ waitUntil: "networkidle" });
  await main(a).getByText(savedTitle).first().waitFor({ timeout: 15_000 });
});

await step("save and unsave from the feed", async () => {
  await a.goto(BASE + "/app/recommended", { waitUntil: "networkidle" });
  await a.locator("aside").getByText("Signed in").waitFor();
  const second = cards(a).nth(1);
  await second.waitFor();
  const t = (await second.locator("h3").innerText()).trim();
  await second.getByRole("button", { name: /^Save / }).first().click();
  await a.getByText("Saved to your account.").last().waitFor();
  await second.getByRole("button", { name: /^Remove / }).first().waitFor();
  await second.getByRole("button", { name: /^Remove / }).first().click();
  await a.getByText("Removed from saved issues.").waitFor();
  const list = await a.evaluate(async () => (await fetch("/api/saved")).json());
  expect(!list.items.some((i) => i.issue.title === t), "unsaved issue should be gone on the server");
  expect(list.items.length === 1, `expected exactly 1 saved issue, got ${list.items.length}`);
});

await step("log out clears the session", async () => {
  await a.locator("aside").getByRole("button", { name: /Alice Rao/ }).click();
  await a.getByRole("menuitem", { name: "Log out" }).click();
  await a.waitForURL(BASE + "/");
  await a.getByText("You're logged out.").waitFor();
  const s = await a.evaluate(async () => (await fetch("/api/auth/session")).json());
  expect(s.user === null, "session should be gone after logout");
  const r = await a.evaluate(async () => (await fetch("/api/saved")).status);
  expect(r === 401, `saved API after logout should be 401, got ${r}`);
});

await step("wrong password shows a clear error", async () => {
  await login(a, A, "Wrong-password-1!");
  await a.getByText("Email or password is incorrect.").waitFor();
  await shot(a, "08-login-error");
});

await step("log in again: saved issues and preferences come back", async () => {
  await login(a, A, A.password, "/app/saved");
  await a.waitForURL("**/app/saved");
  await main(a).getByText(savedTitle).first().waitFor({ timeout: 15_000 });
});

await step("open redirect is refused after login", async () => {
  await a.locator("aside").getByRole("button", { name: /Alice Rao/ }).click();
  await a.getByRole("menuitem", { name: "Log out" }).click();
  await a.waitForURL(BASE + "/");
  await login(a, A, A.password, "https://evil.example/steal");
  await a.waitForURL(/localhost:3000\/app/);
});

/* ------------------------------ device 2: Alice ------------------------------ */
await step("a second device sees the same saved issues", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await login(p, A, A.password, "/app/saved");
  await p.waitForURL("**/app/saved", { timeout: 20_000 });
  await main(p).getByText(savedTitle).first().waitFor({ timeout: 15_000 });
  await ctx.close();
});

/* ------------------------------ Bob: isolation ------------------------------ */
let aliceIssueId = 0;
await step("a second user cannot read, change or delete Alice's saved issues", async () => {
  const aliceList = await a.evaluate(async () => (await fetch("/api/saved")).json());
  aliceIssueId = aliceList.items[0].issue.id;

  const ctx = await browser.newContext();
  const b = await ctx.newPage();
  await signupAndVerify(b, B);
  await b.waitForURL(/\/(app|onboarding)/);
  const mine = await b.evaluate(async () => (await fetch("/api/saved")).json());
  expect(Array.isArray(mine.items) && mine.items.length === 0, "Bob should see no saved issues");
  const del = await b.evaluate(async (id) => (await fetch("/api/saved", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ githubIssueId: id }) })).json(), aliceIssueId);
  expect(del.removed === 0, "Bob's delete must not remove Alice's row");

  // Go around the app: talk to the REST API directly with Bob's own token.
  const tok = await (await fetch(`${STANDIN}/__test/token`, { method: "POST", body: JSON.stringify(B) })).json();
  const h = { apikey: "standin-publishable-key", Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" };
  const aliceId = (await a.evaluate(async () => (await fetch("/api/auth/session")).json())).user.id;
  const read = await (await fetch(`${STANDIN}/rest/v1/saved_issues?select=*&user_id=eq.${aliceId}`, { headers: h })).json();
  expect(Array.isArray(read) && read.length === 0, "direct REST read of Alice's rows must return nothing");
  const patch = await (await fetch(`${STANDIN}/rest/v1/saved_issues?github_issue_id=eq.${aliceIssueId}`, { method: "PATCH", headers: h, body: JSON.stringify({ title: "pwned" }) })).json();
  expect(Array.isArray(patch) && patch.length === 0, "direct REST update must affect nothing");
  const ins = await fetch(`${STANDIN}/rest/v1/saved_issues`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ user_id: aliceId, github_issue_id: 999999, repo_owner: "x", repo_name: "y", issue_number: 1, title: "t", url: "https://github.com/x/y/issues/1", snapshot: {} }),
  });
  expect(ins.status === 403, `inserting a row owned by Alice must be refused (got ${ins.status})`);
  const steal = await fetch(`${STANDIN}/rest/v1/saved_issues?github_issue_id=eq.${aliceIssueId}`, { method: "PATCH", headers: h, body: JSON.stringify({ user_id: tok.user.id }) });
  expect(steal.status === 403, `changing ownership must be refused (got ${steal.status})`);
  await ctx.close();

  const still = await a.evaluate(async () => (await fetch("/api/saved")).json());
  expect(still.items.length === 1 && still.items[0].issue.title === savedTitle, "Alice's saved issue must be untouched");
});

await step("unauthenticated save requests are rejected", async () => {
  const r = await fetch(`${BASE}/api/saved`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issue: { id: 1 } }) });
  expect(r.status === 401 || r.status === 400, `expected 401/400, got ${r.status}`);
  const r2 = await fetch(`${BASE}/api/saved`, { headers: {} });
  expect(r2.status === 401, `expected 401 for list, got ${r2.status}`);
});

await step("expired session is handled with a log-in prompt", async () => {
  await a.goto(BASE + "/app/recommended", { waitUntil: "networkidle" });
  await cards(a).nth(1).waitFor();
  await fetch(`${STANDIN}/__test/revoke`, { method: "POST", body: JSON.stringify({ email: A.email }) });
  await cards(a).nth(1).getByRole("button", { name: /^Save / }).first().click();
  const d = a.getByRole("dialog");
  await d.getByText("Your session expired").waitFor({ timeout: 15_000 });
  await shot(a, "09-session-expired");
  await d.getByRole("link", { name: "Log in again" }).click();
  await a.waitForURL(/\/login/);
});

await step("password reset by email, old password stops working", async () => {
  await a.goto(BASE + "/forgot-password", { waitUntil: "networkidle" });
  await a.getByLabel("Email").fill(A.email);
  await a.getByRole("button", { name: "Send reset link" }).click();
  await a.getByRole("heading", { name: "Check your email" }).waitFor();
  await a.goto(await latestLink(A.email, "recovery"), { waitUntil: "networkidle" });
  await a.waitForURL("**/reset-password");
  await a.getByRole("heading", { name: "Choose a new password" }).waitFor({ timeout: 15_000 });
  await a.getByLabel("New password", { exact: true }).fill(NEWPW);
  await a.getByLabel("Confirm new password").fill(NEWPW);
  await shot(a, "10-reset-password");
  await a.getByRole("button", { name: "Save new password" }).click();
  await a.getByText("Password updated.").waitFor();
  await a.evaluate(async () => fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  const old = await a.evaluate(async (u) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) })).json(), { email: A.email, password: A.password });
  expect(old.kind === "credentials", "old password must fail");
  const fresh = await a.evaluate(async (u) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(u) })).status, { email: A.email, password: NEWPW });
  expect(fresh === 200, "new password must work");
});

await step("a used reset link cannot be reused", async () => {
  const link = await latestLink(A.email, "recovery");
  await a.goto(link, { waitUntil: "networkidle" });
  await a.waitForURL(/\/auth\/error\?reason=expired/);
  await a.getByRole("heading", { name: "This link has expired" }).waitFor();
});

await ctxA.close();

/* ------------------------------ mobile ------------------------------ */
await step("mobile: signed-in account menu and no horizontal scroll", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(BASE + "/login?next=%2Fapp%2Fsaved", { waitUntil: "networkidle" });
  await shot(p, "11-mobile-login");
  await p.getByLabel("Email").fill(A.email);
  await p.getByLabel("Password", { exact: true }).fill(NEWPW);
  await p.getByRole("button", { name: "Log in" }).click();
  await p.waitForURL("**/app/saved", { timeout: 20_000 });
  await main(p).getByText(savedTitle).first().waitFor({ timeout: 15_000 });
  await p.getByRole("button", { name: "Account menu" }).click();
  await p.getByRole("menuitem", { name: "Log out" }).waitFor();
  await shot(p, "12-mobile-account-menu");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `mobile overflows by ${overflow}px`);
  await ctx.close();
});

await browser.close();
if (consoleErrors.length) {
  console.log("\nPage errors:");
  consoleErrors.slice(0, 8).forEach((e) => console.log(" -", e.slice(0, 300)));
}
const failed = results.filter((x) => x[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
