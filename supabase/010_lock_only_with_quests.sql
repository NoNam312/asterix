-- Only lock apps/sites while there's still work planned today.
-- Unlocked when: today's XP goal is reached, an emergency unlock is running, or no unfinished
-- quest is left today (nothing planned, or everything planned has already ended).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.
-- (Replaces get_focus_status from 005 and lock_status from 009.)

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

revoke execute on function public.quests_left_today(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Chrome extension status.
create or replace function public.get_focus_status(p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  p public.profiles;
  earned integer;
  left_today integer;
begin
  if p_end - p_start not between interval '22 hours' and interval '26 hours'
     or now() < p_start or now() >= p_end then
    raise exception 'Invalid day range';
  end if;

  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;

  earned := public.day_xp(auth.uid(), p_start, p_end);
  left_today := public.quests_left_today(auth.uid(), p_start, p_end);

  return json_build_object(
    'username', p.username,
    'goal', p.daily_xp_goal,
    'earned', earned,
    'total_xp', p.total_xp,
    'goal_reached', earned >= p.daily_xp_goal,
    'quests_left', left_today,
    'unlocked_until', p.unlocked_until,
    'unlocked', earned >= p.daily_xp_goal or left_today = 0 or coalesce(p.unlocked_until > now(), false),
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
  p public.profiles;
  earned integer;
  left_today integer;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  if p_end - p_start not between interval '22 hours' and interval '26 hours'
     or now() < p_start or now() >= p_end then
    raise exception 'Invalid day range';
  end if;

  select * into p from public.profiles where lock_token = p_token;
  if not found then
    return null;
  end if;

  earned := public.day_xp(p.id, p_start, p_end);
  left_today := public.quests_left_today(p.id, p_start, p_end);
  return json_build_object(
    'goal', p.daily_xp_goal,
    'earned', earned,
    'quests_left', left_today,
    'unlocked_until', p.unlocked_until,
    'unlocked', earned >= p.daily_xp_goal or left_today = 0 or coalesce(p.unlocked_until > now(), false)
  );
end;
$$;

revoke execute on function public.lock_status(text, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.lock_status(text, timestamptz, timestamptz) to anon;
