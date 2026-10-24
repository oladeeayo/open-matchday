# open-matchday — architecture & trade-offs

A portfolio / handoff explainer for the pipeline behind `open-matchday`.

## In one sentence

A dependency-free Python 3.10+ data platform that ingests six free, keyless sports sources, resolves conflicting team identities, deduplicates and merges them into one normalised record per match, enriches finished matches with period-split corners for the top-10 leagues, and publishes a single fixed-schema CSV dataset for 75 football competitions, refreshed daily through GitHub Actions with automated data-quality gates.

## What the dataset is

- **Season:** 2026/27 (folder and file names use `2627`; calendar-year leagues — Brazil, Argentina, Mexico, USA, Japan, China — run Jan–Dec and include their early-2026 matches).
- **Scope:** 75 competitions — European top flights and second tiers, the UEFA Champions/Europa/Conference Leagues, domestic cups, and major calendar-year leagues.
- **Per competition folder:**
  - `results_2627.csv` — finished matches: gameweek, date, kickoff, teams, FT, HT, shots/fouls/cards/corners, corner splits, goal minutes, source.
  - `fixtures_2627.csv` — upcoming matches: gameweek, date, kickoff, home, away.
  - `goals_2627.csv` — goal-by-goal detail where a provider supplies it (top-5, Germany 1–3, UEFA club competitions), including scorer names for German leagues.
- **Seven novel data-engineering decisions** (see below) that make this a platform rather than a one-off scraper.

## Architecture

```
fixturedownload.com ─┐
OpenLigaDB ──────────┤
ESPN site API ───────┼─► fetch → merge → dedupe → enrich → validate → CSV
football-data.co.uk ─┤
Fotmob ──────────────┤
Soccerway ───────────┘
```

- **Five ingestion clients**, each owning one source, each speaking that provider's wire format directly (no Cloudflare bypass, no paid endpoint).
- **One merge function** (`builder.merge`) with a fixed priority order and a fuzzy matcher (`_same_match`) built on alias tables, accent folding, token overlap and ambiguity guards.
- **Four dedup/stale passes** (`drop_undated_score_dupes`, `dedupe_fixtures`, `drop_reversed_fixture_dupes`, `drop_stale_postponed_fixtures`) for the failure modes the live sources actually produce.
- **One enrichment module** (`fotmob_corners.enrich`) that attaches total + 1H + 2H corners for the ten top leagues, with permanent per-match caching and an exact-score fallback for ambiguous short names.
- **One validation gate** (`scripts/check_data.py`) that exits non-zero on errors, so the daily job never commits broken data.
- **One CLI runner** (`build.py`) with `--only`, deterministic and idempotent, and a second monthly audit job that diffs the live snapshot against a fresh rebuild.

## The hard problems and how they were solved

### 1. Composite identity — no single source of truth

No provider gives a stable club id across the whole dataset, and names disagree even within the same matchday (ESPN "Deportivo", fixturedl "RC Deportivo", Fotmob "Deportivo A Coruña"). The merge has to decide, for every pair of rows, whether they are the same match before it can merge columns.

**Solution:** a staged, conservative matcher in `builder._same_match`:
- alias table (`_TEAM_ALIASES`) keyed by normalised name, with canonical values that intentionally equal the fixturedl spine spelling so the alias path fires;
- NFKD accent folding;
- full token-set equality;
- ≥2 shared significant tokens;
- a ≥5-char non-generic, non-ambiguous single-token rule;
- a prefix/suffix containment rule for short-name cases like "Brest"/"Brestois".

**Critical guard:** `_AMBIG_TOKENS` (paris, madrid, sheffield, bristol, manchester, city, town, united, …) blocks any token that could silently collapse a same-city pair — "Stoke City" matching "Manchester City" on "city", or "Sheffield United" pulling in "Sheffield Wednesday".

### 2. One name that broke the whole dataset

During development, an earlier matcher rule tested a single token against its *own* side. That caused self-matches across entire leagues: "City" against "Manchester City", "Real" against "Real Madrid", and so on — every league collapsed to roughly 20% of its real rows overnight.

