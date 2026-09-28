-- Stage 5: focus lock (blocklist settings + status for the Chrome extension).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

alter table public.profiles
  add column if not exists blocked_sites text[] not null default array[
    'youtube.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'facebook.com',
    'reddit.com', 'twitch.tv', 'netflix.com', 'snapchat.com', 'pinterest.com'
  ],
  -- Pages that stay open even on blocked sites (messaging).
  add column if not exists allowed_urls text[] not null default array[
    'instagram.com/direct', 'facebook.com/messages', 'x.com/messages', 'twitter.com/messages'
  ],
  -- Set by an emergency unlock.
  add column if not exists unlocked_until timestamptz;

alter table public.profiles drop constraint if exists profiles_daily_goal_range;
alter table public.profiles add constraint profiles_daily_goal_range
  check (daily_xp_goal between 50 and 2000);

alter table public.profiles drop constraint if exists profiles_list_sizes;
alter table public.profiles add constraint profiles_list_sizes
  check (cardinality(blocked_sites) <= 100 and cardinality(allowed_urls) <= 100);

grant update (username, daily_xp_goal, blocked_sites, allowed_urls) on public.profiles to authenticated;

-- Everything the extension needs, for the user's current local day.
create or replace function public.get_focus_status(p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  p public.profiles;
  earned integer;
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

  return json_build_object(
    'username', p.username,
    'goal', p.daily_xp_goal,
    'earned', earned,
    'total_xp', p.total_xp,
    'goal_reached', earned >= p.daily_xp_goal,
    'unlocked_until', p.unlocked_until,
    'unlocked', earned >= p.daily_xp_goal or coalesce(p.unlocked_until > now(), false),
    'blocked_sites', p.blocked_sites,
    'allowed_urls', p.allowed_urls,
    'emergency_cost', 50,
    'emergency_minutes', 15
  );
end;
$$;

revoke execute on function public.get_focus_status(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_focus_status(timestamptz, timestamptz) to authenticated;

-- Spend 50 XP to unlock blocked sites for 15 minutes.
create or replace function public.emergency_unlock()
returns json
language plpgsql
security definer set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  if p.total_xp < 50 then
    raise exception 'You need at least 50 XP for an emergency unlock';
  end if;

  update public.profiles
  set total_xp = total_xp - 50,
      unlocked_until = greatest(coalesce(unlocked_until, now()), now()) + interval '15 minutes'
  where id = auth.uid()
  returning * into p;

  return json_build_object('unlocked_until', p.unlocked_until, 'total_xp', p.total_xp);
end;
$$;

revoke execute on function public.emergency_unlock() from public, anon;
grant execute on function public.emergency_unlock() to authenticated;
