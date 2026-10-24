# open-matchday ⚽

**Free, open 2026/27 football match data — arranged league → gameweek → team.**

Match results, upcoming fixtures, half-time scores and goal-minute details for
**75 competitions** — European top flights and second tiers, UEFA Champions/
Europa/Conference Leagues, domestic cups, and calendar-year leagues in South
and North America, Asia and Oceania — compiled every build from keyless free
sources and normalised into one clean CSV schema per league. The **top-10
European leagues** also carry corners for home and away, split by half. No paid
APIs, no API keys, no scraping of protected sites.

Built with a small Python pipeline you can re-run any time (designed for a
run every ~2 days — see [LLM_NOTES.md](LLM_NOTES.md)).

---

## Repository layout

```
data/
  ENG_1_premier-league/
      results_2627.csv    finished matches of the 2026/27 season
      fixtures_2627.csv   upcoming matches
      goals_2627.csv      goal-by-goal detail (leagues with goal data)
  ESP_1_la-liga/
  GER_1_bundesliga/  ... (one folder per league)
leagues.py     single source of truth: which leagues are tracked
build.py       CLI runner  (python build.py)
builder.py     normalise/merge/write logic
espn_client.py          keyless ESPN site API (current round, goal minutes)
fixturedl_client.py     fixturedownload.com feeds (true gameweeks, full season)
openligadb_client.py    OpenLigaDB API (Germany incl. 3. Liga, goal minutes+scorers)
fd_client.py            football-data.co.uk CSVs (stats, half-time backfill)
fotmob_corners.py       Fotmob matchDetails (total + 1H/2H corners, top-10 leagues)
soccerway_client.py     soccerway.com JS-blob parser (43 leagues' results/fixtures)
httpx_util.py           shared polite HTTP with retries/rate-limit
build_summary.json       per-league stats of the last build
LEAGUE_INDEX.md          generated index of all 75 competitions
```

Folder names: `<COUNTRY>_<TIER>_<league-slug>` — e.g. `ENG_1_premier-league`,
`SCO_3_league-one`, `GER_3_3-liga`.

## CSV schema — `results_<season>.csv`

| Column | Meaning |
|---|---|
| `gw` | gameweek / matchday number (true round where the source provides one, else derived by clustering matches into Mon–Sun weeks) |
| `date` | YYYY-MM-DD (UTC) |
| `time` | kickoff time CET-1 (HH:MM) where known |
| `home`, `away` | team names (provider spelling, see below) |
| `ft_home`, `ft_away`, `ft_result` | full-time goals + H/D/A |
| `ht_home`, `ht_away`, `ht_result` | half-time goals + H/D/A (**null when unavailable**) |
| `home_shots` … `away_red` | match stats from football-data.co.uk (when their file exists & matches) |
| `home_corners`, `away_corners` | corners won in the whole match (fd.co.uk for its 19 leagues, Fotmob for the top-10) |
| `home_corners_1h`, `away_corners_1h` | first-half corners (**top-10 leagues only**) |
| `home_corners_2h`, `away_corners_2h` | second-half corners (**top-10 leagues only**) |
| `goal_minutes` | comma-separated goal minutes (top-5 leagues + Germany only) |
| `source` | which provider supplied the row |

`fixtures_<season>.csv`: `gw, date, time, home, away` — no scores.
`goals_<season>.csv`: `gw, date, home, away, minute, score_home, score_away, scorer`.

## Leagues covered (2026/27)

Full table with sources per competition: **[LEAGUE_INDEX.md](LEAGUE_INDEX.md)**
(75 rows, generated from `leagues.py`). Summary:

