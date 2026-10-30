-- Contribly: per-user saved issues and preferences.
-- Apply in the Supabase SQL editor or with `supabase db push`.
--
-- Security model
--   * Every row belongs to auth.uid(). user_id defaults to auth.uid() and the
--     app never sends it, so a client cannot claim another user's identity.
--   * Row Level Security is enabled on both tables. The anon role gets no
--     access at all; authenticated users only see and change their own rows.
--   * UPDATE is granted only on content columns, so ownership (user_id) and
--     identity columns can never be changed. A trigger enforces the same rule.
--   * No service-role key is needed by the app.

-- ---------------------------------------------------------------------------
-- saved_issues
-- ---------------------------------------------------------------------------
create table if not exists public.saved_issues (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  github_issue_id  bigint not null check (github_issue_id > 0),
  repo_owner       text not null check (char_length(repo_owner) between 1 and 100),
  repo_name        text not null check (char_length(repo_name) between 1 and 100),
  issue_number     integer not null check (issue_number > 0),
  title            text not null check (char_length(title) between 1 and 512),
  url              text not null check (char_length(url) <= 512 and url ~ '^https://github\.com/'),
  -- Snapshot of the issue as shown on the card (labels, excerpt, etc.).
  snapshot         jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 32768),
  -- Last verification evidence the user saw, with its checkedAt timestamp.
  verification     jsonb check (verification is null or (jsonb_typeof(verification) = 'object' and pg_column_size(verification) < 65536)),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint saved_issues_user_issue_unique unique (user_id, github_issue_id)
);

create index if not exists saved_issues_user_created_idx on public.saved_issues (user_id, created_at desc);

create or replace function public.saved_issues_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.github_issue_id is distinct from old.github_issue_id
       or new.created_at is distinct from old.created_at then
      raise exception 'saved_issues: identity columns are immutable' using errcode = '42501';
    end if;
  elsif tg_op = 'INSERT' then
    -- Cap per-user rows to keep abuse bounded. Runs as the caller, so RLS
    -- restricts the count to the caller's own rows.
    if (select count(*) from public.saved_issues s where s.user_id = new.user_id) >= 500 then
      raise exception 'saved_issues: limit of 500 saved issues reached' using errcode = '54000';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saved_issues_guard on public.saved_issues;
create trigger saved_issues_guard
  before insert or update on public.saved_issues
  for each row execute function public.saved_issues_guard();

alter table public.saved_issues enable row level security;

revoke all on table public.saved_issues from anon, authenticated;
grant select, insert, delete on table public.saved_issues to authenticated;
grant update (title, snapshot, verification) on table public.saved_issues to authenticated;

drop policy if exists "saved_issues: select own" on public.saved_issues;
create policy "saved_issues: select own" on public.saved_issues
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "saved_issues: insert own" on public.saved_issues;
create policy "saved_issues: insert own" on public.saved_issues
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "saved_issues: update own" on public.saved_issues;
create policy "saved_issues: update own" on public.saved_issues
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "saved_issues: delete own" on public.saved_issues;
create policy "saved_issues: delete own" on public.saved_issues
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- user_preferences (one row per user)
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  skills        jsonb not null default '[]'::jsonb
                check (jsonb_typeof(skills) = 'array' and jsonb_array_length(skills) <= 12 and pg_column_size(skills) < 8192),
  weekly_hours  text not null default '5-8' check (weekly_hours in ('2-4', '5-8', '9-15', '15+')),
  task_scope    text not null default 'any' check (task_scope in ('quick', 'few-hours', 'multi-day', 'any')),
  filters       jsonb not null default '{}'::jsonb
                check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) < 16384),
  auto_verify   boolean not null default true,
  updated_at    timestamptz not null default now()
);

create or replace function public.user_preferences_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_preferences: user_id is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_preferences_touch on public.user_preferences;
create trigger user_preferences_touch
  before insert or update on public.user_preferences
  for each row execute function public.user_preferences_touch();

alter table public.user_preferences enable row level security;

revoke all on table public.user_preferences from anon, authenticated;
grant select, insert, delete on table public.user_preferences to authenticated;
grant update (skills, weekly_hours, task_scope, filters, auto_verify) on table public.user_preferences to authenticated;

drop policy if exists "user_preferences: select own" on public.user_preferences;
create policy "user_preferences: select own" on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_preferences: insert own" on public.user_preferences;
create policy "user_preferences: insert own" on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_preferences: update own" on public.user_preferences;
create policy "user_preferences: update own" on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "user_preferences: delete own" on public.user_preferences;
create policy "user_preferences: delete own" on public.user_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);
