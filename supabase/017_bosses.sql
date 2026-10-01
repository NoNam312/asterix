-- Boss quests: each upcoming due date is a boss whose HP is the work it needs. Studying the
-- subject deals damage; beating it before it's due pays a one-off XP reward.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

-- One row per boss beaten. No foreign key: a calendar sync can replace the due-date row.
create table if not exists public.boss_defeats (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deadline_id uuid not null,
  title text not null,
  xp integer not null,
  defeated_at timestamptz not null default now(),
  primary key (user_id, deadline_id)
);

alter table public.boss_defeats enable row level security;

drop policy if exists "Users read own boss defeats" on public.boss_defeats;
create policy "Users read own boss defeats" on public.boss_defeats
  for select using ((select auth.uid()) = user_id);
-- No insert policy: rows are only written by claim_boss_reward below.

-- Pays the reward for beating a boss, once. p_hp is the boss's HP (minutes of work it needs),
-- which sets the reward: 50 XP + 10 per hour, at most 300. Returns null if not allowed.
create or replace function public.claim_boss_reward(p_deadline uuid, p_hp integer)
returns json
language plpgsql
security definer set search_path = ''
as $$
declare
  d public.quests;
  reward integer;
  total integer;
begin
  if p_hp is null or p_hp not between 30 and 1800 then
    raise exception 'Invalid boss HP';
  end if;

  select * into d from public.quests
  where id = p_deadline and user_id = auth.uid() and kind = 'deadline';
  -- Only bosses that are still due (all-day due dates count until the end of their day).
  if not found or d.start_at + interval '1 day' < now() then
    return null;
  end if;

  reward := least(300, 50 + round(p_hp / 60.0 * 10)::integer);
  insert into public.boss_defeats (user_id, deadline_id, title, xp)
  values (auth.uid(), p_deadline, left(d.title, 200), reward)
  on conflict do nothing;
  if not found then
    return null;  -- already claimed
  end if;

  update public.profiles
  set total_xp = total_xp + reward
  where id = auth.uid()
  returning total_xp into total;

  return json_build_object('xp', reward, 'total_xp', total);
end;
$$;

revoke execute on function public.claim_boss_reward(uuid, integer) from public, anon;
grant execute on function public.claim_boss_reward(uuid, integer) to authenticated;
