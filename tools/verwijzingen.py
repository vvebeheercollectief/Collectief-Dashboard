#!/usr/bin/env python3
"""
VERWIJZINGEN — wijzen de toelichtingen nog naar het juiste bestand?

Deze codebase legt zijn afwegingen in commentaar vast en verwijst daarbij naar functies in
andere bestanden ("zie `bepaalStil` in render-tabel.js"). Verhuist zo'n functie, dan blijft die
verwijzing staan en stuurt hij de volgende lezer naar de verkeerde plek. Dit script leest elke
verwijzing van de vorm `naam` ... bestand.js en controleert of `naam` daar ook echt staat.
"""
import re, pathlib, json, sys
W = pathlib.Path(__file__).resolve().parent.parent
BRON = {p.name: p.read_text() for p in list((W/'src').glob('*.js')) + list((W/'apps-script').glob('*.gs'))}
BRON['index.html'] = (W/'index.html').read_text()
BRON['styles.css'] = (W/'styles.css').read_text()
BRON['sw.js'] = (W/'sw.js').read_text()

# "`naam`" ... "bestand.js" binnen één zin (max 120 tekens ertussen)
PAT = re.compile(r'`([A-Za-z_$][\w$.]*)`(?:\(\))?[^\n`]{0,120}?([\w.-]+\.(?:js|gs|html|css))')
fout, bekeken = [], 0
for bestand, tekst in BRON.items():
    for m in re.finditer(r'(?m)^\s*(?://|\*|/\*).*$', tekst):
        regel = m.group(0)
        for naam, doel in PAT.findall(regel):
            doelnaam = doel.split('/')[-1]
            if doelnaam not in BRON:      # verwijst naar iets buiten deze boom
                continue
            if doelnaam == bestand:       # "in dit bestand" — geen verhuizing te controleren
                continue
            bekeken += 1
            kern = naam.split('.')[0]
            if re.search(r'\b' + re.escape(kern) + r'\b', BRON[doelnaam]):
                continue
            fout.append({'in': bestand, 'noemt': naam, 'verwijst naar': doelnaam,
                         'regel': regel.strip()[:130]})
print(json.dumps({'gecontroleerd': bekeken, 'kloppen niet': fout}, indent=1, ensure_ascii=False))
