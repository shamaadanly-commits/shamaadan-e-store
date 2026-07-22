-- ============================================================================
-- auth_users.sql — Admin + POS login tables
-- ============================================================================
-- Fixes: "Could not find the table 'public.users' in the schema cache"
-- when changing passwords / PINs in Admin → Passwords & PINs.
--
-- Run once in: Supabase → SQL Editor → New query → Paste → Run
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text,
  pin_hash text,
  role text not null check (role in ('admin', 'staff')),
  display_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint users_creds_chk check (
    password_hash is not null or pin_hash is not null
  )
);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_active_idx on public.users (active);
create index if not exists users_username_lower_idx on public.users (lower(username));

comment on table public.users is 'Admin accounts (username + password_hash) and POS staff (pin_hash).';
comment on column public.users.password_hash is 'Node scrypt hash for admin dashboard login.';
comment on column public.users.pin_hash is 'Node scrypt hash of numeric PIN for POS staff / admin PIN.';

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  scope text not null check (scope in ('admin', 'pos')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx on public.auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx on public.auth_sessions (expires_at);

-- RLS: browser anon key should not read passwords; API uses service role (bypasses RLS).
alter table public.users enable row level security;
alter table public.auth_sessions enable row level security;

drop policy if exists "users_deny_all" on public.users;
create policy "users_deny_all" on public.users
  for all using (false) with check (false);

drop policy if exists "auth_sessions_deny_all" on public.auth_sessions;
create policy "auth_sessions_deny_all" on public.auth_sessions
  for all using (false) with check (false);

-- Reload PostgREST schema cache so /rest/v1/users is visible immediately
notify pgrst, 'reload schema';
