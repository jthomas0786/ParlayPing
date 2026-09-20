# ParlayPing Developer API

## Account and authentication

ParlayPing developer accounts use the dedicated Supabase project `avwqjgiitxqphvmitolw`.

The `/account` console supports:

- email/password signup and sign-in;
- profile management;
- API key creation and revocation;
- current monthly usage and plan limits;
- API quick-start information.

New users automatically receive the `free` plan. Email confirmation remains controlled by Supabase Auth.

## API keys

API keys use the format:

```text
pp_live_<48 lowercase hex characters>
```

Only the SHA-256 hash is stored. The full key is returned exactly once when created.

Keys are scoped to `analyze:slip` by default and can be revoked at any time.

## Versioned analysis endpoint

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

The same API key may alternatively be supplied as:

```http
Authorization: Bearer pp_live_...
```

Clients may supply an `X-Request-Id`. If omitted, ParlayPing generates one. Reusing the same request ID with the same API key is idempotent for quota accounting and does not consume another unit.

Responses include `X-Request-Id` plus current monthly/minute usage headers when available.

## Quotas

Plan limits are database-driven and can be changed without redeploying the application.

Initial launch defaults:

| Plan | Requests / month | Requests / minute | Active API keys |
|---|---:|---:|---:|
| Free | 250 | 20 | 2 |
| Pro | 25,000 | 120 | 10 |
| Business | 250,000 | 600 | 50 |

Pricing is intentionally not activated yet; `price_monthly_cents` remains unset until billing is connected.

## Security model

- Supabase Auth owns end-user identity and sessions.
- RLS limits profile/subscription access to the signed-in user.
- API key hashes, usage rows, and audit events live in the private `parlayping_internal` schema.
- Vercel does not need a Supabase service-role key for API-key validation.
- Privileged validation occurs in the `parlayping-api-auth` Supabase Edge Function.
- Revoked or expired API keys fail closed.
- Monthly and per-minute quota checks occur before the analysis request is admitted.
- Duplicate request IDs do not increment usage twice.

## Supabase Auth production configuration

Before exposing signup publicly, configure the Supabase Auth Site URL and Redirect URL for:

```text
https://parlayping.net
https://parlayping.net/account
```

Production email should eventually use custom SMTP rather than relying on the default best-effort mail service.
