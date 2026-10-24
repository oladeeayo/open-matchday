# Data

One folder per competition, named `<COUNTRY>_<TIER>_<league-slug>` (for example
`ENG_1_premier-league`, `GER_3_3-liga`, `UEFA_1_champions-league`). The full
list of 75 competitions is in [../LEAGUE_INDEX.md](../LEAGUE_INDEX.md), and the
field-by-field schema is in [../DATA_DICTIONARY.md](../DATA_DICTIONARY.md).

```
<LEAGUE>/
    results_2627.csv    finished matches (FT, HT, stats, corners, goal minutes)
    fixtures_2627.csv   upcoming matches (gw, date, time, home, away)
    goals_2627.csv      goal events, where a provider supplies them
```

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
