# open-matchday ⚽

**Free, open 2026/27 football match data — arranged league → gameweek → team.**

Match results, upcoming fixtures, half-time scores and goal-minute details for
**20 European leagues**, compiled every build from keyless free sources and
normalised into one clean CSV schema per league. No paid APIs, no API keys,
no scraping of protected sites.

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
httpx_util.py           shared polite HTTP with retries/rate-limit
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
| `goal_minutes` | comma-separated goal minutes (top-5 leagues + Germany only) |
| `source` | which provider supplied the row |

`fixtures_<season>.csv`: `gw, date, time, home, away` — no scores.
`goals_<season>.csv`: `gw, date, home, away, minute, score_home, score_away, scorer`.

## Leagues covered (2026/27)

| League | Results | HT | Goal minutes | Match stats | Full-season fixtures |
|---|---|---|---|---|---|
| Premier League, Championship, League One, League Two | ✅ | ✅ (lag ~1–2 GW) | PL only | ✅ | ✅ |
| National League | ✅ | ✅ | ❌ | ✅ | current round only |
| Scottish Premiership | ✅ | ✅ | ❌ | ✅ | ✅ |
| Scottish Championship / L1 / L2 | ✅ | ✅ | ❌ | ✅ | current round only |
| Bundesliga / 2. Bundesliga / **3. Liga** | ✅ | ✅ | ✅ (+scorers) | 1&2 ✅ | ✅ (all three) |
| La Liga, Serie A, Ligue 1 | ✅ | ✅ | ✅ (current GWs) | ✅ | ✅ |
| Eredivisie, Primeira Liga, Süper Lig | ✅ | ✅ | ❌ | ✅ | ✅ |
| Belgian Pro League, Super League Greece | ✅ | ✅ | ❌ | ✅ | current round only |

Goal minutes are intentionally limited to the **top-5 leagues** (plus Germany
1–3 via OpenLigaDB, which provides them for free anyway).

Not yet covered free for 2026/27 (sources still publishing 2025/26): Swiss,
Austrian, Danish, Russian, Swedish, Norwegian, Romanian top flights. The
registry has them commented out in `leagues.py`, ready to switch on.

## Data sources (all free, all keyless)

| Source | What it provides | Freshness |
|---|---|---|
| [fixturedownload.com](https://fixturedownload.com) | full-season fixtures + results with true round numbers (12 leagues) | ~1 day |
| [OpenLigaDB](https://api.openligadb.de) | German Bundesliga 1/2/3: results, HT, goal minutes + scorers | live-ish |
| [ESPN site API](https://site.api.espn.com) (keyless) | current round for 20+ leagues; goal minutes via summary | live |
| [football-data.co.uk](https://www.football-data.co.uk) | results + HT + shots/fouls/corners/cards CSVs (updates ~2×/week, can lag 1–2 GW) | weekly |
| [Reep Register](https://reep.football) (reference) | team-name crosswalk between providers | weekly |

Join/merge logic lives in `builder.py`: provider priority
`OpenLigaDB > fixturedownload > ESPN > football-data.co.uk`, fuzzy team-name
matching (alias table + accent-folded token rules, see the regression tests in
`builder.py`), ambiguity guards, and deduplication of postponed/stale rows.

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
  covered only by the ESPN current-round board may lack far-future fixtures.
- See [build_summary.json](build_summary.json) for the latest build stats.

## Legal

Free, informational, non-commercial. The data belongs to its providers —
**do not sell it**. Read [DISCLAIMER.md](DISCLAIMER.md) before using.
