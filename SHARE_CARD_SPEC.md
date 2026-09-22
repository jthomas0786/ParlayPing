# ParlayPing Shared Betslip Card Contract

This document defines the canonical shared-betslip behavior used by ParlayPing share pages, social previews, Sports Outpost sharing, and future X replies.

## Brand

Use the canonical ParlayPing receipt + ping mark without the circular profile-picture ring. The share renderer, slip page, favicon, and other product surfaces should all use this mark.

## Leg display

### Pending
- Show American odds.
- Show pregame model probability directly under the odds.
- Status: `NOT STARTED` / `PENDING`.

### Live
- Show American odds.
- Prefer the current conditional probability that the selection ultimately wins from the current verified game state.
- Show live progress, e.g. `47 / 60 yards`.
- If a current live probability is unavailable, a saved pregame probability may be shown only when explicitly labeled `PG` / `Pregame`.
- Never present a stale pregame probability as current.

### Settled
- Show American odds and result state (`HIT`, `MISS`, `PUSH`, `VOID`, `UNRESOLVED`).
- Hide probability once the result is known.

## Mixed slips

A slip may contain settled, live, and pending legs simultaneously. Each leg renders its own state. The card summary may read, for example, `2 Hit • 2 Live • 2 Pending`.

## Layout

- 1–3 legs: single column.
- 4–6 legs: two columns.
- 7–25 legs: render no more than six visible legs and show `+N more legs`.
- Normal sharing preserves the original slip order.
- X reply context prioritizes live legs, then settled legs, then pending legs so current information is not hidden by the six-leg cap.

## Safety

- Never fabricate live progress or live probability.
- `UNRESOLVED` remains explicitly unresolved.
- Do not fabricate a combined probability for correlated legs.
- Only display combined sportsbook odds when they are supplied as an explicit verified parlay price.

## URLs

- Premade slip: `/slip/:token`
- Dynamic social card: `/share/:token.png`
- Authenticated partner creation API: `POST /api/v1/share`

Share tokens are self-contained, compressed, and HMAC-signed server-side. `PARLAYPING_SHARE_SECRET` must remain server-only.
