# Parlay Ping — B2B API plans, branding, and invite-only partners

**Product direction confirmed 2026-10-10.** This is the target specification, **not a statement that live billing or access controls have shipped**. The current product still contains legacy Free / Pro / Business API configuration, Pro / Business test-mode Stripe prices, and an owner-only developer console. No live price, Stripe product, Supabase grant, existing key, or user account is changed by this document.

## Licensing and user accounts

The **website owner/business** purchases one Parlay Ping developer API subscription; their **website's existing logged-in members** may use the licensed tools without creating Parlay Ping or TSO accounts. Usage is pooled and charged/limited against the licensee's subscription. Tracking can be separated by verified opaque tenant-scoped user ID; an integrator must verify its end users itself. Parlay Ping does not log into, manage, or bill those individual site members.

## No public Free API tier

**Every publicly purchasable API tier is paid.** There must be no free public API key plan, automatic free API issuance after signup, or zero-cost checkout bypass. Creating an ordinary account alone never permits API access. Partner access and first-party operation are explicit, private entitlements only; neither is a public Free tier.

### Proposed monthly usage packages (numbers for product planning; prices not yet approved)

| Tier | Public? | Monthly API uses | Rate cap | Active API keys | Theme / logos | Attribution |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Starter (paid) | Yes | **5,000** | 30/min | 2 | **Standard Parlay Ping** design/approved logo used on TSO 2.0 | Full approved Parlay Ping identity |
| Pro (paid) | Yes | **25,000** | 120/min | 10 | **Standard Parlay Ping** design/approved logo used on TSO 2.0 | Full approved Parlay Ping identity |
| Business (paid) | Yes | **250,000** | 600/min | 50 | Licensee may use **its own theme and branding** | Visible, legible **Powered by Parlay Ping** badge with approved mark/link |
| Enterprise (paid) | Contact sales / approved agreement | Contract-specific | Contract-specific | Contract-specific | Extended tenant-controlled branding/integration | Visible, legible **Powered by Parlay Ping** badge with approved mark/link |
| Affiliate / Partner (complimentary, invitation-only) | **No** | **10,000 initial default**, owner may override | **120/min initial default** | **3 initial default** | **Standard Parlay Ping** unless owner individually approves custom branding | At minimum full approved Parlay Ping identity; customized exceptions still say **Powered by Parlay Ping** |
| First-party TSO/Parlay Ping internal | **No** | Internal allocation/controls | Internal allocation/controls | Service-scoped | As separately approved for TSO 2.0 | Product-specific attribution; not a commercial API plan |

**A use** is one admitted billable API operation, such as `POST /api/v1/analyze`, `/api/v1/build`, or `/api/v1/share`. It is **not** a unique end user, sportsbook leg, widget view, or login. Replay of an existing `X-Request-Id` for the same key and operation must not charge twice. Clearly define and consistently display how invalid requests, upstream failures, and batch jobs affect metering before launch. Monthly quotas and per-minute caps are enforced server-side across *all keys belonging to the account*; normal customers stop with an actionable quota-exceeded response when exhausted (no surprise overage billing). Show remaining uses and next reset in their developer console. Changing plans must not reset usage to evade limits.

**Prices:** To be determined by the owner after validating real API/data costs. Historical test-only $19 Pro / $99 Business are **not** approved production prices. Do not configure live billing or mark paid access active without owner-approved Stripe prices and verified subscription webhooks.

## Affiliate / Partner — owner approval only

A strategic promo / affiliate partnership is **not sold via checkout** and is **not exposed on the public pricing grid as a sign-up option**.

1. An interested website owner may submit an application with website/domain, contact, promotional plan, and intended use. New applications default to `pending` with **zero usable API keys and zero quota**.
2. **Only the verified Parlay Ping owner (or an explicitly delegated server-side administrative role) can approve, reject, suspend, restore, extend, or revoke** partner access. No client-supplied `is_partner`, email match, referral code, registration selection, or browser state can grant access.
3. Approval issues a narrowly scoped partner license and a configurable monthly request allowance. Default: **10,000 uses/month**, **120/min**, up to **3 keys**, **90-day introductory term**, renewable **only by explicit owner action**. Record who approved it, when, why, expiration, and any changes. Notify/show status on expiration; stop partner requests when expired/revoked/over quota.
4. The owner can optionally grant higher limits, longer duration, or Business-style custom branding **per approved partnership**. These exceptions must be saved server-side, auditable, and revocable.
5. Give partners optional trackable referral URLs/codes, clicks, confirmed customer signups, and attributed paid conversions. Payout/commission is **not automatic**: any commissions, terms, and attribution window need a separate explicit agreement. Avoid counting unverified clicks as conversions.
6. Partner sites can use the engine for their own signed-in website members; the members never need a Parlay Ping account. All member requests count toward the partner's granted organization quota.
7. Reserve discretion to rate-limit, suspend, or reject abusive integrations and prohibit resale/sharing of private server keys without written agreement.

