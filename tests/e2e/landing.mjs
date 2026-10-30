#!/usr/bin/env node
// Landing page checks: first-visit intro, Skip Intro, reduced motion, the
// full-title scratch on NOT RECOMMENDED issues at several widths, and the
// Log in / Create account buttons. Needs the app running (any test stack).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "e2e-shots/landing";
fs.mkdirSync(SHOTS, { recursive: true });
const PHRASES = ["Start your first contribution.", "Build real-world experience.", "Work on projects that matter.", "Make your GSoC journey count."];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
  } catch (e) {
    results.push(["FAIL", name]);
    console.log("FAIL", name, "\n   ", e.message.split("\n")[0]);
  }
};
const expect = (c, m) => {
  if (!c) throw new Error(m);
};
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, `${n}.png`) });
const skipIntro = (ctx) => ctx.addInitScript(() => localStorage.setItem("contribly:intro-seen", "1"));
const overlayShown = (p) => p.evaluate(() => getComputedStyle(document.querySelector(".intro-overlay") ?? document.body).display === "block" && document.documentElement.dataset.intro === "play");

/* ----------------------------- intro ----------------------------- */

await step("first visit plays the intro: four phrases typed in order, then the landing headline", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  expect(await overlayShown(p), "overlay should be visible on first paint");
  const seen = new Set();
  let cursorSeen = false;
  let shots = 0;
  while (Date.now() - t0 < 12000) {
    const st = await p.evaluate(() => {
      const el = document.querySelector("[data-intro-phrase]");
      return { text: el?.textContent ?? "", cursor: Boolean(el?.querySelector(".intro-cursor")), stage: document.querySelector(".intro-overlay")?.getAttribute("data-intro-stage") ?? "gone" };
    });
    if (st.cursor) cursorSeen = true;
    if (PHRASES.includes(st.text)) {
      if (!seen.has(st.text) && shots < 4) await shot(p, `intro-${++shots}`);
      seen.add(st.text);
    }
    if (st.stage === "exit" && shots < 5) {
      await shot(p, `intro-${++shots}-exit`);
      shots = 5;
    }
    if (st.stage === "gone") break;
    await p.waitForTimeout(40);
  }
  const elapsed = Date.now() - t0;
  expect(cursorSeen, "blinking cursor should be present");
  expect(PHRASES.every((x) => seen.has(x)), `all phrases should be typed fully, saw: ${[...seen].join(" | ")}`);
  expect(elapsed > 7500 && elapsed < 10000, `intro should take about 9 seconds, took ${elapsed}ms`);
  await p.getByRole("heading", { name: "Stop chasing issues that go nowhere." }).waitFor();
  expect(!(await overlayShown(p)), "overlay should be gone");
  expect((await p.evaluate(() => localStorage.getItem("contribly:intro-seen"))) === "1", "first visit should be remembered");
  expect((await p.evaluate(() => getComputedStyle(document.body).overflow)) !== "hidden", "page scroll should be restored");
  await shot(p, "intro-after");
  console.log(`    intro length: ${(elapsed / 1000).toFixed(1)}s`);

  await p.reload({ waitUntil: "domcontentloaded" });
  expect(!(await overlayShown(p)), "intro must not play again on a return visit");
  await ctx.close();
});

await step("Skip intro button ends it immediately and is remembered", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const skip = p.getByRole("button", { name: /Skip intro/ });
  await skip.waitFor();
  await p.waitForTimeout(900);
  await shot(p, "intro-mobile");
  const focused = await p.evaluate(() => document.activeElement?.textContent ?? "");
  expect(/Skip intro/.test(focused), "Skip intro should receive focus");
  const t = Date.now();
  await skip.click();
  await p.waitForFunction(() => !document.querySelector(".intro-overlay"), null, { timeout: 2500 });
  expect(Date.now() - t < 1600, "skip should finish quickly");
  await p.getByRole("heading", { name: "Stop chasing issues that go nowhere." }).waitFor();
  await p.reload({ waitUntil: "domcontentloaded" });
  expect(!(await overlayShown(p)), "skipped intro must not replay");
  await ctx.close();
});

await step("Escape also skips", async () => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => (document.querySelector("[data-intro-phrase]")?.textContent ?? "").length > 2);
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.querySelector(".intro-overlay"), null, { timeout: 2500 });
  await ctx.close();
});

await step("prefers-reduced-motion: no intro", async () => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  expect(!(await overlayShown(p)), "intro must not play with reduced motion");
  await p.getByRole("heading", { name: "Stop chasing issues that go nowhere." }).waitFor();
  await ctx.close();
});

