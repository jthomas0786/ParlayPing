# Stripe Sandbox Prelaunch Hardening — 2026-10-11

The Parlay Ping developer API offers Starter $20, Pro $70, and Business $120/month. **All billing remains Stripe sandbox-only. Public paid checkout is unavailable.**

## Findings fixed

1. The original webhook event-claim RPC deduplicated failed events permanently; Stripe retries could not recover. The replacement RPC atomically retries `failed` events and stale `received` events older than five minutes, but still ignores processed and ignored duplicates.
2. Stripe can deliver subscription events out of order. The new event-aware subscription RPC tracks the last applied Stripe event time and type, refuses older updates to an already-canceled subscription, and prevents a cancellation from an earlier subscription ID from changing a newer subscription.
3. Supabase signup automatically creates a legacy internal Free plan record for every new member. Prior checkout logic treated all internal Free records as protected TSO access, blocking new customers. Now **only explicit first-party entitlements** are protected in the database, and the owner record is specifically protected at the Render checkout layer. Approved test accounts can progress to sandbox subscriptions; unapproved users still cannot check out.

## Test evidence

An isolated, rolled-back database QA transaction verified: fresh event claiming, duplicate suppression, failed event retry, ordinary signup upgrade, cancellation, stale replay rejection, re-subscription, old-subscription cancellation rejection, and owner internal license preservation. No QA account, subscription, or event from these SQL tests persists.

Source is committed in `sql/stripe-webhook-resilience.sql`, `sql/stripe-webhook-first-party-guard.sql`, and `supabase/functions/parlayping-stripe-webhook/index.ts`. The SQL migrations have been applied and the signed Stripe webhook handler deployed as version 4.

## Remaining before public billing

- A **test-mode authenticated account browser checkout + confirmed paid invoice** test should be completed; the earlier three-tier test used trialing sandbox subscriptions with no card.
- Validate Stripe Portal login and upgrades/downgrades, tax/invoice settings, payment failure and refund policy, and price/entitlement mapping.
- Stripe connected via ChatGPT currently exposes **sandbox only**, not a live account. Live API keys, new live Stripe products/prices, live webhook endpoint and signing secret, and explicit owner approval are prerequisites for real charges.
- Public commerce must not accept `sk_test_` transactions as payment for production API entitlements. Do not turn on public checkout or live billing during these QA steps.
