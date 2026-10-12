"""Static league registry: folder names, display names, sources.

Single source of truth for the whole pipeline. Add a league here and the
runner picks it up on the next build. Folder naming convention:
    <COUNTRY-CODE>_<TIER|CUP>_<league-slug>
e.g. ENG_1_premier-league, GER_3_3-liga, UEFA_1_champions-league,
ENG_CUP_efl-cup. Goal-minute scraping is only enabled for the top-5
leagues and UEFA club competitions.
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
    soccerway: str | None = None     # soccerway.com league slug, e.g. "allsvenskan" (country/league path)
    # fetch goal minutes via ESPN /summary (top-5 + UEFA club comps)
    goal_minutes: bool = False
    # Jan-Dec calendar-year season (MLS/BRA/ARG/MEX/CHN/JPN) — widen ESPN
    # month window so the WHOLE season is fetched, not just Aug-May.
    calendar_year: bool = False


# --- top-5 leagues: full detail (goal minutes scraped) -----------------------
TOP5 = [
    League("ENG_1_premier-league",   "Premier League",            "England", espn="eng.1", fd_div="E0", fixturedl="epl-2026", goal_minutes=True),
    League("ESP_1_la-liga",          "La Liga",                   "Spain",   espn="esp.1", fd_div="SP1", fixturedl="la-liga-2026", goal_minutes=True),
    League("GER_1_bundesliga",       "Bundesliga",                "Germany", espn="ger.1", openligadb="bl1", fd_div="D1", fixturedl="bundesliga-2026", goal_minutes=True),
    League("ITA_1_serie-a",          "Serie A",                   "Italy",   espn="ita.1", fd_div="I1", fixturedl="serie-a-2026", goal_minutes=True),
    League("FRA_1_ligue-1",          "Ligue 1",                   "France",  espn="fra.1", fd_div="F1", fixturedl="ligue-1-2026", goal_minutes=True),
]

# --- UEFA club competitions (league phase + knockout as draws land) ---------
UEFA = [
    League("UEFA_1_champions-league", "UEFA Champions League", "UEFA",
           espn="uefa.champions", fixturedl="champions-league-2026",
           soccerway="europe/champions-league", goal_minutes=True),
    League("UEFA_1_europa-league", "UEFA Europa League", "UEFA",
           espn="uefa.europa", fixturedl="europa-league-2026",
           soccerway="europe/europa-league", goal_minutes=True),
    League("UEFA_1_conference-league", "UEFA Conference League", "UEFA",
           espn="uefa.europa.conf", fixturedl="conference-league-2026",
           soccerway="europe/conference-league", goal_minutes=True),
]

# --- domestic cups (added when a source actually has the fixtures) ----------
CUPS = [
    League("ENG_CUP_efl-cup", "EFL Cup (Carabao Cup)", "England", espn="eng.league_cup"),
    League("ENG_CUP_fa-cup", "FA Cup", "England", soccerway="england/fa-cup"),
    League("ESP_CUP_copa-del-rey", "Copa del Rey", "Spain",
           espn="esp.copa_del_rey", soccerway="spain/copa-del-rey"),
    League("ITA_CUP_coppa-italia", "Coppa Italia", "Italy",
           espn="ita.coppa_italia", soccerway="italy/coppa-italia"),
    League("GER_CUP_dfb-pokal", "DFB-Pokal", "Germany",
           espn="ger.dfb_pokal", soccerway="germany/dfb-pokal"),
    League("NED_CUP_knvb-beker", "KNVB Beker", "Netherlands",
           espn="ned.cup", soccerway="netherlands/knvb-beker"),
    League("POR_CUP_taca-de-portugal", "Taça de Portugal", "Portugal",
           soccerway="portugal/taca-de-portugal"),
    League("SCO_CUP_scottish-cup", "Scottish Cup", "Scotland",
           soccerway="scotland/fa-cup"),
    League("SCO_CUP_league-cup", "Scottish League Cup", "Scotland",
           soccerway="scotland/league-cup"),
    League("AUT_CUP_ofb-cup", "OFB Cup", "Austria", soccerway="austria/ofb-cup"),
    League("SUI_CUP_swiss-cup", "Swiss Cup", "Switzerland", soccerway="switzerland/swiss-cup"),
]

# --- other tracked leagues: results + HT where available ---------------------
OTHERS = [
    # England
    League("ENG_2_championship",     "EFL Championship",          "England", espn="eng.2", fd_div="E1", fixturedl="championship-2026"),
    League("ENG_3_league-one",       "EFL League One",            "England", espn="eng.3", fd_div="E2", fixturedl="efl-league-one-2026"),
    League("ENG_4_league-two",       "EFL League Two",            "England", espn="eng.4", fd_div="E3", fixturedl="efl-league-two-2026"),
    League("ENG_5_national-league",  "National League",           "England", espn="eng.5", fd_div="EC"),
    League("ENG_6_national-league-north",  "National League North",  "England", soccerway="england/national-league-north"),
    League("ENG_6_national-league-south",  "National League South",  "England", soccerway="england/national-league-south"),
    League("ENG_7_northern-premier-league", "Northern Premier League", "England", soccerway="england/northern-premier-league"),
    # Scotland
    League("SCO_1_premiership",      "Scottish Premiership",      "Scotland", espn="sco.1", fd_div="SC0", fixturedl="scottish-premiership-2026"),
    League("SCO_2_championship",     "Scottish Championship",     "Scotland", espn="sco.2", fd_div="SC1", soccerway="scotland/championship"),
    League("SCO_3_league-one",       "Scottish League One",       "Scotland", espn="sco.3", fd_div="SC2", soccerway="scotland/league-one"),
    League("SCO_4_league-two",       "Scottish League Two",       "Scotland", espn="sco.4", fd_div="SC3", soccerway="scotland/league-two"),
    # Germany
    League("GER_2_2-bundesliga",     "2. Bundesliga",             "Germany", espn="ger.2", openligadb="bl2", fd_div="D2"),
    League("GER_3_3-liga",           "3. Liga",                   "Germany", openligadb="bl3"),
    # Rest of Europe (top-20)
    League("POR_1_primeira-liga",    "Primeira Liga",             "Portugal", espn="por.1", fd_div="P1", fixturedl="primeira-liga-2026"),
    League("NED_1_eredivisie",       "Eredivisie",                "Netherlands", espn="ned.1", fd_div="N1", fixturedl="eredivisie-2026"),
    League("BEL_1_pro-league",       "Belgian Pro League",        "Belgium", espn="bel.1", fd_div="B1"),
    League("TUR_1_super-lig",        "Süper Lig",                 "Turkey", espn="tur.1", fd_div="T1", fixturedl="super-lig-2026"),
    League("GRE_1_super-league",     "Super League Greece",       "Greece", espn="gre.1", fd_div="G1"),
    # Previously unavailable for 2026/27 - now using Soccerway as source:
    League("SUI_1_super-league",  "Swiss Super League",   "Switzerland", soccerway="switzerland/super-league"),
    League("AUT_1_bundesliga",    "Austrian Bundesliga",  "Austria",     soccerway="austria/bundesliga"),
    League("DEN_1_superliga",     "Danish Superliga",     "Denmark",     soccerway="denmark/superliga"),
    League("SWE_1_allsvenskan",   "Allsvenskan",          "Sweden",      soccerway="sweden/allsvenskan"),
    League("NOR_1_eliteserien",   "Eliteserien",          "Norway",      soccerway="norway/eliteserien"),
    League("ROU_1_liga-1",        "Liga I",               "Romania",     soccerway="romania/superliga"),
    League("RUS_1_premier-liga",  "Russian Premier Liga", "Russia",      soccerway="russia/premier-league"),
    # Ireland
    League("IRE_2_first-division",  "League of Ireland First Division",  "Ireland", soccerway="ireland/division-1"),
    League("IRE_3_national-league", "League of Ireland National League", "Ireland", soccerway="ireland/national-league"),
    # Poland
    League("POL_1_ekstraklasa",  "Ekstraklasa", "Poland", soccerway="poland/ekstraklasa"),
    League("POL_2_division-1",   "I Liga",      "Poland", soccerway="poland/division-1"),
    League("POL_3_division-2",   "II Liga",     "Poland", soccerway="poland/division-2"),
    # Belgium
    League("BEL_U21_pro-league", "Pro League U21", "Belgium", soccerway="belgium/pro-league-u21"),
    # Wales
    League("WAL_1_cymru-premier", "Cymru Premier", "Wales", soccerway="wales/cymru-premier"),
    League("WAL_2_cymru-north",   "Cymru North",   "Wales", soccerway="wales/cymru-north"),
    League("WAL_3_cymru-south",   "Cymru South",   "Wales", soccerway="wales/cymru-south"),
    # Additional European leagues (Soccerway — no ESPN/fixturedl coverage)
    League("CRO_1_hnl",          "HNL",                 "Croatia",        soccerway="croatia/hnl"),
    League("CZE_1_chance-liga",  "Chance Liga",         "Czech Republic", soccerway="czech-republic/1-liga"),
    League("UKR_1_premier-league", "Ukrainian Premier League", "Ukraine", soccerway="ukraine/premier-league"),
    League("CYP_1_first-division", "Cyprus League",     "Cyprus",         soccerway="cyprus/first-division"),
    League("SVK_1_nike-liga",    "Nike Liga",           "Slovakia",       soccerway="slovakia/fortuna-liga"),
    League("SVN_1_prva-liga",    "Prva Liga",           "Slovenia",       soccerway="slovenia/prva-liga"),
    League("FIN_1_veikkausliiga", "Veikkausliiga",      "Finland",        soccerway="finland/veikkausliiga"),
    League("KAZ_1_premier-league", "Kazakhstan Premier League", "Kazakhstan", soccerway="kazakhstan/premier-league"),
    # European second tiers (ESPN)
    League("ESP_2_segunda-division", "Segunda División", "Spain",   espn="esp.2"),
    League("ITA_2_serie-b",       "Serie B",            "Italy",   espn="ita.2"),
    League("FRA_2_ligue-2",       "Ligue 2",            "France",  espn="fra.2", fixturedl="ligue-2-2026"),
    League("NED_2_eerste-divisie", "Eerste Divisie",    "Netherlands", espn="ned.2"),
    # Global majors (ESPN; calendar_year = Jan-Dec season window)
    League("BRA_1_serie-a",  "Brasileirão Série A", "Brazil", espn="bra.1", calendar_year=True),
    League("BRA_2_serie-b",  "Série B",             "Brazil", espn="bra.2", calendar_year=True),
    League("ARG_1_liga-profesional", "Liga Profesional", "Argentina", espn="arg.1", calendar_year=True),
    League("ARG_2_primera-nacional", "Primera Nacional", "Argentina", espn="arg.2", calendar_year=True),
    League("MEX_1_liga-mx",  "Liga MX",             "Mexico", espn="mex.1", calendar_year=True),
    League("MEX_2_liga-expansion", "Liga de Expansión MX", "Mexico", espn="mex.2", calendar_year=True),
    League("USA_1_mls",      "Major League Soccer", "United States", espn="usa.1", fixturedl="mls-2026", calendar_year=True),
    League("JPN_1_j1-league", "J1 League",          "Japan", espn="jpn.1", calendar_year=True),
    League("AUS_1_a-league", "A-Leagues",           "Australia", espn="aus.1"),
    League("CHN_1_super-league", "Chinese Super League", "China", espn="chn.1", calendar_year=True),
]

ALL: list[League] = TOP5 + UEFA + CUPS + OTHERS

BY_FOLDER: dict[str, League] = {lg.folder: lg for lg in ALL}
