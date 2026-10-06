"""fixturedownload.com client (keyless JSON feeds).

Per-competition feed = FULL season: every match with its real round number
(gameweek), kickoff, teams and scores (filled in as results come in).
This is the fixture/GW spine for the leagues it covers; scores are merged
with football-data.co.uk (stats) and ESPN (freshness edge) downstream.
Feed shape: [{MatchNumber, RoundNumber, DateUtc, Location, HomeTeam,
AwayTeam, Group, HomeTeamScore, AwayTeamScore}, ...]
"""
from __future__ import annotations
from httpx_util import get_json

BASE = "https://fixturedownload.com/feed/json/{slug}"


def _score(v):
    if v in (None, "", "null"):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def fetch(slug: str) -> list[dict]:
    raw = get_json(BASE.format(slug=slug))
    out = []
    for m in raw:
        date = (m.get("DateUtc") or "")[:10]
        out.append({
            "source": "fixturedl",
            "source_id": f"{slug}-{m.get('MatchNumber')}",
            "gw": m.get("RoundNumber"),
            "date": date,
            "kickoff_utc": m.get("DateUtc"),
            "home": m.get("HomeTeam"),
            "away": m.get("AwayTeam"),
            "ft_home": _score(m.get("HomeTeamScore")),
            "ft_away": _score(m.get("AwayTeamScore")),
            "ht_home": None,
            "ht_away": None,
            "status": "post" if _score(m.get("HomeTeamScore")) is not None else "pre",
        })
    return out
