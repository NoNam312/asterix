-- Stage 3: quest engine (timer + awarding XP).
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

alter table public.quests add column if not exists started_at timestamptz;

-- XP can only change through set_quest_status below, not by editing the profile directly.
revoke update on public.profiles from authenticated;
grant update (username, daily_xp_goal) on public.profiles to authenticated;

-- Changes a quest's status and adjusts the owner's total XP in one step.
-- Returns the user's new total XP.
create or replace function public.set_quest_status(quest_id uuid, new_status text)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  q public.quests;
  delta integer := 0;
  new_total integer;
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

  if q.status = 'completed' and new_status <> 'completed' then delta := -q.xp; end if;
  if q.status <> 'completed' and new_status = 'completed' then delta := q.xp; end if;

  -- Only one quest can be running at a time.
  if new_status = 'active' then
    update public.quests set status = 'planned', started_at = null
    where user_id = auth.uid() and status = 'active' and id <> quest_id;
  end if;

  update public.quests
  set status = new_status,
      started_at = case
        when new_status = 'active' then now()
        when new_status = 'planned' then null
        else started_at
      end
  where id = quest_id;

  update public.profiles
  set total_xp = greatest(0, total_xp + delta)
  where id = auth.uid()
  returning total_xp into new_total;

  return new_total;
end;
$$;

revoke execute on function public.set_quest_status(uuid, text) from public, anon;
grant execute on function public.set_quest_status(uuid, text) to authenticated;
