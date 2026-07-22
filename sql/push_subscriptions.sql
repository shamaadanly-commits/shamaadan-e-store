-- Push subscriptions for admin order notifications
-- Run in Supabase SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  label text default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_updated_idx
  on public.push_subscriptions (updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_service_all" on public.push_subscriptions;

-- Browser clients use the anon key via API routes with the service role;
-- keep RLS on and allow no public policies (service role bypasses RLS).

comment on table public.push_subscriptions is 'Web Push endpoints for new online order alerts.';
