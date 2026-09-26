alter table public.x_trending_betslips
  add column if not exists bet_probability_pct numeric,
  add column if not exists probability_kind text,
  add column if not exists analysis_summary text,
  add column if not exists builder_ready boolean not null default false,
  add column if not exists analysis_updated_at timestamptz;

create index if not exists x_trending_betslips_builder_rank_idx
  on public.x_trending_betslips (is_active, is_pregame_confirmed, builder_ready, event_start_at, attention_score desc);

create or replace function public.parlayping_apply_trending_analysis(
  p_scheduler_secret text,
  p_rows jsonb default '[]'::jsonb,
  p_run_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_expected text;
  v_item jsonb;
  v_approved integer := 0;
begin
  v_expected := public.parlayping_get_scheduler_secret();
  if p_scheduler_secret is null
     or encode(extensions.digest(p_scheduler_secret, 'sha256'), 'hex') <> encode(extensions.digest(v_expected, 'sha256'), 'hex') then
    raise exception 'Unauthorized trending analysis publish.';
  end if;

  update public.x_trending_betslips
     set is_active = false,
         is_pregame_confirmed = false,
         event_start_at = null,
         event_label = null,
         bet_probability_pct = null,
         probability_kind = null,
         analysis_summary = null,
         builder_ready = false,
         analysis_updated_at = p_run_at
   where is_active = true;

  if jsonb_typeof(p_rows) = 'array' then
    for v_item in select value from jsonb_array_elements(p_rows) loop
      if nullif(v_item->>'tweet_id','') is null
         or nullif(v_item->>'event_start_at','') is null
         or (v_item->>'event_start_at')::timestamptz <= p_run_at + interval '1 minute'
         or coalesce((v_item->>'builder_ready')::boolean, false) is not true then
        continue;
      end if;

      update public.x_trending_betslips
         set sport = left(coalesce(nullif(v_item->>'sport',''), sport), 32),
             event_start_at = (v_item->>'event_start_at')::timestamptz,
             event_label = left(nullif(v_item->>'event_label',''), 180),
             is_pregame_confirmed = true,
             is_active = true,
             bet_probability_pct = case when nullif(v_item->>'bet_probability_pct','') is null then null else (v_item->>'bet_probability_pct')::numeric end,
             probability_kind = left(nullif(v_item->>'probability_kind',''), 80),
             analysis_summary = left(nullif(v_item->>'analysis_summary',''), 500),
             builder_ready = true,
             analysis_updated_at = p_run_at,
             metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object(
                             'pregameValidation', coalesce(v_item->'validation', '{}'::jsonb),
                             'trendingAnalysis', coalesce(v_item->'analysis', '{}'::jsonb)
                           )
       where tweet_id = v_item->>'tweet_id';
      if found then v_approved := v_approved + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'approved', v_approved, 'runAt', p_run_at);
end;
$$;

revoke all on function public.parlayping_apply_trending_analysis(text,jsonb,timestamptz) from public;
grant execute on function public.parlayping_apply_trending_analysis(text,jsonb,timestamptz) to anon, authenticated;
