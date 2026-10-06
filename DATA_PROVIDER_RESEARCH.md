# Free Data Provider Research for Missing Leagues

## Currently Missing Leagues (commented out in leagues.py)

| League | Country | ESPN Issue | fd.co.uk Issue |
|--------|---------|------------|----------------|
| Swiss Super League | Switzerland | Stale 2025/26 board | No 2627 file (HTTP 300 for S1) |
| Austrian Bundesliga | Austria | Stale 2025/26 board | No 2627 file (HTTP 300 for A1) |
| Danish Superliga | Denmark | Stale 2025/26 board | No 2627 file (HTTP 404 for DEN) |
| Russian Premier Liga | Russia | Stale 2025/26 board | No 2627 file (HTTP 404 for RUS) |
| Allsvenskan | Sweden | Stale 2025/26 board | No 2627 file (HTTP 404 for SWE) |
| Eliteserien | Norway | Stale 2025/26 board | No 2627 file (HTTP 404 for NOR) |
| Liga I | Romania | Stale 2025/26 board | No 2627 file (HTTP 404 for ROU) |

---

## Potential Free Data Sources

### 1. API-Football (api-sports.io) — FREE TIER: 100 requests/day

**Coverage:** 1,247+ leagues including ALL the missing leagues:
- Swiss Super League ✓
- Austrian Bundesliga ✓
- Danish Superliga ✓
- Swedish Allsvenskan ✓
- Norwegian Eliteserien ✓
- Romanian Liga I ✓
- Russian RFPL ✓

**Pros:**
- Single API covers all 7 missing leagues
- Free tier: 100 requests/day (enough for 1-2 leagues if used efficiently)
- Endpoints: fixtures, results, standings, teams, events, lineups
- Covers 2026/27 season

**Cons:**
- 100 requests/day is tight — fetching full season for 1 league = ~306 matches = potentially 306 requests if fetching match-by-match
- Need API key (free registration required)
- Rate limits may block bulk historical data

**Best for:** Live scores + current round fixtures. Not ideal for full-season backfill on free tier.

**Pricing:** Free (100 req/day) → $19.99/month (Champion) → $34.99/month (Discovery)

**Website:** https://www.api-sports.io/

---

### 2. Footballdata.io — FREE TIER: 2,000 requests/month

**Coverage:**
- **Free plan (5 leagues):** Premier League, La Liga, Champions League, Europa League only — does NOT cover missing leagues
- **Starter plan (50 leagues, €19.99/month):** Includes ALL 7 missing leagues:
  - Swedish Allsvenskan ✓
  - Austrian Bundesliga ✓
  - Belgian Pro League ✓
  - Norwegian Eliteserien ✓
  - Portuguese LigaPro ✓
  - Danish Superliga ✓
  - Swiss Super League ✓
- **Pro plan (150 leagues, €49.99/month):** Adds Romanian Liga I ✓, Russia RFPL ✓

**Pros:**
- Starter plan covers 5 of 7 missing leagues
- 2,000 requests/month on free tier (but only top 5 leagues)
- Clean REST API with fixtures, results, standings, team stats, match stats

**Cons:**
- Missing leagues require paid plan (min €19.99/month for 5 of 7; €49.99/month for all 7)
- Not free for the leagues we need

**Website:** https://footballdata.io/

---

### 3. Football-Data.org — FREE TIER: 10 requests/minute

