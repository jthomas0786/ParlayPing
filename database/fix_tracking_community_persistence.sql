-- Production hotfix applied to ParlayPing Supabase on 2026-09-24.
-- Fixes valid ParlayPing build URLs being rejected by tracking/community writes
-- and allows authenticated Community owner filtering/upserts without exposing user_id to anon.

alter table public.tracked_parlays
  drop constraint if exists tracked_parlays_builder_url_check;

alter table public.tracked_parlays
  add constraint tracked_parlays_builder_url_check
  check (builder_url ~ '^https://parlayping\.net/build/');

alter table public.community_parlays
  drop constraint if exists community_parlays_builder_url;

alter table public.community_parlays
  add constraint community_parlays_builder_url
  check (builder_url ~ '^https://parlayping\.net/build/');

grant select (user_id) on table public.community_parlays to authenticated;
