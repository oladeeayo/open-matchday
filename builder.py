"""Normalise + merge multi-source rows into the canonical match record, and
write the per-league folder structure:

  data/<COUNTRY>_<TIER>_<league>/
      results_<season>.csv    finished matches (GW, date, teams, FT, HT, minutes)
      fixtures_<season>.csv   upcoming matches
      goals_<season>.csv      goal-by-goal (only leagues with goal-minute data)

Gameweek: OpenLigaDB and fixturedownload supply true round numbers; elsewhere
GW is derived by clustering matches into Mon-Sun weeks (GW1 = first week with
matches). Deterministic across incremental runs.

Results/fixtures split is by score availability: ft scores null => fixture.
"""
from __future__ import annotations
import csv
import os
import re
import unicodedata
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

import espn_client
import openligadb_client
import fd_client
import fixturedl_client
import soccerway_client
from leagues import League

CANON = ["gw", "date", "time", "home", "away",
         "ft_home", "ft_away", "ft_result",
         "ht_home", "ht_away", "ht_result",
         "home_shots", "away_shots", "home_target", "away_target",
         "home_fouls", "away_fouls", "home_corners", "away_corners",
         "home_yellow", "away_yellow", "home_red", "away_red",
         "goal_minutes", "source"]

MERGE_STATS: dict = {}


