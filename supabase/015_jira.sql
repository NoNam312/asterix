-- Jira: show the issues assigned to you and turn them into quests.
-- The API token is encrypted by the server (INTEGRATION_SECRET) before it is stored, so this
-- table never holds a readable token.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.jira_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  site text not null check (site ~ '^https://[a-z0-9-]+\.atlassian\.net$'),
  email text not null,
  token_cipher text not null,     -- AES-GCM, only the server can decrypt it
  account_name text,              -- shown in Settings ("Connected as …")
  jql text not null default 'assignee = currentUser() AND statusCategory != Done ORDER BY duedate ASC, priority DESC',
  created_at timestamptz not null default now()
);

alter table public.jira_connections enable row level security;

drop policy if exists "Users manage own Jira connection" on public.jira_connections;
create policy "Users manage own Jira connection" on public.jira_connections
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
