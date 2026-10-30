#!/usr/bin/env node
// LOCAL TEST-ONLY GitHub API stand-in. Serves fictional "fixture-labs" data shaped like
// GitHub REST/GraphQL responses so the full UI flow can be exercised without network
// access. The app only talks to this server when CONTRIBLY_TEST_MODE=1 and
// GITHUB_API_URL points here; the UI then shows a persistent test-mode banner.
//
// Scenario keywords (type them in the dashboard search box):
//   ratelimit       -> every search returns a 403 rate-limit response
//   servererror     -> every search returns 500
//   partialsearch   -> searches with language:Python fail, others succeed
//   nothingmatches  -> searches succeed with zero results
//
// Usage: node scripts/fixture-server.mjs [port]   (default 4010)

import http from "node:http";
import { buildFixtures, graphqlForIssue, FIXTURE_OWNER } from "../fixtures/github-fixtures.mjs";

const port = Number(process.argv[2] ?? process.env.FIXTURE_PORT ?? 4010);
const latency = Number(process.env.FIXTURE_LATENCY ?? 450);
const fx = buildFixtures(new Date());
let searchRemaining = 30;
let rateLimitedUntil = 0; // simulated search rate-limit window (15s, short for testing)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.round(latency * (0.4 + Math.random()));

function send(res, status, body, extra = {}) {
  const resource = extra.resource ?? "core";
  delete extra.resource;
  res.writeHead(status, {
    "Content-Type": "application/json",
    "x-ratelimit-limit": resource === "search" ? "30" : "5000",
    "x-ratelimit-remaining": String(resource === "search" ? (Date.now() < rateLimitedUntil ? 0 : searchRemaining) : 4900),
    "x-ratelimit-reset": String(Math.floor((resource === "search" && Date.now() < rateLimitedUntil ? rateLimitedUntil : Date.now() + 600_000) / 1000)),
    "x-ratelimit-resource": resource,
    "x-contribly-fixture": "1",
    ...extra,
  });
  res.end(JSON.stringify(body));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const strip = ({ _repo, _comments, _timeline, ...rest }) => rest;

function searchIssues(q) {
  const lower = q.toLowerCase();
  const lang = q.match(/language:"?([^"\s]+)"?/)?.[1];
  const termMatch = q.replace(/-?\w+:(?:"[^"]*"(?:,"[^"]*")*|\S+)/g, " ").match(/"[^"]+"|[\w+#.]+/g) ?? [];
  const terms = termMatch.map((t) => t.replace(/"/g, "").toLowerCase());
  return fx.issues.filter((i) => {
    const repo = fx.repos[i._repo];
    if (lang && repo.meta.language.toLowerCase() !== lang.toLowerCase()) return false;
    const hay = `${i.title} ${i.body} ${i.labels.map((l) => l.name).join(" ")} ${repo.meta.topics.join(" ")}`.toLowerCase();
    if (lower.includes("no:assignee") && i.assignees.length) return false;
    return terms.every((t) => hay.includes(t) || (t === "machine learning" && hay.includes("model")));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;
  await sleep(jitter());

  if (path === "/rate_limit") {
    const r = (limit, remaining) => ({ limit, remaining, used: limit - remaining, reset: Math.floor(Date.now() / 1000) + 600 });
    return send(res, 200, { resources: { core: r(5000, 4900), search: r(30, Date.now() < rateLimitedUntil ? 0 : searchRemaining), graphql: r(5000, 4990) } });
  }

  if (path === "/graphql" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { variables } = JSON.parse(raw || "{}");
    const issue = fx.issues.find((i) => i._repo === variables?.name && i.number === variables?.number);
    if (!issue) return send(res, 200, { data: { repository: null } }, { resource: "graphql" });
    return send(res, 200, { data: graphqlForIssue(issue) }, { resource: "graphql" });
  }

  if (path === "/search/issues") {
    const q = url.searchParams.get("q") ?? "";
    const page = Number(url.searchParams.get("page") ?? 1);
    if (/ratelimit/i.test(q)) {
      rateLimitedUntil = Date.now() + 15_000;
      return send(res, 403, { message: "API rate limit exceeded (fixture)" }, { resource: "search" });
    }
    searchRemaining = Math.max(1, searchRemaining - 1);
    if (/servererror/i.test(q)) return send(res, 500, { message: "Server error (fixture)" }, { resource: "search" });
    if (/partialsearch/i.test(q) && /language:"?Python/i.test(q)) return send(res, 500, { message: "Server error (fixture)" }, { resource: "search" });
    if (/nothingmatches/i.test(q)) return send(res, 200, { total_count: 0, incomplete_results: false, items: [] }, { resource: "search" });
    const clean = q.replace(/\b(partialsearch)\b/gi, "");
    const items = page === 1 ? searchIssues(clean).map(strip) : [];
    return send(res, 200, { total_count: items.length, incomplete_results: false, items }, { resource: "search" });
  }

  const m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!m || m[1] !== FIXTURE_OWNER) return send(res, 404, { message: "Not Found" });
  const repoName = m[2];
  const rest = m[3] ?? "";
  const repo = fx.repos[repoName];
  if (!repo) return send(res, 404, { message: "Not Found" });

  if (rest === "") return repo.metaFail ? send(res, 502, { message: "Bad gateway (fixture)" }) : send(res, 200, repo.meta);

  const issueM = rest.match(/^\/issues\/(\d+)(\/comments|\/timeline)?$/);
  if (issueM) {
    const issue = fx.issues.find((i) => i._repo === repoName && i.number === Number(issueM[1]));
    if (!issue) return send(res, 404, { message: "Not Found" });
    if (issueM[2] === "/comments") return send(res, 200, issue._comments);
    if (issueM[2] === "/timeline") return send(res, 200, issue._timeline);
    return send(res, 200, strip(issue));
  }

  if (rest === "/issues/comments") return send(res, 200, repo.repoComments);
  if (rest === "/commits") {
    if (repo.commitsFail) return send(res, 502, { message: "Bad gateway (fixture)" });
    if (url.searchParams.get("since")) {
      const link = repo.commitsHasMore ? { Link: `<http://localhost:${port}${path}?page=2>; rel="next", <http://localhost:${port}${path}?page=3>; rel="last"` } : {};
      return send(res, 200, repo.commits, link);
    }
    return send(res, 200, repo.latestCommit ?? repo.commits.slice(0, 1));
  }
  if (rest === "/pulls") return send(res, 200, repo.pulls);
  if (rest === "/readme") {
    return send(res, 200, { name: "README.md", path: "README.md", html_url: `${repo.meta.html_url}/blob/main/README.md`, encoding: "base64", content: Buffer.from(repo.readme).toString("base64") });
  }
  if (rest === "/community/profile") {
    const files = repo.contributing ? { contributing: { url: `http://localhost:${port}/repos/${FIXTURE_OWNER}/${repoName}/contents/CONTRIBUTING.md`, html_url: `${repo.meta.html_url}/blob/main/CONTRIBUTING.md` } } : { contributing: null };
    return send(res, 200, { health_percentage: 70, files });
  }
  const contentM = rest.match(/^\/contents\/(.+)$/);
  if (contentM) {
    if (contentM[1] === "CONTRIBUTING.md" && repo.contributing) {
      return send(res, 200, { name: "CONTRIBUTING.md", path: "CONTRIBUTING.md", html_url: `${repo.meta.html_url}/blob/main/CONTRIBUTING.md`, encoding: "base64", content: Buffer.from(repo.contributing).toString("base64") });
    }
    return send(res, 404, { message: "Not Found" });
  }
  return send(res, 404, { message: "Not Found" });
});

server.listen(port, () => {
  console.log(`[fixture-server] TEST FIXTURES ONLY on http://localhost:${port} (latency ~${latency}ms)`);
});
