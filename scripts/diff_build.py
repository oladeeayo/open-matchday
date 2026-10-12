"""Diff two builds' CSV trees: date/score changes, add/drop, undated rows.

Usage: python scripts/diff_build.py <old_data_dir> [new_data_dir]
Defaults: new = ./data
"""
import csv
import os
import sys
from collections import defaultdict

OLD = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\User\AppData\Local\Temp\opencode\data_prebuild"
NEW = sys.argv[2] if len(sys.argv) > 2 else "data"


def load(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    return rows


def key(r):
    return (r.get("home", ""), r.get("away", ""))


date_chg, score_chg, added, removed = [], [], [], []
undated_new = []
for dirpath, _, files in os.walk(NEW):
    for fn in files:
        if not fn.endswith(".csv"):
            continue
        new_path = os.path.join(dirpath, fn)
        rel = os.path.relpath(new_path, NEW)
        old_path = os.path.join(OLD, rel)
        new_rows = load(new_path)
        for r in new_rows:
            if r.get("ft_home") and not r.get("date"):
                undated_new.append((rel, r.get("home"), r.get("away")))
        if not os.path.exists(old_path):
            continue
        old_rows = load(old_path)
        om = {key(r): r for r in old_rows}
        nm = {key(r): r for r in new_rows}
        for k, nr in nm.items():
            if k not in nm or not k[0]:
                continue
            orow = om.get(k)
            if orow is None:
                added.append((rel, k, nr.get("date"), nr.get("ft_home"), nr.get("ft_away")))
                continue
            if (orow.get("date") or "") != (nr.get("date") or ""):
                date_chg.append((rel, k, orow.get("date") or "UNDATED", nr.get("date") or "UNDATED",
                                 f"{orow.get('ft_home')}-{orow.get('ft_away')}",
                                 f"{nr.get('ft_home')}-{nr.get('ft_away')}"))
            if (orow.get("ft_home"), orow.get("ft_away")) != (nr.get("ft_home"), nr.get("ft_away")):
                score_chg.append((rel, k, nr.get("date"),
                                  f"{orow.get('ft_home')}-{orow.get('ft_away')}",
                                  f"{nr.get('ft_home')}-{nr.get('ft_away')}"))
        for k, orow in om.items():
            if k not in nm and k[0]:
                removed.append((rel, k, orow.get("date")))


def show(title, items, fmt):
    print(f"\n== {title}: {len(items)} ==")
    for it in items:
        print("  " + fmt(it))


show("DATE CHANGES", date_chg,
     lambda t: f"{t[0]:45s} {t[1][0]:>20s} v {t[1][1]:<20s} {t[2]} -> {t[3]}  ({t[4]} => {t[5]})")
show("SCORE CHANGES", score_chg,
     lambda t: f"{t[0]:45s} {t[1][0]:>20s} v {t[1][1]:<20s} {t[2]}  {t[3]} => {t[4]}")
show("ADDED", added[:40], lambda t: f"{t[0]:45s} {t[1][0]:>20s} v {t[1][1]:<20s} {t[2]} {t[3]}-{t[4]}")
if len(added) > 40:
    print(f"  ... {len(added) - 40} more added")
show("REMOVED", removed[:40], lambda t: f"{t[0]:45s} {t[1][0]:>20s} v {t[1][1]:<20s} {t[2]}")
if len(removed) > 40:
    print(f"  ... {len(removed) - 40} more removed")
show("UNDATED PLAYED (NEW)", undated_new, lambda t: f"{t[0]:45s} {t[1]} v {t[2]}")
print(f"\nTOTALS: date_chg={len(date_chg)} score_chg={len(score_chg)} added={len(added)} "
      f"removed={len(removed)} undated={len(undated_new)}")
