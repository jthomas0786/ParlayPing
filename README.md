# ParlayPing

ParlayPing is a social-first betting intelligence product built around a simple loop:

**Tag it. Track it. Tail what's left.**

The MVP landing page demonstrates the core experience:

- Read the original bet / parlay context
- Separate legs that already hit, are currently live, or have not started
- Show modeled probabilities for live and pending legs
- Let a user tune remaining legs toward safer or more aggressive markets
- Continue from the social post into a Tail What's Left builder

## Current MVP

This repository currently contains a lightweight static landing page with an interactive risk-builder preview. It intentionally does **not** pretend the X bot, sportsbook deeplinks, or real-time sports-data backend are live yet.

### Files

- `index.html` — landing page structure and product preview
- `styles.css` — responsive ParlayPing visual system
- `app.js` — interactive sample risk controls
- `favicon.svg` — brand favicon

## Brand

- Website: https://parlayping.net
- X: https://x.com/ParlayPing
- Tagline: **Tag it. Track it. Tail what's left.**

## Next engineering milestones

1. X mention ingestion / reply workflow
2. Parent-post and bet-slip parsing
3. Live game + player-prop state engine
4. Remaining-leg probability service
5. Tail builder using currently available sportsbook markets
6. Sportsbook deeplinks where supported

## Responsible use

ParlayPing provides informational and entertainment tools. Probabilities are estimates, not guarantees. Sports betting involves risk. 21+ where applicable. Bet responsibly.
