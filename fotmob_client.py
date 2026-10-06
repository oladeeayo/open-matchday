#!/usr/bin/env python3
"""Fotmob.com client using embedded __NEXT_DATA__ JSON (no Cloudflare bypass needed).

Fotmob embeds all league data in a Next.js __NEXT_DATA__ script tag.
This client extracts that JSON directly - no browser automation needed.

League IDs mapped from https://www.fotmob.com/leagues
"""
from __future__ import annotations

import json
import re
import urllib.request
from typing import Any

# Fotmob league IDs for the leagues we need
# Discovered by scanning fotmob.com/leagues/<id>/overview
FOOTBALL_LEAGUE_IDS = {
    # --- The 7 missing leagues ---
    "SWE_1_allsvenskan": 67,       # Allsvenskan
    "SUI_1_super-league": 69,      # Swiss Super League  
    "AUT_1_bundesliga": 38,        # Austrian Bundesliga (country: AUT)
    "DEN_1_superliga": 46,         # Danish Superligaen
    "NOR_1_eliteserien": 59,       # Norwegian Eliteserien
    "ROU_1_liga-1": 189,           # Romanian Liga I
    "RUS_1_premier-liga": None,    # Russia - may be blocked, try alternative
    
    # --- English tiers (for reference, already have data from other sources) ---
    # "ENG_3_league-one": 108,     # EFL League One
    # "ENG_4_league-two": 109,     # EFL League Two  
    # "ENG_5_national-league": 117,# National League
    
    # --- English tiers 6-7 (if available on Fotmob) ---
    # These may not be on Fotmob - need to verify
    # National League North/South, Northern Premier, Southern, Isthmian
}

# Austria Bundesliga is actually ID 38 with country=AUT
# The title says "Bundesliga" but the country code confirms it's Austria


def fetch_league_page(league_id: int) -> dict[str, Any] | None:
    """Fetch a Fotmob league page and extract the __NEXT_DATA__ JSON."""
    url = f"https://www.fotmob.com/leagues/{league_id}/overview"
    
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    })
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None
    
    # Extract __NEXT_DATA__ JSON
    match = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not match:
        return None
    
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def fetch_matches(league_id: int) -> list[dict[str, Any]]:
    """Fetch all matches for a league from Fotmob.
    
    Returns list of dicts with keys:
        date, round, home, away, ft_home, ft_away, source
    """
    data = fetch_league_page(league_id)
    if not data:
        return []
    
    props = data.get('props', {}).get('pageProps', {})
    fixtures = props.get('fixtures', {})
    all_matches = fixtures.get('allMatches', [])
    
    results = []
    for m in all_matches:
        if not isinstance(m, dict):
            continue
        
        # Extract team names
        home_team = m.get('home', {})
        away_team = m.get('away', {})
        home_name = home_team.get('name', '') if isinstance(home_team, dict) else ''
        away_name = away_team.get('name', '') if isinstance(away_team, dict) else ''
        
        if not home_name or not away_name:
            continue
        
        # Extract status/score
        status = m.get('status', {})
        finished = status.get('finished', False)
        score_str = status.get('scoreStr', '')
        utc_time = status.get('utcTime', '')
        round_num = m.get('round', '')
        
        home_score = away_score = None
        if finished and score_str:
            parts = score_str.split('-')
            if len(parts) >= 2:
                try:
                    home_score = int(parts[0].strip())
                    away_score = int(parts[1].strip())
                except ValueError:
                    pass
        
        results.append({
            'date': utc_time[:10] if utc_time else '',
            'round': str(round_num) if round_num else '',
            'home': home_name,
            'away': away_name,
            'ft_home': home_score,
            'ft_away': away_score,
            'source': 'fotmob',
        })
    
    return results


def fetch_league(folder_name: str) -> list[dict[str, Any]]:
    """Fetch matches for a league by folder name."""
    league_id = FOOTBALL_LEAGUE_IDS.get(folder_name)
    if league_id is None:
        return []
    return fetch_matches(league_id)


if __name__ == "__main__":
    import sys
    
    # Test with Allsvenskan
    test_league = sys.argv[1] if len(sys.argv) > 1 else "SWE_1_allsvenskan"
    
    if test_league in FOOTBALL_LEAGUE_IDS:
        lid = FOOTBALL_LEAGUE_IDS[test_league]
        matches = fetch_matches(lid)
        
        completed = [m for m in matches if m['ft_home'] is not None]
        teams = set(m['home'] for m in matches if m['home']) | set(m['away'] for m in matches if m['away'])
        rounds = set(m['round'] for m in matches if m['round'])
        
        print(f"{test_league} (ID {lid}):")
        print(f"  Total: {len(matches)}, Completed: {len(completed)}")
        print(f"  Teams: {len(teams)}")
        print(f"  Rounds: {sorted(rounds, key=lambda x: int(x) if x.isdigit() else 999)}")
        
        if completed:
            print(f"\nFirst 3 results:")
            for m in completed[:3]:
                print(f"  GW{m['round']} {m['date']}: {m['home']:20s} {m['ft_home']}-{m['ft_away']} {m['away']}")
            
            print(f"\nLast 3 results:")
            for m in completed[-3:]:
                print(f"  GW{m['round']} {m['date']}: {m['home']:20s} {m['ft_home']}-{m['ft_away']} {m['away']}")
    else:
        print(f"Unknown league: {test_league}")
        print(f"Available: {list(FOOTBALL_LEAGUE_IDS.keys())}")