**How it was caught:** league sum checks (`check_data.py` expects EPL/La Liga/Serie A/3. Liga = 380, Bundesliga/2.BL/Eredivisie/Primeira/Süper Lig/Ligue 1 = 306, EFL = 552). The collapse showed up immediately as thousands of missing rows, and the rule was rewritten so a single-token containment test only looks against the *other* side's name.

**What to say in an interview:** not just "it broke" but "I had a regression guard (pinned row sums) that turned a subtle token rule into a visible error within the same run, and I could point to the exact four leagues where the drop was largest."

### 3. The "Deportivo" disambiguation bug — a real production edge case

La Liga came back with 99 result rows instead of 90. The cause was exactly the kind of entity-resolution ambiguity the matcher is supposed to reject: "Deportivo" is ambiguous between Deportivo Alavés and Deportivo A Coruña, and the matcher correctly refused to guess. The bad side effect was that both spellings were being treated as separate pairings, so every Deportivo fixture duplicated — and only one copy could claim the Fotmob match id, leaving the other with a total but blank halves.

**Fix:** alias all four spellings (`Deportivo`, `RC Deportivo`, `Deportivo A Coruña`, `Deportivo La Coruña`) to one canonical in `builder._TEAM_ALIASES`, so the merge sees one pairing and consumes exactly one Fotmob match id. La Liga went to 90 results + 290 fixtures = 380, with zero duplicate pairings across any of the ten corner leagues.

**Why it matters as a story:** it is a concrete example of (a) a matcher that is deliberately *conservative* needing a human decision, (b) a downstream effect that surfaced only because the enrichment layer depended on a 1:1 mapping between CSVs and Fotmob ids, and (c) a fix that was verified with row-count invariants rather than eyeballing.

### 4. Folding six sources with different cadences and formats

Each source contributes a different slice:
- **fixturedownload** — full-season spine with true round numbers, for 17 leagues including the three UEFA club competitions.
- **OpenLigaDB** — authoritative for Germany 1–3: real matchdays, FT + HT, goal minutes + scorer names.
- **ESPN** — freshness edge for the current round across 41 leagues, plus goal-minute summary data for top-5 and UEFA.
- **football-data.co.uk** — stats and half-time backfill (shots, targets, fouls, corners, cards) for 19 leagues, with a ~1–2 gameweek lag and a latin-1 encoding gotcha.
- **Fotmob** — corner splits for the top-10 leagues, via its keyless `matchDetails` endpoint.
- **Soccerway** — fill-in for the 43 competitions without a full ESPN/fd spine: results + upcoming fixtures, no stats, via an embedded JS blob whose field semantics had to be reverse-engineered.

**Solution:** fixed priority (`OpenLigaDB > fixturedl > ESPN > fd.co.uk > Soccerway`), source-isolated clients, and merge logic that only overwrites a field when the higher-priority source has a fresher or more authoritative value and the lower-priority source is non-empty. Ambiguous fd rows that match multiple merged rows are dropped rather than guessed.

### 5. Real-world dedup and postponement handling

The sources disagree about dates and venues in ways that need explicit passes, not just a generic dedupe:

- **Undated duplicate played rows** (Soccerway sometimes serves a played match twice, once with a timestamp and once without) — dropped when a dated row has the same teams and same FT score.
- **Exact and fuzzy duplicate fixtures** within a ±2d window — the window is deliberately tight because GW spacing is ~1 week; a wider window eats the next legitimate meeting.
- **Reversed-orientation dupes** (a source publishes the same fixture with the wrong venue on the next day) — kept only if its home side differs from the season's first meeting of the pair, falling back to source rank.
- **Stale postponed fixtures** — a past-dated unplayed row is dropped when the same home→away pairing already has a result or a future unplayed row; reversed-orientation cup ties are never touched by the future-row branch.

### 6. Enrichment that is cheap, retry-safe and never corrupts the dataset

For the ten top leagues, `fotmob_corners.enrich`:
- finds the Fotmob match for each finished row by exact name match, falling back to an exact-FT-score + ±3d + shared-token match only when the conservative matcher refuses an ambiguous short name, and only when it leaves exactly one candidate;
- caches the six corner values per finished match id permanently — finished matches are immutable, so entries are never re-fetched;
- **never caches a partial response**, so a failed or incomplete request is retried on the next build rather than leaving a wrong-looking or half-filled row.

