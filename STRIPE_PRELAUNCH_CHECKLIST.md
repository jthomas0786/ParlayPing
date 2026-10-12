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

## Chromium browser QA — 2026-10-11

- Added `scripts/billing-browser-qa.cjs` and `.github/workflows/parlayping-browser-billing-qa.yml`, executing Chromium from GitHub Actions. The first successful run is [ParlayPing Browser Billing QA #38194578659](https://github.com/jthomas0786/ParlayPing/actions/runs/38194578659).
- **Actual browser and actual public site:** `/developers` and `/account` loaded successfully on `https://parlayping.net`; the Developer API prices were visible and screenshots were captured at desktop and mobile sizes. Screenshot artifact `parlayping-billing-browser-evidence` belongs to that workflow run.
- **Actual browser but mocked Stripe HTTP responses:** Starter/Pro/Business initiate one authorized redirect after a double-click; untrusted checkout URLs are rejected; public non-testers cannot start checkout; canceled customers can open their invoice-history link; success callbacks wait for server-authoritative subscription data before enabling key creation.
- The test's fake `checkout.stripe.com` and `billing.stripe.com` pages verify only navigation, **not** Stripe-hosted payment collection or completed portal interaction. No credentials, credit cards, payments, API keys, or Stripe sessions were created by this browser test. The hosted authenticated checkout and actual portal confirmation remain **open** launch acceptance items.
- Browser QA uses Playwright installed only on CI runners; it does not add a Playwright runtime dependency to the Render production service.

## Additional sandbox lifecycle and portal verification — 2026-10-11

- Reconfirmed the exact active monthly sandbox Price IDs and Supabase quota mappings: Starter $20 / 5,000, Pro $70 / 20,000, Business $120 / 50,000.
- Ran a **rollback-only** SQL regression against the deployed subscription-event RPC, verifying Starter → Pro → Business, scheduled cancellation retaining the active status, stale-update rejection, final cancellation, and rejection of a post-cancellation resurrection. Full script: `sql/stripe-three-tier-transition-rollback-qa.sql`. Verified zero persistent test events or changes after rollback.
- Created an isolated **Stripe test-mode QA customer** linked to an existing, explicitly identifiable, non-owner QA Supabase identity. An internal 1-day *test-only* trial subscription activated Starter through a **real signed webhook** in Supabase; the API subsequently switched it to Pro and Business. Business, end-of-period cancellation scheduling, and final cancellation were confirmed in Supabase. The immediate Supabase read after Pro was still Starter; this is expected asynchronous delivery, **not** proof that Pro entitlement was observed in that instant.
- Tested the sandbox Billing Portal configuration `bpc_1UPNFeLJU3n7oe0PdK88tDIS` by requesting real Stripe-hosted `subscription_update_confirm` sessions for **Starter → Pro**, **Starter → Business**, **Business → Starter**, and **Business → Pro**. Stripe accepted all four and supplied test-mode `billing.stripe.com` URLs. **No customer completed the hosted browser confirmation**, so the visible UI is still pending QA.
- Scheduled an actual QA trial subscription for end-of-period cancellation and confirmed Supabase retained its active/trialing entitlement, then **immediately canceled** the subscription and verified the signed deletion webhook changed Supabase to `canceled`. Additional portal-specific QA trials were also immediately canceled.
- The isolated QA customer had **five zero-dollar sandbox invoices** (`amount_paid=0` on all); there were **no real charges**. At the final check the private ParlayPing Supabase project showed **23 processed** Stripe webhook events, **zero failed**, **zero active Stripe subscriptions**, and the existing protected internal license unchanged.
- No public trial has been authorized: the one-day trial here was **only an isolated automated sandbox QA mechanism**, and no signup or pricing page offers it. The dedicated QA Stripe customer remains as test-history; the temporary subscriptions are all canceled.

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
