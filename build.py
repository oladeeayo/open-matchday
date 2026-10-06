#!/usr/bin/env python3
"""Build the 2026/27 match dataset (results + fixtures + goals per league).

Usage:
    python build.py                 # all leagues
    python build.py --only ENG_1_premier-league GER_3_3-liga

Designed to be run on a schedule (e.g. every 2 days) - it is incremental by
construction: every run re-fetches the current round/season and rewrites the
CSVs deterministically.
"""
from __future__ import annotations
import argparse
import json
import sys
import time

from leagues import ALL
from builder import build_league


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2627")
    ap.add_argument("--only", nargs="*", default=None, help="league folder names")
    args = ap.parse_args()

    targets = ALL
    if args.only:
        by_folder = {lg.folder: lg for lg in ALL}
        missing = [f for f in args.only if f not in by_folder]
        if missing:
            print(f"Unknown leagues: {missing}", file=sys.stderr)
            return 2
        targets = [by_folder[f] for f in args.only]

    summary = []
    t0 = time.time()
    for lg in targets:
        try:
            info = build_league(lg, args.season)
            errs = "; ".join(info["errors"]) or "-"
            print(f"[{lg.folder:32s}] results={info['results']:4d} "
                  f"fixtures={info['fixtures']:3d} latest={info['latest'] or '-'} err={errs}")
            summary.append(info)
        except Exception as e:  # noqa: BLE001
            print(f"[{lg.folder}] FAILED: {e}", file=sys.stderr)
            summary.append({"league": lg.name, "folder": lg.folder,
                            "results": 0, "fixtures": 0, "errors": [str(e)], "latest": ""})

    with open("build_summary.json", "w", encoding="utf-8") as f:
        json.dump({"season": args.season, "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "leagues": summary}, f, indent=2, ensure_ascii=False)
    print(f"\nDone in {time.time() - t0:.0f}s -> build_summary.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
