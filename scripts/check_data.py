"""Validate data/ folder correctness (run after build.py).

Usage: python scripts/check_data.py
Exit code 1 when any ERROR is found; prints a markdown report (also appended
to $GITHUB_STEP_SUMMARY when set in CI).

ERRORS (data is wrong):
  - results row without date or FT score; goals out of range 0..25
  - HT score exceeding FT score in a component
  - fixture row without a date
  - exact duplicate rows inside one file
  - pinned full-season league totals mismatch (results+fixtures)
  - build_summary.json reporting league errors / data issues
WARNINGS (needs a human look):
  - fixture dated in the past but still unplayed (stale postponement)
  - result dated in the future
  - a league pairing appearing more than twice (cups/UEFA excluded)
  - goal-minute row missing date/minute
"""
import csv
import datetime as dt
import json
import os
import sys
from collections import Counter

SEASON = "2627"
TODAY = dt.date.today()

# Full-season totals that a complete spine must reach (league folders only).
PINNED_TOTALS = {
    "ENG_1_premier-league": 380,
    "ENG_2_championship": 552,
    "ENG_3_league-one": 552,
    "ENG_4_league-two": 552,
    "GER_1_bundesliga": 306,
    "GER_2_2-bundesliga": 306,
    "GER_3_3-liga": 380,
    "ESP_1_la-liga": 380,
    "ITA_1_serie-a": 380,
    "FRA_1_ligue-1": 306,
    "FRA_2_ligue-2": 306,
    "POR_1_primeira-liga": 306,
    "NED_1_eredivisie": 306,
    "TUR_1_super-lig": 306,
}

errors: list[str] = []
warnings: list[str] = []


def load(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def check_results(folder: str, rows: list[dict]) -> None:
    for i, r in enumerate(rows, start=2):
        where = f"results[{i}] {r.get('home','')} v {r.get('away','')}"
        if not r.get("date"):
            errors.append(f"{folder}: {where} — missing date")
        if r.get("ft_home") in (None, "") or r.get("ft_away") in (None, ""):
            errors.append(f"{folder}: {where} — missing FT score")
        else:
            try:
                fh, fa = int(r["ft_home"]), int(r["ft_away"])
                if not (0 <= fh <= 25 and 0 <= fa <= 25):
                    errors.append(f"{folder}: {where} — FT out of range {fh}-{fa}")
                if r.get("ht_home") not in (None, "") and r.get("ht_away") not in (None, ""):
                    hth, hta = int(r["ht_home"]), int(r["ht_away"])
                    if hth > fh or hta > fa:
                        errors.append(f"{folder}: {where} — HT {hth}-{hta} exceeds FT {fh}-{fa}")
            except ValueError:
                errors.append(f"{folder}: {where} — non-integer score")
        d = r.get("date")
        if d:
            try:
                rd = dt.date.fromisoformat(d)
                if rd > TODAY + dt.timedelta(days=1):
                    errors.append(f"{folder}: {where} — result dated in the future ({d})")
            except ValueError:
                errors.append(f"{folder}: {where} — bad date {d!r}")


def check_fixtures(folder: str, rows: list[dict]) -> None:
    pairs: Counter = Counter()
    for i, r in enumerate(rows, start=2):
        where = f"fixtures[{i}] {r.get('home','')} v {r.get('away','')}"
        d = r.get("date")
        if not d:
            errors.append(f"{folder}: {where} — missing date")
            continue
        try:
            fd = dt.date.fromisoformat(d)
        except ValueError:
            errors.append(f"{folder}: {where} — bad date {d!r}")
            continue
        if fd < TODAY - dt.timedelta(days=2):
            warnings.append(f"{folder}: {where} — past-dated unplayed fixture ({d}), stale postponement?")
        pairs[(r.get("home", ""), r.get("away", ""))] += 1
    if "CUP" not in folder and not folder.startswith("UEFA"):
        for (h, a), n in pairs.items():
            if n > 2:
                warnings.append(f"{folder}: pairing '{h} v {a}' appears {n} times (expected 2)")


def check_goals(folder: str, rows: list[dict]) -> None:
    for i, r in enumerate(rows, start=2):
        where = f"goals[{i}] {r.get('home','')} v {r.get('away','')}"
        if not r.get("date"):
            errors.append(f"{folder}: {where} — missing date")
        if not r.get("minute"):
            errors.append(f"{folder}: {where} — missing minute")


def main() -> int:
    if not os.path.isdir("data"):
        print("ERROR: data/ not found — run build.py first")
        return 1
    totals: Counter = Counter()
    for folder in sorted(os.listdir("data")):
        fdir = os.path.join("data", folder)
        if not os.path.isdir(fdir):
            continue
        res_path = os.path.join(fdir, f"results_{SEASON}.csv")
        fix_path = os.path.join(fdir, f"fixtures_{SEASON}.csv")
        goals_path = os.path.join(fdir, f"goals_{SEASON}.csv")

        if not os.path.exists(res_path):
            errors.append(f"{folder}: missing results_{SEASON}.csv")
            continue
        res_rows = load(res_path)
        totals[folder] += len(res_rows)
        check_results(folder, res_rows)
        seen = Counter(tuple(sorted(r.items())) for r in res_rows)
        for row, n in seen.items():
            if n > 1:
                errors.append(f"{folder}: {n} identical result rows ({row[:6]}…)")

        fix_rows = load(fix_path) if os.path.exists(fix_path) else []
        totals[folder] += len(fix_rows)
        check_fixtures(folder, fix_rows)

        if os.path.exists(goals_path):
            check_goals(folder, load(goals_path))

    for folder, want in PINNED_TOTALS.items():
        got = totals.get(folder, 0)
        if got != want:
            errors.append(f"{folder}: total rows {got} != pinned {want}")

    if os.path.exists("build_summary.json"):
        with open("build_summary.json", encoding="utf-8") as fh:
            summary = json.load(fh)
        if summary.get("errors"):
            errors.append(f"build_summary errors: {summary['errors']}")
        issues = summary.get("issues") or summary.get("data_issues") or []
        if issues:
            errors.append(f"build_summary data issues: {issues}")
    else:
        warnings.append("build_summary.json missing")

    lines = [f"### data check — {TODAY.isoformat()}", ""]
    lines.append(f"- folders: {sum(1 for f in totals)}  rows: {sum(totals.values())}")
    lines.append(f"- errors: **{len(errors)}**  warnings: {len(warnings)}")
    if errors:
        lines += ["", "#### ERRORS"] + [f"- {e}" for e in errors[:100]]
    if warnings:
        lines += ["", "#### Warnings"] + [f"- {w}" for w in warnings[:100]]
    report = "\n".join(lines)
    print(report)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(report + "\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
