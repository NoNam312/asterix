-- How long a due date's work takes, when you've set it yourself (otherwise QuestLog guesses from
-- the title and the Canvas details). This sets the boss's HP, its reward and Plan week's target.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.deadline_estimates (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deadline_id uuid not null,   -- the due date's quest; calendar syncs keep its id
  minutes integer not null check (minutes between 15 and 1800),
  updated_at timestamptz not null default now(),
  primary key (user_id, deadline_id)
);

alter table public.deadline_estimates enable row level security;

drop policy if exists "Users manage own deadline estimates" on public.deadline_estimates;
create policy "Users manage own deadline estimates" on public.deadline_estimates
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
