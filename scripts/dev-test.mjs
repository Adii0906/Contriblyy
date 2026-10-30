#!/usr/bin/env node
// Starts the app in TEST MODE: local GitHub fixture server + Next.js dev server.
// With --auth it also starts a throwaway PostgreSQL (real migrations + RLS) and
// the test-only Supabase stand-in, so accounts and saved issues work offline.
// The UI shows a permanent "Test mode" banner. Never use this for real data.
import { spawn } from "node:child_process";
import { startTestDb } from "./test-db.mjs";

const withAuth = process.argv.includes("--auth");
// --prod serves an existing `next build` with `next start` instead of the dev server.
const prod = process.argv.includes("--prod");
const FIXTURE_PORT = process.env.FIXTURE_PORT ?? "4010";
const APP_PORT = process.env.PORT ?? "3000";
const STANDIN_PORT = process.env.STANDIN_PORT ?? "54321";
const DB_PORT = Number(process.env.TEST_DB_PORT ?? 54329);

const children = [];
let db = null;
const shutdown = (code = 0) => {
  children.forEach((c) => c.kill());
  db?.stop();
  process.exit(code);
};
const run = (cmd, args, env = {}) => {
  const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  children.push(p);
  p.on("exit", (code) => shutdown(code ?? 0));
  return p;
};

const appEnv = {
  CONTRIBLY_TEST_MODE: "1",
  GITHUB_API_URL: `http://localhost:${FIXTURE_PORT}`,
  // Placeholder so the GraphQL code path runs against the fixture server too.
  GITHUB_TOKEN: "fixture-token-not-real",
};

if (withAuth) {
  db = await startTestDb({ port: DB_PORT });
  console.log(`[dev-test] test database ready (${db.url})`);
  run(process.execPath, ["scripts/supabase-standin.mjs", "--db", db.url, "--port", STANDIN_PORT]);
  Object.assign(appEnv, {
    SUPABASE_URL: `http://localhost:${STANDIN_PORT}`,
    SUPABASE_PUBLISHABLE_KEY: "standin-publishable-key",
    SITE_URL: `http://localhost:${APP_PORT}`,
  });
}

run(process.execPath, ["scripts/fixture-server.mjs", FIXTURE_PORT]);
run("npx", ["next", prod ? "start" : "dev", "-p", APP_PORT], appEnv);

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => shutdown(0));
