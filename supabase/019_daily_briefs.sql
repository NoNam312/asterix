-- Morning brief and evening wrap-up notifications.
--   Morning: "☀️ 4 quests today · 3h 15m, first at 9:00 am · Next due: Assignment 2 in 18 days"
--   Evening: "🌙 2 quests left · 120 / 200 XP today" (or "Goal reached" when you've made it)
-- Sent once a day each, at the times chosen in Settings, in the device's timezone.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

alter table public.profiles
  add column if not exists brief_morning boolean not null default true,
  add column if not exists brief_morning_at time not null default '08:00',
  add column if not exists brief_evening boolean not null default true,
  add column if not exists brief_evening_at time not null default '21:00',
  add column if not exists brief_morning_sent date,
  add column if not exists brief_evening_sent date;

grant update (brief_morning, brief_morning_at, brief_evening, brief_evening_at) on public.profiles to authenticated;

-- Called by /api/push/dispatch every minute (with the same secret as reminders). Marks each brief
-- as sent and returns one row per device to notify.
create or replace function public.claim_due_briefs(p_secret text)
returns table (kind text, title text, body text, endpoint text, p256dh text, auth text)
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  p record;
  tz text;
  local_now timestamp;
  local_day date;
  day_start timestamptz;
  day_end timestamptz;
  n integer;
  minutes integer;
  first_at timestamptz;
  earned integer;
  next_title text;
  next_at timestamptz;
  days_left integer;
  b_kind text;
  b_title text;
  b_body text;
begin
  if p_secret is null or p_secret <> (select value from private.app_secrets where name = 'reminders') then
    raise exception 'Not allowed';
  end if;

  for p in
    select pr.* from public.profiles pr
    where (pr.brief_morning or pr.brief_evening)
      and exists (select 1 from public.push_subscriptions s where s.user_id = pr.id)
  loop
    select s.time_zone into tz from public.push_subscriptions s
    where s.user_id = p.id order by s.created_at desc limit 1;
    begin
      local_now := now() at time zone tz;
    exception when others then
      tz := 'UTC';
      local_now := now() at time zone tz;
    end;
    local_day := local_now::date;
    day_start := local_day::timestamp at time zone tz;
    day_end := (local_day + 1)::timestamp at time zone tz;
    b_kind := null;

    -- Morning: within 3 hours after the chosen time (time - time, so late times don't wrap), once a day.
    if p.brief_morning
       and (local_now::time - p.brief_morning_at) between interval '0' and interval '3 hours'
       and (p.brief_morning_sent is null or p.brief_morning_sent < local_day) then
      update public.profiles set brief_morning_sent = local_day where id = p.id;

      select count(*), coalesce(sum(q.duration_min), 0), min(q.start_at) into n, minutes, first_at
      from public.quests q
      where q.user_id = p.id and q.kind = 'task' and q.status in ('planned', 'active')
        and q.start_at >= day_start and q.start_at < day_end
        and (q.calendar_id is null or exists (select 1 from public.calendars c where c.id = q.calendar_id and c.visible));

      select q.title, q.start_at into next_title, next_at
      from public.quests q
      where q.user_id = p.id and q.kind = 'deadline' and q.start_at > now()
        and exists (select 1 from public.calendars c where c.id = q.calendar_id and c.visible)
      order by q.start_at limit 1;

      b_kind := 'morning';
      if n = 0 then
        b_title := '☀️ Good morning: nothing planned yet';
        b_body := 'Open QuestLog to plan today''s quests.';
      else
        b_title := format('☀️ %s quest%s today', n, case when n = 1 then '' else 's' end);
        b_body := format('%s planned, first at %s.',
          case when minutes < 60 then minutes || 'm'
               when minutes % 60 = 0 then (minutes / 60) || 'h'
               else (minutes / 60) || 'h ' || (minutes % 60) || 'm' end,
          lower(to_char(first_at at time zone tz, 'FMHH12:MI am')));
      end if;
      if next_title is not null then
        days_left := ((next_at at time zone tz)::date - local_day);
        b_body := b_body || format(' Next due: %s (%s).',
          regexp_replace(next_title, '\s*\[[^]]*\]\s*', ' ', 'g'),
          case when days_left <= 0 then 'today' when days_left = 1 then 'tomorrow' else 'in ' || days_left || ' days' end);
      end if;

    -- Evening: within 3 hours after the chosen time, once a day.
    elsif p.brief_evening
       and (local_now::time - p.brief_evening_at) between interval '0' and interval '3 hours'
       and (p.brief_evening_sent is null or p.brief_evening_sent < local_day) then
      update public.profiles set brief_evening_sent = local_day where id = p.id;

      select count(*) into n
      from public.quests q
      where q.user_id = p.id and q.kind = 'task' and q.calendar_id is null and q.status in ('planned', 'active')
        and q.start_at >= day_start and q.start_at < day_end;
      earned := public.day_xp(p.id, day_start, day_end);

      b_kind := 'evening';
      if earned >= p.daily_xp_goal then
        b_title := '🎉 Goal reached today';
        b_body := format('%s / %s XP.', earned, p.daily_xp_goal)
          || case when n > 0 then format(' %s quest%s still open: finish or move to tomorrow.', n, case when n = 1 then '' else 's' end)
                  else ' Enjoy your evening.' end;
      else
        b_title := case when n > 0 then format('🌙 %s quest%s left today', n, case when n = 1 then '' else 's' end)
                        else '🌙 Evening check-in' end;
        b_body := format('%s / %s XP so far. ', earned, p.daily_xp_goal)
          || case when n > 0 then 'Finish one, or move them to tomorrow so they don''t fail.'
                  else 'Plan a short quest to reach your goal and keep your streak.' end;
      end if;
    end if;

    if b_kind is not null then
      return query
      select b_kind, b_title, b_body, s.endpoint, s.p256dh, s.auth
      from public.push_subscriptions s where s.user_id = p.id;
    end if;
  end loop;
end;
$$;

revoke execute on function public.claim_due_briefs(text) from public, authenticated;
grant execute on function public.claim_due_briefs(text) to anon;
