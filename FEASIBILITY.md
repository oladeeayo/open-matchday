# Feasibility: 2026/27 matchday data — what's possible (probe-verified 2026-10-06)

Scope: season 2026/27 only, current through latest GW, arranged league → GW → team,
FT + HT + goal minutes where available.

## Verified sources (probed live today)

| Source | Leagues verified | Gives | Freshness | HT? | Goal minutes? |
|---|---|---|---|---|---|
| **OpenLigaDB** (api.openligadb.de, keyless) | Bundesliga + 2.Bundesliga + **3. Liga** (bl1/bl2/bl3, 2026) | date, matchday, teams, FT, **HT (resultTypeID=1)**, **goal minutes + scorer** | current (70/380 bl3 matches finished) | ✅ | ✅ |
| **ESPN site.api** (keyless) | eng.1-5, sco.1-3, ger.1-2, ita.1, esp.1, fra.1, por.1, ned.1, bel.1, tur.1, gre.1, sui.1, aut.1, den.1, swe.1, nor.1, rus.1 | date, FT, status; summary endpoint = keyEvents with goal minutes | current round via default scoreboard (`?dates=` filter unreliable) | derive from goal minutes | ✅ via `/summary?event=` |
| **football-data.co.uk** (`mmz4281/2627/XXX.csv`, needs `-L`) | E0-E3,EC; SC0-SC3; D1,D2; SP1,SP2; I1,I2; F1,F2; N1,B1,P1,T1,G1,A1,S1,DEN… | FT, HT, Time, shots/target/fouls/corners/cards, odds | ~2 GW behind (E0 last row 2026-09-20) | ✅ | ❌ |
| **footballwebpages.co.uk** | England lower tiers (redirect discovered: /results → /results-by-email; real results path TBD in build) | results HTML | current | ? | ? |

## Coverage vs your tier targets (2026/27)

| Target | Source | FT | HT | Goal mins | Match stats (shots/fouls/cards) |
|---|---|---|---|---|---|
| England 1-5 | ESPN (live) + fd.co.uk (stats, ~2GW lag) | ✅ | ✅ (derive ESPN / fd direct) | ✅ ESPN | ✅ fd.co.uk |
| England 6-8 | scrape FWP / NonLeagueMatters / TheSportsDB | results only | likely ❌ | ❌ | ❌ |
| Scotland 1-4 | ESPN sco.1-3 + fd.co.uk SC0-SC3 | ✅ | ✅ | ✅ ESPN | ✅ fd |
| Germany 1-3 | **OpenLigaDB bl1/bl2/bl3** | ✅ | ✅ | ✅ | ❌ (fd D1,D2 only) |
| Spain La Liga | ESPN esp.1 + fd SP1 | ✅ | ✅ | ✅ | ✅ fd |
| Top-20 leagues | ESPN slugs above + fd.co.uk | ✅ | ✅ | ✅ ESPN | ✅ fd (where covered) |

## Architecture that works (per probe)

1. **Spine = ESPN** (current GW, all leagues): `GET /scoreboard` (no `dates` param) →
   event list per league per round → per finished match `GET /summary?event=` →
   keyEvents → goal minutes → derive HT (sum goals at minute ≤45).
   GW = derive by grouping events by (league, round) — round comes from
   `event.season`/competitions metadata or by fixture-date clustering.
2. **Stats layer = football-data.co.uk** per division CSV (join by date+team names,
   fuzzy via Reep `teams.csv` crosswalk). Backfills shots/fouls/corners/cards ~2GW late.
3. **Germany 1-3 = OpenLigaDB** (authoritative, includes HT + goal minutes natively).
4. **England 6-8**: dedicated scraper (FWP/NonLeagueMatters), results-only.
5. Elo/Form3/Form5: computed from the results spine (ClubElo only covers top tiers).

## Notes
- ESPN `?dates=YYYYMMDD` filter returned 0 events for many leagues; the **default**
  scoreboard (current round) works. For full season: walk rounds via
  `?seasontype=`/round params or paginate by date ranges and fall back to fd.co.uk
  history once it catches up.
- fd.co.uk URLs 302-redirect: always use `-L`.
- eng.6/7/8 and ger.3 slugs don't exist on ESPN (ger.3 → OpenLigaDB instead).

## Corners — verified 2026-10-24

**Possible and easy for the top-10 leagues.** Fotmob's keyless
`/api/data/matchDetails?matchId=` response contains a `Corners` stat in the
`All`, `FirstHalf` and `SecondHalf` periods, so one request per match yields
home/away totals **and** both halves. The league fixture list comes from the
same site's `__NEXT_DATA__` blob, so no extra provider is needed.

| League | Fotmob id | Corners total | 1H | 2H |
|---|---|---|---|---|
| ENG 1 Premier League | 47 | ✅ | ✅ | ✅ |
| ESP 1 La Liga | 87 | ✅ | ✅ | ✅ |
| ITA 1 Serie A | 55 | ✅ | ✅ | ✅ |
| GER 1 Bundesliga | 54 | ✅ | ✅ | ✅ |
| FRA 1 Ligue 1 | 53 | ✅ | ✅ | ✅ |
| NED 1 Eredivisie | 57 | ✅ | ✅ | ✅ |
| POR 1 Primeira Liga | 61 | ✅ | ✅ | ✅ |
| BEL 1 Pro League | 40 | ✅ | ✅ | ✅ |
| TUR 1 Süper Lig | 71 | ✅ | ✅ | ✅ |
| GRE 1 Super League | 135 | ✅ | ✅ | ✅ |

Cost: ~1 request per newly finished match (cached permanently afterwards), so
a daily build only pays for the matches that kicked off since the last run.
The same endpoint exposes shots, shots on target, fouls, yellow/red cards and
possession by period — extend `fotmob_corners.py` if you want those for the
top-10 too. Leagues outside the ten are skipped; their 1H/2H corner columns
stay blank and the fd.co.uk total (where available) is kept.
