-- ParlayPing community parlays schema.
-- Mirrors the live Supabase project migration applied 2026-09-24.

create table if not exists public.community_parlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  share_token text not null,
  builder_url text not null,
  title text not null default 'Community Parlay',
  author_name text not null default 'ParlayPing User',
  x_username text,
  sport text,
  leg_count smallint not null,
  legs jsonb not null,
  sportsbook text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_parlays_user_share_unique unique (user_id, share_token),
  constraint community_parlays_title_length check (char_length(title) between 1 and 120),
  constraint community_parlays_author_length check (char_length(author_name) between 1 and 80),
  constraint community_parlays_x_length check (x_username is null or char_length(x_username) <= 50),
  constraint community_parlays_leg_count check (leg_count between 1 and 25),
  constraint community_parlays_legs_array check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 25),
  constraint community_parlays_builder_url check (builder_url ~ '^https://parlayping\.net/build/')
);

alter table public.community_parlays enable row level security;

revoke all on table public.community_parlays from anon, authenticated;
grant select (id, share_token, builder_url, title, author_name, x_username, sport, leg_count, legs, sportsbook, is_active, created_at, updated_at)
  on table public.community_parlays to anon, authenticated;
-- Authenticated owner filtering/upserts use user_id internally. Keep it hidden from anon.
grant select (user_id) on table public.community_parlays to authenticated;
grant insert, update, delete on table public.community_parlays to authenticated;

create policy "community parlays are publicly readable"
on public.community_parlays
for select
to anon, authenticated
using (is_active = true or (select auth.uid()) = user_id);

create policy "users can post own community parlays"
on public.community_parlays
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users can update own community parlays"
on public.community_parlays
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users can delete own community parlays"
on public.community_parlays
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists community_parlays_created_at_idx
  on public.community_parlays (created_at desc)
  where is_active = true;

create index if not exists community_parlays_sport_idx
  on public.community_parlays (sport, created_at desc)
  where is_active = true;
