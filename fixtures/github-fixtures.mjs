// TEST FIXTURES ONLY. Fictional repositories under the "fixture-labs" owner, shaped
// like GitHub REST payloads. Used by unit tests and the local fixture server
// (scripts/fixture-server.mjs). Never served when the app talks to api.github.com.

export const FIXTURE_OWNER = "fixture-labs";
const API = "http://fixture.local";

export function buildFixtures(now = new Date()) {
  const t = now.getTime();
  const ago = (days, hours = 0) => new Date(t - days * 86_400_000 - hours * 3_600_000).toISOString();
  const user = (login, type = "User") => ({ login, type });
  const label = (name, color = "8b8b98") => ({ name, color });

  const repos = {
    quillstack: {
      meta: { archived: false, disabled: false, language: "Python", topics: ["fastapi", "sql", "notes"], stargazers_count: 1840, pushed_at: ago(1), default_branch: "main", html_url: `https://github.com/${FIXTURE_OWNER}/quillstack` },
      commits: Array.from({ length: 42 }, (_, i) => ({ commit: { committer: { date: ago(i * 2) }, author: { date: ago(i * 2) } } })),
      pulls: Array.from({ length: 20 }, (_, i) => ({ merged_at: i % 4 === 3 ? null : ago(i * 3 + 1) })),
      repoComments: [
        ...Array.from({ length: 14 }, (_, i) => ({ id: 9000 + i, user: user(i % 2 ? "mara-quill" : "devon-k"), author_association: i % 2 ? "OWNER" : "MEMBER", created_at: ago(i * 2), body: "Thanks, looks good.", html_url: "#" })),
        ...Array.from({ length: 20 }, (_, i) => ({ id: 9100 + i, user: user(`contrib-${i}`), author_association: "CONTRIBUTOR", created_at: ago(i * 3 + 1), body: "Question about setup.", html_url: "#" })),
      ],
      readme: "# Quillstack\n\nA FastAPI notes service backed by PostgreSQL.\n\n## Quickstart\n\nRun `make dev`.",
      contributing:
        "# Contributing\n\nWe love new contributors.\n\nPlease comment on the issue first and wait until a maintainer assigns it to you before opening a pull request.\n\nAll commits must include a Signed-off-by line (DCO).",
    },
    "orbit-ui": {
      meta: { archived: false, disabled: false, language: "TypeScript", topics: ["react", "components", "a11y"], stargazers_count: 5200, pushed_at: ago(0, 5), default_branch: "main", html_url: `https://github.com/${FIXTURE_OWNER}/orbit-ui` },
      commits: Array.from({ length: 100 }, (_, i) => ({ commit: { committer: { date: ago(i * 0.8) }, author: { date: ago(i * 0.8) } } })),
      commitsHasMore: true,
      pulls: Array.from({ length: 30 }, (_, i) => ({ merged_at: ago(i * 2) })),
      repoComments: Array.from({ length: 60 }, (_, i) => ({ id: 9200 + i, user: user(i % 3 === 0 ? "sena-orbit" : `dev-${i}`), author_association: i % 3 === 0 ? "COLLABORATOR" : "NONE", created_at: ago(i), body: "ok", html_url: "#" })),
      readme: "# Orbit UI\n\nAccessible React components.",
      contributing:
        "# Contributing to Orbit UI\n\nThanks for helping out.\n\nPull requests that are primarily AI-generated will not be accepted. Use of tools like Copilot for small completions is fine if you understand every line.\n\nWe require a signed CLA before merging.",
    },
    tidepool: {
      meta: { archived: false, disabled: false, language: "Go", topics: ["http", "proxy"], stargazers_count: 310, pushed_at: ago(210), default_branch: "main", html_url: `https://github.com/${FIXTURE_OWNER}/tidepool` },
      commits: [],
      latestCommit: [{ commit: { committer: { date: ago(212) }, author: { date: ago(212) } } }],
      pulls: [{ merged_at: ago(230) }, { merged_at: null }],
      repoComments: [
        { id: 9300, user: user("rook"), author_association: "OWNER", created_at: ago(190), body: "Will look.", html_url: "#" },
        { id: 9301, user: user("someone"), author_association: "NONE", created_at: ago(20), body: "Any update?", html_url: "#" },
        { id: 9302, user: user("another"), author_association: "NONE", created_at: ago(95), body: "+1", html_url: "#" },
      ],
      readme: "# tidepool\n\nTiny HTTP proxy.",
      contributing: null,
    },
    "relic-cli": {
      meta: { archived: true, disabled: false, language: "Rust", topics: ["cli"], stargazers_count: 95, pushed_at: ago(400), default_branch: "main", html_url: `https://github.com/${FIXTURE_OWNER}/relic-cli` },
      commits: [],
      latestCommit: [{ commit: { committer: { date: ago(401) }, author: { date: ago(401) } } }],
      pulls: [],
      repoComments: [],
      readme: "# relic-cli\n\nThis project is no longer maintained.",
      contributing: null,
    },
    datasmith: {
      meta: { archived: false, disabled: false, language: "Python", topics: ["pandas", "data-science", "plotting"], stargazers_count: 760, pushed_at: ago(6), default_branch: "main", html_url: `https://github.com/${FIXTURE_OWNER}/datasmith` },
      commitsFail: true, // commit history endpoint errors
      metaFail: true, // repository metadata errors, so the repository check fails (partial verification)
      pulls: Array.from({ length: 8 }, (_, i) => ({ merged_at: ago(i * 9 + 2) })),
      repoComments: Array.from({ length: 25 }, (_, i) => ({ id: 9400 + i, user: user(i % 4 === 0 ? "ines-data" : `u${i}`), author_association: i % 4 === 0 ? "MEMBER" : "NONE", created_at: ago(i * 3), body: "ok", html_url: "#" })),
      readme: "# datasmith\n\nHelpers for pandas and plotting.",
      contributing: "# Contributing\n\nOpen an issue to discuss bigger changes. Run the test suite before submitting.",
    },
  };

  const issue = (repo, number, o) => ({
    id: Number(`${Object.keys(repos).indexOf(repo) + 1}${String(number).padStart(4, "0")}`),
    number,
    title: o.title,
    html_url: `https://github.com/${FIXTURE_OWNER}/${repo}/issues/${number}`,
    repository_url: `${API}/repos/${FIXTURE_OWNER}/${repo}`,
    body: o.body,
    labels: o.labels,
    comments: (o.comments ?? []).length,
    created_at: o.created ?? ago(20),
    updated_at: o.updated ?? ago(1),
    user: user(o.author ?? "reporter"),
    author_association: "NONE",
    assignees: (o.assignees ?? []).map((a) => user(a)),
    state: o.state ?? "open",
    locked: false,
    _repo: repo,
    _comments: o.comments ?? [],
    _timeline: o.timeline ?? [],
  });

  const comment = (id, login, association, body, createdAt) => ({ id, user: user(login), author_association: association, body, created_at: createdAt, html_url: `https://github.com/${FIXTURE_OWNER}/x/issues/1#issuecomment-${id}` });
  const prRef = (repo, n, o) => ({
    event: "cross-referenced",
    created_at: o.created,
    source: {
      type: "issue",
      issue: {
        number: n,
        title: o.title,
        html_url: `https://github.com/${FIXTURE_OWNER}/${repo}/pull/${n}`,
        state: o.state,
        draft: Boolean(o.draft),
        created_at: o.created,
        updated_at: o.updated ?? o.created,
        user: user(o.author),
        body: o.body,
        repository: { full_name: `${FIXTURE_OWNER}/${repo}` },
        pull_request: { merged_at: o.merged ? o.updated ?? o.created : null, html_url: `https://github.com/${FIXTURE_OWNER}/${repo}/pull/${n}` },
      },
    },
  });

  const issues = [
    issue("quillstack", 101, {
      title: "Add pagination to the /notes list endpoint",
      body: "The `GET /notes` endpoint returns every row. Add `limit` and `offset` query params using FastAPI dependencies and update the SQL query.\n\n- [ ] add params\n- [ ] add tests",
      labels: [label("good first issue", "7057ff"), label("fastapi", "009688"), label("api")],
      comments: [comment(101001, "mara-quill", "OWNER", "Happy to review a PR for this. Tests live in `tests/api`.", ago(9))],
      updated: ago(2),
    }),
    issue("quillstack", 118, {
      title: "Sorting notes by created_at is slow without an index",
      body: "Postgres does a sequential scan on `notes.created_at`. We need a migration adding an index and a query plan check in CI.",
      labels: [label("help wanted", "008672"), label("database", "1d76db"), label("performance")],
      comments: [comment(118001, "aria-dev", "NONE", "Hi! I'd like to work on this issue, could you assign it to me?", ago(6))],
      updated: ago(6),
    }),
    issue("quillstack", 124, {
      title: "Fix typo in README quickstart",
      body: "`make dvelop` should be `make dev`.",
      labels: [label("good first issue", "7057ff"), label("documentation", "0075ca")],
      updated: ago(3),
    }),
    issue("quillstack", 130, {
      title: "Return 404 instead of 500 for missing note ids",
      body: "Fetching a deleted note raises an unhandled exception in the SQL layer.",
      labels: [label("good first issue", "7057ff"), label("bug", "d73a4a")],
      timeline: [prRef("quillstack", 131, { title: "Return 404 for missing notes", state: "closed", merged: true, author: "kiran-s", created: ago(4), updated: ago(1), body: "Fixes #130" })],
      updated: ago(1),
    }),
    issue("orbit-ui", 57, {
      title: "Dropdown loses focus when Escape is pressed",
      body: "Keyboard users lose their place after closing the dropdown. Focus should return to the trigger button.",
      labels: [label("good first issue", "7057ff"), label("a11y", "c5def5"), label("react")],
      comments: [
        comment(57001, "leo-builds", "NONE", "I'm working on a fix for this, should have a PR soon.", ago(3)),
        comment(57002, "sena-orbit", "COLLABORATOR", "@leo-builds sounds good, go ahead!", ago(3, -2)),
      ],
      updated: ago(3),
    }),
    issue("orbit-ui", 63, {
      title: "Add dark mode tokens to Tooltip",
      body: "Tooltip uses hardcoded colours. Move them to the design tokens file.",
      labels: [label("good first issue", "7057ff"), label("styling")],
      timeline: [prRef("orbit-ui", 64, { title: "feat(tooltip): use theme tokens", state: "open", author: "pia-codes", created: ago(2), body: "Closes #63\n\nMoves tooltip colours into tokens." })],
      updated: ago(2),
    }),
    issue("orbit-ui", 70, {
      title: "Support a controlled value in Combobox",
      body: "Allow `value` and `onValueChange` props so Combobox can be used with form libraries. Needs docs and tests in React Testing Library.",
      labels: [label("help wanted", "008672"), label("enhancement", "a2eeef"), label("react")],
      comments: [comment(70001, "sena-orbit", "COLLABORATOR", "Is anyone working on this? Would welcome a PR.", ago(12))],
      updated: ago(5),
    }),
    issue("tidepool", 12, {
      title: "Graceful shutdown drops in-flight requests",
      body: "On SIGTERM the server closes listeners immediately. Use `http.Server.Shutdown` with a context timeout.",
      labels: [label("help wanted", "008672"), label("bug", "d73a4a")],
      updated: ago(20),
    }),
    issue("relic-cli", 9, {
      title: "Panic on empty config file",
      body: "Running with an empty `relic.toml` panics instead of using defaults.",
      labels: [label("good first issue", "7057ff")],
      updated: ago(40),
    }),
    issue("datasmith", 33, {
      title: "plot_series ignores the figsize argument",
      body: "Passing `figsize=(10, 4)` to `plot_series` has no effect on the matplotlib figure.",
      labels: [label("good first issue", "7057ff"), label("plotting")],
      updated: ago(4),
    }),
    issue("quillstack", 140, {
      title: "Add a CSV export option for notes",
      body: "A `GET /notes/export.csv` route that streams notes as CSV using the existing SQL query.",
      labels: [label("good first issue", "7057ff"), label("enhancement", "a2eeef")],
      comments: [
        comment(140001, "old-claimer", "NONE", "Can I work on this?", ago(130)),
        comment(140002, "mara-quill", "OWNER", "Sure, go ahead @old-claimer", ago(129)),
      ],
      updated: ago(7),
    }),
  ];

  return { repos, issues, now };
}

/** GraphQL shape for the PR query, derived from the same REST timeline fixtures. */
export function graphqlForIssue(issue) {
  const prs = issue._timeline
    .filter((e) => e.event === "cross-referenced" && e.source?.issue?.pull_request)
    .map((e) => {
      const s = e.source.issue;
      const merged = Boolean(s.pull_request.merged_at);
      const node = {
        number: s.number,
        title: s.title,
        url: s.html_url,
        state: merged ? "MERGED" : s.state === "open" ? "OPEN" : "CLOSED",
        merged,
        isDraft: Boolean(s.draft),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        author: { login: s.user.login },
        repository: { nameWithOwner: s.repository.full_name },
      };
      const closes = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#\d+/i.test(s.body ?? "");
      return { node, closes };
    });
  return {
    repository: {
      issue: {
        closedByPullRequestsReferences: { totalCount: prs.filter((p) => p.closes).length, nodes: prs.filter((p) => p.closes).map((p) => p.node) },
        timelineItems: {
          totalCount: prs.length,
          nodes: prs.map((p) => ({ __typename: "CrossReferencedEvent", willCloseTarget: p.closes, source: { __typename: "PullRequest", ...p.node } })),
        },
      },
    },
  };
}
