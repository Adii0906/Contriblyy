-- TEST ONLY. Never run this against a real Supabase project.
-- Recreates the small part of Supabase's environment the migration depends on,
-- so RLS can be tested on a plain PostgreSQL server:
--   * roles anon / authenticated / service_role
--   * schema auth with auth.users and auth.uid() (same definition Supabase uses:
--     reads the "sub" claim from request.jwt.claims)
-- The stand-in auth server (scripts/supabase-standin.mjs) adds credential
-- columns it needs for local end-to-end tests.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists auth.identities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider_id   text not null,
  identity_data jsonb not null default '{}'::jsonb,
  provider      text not null,
  created_at    timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- The migration references auth.users in a foreign key; the FK check runs with
-- the table owner's rights, so callers need no privileges on auth.users.
