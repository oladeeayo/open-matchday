# League index

Every tracked league, its folder, sources and 2026/27 status. Rebuild with
`python build.py`. Registry: [`leagues.py`](leagues.py).

| Folder | League | Country | Sources | Goal minutes | Fixture spine |
|---|---|---|---|---|---|
| `ENG_1_premier-league` | Premier League | England | ESPN + fixturedownload + fd.co.uk | ✅ | full season |
| `ENG_2_championship` | EFL Championship | England | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `ENG_3_league-one` | EFL League One | England | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `ENG_4_league-two` | EFL League Two | England | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `ENG_5_national-league` | National League | England | ESPN + fd.co.uk | ❌ | current round |
| `ENG_6_national-league-north` | National League North | England | Soccerway | ❌ | current round |
| `ENG_6_national-league-south` | National League South | England | Soccerway | ❌ | current round |
| `ENG_7_northern-premier-league` | Northern Premier League | England | Soccerway | ❌ | current round |
| `SCO_1_premiership` | Scottish Premiership | Scotland | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `SCO_2_championship` | Scottish Championship | Scotland | ESPN + fd.co.uk + Soccerway | ❌ | current round |
| `SCO_3_league-one` | Scottish League One | Scotland | ESPN + fd.co.uk + Soccerway | ❌ | current round |
| `SCO_4_league-two` | Scottish League Two | Scotland | ESPN + fd.co.uk + Soccerway | ❌ | current round |
| `GER_1_bundesliga` | Bundesliga | Germany | OpenLigaDB + ESPN + fixturedownload + fd.co.uk | ✅ + scorers | full season |
| `GER_2_2-bundesliga` | 2. Bundesliga | Germany | OpenLigaDB + ESPN + fd.co.uk | ✅ + scorers | full season |
| `GER_3_3-liga` | 3. Liga | Germany | OpenLigaDB | ✅ + scorers | full season |
| `ESP_1_la-liga` | La Liga | Spain | ESPN + fixturedownload + fd.co.uk | ✅ | full season |
| `ITA_1_serie-a` | Serie A | Italy | ESPN + fixturedownload + fd.co.uk | ✅ | full season |
| `FRA_1_ligue-1` | Ligue 1 | France | ESPN + fixturedownload + fd.co.uk | ✅ | full season |
| `POR_1_primeira-liga` | Primeira Liga | Portugal | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `NED_1_eredivisie` | Eredivisie | Netherlands | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `BEL_1_pro-league` | Belgian Pro League | Belgium | ESPN + fd.co.uk | ❌ | current round |
| `BEL_U21_pro-league` | Pro League U21 | Belgium | Soccerway | ❌ | current round |
| `TUR_1_super-lig` | Süper Lig | Turkey | ESPN + fixturedownload + fd.co.uk | ❌ | full season |
| `GRE_1_super-league` | Super League Greece | Greece | ESPN + fd.co.uk | ❌ | current round |
| `SUI_1_super-league` | Swiss Super League | Switzerland | Soccerway | ❌ | current round |
| `AUT_1_bundesliga` | Austrian Bundesliga | Austria | Soccerway | ❌ | current round |
| `DEN_1_superliga` | Danish Superliga | Denmark | Soccerway | ❌ | current round |
| `SWE_1_allsvenskan` | Allsvenskan | Sweden | Soccerway | ❌ | current round |
| `NOR_1_eliteserien` | Eliteserien | Norway | Soccerway | ❌ | current round |
| `ROU_1_liga-1` | Liga I | Romania | Soccerway | ❌ | current round |
| `RUS_1_premier-liga` | Russian Premier Liga | Russia | Soccerway | ❌ | current round |
| `IRE_2_first-division` | League of Ireland First Division | Ireland | Soccerway | ❌ | current round |
| `IRE_3_national-league` | League of Ireland National League | Ireland | Soccerway | ❌ | current round |
| `POL_1_ekstraklasa` | Ekstraklasa | Poland | Soccerway | ❌ | current round |
| `POL_2_division-1` | I Liga | Poland | Soccerway | ❌ | current round |
| `POL_3_division-2` | II Liga | Poland | Soccerway | ❌ | current round |
| `WAL_1_cymru-premier` | Cymru Premier | Wales | Soccerway | ❌ | current round |
| `WAL_2_cymru-north` | Cymru North | Wales | Soccerway | ❌ | current round |
| `WAL_3_cymru-south` | Cymru South | Wales | Soccerway | ❌ | current round |

## Goal-minute availability

- **Germany 1–3**: OpenLigaDB `goals[]` — minute, running score, scorer name.
- **Top-5 leagues (ENG/ESP/ITA/FRA/GER 1)**: ESPN summary keyEvents for
  matches captured while on the live scoreboard (accumulates from here on;
  historical GWs before 2026-10-06 are not backfilled).
- Everything else: deliberately omitted (not offered free).