| Group | Competitions | Results | HT / stats | Goal minutes | Corners 1H/2H |
|---|---|---|---|---|---|
| Top-5 leagues (ENG/ESP/ITA/FRA/GER 1) | 5 | ✅ | ✅ (fd lag ~1–2 GW) | ✅ (Germany incl. scorers) | ✅ |
| UEFA Champions / Europa / Conference | 3 | ✅ | partial | ✅ | ❌ |
| Other fixturedl-spine leagues (EFL 2–4, SCO 1, POR, NED 1, TUR, FRA 2) | 8 | ✅ | ✅ (fd where available) | ❌ | POR/NED/TUR only |
| ESPN-fed (GER 2–3, BEL 1, GRE, ESP/ITA/NED 2, ENG 5, SCO 2–4) | 11 | ✅ | ✅ | ❌ | BEL/GRE only |
| Soccerway-fed (SUI/AUT/DEN/SWE/NOR/ROU/RUS, CRO/CZE/UKR/CYP/SVK/SVN/FIN/KAZ, IRE 2–3, POL 1–3, WAL 1–3, ENG 6–7, BEL U21) | 27 | ✅ | ❌ | ❌ | ❌ |
| Domestic cups (EFL Cup, FA Cup, Copa del Rey, Coppa Italia, DFB-Pokal, KNVB, Taça de Portugal, Scottish Cup & League Cup, OFB Cup, Swiss Cup) | 11 | ✅ | partial | ❌ | ❌ |
| Calendar-year / global ESPN (BRA 1–2, ARG 1–2, MEX 1–2, USA, JPN, CHN, AUS) | 10 | ✅ | ✅ | ❌ | ❌ |

Goal minutes are intentionally limited to the **top-5 leagues, Germany 1–3
(OpenLigaDB, incl. scorer names) and the UEFA club competitions**.

Corner splits (total + 1H + 2H per side) are intentionally limited to the
**top-10 European leagues**: ENG 1, ESP 1, ITA 1, GER 1, FRA 1, NED 1, POR 1,
BEL 1, TUR 1 and GRE 1. Every other competition keeps the football-data.co.uk
totals in `home_corners`/`away_corners` where that file exists, and blank
1H/2H columns.

Postponed/moved fixtures are handled on every build: stale old-date slots are
dropped once the match is republished or played (see `builder.py`).

## Data sources (all free, all keyless)

| Source | What it provides | Freshness |
|---|---|---|
| [fixturedownload.com](https://fixturedownload.com) | full-season fixtures + results with true round numbers (17 leagues incl. UCL/UEL/UECL) | ~1 day |
| [OpenLigaDB](https://api.openligadb.de) | German Bundesliga 1/2/3: results, HT, goal minutes + scorers | live-ish |
| [ESPN site API](https://site.api.espn.com) (keyless) | current round for 41 leagues; goal minutes via summary | live |
| [football-data.co.uk](https://www.football-data.co.uk) | results + HT + shots/fouls/corners/cards CSVs (updates ~2×/week, can lag 1–2 GW) | weekly |
| [Fotmob](https://www.fotmob.com) (keyless `matchDetails`) | per-match corners for home/away, whole match **and each half** (top-10 leagues) | live |
| [Soccerway](https://www.soccerway.com) | results + fixtures for the other 43 competitions (ET/shootout-aware scores) | ~1 day |
| [Reep Register](https://reep.football) (reference) | team-name crosswalk between providers | weekly |

Join/merge logic lives in `builder.py`: provider priority
`OpenLigaDB > fixturedownload > ESPN > football-data.co.uk > Soccerway`
(fresher source wins on conflicts), fuzzy team-name
matching (alias table + accent-folded token rules, see the regression tests in
`builder.py`), ambiguity guards, and three dedup passes incl. a
postponement pass that drops stale old-date fixture slots.

## Usage

```bash
python build.py                    # rebuild everything
python build.py --only GER_3_3-liga ENG_1_premier-league
```

Requires Python 3.10+ (stdlib only, no dependencies).

Quick pandas peek:

```python
import pandas as pd
df = pd.read_csv("data/ENG_1_premier-league/results_2627.csv")
df[df.gw == 6]                       # one gameweek
df[df.home == "Arsenal"]             # one team
```

## Cadence / automation

The build is idempotent and incremental by design: re-running it refreshes
results (ESPN), backfills stats/HT (football-data.co.uk) and rewrites the CSVs.
A GitHub Actions workflow running every 2 days is the intended setup — see
[LLM_NOTES.md](LLM_NOTES.md) for the exact recipe and known gotchas.

## Quality notes

- Every merge is guarded: ambiguous rows are dropped rather than corrupted.
- HT scores are null when no free source had them (rather than guessed).
- Goal minutes only where a provider actually provides them.
- Fixture lists are complete for leagues with a full-season spine; leagues
  covered only by the ESPN current-round board or Soccerway schedule pages
  grow their second half of the season as sources publish it.
- See [build_summary.json](build_summary.json) for the latest build stats.

## Legal

Free, informational, non-commercial. The data belongs to its providers —
**do not sell it**. Read [DISCLAIMER.md](DISCLAIMER.md) before using.
