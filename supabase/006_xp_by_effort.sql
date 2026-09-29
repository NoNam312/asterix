-- XP follows the work you actually put in.
-- When a quest was timed (started with the timer), completing it pays its hourly rate for the
-- time really worked: finishing a 2h quest after 30 min pays for 30 min, and working past the
-- time limit pays up to 150%. Untimed quests pay their planned XP.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.
-- (Replaces set_quest_status from 004_penalties_streaks.sql; everything else is unchanged.)

create or replace function public.set_quest_status(quest_id uuid, new_status text)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  q public.quests;
  b public.daily_bonuses;
  cur_total integer;
  new_total integer;
  delta integer := 0;
  penalty integer := 0;
  awarded integer;
  goal integer;
  worked_ratio numeric;
begin
  if new_status not in ('planned', 'active', 'completed', 'failed') then
    raise exception 'Invalid status: %', new_status;
  end if;

  select * into q from public.quests
  where id = quest_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Quest not found';
  end if;

  select total_xp, daily_xp_goal into cur_total, goal
  from public.profiles where id = auth.uid()
  for update;

  if q.status = new_status then
    return cur_total;
  end if;

  -- Leaving the old status.
  if q.status = 'completed' then delta := delta - q.xp; end if;
  if q.status = 'failed' then delta := delta + q.xp_penalty; end if;

  -- Entering the new status.
  if new_status = 'completed' then
    awarded := q.xp;
    if q.status = 'active' and q.started_at is not null and q.duration_min > 0 then
      worked_ratio := least(1.5, extract(epoch from now() - q.started_at) / 60.0 / q.duration_min);
      awarded := greatest(5, (round(q.xp * worked_ratio / 5.0) * 5)::integer);
    end if;
    delta := delta + awarded;
  end if;
  if new_status = 'failed' then
    -- Lose half the quest's XP (at least 5), but never go below 0 total.
    penalty := greatest(5, (round(q.xp * 0.5 / 5.0) * 5)::integer);
    penalty := least(penalty, greatest(0, cur_total + delta));
    delta := delta - penalty;
  end if;

  -- Only one quest can be running at a time.
  if new_status = 'active' then
    update public.quests set status = 'planned', started_at = null
    where user_id = auth.uid() and status = 'active' and id <> quest_id;
  end if;

  update public.quests
  set status = new_status,
      xp_penalty = penalty,
      -- A completed quest keeps the XP it actually paid, so undoing removes exactly that.
      xp = coalesce(awarded, xp),
      started_at = case
        when new_status = 'active' then now()
        when new_status = 'planned' then null
        else started_at
      end
  where id = quest_id;

  update public.profiles
  set total_xp = greatest(0, cur_total + delta)
  where id = auth.uid()
  returning total_xp into new_total;

  -- Undoing a completion can drop that day below its goal: take back the day's bonus.
  if q.status = 'completed' then
    for b in
      select * from public.daily_bonuses
      where user_id = auth.uid() and q.start_at >= day_start and q.start_at < day_end
    loop
      if public.day_xp(auth.uid(), b.day_start, b.day_end) < goal then
        delete from public.daily_bonuses where user_id = auth.uid() and day = b.day;
        update public.profiles
        set total_xp = greatest(0, total_xp - b.xp)
        where id = auth.uid()
        returning total_xp into new_total;
      end if;
    end loop;
  end if;

  return new_total;
end;
$$;

revoke execute on function public.set_quest_status(uuid, text) from public, anon;
grant execute on function public.set_quest_status(uuid, text) to authenticated;