await step("?intro=1 replays it on demand", async () => {
  const ctx = await browser.newContext();
  await skipIntro(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE + "/?intro=1", { waitUntil: "domcontentloaded" });
  expect(await overlayShown(p), "intro should replay with ?intro=1");
  await ctx.close();
});

/* ----------------------------- scratch coverage ----------------------------- */

/** Every line fragment of each scratched title must span the text from first to last glyph. */
async function checkScratch(p, label, scope = "body") {
  return p.evaluate(([label, scope]) => {
    const out = [];
    for (const el of document.querySelectorAll(`${scope} [data-scratch-title]`)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const cs = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const textRects = [...range.getClientRects()].filter((x) => x.width > 0.5);
      const lines = new Map();
      for (const tr of textRects) {
        const k = Math.round(tr.top);
        const cur = lines.get(k);
        lines.set(k, cur ? { left: Math.min(cur.left, tr.left), right: Math.max(cur.right, tr.right) } : { left: tr.left, right: tr.right });
      }
      const frags = [...el.getClientRects()].filter((x) => x.width > 0.5);
      const lineList = [...lines.values()];
      const okCount = frags.length === lineList.length;
      const okEdges = lineList.every((ln, i) => frags[i] && Math.abs(frags[i].left - ln.left) < 1.5 && Math.abs(frags[i].right - ln.right) < 1.5);
      out.push({
        label,
        text: el.textContent,
        lines: frags.length,
        ok: okCount && okEdges && cs.boxDecorationBreak === "clone" && el.dataset.on === "true" && /100% 100%, 100% 100%/.test(cs.backgroundSize) && cs.backgroundImage.split("url(").length === 3,
        size: cs.backgroundSize,
      });
    }
    return out;
  }, [label, scope]);
}

const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "small", width: 320, height: 640 },
];

for (const w of WIDTHS) {
  await step(`scratch covers whole NOT RECOMMENDED titles (${w.name} ${w.width}px)`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    await skipIntro(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    // Hero illustration: wait until the struck card has its verdict.
    const hero = p.locator("figure [data-scratch-title]");
    await hero.waitFor({ timeout: 10_000 });
    await p.waitForTimeout(900);
    await hero.scrollIntoViewIfNeeded();
    await shot(p, `scratch-hero-${w.name}`);
    const heroRes = await checkScratch(p, "hero", "figure");
    expect(heroRes.length >= 1 && heroRes.every((r) => r.ok), `hero scratch incomplete: ${JSON.stringify(heroRes)}`);
    const heroText = heroRes.map((r) => r.text).join();
    expect(heroText === "Focus ring missing on segmented control", `scratch must wrap the full title, got "${heroText}"`);
    const recommendedStruck = await p.evaluate(() => [...document.querySelectorAll("[data-scratch-title]")].some((e) => /cursor pagination/.test(e.textContent ?? "")));
    expect(!recommendedStruck, "recommended issue must not be scratched");

    // Verification demo: Not recommended is the default tab.
    const demo = p.getByRole("tabpanel");
    await demo.scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
    await shot(p, `scratch-demo-${w.name}`);
    const all = await checkScratch(p, "page");
    const demoRes = all.filter((r) => /Migrate settings page/.test(r.text));
    expect(demoRes.length === 1 && demoRes[0].ok, `demo scratch incomplete: ${JSON.stringify(demoRes)}`);
    await demo.getByText(/NOT RECOMMENDED|Not recommended/).first().waitFor();
    await demo.getByText(/Maintainer inactive/i).first().waitFor();

    // Switching to a promising example removes the scratch.
    await p.getByRole("tab", { name: "Promising" }).click();
    await p.waitForTimeout(400);
    const afterPromising = (await checkScratch(p, "page")).filter((r) => /Add retry with backoff/.test(r.text));
    expect(afterPromising.length === 0, "promising example must not be scratched");
    await p.getByRole("tab", { name: "Not recommended" }).click();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-scratch-title]")].some((e) => e.closest("[role=tabpanel]")));
    await p.waitForTimeout(1000); // let the draw-in animation finish

    // Different lengths, including a title long enough to wrap onto several lines.
    for (const t of ["Fix", "Return 404 instead of 500 for missing note ids", "Migrate the entire settings page, every nested form and all validation rules, to the new form library without breaking existing saved drafts or keyboard shortcuts"]) {
      await p.evaluate((t) => {
        const el = [...document.querySelectorAll("[data-scratch-title]")].find((e) => e.closest("[role=tabpanel]"));
        el.textContent = t;
      }, t);
      await p.waitForTimeout(100);
      const r = (await checkScratch(p, "len")).find((x) => x.text === t);
      expect(r && r.ok, `title of length ${t.length} not fully covered: ${JSON.stringify(r)}`);
      if (t.length > 100) {
        expect(r.lines >= 2, `long title should wrap at ${w.width}px (got ${r.lines} line)`);
        await shot(p, `scratch-multiline-${w.name}`);
      }
    }
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 1, `page overflows by ${overflow}px`);
    await ctx.close();
  });
}

