-- Stage 1: user profiles.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  total_xp integer not null default 0,
  daily_xp_goal integer not null default 300,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Each user can only see and edit their own profile (leaderboard access comes in Stage 6).
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- Automatically create a profile row when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
