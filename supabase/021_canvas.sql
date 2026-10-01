-- Canvas: your marks and each assignment's real weighting, read with a Canvas access token.
-- The token is encrypted by the server (INTEGRATION_SECRET) before it's stored.
-- Run this once in Supabase dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.canvas_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  base_url text not null check (base_url ~ '^https://[a-z0-9.-]+$'),
  token_cipher text not null,     -- AES-GCM, only the server can decrypt it
  account_name text,
  created_at timestamptz not null default now()
);

alter table public.canvas_connections enable row level security;

drop policy if exists "Users manage own Canvas connection" on public.canvas_connections;
create policy "Users manage own Canvas connection" on public.canvas_connections
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
