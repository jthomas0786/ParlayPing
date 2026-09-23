# X activation record — 2026-09-23

ParlayPing received written X staff confirmation that the described automation does not require additional written approval when it remains mention-triggered only, sends at most one reply per user interaction, replies in-thread to the source post, uses the official X API, is disclosed as automated, and does not perform unsolicited mentions or trend-jacking.

The account owner explicitly authorized activation on 2026-09-23.

Operational safeguards remain in force:
- explicit @ParlayPing mention/reply trigger only
- no unsolicited replies, mentions, likes, follows, reposts, or DMs
- one automated reply per source interaction
- sensitive source media is skipped
- unparsed or low-confidence bet slips are skipped
- correlated legs do not receive misleading combined probabilities
- durable mention idempotency is required before a post
- X OAuth user context must resolve to @ParlayPing
- the Supabase scheduler can be returned to probe-only mode immediately as the operational kill switch
