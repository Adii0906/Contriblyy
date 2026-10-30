#!/usr/bin/env node
// Browser walk-through of the primary journey in TEST MODE (fixture server).
// Usage: start `npm run dev:test`, then `node tests/e2e/journey.mjs`.
// Optional: CHROME_PATH=/path/to/chrome  BASE_URL=http://localhost:3000  SHOTS=dir
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

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
  } catch (e) {
    results.push(["FAIL", name, e.message]);
    console.log("FAIL", name, "\n   ", e.message.split("\n")[0]);
  }
};
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await step("landing renders hero and demo label", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Stop chasing issues that go nowhere." }).waitFor();
  await page.getByText("Illustration with example data").waitFor();
  await page.waitForTimeout(3800);
  await shot(page, "01-landing");
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(900);
  await shot(page, "02-landing-problem");
  await page.locator("#different").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await shot(page, "03-landing-verification");
});

await step("onboarding: skills, proficiency, time", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Find my first issue" }).first().click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("heading", { name: "What do you work with?" }).waitFor();
  for (const s of ["Python", "SQL", "React", "TypeScript"]) await page.getByRole("button", { name: s, exact: true }).click();
  await page.locator("#custom-skill").fill("GraphQL");
  await page.getByRole("button", { name: "Add" }).click();
  await shot(page, "04-onboarding-skills");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: "How well do you know each one?" }).waitFor();
  await page.getByRole("radiogroup", { name: "Python proficiency" }).getByRole("radio", { name: "Experienced" }).click();
  await page.getByRole("radiogroup", { name: "SQL proficiency" }).getByRole("radio", { name: "Learning" }).click();
  await page.getByRole("radiogroup", { name: "React proficiency" }).getByRole("radio", { name: "Learning" }).click();
  await shot(page, "05-onboarding-proficiency");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: /5 to 8 hours/ }).click();
  await shot(page, "06-onboarding-time");
  await page.getByRole("button", { name: "Find my issues" }).click();
  await page.getByText("Verify each issue").first().waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "07-onboarding-discover-progress");
});

