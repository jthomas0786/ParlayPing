# ParlayPing Developer API

## Account and authentication

ParlayPing developer accounts use the dedicated Supabase project `avwqjgiitxqphvmitolw`.

The `/account` console supports:

- email/password signup and sign-in;
- profile management;
- API key creation and revocation;
- current monthly usage and plan limits;
- API quick-start information;
- Stripe-backed plan management when billing is enabled.

New users automatically receive the `free` plan. Email confirmation remains controlled by Supabase Auth.

## API keys

API keys use the format:

```text
pp_live_<48 lowercase hex characters>
```

Only the SHA-256 hash is stored. The full key is returned exactly once when created.

Keys can be revoked at any time. Keep API keys on a server or secure backend; never ship a private ParlayPing key in browser JavaScript or a mobile application bundle.

The API key may be supplied with either:

```http
x-api-key: pp_live_...
```

or:

```http
Authorization: Bearer pp_live_...
```

Clients may supply an `X-Request-Id`. If omitted, ParlayPing generates one. Reusing the same request ID with the same API key is idempotent for quota accounting and does not consume another unit.

Responses include `X-Request-Id` plus current monthly/minute usage headers when available.

## Analyze an existing slip

```http
POST /api/v1/analyze
x-api-key: pp_live_...
content-type: application/json
```

Example body:

```json
{
  "legs": [
    {
      "sport": "NFL",
      "player": "Player Name",
      "market": "receivingYards",
      "side": "over",
      "line": 49.5
    }
  ]
}
```

`/api/v1/analyze` accepts up to 25 legs and returns ParlayPing's current analysis for the supplied legs. Unsupported or unverifiable legs fail closed instead of being guessed.

## Build a betslip from real candidates

```http
POST /api/v1/build
x-api-key: pp_live_...
content-type: application/json
```

Example body:

```json
{
  "desiredLegs": 4,
  "minProbability": 0.55,
  "allowSameGame": false,
  "sports": ["NFL"],
  "candidates": [
    {
      "id": "candidate-1",
      "sport": "NFL",
      "player": "Player One",
      "market": "receivingYards",
      "side": "over",
      "line": 49.5,
      "gameId": "game-123"
    },
    {
      "id": "candidate-2",
      "sport": "NFL",
      "player": "Player Two",
      "market": "rushingYards",
      "side": "over",
      "line": 59.5,
      "gameId": "game-456"
    }
  ]
}
```

Builder rules:

- up to 25 candidate legs may be submitted per request;
- the requested build may select up to 25 legs;
- candidates are analyzed by the same ParlayPing multi-sport engine used by the main product;
- only supported pregame `PENDING` legs with a real current model probability are eligible;
- highest model probabilities are preferred;
- distinct games are used by default when game identity is available;
- multiple legs from the same game require `allowSameGame: true`;
- `minProbability` and `sports` are optional filters;
- ParlayPing never invents a replacement leg to fill the requested count.

A successful response contains a `build` object with `selectedLegs`, model percentages, strategy, and `buildable` state. If there are not enough safe candidates, `buildable` is `false`; ParlayPing may return the eligible subset, but it does not claim that the requested parlay was completed and does not return a combined probability for an incomplete build.

### Recommended partner architecture

Do not call ParlayPing directly from public browser code with a private API key. Recommended flow:

```text
Your browser/app
      ↓ authenticated user request
Your backend / Edge Function
      ↓ x-api-key: pp_live_...
ParlayPing /api/v1/build
```

The Sports Outpost is the first-party reference client for this architecture. Its ParlayPing betslip UI is staged separately, with the private API integration remaining server-side rather than exposing a `pp_live_...` key in browser JavaScript.

## Quotas

Plan limits are database-driven and can be changed without redeploying the application.

Initial launch defaults:

| Plan | Requests / month | Requests / minute | Active API keys |
|---|---:|---:|---:|
| Free | 250 | 20 | 2 |
| Pro | 25,000 | 120 | 10 |
| Business | 250,000 | 600 | 50 |

Test-mode Stripe pricing is currently configured at $19/month for Pro and $99/month for Business. These are provisional test prices and may change before live billing is enabled.

## Security model

- Supabase Auth owns end-user identity and sessions.
- RLS limits profile/subscription access to the signed-in user.
- API key hashes, usage rows, and audit events live in the private `parlayping_internal` schema.
- Vercel does not need a Supabase service-role key for API-key validation.
- Privileged validation occurs in the `parlayping-api-auth` Supabase Edge Function.
- Revoked or expired API keys fail closed.
- Monthly and per-minute quota checks occur before API requests are admitted.
- Duplicate request IDs do not increment usage twice.
- Paid access is granted only from verified Stripe subscription lifecycle events, not from browser state.

## Supabase Auth production configuration

The production Auth URLs are:

```text
https://parlayping.net
https://parlayping.net/account
```

Custom SMTP is recommended before broad public signup rather than relying on the default best-effort mail service.
