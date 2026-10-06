"""ESPN keyless site API client.

Verified behaviour (probed 2026-10-06):
- The default scoreboard returns the CURRENT round only (pre/post mixed);
  the ?dates= history filter is unreliable for 2026/27 soccer.
- Scheduled matches carry score "0" on competitors, so scores are only
  trusted when the match is completed (state == "post").
- Goal minutes come from /summary?event=<id> keyEvents (top-5 leagues only).
"""
from __future__ import annotations
from httpx_util import get_json

BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


SEASON = 2026  # 2026/27; skip events from stale previous-season boards


def fetch_league(slug: str) -> list[dict]:
    """Return normalised matches from the current scoreboard of one league."""
    d = get_json(f"{BASE}/{slug}/scoreboard")
    out = []
    for ev in d.get("events", []):
        if (ev.get("season") or {}).get("year") not in (None, SEASON):
            continue  # league off-season replays last season's board
        comp = ev["competitions"][0]
        state = ev["status"]["type"]["state"]  # pre | in | post
        completed = bool(ev["status"]["type"].get("completed"))
        home = away = None
        for t in comp.get("competitors", []):
            if t.get("homeAway") == "home":
                home = t
            else:
                away = t
        if not home or not away:
            continue
        ft_h = ft_a = None
        if completed:  # only trust scores of finished matches
            ft_h = _num(home.get("score"))
            ft_a = _num(away.get("score"))
        out.append({
            "source": "espn",
            "source_id": str(ev["id"]),
            "date": ev.get("date", "")[:10],
            "kickoff_utc": ev.get("date"),
            "home": home["team"]["displayName"],
            "away": away["team"]["displayName"],
            "ft_home": ft_h,
            "ft_away": ft_a,
            "ht_home": None,
            "ht_away": None,
            "status": state,
        })
    return out


def fetch_goal_minutes(slug: str, event_id: str) -> list[int]:
    """Goal minutes (injured time folded in, e.g. 90+2 -> 92) for one match."""
    try:
        d = get_json(f"{BASE}/{slug}/summary?event={event_id}")
    except RuntimeError:
        return []
    minutes: list[int] = []
    for k in d.get("keyEvents", []) or []:
        t = (k.get("type") or {}).get("text", "")
        if t in ("Goal", "Penalty - Scored", "Own Goal"):
            clock = (k.get("clock") or {}).get("displayValue", "")  # e.g. "90'+2'"
            base = "".join(ch for ch in clock.split("'")[0] if ch.isdigit())
            extra = "".join(ch for ch in clock.split("+")[-1].strip("'") if ch.isdigit()) if "+" in clock else ""
            m = int(base or 0) + (int(extra) if extra else 0)
            if m:
                minutes.append(m)
    return sorted(minutes)
