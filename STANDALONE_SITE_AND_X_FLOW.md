# ParlayPing.net: permanent standalone website and X mention entry point

**Approved product direction — 2026-10-10.**

ParlayPing.net is **not** being retired or redirected to The Sports Outpost. It has **two independent audiences sharing the same Parlay Ping betslip intelligence engine**:

1. **People who tag @ParlayPing on X**: get an in-reply-to result and deep link back to `https://parlayping.net/build/<signed-slip-token>` when legs are confidently detected and verified. They should be able to see, inspect, and adjust the shared betslip without a TSO login or a forced Parlay Ping registration; saving personal history/alerts may require an optional standalone consumer account. Direct visits can use `/submit` to upload a screenshot, subject to the existing submission and account policy. If no valid slip can be generated, do not invent a link, a sportsbook price, a probability, or a reply.
2. **Website owners and developers**: learn about, purchase, configure, and monitor commercial API access on the standalone domain. Public API licenses are paid Starter / Pro / Business / Enterprise; an Affiliate/Partner grant is **owner approved only** and not a publicly selectable free API tier. End users of paying partner websites never need Parlay Ping accounts. Custom branding at the higher tiers retains a legible **Powered by Parlay Ping** mark. See `API_BRANDING_TIERS.md`.

The Sports Outpost 2.0 remains a **separate first-party host** for Parlay Ping within TSO's own theme and single-login model. Do not route public X mention users or API purchasers through TSO, and do not remove the standalone domain, Vercel routes, or X bot's public base URL.

## Permanent route responsibilities

- `parlayping.net/`: standalone brand home, clear CTAs for **Create / Open a Betslip** and **Developer API**.
- `parlayping.net/build/:token`: user-specific signed betslip with verified leg details, analysis, sportsbook coverage/odds, and any *valid* verified direct sportsbook links. No TSO login.
- `parlayping.net/submit`: screenshot-based standalone betslip creation. Continue to support X referrals with appropriate consent, attribution, and clear account requirements.
- `parlayping.net/verified/:tweet` and `/share/:token`: existing public betslip verification / sharing surfaces.
- Developer account / keys / subscription pages: accessible from an explicit **Developers / API** CTA, without exposing private API keys in client JS. Actual billing, general customer self-service and owner-only partner approval must not be advertised as production-ready until enforced and tested.
- `parlayping.thesportsoutpost.com`: standalone Render backend deployed inside TSO using first-party TSO account, consistent with TSO's 2.0 theme; TSO uses its own login and draft data.

## Existing X implementation and safety requirements

- Current X worker `server/api/x-worker.js` invokes `tryBuildXShareBundle`. The bundle helper `server/api/lib/x-share-bundle.js` builds `/build/:signed-token` using `PUBLIC_BASE_URL`, falling back to `https://parlayping.net`. **Keep `PUBLIC_BASE_URL=https://parlayping.net` for public X replies**, not the TSO domain.
- The approved mention flow acts only on explicit relevant tags/replies, with safe parsing and correlation handling, no spam or unsolicited reply/mention campaigns. Skip sensitive, incomplete, or low-confidence posts, require idempotency and posting authorization, and avoid leaking personal or private data.
- The checked-in `vercel.json` currently includes `X_AI_REPLY_APPROVED=true` and `X_AUTOREPLY_ENABLED=false`. This does **not** prove production automation is enabled; deployment environment values may override it. Never switch on posting as a side effect of website design.
- Keep X API credentials private and separated from third-party API client keys.

## Release checks for standalone site

1. Public `parlayping.net` and `www.parlayping.net` DNS, SSL, and Vercel domain are healthy; root landing, `/submit`, `/build/:token` and developer entry point return the expected site.
2. A **test-only X mention analysis** generates a verified builder URL on `parlayping.net`; opening the URL without a TSO account renders the correct signed slip. Unsupported cases do not result in fabricated bets.
3. Any eventual live X bot follows the explicit user-approved, disclosed, in-reply-to model and is only activated after QA and X/API compliance review.
4. Developer customers and embedded TSO users do not share authentication, API keys, paid entitlements, or saved history.
5. Do not remove or redirect the old site when future TSO 2.0 changes ship.

## Status

This document records the **approved product architecture**, not a claim that the standalone developer checkout / owner-approved Partner enrollment or live X posting is fully enabled. Domain/route and X workflow were inspected in GitHub, Cloudflare, and Vercel on 2026-10-10; independent public page rendering and live X replies were **not** verified.
