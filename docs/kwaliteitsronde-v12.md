# Kwaliteitsronde v12.0 — bevindingen

Werkwijze: eerst gereedschap (tools/kruisverwijzing.py) om contracten tussen bestanden
machinaal na te lopen, daarna per onderwerp met de hand. Elke bevinding krijgt een
oorzaak, niet alleen een symptoom, en wordt op ALLE plekken gerepareerd waar dezelfde
oorzaak speelt.

| # | ernst | onderwerp | staat |
|---|-------|-----------|-------|
| 1 | **hoog** | Bewerkscherm wiste stil een waarde die het niet kon tonen (deadline `eind juni`, fase `Toegekend`, teller `twee van drie`) | gefixt, v12.1 |
| 2 | midden | Weekkiezer toonde een opgeslagen week niet als die buiten 12 terug / 26 vooruit viel | gefixt, v12.1 |
| 3 | laag | Dode CSS: `.s-soon` (producent verdween in v12.0), `.pers-jer/-cihad/-gabos` (identiek aan `.pers-default`) | opgeruimd |
| 4 | laag | Zelftest `sync: eerste stille hapering` hing af van DOM-restanten van een eerder blok | onafhankelijk gemaakt |

## Oorzaak achter 1, 2 en 4

Eén en dezelfde regel, die al in `setv` stond maar niet overal gold:

> **een waarde die er al is mag nooit verdampen omdat het scherm hem niet kan tonen.**

`setv` loste dat voor een `<select>` op door de onbekende optie toe te voegen. Bij een
`<input type=date>`, de fase-ladder en de offerte-teller kan dat niet — die kennen maar één
vorm. Daar schreef Opslaan de mislukte omzetting terug. De weekkiezer maakte dezelfde fout in
zijn keuzelijst. Nu geldt de regel op alle vier de plekken, met toetsen die elk apart omvallen.

## Wat machinaal is nagelopen (0 bevindingen)

- **Contrast**: elk tekstelement op elke pagina en in het bewerkscherm, licht én donker → 0 onder 4,5:1.
- **Structuur**: 5 secties × 2 standen × 4 schermbreedtes → cellen = koppen, elke `data-action`
  heeft een afhandelaar, elke `data-rid` wijst naar de juiste rij, geen zijwaartse schuif.
- **Modulegraaf**: alle 47 modules laden.
- **Contracten** (`tools/kruisverwijzing.py`): geen actie zonder afhandelaar, geen afhandelaar
  zonder knop, geen id dat nergens gezet wordt.