**Coverage from coverage page (https://www.football-data.org/coverage):**
- Denmark: Superliga ✓ (listed in coverage table)
- Sweden: Allsvenskan ✓ (listed in coverage table)
- Norway: Tippeligaen ✓ (listed — but only as "Tippeligaen", may be outdated name)
- Austria: Bundesliga ✓ (listed in coverage table)
- Switzerland: Super League ✓ (listed in coverage table)
- Romania: Liga I ✓ (listed in coverage table)
- Russia: RFPL ✓ (listed in coverage table)

**BUT:** The free tier "Access to data of these leagues & cups is free. Forever" shows only:
- Champions League, Premier League, Primeira Liga, Eredivisie, Bundesliga, Ligue 1, Serie A, La Liga, Championship, Serie A Brazil, World Cup

So while football-data.org's API coverage lists these leagues, the **free tier only includes the 12 highlighted leagues**. The others (Denmark, Sweden, Norway, Austria, Switzerland, Romania, Russia) would require a paid tier (€49-199/month).

**Pros:**
- Clean API, good documentation
- Listed in coverage = they have the data

**Cons:**
- Free tier doesn't include our missing leagues
- Paid tiers start at €49/month

**Website:** https://www.football-data.org/

---

### 4. Sportmonks — FREE TIER: 2 leagues only

**Free plan coverage:**
- Danish Superliga ✓
- Scottish Premiership ✓

**Paid plans:**
- Starter (€29/month): Pick any 5 leagues — could cover 5 of 7 missing
- Professional (€49/month): Pick any 15 leagues
- World (€99/month): 650+ leagues

**Pros:**
- Danish Superliga on free plan (1 of 7 missing leagues)
- Good data quality

**Cons:**
- Only 2 leagues on free plan — not enough
- All 7 missing leagues would cost minimum €29/month (5 leagues) or €49/month (all 7 via World plan)

**Website:** https://www.sportmonks.com/football-api/

---

### 5. Scraping Options (no API key needed, but higher maintenance)

#### a) Transfermarkt
- **URL pattern:** https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1
- **Coverage:** All 7 leagues have fixture/table pages
- **Pros:** Free, comprehensive fixtures and results
- **Cons:** 
  - Cloudflare-protected — may need curl_cffi or Pydoll to bypass
  - Terms of service restrictions on scraping
  - HTML parsing required (not structured API)
  - LLM_NOTES.md already notes this as a "future Pydoll/curl_cffi scraper target"

#### b) Soccerway (DeeD OOwen)
- **URL pattern:** https://www.soccerway.com/romania/superliga/
- **Coverage:** All major European leagues
- **Pros:** Free, no Cloudflare, shows fixtures/results/standings
- **Cons:** 
  - HTML parsing required
  - May have rate limiting
  - No official API

#### c) Footballwebpages.co.uk
- **URL pattern:** https://www.footballwebpages.co.uk/switzerland/fixtures-results
- **Coverage:** Has fixtures for Switzerland and other leagues
- **Pros:** Free, UK-focused but has some international
- **Cons:** Limited coverage for non-UK leagues

#### d) Country-specific federation sites
- **Norway:** https://www.eliteserien.com/ (may have API or RSS)
- **Sweden:** https://www.allsvenskan.se/
- **Denmark:** https://www.superliga.dk/
- **Switzerland:** https://www.supperleague.ch/
- **Austria:** https://www.bundesliga.at/
- **Romania:** https://www.lipoteca.ro/ or https://www.federatiindehomepage.ro/
- **Russia:** https://rfpl.org/ (may be harder due to sanctions)

**Pros:** Official sources, often have JSON feeds or RSS
**Cons:** 
- May require language skills (local language sites)
- Varying reliability
- May have anti-bot measures

---

## Recommendation Summary

### For a truly free solution:

| Option | Leagues Covered | Effort | Reliability |
|--------|----------------|--------|-------------|
| **API-Football free tier** | All 7 (if within 100 req/day) | Low (API) | Medium (rate limits) |
| **Soccerway scraping** | All 7 | Medium (HTML parse) | Medium |
| **Transfermarkt scraping** | All 7 | High (Cloudflare bypass) | Medium |
| **Country federation sites** | Varies by country | High (per-country research) | Low-Medium |

### For a paid solution (if budget allows):

| Option | Cost | Leagues Covered |
|--------|------|-----------------|
| API-Football Champion | $19.99/month | All 7 + more |
| Footballdata.io Starter | €19.99/month | 5 of 7 (not Romania/Russia) |
| Footballdata.io Pro | €49.99/month | All 7 |
| Sportmonks Starter | €29/month | Any 5 of 7 |

---

## Pragmatic Approach

Given the project's constraints (stdlib-only, no Cloudflare scraping, keyless preference):

1. **Best immediate free option:** Try **API-Football free tier** (100 req/day). With careful caching and incremental updates (only fetch new matches each run), 100 requests/day could cover 1-2 leagues. Register for a free key at https://api-sports.io/ and test coverage for the missing leagues.

2. **Fallback scraping:** If API limits are too tight, **Soccerway** is the most accessible scraping target — no Cloudflare, covers all 7 leagues, HTML is parseable. Add as `soccerway_client.py` behind an opt-in flag (documented in LLM_NOTES.md style).

3. **Hybrid:** Use ESPN for what it provides (current round) + API-Football for historical + fd.co.uk for stats where available.

---

*Research conducted 2026-10-06. API pricing and coverage may change — verify before integrating.*