The result is 100% corner coverage (total + 1H + 2H) for the top-10 at the time of writing (699/699 played matches), with `home_corners == home_corners_1h + home_corners_2h` holding for every filled row.

### 7. A gate that prevents bad data from shipping

`scripts/check_data.py` runs after every build and exits non-zero if there are errors — missing or future-dated rows, identical duplicate result rows, row sums that don't match pinned totals for the key leagues, duplicate pairings beyond twice, and any `build_summary.json` errors. The daily GitHub Actions job fails the run (and emails the maintainer) instead of pushing broken data.

## What is deliberately not in scope

- **No live / in-play data.** Scores refresh once a day.
- **No xG, lineups, injuries, odds or full event data.** Goals come as minutes (and scorers for German leagues).
- **No streaming.** This is a batch pipeline, not an event-driven one.
- **No commercial redistribution.** See `README.md` and `DISCLAIMER.md`.

## Trade-offs and known limitations

| Decision | Why | Cost |
|---|---|---|
| CSV over a database | Portable, diffable in git, zero infra, easy for researchers to `curl` and load directly | No concurrent writes, no server-side queries, no ACID; bulk analytics need a client like DuckDB |
| Standard library only | No dependency drift, no install step, runs anywhere with CPython 3.10+ | Less ergonomic than an ETL framework, more manual glue for concurrency and HTTP |
| Batch snapshot over streaming | Football data is released in batches from these sources; the value is the compiled snapshot, not record-level streaming | One daily refresh cadence, not sub-hour |
| Perpetual cache for corners | Finished matches never change; re-requesting the same id every day wastes budget | Cache is local to the machine/environment; cross-environment calls re-seed from scratch (cheap, not free) |
| Exact-score fallback for ambiguous names | Avoiding a guessed join is more important than filling every row | A small number of rows can stay blank when no unique candidate exists (currently zero such rows) |
| Pinned row-sum checks for key leagues | Cheap invariant that catches matcher regressions immediately | Only covers leagues with known schedules; calendar-year and cup leagues need different checks |

## Things worth doing next (if you extend it)

- **Parquet + a query layer:** publish Parquet mirrors and DuckDB views so large analyses skip CSV parsing; jsDelivr already caches the CSV, but Parquet would make repeated reads cheaper and richer.
- **Orchestration + observability:** Dagster or Airflow for explicit upstream/downstream/deadline semantics, with freshness SLOs, retries and alerting instead of a cron job that only emails on failure.
- **Stronger tests:** pytest around the matcher (the known collision cases, the "Deportivo" disambiguation, the league sum invariants) and around dedup/stale passes, so matcher changes are covered by assertions rather than only by row sums.
- **Data catalog + lineage:** a small catalog of sources, freshness, coverage and known gaps, with per-row source attribution already present in the `source` column.
- **Dashboard or API:** something that serves the dataset without asking consumers to clone the repo — the jsDelivr mirror and raw.githubusercontent.com already make this possible, but a small read API would help web apps.

## Interview talking points

- **Why CSV and not a database:** portability and zero infra beat server-side queries for a public dataset at this scale; DuckDB or pandas handle the heavy reads; the trade-off is explicit.
- **How you detect data drift and corruption:** pinned row sums for known leagues, duplicate-pair checks, date/score sanity checks, and a gate that refuses to push on error; the monthly audit diffs a fresh build against the last snapshot.
- **How you handle failure:** source-isolated clients, a merge that drops ambiguous rows rather than guessing, a cache that never stores partial responses, and a daily job that fails visibly instead of shipping wrong data.
- **What you'd change going to production:** orchestration with SLOs, Parquet storage, a richer test suite for the matcher and dedup passes, and a query/dashboard layer — listed as roadmap, not as a claim that the current build lacks discipline.
- **What you learned the hard way:** the single-token self-match collapse (league sums caught it), the "Deportivo" disambiguation that surfaced because enrichment depended on a 1:1 mapping, the Soccerway blob field semantics with the neighbour-`AD` gotcha, and why ±3d merge windows cannot be widened without destroying the dataset.
