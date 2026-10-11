-- ParlayPing: paid-only Developer API authorization.
-- Preserve only previously active, specifically-approved first-party/internal
-- API access; do NOT grant legacy Free access to ordinary registered users.
-- Existing customer rows, Stripe subscriptions and API keys are not deleted.

CREATE TABLE IF NOT EXISTS parlayping_internal.first_party_api_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON parlayping_internal.first_party_api_entitlements FROM PUBLIC, anon, authenticated;
ALTER TABLE parlayping_internal.first_party_api_entitlements ENABLE ROW LEVEL SECURITY;

-- At migration time the ONLY surviving internal/free user with an active
-- API key has an existing first-party entitlement. Do not blanket-approve
-- all future Free signups. Later internal grants require explicit admin SQL.
INSERT INTO parlayping_internal.first_party_api_entitlements(user_id,enabled,reason)
SELECT DISTINCT s.user_id,true,'Preserve existing first-party API integration during paid-only migration'
FROM public.subscriptions s
JOIN parlayping_internal.api_keys k ON k.user_id=s.user_id
WHERE s.provider='internal' AND s.plan_id='free' AND s.status='active'
  AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now())
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.parlayping_authenticate_api_key(
  p_api_key text,p_endpoint text,p_request_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','parlayping_internal','extensions'
AS $fn$
DECLARE
  v_key parlayping_internal.api_keys%rowtype;
  v_plan public.plans%rowtype;
  v_month_used bigint;
  v_minute_used bigint;
  v_existing bigint;
BEGIN
  IF p_api_key IS NULL OR p_api_key !~ '^pp_live_[0-9a-f]{48}$' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid-key');
  END IF;
  IF p_request_id IS NULL OR length(p_request_id)<8 OR length(p_request_id)>120 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid-request-id');
  END IF;
  IF p_endpoint IS NULL OR length(p_endpoint)<1 OR length(p_endpoint)>160 THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid-endpoint');
  END IF;

  SELECT * INTO v_key FROM parlayping_internal.api_keys
  WHERE key_hash=digest(p_api_key,'sha256') FOR UPDATE;
  IF NOT FOUND OR v_key.revoked_at IS NOT NULL
       OR (v_key.expires_at IS NOT NULL AND v_key.expires_at<=now()) THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid-key');
  END IF;

  -- Paid customers must have a real, current Stripe subscription. Expired,
  -- incomplete, unpaid, canceled and past-due subscriptions are not licensed.
  SELECT p.* INTO v_plan
  FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id
  WHERE s.user_id=v_key.user_id AND s.provider='stripe'
    AND s.provider_subscription_id IS NOT NULL
    AND s.status IN ('active','trialing') AND p.active=true
    AND p.id IN ('starter','pro','business') AND p.price_monthly_cents>0;

  IF v_plan.id IS NULL AND EXISTS (
    SELECT 1 FROM parlayping_internal.first_party_api_entitlements i
    JOIN public.subscriptions s ON s.user_id=i.user_id
    WHERE i.user_id=v_key.user_id AND i.enabled=true AND s.provider='internal'
      AND s.plan_id='free' AND s.status='active'
  ) THEN
    SELECT * INTO v_plan FROM public.plans WHERE id='free' AND active=true;
  END IF;
  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','subscription-required');
  END IF;

  -- License must be rechecked even on an idempotent replay.
  PERFORM pg_advisory_xact_lock(hashtextextended('parlayping:'||v_key.user_id::text,0));
  SELECT id INTO v_existing FROM parlayping_internal.api_usage_events
  WHERE api_key_id=v_key.id AND request_id=p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true,'userId',v_key.user_id,
      'apiKeyId',v_key.id,'plan',v_plan.id,'scopes',to_jsonb(v_key.scopes));
  END IF;

  SELECT coalesce(sum(units),0) INTO v_month_used
  FROM parlayping_internal.api_usage_events
  WHERE user_id=v_key.user_id AND occurred_at>=date_trunc('month',now());
  SELECT coalesce(sum(units),0) INTO v_minute_used
  FROM parlayping_internal.api_usage_events
  WHERE user_id=v_key.user_id AND occurred_at>=now()-interval '1 minute';

  IF v_month_used >= v_plan.monthly_request_limit THEN
    RETURN jsonb_build_object('ok',false,'reason','monthly-quota-exceeded',
      'plan',v_plan.id,'limit',v_plan.monthly_request_limit,'used',v_month_used);
  END IF;
  IF v_minute_used >= v_plan.rate_limit_per_minute THEN
    RETURN jsonb_build_object('ok',false,'reason','rate-limit-exceeded',
      'plan',v_plan.id,'limit',v_plan.rate_limit_per_minute,'used',v_minute_used);
  END IF;

  INSERT INTO parlayping_internal.api_usage_events(user_id,api_key_id,request_id,endpoint,units)
  VALUES(v_key.user_id,v_key.id,p_request_id,p_endpoint,1);
  UPDATE parlayping_internal.api_keys SET last_used_at=now() WHERE id=v_key.id;
  RETURN jsonb_build_object('ok',true,'duplicate',false,'userId',v_key.user_id,
    'apiKeyId',v_key.id,'plan',v_plan.id,'scopes',to_jsonb(v_key.scopes),
    'monthlyLimit',v_plan.monthly_request_limit,'monthlyUsed',v_month_used+1,
    'rateLimitPerMinute',v_plan.rate_limit_per_minute,'minuteUsed',v_minute_used+1);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.parlayping_service_create_api_key(
  p_user_id uuid,p_name text,p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','parlayping_internal','extensions'
AS $fn$
DECLARE
  v_plan public.plans%rowtype;
  v_count integer;
  v_id uuid:=gen_random_uuid();
  v_raw text;
  v_prefix text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User id is required.'; END IF;
  IF p_name IS NULL OR length(trim(p_name))<1 OR length(trim(p_name))>80 THEN
    RAISE EXCEPTION 'API key name must be 1-80 characters.';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at<=now() THEN
    RAISE EXCEPTION 'Expiry must be in the future.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  SELECT p.* INTO v_plan FROM public.subscriptions s
  JOIN public.plans p ON p.id=s.plan_id
  WHERE s.user_id=p_user_id AND s.provider='stripe'
    AND s.provider_subscription_id IS NOT NULL
    AND s.status IN ('active','trialing')
    AND p.active=true AND p.id IN ('starter','pro','business') AND p.price_monthly_cents>0;
  IF v_plan.id IS NULL AND EXISTS (
    SELECT 1 FROM parlayping_internal.first_party_api_entitlements i
    JOIN public.subscriptions s ON s.user_id=i.user_id
    WHERE i.user_id=p_user_id AND i.enabled=true
      AND s.provider='internal' AND s.plan_id='free' AND s.status='active'
  ) THEN
    SELECT * INTO v_plan FROM public.plans WHERE id='free' AND active=true;
  END IF;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'Active paid subscription required to create API keys.'; END IF;

  SELECT count(*) INTO v_count FROM parlayping_internal.api_keys
  WHERE user_id=p_user_id AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>now());
  IF v_count>=v_plan.max_api_keys THEN
    RAISE EXCEPTION 'API key limit reached for plan %.',v_plan.id;
  END IF;
  v_raw:='pp_live_'||encode(gen_random_bytes(24),'hex');
  v_prefix:=left(v_raw,16);
  INSERT INTO parlayping_internal.api_keys(id,user_id,name,key_prefix,key_hash,expires_at)
  VALUES(v_id,p_user_id,trim(p_name),v_prefix,digest(v_raw,'sha256'),p_expires_at);
  INSERT INTO parlayping_internal.audit_events(user_id,actor_type,action,entity_type,entity_id,metadata)
  VALUES(p_user_id,'user','api_key.created','api_key',v_id::text,
    jsonb_build_object('name',trim(p_name),'prefix',v_prefix));
  RETURN jsonb_build_object('id',v_id,'name',trim(p_name),'key',v_raw,
    'prefix',v_prefix,'expiresAt',p_expires_at,'createdAt',now());
