"""Static league registry: folder names, display names, sources.

Single source of truth for the whole pipeline. Add a league here and the
runner picks it up on the next build. Folder naming convention:
    <COUNTRY-CODE>_<TIER>_<league-slug>
e.g. ENG_1_premier-league, GER_3_3-liga, SCO_4_league-two.
Goal-minute scraping is only enabled for the top-5 leagues.
"""
from dataclasses import dataclass


@dataclass
class League:
    # folder name on disk (must be filesystem-safe, sort-friendly)
    folder: str
    # human-readable league name (used in CSVs, README, index)
    name: str
    country: str
    # data sources to pull for this league
    espn: str | None = None          # ESPN league slug, e.g. "eng.1"
    openligadb: str | None = None    # OpenLigaDB league shortcut, e.g. "bl3"
    fd_div: str | None = None        # football-data.co.uk division code, e.g. "E0"
    fixturedl: str | None = None     # fixturedownload.com slug, e.g. "epl-2026"
    # fetch goal minutes via ESPN /summary (top-5 leagues only)
    goal_minutes: bool = False


# --- top-5 leagues: full detail (goal minutes scraped) -----------------------
TOP5 = [
    League("ENG_1_premier-league",   "Premier League",            "England", espn="eng.1", fd_div="E0", fixturedl="epl-2026", goal_minutes=True),
    League("ESP_1_la-liga",          "La Liga",                   "Spain",   espn="esp.1", fd_div="SP1", fixturedl="la-liga-2026", goal_minutes=True),
    League("GER_1_bundesliga",       "Bundesliga",                "Germany", espn="ger.1", openligadb="bl1", fd_div="D1", fixturedl="bundesliga-2026", goal_minutes=True),
    League("ITA_1_serie-a",          "Serie A",                   "Italy",   espn="ita.1", fd_div="I1", fixturedl="serie-a-2026", goal_minutes=True),
    League("FRA_1_ligue-1",          "Ligue 1",                   "France",  espn="fra.1", fd_div="F1", fixturedl="ligue-1-2026", goal_minutes=True),
]

# --- other tracked leagues: results + HT where available ---------------------
OTHERS = [
    # England
    League("ENG_2_championship",     "EFL Championship",          "England", espn="eng.2", fd_div="E1", fixturedl="championship-2026"),
    League("ENG_3_league-one",       "EFL League One",            "England", espn="eng.3", fd_div="E2", fixturedl="efl-league-one-2026"),
    League("ENG_4_league-two",       "EFL League Two",            "England", espn="eng.4", fd_div="E3", fixturedl="efl-league-two-2026"),
    League("ENG_5_national-league",  "National League",           "England", espn="eng.5", fd_div="EC"),
    # Scotland
    League("SCO_1_premiership",      "Scottish Premiership",      "Scotland", espn="sco.1", fd_div="SC0", fixturedl="scottish-premiership-2026"),
    League("SCO_2_championship",     "Scottish Championship",     "Scotland", espn="sco.2", fd_div="SC1"),
    League("SCO_3_league-one",       "Scottish League One",       "Scotland", espn="sco.3", fd_div="SC2"),
    League("SCO_4_league-two",       "Scottish League Two",       "Scotland", espn="sco.4", fd_div="SC3"),
    # Germany
    League("GER_2_2-bundesliga",     "2. Bundesliga",             "Germany", espn="ger.2", openligadb="bl2", fd_div="D2"),
    League("GER_3_3-liga",           "3. Liga",                   "Germany", openligadb="bl3"),
    # Rest of Europe (top-20)
    League("POR_1_primeira-liga",    "Primeira Liga",             "Portugal", espn="por.1", fd_div="P1", fixturedl="primeira-liga-2026"),
    League("NED_1_eredivisie",       "Eredivisie",                "Netherlands", espn="ned.1", fd_div="N1", fixturedl="eredivisie-2026"),
    League("BEL_1_pro-league",       "Belgian Pro League",        "Belgium", espn="bel.1", fd_div="B1"),
    League("TUR_1_super-lig",        "Süper Lig",                 "Turkey", espn="tur.1", fd_div="T1", fixturedl="super-lig-2026"),
    League("GRE_1_super-league",     "Super League Greece",       "Greece", espn="gre.1", fd_div="G1"),
    # Not yet available free for 2026/27 (ESPN board still on 2025 season,
    # football-data.co.uk has no 2627 file). Re-enable when a source exists:
    # League("SUI_1_super-league",  "Swiss Super League",   "Switzerland", espn="sui.1", fd_div="S1"),
    # League("AUT_1_bundesliga",    "Austrian Bundesliga",  "Austria",     espn="aut.1", fd_div="A1"),
    # League("DEN_1_superliga",     "Danish Superliga",     "Denmark",     espn="den.1", fd_div="DEN"),
    # League("RUS_1_premier-liga",  "Russian Premier Liga", "Russia",      espn="rus.1", fd_div="RUS"),
    # League("SWE_1_allsvenskan",   "Allsvenskan",          "Sweden",      espn="swe.1", fd_div="SWE"),
    # League("NOR_1_eliteserien",   "Eliteserien",          "Norway",      espn="nor.1", fd_div="NOR"),
    # League("ROU_1_liga-1",        "Liga I",               "Romania",     espn="rou.1", fd_div="ROU"),
]

ALL: list[League] = TOP5 + OTHERS

BY_FOLDER: dict[str, League] = {lg.folder: lg for lg in ALL}
