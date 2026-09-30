-- Insights and streak freezes.
--  * Quests remember when they were finished and, for timed quests, how long you actually worked,
--    so the Insights page can show which subjects you overrun on.
--  * A streak freeze covers one missed day per week: miss a day, reach your goal the next day,
--    and the streak carries on.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.
-- (Replaces set_quest_status from 006_xp_by_effort.sql and claim_daily_bonus from
-- 004_penalties_streaks.sql; everything else is unchanged.)

alter table public.quests add column if not exists completed_at timestamptz;
alter table public.quests add column if not exists worked_min integer;

-- One row per missed day a streak freeze covered.
create table if not exists public.streak_freezes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,        -- the missed day
  used_for date not null,   -- the day whose goal carried the streak over it
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.streak_freezes enable row level security;

drop policy if exists "Users read own streak freezes" on public.streak_freezes;
create policy "Users read own streak freezes" on public.streak_freezes
  for select using ((select auth.uid()) = user_id);
-- No insert/update policies: rows are only written by claim_daily_bonus below.

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
  worked integer;
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
      worked := greatest(1, round(extract(epoch from now() - q.started_at) / 60.0)::integer);
      worked_ratio := least(1.5, worked::numeric / q.duration_min);
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
      end,
      completed_at = case when new_status = 'completed' then now() end,
      -- Minutes actually worked, for timed quests only.
      worked_min = case when new_status = 'completed' then worked end
  where id = quest_id;

  update public.profiles
  set total_xp = greatest(0, cur_total + delta)
  where id = auth.uid()
  returning total_xp into new_total;

  -- Undoing a completion can drop that day below its goal: take back the day's bonus
  -- (and give back a streak freeze that bonus used).
  if q.status = 'completed' then
    for b in
      select * from public.daily_bonuses
      where user_id = auth.uid() and q.start_at >= day_start and q.start_at < day_end
    loop
      if public.day_xp(auth.uid(), b.day_start, b.day_end) < goal then
        delete from public.daily_bonuses where user_id = auth.uid() and day = b.day;
        delete from public.streak_freezes where user_id = auth.uid() and used_for = b.day;
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

-- Awards the daily goal bonus once per day. Returns null if not earned (or already claimed).
-- If the day before was missed but the day before that reached the goal, a streak freeze
-- covers the gap, at most once in any 7 days.
create or replace function public.claim_daily_bonus(p_day date, p_start timestamptz, p_end timestamptz)
returns json
language plpgsql
security definer set search_path = ''
as $$
declare
  goal integer;
  prev_streak integer;
  new_streak integer;
  bonus integer;
  total integer;
  froze boolean := false;
begin
  if p_end - p_start not between interval '22 hours' and interval '26 hours' then
    raise exception 'Invalid day range';
  end if;
  if now() < p_start or now() > p_end + interval '36 hours' then
    return null;
  end if;
  if exists (select 1 from public.daily_bonuses where user_id = auth.uid() and day = p_day) then
    return null;
  end if;

  select daily_xp_goal into goal from public.profiles where id = auth.uid();
  if public.day_xp(auth.uid(), p_start, p_end) < goal then
    return null;
  end if;

  select streak into prev_streak
  from public.daily_bonuses
  where user_id = auth.uid() and day = p_day - 1;

  if prev_streak is null then
    select streak into prev_streak
    from public.daily_bonuses
    where user_id = auth.uid() and day = p_day - 2;
    if prev_streak is not null and not exists (
      select 1 from public.streak_freezes
      where user_id = auth.uid() and day between p_day - 7 and p_day - 1
    ) then
      insert into public.streak_freezes (user_id, day, used_for) values (auth.uid(), p_day - 1, p_day);
      froze := true;
    else
      prev_streak := null;
    end if;
  end if;

  new_streak := coalesce(prev_streak, 0) + 1;
  bonus := 50 + 10 * least(new_streak - 1, 10);

  insert into public.daily_bonuses (user_id, day, day_start, day_end, streak, xp)
  values (auth.uid(), p_day, p_start, p_end, new_streak, bonus);

  update public.profiles
  set total_xp = total_xp + bonus
  where id = auth.uid()
  returning total_xp into total;

  return json_build_object('bonus', bonus, 'streak', new_streak, 'total_xp', total, 'froze', froze);
end;
$$;

revoke execute on function public.claim_daily_bonus(date, timestamptz, timestamptz) from public, anon;
grant execute on function public.claim_daily_bonus(date, timestamptz, timestamptz) to authenticated;
