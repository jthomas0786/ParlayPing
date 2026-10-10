-- Private schema migration proposal. NOT DEPLOYED.
-- Partner licenses require an authenticated owner-approved grant.
create schema if not exists parlayping_internal;
create table if not exists parlayping_internal.partner_applications (
 id uuid primary key default gen_random_uuid(),
 applicant_user_id uuid not null references auth.users(id) on delete cascade,
 website_domain text not null,
 promotion_plan text not null,
 status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists parlayping_internal.partner_grants (
 id uuid primary key default gen_random_uuid(),
 application_id uuid unique references parlayping_internal.partner_applications(id),
 licensee_user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'approved' check(status in ('approved','suspended','revoked','expired')),
 monthly_request_limit integer not null default 10000 check(monthly_request_limit>0),
 rate_limit_per_minute integer not null default 120 check(rate_limit_per_minute>0),
 max_api_keys integer not null default 3 check(max_api_keys between 1 and 50),
 custom_branding_approved boolean not null default false,
 expires_at timestamptz not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 check(expires_at>approved_at)
);
create table if not exists parlayping_internal.partner_audit (
 id bigint generated always as identity primary key,
 partner_grant_id uuid references parlayping_internal.partner_grants(id),
 actor_user_id uuid not null references auth.users(id),
 event_name text not null,
 previous_state jsonb,
 current_state jsonb,
 recorded_at timestamptz not null default now()
);
alter table parlayping_internal.partner_applications enable row level security;
alter table parlayping_internal.partner_grants enable row level security;
alter table parlayping_internal.partner_audit enable row level security;
-- There are deliberately no policies allowing public write access.
-- Deploy only after reviewing current grants on the private schema.
