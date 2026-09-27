-- Community engagement counters for verified public builds.
-- Counts one Tail and one Modify action per browser/client key for each build.

alter table public.community_parlays
  add column if not exists tail_count integer not null default 0,
  add column if not exists modify_count integer not null default 0;

alter table public.community_parlays drop constraint if exists community_parlays_tail_count_nonnegative;
alter table public.community_parlays add constraint community_parlays_tail_count_nonnegative check (tail_count >= 0);
alter table public.community_parlays drop constraint if exists community_parlays_modify_count_nonnegative;
alter table public.community_parlays add constraint community_parlays_modify_count_nonnegative check (modify_count >= 0);

create table if not exists public.community_engagement_events (
  id bigint generated always as identity primary key,
  community_parlay_id uuid not null references public.community_parlays(id) on delete cascade,
  action text not null,
  client_key text not null,
  created_at timestamptz not null default now(),
  constraint community_engagement_action_check check (action in ('tail','modify')),
  constraint community_engagement_client_key_check check (client_key ~ '^[A-Za-z0-9_-]{8,80}$'),
  constraint community_engagement_once_per_client unique (community_parlay_id, action, client_key)
);

alter table public.community_engagement_events enable row level security;
revoke all on public.community_engagement_events from anon, authenticated;
create index if not exists community_engagement_parlay_action_idx on public.community_engagement_events(community_parlay_id, action);

create or replace function public.parlayping_record_community_engagement(
  p_parlay_id uuid,
  p_action text,
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action text := lower(trim(coalesce(p_action,'')));
  v_key text := trim(coalesce(p_client_key,''));
  v_inserted bigint;
  v_tail integer;
  v_modify integer;
begin
  if v_action not in ('tail','modify') then
    raise exception using errcode='22023', message='Unsupported engagement action.';
  end if;
  if v_key !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception using errcode='22023', message='Invalid engagement client key.';
  end if;
  if not exists (
    select 1 from public.community_parlays
    where id=p_parlay_id and is_active=true and verified_pregame=true
  ) then
    raise exception using errcode='P0002', message='Community build not found.';
  end if;

  insert into public.community_engagement_events(community_parlay_id, action, client_key)
  values (p_parlay_id, v_action, v_key)
  on conflict (community_parlay_id, action, client_key) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    if v_action='tail' then
      update public.community_parlays set tail_count=tail_count+1, updated_at=now() where id=p_parlay_id;
    else
      update public.community_parlays set modify_count=modify_count+1, updated_at=now() where id=p_parlay_id;
    end if;
  end if;

  select tail_count, modify_count into v_tail, v_modify
  from public.community_parlays where id=p_parlay_id;

  return jsonb_build_object('ok',true,'counted',v_inserted is not null,'tail_count',v_tail,'modify_count',v_modify);
end;
$$;
revoke all on function public.parlayping_record_community_engagement(uuid,text,text) from public;
grant execute on function public.parlayping_record_community_engagement(uuid,text,text) to anon, authenticated;

create or replace view public.community_public_posts with (security_invoker=true) as
select c.id,c.user_id,c.share_token,c.builder_url,c.title,c.author_name,c.x_username,c.sport,c.leg_count,c.legs,c.sportsbook,c.is_active,c.created_at,c.updated_at,c.verified_pregame,c.source_url,c.bet_probability_pct,c.analysis_summary,
       coalesce(r.result_status,'PENDING') as result_status,r.result_summary,r.graded_at,r.updated_at as result_updated_at,
       c.tail_count,c.modify_count
from public.community_parlays c left join public.community_results r on r.community_parlay_id=c.id;
grant select on public.community_public_posts to anon, authenticated;
