-- Narrow protected internal records to explicitly approved first-party grants.
-- New ordinary signups receive a legacy internal/free row automatically; those
-- MUST remain eligible to purchase paid subscriptions.
CREATE OR REPLACE FUNCTION public.parlayping_stripe_apply_subscription_event(
  p_event_id text,
  p_user_id uuid,
  p_plan_id text,
  p_status text,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text DEFAULT NULL,
  p_period_start timestamptz DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL,
  p_cancel_at_period_end boolean DEFAULT false,
  p_checkout_session_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','parlayping_internal'
AS $fn$
DECLARE
  v_event parlayping_internal.stripe_webhook_events%rowtype;
  v_existing public.subscriptions%rowtype;
  v_event_at timestamptz;
BEGIN
  SELECT * INTO v_event FROM parlayping_internal.stripe_webhook_events
   WHERE event_id=p_event_id AND status='received';
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe event not claimed or already completed'; END IF;
  IF v_event.event_type NOT IN (
    'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'
  ) THEN RAISE EXCEPTION 'Unsupported subscription event type'; END IF;
  IF v_event.event_type='customer.subscription.deleted' AND p_status<>'canceled' THEN
    RAISE EXCEPTION 'Deletion event must revoke subscription';
  END IF;
  IF p_user_id IS NULL OR p_subscription_id IS NULL
    OR p_subscription_id !~ '^sub_[A-Za-z0-9_-]{5,200}$'
    OR p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9_-]{5,200}$'
    OR p_price_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Stripe subscription identity';
  END IF;
  IF p_status NOT IN (
    'active','trialing','past_due','canceled','paused','incomplete','incomplete_expired','unpaid'
  ) THEN RAISE EXCEPTION 'Invalid Stripe subscription status'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.plans
    WHERE id=p_plan_id AND active=true AND stripe_price_id=p_price_id
      AND id IN ('starter','pro','business')
  ) THEN RAISE EXCEPTION 'Unrecognized plan/price combination'; END IF;

  -- A user has a single licensed API subscription row. Serialize writes
  -- and reject stale status changes rather than resurrecting canceled access.
  PERFORM pg_advisory_xact_lock(hashtextextended('pp-stripe:'||p_user_id::text,0));
  v_event_at=coalesce(v_event.stripe_created_at,v_event.received_at);
  SELECT * INTO v_existing FROM public.subscriptions
    WHERE user_id=p_user_id FOR UPDATE;

  IF FOUND THEN
    -- TSO first-party licenses can never be overwritten by Stripe sandbox data.
    IF v_existing.provider='internal' AND v_existing.status='active'
       AND EXISTS (SELECT 1 FROM parlayping_internal.first_party_api_entitlements t
                   WHERE t.user_id=p_user_id AND t.enabled=true) THEN
      RETURN false;
    END IF;

    -- A delayed event from an earlier subscription must not alter a newer
    -- active subscription for the same user.
    IF v_existing.provider='stripe'
       AND v_existing.provider_subscription_id IS DISTINCT FROM p_subscription_id THEN
      IF v_existing.status IN ('active','trialing','past_due','unpaid','paused','incomplete') THEN
        RETURN false;
      END IF;
      IF v_event.event_type='customer.subscription.deleted' THEN RETURN false; END IF;
    END IF;

    IF v_existing.stripe_last_event_created_at IS NOT NULL THEN
      IF v_event_at<v_existing.stripe_last_event_created_at THEN RETURN false; END IF;
      IF v_existing.provider_subscription_id=p_subscription_id
         AND v_existing.status='canceled' AND p_status<>'canceled' THEN RETURN false; END IF;
      -- Multiple events can share Stripe's one-second timestamp: do not allow
      -- an entitlement-granting status to overwrite a same-second denial.
      IF v_event_at=v_existing.stripe_last_event_created_at
         AND v_existing.provider_subscription_id=p_subscription_id
         AND v_existing.status IN ('past_due','canceled','unpaid','paused','incomplete','incomplete_expired')
         AND p_status IN ('active','trialing') THEN RETURN false; END IF;
    END IF;
  END IF;

  INSERT INTO public.subscriptions (
    user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,
    provider_price_id,current_period_start,current_period_end,cancel_at_period_end,
    checkout_session_id,stripe_last_event_created_at,stripe_last_event_id,
    stripe_last_event_type,updated_at
  ) VALUES (
    p_user_id,p_plan_id,p_status,'stripe',p_customer_id,p_subscription_id,
    p_price_id,coalesce(p_period_start,now()),p_period_end,
    coalesce(p_cancel_at_period_end,false),p_checkout_session_id,
    v_event_at,p_event_id,v_event.event_type,clock_timestamp()
  )
  ON CONFLICT(user_id) DO UPDATE SET
    plan_id=excluded.plan_id,
    status=excluded.status,
    provider=excluded.provider,
    provider_customer_id=excluded.provider_customer_id,
    provider_subscription_id=excluded.provider_subscription_id,
    provider_price_id=excluded.provider_price_id,
    current_period_start=excluded.current_period_start,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    checkout_session_id=coalesce(excluded.checkout_session_id,public.subscriptions.checkout_session_id),
    stripe_last_event_created_at=excluded.stripe_last_event_created_at,
    stripe_last_event_id=excluded.stripe_last_event_id,
    stripe_last_event_type=excluded.stripe_last_event_type,
    updated_at=clock_timestamp();
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.parlayping_stripe_apply_subscription_event(text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.parlayping_stripe_apply_subscription_event(text,uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,text) TO service_role;