def norm_team(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def result(h, a):
    if h is None or a is None:
        return ""
    return "H" if h > a else ("A" if h < a else "D")


def _parse_date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(s)
    except (TypeError, ValueError):
        return None


def _week_monday(date_iso: str) -> dt.date | None:
    d = _parse_date(date_iso)
    return d - dt.timedelta(days=d.weekday()) if d else None


# --- team-name resolution ----------------------------------------------------
# Keys are norm_team() forms (lowercase, no spaces/punct). Values are display
# names, chosen to equal the fixturedownload spine name where known so the
# alias-resolved equality path fires. Extend freely.
_TEAM_ALIASES = {
    # England (fd.co.uk + ESPN short forms)
    "manutd": "Manchester United", "manunited": "Manchester United",
    "mancity": "Manchester City",
    "manchesterunited": "Manchester United", "manchestercity": "Manchester City",
    "spurs": "Tottenham Hotspur", "tottenhamhotspur": "Tottenham Hotspur",
    "wolverhampton": "Wolverhampton Wanderers",
    "nottinghamforest": "Nottingham Forest",
    "brightonhovealbion": "Brighton and Hove Albion",
    "nottmforest": "Nottingham Forest", "nottforest": "Nottingham Forest",
    "wolves": "Wolverhampton Wanderers", "spurs": "Tottenham Hotspur",
    "tottenham": "Tottenham Hotspur", "westbrom": "West Bromwich Albion",
    "sheffieldutd": "Sheffield United", "sheffieldwed": "Sheffield Wednesday",
    "preston": "Preston North End", "qpr": "Queens Park Rangers",
    "stoke": "Stoke City", "hull": "Hull City", "derby": "Derby County",
    "charlton": "Charlton Athletic", "blackburn": "Blackburn Rovers",
    "coventry": "Coventry City", "norwich": "Norwich City",
    "watford": "Watford", "millwall": "Millwall", "birmingham": "Birmingham City",
    "huddersfield": "Huddersfield Town", "bolton": "Bolton Wanderers",
    "ipswich": "Ipswich Town", "portsmouth": "Portsmouth",
    "southampton": "Southampton", "leeds": "Leeds United",
    "brighton": "Brighton and Hove Albion", "bournemouth": "AFC Bournemouth",
    "crystalpalace": "Crystal Palace", "newcastle": "Newcastle United",
    "mancity": "Manchester City",  # also maps fd-style 'Man City' -> city name
    "sunderland": "Sunderland", "middlesbrough": "Middlesbrough",
    "wrexham": "Wrexham",
    # Spain (fd abbreviations)
    "athmadrid": "Atletico Madrid", "athbilbao": "Athletic Bilbao",
    "athleticclub": "Athletic Bilbao", "athletic": "Athletic Bilbao",
    "espanol": "Espanyol", "vallecano": "Rayo Vallecano",
    "betis": "Real Betis", "sociedad": "Real Sociedad",
    "celta": "Celta Vigo", "alaves": "Deportivo Alaves",
    "lacoruna": "RC Deportivo", "santander": "R. Racing Club",
    "malaga": "Malaga CF", "elche": "Elche CF", "getafe": "Getafe CF",
    "barcelona": "FC Barcelona", "sevilla": "Sevilla FC",
    "valencia": "Valencia CF", "villarreal": "Villarreal CF",
    "osasuna": "CA Osasuna", "levante": "Levante UD",
    # Germany (fd abbreviations; umlaut clubs alias straight to spine names)
    "dortmund": "Borussia Dortmund", "hamburg": "Hamburger SV",
    "mgladbach": "Borussia Monchengladbach", "gladbach": "Borussia Monchengladbach",
    "mainz": "Mainz 05", "koln": "FC Koln", "fckoln": "FC Koln",
    "koeln": "FC Koln", "bayern": "FC Bayern Munchen",
    "bayernmunich": "FC Bayern Munchen", "bayernmunchen": "FC Bayern Munchen",
    "leverkusen": "Bayer Leverkusen", "bremen": "Werder Bremen",
    "stuttgart": "VfB Stuttgart", "hoffenheim": "TSG Hoffenheim",
    "paderborn": "SC Paderborn 07", "augsburg": "FC Augsburg",
    "elversberg": "SV Elversberg", "freiburg": "SC Freiburg",
    "unionberlin": "FC Union Berlin", "stpauli": "FC St. Pauli",
    "heidenheim": "FC Heidenheim", "darmstadt": "Darmstadt 98",
    "hannover": "Hannover 96", "herthabsc": "Hertha BSC", "hertha": "Hertha BSC",
    "fortunadusseldorf": "Fortuna Dusseldorf", "nurnberg": "1. FC Nurnberg",
    "karlsruher": "Karlsruher SC", "duisburg": "MSV Duisburg",
    # France (fd abbreviations)
    "parissg": "Paris Saint-Germain", "parissaintgermain": "Paris Saint-Germain",
    "lyon": "Olympique Lyonnais", "marseille": "Olympique de Marseille",
    "monaco": "AS Monaco", "lille": "LOSC Lille", "lens": "RC Lens",
    "rennes": "Stade Rennais FC", "nice": "OGC Nice",
    "angers": "Angers SCO", "auxerre": "AJ Auxerre", "toulouse": "Toulouse FC",
    "lehavre": "Le Havre", "lorient": "FC Lorient",
    "strasbourg": "RC Strasbourg Alsace", "troyes": "Estac Troyes",
    "nantes": "FC Nantes", "metz": "FC Metz",
    # Netherlands (fd abbreviations)
    "psv": "PSV", "psveindhoven": "PSV", "azalkmaar": "AZ", "az": "AZ",
    "feyenoord": "Feyenoord", "ajax": "Ajax",
    "forsittard": "Fortuna Sittard", "denhaag": "ADO Den Haag",
    "goaheadeagles": "Go Ahead Eagles", "spartarotterdam": "Sparta Rotterdam",
    "twente": "FC Twente", "utrecht": "FC Utrecht",
    "groningen": "FC Groningen", "heerenveen": "sc Heerenveen",
    "willemii": "Willem II", "excelsior": "Excelsior Rotterdam",
    "telstar": "Telstar", "zwolle": "PEC Zwolle", "cambuur": "SC Cambuur",
    # Portugal (fd abbreviations)
    "academico": "Academico Viseu", "estoril": "Estoril Praia",
    "alverca": "FC Alverca", "rioave": "Rio Ave FC", "riove": "Rio Ave FC",
    "gilvicente": "Gil Vicente FC", "gilvicentefc": "Gil Vicente FC",
    "guimaraes": "Vitória SC", "vguimaraes": "Vitória SC",
    "vitoriasc": "Vitória SC",
    "maritimo": "Maritimo M.", "benfica": "SL Benfica",
    "casapia": "Casa Pia AC", "moreirense": "Moreirense FC",
    "nacional": "CD Nacional", "santaclara": "Santa Clara",
    "famalicao": "FC Famalicão", "arouca": "FC Arouca",
    "splisbon": "Sporting CP", "spbraga": "SC Braga",
    "guimaraes": "Vitoria Guimaraes", "porto": "FC Porto",
    "estrela": "Estrela Amadora", "famalicao": "Famalicao",
    "gilvicente": "Gil Vicente", "nacional": "Nacional",
    "casapia": "Casa Pia", "moreirense": "Moreirense",
    "rioave": "Rio Ave", "santaclara": "Santa Clara",
    "arouca": "Arouca", "estoril": "Estoril", "alverca": "Alverca",
    "academicoviseu": "Academico Viseu",
    # Turkey (fd abbreviations)
    "buyuksehyr": "Basaksehir", "goztep": "Goztepe",
    "gaziantep": "Gaziantep FK", "genclerbirligi": "Genclerbirligi",
    "kasimpasa": "Kasimpasa", "kocaelispor": "Kocaelispor",
    "rizespor": "Rizespor", "samsunspor": "Samsunspor",
    "trabzonspor": "Trabzonspor", "alanyaspor": "Alanyaspor",
    "amedspor": "Amedspor", "galatasaray": "Galatasaray",
    "fenerbahce": "Fenerbahce", "besiktas": "Besiktas",
    # Greece (fd uses short forms)
    "olympiacos": "Olympiacos", "panathinaikos": "Panathinaikos",
    "aekathens": "AEK Athens", "paok": "PAOK",
}

# Tokens that alone must never confirm a match: two different clubs can share
# them (Paris FC vs PSG, FC Barcelona vs Espanyol de Barcelona, Real vs
# Atletico Madrid, Sheffield Utd vs Sheffield Wednesday, Man Utd vs ... Utd).
_AMBIG_TOKENS = {"paris", "barcelona", "madrid", "sheffield", "bristol",
                 "nottingham", "united",
                 "manchester", "real", "sporting", "athletic", "racing",
                 "deportivo", "city", "town", "county", "rovers",
                 "wanderers", "dynamo", "spartak", "lokomotiv", "national"}

# tokens too generic to distinguish clubs (short ones dropped by length)
_GENERIC_TOKENS = {"club", "the", "calcio", "fussball", "football", "futbol"}


def _tokens(name: str) -> set[str]:
    """Accent-folded significant tokens of a team name."""
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return {t for t in s.split() if len(t) >= 4 and t not in _GENERIC_TOKENS}


def _same_team(a: str, b: str) -> bool:
    """Team-name match: resolve aliases, then (1) normalised equality,
    (2) token-set equality, (3) >=2 shared tokens, (4) ONE shared token only
    if it is >=5 chars and not generic/ambiguous (malaga, brest, porto...),
    (5) single-significant-token side contained in the other side's name.
    'Stoke City' vs 'Manchester City' share only the generic 'city' -> no."""
    na, nb = norm_team(a or ""), norm_team(b or "")
    ra = _TEAM_ALIASES.get(na, a or "")
    rb = _TEAM_ALIASES.get(nb, b or "")
    if norm_team(ra) and norm_team(ra) == norm_team(rb):
        return True
    ta, tb = _tokens(ra), _tokens(rb)
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    inter = ta & tb
    if len(inter) >= 2:
        return True
    if len(inter) == 1:
        tok = next(iter(inter))
        if len(tok) >= 5 and tok not in _AMBIG_TOKENS:
            return True
    # rule 5: one side is a SINGLE significant token -> test it against the
    # OTHER side's name/tokens only (never its own - that self-matched and
    # collapsed whole leagues).
    sa = next(iter(ta)) if len(ta) == 1 else None
    sb = next(iter(tb)) if len(tb) == 1 else None
    for s, other_norm, other_tokens in (
            (sa, norm_team(rb), tb),
            (sb, norm_team(ra), ta)):
        if not s or s in _AMBIG_TOKENS or len(s) < 5:
            continue
        if s in other_norm:  # 'malaga' in 'malagacf'
            return True
        for o in other_tokens:
            if o == s:
                continue
            if (len(s) >= 5 and (o.startswith(s) or o.endswith(s))) or \
               (len(o) >= 5 and (s.startswith(o) or s.endswith(o))):
                return True  # 'hamburg'/'hamburger', 'brest'/'brestois'
    return False


def _same_match(x: dict, y: dict, tol_days: int = 3) -> bool:
    """Date (+/- tol for provider schedule drift) + fuzzy team-name match.
    ±3d: generous enough for kickoff-day moves, far enough from the next GW
    (~1 week later) that the same pairing can never be conflated."""
    dx, dy = _parse_date(x.get("date")), _parse_date(y.get("date"))
    if not dx or not dy or abs((dx - dy).days) > tol_days:
        return False
    return (_same_team(x.get("home", ""), y.get("home", ""))
            and _same_team(x.get("away", ""), y.get("away", "")))


def assign_gw(rows: list[dict]) -> None:
    """Fill rows[i]['gw'] by Mon-Sun clustering (only rows lacking a gw)."""
    weeks = sorted({w for r in rows if (w := _week_monday(r.get("date") or ""))})
    week_no = {w: i + 1 for i, w in enumerate(weeks)}
    for r in rows:
        if r.get("gw") in (None, ""):
            w = _week_monday(r.get("date") or "")
            r["gw"] = week_no.get(w, "")


def utc_to_cet_time(kickoff: str | None, fd_time: str | None) -> str:
    if fd_time:
        return fd_time
    if not kickoff:
        return ""
    try:
        t = dt.datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
        # CET-1 display convention (matches football-data.co.uk files)
        return (t + dt.timedelta(hours=1)).strftime("%H:%M")
    except ValueError:
        return ""


def merge(rows: list[dict]) -> list[dict]:
    """Priority: openligadb (authoritative DE) > fixturedl (true GW + season
    coverage) > espn (freshest FT) > fd.co.uk (stats/HT backfill).

    fd rows are merged when they match EXACTLY ONE already-merged row; on
    ambiguity (e.g. both Madrid clubs on one day) they are dropped so they
    can never corrupt a spine row. Non-fd sources are appended on no-match.
    """
    rank = {"openligadb": 0, "fixturedl": 1, "espn": 2, "fd.co.uk": 3}
    merged: list[dict] = []
    dropped_fd = 0
    for r in sorted(rows, key=lambda x: rank.get(x.get("source"), 9)):
        src = r.get("source")
        cands = [m for m in merged if _same_match(m, r)]
        if src == "fd.co.uk" and len(cands) > 1:
            dropped_fd += 1
            continue
        tgt = cands[0] if cands else None
        if tgt is None:
            merged.append(dict(r))
            continue
        for f, v in r.items():
            if f in ("source", "source_id", "goals"):
                continue
            if v in (None, "", []):
                continue
            if tgt.get(f) in (None, "", []):
                tgt[f] = v
            elif f in ("ft_home", "ft_away", "ht_home", "ht_away"):
                tgt[f] = v  # fresher source wins for scores
    MERGE_STATS["dropped_fd"] = dropped_fd
    return merged


def dedupe_fixtures(rows: list[dict]) -> tuple[list[dict], int]:
    """Same-pairing matches: drop EXACT beating-fuzzy duplicates only, with a
    strict ±2d date window (GW spacing ~1 week means a wider window risks
    eating the *next* legit meeting of the same pair). "+/-": a postponed
    match keeps its fresh re-arranged result; the stale pre-move fixture
    (dates within ±2d of a real result) is dropped instead."""
    def exact(x, y):
        dx, dy = _parse_date(x.get("date")), _parse_date(y.get("date"))
        if not dx or not dy or abs((dx - dy).days) > 2:
            return False
        return (norm_team(x.get("home", "")) == norm_team(y.get("home", ""))
                and norm_team(x.get("away", "")) == norm_team(y.get("away", "")))

    def fuzzy2(x, y):
        dx, dy = _parse_date(x.get("date")), _parse_date(y.get("date"))
        if not dx or not dy or abs((dx - dy).days) > 2:
            return False
        return _same_match(x, y, tol_days=2)

    rank = {"openligadb": 0, "fixturedl": 1, "espn": 2, "fd.co.uk": 3}
    rows_by_rank = sorted(rows, key=lambda x: rank.get(x.get("source"), 9))
    played = [k for k in rows_by_rank if k.get("ft_result") in ("H", "D", "A")]
    kept: list[dict] = []
    dropped = 0
    for r in rows_by_rank:
        if r.get("ft_result") in ("H", "D", "A"):
            if any(exact(k, r) or fuzzy2(k, r) for k in kept if k.get("ft_result") in ("H", "D", "A")):
                dropped += 1
                continue
        else:
            # stale fixture of a played match: drop in favour of the result
            if any(fuzzy2(k, r) for k in played):
                dropped += 1
                continue
            dup = [k for k in kept if k.get("ft_result") not in ("H", "D", "A") and fuzzy2(k, r)]
            if dup:
                dropped += 1
                continue
        kept.append(r)
    return kept, dropped


def finalize(rows: list[dict]) -> list[dict]:
    for r in rows:
        has_ft = r.get("ft_home") is not None and r.get("ft_away") is not None
        if not has_ft:  # unplayed: scrub any leaked score fields
            r["ft_home"] = r["ft_away"] = None
            r["ft_result"] = ""
        else:
            r["ft_result"] = result(r.get("ft_home"), r.get("ft_away"))
        r["ht_result"] = result(r.get("ht_home"), r.get("ht_away"))
        r["time"] = utc_to_cet_time(r.get("kickoff_utc"), r.get("time"))
        g = r.get("goals")
        if isinstance(g, list):
            r["goal_minutes"] = ",".join(str(x.get("minute")) for x in g if x.get("minute"))
            r["_goals"] = g
        else:
            r["goal_minutes"] = r.get("goal_minutes") or ""
    assign_gw(rows)
    return sorted(rows, key=lambda r: (r.get("date") or "", r.get("time") or "", r.get("home") or ""))


def fetch_goal_minutes_threaded(lg: League, matches: list[dict]) -> None:
    """Attach goal minutes to finished ESPN matches (top-5 leagues only)."""
    todo = [m for m in matches
            if m.get("source") == "espn" and m.get("status") == "post"
            and m.get("ft_home") is not None and not m.get("goal_minutes")]
    if not todo:
        return

    def work(m):
        return m, espn_client.fetch_goal_minutes(lg.espn, m["source_id"])

    with ThreadPoolExecutor(max_workers=6) as ex:
        for m, mins in ex.map(work, todo):
            m["goal_minutes"] = ",".join(str(x) for x in mins)


def build_league(lg: League, season: str) -> dict:
    rows: list[dict] = []
    errors: list[str] = []

    if lg.openligadb:
        try:
            rows += openligadb_client.fetch_league(lg.openligadb)
        except Exception as e:  # noqa: BLE001
            errors.append(f"openligadb: {e}")
    if lg.fixturedl:
        try:
            rows += fixturedl_client.fetch(lg.fixturedl)
        except Exception as e:  # noqa: BLE001
            errors.append(f"fixturedl: {e}")
    if lg.espn:
        try:
            espn_rows = espn_client.fetch_league(lg.espn)
            if lg.goal_minutes:
                fetch_goal_minutes_threaded(lg, espn_rows)
            rows += espn_rows
        except Exception as e:  # noqa: BLE001
            errors.append(f"espn: {e}")
    if lg.fd_div:
        try:
            rows += fd_client.fetch_division(lg.fd_div, season)
        except Exception as e:  # noqa: BLE001
            errors.append(f"fd: {e}")
    if lg.soccerway:
        try:
            rows += soccerway_client.fetch_league(lg.soccerway)
        except Exception as e:  # noqa: BLE001
            errors.append(f"soccerway: {e}")

    rows = merge(rows)
    rows, dup_fx = dedupe_fixtures(rows)
    rows = finalize(rows)
    dropped = MERGE_STATS.pop("dropped_fd", 0)

    results = [r for r in rows if r.get("ft_result") in ("H", "D", "A")]
    fixtures = [r for r in rows if r.get("ft_result") not in ("H", "D", "A")]

    folder = os.path.join("data", lg.folder)
    os.makedirs(folder, exist_ok=True)

    with open(os.path.join(folder, f"results_{season}.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CANON, extrasaction="ignore")
        w.writeheader()
        w.writerows({c: r.get(c, "") for c in CANON} for r in results)

    with open(os.path.join(folder, f"fixtures_{season}.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["gw", "date", "time", "home", "away"])
        for r in fixtures:
            w.writerow([r.get(c, "") for c in ("gw", "date", "time", "home", "away")])

    write_goals = lg.goal_minutes or lg.openligadb  # OpenLigaDB always has goal data
    if write_goals:
        with open(os.path.join(folder, f"goals_{season}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["gw", "date", "home", "away", "minute", "score_home", "score_away", "scorer"])
            for r in results:
                for g in r.get("_goals") or []:
                    w.writerow([r.get("gw"), r.get("date"), r.get("home"), r.get("away"),
                                g.get("minute"), g.get("score_h"), g.get("score_a"), g.get("scorer")])
                if r.get("goal_minutes") and not (r.get("_goals")):
                    for m in str(r["goal_minutes"]).split(","):
                        if m:
                            w.writerow([r.get("gw"), r.get("date"), r.get("home"), r.get("away"), m, "", "", ""])

    return {"league": lg.name, "folder": folder, "dropped_fd": dropped,
            "dropped_dup_fixtures": dup_fx, "results": len(results),
            "fixtures": len(fixtures), "errors": errors,
            "latest": max((r.get("date") or "") for r in results) if results else ""}
