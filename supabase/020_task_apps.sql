-- Task apps besides Jira (Todoist, GitHub, Trello, Linear, Asana, ClickUp): one connection per
-- app. Tokens are encrypted by the server (INTEGRATION_SECRET) before they're stored.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.task_connections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('todoist', 'github', 'trello', 'linear', 'asana', 'clickup')),
  token_cipher text not null,     -- AES-GCM, only the server can decrypt it
  account_name text,              -- shown in Settings ("Connected as …")
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.task_connections enable row level security;

drop policy if exists "Users manage own task connections" on public.task_connections;
create policy "Users manage own task connections" on public.task_connections
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
