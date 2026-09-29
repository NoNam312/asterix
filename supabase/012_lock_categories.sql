-- Choose which kinds of quests lock apps/sites (default: study and other/work, not gym or personal).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.
-- (Needs 011_lock_modes.sql. Replaces quests_left_today and current_quest from 011.)

alter table public.profiles
  add column if not exists lock_categories text[] not null default array['study', 'other'];
alter table public.profiles drop constraint if exists profiles_lock_categories_check;
alter table public.profiles add constraint profiles_lock_categories_check
  check (lock_categories <@ array['study', 'gym', 'chores', 'personal', 'other']);

grant update (username, daily_xp_goal, blocked_sites, allowed_urls, notify_quests, notify_classes,
  notify_deadlines, notify_time_up, remind_minutes, lock_mode, lock_categories) on public.profiles to authenticated;

-- Unfinished lock-worthy quests (including kept classes) that haven't ended yet today.
create or replace function public.quests_left_today(uid uuid, p_start timestamptz, p_end timestamptz)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::integer
  from public.quests q
  join public.profiles p on p.id = q.user_id
  left join public.calendars c on c.id = q.calendar_id
  where q.user_id = uid
    and q.kind = 'task'
    and q.category = any(p.lock_categories)
    and q.status in ('planned', 'active')
    and q.start_at >= p_start
    and q.start_at < p_end
    and q.start_at + make_interval(mins => q.duration_min) > now()
    and (q.calendar_id is null or c.visible);
$$;

-- The lock-worthy quest happening right now (a running timer counts until finished or stopped).
create or replace function public.current_quest(uid uuid)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select q.title
  from public.quests q
  join public.profiles p on p.id = q.user_id
  left join public.calendars c on c.id = q.calendar_id
  where q.user_id = uid
    and q.kind = 'task'
    and q.category = any(p.lock_categories)
    and (
      q.status = 'active'
      or (q.status = 'planned' and now() >= q.start_at and now() < q.start_at + make_interval(mins => q.duration_min))
    )
    and (q.calendar_id is null or c.visible)
  order by (q.status = 'active') desc, q.start_at
  limit 1;
$$;

revoke execute on function public.quests_left_today(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.current_quest(uuid) from public, anon, authenticated;
