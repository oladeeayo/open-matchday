# Data dictionary

Reference for every file and field in `data/`. All files are **UTF-8 CSV with a
header row**, comma-separated, CRLF line endings, and RFC 4180 quoting (fields
containing commas — notably `goal_minutes` — are wrapped in double quotes).

An **empty field means the value is unavailable**, never zero. Integer columns
are written as plain digits; parse them as nullable ints.

- **Season code:** `2627` = 2026/27. The same code is used for calendar-year
  competitions, which run January–December and therefore include their
  early-2026 matches.
- **Folder:** `<COUNTRY>_<TIER>_<league-slug>`, e.g. `ENG_1_premier-league`,
  `GER_3_3-liga`, `UEFA_1_champions-league`. Full list in
  [LEAGUE_INDEX.md](LEAGUE_INDEX.md).
- **File names:** `results_<season>.csv`, `fixtures_<season>.csv`,
  `goals_<season>.csv`.

---

## `results_<season>.csv` — finished matches

One row per played match. The header is identical for all 75 competitions:

```
gw,date,time,home,away,ft_home,ft_away,ft_result,ht_home,ht_away,ht_result,
home_shots,away_shots,home_target,away_target,home_fouls,away_fouls,
home_corners,away_corners,home_corners_1h,away_corners_1h,
home_corners_2h,away_corners_2h,home_yellow,away_yellow,home_red,away_red,
goal_minutes,source
```

| Column | Type | Null | Meaning |
|---|---|---|---|
| `gw` | integer | no | Gameweek / matchday. Official round where the provider supplies one (OpenLigaDB, fixturedownload); otherwise derived by clustering matches into Mon–Sun weeks. |
| `date` | date `YYYY-MM-DD` | no | Match date in UTC. |
| `time` | `HH:MM` | yes | Kickoff time using a fixed CET-1 (UTC+1) convention, matching football-data.co.uk. Summer fixtures may be 1 hour off local time. |
| `home` | text | no | Home team, in the winning provider's spelling. |
| `away` | text | no | Away team, in the winning provider's spelling. |
| `ft_home` | integer | no | Full-time goals, home. |
| `ft_away` | integer | no | Full-time goals, away. |
| `ft_result` | `H` / `D` / `A` | no | Full-time result from the home team's perspective. |
| `ht_home` | integer | yes | Half-time goals, home. |
| `ht_away` | integer | yes | Half-time goals, away. |
| `ht_result` | `H` / `D` / `A` | yes | Half-time result. |
| `home_shots` | integer | yes | Total shots, home. |
| `away_shots` | integer | yes | Total shots, away. |
| `home_target` | integer | yes | Shots on target, home. |
| `away_target` | integer | yes | Shots on target, away. |
| `home_fouls` | integer | yes | Fouls committed, home. |
| `away_fouls` | integer | yes | Fouls committed, away. |
| `home_corners` | integer | yes | Corners won in the whole match, home. |
| `away_corners` | integer | yes | Corners won in the whole match, away. |
| `home_corners_1h` | integer | yes | First-half corners, home. **Top-10 leagues only.** |
| `away_corners_1h` | integer | yes | First-half corners, away. **Top-10 leagues only.** |
| `home_corners_2h` | integer | yes | Second-half corners, home. **Top-10 leagues only.** |
| `away_corners_2h` | integer | yes | Second-half corners, away. **Top-10 leagues only.** |
| `home_yellow` | integer | yes | Yellow cards, home. |
| `away_yellow` | integer | yes | Yellow cards, away. |
| `home_red` | integer | yes | Red cards, home. |
| `away_red` | integer | yes | Red cards, away. |
| `goal_minutes` | text | yes | Comma-separated goal minutes in chronological order, e.g. `"12,45,90"`. Not attributed to a team here — use `goals_<season>.csv` for that. |
| `source` | enum | no | Provider that supplied the winning row: `openligadb`, `fixturedl`, `espn`, `fd.co.uk`, `soccerway`. |

### Corner invariants

When all six corner fields are present:

```
home_corners == home_corners_1h + home_corners_2h
away_corners == away_corners_1h + away_corners_2h
```

Corner splits exist only for the ten leagues in `fotmob_corners.CORNER_LEAGUES`
(Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira
Liga, Belgian Pro League, Süper Lig, Super League Greece) and only for played
matches. Everywhere else the four `*_corners_1h/2h` fields are blank; total
corners may still be filled by football-data.co.uk.

### Example

```csv
gw,date,time,home,away,ft_home,ft_away,ft_result,ht_home,ht_away,ht_result,home_shots,away_shots,home_target,away_target,home_fouls,away_fouls,home_corners,away_corners,home_corners_1h,away_corners_1h,home_corners_2h,away_corners_2h,home_yellow,away_yellow,home_red,away_red,goal_minutes,source
1,2026-08-21,20:00,Arsenal,Coventry,3,0,H,2,0,H,20,4,6,1,10,13,8,2,5,1,3,1,1,1,0,0,"15,23,49",fixturedl
```

---

## `fixtures_<season>.csv` — upcoming matches

```
gw,date,time,home,away
```

| Column | Type | Null | Meaning |
|---|---|---|---|
| `gw` | integer | no | Gameweek / matchday (same derivation as results). |
| `date` | date `YYYY-MM-DD` | no | Scheduled date (UTC). |
| `time` | `HH:MM` | yes | Scheduled kickoff, CET-1 convention. |
| `home` | text | no | Home team. |
| `away` | text | no | Away team. |

No scores and no stats — a row moves to `results_<season>.csv` once the match
is played. Postponed or moved fixtures are replaced on the next build; stale
old-date slots are dropped.

---

## `goals_<season>.csv` — goal events

Written only for competitions where a provider supplies goal detail: the top-5
leagues, Germany 1–3 (OpenLigaDB, including scorer names) and the UEFA club
competitions.

```
gw,date,home,away,minute,score_home,score_away,scorer
```

| Column | Type | Null | Meaning |
|---|---|---|---|
| `gw` | integer | no | Gameweek / matchday. |
| `date` | date `YYYY-MM-DD` | no | Match date. |
| `home` | text | no | Home team (matches the results row). |
| `away` | text | no | Away team (matches the results row). |
| `minute` | integer | no | Goal minute. Stoppage-time goals may exceed 90 (e.g. `96`). |
| `score_home` | integer | yes | Home score immediately after the goal. |
| `score_away` | integer | yes | Away score immediately after the goal. |
| `scorer` | text | yes | Scorer name. Populated for OpenLigaDB leagues only. |

### Example

```csv
gw,date,home,away,minute,score_home,score_away,scorer
1,2026-08-28,FC Bayern München,VfB Stuttgart,21,1,0,D. Upamecano
```

---

## Joining files

There is no match id. Join `results` and `goals` on `(date, home, away)`, and
`fixtures` to a future results row on `(home, away)` plus the date.

Team names use the winning provider's spelling, so the same club can differ
between competitions (for example `Man Utd` in one file and `Manchester
United` in another). Normalise names (case-fold, strip accents and punctuation)
before joining across competitions, and expect short forms.

## Related files

- [LEAGUE_INDEX.md](LEAGUE_INDEX.md) — every competition, folder, and source.
- [build_summary.json](build_summary.json) — per-league row counts and errors
  from the latest build.
- [DISCLAIMER.md](DISCLAIMER.md) — provider terms and usage limits.
