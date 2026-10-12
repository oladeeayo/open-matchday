"""Verify fixed parser on the known-bad POR rows + Yate/Cumnock/Tuggen."""
import sys

sys.path.insert(0, ".")
import soccerway_client as sw  # noqa: E402

print("== POR ==")
por = sw.fetch_league("portugal/taca-de-portugal")
watch = {
    ("Beira Mar", "Uniao Lamas"), ("Oliveirense", "Penalva do Castelo"),
    ("Machico", "Camacha"), ("O Elvas CAD", "Sao Roque"),
    ("Oliveira Hospital", "Juv. Evora"), ("Serpa", "Louletano"),
    ("Mafra", "Tirsense"), ("Florgrade", "Sao Joao Ver"),
    ("Maia Lidador", "Vila Mea"), ("Nogueirense", "Naval 1893"),
    ("Rebordosa", "FC Alpendorada"), ("Pacos Ferreira", "AD Fafe"),
    ("Malveira", "Mafra"),
}
seen = 0
for m in sorted(por, key=lambda x: (x.get("date") or "zz", x["home"])):
    if (m["home"], m["away"]) in watch:
        print(f"  {m.get('date') or 'UNDATED':10s} {m['home']:20s} "
              f"{m.get('ft_home')}-{m.get('ft_away')} {m['away']}")
        seen += 1
undated = [m for m in por if m.get("ft_home") is not None and not m.get("date")]
print(f"  rows={len(por)} matched-watch={seen} undated-played={len(undated)}")
for m in undated:
    print("   UNDATED:", m["home"], "vs", m["away"])

print("== ENG fa-cup ==")
eng = sw.fetch_league("england/fa-cup")
for m in eng:
    if any(w in m["home"] + " " + m["away"] for w in ("Yate", "Cumnock", "Chippenham")):
        print(f"  {m.get('date') or 'UNDATED':10s} {m['home']:24s} "
              f"{m.get('ft_home')}-{m.get('ft_away')} {m['away']}")
und = [m for m in eng if m.get("ft_home") is not None and not m.get("date")]
print(f"  rows={len(eng)} undated-played={len(und)}")
for m in und:
    print("   UNDATED:", m["home"], "vs", m["away"])

print("== SCO fa-cup ==")
sco = sw.fetch_league("scotland/fa-cup")
for m in sco:
    if any(w in m["home"] + " " + m["away"] for w in ("Cumnock", "Auchinleck")):
        print(f"  {m.get('date') or 'UNDATED':10s} {m['home']:24s} "
              f"{m.get('ft_home')}-{m.get('ft_away')} {m['away']}")
und = [m for m in sco if m.get("ft_home") is not None and not m.get("date")]
print(f"  rows={len(sco)} undated-played={len(und)}")
for m in und:
    print("   UNDATED:", m["home"], "vs", m["away"])

print("== SUI swiss-cup ==")
sui = sw.fetch_league("switzerland/swiss-cup")
for m in sui:
    if "Tuggen" in m["home"] or "Tuggen" in m["away"]:
        print(f"  {m.get('date') or 'UNDATED':10s} {m['home']:24s} "
              f"{m.get('ft_home')}-{m.get('ft_away')} {m['away']}")
und = [m for m in sui if m.get("ft_home") is not None and not m.get("date")]
print(f"  rows={len(sui)} undated-played={len(und)}")
for m in und:
    print("   UNDATED:", m["home"], "vs", m["away"])
