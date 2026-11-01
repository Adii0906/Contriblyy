-- Public community reviews, with account identity derived from Supabase Auth.

create table if not exists public.community_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  review_text     text not null check (char_length(review_text) between 20 and 500),
  display_name    text not null default 'Contribly member' check (char_length(display_name) between 1 and 80),
  github_username text check (github_username is null or github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  avatar_url      text check (avatar_url is null or avatar_url ~ '^https://avatars\.githubusercontent\.com/'),
  is_published    boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint community_reviews_one_per_user unique (user_id)
);

create index if not exists community_reviews_p                                              
  on public.community_reviews (created_at desc)
  where is_published;


create table if not exists public.community_review_reports (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.community_reviews (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint community_review_reports_one_per_user unique (review_id, reporter_id)
);

-- Private persistent buckets provide a database-level backstop in multi-instance deployments.
create table if not exists public.community_review_rate_limits (
  user_id          uuid not null references auth.users (id) on delete cascade,
  action           text not null check (action in ('write', 'report')),
  window_started_at timestamptz not null,
  attempts         integer not null check (attempts > 0),
  primary key (user_id, action)
);

revoke all on public.community_review_rate_limits from public, anon, authenticated;
alter table public.community_review_rate_limits enable row level security;

create or replace function public.community_review_consume_rate_limit(p_user_id uuid, p_action text, p_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_now timestamptz := clock_timestamp();
begin
  insert into public.community_review_rate_limits (user_id, action, window_started_at, attempts)
  values (p_user_id, p_action, v_now, 1)
  on conflict (user_id, action) do update
    set window_started_at = case
          when public.community_review_rate_limits.window_started_at <= v_now - interval '1 minute' then v_now
          else public.community_review_rate_limits.window_started_at
        end,
        attempts = case
          when public.community_review_rate_limits.window_started_at <= v_now - interval '1 minute' then 1
          else public.community_review_rate_limits.attempts + 1
        end
  returning attempts into v_attempts;

  if v_attempts > p_limit then
    raise exception 'community review rate limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.community_review_consume_rate_limit(uuid, text, integer) from public, anon, authenticated;

create or replace function public.community_reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_metadata jsonb;
  v_github jsonb;
  v_name text;
  v_username text;
  v_avatar text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is distinct from v_user_id then
      raise exception 'review ownership mismatch' using errcode = '42501';
    end if;
    perform public.community_review_consume_rate_limit(v_user_id, 'write', 6);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.user_id is distinct from v_user_id
       or new.user_id is distinct from old.user_id
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.is_published is distinct from old.is_published then
      raise exception 'review identity columns are immutable' using errcode = '42501';
    end if;
    perform public.community_review_consume_rate_limit(v_user_id, 'write', 6);
  else
    new.user_id := v_user_id;
    new.created_at := clock_timestamp();
    perform public.community_review_consume_rate_limit(v_user_id, 'write', 6);
  end if;

  select u.raw_user_meta_data into v_metadata
  from auth.users u
  where u.id = v_user_id;

  select i.identity_data into v_github
  from auth.identities i
  where i.user_id = v_user_id and i.provider = 'github'
  order by i.created_at desc
  limit 1;

  v_username := coalesce(v_github ->> 'user_name', v_github ->> 'preferred_username');
  if v_username !~ '^[A-Za-z0-9-]{1,39}$' then
    v_username := null;
  end if;
  v_name := coalesce(
    nullif(btrim(v_github ->> 'name'), ''),
    nullif(btrim(v_metadata ->> 'full_name'), ''),
    nullif(btrim(v_metadata ->> 'name'), ''),
    v_username,
    'Contribly member'
  );
  v_name := left(regexp_replace(v_name, '[[:cntrl:]<>]', '', 'g'), 80);
  if v_name = '' then
    v_name := 'Contribly member';
  end if;

  v_avatar := v_github ->> 'avatar_url';
  if v_avatar !~ '^https://avatars\.githubusercontent\.com/' then
    v_avatar := null;
  end if;

  new.display_name := v_name;
  new.github_username := v_username;
  new.avatar_url := v_avatar;
  if tg_op = 'UPDATE' then
    new.updated_at := clock_timestamp();
  else
    new.updated_at := new.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists community_reviews_guard on public.community_reviews;
create trigger community_reviews_guard
  before insert or update or delete on public.community_reviews
  for each row execute function public.community_reviews_guard();

create or replace function public.community_review_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select r.user_id into v_owner from public.community_reviews r where r.id = new.review_id;
  if v_owner is null or v_owner = v_user_id then
    raise exception 'review cannot be reported' using errcode = '42501';
  end if;
  new.reporter_id := v_user_id;
  perform public.community_review_consume_rate_limit(v_user_id, 'report', 3);
  return new;
end;
$$;

drop trigger if exists community_review_reports_guard on public.community_review_reports;
create trigger community_review_reports_guard
  before insert on public.community_review_reports
  for each row execute function public.community_review_reports_guard();

alter table public.community_reviews enable row level security;
alter table public.community_review_reports enable row level security;

revoke all on public.community_reviews from public, anon, authenticated;
grant select (id, rating, review_text, display_name, github_username, avatar_url, created_at, updated_at)
  on public.community_reviews to authenticated;
grant insert (rating, review_text) on public.community_reviews to authenticated;
grant update (rating, review_text) on public.community_reviews to authenticated;
grant delete on public.community_reviews to authenticated;

drop policy if exists "community reviews are public" on public.community_reviews;
create policy "community reviews are public" on public.community_reviews
  for select to anon, authenticated using (is_published);
drop policy if exists "community review owner inserts" on public.community_reviews;
create policy "community review owner inserts" on public.community_reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "community review owner updates" on public.community_reviews;
create policy "community review owner updates" on public.community_reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "community review owner deletes" on public.community_reviews;
create policy "community review owner deletes" on public.community_reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.community_review_reports from public, anon, authenticated;
grant insert (review_id) on public.community_review_reports to authenticated;
drop policy if exists "community review reports are private" on public.community_review_reports;
create policy "community review reports are private" on public.community_review_reports
  for insert to authenticated with check ((select auth.uid()) = reporter_id);

create or replace view public.community_reviews_public
with (security_invoker = false)
as
select id, rating, review_text, display_name, github_username, avatar_url, created_at, updated_at
from public.community_reviews
where is_published;
grant select on public.community_reviews_public to anon, authenticated;

create or replace view public.community_review_stats
with (security_invoker = false)
as
select count(*)::bigint as review_count, coalesce(avg(rating), 0)::numeric(3, 2) as average_rating
from public.community_reviews
where is_published;
grant select on public.community_review_stats to anon, authenticated;

create or replace function public.community_review_mine()
returns table (
  id uuid,
  rating smallint,
  review_text text,
  display_name text,
  github_username text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.review_text, r.display_name, r.github_username, r.avatar_url, r.created_at, r.updated_at
  from public.community_reviews r
  where r.user_id = auth.uid()
  limit 1
$$;
revoke all on function public.community_review_mine() from public, anon;
grant execute on function public.community_review_mine() to authenticated;