await step("discover step finishes and lands on recommendations", async () => {
  await page.waitForURL("**/app/recommended", { timeout: 60_000 });
  await page.getByRole("heading", { name: "Recommended", exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("article")].filter((a) => a.offsetParent !== null).length > 0, null, { timeout: 30_000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Checking\n"), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "08-recommended");
  const banner = await page.getByText("Test mode.").count();
  expect(banner > 0, "test-mode banner missing");
  const text = await page.locator("main:visible").innerText();
  expect(text.includes("Promising"), "expected at least one Promising issue");
  expect(!text.includes("NOT RECOMMENDED"), "not recommended issues should be hidden by default");
  expect(text.includes("not recommended issue"), "toggle to show hidden issues should be present");
});

await step("evidence panel expands with real check details", async () => {
  const first = page.locator("article:visible").first();
  await first.getByRole("button", { name: "Show evidence" }).click();
  await first.getByText("Why this verdict").waitFor();
  await first.getByText("How it fits you").waitFor();
  await page.waitForTimeout(500);
  await first.scrollIntoViewIfNeeded();
  await shot(page, "09-evidence-panel");
});

await step("signed-out save asks to log in or create an account", async () => {
  const first = page.locator("article:visible").first();
  await first.getByRole("button", { name: /^Save / }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const text = await dialog.innerText();
  expect(/Save it to your account|Accounts aren't set up here/.test(text), "expected the save prompt");
  await shot(page, "10-save-prompt");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
});

await step("guest profile persists after reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("article:visible").first().waitFor();
});

await step("discover: filters, sort, likely unavailable visible", async () => {
  await page.getByRole("link", { name: "Discover" }).first().click();
  await page.waitForURL(/\/app$/);
  await page.waitForFunction(() => [...document.querySelectorAll("article")].filter((a) => a.offsetParent !== null).length >= 4, null, { timeout: 30_000 });
  await page.waitForTimeout(4000);
  await shot(page, "11-discover");
  const before = await page.locator("article:visible").count();
  await page.getByRole("button", { name: /^Status/ }).click();
  await page.getByRole("group", { name: "Status filter" }).getByText("Likely unavailable").click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  const after = await page.locator("article:visible").count();
  expect(after > 0 && after < before, `status filter should narrow results (${before} -> ${after})`);
  await shot(page, "12-discover-filtered");
  const txt = await page.locator("main:visible").innerText();
  expect(/Open PR linked|Claimed in comments|Archived|Fix already merged/.test(txt), "expected blocking evidence on likely unavailable issues");
  expect(txt.includes("NOT RECOMMENDED"), "expected the NOT RECOMMENDED badge");
  expect(/ALREADY CLAIMED|PULL REQUEST IN PROGRESS|ALREADY FIXED|REPOSITORY ARCHIVED/.test(txt), "expected a red evidence warning");
  await page.getByRole("button", { name: /^Clear/ }).click();
  await page.getByRole("radio", { name: "Recent" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("radio", { name: "Best match" }).click();
});

await step("partial verification is shown honestly", async () => {
  const txt = await page.locator("main:visible").innerText();
  expect(txt.includes("Could not check"), "expected a 'Could not check' cell for the failing fixture repository");
});

await step("recheck re-runs checks", async () => {
  const title = (await page.locator("article:visible").first().locator("h3").innerText()).trim();
  const card = page.locator("article:visible", { hasText: title });
  await card.getByRole("button", { name: "Show evidence" }).click();
  await card.getByRole("button", { name: "Recheck" }).click();
  await card.getByText(/Checking|Verifying|Queued/).first().waitFor({ timeout: 5000 });
  const firstNow = (await page.locator("article:visible").first().locator("h3").innerText()).trim();
  expect(firstNow === title, "rechecked card should keep its position while checks run");
  await card.getByRole("button", { name: "Recheck" }).waitFor({ timeout: 20_000 });
});

await step("maintainer inactive warning appears only with evidence", async () => {
  await page.getByRole("link", { name: /My skills/ }).first().click();
  await page.getByRole("heading", { name: "My skills" }).waitFor();
  await page.getByRole("group", { name: "Languages" }).getByRole("button", { name: "Go", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("link", { name: "Discover" }).first().click();
  await page.locator("#issue-search").fill("shutdown");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const card = page.locator("article:visible", { hasText: "Graceful shutdown" });
  await card.waitFor({ timeout: 20_000 });
  await card.getByRole("note").filter({ hasText: "Maintainer inactive" }).waitFor({ timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await shot(page, "24-maintainer-inactive");
});

await step("loading skeleton appears while searching", async () => {
  await page.locator("#issue-search").fill(`fresh${Date.now() % 100000}`); // unique so the server cache cannot answer instantly
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator('[aria-label="Searching GitHub"]').waitFor({ timeout: 3000 });
  await shot(page, "17-state-loading");
});

for (const [kw, expectText, name] of [
  ["servererror", "Search did not complete", "14-state-error"],
  ["nothingmatches", "No open, unassigned issues matched", "15-state-empty"],
  ["partialsearch", "Partial results", "16-state-partial"],
  ["ratelimit", "GitHub's search limit was reached", "13-state-rate-limit"],
]) {
  await step(`state: ${kw}`, async () => {
    await page.locator("#issue-search").fill(kw);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText(expectText).first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await shot(page, name);
  });
}

await step("history and skills pages", async () => {
  await page.getByRole("link", { name: /Search history/ }).first().click();
  await page.getByRole("heading", { name: "Search history" }).waitFor();
  await page.getByText("ratelimit").first().waitFor();
  await shot(page, "18-history");
  await page.getByRole("link", { name: /My skills/ }).first().click();
  await page.getByRole("heading", { name: "My skills" }).waitFor();
  await page.getByRole("radiogroup", { name: "SQL proficiency" }).getByRole("radio", { name: "Comfortable" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved. Your next search uses these skills.").waitFor();
  await shot(page, "19-skills");
  await page.getByRole("link", { name: "Settings" }).first().click();
  await page.getByText("Test mode: local fixture server").waitFor();
  await shot(page, "20-settings");
});

await step("keyboard: focus is visible on primary controls", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline !== "none", "focused element has no outline");
});

await ctx.close();

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await step("mobile landing and dashboard have no horizontal scroll", async () => {
  await mp.goto(BASE + "/", { waitUntil: "networkidle" });
  await mp.waitForTimeout(3500);
  await shot(mp, "21-mobile-landing");
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 1, `landing overflows by ${overflow}px`);
  await mp.goto(BASE + "/onboarding", { waitUntil: "networkidle" });
  await mp.getByRole("button", { name: "Python", exact: true }).click();
  await mp.getByRole("button", { name: "Continue" }).click();
  await mp.getByRole("button", { name: "Continue" }).click();
  await mp.getByRole("button", { name: "Find my issues" }).click();
  await mp.waitForURL("**/app/recommended", { timeout: 60_000 });
  await mp.locator("article:visible").first().waitFor();
  await mp.waitForTimeout(2500);
  await shot(mp, "22-mobile-recommended");
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2 <= 1, `dashboard overflows by ${overflow2}px`);
  await mp.locator("article:visible").first().getByRole("button", { name: "Show evidence" }).click();
  await mp.waitForTimeout(600);
  await shot(mp, "23-mobile-evidence");
});
await m.close();

// Reduced motion
const r = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
const rp = await r.newPage();
await step("reduced motion: demo preview settles immediately", async () => {
  await rp.goto(BASE + "/", { waitUntil: "networkidle" });
  await rp.waitForTimeout(400);
  const txt = await rp.locator("figure").first().innerText();
  expect(/recommended/i.test(txt), "reduced-motion illustration should show its final state right away");
});
await r.close();

await browser.close();

const relevantErrors = consoleErrors.filter((e) => !/Failed to load resource|favicon/i.test(e));
if (relevantErrors.length) {
  console.log("\nConsole errors:");
  relevantErrors.slice(0, 10).forEach((e) => console.log(" -", e.slice(0, 300)));
}
const failed = results.filter((x) => x[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
