"""ESPN keyless site API client.

Verified behaviour (probed 2026-10-06/09):
- The default scoreboard returns the CURRENT round only (pre/post mixed).
- ?dates=YYYYMM returns the WHOLE month (past results + future pre events);
  verified on sco.2/bel.1/gre.1 etc. Range format (YYYYMMDD-YYYYMMDD) -> HTTP 400.
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

# Aug (season start) -> following May; month-by-month is the only reliable
# ESPN filter (default board = current round only).
_SEASON_MONTHS = [f"{y}{m:02d}"
                  for y in (SEASON, SEASON + 1)
                  for m in range(1, 13)
                  if (y == SEASON and m >= 8) or (y == SEASON + 1 and m <= 5)]


def fetch_league(slug: str) -> list[dict]:
    """Return normalised matches for one league, fetched month-by-month
    across the whole 2026/27 season (Aug 2026 - May 2027)."""
    out = []
    seen: set[str] = set()
    for ym in _SEASON_MONTHS:
        try:
            d = get_json(f"{BASE}/{slug}/scoreboard?dates={ym}")
        except RuntimeError:
            continue  # transient/month-empty; other months still fill the gap
        for ev in d.get("events", []):
            eid = str(ev["id"])
            if eid in seen:
                continue
            seen.add(eid)
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
                "source_id": eid,
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
