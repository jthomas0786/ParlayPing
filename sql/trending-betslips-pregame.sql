alter table public.x_trending_betslips
  add column if not exists event_start_at timestamptz,
  add column if not exists event_label text,
  add column if not exists is_pregame_confirmed boolean not null default false;

create index if not exists x_trending_betslips_pregame_idx
  on public.x_trending_betslips (is_active, is_pregame_confirmed, event_start_at, attention_score desc);

create or replace function public.parlayping_apply_trending_pregame(
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
    raise exception 'Unauthorized trending pregame publish.';
  end if;

  update public.x_trending_betslips
     set is_active = false,
         is_pregame_confirmed = false,
         event_start_at = null,
         event_label = null
   where is_active = true;

  if jsonb_typeof(p_rows) = 'array' then
    for v_item in select value from jsonb_array_elements(p_rows) loop
      if nullif(v_item->>'tweet_id','') is null
         or nullif(v_item->>'event_start_at','') is null
         or (v_item->>'event_start_at')::timestamptz <= p_run_at + interval '1 minute' then
        continue;
      end if;

      update public.x_trending_betslips
         set sport = left(coalesce(nullif(v_item->>'sport',''), sport), 32),
             event_start_at = (v_item->>'event_start_at')::timestamptz,
             event_label = left(nullif(v_item->>'event_label',''), 180),
             is_pregame_confirmed = true,
             is_active = true,
             metadata = coalesce(metadata, '{}'::jsonb)
                        || jsonb_build_object('pregameValidation', coalesce(v_item->'validation', '{}'::jsonb))
       where tweet_id = v_item->>'tweet_id';

      if found then
        v_approved := v_approved + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'approved', v_approved,
    'runAt', p_run_at
  );
end;
$$;

revoke all on function public.parlayping_apply_trending_pregame(text,jsonb,timestamptz) from public;
grant execute on function public.parlayping_apply_trending_pregame(text,jsonb,timestamptz) to anon, authenticated;
