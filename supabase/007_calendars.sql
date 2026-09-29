-- Calendar layers: subscribe to timetable / Canvas / any .ics feed as a separate layer.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  url text not null check (char_length(url) <= 2000), -- private feed link, treat like a password
  color text not null default '#c27c0e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  visible boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.calendars enable row level security;
drop policy if exists "Users manage own calendars" on public.calendars;
create policy "Users manage own calendars" on public.calendars
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Which repeating classes (series) of a layer the user keeps. Special keys:
-- '__oneoffs' = single events, '__deadlines' = due dates.
create table if not exists public.calendar_series (
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_key text not null,
  title text not null,
  kept boolean not null default true,
  primary key (calendar_id, series_key)
);

alter table public.calendar_series enable row level security;
drop policy if exists "Users manage own calendar series" on public.calendar_series;
create policy "Users manage own calendar series" on public.calendar_series
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Quests imported from a layer are deleted with it.
alter table public.quests
  add column if not exists calendar_id uuid references public.calendars (id) on delete cascade,
  add column if not exists external_uid text,
  add column if not exists series_key text,
  add column if not exists kind text not null default 'task' check (kind in ('task', 'deadline')),
  add column if not exists all_day boolean not null default false;

alter table public.quests drop constraint if exists quests_calendar_event_unique;
alter table public.quests add constraint quests_calendar_event_unique unique (calendar_id, external_uid);

-- Deadlines are markers, not quests: they can't be completed for XP.
alter table public.quests drop constraint if exists quests_deadline_no_xp;
alter table public.quests add constraint quests_deadline_no_xp check (kind = 'task' or xp = 0);

-- Imported classes are optional: skipping one is not auto-failed (you chose which to keep, and
-- plans change). Replaces fail_missed_quests from 004 with calendar events excluded.
create or replace function public.fail_missed_quests(cutoff timestamptz)
returns json
language plpgsql
security definer set search_path = ''
as $$
declare
  ids uuid[];
  qid uuid;
  lost integer;
  total integer;
begin
  cutoff := least(cutoff, now());

  select coalesce(array_agg(id), '{}') into ids
  from public.quests
  where user_id = auth.uid()
    and calendar_id is null
    and kind = 'task'
    and status in ('planned', 'active')
    and start_at + make_interval(mins => duration_min) <= cutoff;

  foreach qid in array ids loop
    perform public.set_quest_status(qid, 'failed');
  end loop;

  select coalesce(sum(xp_penalty), 0)::integer into lost from public.quests where id = any(ids);
  select total_xp into total from public.profiles where id = auth.uid();

  return json_build_object('missed', cardinality(ids), 'xp_lost', lost, 'total_xp', total);
end;
$$;

revoke execute on function public.fail_missed_quests(timestamptz) from public, anon;
grant execute on function public.fail_missed_quests(timestamptz) to authenticated;
