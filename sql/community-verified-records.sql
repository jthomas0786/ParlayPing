-- Public Community records are read-only to clients. Grading writes only happen through scheduler-secret RPCs.
grant select on public.community_parlays to anon, authenticated;

create table if not exists public.community_results (
  community_parlay_id uuid primary key references public.community_parlays(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  result_status text not null default 'PENDING',
  result_summary text,
  graded_legs jsonb not null default '[]'::jsonb,
  last_attempt_at timestamptz,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_results_status_check check (result_status in ('PENDING','LIVE','WON','LOST','PUSH','VOID','UNRESOLVED'))
);

alter table public.community_results enable row level security;
grant select on public.community_results to anon, authenticated;
revoke insert, update, delete on public.community_results from anon, authenticated;
drop policy if exists "community results are publicly readable" on public.community_results;
create policy "community results are publicly readable" on public.community_results for select to anon, authenticated using (true);

create index if not exists community_results_user_status_idx on public.community_results(user_id, result_status);
create index if not exists community_results_attempt_idx on public.community_results(last_attempt_at) where result_status in ('PENDING','LIVE','UNRESOLVED');

alter table public.member_badges
  add column if not exists settled_submission_count integer not null default 0,
  add column if not exists win_count integer not null default 0,
  add column if not exists loss_count integer not null default 0,
  add column if not exists push_count integer not null default 0,
  add column if not exists void_count integer not null default 0;

alter table public.member_badges drop constraint if exists member_badges_settled_nonnegative;
alter table public.member_badges add constraint member_badges_settled_nonnegative check (settled_submission_count >= 0);
alter table public.member_badges drop constraint if exists member_badges_win_nonnegative;
alter table public.member_badges add constraint member_badges_win_nonnegative check (win_count >= 0);
alter table public.member_badges drop constraint if exists member_badges_loss_nonnegative;
alter table public.member_badges add constraint member_badges_loss_nonnegative check (loss_count >= 0);
alter table public.member_badges drop constraint if exists member_badges_push_nonnegative;
alter table public.member_badges add constraint member_badges_push_nonnegative check (push_count >= 0);
alter table public.member_badges drop constraint if exists member_badges_void_nonnegative;
alter table public.member_badges add constraint member_badges_void_nonnegative check (void_count >= 0);

create or replace view public.community_public_posts with (security_invoker=true) as
select c.id,c.user_id,c.share_token,c.builder_url,c.title,c.author_name,c.x_username,c.sport,c.leg_count,c.legs,c.sportsbook,c.is_active,c.created_at,c.updated_at,c.verified_pregame,c.source_url,c.bet_probability_pct,c.analysis_summary,
       coalesce(r.result_status,'PENDING') as result_status,r.result_summary,r.graded_at,r.updated_at as result_updated_at
from public.community_parlays c left join public.community_results r on r.community_parlay_id=c.id;
grant select on public.community_public_posts to anon, authenticated;

create or replace view public.community_leaderboard with (security_invoker=true) as
select b.user_id,b.referral_code,b.founding_number,b.invite_count,b.verified_submission_count,b.settled_submission_count,b.win_count,b.loss_count,b.push_count,b.void_count,
       case when b.win_count+b.loss_count>0 then round((b.win_count::numeric/(b.win_count+b.loss_count))*100,1) else null end as win_rate_pct,
       latest.author_name,latest.x_username,latest.builder_url as latest_builder_url,latest.created_at as latest_submission_at
from public.member_badges b
left join lateral (
  select c.author_name,c.x_username,c.builder_url,c.created_at
  from public.community_parlays c
  where c.user_id=b.user_id and c.is_active=true and c.verified_pregame=true
  order by c.created_at desc limit 1
) latest on true
where b.verified_submission_count>0;
grant select on public.community_leaderboard to anon, authenticated;

create or replace function public.parlayping_community_grade_candidates(p_scheduler_secret text,p_limit integer default 8,p_run_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_expected text;v_result jsonb;
begin
  v_expected:=public.parlayping_get_scheduler_secret();
  if p_scheduler_secret is null or encode(extensions.digest(p_scheduler_secret,'sha256'),'hex')<>encode(extensions.digest(v_expected,'sha256'),'hex') then raise exception 'Unauthorized community grade read.'; end if;
  with picked as (
    select c.id from public.community_parlays c left join public.community_results r on r.community_parlay_id=c.id
    where c.verified_pregame=true and c.is_active=true and coalesce(r.result_status,'PENDING') in ('PENDING','LIVE','UNRESOLVED')
      and (r.last_attempt_at is null or r.last_attempt_at<=p_run_at-interval '8 minutes')
    order by coalesce(r.last_attempt_at,'epoch'::timestamptz),c.created_at
    limit greatest(1,least(coalesce(p_limit,8),16)) for update of c skip locked
  ), touched as (
    insert into public.community_results(community_parlay_id,user_id,result_status,last_attempt_at,updated_at)
    select c.id,c.user_id,'PENDING',p_run_at,p_run_at from public.community_parlays c join picked p on p.id=c.id
    on conflict (community_parlay_id) do update set last_attempt_at=excluded.last_attempt_at,updated_at=excluded.updated_at
    returning community_parlay_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'user_id',c.user_id,'title',c.title,'sport',c.sport,'legs',c.legs,'created_at',c.created_at) order by c.created_at),'[]'::jsonb)
  into v_result from public.community_parlays c join touched t on t.community_parlay_id=c.id;
  return v_result;
