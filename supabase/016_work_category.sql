-- A "Work" quest category (for people using QuestLog as a work planner, and for Jira tasks),
-- and a choice of which category quests made from Jira issues use.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

alter table public.quests drop constraint if exists quests_category_check;
alter table public.quests add constraint quests_category_check
  check (category in ('study', 'work', 'gym', 'chores', 'personal', 'other'));

alter table public.quest_series drop constraint if exists quest_series_category_check;
alter table public.quest_series add constraint quest_series_category_check
  check (category in ('study', 'work', 'gym', 'chores', 'personal', 'other'));

alter table public.profiles drop constraint if exists profiles_lock_categories_check;
alter table public.profiles add constraint profiles_lock_categories_check
  check (lock_categories <@ array['study', 'work', 'gym', 'chores', 'personal', 'other']);

alter table public.jira_connections
  add column if not exists quest_category text not null default 'work'
    check (quest_category in ('study', 'work', 'gym', 'chores', 'personal', 'other'));
