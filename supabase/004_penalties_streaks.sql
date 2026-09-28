-- Stage 4: penalties, missed quests, daily goal bonus and streaks.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

-- How much XP was taken when a quest failed (refunded if the fail is undone).
alter table public.quests add column if not exists xp_penalty integer not null default 0;

-- One row per day the user reached their daily XP goal.
create table if not exists public.daily_bonuses (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  day_start timestamptz not null,  -- the user's local midnight, so timezones work
  day_end timestamptz not null,
  streak integer not null,
  xp integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_bonuses enable row level security;

drop policy if exists "Users read own bonuses" on public.daily_bonuses;
create policy "Users read own bonuses" on public.daily_bonuses
  for select using ((select auth.uid()) = user_id);
-- No insert/update policies: rows are only written by claim_daily_bonus below.

-- XP from completed quests in a time range.
create or replace function public.day_xp(uid uuid, from_ts timestamptz, to_ts timestamptz)
returns integer
language sql
stable
security definer set search_path = ''
as $$
  select coalesce(sum(xp), 0)::integer
  from public.quests
  where user_id = uid and status = 'completed' and start_at >= from_ts and start_at < to_ts;
$$;

revoke execute on function public.day_xp(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Replaces the Stage 3 version: adds fail penalties and refunds.
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
  goal integer;
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
  if new_status = 'completed' then delta := delta + q.xp; end if;
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

-- Fails every unfinished quest that ended before `cutoff` (the user's local midnight).
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

-- Awards the daily goal bonus once per day. Returns null if not earned (or already claimed).
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
  new_streak := coalesce(prev_streak, 0) + 1;
  bonus := 50 + 10 * least(new_streak - 1, 10);

  insert into public.daily_bonuses (user_id, day, day_start, day_end, streak, xp)
  values (auth.uid(), p_day, p_start, p_end, new_streak, bonus);

  update public.profiles
  set total_xp = total_xp + bonus
  where id = auth.uid()
  returning total_xp into total;

  return json_build_object('bonus', bonus, 'streak', new_streak, 'total_xp', total);
end;
$$;

revoke execute on function public.claim_daily_bonus(date, timestamptz, timestamptz) from public, anon;
grant execute on function public.claim_daily_bonus(date, timestamptz, timestamptz) to authenticated;
