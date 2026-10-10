# Parlay Ping — developer API licensing and branding policy (approved direction)

## Core B2B rule
The **customer website owner** purchases and maintains the Parlay Ping API subscription. The customer website authenticates its own end users. Those users **must not** be required to create or sign into a Parlay Ping account or The Sports Outpost account merely to use the licensed betslip tools. API usage and billing belong to the customer developer/organization; saved betslips and tracking can be partitioned by verified, opaque customer-scoped end-user identifiers.

## Brand entitlements
Use server-controlled subscription entitlements, not untrusted client flags. Names and pricing beyond existing Free / Pro / Business remain provisional until billing rollout.

| Existing / planned plan | API usage | Visual identity | Required attribution |
| --- | --- | --- | --- |
| Free (current) | Existing 250/mo, 20/min, 2 keys | **Standard** Parlay Ping look (approved Parlay Ping logo and current TSO 2.0-era Parlay Ping dark/blue design) | Prominent approved Parlay Ping branding |
| Pro (current) | Existing 25k/mo, 120/min, 10 keys | **Standard** Parlay Ping look | Prominent approved Parlay Ping branding |
| Business (current) | Existing 250k/mo, 600/min, 50 keys | **Co-branded** tenant visual customization, if the plan has been activated and paid entitlement verified | Always-visible **Powered by Parlay Ping** lockup with approved logo/link |
| Enterprise (future) | Contract-driven; not an active, priced tier yet | **Co-branded** extended customization / support, if contracted | Always-visible **Powered by Parlay Ping** lockup with approved logo/link |

Existing prices in DEVELOPER_API.md are TEST-MODE estimates, not approved live pricing. Never silently change Stripe prices or invoice terms as part of branding work.

### Standard Parlay Ping (lower tiers)
- Preserve the currently approved Parlay Ping asset family. Do not redraw/replace with fabricated marks.
- Reference current `tso2-shell.css` design tokens and existing Parlay Ping application style (near-black backgrounds, restrained #2d7fff blue accents, panel treatment). This describes the **Parlay Ping product design as seen in TSO 2.0**, not permission to brand a third-party site as The Sports Outpost.
- No customer logo, white labeling, CSS/theme overrides, or ability to hide brand attribution.

### Co-branded Parlay Ping (top tiers)
- Tenant may supply approved color tokens, logo, font family from safe allowlist, and border/radius tokens. Do not expose arbitrary HTML/JavaScript/CSS from tenant input.
- Keep a persistently visible and legible **Powered by Parlay Ping** badge, including the approved Parlay Ping logo and link. No customer-defined controls to hide, shrink into unreadability, or recolor into invisibility. Attribution should be part of the hosted widget's trusted wrapper, not tenant DOM.
- The tenant's logo/name may be primary elsewhere in the hosted experience. Parlay Ping attribution remains visible on desktop and mobile.
- The Parlay Ping team can revoke customization entitlement without revoking the entire customer's API if contract terms permit.

## Security and implementation contract
1. Existing `pp_live_...` API keys are **server-side only**. Do not put them in browser code, URL parameters, iframe src, or mobile binary assets.
2. The customer's backend verifies its own end user's login before calling Parlay Ping. A secret-bearing backend route either makes a server-to-server API call or mints a *short-lived, scoped embed session* for a hosted widget. Only verified server-side requests can mint an embed session.
3. Embed sessions are signed, expiring, tenant-scoped and domain-bound. Partition customer users using `tenant_id` + verified opaque `external_user_id`, not the user's unverified email, display name, browser-submitted ID, or global Parlay Ping identity. Do not assume identical IDs across tenants are the same person.
4. Resolve `branding_mode` and limits from current authenticated/paid subscription entitlements on the server. Disallow self-service browser escalation. Support immediate downgrade from co-branded to standard in the hosted widget.
5. Enforce attribution in the hosted widget layout. For **raw JSON API clients**, technical enforcement of their site's displayed logo/attribution is not possible from an API response alone; require contractual API brand-use terms and optionally a compliance review.
6. Existing account/developer management currently restricts key creation to the Parlay Ping owner account. Opening general developer sign-up and purchasing will need its own access-control and billing implementation and security tests.
7. Audit identity isolation, team/tenant scope, plan downgrade, key revocation, expiration, pricing, quota enforcement, mobile attribution, and hostile customization values before production release.

## User experience examples
- **SlipSurge.com:** A SlipSurge customer signs into SlipSurge; SlipSurge's backend invokes its licensed API. The customer never needs a Parlay Ping login. If on Pro, the betslip widget uses standard Parlay Ping design. If on eligible Business/Enterprise, it uses SlipSurge branding plus visible **Powered by Parlay Ping**.
- **The Sports Outpost 2.0:** A TSO customer signs into TSO; TSO is the customer/host identity system for the embedded Parlay Ping product. TSO customer accounts and personal history must not be mixed with SlipSurge customer data.

## Scope/status
This is an approved *product direction/specification*, not a deployed feature. Current API routes expose raw analyze/build/share JSON and existing developer-account auth; standalone third-party loginless hosted widgets, subscription-driven branding enforcement, and tenant-isolated persistence require implementation and live QA. Do not advertise these features as shipped until tests verify them.
