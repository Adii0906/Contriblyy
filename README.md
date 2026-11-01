# Contribly

**GitHub says it's open. We check if it's worth your time.**

Contribly finds open-source issues that match your skills, proficiency and weekly time, then checks the public evidence GitHub does not surface at a glance: comment claims, linked pull requests, repository and maintainer activity, and contribution policies. Each issue gets an evidence-based verdict (Promising, Needs review, Not recommended) with every warning linked to its source. Accounts (Supabase) keep saved issues and preferences on every device.

---

## Quick start

Requirements: Node.js 20.9+ (22 LTS recommended), npm.

```bash
npm install
cp .env.example .env.local      # fill in GITHUB_TOKEN, and the Supabase values for accounts
npm run dev                     # http://localhost:3000
```

Without the Supabase variables the app still runs: search, verification and matching work, and saving explains that accounts aren't configured.

### Environment variables

All are server-only (no `NEXT_PUBLIC_` prefix), so none reach the browser bundle.

| Variable | Required | Where to find it |
| --- | --- | --- |
| `GITHUB_TOKEN` | Strongly recommended | GitHub, Settings, Developer settings, Fine-grained tokens. Repository access **Public repositories (read-only)**, no other permissions. |
| `SUPABASE_URL` | For accounts | Supabase dashboard, Project Settings, Data API: Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | For accounts | Project Settings, API Keys: publishable key (`sb_publishable_…`). Older projects can use the legacy `anon` key (also accepted as `SUPABASE_ANON_KEY`). |
| `SITE_URL` | For accounts in production | Your public origin, e.g. `https://contribly.example`. Used in email links. Locally `http://localhost:3000`. |

**Never** add the Supabase service-role or secret key. Contribly doesn't use it: every database call runs as the signed-in user and is limited by Row Level Security.

## Accounts: Supabase setup

1. **Create a project** at supabase.com, then copy the Project URL and the publishable key into `.env.local`.
2. **Apply the migrations.** Pick one:
   - SQL editor: run `supabase/migrations/20261025000000_saved_issues_and_preferences.sql`, then `supabase/migrations/20261101000000_community_reviews.sql`.
   - CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Confirm RLS is on.** In Table Editor, `saved_issues`, `user_preferences`, `community_reviews`, `community_review_reports`, and `community_review_rate_limits` should all show *RLS enabled*. Community reviews are publicly readable through restricted views; writes and reports are limited to authenticated owners, and reporter and rate-limit records are private.
4. **Authentication, Sign In / Providers, Email:**
   - Keep Email enabled with **Confirm email** on.
   - Set the minimum password length to at least 8.
   - On paid plans, enable leaked-password protection.
5. **Authentication, URL Configuration:**
   - **Site URL:** `https://your-domain.example`
   - **Redirect URLs**, add each of these:
     - `http://localhost:3000/auth/confirm**`
     - `https://your-domain.example/auth/confirm**`
     - For Vercel previews: `https://*-<your-team>.vercel.app/auth/confirm**`
6. **Authentication, Email Templates** (recommended; makes links work on any device):
   - **Confirm signup:** set the link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app`
   - **Reset password:** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   - If you keep Supabase's default templates, links still work through the PKCE `code` flow, but only when opened in the same browser that started sign-up or reset.
7. **Email delivery for production.** Supabase's built-in mailer is heavily rate limited and meant for testing. Before launch:
   - Configure custom SMTP (Authentication, SMTP Settings) with a provider such as Resend, Postmark or Amazon SES.
   - Use a sending domain with SPF and DKIM.
   - Review Authentication, Rate Limits.

### How auth works in the app

- `@supabase/ssr` with the Next 16 `src/proxy.ts` (the renamed middleware) refreshes sessions on navigation and on account API calls.
- Session cookies are **httpOnly**, SameSite=Lax, and Secure in production. Every Supabase call happens in route handlers, so the browser never holds an access or refresh token.
- Route handlers:
  - `/api/auth/{signup,login,logout,forgot,reset,resend,session}`
  - `/auth/confirm`, which handles `token_hash` and PKCE `code` links and redirects only to same-origin paths
  - `/api/saved` (GET, POST, DELETE), `/api/saved/import`, `/api/preferences` (GET, PUT), `/api/reviews` (GET, POST, PATCH, DELETE), `/api/reviews/report` (POST)
- Identity comes from `supabase.auth.getClaims()` on the server. The app never accepts a user ID from the client, and the database fills `user_id` from `auth.uid()`.
- State-changing routes check Origin and Fetch-Metadata, validate bodies with Zod and cap their size, and apply per-IP rate limits:
  - login: 20/min per IP, plus 6/min per email
  - signup: 5/min
  - reset email: 4/min
  - verification resend: 3/min
  - saves: 60/min
- Community reviews also enforce per-user limits in the database, a unique review per account, strict rating/text constraints, and identity fields derived from the caller's Supabase Auth account. A report is private and can be filed once per review by each authenticated account.
- Supabase applies its own limits on top.
- Logs record event names and Supabase error codes only. They never include emails, passwords, tokens or cookies.
- Saving while signed out opens a log-in or sign-up prompt. The chosen issue is kept in `sessionStorage` (this tab only, one hour) and offered after sign-in with "Save this issue?". It's an intent, not stored data.
- Saved issues and preferences come from the server. `localStorage` only caches the guest profile, search history, and issues saved by the earlier guest-only version. Those can be imported into an account once, from the Saved page.

## Vercel deployment

1. Import the repository; framework preset Next.js.
2. **Environment Variables**:

   | Variable | Production | Preview |
   | --- | --- | --- |
   | `GITHUB_TOKEN` | ✓ | ✓ |
   | `SUPABASE_URL` | ✓ | ✓ (same project, or a separate staging project) |
   | `SUPABASE_PUBLISHABLE_KEY` | ✓ | ✓ |
   | `SITE_URL` | `https://your-domain.example` | leave unset: previews use `VERCEL_BRANCH_URL` |

   Keep "Automatically expose System Environment Variables" on. Do not set `CONTRIBLY_TEST_MODE` or `GITHUB_API_URL`.
