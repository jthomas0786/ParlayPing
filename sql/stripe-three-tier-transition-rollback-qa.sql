-- ParlayPing three-tier Stripe event transition QA.
-- Entire scenario runs inside an explicit transaction and is always ROLLED BACK.
-- Select only a previously canceled Stripe QA row (never a protected internal license).
-- No permanent customer, subscription, key, or webhook data is created.
BEGIN;
SET LOCAL statement_timeout = '25s';

DO $pp_qa$
DECLARE
  v_user uuid;
  v_before public.subscriptions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_newsub text := 'sub_ppqa_rehearsal_20261011';
  v_customer text := 'cus_ppqa_rehearsal_20261011';
  v_received boolean;
  v_result boolean;
  v_check public.subscriptions%ROWTYPE;
  v_event text;
  v_kind text;
  v_price text;
  v_plan text;
  v_i integer;
  v_plans text[] := ARRAY['starter','pro','business'];
  v_prices text[] := ARRAY[
    'price_1UPC14LJU3n7oe0PWXlzXBDx',
    'price_1UPC1CLJU3n7oe0PnBVQIZd0',
    'price_1UPC1HLJU3n7oe0Pm1WkA86y'
  ];
BEGIN
  SELECT * INTO v_before
  FROM public.subscriptions
  WHERE provider='stripe' AND status='canceled'
  AND EXISTS (SELECT 1 FROM auth.users WHERE id=public.subscriptions.user_id)
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No eligible canceled Stripe QA record exists; no test was performed';
  END IF;
  v_user := v_before.user_id;
  IF EXISTS (
    SELECT 1 FROM parlayping_internal.first_party_api_entitlements
    WHERE user_id=v_user AND enabled=true
  ) THEN RAISE EXCEPTION 'Refusing to touch a protected first-party entitlement'; END IF;

  FOR v_i IN 1..3 LOOP
    v_event := 'evt_ppqa_three_tier_'||v_i;
    v_kind := CASE WHEN v_i=1 THEN 'customer.subscription.created' ELSE 'customer.subscription.updated' END;
    v_plan := v_plans[v_i];
    v_price := v_prices[v_i];
    v_received := public.parlayping_stripe_claim_event(
      v_event,v_kind,v_now+(v_i||' seconds')::interval
    );
    IF v_received IS DISTINCT FROM true THEN RAISE EXCEPTION 'Event claim failed at plan %',v_plan; END IF;
    v_result := public.parlayping_stripe_apply_subscription_event(
      v_event,v_user,v_plan,'active',v_customer,v_newsub,v_price,
      v_now,v_now+interval '1 month',false,NULL
    );
    SELECT * INTO v_check FROM public.subscriptions WHERE user_id=v_user;
    IF v_result IS DISTINCT FROM true OR v_check.plan_id IS DISTINCT FROM v_plan
      OR v_check.status IS DISTINCT FROM 'active' OR v_check.provider_price_id IS DISTINCT FROM v_price THEN
      RAISE EXCEPTION 'Plan upgrade failed at %',v_plan;
    END IF;
    RAISE NOTICE 'PASS: % subscription applies matched Stripe price',v_plan;
  END LOOP;

  v_event := 'evt_ppqa_three_tier_cancel_schedule';
  v_received := public.parlayping_stripe_claim_event(
    v_event,'customer.subscription.updated',v_now+interval '4 seconds'
  );
  v_result := public.parlayping_stripe_apply_subscription_event(
    v_event,v_user,'business','active',v_customer,v_newsub,v_prices[3],
    v_now,v_now+interval '1 month',true,NULL
  );
  SELECT * INTO v_check FROM public.subscriptions WHERE user_id=v_user;
  IF v_received IS DISTINCT FROM true OR v_result IS DISTINCT FROM true
    OR v_check.status IS DISTINCT FROM 'active' OR v_check.cancel_at_period_end IS DISTINCT FROM true
    OR v_check.plan_id IS DISTINCT FROM 'business' THEN
    RAISE EXCEPTION 'End-of-period cancellation incorrectly revokes active entitlement';
  END IF;
  RAISE NOTICE 'PASS: scheduled cancellation retains active plan pending period end';

  v_event := 'evt_ppqa_three_tier_stale';
  v_received := public.parlayping_stripe_claim_event(
    v_event,'customer.subscription.updated',v_now+interval '2 seconds'
  );
  v_result := public.parlayping_stripe_apply_subscription_event(
    v_event,v_user,'pro','active',v_customer,v_newsub,v_prices[2],
    v_now,v_now+interval '1 month',false,NULL
  );
  SELECT * INTO v_check FROM public.subscriptions WHERE user_id=v_user;
  IF v_received IS DISTINCT FROM true OR v_result IS DISTINCT FROM false
    OR v_check.plan_id IS DISTINCT FROM 'business' OR v_check.cancel_at_period_end IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'A stale Stripe event overrode the scheduled cancellation'; END IF;
  RAISE NOTICE 'PASS: stale plan updates cannot override the current subscription';

  v_event := 'evt_ppqa_three_tier_delete';
  v_received := public.parlayping_stripe_claim_event(
    v_event,'customer.subscription.deleted',v_now+interval '5 seconds'
  );
  v_result := public.parlayping_stripe_apply_subscription_event(
    v_event,v_user,'business','canceled',v_customer,v_newsub,v_prices[3],
    v_now,v_now+interval '1 month',false,NULL
  );
  SELECT * INTO v_check FROM public.subscriptions WHERE user_id=v_user;
  IF v_received IS DISTINCT FROM true OR v_result IS DISTINCT FROM true
    OR v_check.status IS DISTINCT FROM 'canceled' THEN
    RAISE EXCEPTION 'Final cancellation did not revoke active subscription status'; END IF;
  RAISE NOTICE 'PASS: final cancellation revokes the subscription';

  v_event := 'evt_ppqa_three_tier_resurrection';
  v_received := public.parlayping_stripe_claim_event(
    v_event,'customer.subscription.updated',v_now+interval '6 seconds'
  );
  v_result := public.parlayping_stripe_apply_subscription_event(
    v_event,v_user,'business','active',v_customer,v_newsub,v_prices[3],
    v_now,v_now+interval '1 month',false,NULL
  );
  SELECT * INTO v_check FROM public.subscriptions WHERE user_id=v_user;
  IF v_received IS DISTINCT FROM true OR v_result IS DISTINCT FROM false
    OR v_check.status IS DISTINCT FROM 'canceled' THEN
    RAISE EXCEPTION 'Canceled Stripe subscription was improperly reactivated'; END IF;
  RAISE NOTICE 'PASS: late events cannot resurrect a canceled subscription';
END
$pp_qa$;

ROLLBACK;
SELECT 'PASS: all sandbox plan-transition assertions succeeded; changes rolled back' AS result;