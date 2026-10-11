# Parlay Ping — Stripe Sandbox Subscription Lifecycle QA

**Date:** 2026-10-11  
**Scope:** Stripe test-mode account `acct_1UHu5WLJU3n7oe0P` and dedicated ParlayPing Supabase project `avwqjgiitxqphvmitolw`. Not a live-billing launch.

## What was actually exercised

A temporary isolated Supabase QA user and Stripe sandbox customer were created. For each plan a **trialing test-mode subscription** was created on its real sandbox recurring Price; Stripe delivered signed `customer.subscription.created` and `customer.subscription.deleted` webhook events to `parlayping-stripe-webhook`. Supabase confirmed the plan, allowance, rate limit, and maximum keys. SQL-side API-key authorization was exercised with a synthetic test key. Each subscription was immediately canceled.

| Plan | Test Price ID | Limit / month | Rate cap | Max keys | Webhook activation | API authorize | Cancel and revoke |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Starter ($20/mo) | `price_1UPC14LJU3n7oe0PWXlzXBDx` | 5,000 | 30/min | 2 | PASS | PASS | PASS |
| Pro ($70/mo) | `price_1UPC1CLJU3n7oe0PnBVQIZd0` | 20,000 | 120/min | 10 | PASS | PASS | PASS |
| Business ($120/mo) | `price_1UPC1HLJU3n7oe0Pm1WkA86y` | 50,000 | 600/min | 50 | PASS | PASS | PASS |

- After cancellation the API returned `subscription-required` for both new calls **and replayed request IDs**; the usage summary showed `plan: none` / zero allowance. New-key issuance without an active paid entitlement was rejected.
- The existing first-party/internal free account was explicitly allowlisted in a protected `parlayping_internal.first_party_api_entitlements` table. The one previously active internal key remained in place; ordinary canceled/unpaid customers cannot use the legacy Free plan.
- Stripe sandbox recorded three canceled test subscriptions, **zero real charges**. Test subscriptions used a short trial only to exercise webhooks without a payment method; no customer-facing free trial has been approved.
- The temporary Supabase QA user and its synthetic API key were deleted and database checks confirmed zero remaining QA users/keys. The isolated Stripe sandbox QA customer may remain as historical test data; it is not an active subscription.
- Stripe webhook: `we_1UPCYjLJU3n7oe0PCmZOEILl` (sandbox only), with three created and three deleted lifecycle events processed. Signing secret stored only in Supabase Vault and is deliberately absent from this repository.

## What is **not** yet claimed

- No real checkout payment was captured, no credit card used, no live subscriptions, and no production prices.
- The public site is **still owner-only for developer billing**. The customer-facing commercial developer signup/key issuance flow, partner approvals, secure pricing presentation and billing console still require work before public sales.
- The actual authenticated browser checkout and Billing Portal were unit-tested with mocked Stripe requests. The three exact sandbox Stripe Price IDs were separately verified by creating test Checkout Sessions via Stripe. No live user's browser was used.
- Full quota boundary/race testing and Stripe webhook delivery-order hardening should be completed before offering public subscriptions.

## Implementation

- Current Supabase migration: `parlayping_paid_only_api_gate_preserve_first_party`
- Source SQL: `sql/paid-only-api-license-gate.sql`
- Database plan migration: `parlayping_approved_sandbox_three_tier_prices`
- GitHub test: `tests/paid-only-api-license-sql.test.js`
- No X posting, TSO front-end, or live Stripe integrations were changed in this lifecycle QA.