3. Add your production domain in Vercel. Then make Supabase's Site URL and Redirect URLs match it exactly (step 5 above).
4. Deploy, then run through the checklist below on the live domain.

### Before going live: checklist
- [ ] Migration applied; both tables show RLS enabled with four policies each
- [ ] Custom SMTP configured, and a real sign-up email arrives with a working link
- [ ] Site URL and Redirect URLs match the production domain
- [ ] Sign up, verify, log in, save, refresh, log out, log back in on another device
- [ ] Password reset email works and the old password stops working
- [ ] Second account cannot see the first account's saved issues

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Live mode against api.github.com and your Supabase project |
| `npm run dev:test` | Test mode: GitHub fixture server and app (no accounts) |
| `npm run dev:test:auth` | Test mode with accounts: also starts a throwaway PostgreSQL with the real migration and RLS, plus a test-only Supabase stand-in |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit, integration and RLS tests (Vitest) |
| `npm run check` | typecheck, lint and tests |
| `npm run e2e` | All three browser suites (needs `npm run dev:test:auth` running) |

## Testing

- **`npm test`** runs the Vitest suite:
  - Verification, matching, discovery and integration tests against the fixture GitHub server.
  - Auth unit tests: open-redirect protection, link sanitising, input validation, password guidance, error mapping that never leaks internals, and saved-issue and preference payloads.
  - **RLS tests on a real PostgreSQL 16 server**, using the real migrations (`tests/rls.test.ts`, `tests/community-reviews-rls.test.ts`). They cover:
    - own-row access
    - cross-user read, update and delete attempts
    - inserting rows owned by someone else
    - changing ownership or identity columns
    - anonymous access
    - duplicate saves
    - check constraints
    - cascade on user deletion
  - Community-review request validation and RLS/ownership checks (`tests/reviews.test.ts`, `tests/community-reviews-rls.test.ts`).
  - The RLS suite needs PostgreSQL server binaries (`initdb`, `pg_ctl`); set `PG_BIN` if they're not on PATH. It skips with a notice when they're missing.
- **`tests/e2e/landing.mjs`**: the first-visit intro (typing order, length, Skip intro button, Escape, reduced motion, no replay on return), the full-title scratch on NOT RECOMMENDED issues at 1440, 768, 390 and 320px including short and multiline titles, and the Log in and Create account buttons at the same widths.
- **`tests/e2e/journey.mjs`**: the product journey covering search, verification, filters, error and empty states, mobile and reduced motion.
- **`tests/e2e/auth-journey.mjs`**: the account journey, run against `dev:test:auth`. It covers:
  - Signed-out save, then the prompt, then sign-up with validation.
  - Verification required before login, then the email link, then the pending save is offered and saved.
  - Account menu, preferences upload, refresh persistence, save and unsave.
  - Logout returning 401 afterwards, wrong password, login again, and open redirect refused.
  - A second device seeing the same saves.
  - A second user blocked from Alice's rows, including direct REST calls that bypass the app.
  - Unauthenticated API rejected, expired session prompting a fresh login, password reset with the old password rejected, single-use reset links, and the mobile account menu.

What the auth tests do **not** prove: they run against `scripts/supabase-standin.mjs`, a test-only stand-in for Supabase Auth and PostgREST. Database access through the stand-in is enforced by the real migration and RLS on real PostgreSQL. Supabase's hosted Auth service, its email delivery and its own validation rules were not available in the development environment, so they still need the production checklist above.

## Landing intro

First-time visitors see a short full-screen typing intro (about 5 seconds) before the landing page. An inline script decides before first paint whether it plays, so returning visitors never see a flash. It plays once per browser (`localStorage` key `contribly:intro-seen`), never plays with `prefers-reduced-motion`, and can be skipped with the Skip intro button or Escape. Add `?intro=1` to the URL to replay it.

