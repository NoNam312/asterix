-- Recurring quests: "Gym every Mon/Wed/Fri", "MoC revision every evening".
-- A quest_series row holds the rule; the planner creates the actual quests a few weeks ahead,
-- so repeats work with everything else (focus lock, reminders, XP, streaks, insights).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.quest_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  category text not null default 'study'
    check (category in ('study', 'gym', 'chores', 'personal', 'other')),
  notes text,
  start_time text not null check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'), -- local time, "18:30"
  duration_min integer not null check (duration_min between 5 and 1440),
  weekdays smallint[] not null
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  starts_on date not null,
  generated_until date,     -- quests exist up to this date; later days are added as time goes on
  ends_on date,             -- last day it repeats (null = keeps going); set by "stop repeating"
  created_at timestamptz not null default now()
);

alter table public.quest_series enable row level security;

drop policy if exists "Users manage own quest series" on public.quest_series;
create policy "Users manage own quest series" on public.quest_series
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Each quest made from a series points back to it. Deleting a series keeps past quests.
alter table public.quests
  add column if not exists recurrence_id uuid references public.quest_series (id) on delete set null;

-- One quest per series per start time, so two devices adding the same weeks can't double up.
alter table public.quests drop constraint if exists quests_recurrence_start_unique;
alter table public.quests add constraint quests_recurrence_start_unique unique (recurrence_id, start_at);
