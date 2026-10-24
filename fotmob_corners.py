"""Fotmob per-match corner scraper for the top-10 European leagues.

Fotmob's keyless public API exposes team match statistics split by period
(All / FirstHalf / SecondHalf). Corners are available in every period, so one
matchDetails request gives home/away corners for the whole match and for each
half. Finished matches are immutable, so responses are cached locally.

Coverage (verified 2026-10): all 10 leagues below return corners in all three
periods. Any league not listed here is skipped (columns stay empty).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import time
import unicodedata
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from httpx_util import UA

# folder -> Fotmob league id (2026/27 top-10 European first divisions)
CORNER_LEAGUES: dict[str, int] = {
    "ENG_1_premier-league": 47,
    "ESP_1_la-liga": 87,
    "ITA_1_serie-a": 55,
    "GER_1_bundesliga": 54,
    "FRA_1_ligue-1": 53,
    "NED_1_eredivisie": 57,
    "POR_1_primeira-liga": 61,
    "BEL_1_pro-league": 40,
    "TUR_1_super-lig": 71,
    "GRE_1_super-league": 135,
}

LEAGUE_URL = "https://www.fotmob.com/leagues/{league_id}/overview"
MATCH_URL = "https://www.fotmob.com/api/data/matchDetails?matchId={match_id}"
CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          ".cache", "fotmob_corners.json")

# Turkish dotless i and other letters that NFKD cannot fold to ASCII.
_FOLD = str.maketrans({"ı": "i", "ş": "s", "ğ": "g", "ç": "c", "ö": "o",
                       "ü": "u", "İ": "i", "Ş": "s", "Ğ": "g", "Ç": "c",
                       "Ö": "o", "Ü": "u", "ñ": "n"})


def _fold(s: str) -> str:
    s = (s or "").translate(_FOLD)
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def _get(url: str, retries: int = 3) -> str:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json,text/html",
            })
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            if attempt == retries:
                raise
            time.sleep(1.5 * attempt)
    raise RuntimeError("unreachable")


def _score(status: dict) -> tuple[int, int] | None:
    """Parse status.scoreStr ("3 - 0") into (home, away); None if absent."""
    parts = re.findall(r"\d+", status.get("scoreStr") or "")
    if len(parts) < 2:
        return None
    return int(parts[0]), int(parts[1])


def _league_matches(league_id: int) -> list[dict]:
    html = _get(LEAGUE_URL.format(league_id=league_id))
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                  html, re.DOTALL)
    if not m:
        return []
    data = json.loads(m.group(1))
    fixtures = (data.get("props", {}).get("pageProps", {})
                .get("fixtures", {}) or {}).get("allMatches", [])
    out = []
    for f in fixtures:
        status = f.get("status") or {}
        if not status.get("finished"):
            continue
        out.append({
            "id": f.get("id"),
            "date": (status.get("utcTime") or "")[:10],
            "home": (f.get("home") or {}).get("name", ""),
            "away": (f.get("away") or {}).get("name", ""),
            "ft": _score(status),
        })
    return out


def _corners(md: dict) -> list[int] | None:
    """Return [home_total, away_total, home_1h, away_1h, home_2h, away_2h]."""
    periods = (((md.get("content") or {}).get("stats") or {})
               .get("Periods") or {})

    def period(keys: tuple[str, ...]) -> tuple[int, int] | None:
        for key in keys:
            for section in (periods.get(key) or {}).get("stats", []):
                for stat in section.get("stats", []):
                    if stat.get("key") != "corners" and stat.get("title") != "Corners":
                        continue
                    vals = stat.get("stats") or []
                    if len(vals) >= 2 and vals[0] is not None and vals[1] is not None:
                        return int(vals[0]), int(vals[1])
        return None

    total = period(("All",))
    first = period(("FirstHalf", "First Half"))
    second = period(("SecondHalf", "Second Half"))
    if total is None and first is not None and second is not None:
        total = (first[0] + second[0], first[1] + second[1])
    if total is None and first is None and second is None:
        return None
    h1, a1 = first if first else (None, None)
    h2, a2 = second if second else (None, None)
    ht, at = total if total else (None, None)
    return [ht, at, h1, a1, h2, a2]


def _complete(c) -> bool:
    """All six values present. Partial responses (corners totals published
    before the half split, or a not-quite-finished match) are never cached,
    so the next build retries them."""
    return isinstance(c, list) and len(c) == 6 and all(v is not None for v in c)


def _load_cache() -> dict[str, list | None]:
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_cache(cache: dict[str, list | None]) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    tmp = CACHE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, separators=(",", ":"))
    os.replace(tmp, CACHE_PATH)


def _fetch_one(match_id: int) -> list[int] | None:
    md = json.loads(_get(MATCH_URL.format(match_id=match_id)))
    return _corners(md)


def _parse(date_iso) -> dt.date:
    return dt.date.fromisoformat(date_iso)


def _same(r: dict, m: dict) -> bool:
    import builder  # lazy: builder imports this module at module load

    if builder._same_match(r, m):
        return True
    a = {**r, "home": _fold(r.get("home", "")), "away": _fold(r.get("away", ""))}
    b = {**m, "home": _fold(m.get("home", "")), "away": _fold(m.get("away", ""))}
    return builder._same_match(a, b)


def _loose(r: dict, m: dict) -> bool:
    """Score-aware fallback: same ±3d window and at least one shared team
    token on each side. Needed when the builder's conservative matcher
    refuses an ambiguous short name ("Deportivo" = Deportivo A Coruña, not
    Deportivo Alavés); callers only accept the result when the FT score
    leaves exactly one candidate."""
    try:
        if abs((_parse(r["date"]) - _parse(m["date"])).days) > 3:
            return False
    except (KeyError, TypeError, ValueError):
        return False

    def team(a: str, b: str) -> bool:
        na = re.sub(r"[^a-z0-9]", "", _fold(a).lower())
        nb = re.sub(r"[^a-z0-9]", "", _fold(b).lower())
        if not na or not nb:
            return False
        if na == nb:
            return True
        short, long = (na, nb) if len(na) <= len(nb) else (nb, na)
        if len(short) >= 4 and short in long:
            return True
        generic = {"real", "club", "fc", "cf", "sc", "ac", "as", "ss", "us", "ud"}
        ta = {t for t in _fold(a).lower().split() if len(t) >= 4 and t not in generic}
        tb = {t for t in _fold(b).lower().split() if len(t) >= 4 and t not in generic}
        return bool(ta & tb)

    return team(r.get("home", ""), m.get("home", "")) and \
        team(r.get("away", ""), m.get("away", ""))


def enrich(rows: list[dict], folder: str) -> int:
    """Attach 1H/2H/total corner columns to finished rows. Returns match count."""
    league_id = CORNER_LEAGUES.get(folder)
    if not league_id:
        return 0
    finished = [r for r in rows if r.get("ft_home") is not None]
    if not finished:
        return 0

    matches = _league_matches(league_id)
    used: set[int] = set()
    todo: list[tuple[dict, int]] = []
    for r in finished:
        want = (r.get("ft_home"), r.get("ft_away"))
        cands = [m for m in matches if m["id"] not in used and _same(r, m)]
        if len(cands) != 1:
            # Exact-score fallback: short names collide inside a round
            # ("Deportivo" could be Deportivo A Coruña or Deportivo Alavés),
            # so accept only a unique candidate with the same final score.
            scored = [m for m in matches
                      if m["id"] not in used and m.get("ft") == want
                      and _loose(r, m)]
            if len(scored) == 1:
                cands = scored
        if len(cands) > 1:
            scored = [m for m in cands if m.get("ft") == want]
            pool = sorted(scored or cands, key=lambda m: abs(
                (_parse(m["date"]) - _parse(r.get("date"))).days))
            if len(pool) == 1 or pool[0]["date"] != pool[1]["date"]:
                cands = pool[:1]
        if len(cands) != 1:
            continue
        used.add(cands[0]["id"])
        todo.append((r, cands[0]["id"]))

    cache = _load_cache()
    missing = [mid for _, mid in todo if not _complete(cache.get(str(mid)))]
    if missing:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for mid, corners in zip(missing, ex.map(_fetch_one, missing)):
                if _complete(corners):
                    cache[str(mid)] = corners
        _save_cache(cache)

    filled = 0
    for row, mid in todo:
        c = cache.get(str(mid))
        if not _complete(c):
            continue
        (row["home_corners"], row["away_corners"],
         row["home_corners_1h"], row["away_corners_1h"],
         row["home_corners_2h"], row["away_corners_2h"]) = c
        filled += 1
    return filled
