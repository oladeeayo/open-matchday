#!/usr/bin/env python3
"""Soccerway.com keyless scraper client.

URL pattern: https://www.soccerway.com/<country>/<league>/results/
             https://www.soccerway.com/<country>/<league>/fixtures/

The page embeds match data in a JavaScript data blob using a custom
binary-delimited format. This client parses that format to extract
results and fixtures.

Known country/league slugs for the 7 missing leagues:
  - switzerland/super-league
  - austria/bundesliga
  - denmark/superliga
  - sweden/allsvenskan
  - norway/eliteserien
  - romania/superliga
  - russia/premier-league  (may be unreliable due to blocking)
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from httpx_util import get

# Delimiters used in Soccerway's embedded data format
D1 = chr(247)  # Used after field codes (CX<D1>, ER<D1>, etc.)
D2 = chr(172)  # Used after values (1<D2>, 1789921625<D2>, etc.)

# Map league folder names to Soccerway country/league slugs
SOCCERWAY_SLUGS: dict[str, tuple[str, str]] = {
    "SWE_1_allsvenskan": ("sweden", "allsvenskan"),
    "SUI_1_super-league": ("switzerland", "super-league"),
    "AUT_1_bundesliga": ("austria", "bundesliga"),
    "DEN_1_superliga": ("denmark", "superliga"),
    "NOR_1_eliteserien": ("norway", "eliteserien"),
    "ROU_1_liga-1": ("romania", "superliga"),
    "RUS_1_premier-liga": ("russia", "premier-league"),
}

# Soccerway only archives rounds from ~round 9 onwards.
# Rounds 1-8 may not be available on their site.
# To get maximum coverage, we fetch from both archive and fixtures pages.

# Safety net: a played match served WITHOUT any usable timestamp (no lead-in
# AD, no AO). The lead-in AD now covers essentially every row, so these hints
# should never fire; kept as a guard. Keyed (home, away) as served by Soccerway.
DATE_HINTS: dict[tuple[str, str], str] = {
    ("CK United", "Newbridge Town"): "2026-08-29",  # LOI NL Group 3 round 1, SETU Carlow, 14:00
}


def _fetch_page(country: str, league: str) -> str:
    """Fetch the results page HTML."""
    url = f"https://www.soccerway.com/{country}/{league}/results/"
    return get(url)


def _extract_data_blob(html: str) -> str | None:
    """Extract the embedded JSON data blob from the page."""
    match = re.search(r"data: `([\s\S]*?)`", html)
    return match.group(1) if match else None


def _parse_matches(data: str) -> list[dict[str, Any]]:
    """Parse match records from Soccerway's binary-delimited data format.

    Field format: CODE<D1>value<D2> for numeric values
                  CODE<D1>value<D1> for string values

    Key fields per match:
        CX<D1>home_team<D1>     - Home team name
        ER<D1>Round N<D1>       - Round number
        AG<D1>home_score<D2>    - Home score (90m / +1 shootout-advance)
        AU<D1>away_score<D2>    - Away score (90m)
        REA/REB<D1>score<D2>    - FINAL score incl. extra time (present
                                  whenever the match went beyond 90m —
                                  use in preference to AG/AU)
        AF<D1>away_team<D1>     - Away team name

    Timestamps:
        The record's own kickoff sits in the lead-in block
        `~AA<id> AD<ts> ADE<ts> AB CR AC` IMMEDIATELY BEFORE its CX.
        The AD found inside the segment (CX..next CX) belongs to the
        NEXT record's lead-in — reading it gives a one-record-off date
        (or none for the last record). AO inside the segment is this
        record's own last-update ts; only used as a fallback.
    """
    results: list[dict[str, Any]] = []
    pos = 0

    while True:
        # Find CX<D1> marker for a match
        cx_pos = data.find("CX" + D1, pos)
        if cx_pos < 0:
            break

        # Extract home team (between CX<D1> and ER<D1>)
        home_start = cx_pos + 2
        er_pos = data.find("ER" + D1, home_start)
        if er_pos < 0:
            pos = home_start + 2
            continue
        home = data[home_start:er_pos]

        # Extract round (between ER<D1> and RW<D1>)
        round_start = er_pos + 2
        rw_pos = data.find("RW" + D1, round_start)
        if rw_pos < 0:
            pos = round_start + 2
            continue
        round_raw = data[round_start:rw_pos]
        round_m = re.search(r"(\d+)", round_raw)
        round_num = round_m.group(1) if round_m else ""

        # Now extract fields from the segment starting at CX position
        # We need to look at the data between this CX and the next CX
        next_cx = data.find("CX" + D1, cx_pos + 2)
        if next_cx < 0:
            seg = data[cx_pos:]
        else:
            seg = data[cx_pos:next_cx]

        # Extract fields using their CODE<D1>value<D2> pattern
        def get_int_field(code: str) -> int | None:
            m = re.search(f"{code}{D1}(\\d+){D2}", seg)
            return int(m.group(1)) if m else None

        def get_str_field(code: str) -> str:
            # Match CODE<D1>value<D1> - value may contain D2 but not D1
            m = re.search(f"{code}{D1}([^{D1}]+?){D1}", seg)
            if not m:
                return ""
            val = m.group(1)
            # Remove D2 delimiters and control characters
            val = val.replace(D2, "")
            val = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", val).strip()
            # Strip common suffixes that are formatting, not part of team name
            for suffix in [" FK", " fk", " FC", " fc", "FK", "fc"]:
                if val.endswith(suffix):
                    val = val[: -len(suffix)]
            return val

        # Own kickoff: first AD after the record's own `AA` lead-in marker,
        # which sits immediately before this CX. (The AD inside seg is the
        # NEXT record's kickoff — never use it for this record.)
        lead = data[max(0, cx_pos - 300) : cx_pos]
        aa_pos = lead.rfind("AA" + D1)
        lead_ts = None
        if aa_pos >= 0:
            lm = re.search("AD" + D1 + r"(\d+)" + D2, lead[aa_pos:])
            if lm:
                lead_ts = int(lm.group(1))

        # Final score incl. extra time when the match went beyond 90m;
        # AG/AU are 90-minute scores (AG additionally gets +1 for a
        # shootout win, so it is only trustworthy for regulation results).
        home_score = get_int_field("REA")
        away_score = get_int_field("REB")
        if home_score is None or away_score is None:
            home_score = get_int_field("AG")
            away_score = get_int_field("AU")
        # kickoff (lead-in) first; own in-segment AO as fallback
        ts = lead_ts or get_int_field("AO")
        away = get_str_field("AF")

        # Clean home team name: strip D1/D2 delimiters from ends, remove other control chars
        home = home.strip(D1).strip(D2).strip()
        home = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", home)

        if not home or not away:
            pos = rw_pos + 2
            continue

        date_str = ""
        if ts:
            # UTC: builds must be reproducible regardless of host timezone
            date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")

        if home_score is not None and away_score is not None:
            results.append(
                {
                    "date": date_str,
                    "round": round_num,
                    "home": home,
                    "away": away or "Unknown",
                    "ft_home": home_score,
                    "ft_away": away_score,
                    "source": "soccerway",
                }
            )
        elif date_str:
            # upcoming fixture (no score yet) — keep it so leagues have
            # future matches even without a fixturedownload spine
            results.append(
                {
                    "date": date_str,
                    "round": round_num,
                    "home": home,
                    "away": away or "Unknown",
                    "ft_home": None,
                    "ft_away": None,
                    "source": "soccerway",
                }
            )

        pos = rw_pos + 2

    return results


def fetch_league(slug: str) -> list[dict[str, Any]]:
    """Fetch all matches for a league from Soccerway.

    Fetches from the standings page which contains all data blobs:
    - Recent results (rounds 18-22)
    - Upcoming fixtures (rounds 23-25)
    - Historical results (rounds 9-22)
    - Full fixtures (rounds 23-30)

    NOTE: Soccerway does not have rounds 1-8 for the current season.
    Those rounds are simply not available on their site.

    Args:
        slug: Either a league folder name (e.g. 'SWE_1_allsvenskan')
              or a country/league path (e.g. 'sweden/allsvenskan').

    Returns:
        List of match dicts with keys: date, round, home, away, ft_home,
        ft_away, source.
    """
    # Check if slug is a known folder name
    if slug in SOCCERWAY_SLUGS:
        country, league = SOCCERWAY_SLUGS[slug]
    else:
        # Assume slug is a country/league path
        parts = slug.split("/")
        if len(parts) != 2:
            return []
        country, league = parts

    all_matches: dict[tuple[str, str], dict[str, Any]] = {}  # (date, home+away) -> match

    def absorb(html: str) -> None:
        for m in re.finditer(r"data: `([\s\S]*?)`", html):
            for match in _parse_matches(m.group(1)):
                key = (match["date"], match["home"] + "|" + match["away"])
                # Completed matches: always update (keep latest)
                # Upcoming matches (no score): only add if not already present
                if match.get("ft_home") is not None:
                    all_matches[key] = match
                elif key not in all_matches:
                    all_matches[key] = match

    # Standings page embeds recent results + some fixtures; the dedicated
    # fixtures page carries the full upcoming list (scoreless rows with AD ts).
    for page in ("standings", "fixtures"):
        try:
            absorb(get(f"https://www.soccerway.com/{country}/{league}/{page}/"))
        except Exception:
            pass

    # If both pages failed or returned nothing, fall back to results page
    if not all_matches:
        try:
            absorb(_fetch_page(country, league))
        except Exception:
            pass

    # Fill known missing timestamps (Soccerway omits AO/AD on some rows)
    for m in all_matches.values():
        if m.get("ft_home") is not None and not m.get("date"):
            hint = DATE_HINTS.get((m.get("home", ""), m.get("away", "")))
            if hint:
                m["date"] = hint
        # true round numbers become gw when numeric (cups + leagues)
        rnd = str(m.get("round") or "").strip()
        if rnd.isdigit():
            m["gw"] = int(rnd)

    return list(all_matches.values())


if __name__ == "__main__":
    # Quick test
    for slug in ["SWE_1_allsvenskan", "DEN_1_superliga"]:
        matches = fetch_league(slug)
        print(f"{slug}: {len(matches)} matches")
        for m in matches[:5]:
            print(
                f"  {m['date']} GW{m['round']}: {m['home']:20s} "
                f"{m['ft_home']:2d} - {m['ft_away']:2d} {m['away']:20s}"
            )