end;$$;
revoke all on function public.parlayping_community_grade_candidates(text,integer,timestamptz) from public, authenticated;
grant execute on function public.parlayping_community_grade_candidates(text,integer,timestamptz) to anon;

create or replace function public.parlayping_apply_community_grades(p_scheduler_secret text,p_rows jsonb default '[]'::jsonb,p_run_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_expected text;v_item jsonb;v_status text;v_updated integer:=0;
begin
  v_expected:=public.parlayping_get_scheduler_secret();
  if p_scheduler_secret is null or encode(extensions.digest(p_scheduler_secret,'sha256'),'hex')<>encode(extensions.digest(v_expected,'sha256'),'hex') then raise exception 'Unauthorized community grade publish.'; end if;
  if jsonb_typeof(p_rows)='array' then
    for v_item in select value from jsonb_array_elements(p_rows) loop
      v_status:=upper(coalesce(nullif(v_item->>'result_status',''),'UNRESOLVED'));
      if v_status not in ('PENDING','LIVE','WON','LOST','PUSH','VOID','UNRESOLVED') then v_status:='UNRESOLVED'; end if;
      update public.community_results r set result_status=v_status,result_summary=left(nullif(v_item->>'result_summary',''),500),
        graded_legs=case when jsonb_typeof(v_item->'legs')='array' then v_item->'legs' else r.graded_legs end,
        graded_at=case when v_status in ('WON','LOST','PUSH','VOID') then coalesce(r.graded_at,p_run_at) else null end,
        last_attempt_at=p_run_at,updated_at=p_run_at
      from public.community_parlays c where r.community_parlay_id=c.id and r.community_parlay_id=(v_item->>'id')::uuid and c.verified_pregame=true;
      if found then v_updated:=v_updated+1; end if;
    end loop;
  end if;
  update public.member_badges b set settled_submission_count=s.settled_count,win_count=s.win_count,loss_count=s.loss_count,push_count=s.push_count,void_count=s.void_count,updated_at=p_run_at
  from (
    select c.user_id,count(*) filter(where r.result_status in ('WON','LOST','PUSH','VOID'))::integer settled_count,
      count(*) filter(where r.result_status='WON')::integer win_count,count(*) filter(where r.result_status='LOST')::integer loss_count,
      count(*) filter(where r.result_status='PUSH')::integer push_count,count(*) filter(where r.result_status='VOID')::integer void_count
    from public.community_parlays c join public.community_results r on r.community_parlay_id=c.id where c.verified_pregame=true group by c.user_id
  ) s where b.user_id=s.user_id;
  return jsonb_build_object('ok',true,'updated',v_updated,'runAt',p_run_at);
end;$$;
revoke all on function public.parlayping_apply_community_grades(text,jsonb,timestamptz) from public, authenticated;
grant execute on function public.parlayping_apply_community_grades(text,jsonb,timestamptz) to anon;

-- Scheduler: refresh public Community records without consuming X API credits.
do $$ declare v_jobid bigint; begin select jobid into v_jobid from cron.job where jobname='parlayping-community-grade' limit 1; if v_jobid is not null then perform cron.unschedule(v_jobid); end if; end $$;
select cron.schedule('parlayping-community-grade','*/5 * * * *',$cron$
  select net.http_post(
    url:='https://www.parlayping.net/api/community-grade-worker',
    headers:=jsonb_build_object('Content-Type','application/json','x-parlayping-scheduler-secret',public.parlayping_get_scheduler_secret()),
    body:=jsonb_build_object('source','supabase-cron-community-grade','requestedAt',now()),
    timeout_milliseconds:=50000
  ) as request_id;
$cron$);
