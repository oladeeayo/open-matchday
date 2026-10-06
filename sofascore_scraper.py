#!/usr/bin/env python3
"""Pydoll-based scraper for Sofascore/Fotmob - bypasses Cloudflare Turnstile.

Launches Chrome, passes Turnstile challenge, then uses browser-context HTTP
requests for data fetches (no re-challenge on follow-up requests).
"""
from __future__ import annotations

import json
import re
import sys
from typing import Any

from httpx_util import get


def _launch_pydoll() -> Any:
    """Launch Pydoll Chrome - import lazily so normal builds don't need it."""
    try:
        from pydoll import chromium
    except ImportError:
        print("Pydoll not installed. Install with: pip install pydoll", file=sys.stderr)
        sys.exit(1)

    browser = chromium.Chromium()
    browser.start()
    page = browser.get_page()
    
    # Navigate to a page with Turnstile to solve it
    page.navigate("https://www.sofascore.com/season/football/sweden/allsvenskan/2026")
    page.wait_for_load_state("networkidle", timeout=30000)
    
    # Wait a moment for Turnstile to be solved
    import time
    time.sleep(3)
    
    return browser, page


def _fetch_via_pydoll(page: Any, url: str) -> str:
    """Fetch URL using page's HTTP context (no re-challenge)."""
    response = page.get_page().network.get_response(url)
    if response:
        return response.body()
    # Fallback: evaluate fetch in browser context
    result = page.evaluate("""async (url) => {
        const resp = await fetch(url, {
            headers: { 'User-Agent': navigator.userAgent }
        });
        return await resp.text();
    }""", url)
    return result


def test_sofascore():
    """Test fetching Sofascore data via Pydoll."""
    try:
        from pydoll import chromium
    except ImportError:
        print("Pydoll not available - skipping test")
        return
    
    browser = chromium.Chromium()
    browser.start()
    page = browser.get_page()
    
    try:
        # Navigate to solve Turnstile
        url = "https://www.sofascore.com/season/football/sweden/allsvenskan/2026"
        page.navigate(url)
        page.wait_for_load_state("networkidle", timeout=30000)
        import time
        time.sleep(5)
        
        # Now fetch via evaluate (uses browser's cookies/context)
        html = page.evaluate("""async (url) => {
            const resp = await fetch(url, {
                headers: { 
                    'User-Agent': navigator.userAgent,
                    'Accept': 'text/html,application/xhtml+xml'
                }
            });
            return await resp.text();
        }""", url)
        
        print(f"Fetched {len(html)} chars from Sofascore")
        
        # Look for match data
        for pattern in ['round', 'matchId', 'homeName', 'awayName', 'homeScore', 'awayScore']:
            count = len(re.findall(pattern, html, re.I))
            if count > 0:
                print(f"  '{pattern}': {count} occurrences")
        
        # Save for inspection
        with open("/tmp/sofascore_test.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Saved to /tmp/sofascore_test.html")
        
    finally:
        browser.stop()


def test_fotmob():
    """Test fetching Fotmob data via Pydoll."""
    try:
        from pydoll import chromium
    except ImportError:
        print("Pydoll not available - skipping test")
        return
    
    browser = chromium.Chromium()
    browser.start()
    page = browser.get_page()
    
    try:
        url = "https://fotmob.com/league/sweden/allsvenskan"
        page.navigate(url)
        page.wait_for_load_state("networkidle", timeout=30000)
        import time
        time.sleep(5)
        
        # Fotmob may use a different structure
        html = page.evaluate("""async (url) => {
            const resp = await fetch(url, {
                headers: { 
                    'User-Agent': navigator.userAgent,
                    'Accept': 'text/html,application/xhtml+xml'
                }
            });
            return await resp.text();
        }""", url)
        
        print(f"\nFetched {len(html)} chars from Fotmob")
        print(f"First 500: {html[:500]}")
        
        with open("/tmp/fotmob_test.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Saved to /tmp/fotmob_test.html")
        
    finally:
        browser.stop()


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Sofascore via Pydoll...")
    print("=" * 60)
    test_sofascore()
    
    print("\n" + "=" * 60)
    print("Testing Fotmob via Pydoll...")
    print("=" * 60)
    test_fotmob()
