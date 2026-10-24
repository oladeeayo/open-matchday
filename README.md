# open-matchday

**Free, open 2026/27 football data — 75 competitions as clean per-league CSV, rebuilt every day.**

[![Daily data update](https://github.com/oladeeayo/open-matchday/actions/workflows/daily-update.yml/badge.svg)](https://github.com/oladeeayo/open-matchday/actions/workflows/daily-update.yml)
![Updated daily](https://img.shields.io/badge/data-updated%20daily-brightgreen)
![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![CSV](https://img.shields.io/badge/format-CSV-informational)
![Free for non-commercial use](https://img.shields.io/badge/use-free%20non--commercial-lightgrey)

Match results, upcoming fixtures, half-time scores, goal minutes and match stats
(shots, fouls, cards, corners) for **75 football competitions** — European top
flights and second tiers, the UEFA Champions/Europa/Conference Leagues, domestic
cups, and calendar-year leagues across South America, North America, Asia and
Oceania.

One schema across every league. No API key, no signup, no paid feed, no
rate-limited endpoint — just CSV files you can `curl`, load with pandas/DuckDB/R,
or commit into your own project.

```bash
curl -O https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/ENG_1_premier-league/results_2627.csv
```

> **Season:** folder and file names use `2627` = 2026/27. Calendar-year
> competitions (Brazil, Argentina, Mexico, USA, Japan, China) run Jan–Dec and
> therefore also contain their early-2026 matches.

---

## Contents

- [What you get](#what-you-get)
- [Quick start](#quick-start)
- [Find your competition](#find-your-competition)
- [Data dictionary](#data-dictionary)
- [Coverage and freshness](#coverage-and-freshness)
- [How it is built](#how-it-is-built)
- [Limitations](#limitations)
- [License and attribution](#license-and-attribution)
- [Citation](#citation)
- [Contributing](#contributing)
- [Repository layout](#repository-layout)

## What you get

| | |
|---|---|
| **Competitions** | 75 (see [LEAGUE_INDEX.md](LEAGUE_INDEX.md)) |
| **Finished matches** | 8,000+ result rows and growing daily |
| **Upcoming fixtures** | 9,500+ fixture rows |
| **Goal events** | 1,800+ goal rows (top-5 leagues, Germany 1–3, UEFA) |
| **Format** | UTF-8 CSV, one folder per competition, fixed header |
| **Update cadence** | Daily via GitHub Actions (00:00 UTC) |
| **Access** | Git clone, raw.githubusercontent.com, jsDelivr CDN |
| **Cost** | Free for informational, non-commercial use |

Every competition folder contains:

```
data/ENG_1_premier-league/
    results_2627.csv    finished matches — score, HT, stats, corners, goal minutes
    fixtures_2627.csv   upcoming matches — gw, date, time, home, away
    goals_2627.csv      goal-by-goal detail (only where a provider supplies it)
```

## Quick start

### pandas

```python
import pandas as pd

BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data"
df = pd.read_csv(f"{BASE}/ENG_1_premier-league/results_2627.csv")

df[df.gw == 6]                                  # one gameweek
df[df.home == "Arsenal"]                        # one team
df.groupby("home")["ft_home"].sum().sort_values(ascending=False)   # home goals
```

### DuckDB (query the CSV over HTTP, no download)

```sql
SELECT home,
       count(*)                    AS played,
       sum(ft_home)                AS goals_for,
       avg(home_corners)           AS avg_corners
FROM read_csv_auto(
  'https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/ENG_1_premier-league/results_2627.csv'
)
GROUP BY home
ORDER BY goals_for DESC;
```

### R

```r
df <- read.csv("https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/ESP_1_la-liga/results_2627.csv")
subset(df, home == "Real Madrid")
```

### CDN / cached access

jsDelivr mirrors the repository and adds CDN caching, which is friendlier for
web apps and repeated reads:

```
https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/ENG_1_premier-league/results_2627.csv
```

For reproducible research, pin a commit SHA instead of `master`:

```bash
git rev-parse HEAD
# then use .../open-matchday/<sha>/data/...
```

### Clone once, read locally

```bash
git clone https://github.com/oladeeayo/open-matchday.git
cd open-matchday
python -c "import pandas as pd; print(pd.read_csv('data/GER_1_bundesliga/results_2627.csv').tail())"
```

## Find your competition

Folder names follow `<COUNTRY>_<TIER>_<league-slug>`:

| Folder | Competition |
|---|---|
| `ENG_1_premier-league` | Premier League |
| `ESP_1_la-liga` | La Liga |
| `GER_1_bundesliga` | Bundesliga |
| `ITA_1_serie-a` | Serie A |
| `FRA_1_ligue-1` | Ligue 1 |
| `NED_1_eredivisie` | Eredivisie |
| `POR_1_primeira-liga` | Primeira Liga |
| `BEL_1_pro-league` | Belgian Pro League |
| `TUR_1_super-lig` | Süper Lig |
| `GRE_1_super-league` | Super League Greece |
| `UEFA_1_champions-league` | UEFA Champions League |
| `ENG_2_championship` | EFL Championship |
| `BRA_1_serie-a` | Brasileirão Série A |
| `USA_1_mls` | Major League Soccer |

The complete list of all 75 competitions, with the source used for each, is in
**[LEAGUE_INDEX.md](LEAGUE_INDEX.md)**. `leagues.py` is the machine-readable
registry.

## Data dictionary

Full field-by-field documentation (types, nullability, sources, examples):
**[DATA_DICTIONARY.md](DATA_DICTIONARY.md)**.

`results_<season>.csv` in brief:

| Column | Type | Meaning |
|---|---|---|
| `gw` | int | Gameweek / matchday (true round where the provider supplies one) |
| `date` | `YYYY-MM-DD` | Match date (UTC) |
| `time` | `HH:MM` | Kickoff, CET-1 convention; blank when unknown |
| `home`, `away` | text | Team names in provider spelling |
| `ft_home`, `ft_away`, `ft_result` | int, int, `H`/`D`/`A` | Full-time score and result |
| `ht_home`, `ht_away`, `ht_result` | int, int, `H`/`D`/`A` | Half-time score (blank when unavailable) |
| `home_shots` … `away_red` | int | Shots, shots on target, fouls, corners, cards (blank when unavailable) |
| `home_corners_1h`, `away_corners_1h` | int | First-half corners — top-10 leagues only |
| `home_corners_2h`, `away_corners_2h` | int | Second-half corners — top-10 leagues only |
| `goal_minutes` | text | Comma-separated goal minutes, e.g. `"12,45,90"` |
| `source` | text | `openligadb`, `fixturedl`, `espn`, `fd.co.uk` or `soccerway` |

`fixtures_<season>.csv` has `gw, date, time, home, away` and no scores.
`goals_<season>.csv` has `gw, date, home, away, minute, score_home, score_away, scorer`.

## Coverage and freshness

Coverage is deliberately uneven: every competition has results and fixtures,
but detailed stats depend on which free provider covers that league.

| Data | Coverage |
|---|---|
| Results + fixtures | **All 75 competitions** (cups gain fixtures round by round) |
| Half-time scores | ~20% of result rows (fd.co.uk and OpenLigaDB leagues) |
| Shots / fouls / cards | ~19% of result rows (football-data.co.uk leagues) |
| Corner totals | ~19% of result rows |
| Corner 1H + 2H splits | **Every played match in the top-10 leagues** (699 at the time of writing) |
| Goal minutes | ~8% of result rows (top-5, Germany 1–3, UEFA) |

- **Updated daily** at 00:00 UTC by
  [`.github/workflows/daily-update.yml`](.github/workflows/daily-update.yml).
- football-data.co.uk supplies stats with a ~1–2 gameweek lag; ESPN and
  fixturedownload carry the freshest scores.
- The last build timestamp and per-league counts live in
  [build_summary.json](build_summary.json).
- Fixture lists are complete where a provider publishes a full-season spine;
  other competitions grow as schedules are released.

## How it is built

A small Python 3.10+ pipeline (standard library only, no dependencies) merges
several keyless free sources into one normalised record per match, then writes
the CSVs:

```
fixturedownload.com ─┐
OpenLigaDB ──────────┤
ESPN site API ───────┼─► merge / normalise / dedupe ─► data/<league>/*.csv
football-data.co.uk ─┤        (builder.py)
Fotmob ──────────────┤
Soccerway ───────────┘
```

Merge priority is `OpenLigaDB > fixturedownload > ESPN > football-data.co.uk >
Soccerway`, with fuzzy team-name matching, ambiguity guards and postponement
handling. Provider details and the full architecture are in
[LLM_NOTES.md](LLM_NOTES.md); source feasibility probes are in
[FEASIBILITY.md](FEASIBILITY.md).

The top-10 leagues additionally get per-match corners (total and each half)
from Fotmob's keyless `matchDetails` endpoint, cached permanently per finished
match.

## Limitations

- **Not live.** Scores refresh once a day; do not use this for in-play data.
- **Nulls are real.** Blank means "no free source provided it", never zero.
- **Derived gameweeks.** Only OpenLigaDB and fixturedownload supply official
  round numbers; elsewhere `gw` is clustered into Mon–Sun weeks.
- **Provider spelling.** Team names follow the winning source; the same club
  can appear under a different spelling in another competition.
- **Kickoff times** use a fixed CET-1 offset, so summer fixtures can be one
  hour off local time.
- **No xG, lineups, injuries, odds or play-by-play.** Goals are available as
  minutes (and scorers for German leagues), not full event data.
- **Coverage varies.** Check the per-competition table in
  [LEAGUE_INDEX.md](LEAGUE_INDEX.md) before relying on a stat for a league.

## License and attribution

This compilation is shared for **informational, non-commercial use**.

- **You may** use it in personal projects, research, journalism, dashboards and
  open-source tools, with attribution.
- **You may not** sell it, sub-license it, charge for access, or present it as a
  commercial data feed.
- **Attribute** by linking to this repository and naming `open-matchday` as the
  source.
- **Provider rights remain with the providers.** football-data.co.uk, ESPN,
  Fotmob, Soccerway, OpenLigaDB and fixturedownload have their own terms; this
  repository's compilation does not override them. Read
  [DISCLAIMER.md](DISCLAIMER.md) before redistributing.

There is no OSI-approved license file because the upstream data is
non-commercial; the terms above and in [DISCLAIMER.md](DISCLAIMER.md) are the
license.

## Citation

If you use this dataset in published work, cite the repository. A
machine-readable record is provided in [CITATION.cff](CITATION.cff).

```bibtex
@misc{openmatchday2026,
  title        = {open-matchday: free 2026/27 football results, fixtures and match statistics},
  author       = {{open-matchday contributors}},
  year         = {2026},
  howpublished = {\url{https://github.com/oladeeayo/open-matchday}},
  note         = {Season 2026/27, accessed 2026-10-24}
}
```

## Contributing

- **Data corrections:** open an issue with the competition, match, the current
  value and the official source for the correct one.
- **Bug reports:** include the failing league folder and the build output.
- **New competitions:** add an entry to `leagues.py` and run
  `python build.py --only <folder>`.
- **Pull requests:** keep the CSV schema stable and run
  `python scripts/check_data.py` before submitting.

## Repository layout

```
data/<COUNTRY>_<TIER>_<league-slug>/
    results_<season>.csv   finished matches
    fixtures_<season>.csv  upcoming matches
    goals_<season>.csv     goal events (where available)
leagues.py                 competition registry (folder, name, sources)
build.py                   CLI runner: python build.py [--only FOLDER ...]
builder.py                 merge / normalise / dedupe / write
espn_client.py             ESPN site API (current round, goal minutes)
fixturedl_client.py        fixturedownload.com (full-season fixtures, rounds)
openligadb_client.py       OpenLigaDB (Germany 1–3, goal minutes + scorers)
fd_client.py               football-data.co.uk (stats, half-time backfill)
fotmob_corners.py          Fotmob matchDetails (corner splits, top-10)
soccerway_client.py        Soccerway (results/fixtures, 43 competitions)
httpx_util.py              polite HTTP with retries and rate limiting
scripts/                   build diff, data checks, league index generator
build_summary.json         per-league stats from the last build
LEAGUE_INDEX.md            generated index of all 75 competitions
DATA_DICTIONARY.md         field-by-field schema reference
CITATION.cff               citation metadata
DISCLAIMER.md              provider terms, data rights, no-warranty notice
```

`python build.py` rebuilds everything; `python build.py --only ENG_1_premier-league`
rebuilds one competition. The build is idempotent, incremental and safe to
re-run.

*Not affiliated with any league, club, federation or commercial data provider.*
