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
| 5 | **midden** | VvE-code en 'Terug <datum>'-pil waren klikbaar maar niet met het toetsenbord te bereiken | gefixt, v12.1 |
| 6 | laag | Twee toelichtingen wezen naar het verkeerde bestand (PRIO_REGELS "in index.html", `magSlepen` "in main.js") | rechtgezet |

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

## Bevinding 5 in detail — het mechanisme stond er al

De centrale delegatie in `actions.js` maakt élk element met `data-action` klikbaar, óók een
`<span>`. Onderaan diezelfde handler stond al een tak die Enter en spatie afhandelt voor
"een aanklikbaar element dat GEEN knop is" — met de uitdrukkelijke voorwaarde dat het element
zich met `tabindex` moet aanmelden.

**Geen enkel element deed dat.** Die tak is dus nooit één keer afgegaan. Gevolg: de VvE-code in
de rij (een dossier openen kon zonder muis alleen via Ctrl+K) en de 'Terug <datum>'-pil hadden
een wijzende hand en geen toetsenbordweg. De reparatie is dus niet nieuwe code maar de twee
elementen zich laten aanmelden — in `vveCodeSpan` (één gedeelde helper, dus overal tegelijk) en
op de drie plekken die de snooze-pil tekenen. Ik had eerst een tweede handler toegevoegd; die
vuurde de actie dubbel en is weer weg.

De sleepgreep blijft bewust buiten: slepen kán niet met een toetsenbord, en de volgorde is ook
via het bewerkscherm te wijzigen. De toets zondert precies die ene uit en niets anders.

## SYNC-afspraken met de Apps Script-backend — met de hand nagelopen

| afspraak | frontend | backend | gelijk |
|---|---|---|---|
| stil-escalatie (5 secties × trap1/trap2) | `STIL_ESCALATIE_REGELS` util.js | `CD_STIL_ESCALATIE_REGELS` Opvolging.gs | ja |
| sectieloze logregels die meetellen | `SECTIELOOS_TELT` render-tabel.js | `CD_SECTIELOOS_TELT` Opvolging.gs | ja |
| prioriteitsdrempels Oppakken | `PRIO_REGELS.OPPAKKEN` 7/14 | `ap_berekenPrio` 7/14 | ja |
| omschrijvingskolom per sectie | `OMSCHRIJVING_VELD` crud.js | `CD_OMSCHRIJVING_COL` Notifications.gs | ja (C/D/G/C/C) |

| 7 | **midden** | Taaknummer had maar 3 tekens toeval: 0,2% botsingskans bij 'ook voor andere VvE's' (12 ineens) | 6 tekens, beide kanten |
| 8 | midden | `koppelBereiken` kon een LEGE kolom Q schrijven en zo een vers taaknummer wissen | dwingt het nu zelf af |
| 9 | laag | Toelichting bij `uniekTaakId` noemde nog "drie willekeurige tekens" | bijgewerkt |

## Bevinding 7+8 — het taaknummer is identiteit

Kolom Q draagt de identiteit van een taak: de schrijf-guard vergelijkt hem, bundels verwijzen
ermee naar hun kop, `kiesAfgerondRij` zoekt er de juiste afgeronde rij mee. Twee taken met
hetzelfde nummer laten de rij-controle naar de VERKEERDE rij schrijven.

Het tijdsdeel van het nummer is per milliseconde gelijk, dus alle bescherming zat in drie
willekeurige tekens = 46.656 waarden. Gemeten over 2.000 rondes van twaalf nummers ineens —
precies wat 'ook voor andere VvE's' doet — botste **0,2% van de rondes**. Nu zes tekens
(2,2 miljard): 0 botsingen op dezelfde meting. Woordelijk gelijk gehouden met
`cd_nieuwTaakId` in de backend.

De bestaande uniekheids-lus in `crud.js` blijft staan ('klein' is niet 'nul'), en de twee
nummers die `koppelSubtaak` in dezelfde adem maakt kunnen nu niet meer aan elkaar gelijk zijn.

`ontkoppelBereiken` hield kolom Q al buiten zijn schrijfbereik, met een uitgeschreven reden:
een meegeschreven lege Q wist een nummer dat een collega of de backfill net heeft gezet, en
juist dát geval kan de rij-guard niet zien. `koppelBereiken` hield diezelfde belofte — maar
alleen doordat de aanroeper in een ánder bestand eerst een nummer maakt. Nu laat de functie Q
zelf weg zodra het nummer leeg is.

| 10 | laag | Weescommentaren van verwijderde constanten (`GEEN_STIL_PILL`, `HEEFT_SIGNAAL_KOLOM`) | opgeruimd |
| 11 | laag | Vijf toelichtingen noemden nog de Signaal-kolom of een datumbreedte van 155px (is 165 sinds v11.8) | bijgewerkt |

## Nog machinaal nagelopen (0 bevindingen)

- **Ontsnapping**: élk veld van élke sectie gevuld met `"><img src=x onerror=…>`, daarna alle
  vijf de tabbladen, Afgerond, ALV, Logboek, Ontwikkeling, het VvE-dossier, het bewerkscherm en
  het commandopalet getekend. Geen uitvoering, geen ingeslopen element, geen enkele weergave die
  struikelt. Vastgelegd als blijvende toets.
- **Datumverwerking**: zestien randgevallen (31 februari, 29-02 in een niet-schrikkeljaar,
  2-cijferig jaar, spaties, ISO met losse cijfers, US-volgorde). Alle onmogelijke datums geweigerd.
- **Filteren en sorteren**: zoekterm, VvE-code, behandelaar, prioriteit, statuspillen, en sorteren
  op code en deadline in beide richtingen — allemaal correct, inclusief de groepsvolgorde
  (actief / in behandeling / weggelegd). De prioriteitsfilter kijkt bewust naar de BEREKENDE
  prioriteit, niet naar de opgeslagen kolom; dat staat uitgeschreven en is getoetst.
- **Prestaties**: 11–35 ms per hertekening bij de echte omvang (96 taken, 1.300 logregels).
  Schaalt sublineair (4× rijen → 2× tijd), dus geen verborgen kwadratisch gedrag. De omvang van
  het logboek doet er sinds v12.0 niets meer toe (5.000 regels even snel als 1.300): de stil-index
  wordt niet meer per hertekening opgebouwd.
- **Eindsweep** op 378, 1440 en 1920 px, vijf secties × twee standen: cellen = koppen, elke actie
  heeft een afhandelaar, elk klikbaar element is te focussen (behalve de sleepgreep), elke `rid`
  wijst naar de juiste rij, geen zijwaartse schuif.
