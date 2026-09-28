-- Stage 2: quests (the tasks on your calendar).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default 'study'
    check (category in ('study', 'gym', 'chores', 'personal', 'other')),
  notes text,
  start_at timestamptz not null,
  duration_min integer not null default 60 check (duration_min between 5 and 1440),
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed', 'failed')),
  difficulty text,               -- filled in by the quest engine (Stage 3)
  xp integer not null default 0, -- XP reward (Stage 3)
  created_at timestamptz not null default now()
);

create index if not exists quests_user_start_idx on public.quests (user_id, start_at);

alter table public.quests enable row level security;

-- Users can only see and change their own quests.
drop policy if exists "Users manage own quests" on public.quests;
create policy "Users manage own quests" on public.quests
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
