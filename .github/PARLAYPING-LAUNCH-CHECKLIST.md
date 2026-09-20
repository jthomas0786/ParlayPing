# ParlayPing Launch Checklist

This checklist is the release gate for the staged multi-sport expansion and X mention worker.

## 1. External blockers

- [ ] X API/app approval is confirmed externally.
- [ ] Vercel deployment rate limit has cleared.
- [ ] Do **not** enable X posting merely because either blocker clears.

## 2. Release Sports Outpost data dependencies

Merge and verify in dependency order:

1. Esports feed PR.
2. Generic match-winner feed PR (Volleyball, Cricket, Rugby League/NRL, AFL, Boxing).
3. Golf outright feed PR.

After each merge, verify its refresh workflow succeeds and its slate file is valid. Empty safe snapshots are acceptable when the provider has no current trustworthy market.

## 3. Release ParlayPing stack

Merge and verify in dependency order:

1. Soccer/Tennis/MMA/Table Tennis live/final grading PR.
2. Esports pregame match-winner PR.
3. Volleyball/Cricket/Rugby League/AFL/Boxing generic match-winner PR.
4. Golf + launch-hardening PR.

Do not skip a failed CI or failed Vercel deployment to advance the stack.

## 4. Production smoke checks before X activation

Run the **ParlayPing Launch Readiness** workflow manually. It must prove:

- `/api/status` is healthy.
- All 18 staged sports are advertised.
- Screenshot/vision parsing is configured.
- X OAuth credentials are complete.
- `X_AI_REPLY_APPROVED=false`.
- `X_AUTOREPLY_ENABLED=false`.
- X posting is still disabled.
- Protected X auth probe resolves to `@ParlayPing`.
- The auth probe performs no posting.

Also verify the scheduled **ParlayPing X Mention Check** remains green and reports the worker safely idle while gates are off.

## 5. Launch behavior and safety invariants

These are non-negotiable:

- `X_AI_REPLY_APPROVED=false` until external X approval is confirmed and launch is authorized.
- `X_AUTOREPLY_ENABLED=false` until launch is explicitly authorized.
- Both flags must be true before the worker may post.
- A direct `@ParlayPing` mention with its own attached slip image is actionable; a reply/quote mention may use parent and mention text/media together.
- Attached media is deduplicated and capped at four images per analysis.
- Any `UNRESOLVED` leg blocks the public reply.
- Correlated remaining legs do not receive a naive multiplied combined probability.
- Same-game and same-tournament correlation is suppressed inside the multi-sport router, not only in formatting.
- Public heading remains `🔔 ParlayPing Live`.
- Public replies must stay within X weighted-length limits and must never truncate the Tail URL.
- Do not add a STOP footer.
- Do not expose internal resolution/error diagnostics in public replies.
- Do not infer HIT/MISS from disappearing odds.
- Do not weaken fail-closed behavior for ambiguous identities, voids, stale data, or unsupported markets.
- If screenshot vision fails, image-only input returns no legs rather than guessing; explicit parseable tweet text may still use the text fallback.
- A failed primary vision attempt must not trigger a second OpenAI vision retry in the same parse.
- OpenAI vision requests default to a 12-second timeout (`OPENAI_TIMEOUT_MS`, bounded 3–30 seconds).
- X API requests default to a 12-second timeout (`X_REQUEST_TIMEOUT_MS`, bounded 3–30 seconds).
- X `429` responses are surfaced with `Retry-After`; the worker must not retry the X request inside the same run.
- Scheduled mention checks are serialized so overlapping polls cannot race one another.

## 6. Controlled activation after approval

Only after Sections 1–5 are green and the user explicitly authorizes activation:

1. Confirm the latest production deployment and `/api/status` again.
2. Run **ParlayPing Launch Readiness** again while **both** X activation flags are still false.
3. Set `X_AI_REPLY_APPROVED=true`.
4. Keep `X_AUTOREPLY_ENABLED=false` and verify the worker is still safely idle.
5. Set `X_AUTOREPLY_ENABLED=true` only after the one-gate safety check is confirmed.
6. Observe the first scheduled worker run and confirm it processes the expected number of candidates.
7. Verify the first actual reply is attached to the correct mention and contains no unresolved leg, internal diagnostic, truncated Tail URL, or naive correlated probability.

## 7. Rollback / stop condition

If any unexpected posting, parsing, authentication, data-quality, correlation, rate-limit, or deployment issue appears:

1. Set `X_AUTOREPLY_ENABLED=false` immediately.
2. Leave `X_AI_REPLY_APPROVED` unchanged unless approval itself is in question.
3. Confirm the next scheduled poll reports `posting-gates-disabled`.
4. Diagnose and rerun CI/readiness before reactivation.
