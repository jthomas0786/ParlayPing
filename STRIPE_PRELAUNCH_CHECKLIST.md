# Parlay Ping — Stripe checkout and billing launch checklist

**Updated:** 2026-10-11. All completed payment tests are **Stripe sandbox**, account `acct_1UHu5WLJU3n7oe0P`, `livemode=false`. Parlay Ping currently **does not accept real Developer API payments**.

## Approved monthly plans

| Plan | USD / month | Monthly API calls | Sandbox Stripe Price |
| --- | ---: | ---: | --- |
| Starter | $20 | 5,000 | `price_1UPC14LJU3n7oe0PWXlzXBDx` |
| Pro | $70 | 20,000 | `price_1UPC1CLJU3n7oe0PnBVQIZd0` |
| Business | $120 | 50,000 | `price_1UPC1HLJU3n7oe0Pm1WkA86y` |

Developer API subscriptions are for third parties; approved TSO first-party integration remains internally allowlisted. Stripe pricing alone does not grant quota; the Supabase subscription and API authentication policies do.

## Verified in Stripe test mode

- Three recurring test Prices are active, $20, $70, and $120.
- Signed subscription-created/updated/deleted webhook events are registered to the ParlayPing Supabase webhook, and the handler now retries failures and rejects stale subscription events.
- A real *test-mode Visa 4242 PaymentMethod* was attached to an isolated sandbox customer. Stripe created a **$20 Starter monthly subscription without a trial**, marked it `active`, and issued invoice `in_1UPNIcLJU3n7oe0PIR4qWtw7`, verified `paid` for **USD 20.00**. Supabase correctly granted the `starter` plan with 5,000 monthly uses.
- The test subscription was immediately canceled; the real signed deletion webhook revoked API access, leaving `plan: none` and `monthlyLimit: 0`. The temporary Supabase test user was deleted. No live payment took place.
- Stripe **sandbox customer portal** configuration `bpc_1UPNFeLJU3n7oe0PdK88tDIS` was created with invoice history, payment-method updating, the three exact sandbox plan prices, and end-of-period cancellation. API portal-session creation succeeded for a sandbox QA customer and returned a test-mode URL.
- The Parlay Ping /api/billing-portal server route uses this configuration explicitly and is gated by authenticated test-only access.

**Important distinction:** The above verifies a paid *test-mode subscription via Stripe API*, not the complete user interaction within *hosted Stripe Checkout*. A real browser-based card entry and portal plan-switch/cancellation interaction still need QA with an isolated approved tester login. The earlier hosted Checkout Sessions were verified as correctly formed but not completed through the browser.

## Safety and UX acceptance criteria still pending

- [ ] Real authenticated user signs up at /account and selects a plan from /developers.
- [ ] On a separate **approved** sandbox test account (not the protected owner/internal account), navigate hosted Checkout and complete a Visa 4242 test-card payment; verify session completion, invoice paid, signed webhook, paid API access, API key creation, quota enforcement, and no duplicate subscription.
- [ ] In the actual Billing Portal browser, test invoice history, card updating, change plan to both Pro and Business, schedule cancellation, and verify entitlement changes and final revocation at period end.
- [ ] Test declined-payment recovery, repeat webhook delivery, payment failure and renewal, and Stripe customer support behavior.
- [ ] Confirm pricing disclosure and legal documents: public terms, privacy, refund/cancellation rules, taxes, business/contact details, support email and billing statement descriptor.
- [ ] Audit signup/email confirmation, plan limits, entitlement changes, and all flows from mobile.

## Live-mode launch — separate account setup and explicit approval

1. Connect Stripe **live mode** for the Parlay Ping business and complete Stripe identity/business/payout verification. The currently connected Stripe account is **sandbox only**; no usable live account/keys/Price IDs are available here.
2. Create **separate live** recurring products/prices ($20 / $70 / $120 USD monthly); never reuse any `price_1UPC...` test Price ID or a sandbox portal configuration in live mode.
3. Register a **separate live webhook signing secret** for signed subscription lifecycle events; store it in the correct restricted backend secret store, isolated from the sandbox secret. Update the database's live price mapping only during a controlled migration, not while the sandbox webhook can still grant production entitlements.
4. Implement & test explicitly environment-bound billing: `sk_live_` must be accepted **only** in an intentionally approved production environment using live IDs and live webhook signing; the existing sandbox-only code must remain fail-closed until that separate implementation is reviewed. Do **not** simply replace `STRIPE_SECRET_KEY` with a live key.
5. Configure the live Billing Portal with the exact live prices and verify the intended billing/cancellation terms, tax settings, and self-service support.
6. Verify live non-test customer signup and checkout, live invoice paid before granting API access, renewal, dunning, canceled customer revocation, charge/refund handling, and owner/internal preservation with a controlled small launch.
7. Obtain **explicit owner go-live approval** before accepting real payments. Never turn on public sandbox checkout for ordinary users: test cards are not real revenue but trialing test subscriptions could grant API access.

## Safe current deployment configuration

- `PARLAYPING_BILLING_SANDBOX_ENABLED=true` enables only test-key operations for the owner or approved tester IDs; public customers still receive HTTP 403 for checkout.
- `PARLAYPING_BILLING_TESTER_USER_IDS` contains only explicitly approved temporary tester UUIDs, if any.
- `STRIPE_SECRET_KEY` **must** be `sk_test_...` for sandbox; the server explicitly rejects `sk_live_...`.
- `STRIPE_SANDBOX_PORTAL_CONFIG_ID=bpc_1UPNFeLJU3n7oe0PdK88tDIS` belongs **only to sandbox**.
- Never commit Stripe secret keys, webhook signing secrets, personal payment details or user tokens.
