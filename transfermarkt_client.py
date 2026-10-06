#!/usr/bin/env python3
"""Transfermarkt scraper client using curl_cffi (Chrome TLS impersonation).

Bypasses Cloudflare protection to scrape the gesamtspielplan (full fixture list)
for any league. Returns all matches from round 1 to current.

Usage:
    python -c "from transfermarkt_client import fetch_league; print(fetch_league('allsvenskan'))"

League slugs are Transfermarkt's URL-friendly names (e.g. 'allsvenskan',
'super-league', 'superligaen', etc.)
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import curl_cffi.requests as curl_requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Map our league folder names to Transfermarkt URLs
# Format: folder_name -> (league_slug, wettbewerb_code)
# The gesamtspielplan URL is: https://www.transfermarkt.us/<slug>/gesamtspielplan/wettbewerb/<code>/saison_id/2026
TRANSFERMARKT_LEAGUES: dict[str, tuple[str, str]] = {
    # The 7 missing leagues
    "SWE_1_allsvenskan": ("allsvenskan", "C1"),
    "SUI_1_super-league": ("super-league", "C1"),
    "AUT_1_bundesliga": ("bundesliga-oesterreich", "C1"),
    "DEN_1_superliga": ("superligaen", "C1"),
    "NOR_1_eliteserien": ("eliteserien", "C1"),
    "ROU_1_liga-1": ("liga-1-romania", "C1"),
    "RUS_1_premier-liga": ("russian-premier-liga", "C1"),
    # English tiers 6-8 (as requested)
    "ENG_6_league-two": ("league-two", "C1"),
    "ENG_7_national-league": ("national-league", "C1"),
    "ENG_8_north-american-league": ("northern-england-league", "C1"),  # placeholder
}

# Also add Scotland tiers if available
# "SCO_2_championship": ("scottish-championship", "C1"),
# "SCO_3_league-one": ("scottish-league-one", "C1"),
# "SCO_4_league-two": ("scottish-league-two", "C1"),


def _fetch_page(league_slug: str) -> str | None:
    """Fetch the gesamtspielplan page for a league."""
    url = f"https://www.transfermarkt.us/{league_slug}/gesamtspielplan/wettbewerb/C1/saison_id/2026"
    try:
        r = curl_requests.get(url, headers=HEADERS, impersonate="chrome124", timeout=15)
        if r.status_code == 200 and len(r.text) > 10000:
            return r.text
    except Exception:
        pass
    return None


def _parse_date(date_str: str) -> str:
    """Parse Transfermarkt date format (e.g., 'Sat 7/25/26') to YYYY-MM-DD."""
    # Strip day name and extra spaces
    date_str = re.sub(r'^[A-Za-z]+\s+', '', date_str.strip())
    try:
        # Try MM/DD/YY format
        dt = datetime.strptime(date_str, "%m/%d/%y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        try:
            # Try DD.MM.YYYY format
            dt = datetime.strptime(date_str, "%d.%m.%Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            return ""


def _parse_matches(html: str) -> list[dict[str, Any]]:
    """Parse match data from Transfermarkt gesamtspielplan HTML."""
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
    matches: list[dict[str, Any]] = []

    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) < 5:
            continue

        # Clean cells
        clean = []
        for c in cells:
            cleaned = re.sub(r'<[^>]+>', '', c)
            cleaned = cleaned.replace('&nbsp;', ' ').strip()
            cleaned = re.sub(r'\s+', ' ', cleaned)
            clean.append(cleaned)

        # Match rows have at least: date/time, clock, home, '', score, '', away
        # Typical structure: [date/time, clock, home, '', score, '', away, ...]
        if len(clean) >= 5 and clean[0] and clean[2] and clean[4]:
            date_time = clean[0]
            home = clean[2].strip()
            away = clean[4].strip()
            score = clean[3] if len(clean) > 3 else ""

            # Parse date
            date = _parse_date(date_time)

            # Skip if no date parsed
            if not date:
                continue

            # Remove rank prefixes like "(5.) " from team names
            home = re.sub(r'^\(\d+\)\.?\s*', '', home)
            away = re.sub(r'^\(\d+\)\.?\s*', '', away)
            # Remove trailing rank info like "  (6.)" from away
            away = re.sub(r'\s*\(\d+\)\.?$', '', away)

            # Parse score - format is "X:Y" or "-&-" for upcoming
            home_score = None
            away_score = None
            if score and score.strip() not in ('', '-', '-:-', ':'):
                score_parts = re.findall(r'(\d+)', score)
                if len(score_parts) >= 2:
                    home_score = int(score_parts[0])
                    away_score = int(score_parts[1])

            matches.append(
                {
                    "date": date,
                    "round": "",  # Transfermarkt doesn't show round numbers in this view
                    "home": home,
                    "away": away,
                    "ft_home": home_score,
                    "ft_away": away_score,
                    "source": "transfermarkt",
                }
            )

    return matches


def fetch_league(slug: str) -> list[dict[str, Any]]:
    """Fetch all matches for a league from Transfermarkt.

    Args:
        slug: League folder name (e.g. 'SWE_1_allsvenskan') or
              Transfermarkt league slug (e.g. 'allsvenskan').

    Returns:
        List of match dicts with keys: date, round, home, away, ft_home,
        ft_away, source.
    """
    # Check if slug is a known folder name
    if slug in TRANSFERMARKT_LEAGUES:
        league_slug, _ = TRANSFERMARKT_LEAGUES[slug]
    else:
        # Assume slug is the Transfermarkt league slug directly
        league_slug = slug

    html = _fetch_page(league_slug)
    if not html:
        return []

    return _parse_matches(html)


if __name__ == "__main__":
    import sys

    league = sys.argv[1] if len(sys.argv) > 1 else "allsvenskan"
    matches = fetch_league(league)

    print(f"{league}: {len(matches)} matches")
    results = [m for m in matches if m.get("ft_home") is not None]
    fixtures = [m for m in matches if m.get("ft_home") is None]

    print(f"  Results: {len(results)}, Fixtures: {len(fixtures)}")

    if results:
        print("\nResults (first 5):")
        for m in results[:5]:
            print(
                f"  {m['date']}: {m['home']:20s} {m['ft_home']:2d}-{m['ft_away']:2d} {m['away']:20s}"
            )
        print("\nResults (last 5):")
        for m in results[-5:]:
            print(
                f"  {m['date']}: {m['home']:20s} {m['ft_home']:2d}-{m['ft_away']:2d} {m['away']:20s}"
            )