## Standard vs customizable branding

**Starter / Pro:** Always show the exact approved Parlay Ping logo family and the dark/blue Parlay Ping product styling currently used with TSO 2.0. The third-party host does **not** get to rebrand the tool as TSO, customize the theme, hide attribution, or inject arbitrary styles.

**Business / Enterprise:** May apply their own website logo/colors/theme through validated, bounded tokens. A persistently visible **Powered by Parlay Ping** lockup with the approved logo/link stays legible on desktop and mobile. This is co-branding, **never full white-label**. Partner exceptions require an affirmative owner grant and retain attribution.

For an *API-powered hosted widget*, resolve branding from the server's active entitlements, with attribution in a trusted host-controlled wrapper. For *raw JSON API* integrations, the platform cannot technically enforce what the customer renders; contractual brand-placement terms and optional compliance checks are necessary.

## Authentication, tenancy, and enforcement

- Customers create one verified developer/business account to buy an API plan, but **end users of their site never sign up with Parlay Ping**.
- All `pp_live_...` API keys remain backend-only, hashed at rest, revocable, and never embedded in public HTML/JS, iframe URLs, or mobile binaries.
- The customer verifies its user's session on its own backend before invoking Parlay Ping. If an interactive hosted widget is offered, the backend mints a signed, expiring, origin/domain-bound and tenant-scoped embed session for that verified user.
- Keep betslip ownership under `tenant_id + external_user_id`. Do not trust arbitrary user identifiers supplied by a browser or allow cross-tenant reads/writes.
- At every authenticated request, the server checks active **paid** subscription **OR** unexpired owner-approved Partner grant **OR** tightly scoped first-party internal entitlement, then resolves current quotas, branding rights, key status, and usage. No unauthenticated/public automatic fallback to Free.
- The current Parlay Ping developer account code restricts access to a specific owner identity; safely expand it to verified paying developers while keeping owner-only partner approval isolated behind server-side admin checks.
- On launch, de-list the legacy `free` plan, disable new free-key issuance, and deliberately review/migrate existing Free entitlements/keys rather than deleting data or unexpectedly breaking the live TSO integration. Existing users should receive a paid upgrade or explicit approved partner/internal exception.
- Preserve audit records for approvals, key issuance/revocation, plan/limit changes, usage accounting, Stripe webhook decisions, and quota resets. Test downgrade/expiry/revocation and concurrency cases.

## Acceptance scenarios

1. **SlipSurge.com on Starter/Pro:** SlipSurge's owner pays; SlipSurge users sign into SlipSurge only. The tool shows approved Parlay Ping branding; each admitted API operation consumes **SlipSurge's** usage allowance.
2. **SlipSurge.com on Business:** Same single SlipSurge login; theme can match SlipSurge, and a prominent **Powered by Parlay Ping** mark remains.
3. **Affiliate example:** The owner approves a promotional sports website for 10,000 uses/month and 90 days. The public cannot select this tier. The approved partner's users sign into the partner website only; API calls stop at 10,000, on expiry, or on revocation.
4. **Unapproved applicant:** May have a contact/account profile but cannot mint a working key, request free calls, self-approve, or spoof an internal entitlement.
5. **TSO first party:** Current TSO integration continues under a separately authorized internal entitlement, not a public free customer plan.

## Implementation status

This file is a **product specification** only. Current `DEVELOPER_API.md` records the *historical live implementation* (including legacy Free limits and test-mode pricing). The Supabase plan rows, developer signup/key authorization, Stripe prices, owner-only admin tools, partner applications, referral attribution, brand entitlement enforcement, and hosted widget still need coordinated code/database changes and security/live route tests before this licensing model can be advertised as operational.
