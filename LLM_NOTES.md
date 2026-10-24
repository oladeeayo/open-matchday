# LLM_NOTES.md — handover for AI agents

> You are likely an LLM picking up this repository. This file tells you what
> was done, why things look the way they do, what is fragile, and how to
> continue without breaking it. Last updated: 2026-10-24.

## What this project is

`open-matchday` compiles **current-season (2026/27) football matchday data**
for 75 competitions from five keyless free sources into per-league CSV
folders:

```
data/<COUNTRY>_<TIER>_<league-slug>/
    results_<season>.csv   finished matches (gw, date, time, teams, FT, HT, stats, minutes)
    fixtures_<season>.csv  upcoming matches
    goals_<season>.csv     goal-by-goal (top-5 + German leagues)
```

Season code: `2627` (= 2026/27, football-data.co.uk convention).

## The six sources, and WHY each exists

| Client | Source | Role in the pipeline |
|---|---|---|
| `fixturedl_client.py` | fixturedownload.com `/feed/json/<slug>-2026` | **Fixture/GW spine** for 17 leagues: full season, true round numbers, scores filled as played. Slugs (verified live 2026-10): `epl-2026`, `la-liga-2026`, `bundesliga-2026`, `serie-a-2026`, `ligue-1-2026`, `ligue-2-2026`, `championship-2026`, `efl-league-one-2026`, `efl-league-two-2026`, `scottish-premiership-2026`, `primeira-liga-2026`, `eredivisie-2026`, `super-lig-2026`, `mls-2026`, plus UEFA: `champions-league-2026` (144 rows), `europa-league-2026` (144), `conference-league-2026` (108) — **the authority for UEFA fixture dates**. |
| `openligadb_client.py` | api.openligadb.de `getmatchdata/<bl1|bl2|bl3>/2026` | **Authoritative for Germany 1–3**: real matchdays, FT + HT, goal minutes + scorers |
| `espn_client.py` | site.api.espn.com `/sports/soccer/<slug>/scoreboard` | **Freshness edge**: current round only (see gotcha #1) for 41 leagues incl. all calendar-year leagues (BRA/ARG/MEX/USA/JPN/CHN). Goal minutes via `/summary?event=` for top-5 + UEFA |
| `fd_client.py` | football-data.co.uk `/mmz4281/2627/<DIV>.csv` | **Stats + HT backfill** (shots/targets/fouls/corners/cards) for 19 leagues; lags ~1–2 GW |
| `fotmob_corners.py` | fotmob.com `matchDetails` JSON (+ league `__NEXT_DATA__` for the match list) | **Corner splits for the top-10 leagues**: `home/away_corners` totals plus `_1h` and `_2h` from the All/FirstHalf/SecondHalf periods. Finished matches are cached permanently in `.cache/fotmob_corners.json` (match stats never change after FT) |
| `soccerway_client.py` | soccerway.com `<country>/<league>/(results\|fixtures)/` | **Fill-in for the 43 leagues without full ESPN/fd coverage**: results + upcoming fixtures (no stats). Parses embedded JS data blob — own kickoff from the lead-in `AD` field, scores from `REA/REB` (gotcha #13). `DATE_HINTS` patches known timestamp-less rows (#11). |

`leagues.py` is the registry — folder, display name, and which sources feed
each league. **Add a league there** and `build.py` picks it up.

## Pipeline order (in `builder.build_league`)

1. fetch rows from each configured source,
2. `merge()` — priority `openligadb > fixturedl > espn > fd`, fuzzy name match,
3. `drop_undated_score_dupes()` — drops timestamp-less played rows that
   duplicate a dated result (Soccerway serves some matches twice, see #11),
4. `dedupe_fixtures()` — drops duplicates / stale pre-move fixtures (±2d),
5. `drop_reversed_fixture_dupes()` — drops same-pairing fixtures with
   home/away swapped within ±2d (wrong venue published by one source,
   see #12),
6. `drop_stale_postponed_fixtures()` — drops an UNPLAYED fixture row when a
   RESULT exists for the same fixture at its NEW (moved) date — the old slot
   must disappear, see #13,
7. `finalize()` — FT/HT results, CET time, GW assignment, goal flattening,
8. `fotmob_corners.enrich()` — for the 10 `CORNER_LEAGUES`, attach total,
   1H and 2H corners to finished rows (cached; missing on failure, never
   guessed),
9. write `results_/fixtures_/goals_<season>.csv` per league folder.

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
11. **Soccerway serves some played matches WITHOUT a timestamp** (no
     lead-in `AA`/`AD` kickoff and no `AO` fallback in its record — usually
     an opening-round fixture listed in a section that omits dates, or a
     plain duplicate of a dated row). The undated copy
    slips past `_same_match`/`dedupe_fixtures` (both need parseable dates).
    Two guards: `drop_undated_score_dupes()` in the builder drops an undated
    played row when a dated row has the same teams AND same FT score; for a
    genuine unique undated match, add the verified date to `DATE_HINTS` in
    `soccerway_client.py` (keyed `(home, away)` as Soccerway serves them —
    e.g. CK United 2-1 Newbridge Town, IRE_3, 2026-08-29, verified via
    press reports / Transfermarkt). Every result row must carry a date.
12. **Reversed-orientation fixture dupes**: a source occasionally publishes
    the reverse fixture with the WRONG venue — same pairing, home/away
    swapped, date within ~1 day of the other source's row (seen: FRA_1
    2026/27 Rennes-PSG listed as Rennes home by fixturedl AND PSG home by
    ESPN on consecutive days; also RUS_1). `_same_match` requires matching
    orientation so these inflate the league by one row. Guard:
    `drop_reversed_fixture_dupes()` keeps the row whose HOME side differs
    from the season's first meeting of the pair (double round-robin
    invariant); falls back to source rank. Count lands in
    `build_summary.json` as `dropped_reversed_dupes`.
13. **Postponement pass `drop_stale_postponed_fixtures()`** (builder.py:461):
    drops a PAST-dated UNPLAYED fixture when the same home→away pairing has
    either a result row or a future unplayed row (the moved match was
    republished under its new date; the lagging source still carries the old
    slot). Reversed-orientation rows (cup second legs) are never touched by
    the future-row branch. Runs every build — moved fixtures are always
    handled; count lands in `build_summary.json` as
    `dropped_stale_postponed`. Complements the ±2d windows of
    `merge`/`dedupe_fixtures` (#7).
14. **Soccerway blob field semantics** (`soccerway_client._parse_matches`) —
    the single biggest correctness fix of this project (624 dates + 50 scores
    on 2026-10-12):
    - Blob records are `CX…`-delimited; **the `AD` timestamp in a record's
      lead-in is the NEXT record's kickoff**, not its own. Own kickoff = the
      first `AD<D1>\d+<D2>` after the last `AA<D1>` before `CX`; fall back to
      `AO` (results page). The old code read the neighbour's date — that was
      the source of every −13/−14d shift and phantom same-day duplicates.
    - **`REA/REB` = final score including extra time (before a shootout) —
      this is what CSVs store. `AG/AU` = 90-minute score with `AG` carrying a
      +1 bonus for the shootout winner** (old parser used these, which is why
      shootout wins stored as 2–0 etc. are now 1–1 (+ pens in `RPA/RPB`,
      unused)). `AT/AH` semantics still unclear (possibly HT) — not parsed.
    - `RPA/RPB` on UEFA ties = aggregate-tie shootout, so REAs need not be a
      draw (e.g. Kairat 1–0 Omonia). Not parsed; do not "fix" such rows.
    - Console prints mangle `D1/D2` (`chr(247)`/`chr(172)`) — use
      `.encode("unicode_escape")` when debugging.
15. **Diffing builds: compare date SETS per (home,away), not row
    cross-products.** 10-team 36-round leagues (SCO_2/3/4, HNL, SVN, JPN …)
    legitimately contain the same pairing twice per season with different
    dates, so naive key×key diffs invent phantom changes. Also:
    - mid-season fixture growth is normal — sources publish the second half
      of the season later (+1/+2 rows per league, e.g. SVK/CRO/SCO);
    - UEFA league-phase fixtures used to carry **name-variant duplicate
      rows** ("Stuttgart v Atleti" + "Stuttgart v Atl. Madrid") because
      dedupe did not collapse different spellings — fixed 2026-10-12 by
      `_TEAM_ALIASES` entries (Atl. Madrid/Atleti, Paris/PSG/Paris
      Saint-Germain, Man Utd/Manchester United, Crvena Zvezda/Red Star
      Belgrade, København/Copenhagen, Nordsjælland/Nordsjaelland, AGF/
      Aarhus, L. Red Imps/Lincoln Red Imps …). When adding an alias, reuse
      the EXISTING canonical value for that club (check the table first —
      conflicting canonicals cancel each other and break the merge);
    - changed dates in the 13/14-day range were the old neighbour-`AD` bug
      (#14); verify big movers against the live page's `leadAD` field.

## Corners (top-10 leagues only)

`fotmob_corners.py` covers `ENG_1`, `ESP_1`, `ITA_1`, `GER_1`, `FRA_1`,
`NED_1`, `POR_1`, `BEL_1`, `TUR_1`, `GRE_1` — the ten leagues in
`CORNER_LEAGUES`. For every played match it writes six values:
`home_corners`, `away_corners`, `home_corners_1h`, `away_corners_1h`,
`home_corners_2h`, `away_corners_2h`.

- **Cache**: `.cache/fotmob_corners.json` maps Fotmob match id → the six
  values. Finished matches are immutable, so entries are never re-fetched;
  deleting the file just re-scrapes. The cache is gitignored.
- **Matching pitfall**: short provider names collide inside a round —
  "Deportivo" is Deportivo A Coruña, but "Deportivo Alavés" also starts with
  it, so `builder._same_match` (correctly) refuses to guess. `enrich()` falls
  back to an exact-FT-score + ±3d + shared-token match, accepted only when it
  leaves exactly one candidate. If a fixture loses its corners, check that
  fallback before widening anything.
- **Ambiguous pairings must be deduped first**: fixturedl says "RC
  Deportivo", ESPN/fd say "Deportivo", Fotmob says "Deportivo A Coruña".
  All four spellings are aliased to one canonical in `_TEAM_ALIASES`,
  otherwise the same match appears twice and only one copy can consume the
  Fotmob id (the other keeps fd totals and blank halves).
- Adding a league = add `"<folder>": <fotmob league id>` to
  `CORNER_LEAGUES`; verify its `matchDetails` actually returns Corners in
  All/FirstHalf/SecondHalf before trusting it.

## Known data gaps right now (2026-10-12)

- **Soccerway feeds 43 competitions** (see `soccerway=` in `leagues.py`):
  UEFA ×3 (also espn+fixturedl), 10 domestic cups, England 6–7 (National
  League N/S, Northern Premier), Scotland 2–4 + both cups, Ireland 2–3,
  Poland 1–3, Wales 1–3, Belgium U21, SUI/AUT/DEN/RUS/SWE/NOR/ROU top
  flights, plus CRO/CZE/UKR/CYP/SVK/SVN/FIN/KAZ. Results + upcoming
  fixtures only — no stats, HT, or goal minutes. Some slugs 404 — the
  known-good list is what `leagues.py` uses; POR `standings/` 404s
  (fixtures/results work).
- UEFA club competitions (UEFA_1_*): fixturedl is the fixture authority,
  espn fills current-round results + goal minutes; soccerway blob supplies
  ET-aware scores (#14). Fixtures = league phase + knockout as draws land
  (144/144/108 fixturedl rows for UCL/UEL/UECL). **Main round only** —
  `League.main_round_from` (UCL 2026-09-08, UEL 2026-09-16, UECL
  2026-10-15, the league-phase openers per ESPN+fixturedl) drops all
  soccerway qualifying rows (and any undated row) after merge, so
  results/tables never count qualifiers. Knockout rounds fall after the
  cutoff and are kept.
- Fixturedownload.com does NOT have feeds for tiers 6–7 (tried many slug
  variants — all 404). Only tiers 1–5 have fixturedl spines.
- England tiers 6+ and Scotland 2–4 have no full-season fixture spine →
  coverage is whatever Soccerway's standings/fixtures pages serve.
- fd-covered leagues lag 1–2 GW on stats/HT; ESPN fills results/minutes live.
- **Fotmob client** (`fotmob_client.py`): extracts `__NEXT_DATA__` JSON
  from Next.js pages — no Cloudflare bypass needed. Configured for SUI/AUT/
  DEN/SWE/NOR/ROU. Russia not on Fotmob (uses Soccerway).
  Fotmob league IDs: SWE=67, SUI=69, AUT=38, DEN=46, NOR=59, ROU=189.
- Soccerway omits timestamps on a few played rows (gotcha #11) —
  `DATE_HINTS` in `soccerway_client.py` covers known cases; extend it when
  the validation checklist flags a blank date.

## How to run / automate

```bash
python build.py                          # all leagues
python build.py --only ENG_1_premier-league
python scripts/check_data.py             # correctness check (exit 1 on errors)
python scripts/diff_build.py <old> <new>  # date/score/add/remove diff between builds
python scripts/gen_index.py              # regenerate LEAGUE_INDEX.md
```

**Automation (GitHub Actions, `.github/workflows/`):**

- `daily-update.yml` — cron `0 0 * * *` (**12:00 AM UTC daily**) + manual
  dispatch: `build.py` → `check_data.py` (gates the push — broken data is
  never committed; the run turns red and emails the maintainer) → commit &
  push if changed. This is what picks up each day's results and any newly
  drawn cup round (draws are visible within a day → effectively once per
  round).
- `monthly-data-audit.yml` — cron `0 1 1 * *` (**1st of the month, 01:00
  UTC**) + manual dispatch: snapshot `data/`, rebuild from live sources,
  `diff_build.py` old-vs-new into the job summary (**confirms league fixture
  dates/times still stand** — moved fixtures appear as DATE CHANGES), then
  `check_data.py` on all folders (**correctness audit**) → push if changed.

Both workflows need `permissions: contents: write` (already set) and share
`concurrency` groups so they never race each other's push. Cron is UTC —
adjust the offsets if your midnight differs; GitHub may delay scheduled runs
by a few minutes.

Rate limit: sources are polite-paced in `httpx_util.get` (~1.2s/host); a
full build takes ~15 min locally. If a source starts blocking GitHub IPs,
the daily run fails visibly — check `build_summary.json` in the run output.

## Validation checklist before you push data

1. `python build.py` exits with every league `err=-`.
2. Row sums: EPL/LaLiga/SerieA/3.Liga = 380; Bundesliga/2BL/Eredivisie/
   Primeira/Süper/Ligue 1 = 306; EFL leagues = 552 (±postponement extras).
   No pairing should appear more than twice. UEFA_1_* results+fixtures
   combined = 144/144/108 (league phase only — qualifiers must never
   appear; see `main_round_from`).
3. **Every row of every `fixtures_*.csv` and `results_*.csv` must have a
   date** (and results must have FT scores). A blank date means a new
   undated-source case — see gotcha #11.
4. `build_summary.json`: `dropped_fd` should be small (<20); large jumps mean
   a provider changed its team names — extend `_TEAM_ALIASES`.
   `dropped_reversed_dupes` should be ~0–2 (wrong-venue fixes, see #12).
   0 errors / 0 data issues expected.
5. **Diff against the previous build's CSVs** (backup before rebuilding):
   `date_chg`/`score_chg` should be explained, not ignored — soccerway-side
   changes must match the live page's `leadAD` (kickoff) and `REA/REB`
   (score); fixture growth is normal (#15). Every changed score that looks
   odd (shootout, a.e.t.) should be verified externally or via a raw-blob
   probe before pushing.
6. Spot-check one GW per league against an official source.
7. Regenerate `LEAGUE_INDEX.md` (`python scripts/gen_index.py`) whenever
   `leagues.py` changes.

## Style / conventions

- Python 3.10+, stdlib only (`urllib`, `csv`, `json`, `concurrent.futures`).
- No scraping of Cloudflare-protected sites in this repo; if you add one
  (FWP, Sofascore, Flashscore), put it behind an opt-in client module and
  document the ToS situation.
- CSVs are UTF-8 with header, LF endings; keep `source` column populated so
  every row is traceable.
