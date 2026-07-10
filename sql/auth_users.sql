-- Shamaadan E Store — authentication schema (PostgreSQL / Supabase)
-- Run in Supabase SQL editor before enabling production auth.

create extension if not exists pgcrypto;

create table if not exists users (
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

create index if not exists users_role_idx on users (role);
create index if not exists users_active_idx on users (active);

comment on table users is 'Admin accounts (username + password_hash) and POS staff (pin_hash).';
comment on column users.password_hash is 'Node scrypt hash (password_hash / PASSWORD_DEFAULT equivalent).';
comment on column users.pin_hash is 'Node scrypt hash of numeric PIN for POS staff.';

-- Optional durable session store (API also supports signed cookies without this table)
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  scope text not null check (scope in ('admin', 'pos')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_idx on auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx on auth_sessions (expires_at);

-- Seed examples (replace hashes via /api/auth/seed or your own password_hash output).
-- Default demo credentials when Supabase users table is empty are provided by env:
--   AUTH_ADMIN_USERNAME / AUTH_ADMIN_PASSWORD
--   AUTH_STAFF_PIN (maps to staff user "cashier")