## Architecture

```
src/
  proxy.ts                     Session refresh (Next 16 proxy, formerly middleware)
  app/
    page.tsx                   Landing
    onboarding/                4-step onboarding
    app/                       Dashboard: Discover, Recommended, Saved, History, Skills, Settings
    login/ signup/ forgot-password/ reset-password/ auth/error/   Auth pages
    auth/confirm/route.ts      Email link handler (token_hash and PKCE code)
    api/auth/*                 signup, login, logout, forgot, reset, resend, session
    api/saved/ api/preferences/   Per-user data, RLS-enforced
    api/discover, api/verify, api/status   GitHub search and verification
  lib/
    supabase/                  config + per-request server client (httpOnly cookies)
    auth/                      safe redirects, validation, error mapping, session helpers
    saved/ preferences.ts      Payload schemas and row mapping (pure)
    github/ discovery/ verify/ match/   Search, verification engine, scoring
    client/                    store, account actions, verification queue
  components/                  issue card, evidence panel, auth UI, dialogs, landing
supabase/
  migrations/                  Schema, constraints, triggers, grants, RLS policies
  tests/auth-stub.sql          TEST ONLY: minimal auth schema for plain PostgreSQL
scripts/                       fixture server, test DB, Supabase stand-in, dev:test launcher
tests/                         vitest suites + e2e browser journeys
```

### Data model

`saved_issues`:

| Column | Notes |
| --- | --- |
| `user_id` | Defaults to `auth.uid()`; foreign key to `auth.users`, cascades on delete |
| `github_issue_id`, `repo_owner`, `repo_name`, `issue_number`, `title`, `url` | GitHub URLs only |
| `snapshot` | JSONB, < 32 KB |
| `verification` | JSONB evidence, < 64 KB |
| `created_at`, `updated_at` | |

- Unique on `(user_id, github_issue_id)`.
- Capped at 500 rows per user by a trigger.
- The trigger also blocks changes to identity columns.

`user_preferences` holds one row per user: `skills`, `weekly_hours`, `task_scope`, `filters` (current and saved filter sets) and `auto_verify`. Accounts store an email, an optional display name, skills and saved issues; nothing else.

### Verification engine

| Check | Source | Notes |
| --- | --- | --- |
| Assignment | issue endpoint | Live state, assignees, locked; 404 is shown as "Issue unavailable" |
| Comment claims | issue comments (first and last page) | Active work vs requests, releases, maintainer acknowledgement, age-aware |
| Pull requests | GraphQL closing references + timeline, REST timeline fallback | Linked vs loosely mentioned, partial scans flagged |
| Repository | metadata, 90-day commits, recent merges | Archived, limited and active; quiet is never called dead |
| Maintainers | latest 100 repo comments | Owners, members and collaborators only; never promises a reply |
| Policy | README, CONTRIBUTING, AI_POLICY | AI restrictions quoted with links; "No explicit restriction detected" otherwise |

### Caching and limits

- In-process TTL caches with in-flight dedupe:

  | Cached item | TTL |
  | --- | --- |
  | Searches | 10 min |
  | Verifications | 15 min |
  | Repository activity | 60 min |
  | Policy docs | 6 h |

- GitHub rate-limit headers are tracked per resource.
- Per-IP token buckets cover search, verification and auth endpoints.
- Caches and buckets are per instance. On Vercel they reset on cold starts; back `lib/server/cache.ts` and `lib/server/rate-limit.ts` with Redis (for example Upstash) for sustained traffic.

## Test mode and fixtures

`CONTRIBLY_TEST_MODE=1` with `GITHUB_API_URL` points GitHub calls at the local fixture server. The fixture repositories are fictional and live under `fixture-labs`. Test mode shows a permanent banner; `GITHUB_API_URL` is ignored without the flag. Type `ratelimit`, `servererror`, `partialsearch` or `nothingmatches` in Discover to trigger those states.

The Supabase stand-in (`scripts/supabase-standin.mjs`) is only started by `dev:test:auth`. It signs test JWTs with a fixed secret and keeps emails in an in-memory outbox. It is not a security boundary and must never be deployed.

## Known limitations

- **Not deployed or verified on real Supabase or Vercel.** Accounts were tested against real PostgreSQL with the real RLS migration, through a Supabase stand-in. Email delivery, Supabase's password rules and the hosted Auth service still need checking with your project (see the checklist).
- **Live GitHub search was not exercised during development.** The environment only allowed repository-scoped GitHub endpoints. The flow was verified against the fixture server.
- In-memory rate limits are per serverless instance, so they're best-effort. Supabase Auth's own limits are the hard backstop for auth endpoints.
- Search history stays in the browser and is not synced to accounts.
- Claim detection is pattern based and English only.
- Very long comment threads are scanned in part (first and last 100 comments); the panel says so.
- Scope is inferred from labels and issue structure and is often honestly "unclear".
