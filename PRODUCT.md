# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static HTML/CSS/JS (no build step), GitHub Pages/Pages-compatible, data from raw.githubusercontent.com/oladeeayo/open-matchday. Confirmed by existing codebase; not re-asked.

## Users

Football bettors and stats-focused fans scanning today's (and upcoming) fixtures for goal-market edges: Over 1.5/2.5/3.5, BTTS, Home 2+, Away 2+. They compare leagues fast, care about sample size and team context (position, strength), and want a single date-centric board like Forebet / Soccervista / football-data.co.uk.

## Product Purpose

Predict goal-market probabilities for every upcoming fixture from open-matchday results, present them in a dense, filterable daily board, and let users drill into league/team context. Success = a bettor opens the site, picks a date, sees trustworthy % lines for every match in seconds, and filters to the leagues/markets they care about.

## Positioning

Client-side Poisson xG model with league-relative attack/defense strengths, form, and **position/strength context** (bottom-vs-bottom dampens totals even when both concede; top-vs-top or equal strength can lift them). No server, no odds feed — transparent percentages from public CSVs.

## Operating Context

- Static site; data fetched live from GitHub raw with local fallback.
- Season 2026/27; multi-date fixtures (not only "today").
- Ad-supported later: reserved banner slots (leaderboard, in-feed, mobile) with AdSense-ready markup.
- Deploy: Cloudflare Pages from oladeeayo/futbol.

## Capabilities and Constraints

- Daily fixture board with date navigation (prev/today/next + date input).
- Per match: xG home/away, most likely score, P(O1.5), P(O2.5), P(O3.5), P(BTTS), P(Home 2+), P(Away 2+), confidence/tip strength.
- Filters: country, league multi-select, min probability threshold, "strong tips only", team search.
- Existing league stats pages (By league, All leagues) remain secondary views.
- No bookmaker odds, no live scores, no auth. Predictions are informational, not guaranteed.
- Client-side only; must stay usable on mid-range mobile.

## Brand Commitments

- Site name: **over25stats** (user-stated).
- Visual world: light Operate data board (user-replaced the dark terminal). Soft gray ground, white surfaces, hairline rules, one deep pitch-green accent (`#0c6b3f`), Public Sans throughout, square corners, no glow. Dense tables, familiar form controls. No mono-as-costume, no neon, no terminal grid.
- References named by user: Forebet, football-data.co.uk, Soccervista (informational, not binding clones).

## Evidence on Hand

- open-matchday results + fixtures CSVs for 30 leagues (2026/27).
- Existing Goal Lines pages (web/index.html, all.html) with proven data loading and team stats.

## Product Principles

1. Probability first — every match leads with %, not narrative.
2. Context beats raw rates — position and strength adjust the model.
3. Dense and scannable — Forebet-like information architecture in a crafted terminal.
4. Fast path to "today" — date nav is the primary control.
5. Honest sample sizes — low MP is visible; model shrinks toward league mean.

## Accessibility & Inclusion

Standard web a11y: keyboard filters, aria on radios/tabs, contrast ≥4.5:1 body text, prefers-reduced-motion respected. No product-specific a11y brief beyond craft floor.

