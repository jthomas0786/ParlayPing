-- ParlayPing community growth loop
-- Founding 100 badges, referral attribution, invite counts and verified-contributor awards.

create table if not exists public.member_badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  founding_number smallint unique,
  invite_count integer not null default 0,
  verified_submission_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_badges_referral_code_format check (referral_code ~ '^[A-Z0-9][A-Z0-9_-]{1,23}$'),
  constraint member_badges_founding_range check (founding_number is null or founding_number between 1 and 100),
  constraint member_badges_invite_count_nonnegative check (invite_count >= 0),
  constraint member_badges_verified_count_nonnegative check (verified_submission_count >= 0)
);

alter table public.member_badges enable row level security;
grant select on public.member_badges to anon, authenticated;
revoke insert, update, delete on public.member_badges from anon, authenticated;
drop policy if exists "member badges are publicly readable" on public.member_badges;
create policy "member badges are publicly readable"
on public.member_badges for select
to anon, authenticated
using (true);

create table if not exists public.member_referrals (
  referred_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referral_code_used text not null,
  created_at timestamptz not null default now(),
  constraint member_referrals_no_self check (referred_user_id <> referrer_user_id)
);

alter table public.member_referrals enable row level security;
revoke all on public.member_referrals from anon;
revoke select, update, delete on public.member_referrals from authenticated;
grant insert (referred_user_id, referral_code_used) on public.member_referrals to authenticated;
drop policy if exists "users can claim one referral for themselves" on public.member_referrals;
create policy "users can claim one referral for themselves"
on public.member_referrals for insert
to authenticated
with check ((select auth.uid()) = referred_user_id);

create table if not exists parlayping_internal.growth_counters (
  counter_key text primary key,
  counter_value integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint growth_counters_nonnegative check (counter_value >= 0)
);
insert into parlayping_internal.growth_counters(counter_key,counter_value)
values ('founding_member',0)
on conflict (counter_key) do nothing;

create or replace function parlayping_internal.resolve_referral_claim()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, parlayping_internal
as $$
declare
  v_referrer uuid;
begin
  new.referral_code_used := upper(trim(new.referral_code_used));
  select b.user_id into v_referrer
  from public.member_badges b
  where b.referral_code = new.referral_code_used;

  if v_referrer is null then
    raise exception using errcode='23514', message='Unknown referral code.';
  end if;
  if v_referrer = new.referred_user_id then
    raise exception using errcode='23514', message='You cannot refer yourself.';
  end if;

  new.referrer_user_id := v_referrer;
  return new;
end;
$$;
revoke all on function parlayping_internal.resolve_referral_claim() from public, anon, authenticated;

drop trigger if exists member_referrals_resolve on public.member_referrals;
create trigger member_referrals_resolve
before insert on public.member_referrals
for each row execute function parlayping_internal.resolve_referral_claim();

create or replace function parlayping_internal.count_referral_claim()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, parlayping_internal
as $$
begin
  update public.member_badges
  set invite_count = invite_count + 1,
      updated_at = now()
  where user_id = new.referrer_user_id;
  return new;
end;
$$;
revoke all on function parlayping_internal.count_referral_claim() from public, anon, authenticated;

drop trigger if exists member_referrals_count on public.member_referrals;
create trigger member_referrals_count
after insert on public.member_referrals
for each row execute function parlayping_internal.count_referral_claim();

create or replace function parlayping_internal.award_verified_contributor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, parlayping_internal
as $$
declare
  v_number integer;
  v_current smallint;
begin
  if new.verified_pregame is not true then return new; end if;
  if tg_op = 'UPDATE' and old.verified_pregame is true then return new; end if;

  insert into public.member_badges(user_id, referral_code)
  values (new.user_id, 'PP' || upper(substr(replace(new.user_id::text,'-',''),1,8)))
  on conflict (user_id) do nothing;

  update public.member_badges
  set verified_submission_count = verified_submission_count + 1,
      updated_at = now()
  where user_id = new.user_id
  returning founding_number into v_current;

  if v_current is null then
    update parlayping_internal.growth_counters
    set counter_value = counter_value + 1,
        updated_at = now()
    where counter_key = 'founding_member' and counter_value < 100
    returning counter_value into v_number;

    if v_number is not null then
      update public.member_badges
      set founding_number = v_number,
          updated_at = now()
      where user_id = new.user_id and founding_number is null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function parlayping_internal.award_verified_contributor() from public, anon, authenticated;

drop trigger if exists community_parlays_award_contributor on public.community_parlays;
create trigger community_parlays_award_contributor
after insert or update of verified_pregame on public.community_parlays
for each row execute function parlayping_internal.award_verified_contributor();

insert into public.member_badges(user_id, referral_code)
select p.id, 'PP' || upper(substr(replace(p.id::text,'-',''),1,8))
from public.profiles p
on conflict (user_id) do nothing;

-- The existing ParlayPing owner/community account permanently occupies #001.
-- This identifies it by the public profile/community state rather than hardcoding an auth UUID.
with owner_account as (
  select p.id
  from public.profiles p
  where lower(coalesce(p.x_username,''))='parlayping'
    and exists (select 1 from public.community_parlays cp where cp.user_id=p.id)
  order by p.created_at asc
  limit 1
)
update public.member_badges b
set founding_number=1,
    referral_code='JT',
    updated_at=now()
where b.user_id=(select id from owner_account)
  and (b.founding_number is null or b.founding_number=1);

update parlayping_internal.growth_counters
set counter_value=greatest(counter_value,1),updated_at=now()
where counter_key='founding_member'
  and exists(select 1 from public.member_badges where founding_number=1);

-- New auth users always receive a safe public referral code. An optional referral
-- code in auth metadata is attribution only; it is never used for authorization.
create or replace function public.parlayping_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, parlayping_internal
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.subscriptions(user_id, plan_id, status, provider)
  values (new.id, 'free', 'active', 'internal')
  on conflict (user_id) do nothing;

  insert into public.member_badges(user_id, referral_code)
  values (new.id, 'PP' || upper(substr(replace(new.id::text,'-',''),1,8)))
  on conflict (user_id) do nothing;

  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code','')));
  if v_code <> '' then
    select b.user_id into v_referrer
    from public.member_badges b
    where b.referral_code = v_code;
    if v_referrer is not null and v_referrer <> new.id then
      insert into public.member_referrals(referred_user_id, referrer_user_id, referral_code_used)
      values (new.id, v_referrer, v_code)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;

  insert into parlayping_internal.audit_events(user_id, actor_type, action, entity_type, entity_id)
  values (new.id, 'system', 'account.created', 'user', new.id::text);
  return new;
end;
$$;
revoke execute on function public.parlayping_handle_new_user() from public, anon, authenticated;
