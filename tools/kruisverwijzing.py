#!/usr/bin/env python3
"""
KRUISVERWIJZING — vier contracten tussen de bestanden nalopen zonder Node.

Dit script draait puur op tekst en vindt precies de klasse fouten die een
zelftest niet ziet omdat er niets ontploft: een knop met een actie die niemand
afhandelt, een id waar de code naar grijpt maar dat niet bestaat, CSS voor een
klasse die nergens meer gezet wordt, en een export die niemand importeert.

Bewust GEEN parser: de bestanden zijn ES-modules met sjabloonstrings vol HTML,
en een half-werkende parser geeft meer vals alarm dan hij waard is. Alles wat
hier uitkomt is een AANWIJZING die met de hand nagekeken moet worden.
"""
import re, sys, pathlib, json
from collections import defaultdict

WORTEL = pathlib.Path(__file__).resolve().parent.parent
SRC = sorted((WORTEL / 'src').glob('*.js'))
CODE = [f for f in SRC if f.name != 'tests.js']
HTML = (WORTEL / 'index.html').read_text()
CSS = (WORTEL / 'styles.css').read_text()
TESTS = (WORTEL / 'src' / 'tests.js').read_text()
ALLE_JS = {f.name: f.read_text() for f in SRC}
CODE_TEKST = '\n'.join(ALLE_JS[f.name] for f in CODE)

def zonder_commentaar(t):
    t = re.sub(r'/\*[\s\S]*?\*/', '', t)
    return re.sub(r'(?m)^\s*//.*$', '', t)

bevindingen = defaultdict(list)

# ── 1. data-action: elke knop moet een afhandelaar hebben, en andersom ──
acties_gebruikt = set(re.findall(r"data-action=[\"']([a-z0-9-]+)[\"']", CODE_TEKST + HTML))
acties_gebruikt |= set(re.findall(r"dataset\.action\s*=\s*['\"]([a-z0-9-]+)['\"]", CODE_TEKST))
acties_js = ALLE_JS['actions.js']
blok = acties_js[acties_js.index('const ACTIONS'):] if 'const ACTIONS' in acties_js else acties_js
acties_bekend = set(re.findall(r"^\s{2}'([a-z0-9-]+)'\s*:", blok, re.M))
acties_bekend |= set(re.findall(r"ACTIONS\['([a-z0-9-]+)'\]\s*=", CODE_TEKST))
for a in sorted(acties_gebruikt - acties_bekend):
    bevindingen['actie zonder afhandelaar'].append(a)
for a in sorted(acties_bekend - acties_gebruikt):
    if a not in TESTS:
        bevindingen['afhandelaar zonder knop'].append(a)

# ── 2. element-id's: grijpt de code naar iets dat niet bestaat? ──
ids_html = set(re.findall(r'\sid="([^"]+)"', HTML))
ids_dynamisch = set(re.findall(r"id=[\"']\$\{", CODE_TEKST))  # sjabloon-id's, niet te controleren
ids_gezet_in_js = set(re.findall(r"""\sid=[\"']([a-zA-Z][\w-]*)[\"']""", CODE_TEKST))
# Ook id's die met de hand op een element gezet worden (`b.id='offline-banner'`) en id's die
# via een hulpfunctie in een sjabloon belanden (`sel('kmk-balkons', …)`). Zonder deze twee
# regels meldt het script vijf banners en keuzelijsten die gewoon bestaan.
ids_gezet_in_js |= set(re.findall(r"\.id\s*=\s*['\"]([\w-]+)['\"]", CODE_TEKST))
ids_gezet_in_js |= set(re.findall(r"\(\s*['\"]([a-z][\w-]*-[\w-]+)['\"]\s*,", CODE_TEKST))
ids_gevraagd = set(re.findall(r"getElementById\(\s*['\"]([\w-]+)['\"]", CODE_TEKST))
ids_gevraagd |= set(re.findall(r"querySelector\(\s*['\"]#([\w-]+)['\"]", CODE_TEKST))
for i in sorted(ids_gevraagd - ids_html - ids_gezet_in_js):
    bevindingen['id opgevraagd maar nergens gezet'].append(i)

# ── 3. CSS-klassen: opmaak zonder gebruiker, en gebruikers zonder opmaak ──
css_klassen = set()
for sel in re.findall(r'(?m)^[^@\n{][^{]*\{', zonder_commentaar(CSS)):
    css_klassen |= set(re.findall(r'\.([a-zA-Z][\w-]*)', sel))
gebruikt = set()
for m in re.findall(r'class=[\"\']([^\"\'{}]*)[\"\']', CODE_TEKST + HTML):
    gebruikt |= set(m.split())
for m in re.findall(r'class=[\"\']([^\"\']*)[\"\']', CODE_TEKST):
    gebruikt |= set(re.findall(r'[a-zA-Z][\w-]*', re.sub(r'\$\{[^}]*\}', ' ', m)))
for fn in ('classList.add', 'classList.remove', 'classList.toggle', 'classList.contains'):
    gebruikt |= set(re.findall(re.escape(fn) + r"\(\s*['\"]([\w-]+)['\"]", CODE_TEKST))
for m in re.findall(r"className\s*=\s*['\"]([^'\"]*)['\"]", CODE_TEKST):
    gebruikt |= set(m.split())
for m in re.findall(r"classList=['\"]([^'\"]*)['\"]", CODE_TEKST):
    gebruikt |= set(m.split())
# Samengestelde klassenamen: `pers-${x}`, 'rij-puls-'+kleur, `prio-${p}`. De losse helft is niet
# te herleiden, dus alles wat met een gebruikt VOORVOEGSEL begint telt als gebruikt. Anders staat
# de halve stylesheet als 'ongebruikt' in het verslag en kijkt niemand er meer naar.
voorvoegsels = set()
for m in re.findall(r"[`'\"]([a-z][\w-]*-)(?:\$\{|'\s*\+|\"\s*\+)", CODE_TEKST):
    voorvoegsels.add(m)
for m in re.findall(r"class=[\"'][^\"']*?([a-z][\w-]*-)\$\{", CODE_TEKST):
    voorvoegsels.add(m)
for k in sorted(css_klassen - gebruikt):
    if k in TESTS:
        continue
    if any(k.startswith(v) for v in voorvoegsels):
        continue
    bevindingen['CSS-klasse zonder gebruiker'].append(k)

# ── 4. exports die niemand importeert ──
geimporteerd = set()
for t in ALLE_JS.values():
    for m in re.findall(r'import\s*\{([^}]*)\}\s*from', t):
        for naam in m.split(','):
            geimporteerd.add(naam.strip().split(' as ')[0].strip())
for f in CODE:
    t = ALLE_JS[f.name]
    for m in re.findall(r'(?m)^export\s*\{([^}]*)\}', t):
        for naam in m.replace('\n', ' ').split(','):
            n = naam.strip().split(' as ')[-1].strip()
            if n and n not in geimporteerd:
                bevindingen['export die niemand importeert'].append(f'{f.name}: {n}')
    for n in re.findall(r'(?m)^export\s+(?:const|function|class)\s+(\w+)', t):
        if n not in geimporteerd:
            bevindingen['export die niemand importeert'].append(f'{f.name}: {n}')

uit = {k: sorted(set(v)) for k, v in bevindingen.items()}
print(json.dumps(uit, indent=1, ensure_ascii=False))
print('\nSAMENVATTING:', {k: len(v) for k, v in uit.items()}, file=sys.stderr)
