-- Lock modes: choose whether QuestLog locks apps/sites only during quests, until today's quests
-- are done, or all day until the XP goal. Reaching the goal or an emergency unlock always unlocks.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.
-- Self-contained: includes everything from 010, so it's fine whether or not 010 was run.

alter table public.profiles
  add column if not exists lock_mode text not null default 'during_quests';
alter table public.profiles drop constraint if exists profiles_lock_mode_check;
alter table public.profiles add constraint profiles_lock_mode_check
  check (lock_mode in ('during_quests', 'until_done', 'all_day'));

grant update (username, daily_xp_goal, blocked_sites, allowed_urls, notify_quests, notify_classes,
  notify_deadlines, notify_time_up, remind_minutes, lock_mode) on public.profiles to authenticated;

-- Unfinished quests (including kept classes) that haven't ended yet today.
create or replace function public.quests_left_today(uid uuid, p_start timestamptz, p_end timestamptz)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select count(*)::integer
  from public.quests q
  left join public.calendars c on c.id = q.calendar_id
  where q.user_id = uid
    and q.kind = 'task'
    and q.status in ('planned', 'active')
    and q.start_at >= p_start
    and q.start_at < p_end
    and q.start_at + make_interval(mins => q.duration_min) > now()
    and (q.calendar_id is null or c.visible);
$$;

-- The quest happening right now (a running timer counts until it's finished or stopped).
create or replace function public.current_quest(uid uuid)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select q.title
  from public.quests q
  left join public.calendars c on c.id = q.calendar_id
  where q.user_id = uid
    and q.kind = 'task'
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

-- Shared lock decision for a user and their local day.
create or replace function public.lock_decision(uid uuid, p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  p public.profiles;
  earned integer;
  left_today integer;
  now_quest text;
  goal_reached boolean;
  emergency boolean;
  schedule_free boolean;
begin
  if p_end - p_start not between interval '22 hours' and interval '26 hours'
     or now() < p_start or now() >= p_end then
    raise exception 'Invalid day range';
  end if;
  select * into p from public.profiles where id = uid;
  earned := public.day_xp(uid, p_start, p_end);
  left_today := public.quests_left_today(uid, p_start, p_end);
  now_quest := public.current_quest(uid);
  goal_reached := earned >= p.daily_xp_goal;
  emergency := coalesce(p.unlocked_until > now(), false);
  schedule_free := case p.lock_mode
    when 'during_quests' then now_quest is null
    when 'until_done' then left_today = 0
    else false
  end;
  return json_build_object(
    'goal', p.daily_xp_goal,
    'earned', earned,
    'goal_reached', goal_reached,
    'lock_mode', p.lock_mode,
    'quests_left', left_today,
    'current_quest', now_quest,
    'schedule_free', schedule_free,
    'unlocked_until', p.unlocked_until,
    'unlocked', goal_reached or emergency or schedule_free
  );
end;
$$;

revoke execute on function public.lock_decision(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Chrome extension status.
create or replace function public.get_focus_status(p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;
  return public.lock_decision(auth.uid(), p_start, p_end)::jsonb || jsonb_build_object(
    'username', p.username,
    'total_xp', p.total_xp,
    'blocked_sites', p.blocked_sites,
    'allowed_urls', p.allowed_urls,
    'emergency_cost', 50,
    'emergency_minutes', 15
  );
end;
$$;

revoke execute on function public.get_focus_status(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_focus_status(timestamptz, timestamptz) to authenticated;

-- iPhone Shortcuts status.
create or replace function public.lock_status(p_token text, p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  uid uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select id into uid from public.profiles where lock_token = p_token;
  if uid is null then
    return null;
  end if;
  return public.lock_decision(uid, p_start, p_end);
end;
$$;

revoke execute on function public.lock_status(text, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.lock_status(text, timestamptz, timestamptz) to anon;
