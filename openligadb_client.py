"""OpenLigaDB client (keyless): authoritative for German leagues.

Gives matchday numbers, FT and half-time results, and goal minutes+scorers.
Endpoints used (all keyless, no auth):
  GET https://api.openligadb.de/getmatchdata/<bl1|bl2|bl3>/2026
"""
from __future__ import annotations
from httpx_util import get_json

BASE = "https://api.openligadb.de/getmatchdata"


def fetch_league(shortcut: str, season: int = 2026) -> list[dict]:
    raw = get_json(f"{BASE}/{shortcut}/{season}")
    out = []
    for m in raw:
        teams_ok = m.get("team1") and m.get("team2")
        if not teams_ok:
            continue
        ft = ht = None
        for r in m.get("matchResults", []) or []:
            if r.get("resultTypeID") == 2:
                ft = (r.get("pointsTeam1"), r.get("pointsTeam2"))
            elif r.get("resultTypeID") == 1:
                ht = (r.get("pointsTeam1"), r.get("pointsTeam2"))
        goals = [
            {
                "minute": g.get("matchMinute"),
                "score_h": g.get("scoreTeam1"),
                "score_a": g.get("scoreTeam2"),
                "scorer": g.get("goalGetterName"),
            }
            for g in (m.get("goals") or [])
            if g.get("matchMinute")
        ]
        out.append({
            "source": "openligadb",
            "source_id": str(m.get("matchID")),
            "gw": (m.get("group") or {}).get("groupOrderID"),
            "date": (m.get("matchDateTimeUTC") or m.get("matchDateTime") or "")[:10],
            "kickoff_utc": m.get("matchDateTimeUTC") or m.get("matchDateTime"),
            "home": m["team1"].get("teamName"),
            "away": m["team2"].get("teamName"),
            "ft_home": ft[0] if ft else None,
            "ft_away": ft[1] if ft else None,
            "ht_home": ht[0] if ht else None,
            "ht_away": ht[1] if ht else None,
            "status": "post" if m.get("matchIsFinished") else "pre",
            "goals": goals,
        })
    return out