END;
$fn$;

CREATE OR REPLACE FUNCTION public.parlayping_service_usage_summary(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','parlayping_internal'
AS $fn$
DECLARE
  v_plan public.plans%rowtype;
  v_used bigint;
  v_keys bigint;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User id is required.'; END IF;
  SELECT p.* INTO v_plan FROM public.subscriptions s
  JOIN public.plans p ON p.id=s.plan_id
  WHERE s.user_id=p_user_id AND s.provider='stripe'
    AND s.provider_subscription_id IS NOT NULL
    AND s.status IN ('active','trialing')
    AND p.active=true AND p.id IN ('starter','pro','business') AND p.price_monthly_cents>0;
  IF v_plan.id IS NULL AND EXISTS (
    SELECT 1 FROM parlayping_internal.first_party_api_entitlements i
    JOIN public.subscriptions s ON s.user_id=i.user_id
    WHERE i.user_id=p_user_id AND i.enabled=true
      AND s.provider='internal' AND s.plan_id='free' AND s.status='active'
  ) THEN
    SELECT * INTO v_plan FROM public.plans WHERE id='free' AND active=true;
  END IF;

  SELECT coalesce(sum(units),0) INTO v_used FROM parlayping_internal.api_usage_events
  WHERE user_id=p_user_id AND occurred_at>=date_trunc('month',now());
  SELECT count(*) INTO v_keys FROM parlayping_internal.api_keys
  WHERE user_id=p_user_id AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>now());
  RETURN jsonb_build_object('plan',coalesce(v_plan.id,'none'),
    'monthlyUsed',v_used,'monthlyLimit',coalesce(v_plan.monthly_request_limit,0),
    'rateLimitPerMinute',coalesce(v_plan.rate_limit_per_minute,0),
    'activeApiKeys',v_keys,'maxApiKeys',coalesce(v_plan.max_api_keys,0),
    'periodStart',date_trunc('month',now()),
    'periodEnd',date_trunc('month',now())+interval '1 month');
END;
$fn$;

-- Keep the preexisting direct legacy key-creation RPC inaccessible to
-- unauthenticated/authenticated browser roles.
REVOKE ALL ON FUNCTION public.parlayping_create_api_key(text,timestamptz)
  FROM PUBLIC,anon,authenticated;
