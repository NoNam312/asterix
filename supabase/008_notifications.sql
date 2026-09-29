-- Push notifications: quest reminders, "time's up", and due-date warnings.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

-- ---------- devices that receive notifications ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'UTC', -- to write times in notifications
  device text,                            -- e.g. "iPhone", shown in Settings
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- preferences ----------
alter table public.profiles
  add column if not exists notify_quests boolean not null default true,
  add column if not exists notify_classes boolean not null default true,
  add column if not exists notify_deadlines boolean not null default true,
  add column if not exists notify_time_up boolean not null default true,
  add column if not exists remind_minutes integer not null default 10 check (remind_minutes between 0 and 120);

grant update (username, daily_xp_goal, blocked_sites, allowed_urls, notify_quests, notify_classes,
  notify_deadlines, notify_time_up, remind_minutes) on public.profiles to authenticated;

-- What has already been sent, so nothing is sent twice.
alter table public.quests
  add column if not exists reminded_at timestamptz,
  add column if not exists time_up_notified_at timestamptz;

-- ---------- secret shared between the scheduler and the reminder function ----------
-- Lives outside the public schema, so the API can never read it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_secrets (name text primary key, value text not null);
insert into private.app_secrets (name, value)
values ('reminders', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- ---------- hand out due reminders (called by /api/push/dispatch) ----------
-- Only callers holding the scheduler's secret get anything back. Each reminder is marked as
-- sent in the same step, so two runs can never send the same one.
create or replace function public.claim_due_reminders(p_secret text)
returns table (
  kind text,
  quest_id uuid,
  title text,
  start_at timestamptz,
  duration_min integer,
  xp integer,
  difficulty text,
  endpoint text,
  p256dh text,
  auth text,
  time_zone text
)
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret <> (select value from private.app_secrets where name = 'reminders') then
    raise exception 'Not allowed';
  end if;

  return query
  with starting as (
    update public.quests q
    set reminded_at = now()
    from public.profiles p
    where p.id = q.user_id
      and q.kind = 'task'
      and q.status = 'planned'
      and q.reminded_at is null
      and q.start_at > now() - interval '2 minutes'
      and q.start_at <= now() + make_interval(mins => p.remind_minutes)
      and (case when q.calendar_id is null then p.notify_quests else p.notify_classes end)
      and (q.calendar_id is null or exists (
        select 1 from public.calendars c where c.id = q.calendar_id and c.visible
      ))
    returning 'starting'::text as kind, q.id, q.user_id, q.title, q.start_at, q.duration_min, q.xp, q.difficulty
  ),
  time_up as (
    update public.quests q
    set time_up_notified_at = now()
    from public.profiles p
    where p.id = q.user_id
      and p.notify_time_up
      and q.status = 'active'
      and q.time_up_notified_at is null
      and q.started_at + make_interval(mins => q.duration_min) <= now()
    returning 'time_up'::text, q.id, q.user_id, q.title, q.start_at, q.duration_min, q.xp, q.difficulty
  ),
  due as (
    update public.quests q
    set reminded_at = now()
    from public.profiles p
    where p.id = q.user_id
      and p.notify_deadlines
      and q.kind = 'deadline'
      and q.reminded_at is null
      and q.start_at > now()
      and q.start_at <= now() + interval '24 hours'
      and exists (select 1 from public.calendars c where c.id = q.calendar_id and c.visible)
    returning 'due'::text, q.id, q.user_id, q.title, q.start_at, q.duration_min, q.xp, q.difficulty
  ),
  all_reminders as (
    select * from starting union all select * from time_up union all select * from due
  )
  select r.kind, r.id, r.title, r.start_at, r.duration_min, r.xp, r.difficulty,
         s.endpoint, s.p256dh, s.auth, s.time_zone
  from all_reminders r
  join public.push_subscriptions s on s.user_id = r.user_id;
end;
$$;

-- Devices that have been unsubscribed or reset are removed when a send fails.
create or replace function public.forget_push_endpoint(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if p_secret is null or p_secret <> (select value from private.app_secrets where name = 'reminders') then
    raise exception 'Not allowed';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke execute on function public.claim_due_reminders(text) from public, authenticated;
revoke execute on function public.forget_push_endpoint(text, text) from public, authenticated;
grant execute on function public.claim_due_reminders(text) to anon;
grant execute on function public.forget_push_endpoint(text, text) to anon;

-- ---------- run every minute ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('questlog-reminders')
where exists (select 1 from cron.job where jobname = 'questlog-reminders');

select cron.schedule(
  'questlog-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://questlog-lake.vercel.app/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reminder-secret', (select value from private.app_secrets where name = 'reminders')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
