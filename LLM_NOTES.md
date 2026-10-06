# LLM_NOTES.md — handover for AI agents

> You are likely an LLM picking up this repository. This file tells you what
> was done, why things look the way they do, what is fragile, and how to
> continue without breaking it. Last updated: 2026-10-06.

## What this project is

`open-matchday` compiles **current-season (2026/27) football matchday data**
for 20 European leagues from four keyless free sources into per-league CSV
folders:

```
data/<COUNTRY>_<TIER>_<league-slug>/
    results_<season>.csv   finished matches (gw, date, time, teams, FT, HT, stats, minutes)
    fixtures_<season>.csv  upcoming matches
    goals_<season>.csv     goal-by-goal (top-5 + German leagues)
```

Season code: `2627` (= 2026/27, football-data.co.uk convention).

## The four sources, and WHY each exists

| Client | Source | Role in the pipeline |
|---|---|---|
| `fixturedl_client.py` | fixturedownload.com `/feed/json/<slug>-2026` | **Fixture/GW spine** for 12 leagues: full season, true round numbers, scores filled as played |
| `openligadb_client.py` | api.openligadb.de `getmatchdata/<bl1|bl2|bl3>/2026` | **Authoritative for Germany 1–3**: real matchdays, FT + HT, goal minutes + scorers |
| `espn_client.py` | site.api.espn.com `/sports/soccer/<slug>/scoreboard` | **Freshness edge**: current round only (see gotcha #1). Goal minutes via `/summary?event=` for top-5 leagues |
| `fd_client.py` | football-data.co.uk `/mmz4281/2627/<DIV>.csv` | **Stats + HT backfill** (shots/targets/fouls/corners/cards); lags ~1–2 GW |

`leagues.py` is the registry — folder, display name, and which sources feed
each league. **Add a league there** and `build.py` picks it up.

## Pipeline order (in `builder.build_league`)

1. fetch rows from each configured source,
2. `merge()` — priority `openligadb > fixturedl > espn > fd`, fuzzy name match,
3. `dedupe_fixtures()` — drops duplicates / stale pre-move fixtures,
4. `finalize()` — FT/HT results, CET time, GW assignment, goal flattening,
5. write `results_/fixtures_/goals_<season>.csv` per league folder.

## Critical gotchas (learned the hard way — do not regress)

1. **ESPN `?dates=` history filter is DEAD for 2026/27 soccer** (returns 0
   events for every league tried). The *default* scoreboard gives the CURRENT
   round only. Full history must come from fixturedl/OpenLigaDB/fd.
2. **ESPN serves scheduled matches with score "0"** — only trust scores when
   `status.type.completed == true`, or every fixture shows up as a 0–0 "D".
3. **ESPN minor-league boards can be stale** (served 2025/26 season for
   sco.3, sco.4, rou.1, sui.1). `espn_client` drops events whose
   `season.year != 2026`. If a league shows 0 rows, check whether ESPN has
   switched over yet.
4. **football-data.co.uk files are latin-1/cp1252 encoded** — decode as
   cp1252, not utf-8, or every accented name ("Málaga", "Köln") is corrupted
   into unmatched garbage. Also: URLs 302-redirect; urllib follows by default.
   Some divisions do not exist for 2627: A1/S1 return HTTP 300, DEN/RUS/SWE/
   NOR/ROU return 404. fd also omits future fixtures — fixtures come from the
   spine sources.
5. **Name matching is the hard part.** `_same_team()` in `builder.py` uses:
   alias table (`_TEAM_ALIASES`, keys are `norm_team()` forms), accent-folding
   (NFKD), token overlap, a ≥5-char non-generic single-token rule, and a
   prefix/suffix rule — all guarded by `_AMBIG_TOKENS` (paris, madrid,
   sheffield, bristol, manchester, city, town, united, …) because same-city
   club pairs (Sheffield Utd/Wed, Bristol City/Rovers, Paris FC/PSG, Man
   Utd/City) must never match each other. There is a 16-case regression list
   in the git history / this file — extend it when adding aliases.
   **Rule 5 previously self-matched a token against its own side and silently
   collapsed leagues to ~20% of their rows** — verify league sums after any
   matcher change (EPL 380, La Liga 380, Serie A 380, Bundesliga/2BL/ Ere/
   Por/Tur 306, EFL 552).
6. **fd rows that match MULTIPLE merged rows are dropped** (ambiguity beats
   corruption). fd rows matching nothing are KEPT (they are the only data for
   fd-only leagues like Greece/Belgium). The `dropped_fd` count lands in
   `build_summary.json`.
7. **Postponed/moved matches**: fd may carry the match under its new date
   while fixturedl still shows the old slot. `dedupe_fixtures()` drops the
   stale fixture within ±2d of the result row (GW spacing is ~7d, so ±2d
   cannot eat the next legit meeting). `merge` uses ±3d. Do not widen these —
   ±10d destroyed the dataset.
8. **GW derivation**: OpenLigaDB (`groupOrderID`) and fixturedownload
   (`RoundNumber`) are true matchdays. Everything else is Mon–Sun week
   clustering (`assign_gw`) — deterministic, but midweek-rearranged seasons
   can be off by one. Fine for grouping, flag if you need official GWs.
9. **Goal minutes**: only where providers actually give them — OpenLigaDB
   (Germany 1–3, incl. scorer names) and ESPN summary keyEvents (top-5, only
   for matches ESPN served *while live*). Historical EPL/LaLiga/SerieA/Ligue1
   minutes from earlier GWs are NOT backfilled (Understat went JS-rendered;
   FWP is Cloudflare-fronted). Roadmap: Wikipedia club-season articles via the
   MediaWiki API, or Pydoll for FWP/Flashscore.
10. **Timezones**: ESPN/fixturedl/OpenLigaDB give UTC; displayed `time` is
    CET-1 (UTC+1) to match fd convention — no DST handling (CEST summer games
    will show +1h off; acceptable, documented).

## Known data gaps right now (2026-10-06)

- Switzerland, Austria, Denmark, Russia, Sweden, Norway, Romania: no free
  2026/27 source (ESPN stale, fd 404/300) → commented out in `leagues.py`.
- England 6–8 (National League N/S, Step 3–4): no source yet. Football Web
  Pages is Cloudflare-protected → future Pydoll/curl_cffi scraper target.
  (ESPN covers only the National League tier 5.)
- England tiers 6+ and Scotland 2–4 have no full-season fixture spine →
  `fixtures_2627.csv` may hold only the current ESPN round.
- fd-covered leagues lag 1–2 GW on stats/HT; ESPN fills results/minutes live.

## How to run / automate

```bash
python build.py                          # all leagues
python build.py --only ENG_1_premier-league
```

Planned cadence: **every 2 days** via GitHub Actions, e.g.:

```yaml
on:
  schedule: [{cron: "0 4 */2 * *"}]
  workflow_dispatch:
jobs:
  build: {runs-on: ubuntu-latest, steps: [
    {uses: actions/checkout@v4},
    {uses: actions/setup-python@v5, with: {python-version: "3.12"}},
    {run: "python build.py"},
    {run: "git commit -am 'refresh data' || true"},
    {run: "git push"}]}
```

(Not enabled yet — add `.github/workflows/update.yml` when ready. Keep the
cron sparse; sources are polite-rate-limited in `httpx_util.get` at ~1.2s/host.)

## Validation checklist before you push data

1. `python build.py` exits with every league `err=-`.
2. Row sums: EPL/LaLiga/SerieA/3.Liga = 380; Bundesliga/2BL/Eredivisie/
   Primeira/Süper/Ligue 1 = 306; EFL leagues = 552 (±postponement extras).
   No pairing should appear more than twice.
3. `build_summary.json`: `dropped_fd` should be small (<20); large jumps mean
   a provider changed its team names — extend `_TEAM_ALIASES`.
4. Spot-check one GW per league against an official source.

## Style / conventions

- Python 3.10+, stdlib only (`urllib`, `csv`, `json`, `concurrent.futures`).
- No scraping of Cloudflare-protected sites in this repo; if you add one
  (FWP, Sofascore, Flashscore), put it behind an opt-in client module and
  document the ToS situation.
- CSVs are UTF-8 with header, LF endings; keep `source` column populated so
  every row is traceable.
