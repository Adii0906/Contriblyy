#!/usr/bin/env node
// TEST ONLY. Starts a throwaway local PostgreSQL cluster, loads the Supabase
// auth stub and applies the real migrations from supabase/migrations.
// Used by the RLS tests and by `npm run dev:test:auth`.
//
// Requires PostgreSQL server binaries (initdb, pg_ctl, postgres). Set PG_BIN to
// their directory if they are not on PATH. When run as root, the server runs as
// the `postgres` OS user (PostgreSQL refuses to run as root).
//
// CLI: node scripts/test-db.mjs [port]   (default 54329; Ctrl+C stops and deletes it)

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function findPgBin() {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  try {
    candidates.push(execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim());
  } catch {
    /* not on PATH */
  }
  for (const base of ["/usr/lib/postgresql", "/usr/local/opt", "/opt/homebrew/opt"]) {
    try {
      for (const v of fs.readdirSync(base).sort().reverse()) candidates.push(path.join(base, v, "bin"));
    } catch {
      /* missing */
    }
  }
  candidates.push("/usr/bin", "/usr/local/bin");
  return candidates.find((d) => fs.existsSync(path.join(d, "initdb")) && fs.existsSync(path.join(d, "pg_ctl"))) ?? null;
}

const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

function run(bin, args, opts = {}) {
  const cmd = isRoot ? "runuser" : bin;
  const full = isRoot ? ["-u", "postgres", "--", bin, ...args] : args;
  const r = spawnSync(cmd, full, { encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${path.basename(bin)} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

/** Start a fresh cluster and return { url, stop }. */
export async function startTestDb({ port = 54329 } = {}) {
  const bin = findPgBin();
  if (!bin) throw new Error("PostgreSQL server binaries not found. Install PostgreSQL or set PG_BIN.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `contribly-pg-${port}-`));
  if (isRoot) execFileSync("chown", ["-R", "postgres:postgres", dir]);
  const data = path.join(dir, "data");
  run(path.join(bin, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
  run(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(dir, "log.txt"), "-o", `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, "-w", "start"]);

  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(fs.readFileSync(path.join(ROOT, "supabase/tests/auth-stub.sql"), "utf8"));
    const migDir = path.join(ROOT, "supabase/migrations");
    for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
      await client.query(fs.readFileSync(path.join(migDir, f), "utf8"));
    }
  } finally {
    await client.end();
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      run(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
    } catch {
      /* already down */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { url, stop };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.argv[2] ?? 54329);
  const db = await startTestDb({ port });
  console.log(`[test-db] TEST DATABASE ready at ${db.url}`);
  const bye = () => {
    db.stop();
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  setInterval(() => {}, 1 << 30);
}
