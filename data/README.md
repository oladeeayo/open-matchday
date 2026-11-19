# Data

One folder per competition, named `<COUNTRY>_<TIER>_<league-slug>` (for example
`ENG_1_premier-league`, `GER_3_3-liga`, `UEFA_1_champions-league`). The full
list of 75 competitions is in [../LEAGUE_INDEX.md](../LEAGUE_INDEX.md), and the
field-by-field schema is in [../DATA_DICTIONARY.md](../DATA_DICTIONARY.md).

```
<LEAGUE>/
    results_2627.csv        finished matches (FT, HT, stats, corners, goal minutes)
    fixtures_2627.csv       upcoming matches (gw, date, time, home, away)
    goals_2627.csv          goal events, where a provider supplies them
    odds_fixtures_2627.csv  next fixtures with best 1X2 / BTTS / over-2.5 prices
    odds_1x2_2627.csv       full-time 1X2, one row per bookmaker (open + current)
    odds_markets_2627.csv   every market and scope (FT, 1st half, 2nd half)
    over25_2627.csv         next round: Poisson over-2.5 probability, price, EV
```

The four `odds_*` / `over25_*` files exist only for competitions where pre-match
prices are available; elsewhere the folder keeps its three core files. Prices
are Flashscore pre-match quotes from **bet365**, **Betway** and **Betano**, and
`odds_markets_2627.csv` carries every market those books list: 1X2, double
chance, over/under with lines, both teams to score, draw no bet, Asian and
European handicap, odd/even and half-time/full-time. `match_id` joins the odds
files to each other; `over25_2627.csv` is a model output, not a tip.

- **Season code:** `2627` = 2026/27 (calendar-year leagues include early 2026).
- **Encoding:** UTF-8 CSV, header row, CRLF, RFC 4180 quoting.
- **Nulls:** an empty field means unavailable — never zero.

## Read a file directly

```bash
curl -O https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/ENG_1_premier-league/results_2627.csv
```

```python
import pandas as pd
BASE = "https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data"
df = pd.read_csv(f"{BASE}/ESP_1_la-liga/results_2627.csv")
```

The whole repository is also mirrored by jsDelivr:
`https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/...`

## Coverage notes

- Results and fixtures cover all competitions.
- Half-time scores, shots, fouls, cards and corner totals exist only where a
  free provider covers that league (football-data.co.uk, OpenLigaDB).
- Corner splits (1H and 2H) exist for the top-10 leagues only.
- Goal minutes exist for the top-5 leagues, Germany 1–3 and the UEFA club
  competitions.

Data is compiled from free public sources; see
[../DISCLAIMER.md](../DISCLAIMER.md) for provider terms and the non-commercial
use policy. Please attribute **open-matchday** when you use it publicly.
