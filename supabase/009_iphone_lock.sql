-- iPhone app lock: a private link that iPhone Shortcuts automations can check
-- ("When YouTube opens -> is QuestLog locked? -> show the lock page").
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

-- The long random token in the link identifies the user. Resetting it breaks old automations.
alter table public.profiles add column if not exists lock_token text unique;

create or replace function public.rotate_lock_token()
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  update public.profiles set lock_token = token where id = auth.uid();
  return token;
end;
$$;

revoke execute on function public.rotate_lock_token() from public, anon;
grant execute on function public.rotate_lock_token() to authenticated;

-- Same rule as the Chrome extension: unlocked once today's goal is reached or during an
-- emergency unlock. Only reveals XP numbers, and only to someone holding the token.
create or replace function public.lock_status(p_token text, p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  p public.profiles;
  earned integer;
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
  return json_build_object(
    'goal', p.daily_xp_goal,
    'earned', earned,
    'unlocked_until', p.unlocked_until,
    'unlocked', earned >= p.daily_xp_goal or coalesce(p.unlocked_until > now(), false)
  );
end;
$$;

revoke execute on function public.lock_status(text, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.lock_status(text, timestamptz, timestamptz) to anon;
