"""Regenerate LEAGUE_INDEX.md from leagues.py (single source of truth).

Usage: python scripts/gen_index.py
"""
import sys

sys.path.insert(0, ".")
from leagues import ALL  # noqa: E402

HEADER = """# League index

Every tracked league (2026/27), its folder, sources and status. Registry:
[`leagues.py`](leagues.py). **Generated file** — rerun `python scripts/gen_index.py`
after changing the registry (do not hand-edit).
"""


def sources(lg) -> str:
    parts = []
    if lg.openligadb:
        parts.append("OpenLigaDB")
    if lg.fixturedl:
        parts.append("fixturedownload")
    if lg.espn:
        parts.append("ESPN")
    if lg.fd_div:
        parts.append("fd.co.uk")
    if lg.soccerway:
        parts.append("Soccerway")
    return " + ".join(parts)


def spine(lg) -> str:
    if lg.fixturedl:
        return "full season"
    if lg.openligadb:
        return "full season"
    if lg.soccerway and not lg.espn:
        return "schedule page"
    return "current round"


def minutes(lg) -> str:
    if lg.goal_minutes:
        return "✅ + scorers" if lg.openligadb else "✅"
    return "❌"


def main() -> None:
    lines = [HEADER, ""]
    lines += [
        "| Folder | League | Country | Sources | Goal minutes | Fixture spine |",
        "|---|---|---|---|---|---|",
    ]
    for lg in ALL:
        lines.append(
            f"| `{lg.folder}` | {lg.name} | {lg.country} | {sources(lg)} "
            f"| {minutes(lg)} | {spine(lg)} |"
        )
    lines += [
        "",
        "## Goal-minute availability",
        "",
        "- **Germany 1–3**: OpenLigaDB `goals[]` — minute, running score, scorer name.",
        "- **Top-5 leagues + UEFA club competitions**: ESPN summary keyEvents for",
        "  matches captured while on the live scoreboard (accumulates from here on).",
        "- Calendar-year leagues (BRA/ARG/MEX/USA/JPN/CHN): `calendar_year=True`",
        "  widens the ESPN month window to the full Jan–Dec season.",
        "- Everything else: deliberately omitted (not offered free).",
        "",
    ]
    with open("LEAGUE_INDEX.md", "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"wrote LEAGUE_INDEX.md ({len(ALL)} leagues)")


if __name__ == "__main__":
    main()