await step("dashboard: NOT RECOMMENDED cards scratch the whole title; others are untouched", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await skipIntro(ctx);
  const p = await ctx.newPage();
  await p.goto(BASE + "/onboarding", { waitUntil: "networkidle" });
  for (const s of ["Python", "TypeScript", "Rust"]) await p.getByRole("group", { name: "Languages" }).getByRole("button", { name: s, exact: true }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Find my issues" }).click();
  await p.waitForURL("**/app/recommended", { timeout: 60_000 });
  await p.goto(BASE + "/app", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.querySelectorAll("[data-scratch-title]").length >= 2, null, { timeout: 40_000 });
  await p.waitForTimeout(1200);
  const res = await checkScratch(p, "dashboard");
  expect(res.length >= 2 && res.every((r) => r.ok), `dashboard scratch incomplete: ${JSON.stringify(res)}`);
  expect(res.some((r) => r.lines >= 2), "at 390px at least one struck title should wrap onto 2+ lines");
  const mismatch = await p.evaluate(() =>
    [...document.querySelectorAll("article")].filter((a) => {
      const blocked = /NOT RECOMMENDED/i.test(a.querySelector("h3")?.parentElement?.textContent ?? "");
      const struck = Boolean(a.querySelector("h3 [data-scratch-title]"));
      return blocked !== struck;
    }).length,
  );
  expect(mismatch === 0, `${mismatch} cards have a scratch that doesn't match their verdict`);
  const card = p.locator("article", { has: p.locator("[data-scratch-title]") }).first();
  await card.scrollIntoViewIfNeeded();
  await shot(p, "scratch-dashboard-mobile");
  await card.getByRole("link", { name: "View on GitHub" }).waitFor();
  await ctx.close();
});

/* ----------------------------- nav auth buttons ----------------------------- */

for (const w of WIDTHS) {
  await step(`nav: Log in and Create account aligned right and working (${w.name} ${w.width}px)`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    await skipIntro(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    const header = p.locator("header").first();
    const login = header.getByRole("link", { name: "Log in", exact: true });
    const create = header.getByRole("link", { name: "Create account", exact: true });
    await login.waitFor();
    await create.waitFor();
    const [h, l, c, logo] = await Promise.all([header.boundingBox(), login.boundingBox(), create.boundingBox(), header.getByRole("link", { name: "Contribly home" }).boundingBox()]);
    expect(l.x + l.width <= c.x + 0.5, "Log in should sit left of Create account");
    expect(Math.abs(l.y + l.height / 2 - (c.y + c.height / 2)) < 2, "buttons should be vertically aligned");
    const row = await p.evaluate(() => {
      const r = document.querySelector("header").getBoundingClientRect();
      const pr = parseFloat(getComputedStyle(document.querySelector("header")).paddingRight);
      return r.right - pr;
    });
    expect(Math.abs(c.x + c.width - row) < 1.5 && c.x + c.width <= w.width, `Create account should sit at the right edge of the nav (${c.x + c.width} vs ${row})`);
    expect(logo.x + logo.width < l.x, "logo and buttons must not overlap");
    expect(l.height >= 32 && c.height >= 32, "touch targets should be at least 32px tall");
    const bg = await create.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg === "rgb(255, 107, 53)", `Create account should be orange, got ${bg}`);
    const loginBg = await login.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(loginBg === "rgba(0, 0, 0, 0)", "Log in should stay subtle");
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow <= 1, `header overflows by ${overflow}px`);
    await p.screenshot({ path: path.join(SHOTS, `nav-${w.name}.png`), clip: { x: 0, y: 0, width: w.width, height: Math.min(140, h.height + 40) } });
    await login.click();
    await p.waitForURL("**/login");
    await p.getByRole("heading", { name: "Log in to Contribly" }).waitFor();
    await p.goBack({ waitUntil: "networkidle" });
    await header.getByRole("link", { name: "Create account", exact: true }).click();
    await p.waitForURL("**/signup");
    await p.getByRole("heading", { name: "Create your account" }).waitFor();
    await ctx.close();
  });
}

await browser.close();
const failed = results.filter((x) => x[0] === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
