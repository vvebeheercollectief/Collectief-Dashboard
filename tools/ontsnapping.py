#!/usr/bin/env python3
"""
ONTSNAPPING — waar belandt Sheet-inhoud onontsnapt in HTML?

De rijen komen uit een Google Sheet waar mensen vrij in typen. Belandt zo'n waarde zonder `esc()`
in een sjabloonstring die als innerHTML wordt gezet, dan kan een cel met `<img onerror=…>` code
uitvoeren. Dit script zoekt interpolaties `${…}` in regels die duidelijk HTML opbouwen, en meldt
alles wat niet door een ontsnapper of een veilige bewerking gaat.

Veilig geacht: esc(), ico(), getallen, vergelijkingen, ternaries op vlaggen, en aanroepen van
functies die zelf al HTML teruggeven (die worden apart nagelopen).
"""
import re, pathlib, json
W = pathlib.Path(__file__).resolve().parent.parent
VEILIG = re.compile(r'^(?:'
    r'esc\(|ico\(|Math\.|Number\(|String\(\s*\+|\+\+|'
    r'[\w.]*(?:Html|HTML|Cel|cel|Rij|rij|Badge|badge|Pill|pill|Knop|knop|Span|span|Btn|btn|Ico|ico)\b|'
    r'[A-Z_]+\b|'                         # constanten
    r'\d|`|\'|"'
    r')')
# uitdrukkingen die per definitie geen tekst uit de Sheet zijn
GEEN_INHOUD = re.compile(r'^(?:[\w.]*(?:rid|idx|i|j|n|nr|row|_row|len|aantal|breedte|kolom|cols|colspan|volg|stap|pct|w|h|x|y)\b\s*$)')
uit = []
for f in sorted((W/'src').glob('*.js')):
    if f.name == 'tests.js': continue
    for nr, regel in enumerate(f.read_text().split('\n'), 1):
        if '${' not in regel: continue
        if not re.search(r'<\w+|</\w+>|class=|style=|data-|title=|aria-', regel): continue
        for expr in re.findall(r'\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}', regel):
            e = expr.strip()
            if not e or VEILIG.match(e) or GEEN_INHOUD.match(e): continue
            if 'esc(' in e: continue          # esc ergens binnenin (ternary met esc aan beide kanten)
            uit.append({'bestand': f.name, 'regel': nr, 'uitdrukking': e[:90],
                        'context': regel.strip()[:110]})
print(json.dumps({'aantal': len(uit), 'gevallen': uit}, indent=1, ensure_ascii=False))
