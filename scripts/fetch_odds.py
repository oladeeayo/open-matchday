"""Fetch pre-match odds from Sofascore via pydoll (bypasses Cloudflare).

Saves to web/data/odds/{YYYY-MM-DD}.json keyed by team names for the frontend.

Usage:
    python scripts/fetch_odds.py              # today
    python scripts/fetch_odds.py 2026-10-09   # specific date
    python scripts/fetch_odds.py --days 3     # today + next N days
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from pydoll.browser.chromium import Chrome
from pydoll.browser.options import ChromiumOptions

OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "data" / "odds"
BASE = "https://www.sofascore.com"
# Markets we care about. Sofascore odds endpoint returns all; we filter.
INTERESTING = {
    "over-under", "both-teams-to-score", "home-team-to-score",
    "away-team-to-score", "1x2",
}


def iso(d: date) -> str:
    return d.isoformat()


async def fetch_day(tab, day: str) -> dict:
    """Fetch scheduled events + odds for one date. Returns {match_key: odds}."""
    url = f"{BASE}/api/v1/sport/football/scheduled-events/{day}"
    resp = await tab.request.get(url)
    if not resp.ok:
        print(f"  scheduled {day}: HTTP {resp.status_code}")
        return {}
    body = resp.json()
    events = body.get("events", [])
    print(f"  {day}: {len(events)} events")

    # Filter to not-started matches with odds
    upcoming = [
        e for e in events
        if e.get("status", {}).get("type") == "notstarted"
        and e.get("homeTeam") and e.get("awayTeam")
    ]
    print(f"  {day}: {len(upcoming)} upcoming")

    results = {}
    for i, ev in enumerate(upcoming):
        eid = ev.get("id")
        home = ev.get("homeTeam", {}).get("name", "")
        away = ev.get("awayTeam", {}).get("name", "")
        if not eid or not home or not away:
            continue
        key = f"{home}|{away}"
        try:
            odds_url = f"{BASE}/api/v1/event/{eid}/odds/1"
            odds_resp = await tab.request.get(odds_url)
            if not odds_resp.ok:
                continue
            odds_body = odds_resp.json()
            parsed = parse_odds(odds_body)
            if parsed:
                results[key] = {
                    "fotmobId": None,
                    "sofascoreId": eid,
                    "home": home,
                    "away": away,
                    "league": ev.get("tournament", {}).get("name", ""),
                    "country": ev.get("tournament", {}).get("category", {}).get("name", ""),
                    "odds": parsed,
                }
        except Exception as ex:
            print(f"  odds {home} v {away}: {ex}")
        # polite delay
        if i % 10 == 9:
            await asyncio.sleep(0.4)
    print(f"  {day}: {len(results)} with odds")
    return results


def parse_odds(body: dict) -> dict | None:
    """Extract O1.5/O2.5/O3.5/BTTS decimal odds from Sofascore odds payload."""
    providers = body.get("odds", {}).get("providers", [])
    if not providers:
        return None

    # Prefer first provider with data (usually bet365 or similar)
    out: dict = {"source": "sofascore", "line": {}}
    for prov in providers:
        markets = prov.get("markets", [])
        got_any = False
        for m in markets:
            name = (m.get("marketName") or "").lower()
            outcomes = m.get("outcomes", [])
            # Over/Under totals: marketName like "Over/Under 2.5"
            if "over/under" in name or "total" in name:
                # extract line from name
                import re
                lm = re.search(r"(\d+\.?\d*)", name)
                if not lm:
                    continue
                line = float(lm.group(1))
                over = under = None
                for o in outcomes:
                    frac = o.get("fractionalValue") or o.get("americanValue")
                    dec = o.get("decimalValue") or o.get("value")
                    # Sofascore uses fractional; convert if needed
                    if dec is None and frac:
                        dec = _to_decimal(frac)
                    if o.get("name", "").lower().startswith("o") or o.get("type") == "over":
                        over = float(dec) if dec else None
                    elif o.get("name", "").lower().startswith("u") or o.get("type") == "under":
                        under = float(dec) if dec else None
                if over and line in (1.5, 2.5, 3.5):
                    out["line"][f"o{int(line*10)}"] = over
                    got_any = True
            elif "both teams to score" in name or "btts" in name:
                yes = no = None
                for o in outcomes:
                    dec = o.get("decimalValue") or o.get("value")
                    if dec is None and o.get("fractionalValue"):
                        dec = _to_decimal(o["fractionalValue"])
                    if o.get("name", "").lower().startswith("y"):
                        yes = float(dec) if dec else None
                    elif o.get("name", "").lower().startswith("n"):
                        no = float(dec) if dec else None
                if yes:
                    out["line"]["btts"] = yes
                    got_any = True
            elif name in ("home team to score", "away team to score"):
                yes = None
                for o in outcomes:
                    dec = o.get("decimalValue") or o.get("value")
                    if dec is None and o.get("fractionalValue"):
                        dec = _to_decimal(o["fractionalValue"])
                    if o.get("name", "").lower().startswith("y") and dec:
                        yes = float(dec)
                if yes:
                    key = "h2" if "home" in name else "a2"
                    out["line"][key] = yes
                    got_any = True
        if got_any:
            out["bookmaker"] = prov.get("provider", "unknown")
            break
    return out if out.get("line") else None


def _to_decimal(frac: str) -> float | None:
    """Convert fractional odds string like '4/6' or decimal string to float."""
    try:
        if "/" in frac:
            a, b = frac.split("/")
            return round(1 + float(a) / float(b), 3)
        return float(frac)
    except Exception:
        return None


async def main():
    args = sys.argv[1:]
    days = 1
    start = date.today()
    for i, a in enumerate(args):
        if a == "--days" and i + 1 < len(args):
            days = int(args[i + 1])
        elif a.startswith("-"):
            continue
        else:
            try:
                start = date.fromisoformat(a)
            except ValueError:
                pass

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    options = ChromiumOptions()
    options.add_argument("--headless=new")
    options.add_argument("--disable-blink-features=AutomationControlled")

    async with Chrome(options=options) as browser:
        tab = await browser.start()

        # Warm up Sofascore to pass any challenge
        print("warming up sofascore.com…")
        async with tab.expect_cloudflare_turnstile(time_to_wait_captcha=8):
            await tab.go_to(f"{BASE}/football")
        await asyncio.sleep(2)

        all_odds: dict = {}
        for i in range(days):
            d = start + timedelta(days=i)
            day = iso(d)
            print(f"fetching {day}…")
            try:
                day_odds = await fetch_day(tab, day)
            except Exception as ex:
                print(f"  day {day} failed: {ex}")
                day_odds = {}
            if day_odds:
                out_path = OUT_DIR / f"{day}.json"
                out_path.write_text(
                    json.dumps(
                        {"date": day, "fetched": iso(date.today()), "matches": day_odds},
                        ensure_ascii=False,
                        indent=1,
                    ),
                    encoding="utf-8",
                )
                print(f"  saved {out_path} ({len(day_odds)} matches)")
                all_odds[day] = len(day_odds)

        print("done:", all_odds)


if __name__ == "__main__":
    asyncio.run(main())
