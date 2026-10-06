"""football-data.co.uk client (keyless CSV, current season).

Used for: (a) historical GWs of the current season (ESPN ?dates= is dead),
(b) match stats columns (shots/targets/fouls/corners/cards).
URLs 302-redirect, so urllib must follow redirects (it does by default).
"""
from __future__ import annotations
import csv
import io
from datetime import datetime
from httpx_util import get

BASE = "https://www.football-data.co.uk/mmz4281/{season}/{div}.csv"


def _int(v):
    return int(v) if v else None


def fetch_division(div: str, season: str = "2627") -> list[dict]:
    """Return all rows of a division's current-season CSV as normalised dicts."""
    raw = get(BASE.format(season=season, div=div), binary=True)
    text = raw.decode("cp1252", errors="replace")  # fd files are latin-1/cp1252
    rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for r in rows:
        try:
            d = datetime.strptime(r.get("Date", ""), "%d/%m/%Y").date().isoformat()
        except ValueError:
            d = None
        out.append({
            "source": "fd.co.uk",
            "source_id": f"{div}-{r.get('Date','')}-{r.get('HomeTeam','')}",
            "date": d,
            "time": r.get("Time") or None,
            "home": r.get("HomeTeam"),
            "away": r.get("AwayTeam"),
            "ft_home": _int(r.get("FTHG")),
            "ft_away": _int(r.get("FTAG")),
            "ht_home": _int(r.get("HTHG")),
            "ht_away": _int(r.get("HTAG")),
            "home_shots": _int(r.get("HS")), "away_shots": _int(r.get("AS")),
            "home_target": _int(r.get("HST")), "away_target": _int(r.get("AST")),
            "home_fouls": _int(r.get("HF")), "away_fouls": _int(r.get("AF")),
            "home_corners": _int(r.get("HC")), "away_corners": _int(r.get("AC")),
            "home_yellow": _int(r.get("HY")), "away_yellow": _int(r.get("AY")),
            "home_red": _int(r.get("HR")), "away_red": _int(r.get("AR")),
        })
    return out
