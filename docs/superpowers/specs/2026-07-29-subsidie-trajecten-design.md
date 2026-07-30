# Subsidie-trajecten: een vijfde sectie in "Nog Te Doen"

**Datum:** 2026-07-29
**Status:** ontwerp, goedgekeurd door gebruiker
**Branch:** `feature/subsidie-trajecten` (afgetakt van `main` op 10.0 / cd-v95)
**Versie na uitrol:** APP_VERSION 10.1 / CACHE_VERSION cd-v96

## Aanleiding

De gebruiker: *"Er zijn behoorlijk wat VvE's waar we subsidie aanvragen voor indienen en dan
dus dat proces voor moeten coördineren, maar dit kan erg veel overzicht vervuilen doordat
het mixt met onze normale taken."*

Dat is meetbaar zo. In het tabblad Oppakken staan op dit moment zes taken die niets anders
zijn dan een lopende subsidieaanvraag — "In afwachting van subsidie", "Subsidie aangevraagd.
Wachten op bericht." Ze staan tussen jaarrekeningen, schadedossiers en offerte-opvolging in,
en ze blijven daar maanden staan omdat wachten op de gemeente nu eenmaal lang duurt.

## Beslissingen

Genomen in het gesprek van 2026-07-29:

| # | Vraag | Besluit |
|---|-------|---------|
| 1 | Welke kolommen? | **Zes** — VvE Code, VvE, Subsidie, Fase, Behandelaar, Deadline. Opmerkingen bestaat wel maar staat niet in de tabel |
| 2 | Hoe wordt de fase getoond? | **Vijf klikbare bolletjes** met het fasewoord eronder. Nadrukkelijk visueel: "we willen ook echt een visueel element wat betreft de fase" |
| 3 | Welke fases? | **Vijf**: Voorbereiden → Aangevraagd → In behandeling → Verleend → Afgerond (bijgesteld 2026-07-30: tussen indienen en toekennen zit een aparte wachtperiode, en daar zit het merendeel van de trajecten in) |
| 4 | Wat gebeurt er met bestaande subsidietaken? | Gebruiker wijst ze zelf aan. Uitkomst: **de zes uit Oppakken verhuizen**, de vijf twijfelgevallen blijven staan |
| 5 | En hun logboekgeschiedenis? | **Meeverhuizen** — maar preciezer dan eerst gedacht, zie "Migratie" |
| 6 | Welke kleur? | **Teal** (nieuwe `--tl`-familie). Niet het bestaande `--gn`: groen betekent in dit dashboard overal "afgerond" |
| 7 | Waar in de rij tabs? | **Laatste**, achter LOD |

## Wat het wordt

Een vijfde tabblad in het scherm "Nog Te Doen", met dezelfde opbouw en bediening als de
bestaande vier: zoeken, filteren, sorteren, bulk-acties, wegleggen, afronden, het
VvE-dossier, Ctrl+K. Het verschil zit in twee dingen: de kolom **Subsidie** (waar gaat dit
traject over) en de kolom **Fase** (hoe ver is het).

De vormgeving ligt vast in `mockups/mockup-subsidie-trajecten.html` — een preview die de
echte `styles.css` inlaadt en dus letterlijk toont wat het wordt, in lichte én donkere modus.
Dat bestand is de bron voor de teal-waarden, de fase-CSS en de kolomvolgorde; die worden bij
het bouwen niet opnieuw verzonnen.

## Bevindingen die het ontwerp sturen

Vastgesteld op de echte code en de echte Sheets, deels door een audit van dertien agents
(zes zoekers per invalshoek, zes adversariële tegenlezers, één completeness-criticus).
116 bevindingen bleven na toetsing overeind, plus 11 gaten. De werklijst per bestand die
daaruit volgt staat in `docs/superpowers/plans/2026-07-29-subsidie-trajecten-plan.md`.

### Vier feiten die de aanpak bepalen

**1. De sectiesleutel mag niet `fase` heten.**
`parseSections` (src/data.js:220-266) vult eerst alle `SECS.keys` uit de rij, en overschrijft
daarna een aantal namen met vaste kolommen: `entry.fase` komt uit kolom O (de offerte-fase).
Een sectiesleutel `fase` wordt dus stilletjes overschreven. De sleutel heet daarom
**`subsidieFase`**. Verboden sleutelnamen zijn: `datum`, `opmerking`, `subcategorie`,
`opvolgdatum`, `herhaalId`, `esc`, `fase`, `aannemers`, `taakId`.

**2. Het rooster van de Sheet is te klein.**
"Nog Te Doen" is op productie **107 rijen** (data tot 95) en op test **91 rijen** (data tot
80), beide 17 kolommen breed. Het nieuwe blok kost 8 rijen (kop + kolomkop + zes trajecten)
en daarna is er vrijwel geen groeiruimte. Schrijfacties buiten het rooster **mislukken zonder
foutmelding** — de les uit de offerte-sessie. Het rooster wordt daarom eerst verlengd naar
**160 rijen**, op beide Sheets. Dat is data tot 95 + 8 voor het blok + ruim vijftig rijen
groeiruimte, zodat dit de komende jaren niet opnieuw hoeft.

**3. De uitrolvolgorde is dwingend en niet omkeerbaar.**
`parseSections` herkent alleen sectienamen die in `SKEYS` staan. Staat het blok
`SUBSIDIE-TRAJECTEN` wél in de Sheet maar draait er nog oude code, dan blijft de parser in de
LOD-sectie hangen en leest hij de kopregel én de zes trajecten **als LOD-rijen**. Dat is
zichtbaar voor iedereen met een openstaand dashboard. De volgorde is dus:

> rooster verlengen → code live (met cache-bump) → pas dán het blok in de Sheet

Nooit andersom. Op productie hoort daar een harde verversing tussen.

**4. De kolommen vertalen niet één-op-één bij de migratie.**
Oppakken heeft de deadline op **D** en prioriteit op **F**; de nieuwe sectie heeft Subsidie
op **C**, Fase op **D** en de deadline op **F**. De zes rijen kunnen dus niet als blok
gekopieerd worden — elk veld gaat naar zijn eigen nieuwe kolom. En ze moeten **geknipt**
worden over het volle bereik **A t/m Q**, niet A:H, anders verdwijnen het vaste taaknummer
(Q), de opvolgdatum (L) en de escalatievlag (N).

## De sectie

### Sheet-indeling

Zelfde stramien als LOD, met "Status" vervangen door "Fase":

| Kolom | A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|---|
| Kop | VvE Code | VvE | Subsidie | Fase | Behandelaar | Deadline | Opmerkingen | In behandeling |
| Sleutel | `code` | `naam` | `subsidie` | `subsidieFase` | `behandelaar` | `deadline` | `opmerkingen` | `inBehandeling` |

Kolom I t/m Q blijven zoals overal: I afronddatum, K subcategorie, L opvolgdatum,
M herhaal-id, N escalatie, Q vast taaknummer. Precies acht sleutels — meer mag niet, want
`afOff = Math.max(keys.length, 8)` bepaalt waar kolom I begint.

De blokkop `SUBSIDIE-TRAJECTEN` staat alleen in kolom A met kolom B leeg (anders herkent
`isSectieKop` hem niet), en de rij eronder moet in kolom A exact `VvE Code` of `VvE-Code`
bevatten. Zonder die kolomkoprij weet `getInsertRow` niet waar de eerste taak moet landen.

Hetzelfde blok komt onderaan het tabblad **Afgerond**, anders kan een afgerond traject
nergens heen.

### De vijf fases

`Voorbereiden` → `Aangevraagd` → `In behandeling` → `Verleend` → `Afgerond`, opgeslagen als
gewoon woord in kolom D. Dus ook leesbaar als je de Sheet zelf openslaat.

- Een **lege** cel telt als *Voorbereiden*.
- Een **onbekende** waarde (typfout, handmatig ingevuld) mag niet crashen: de rij blijft
  staan en toont stap 1.

### De fase-indicator

Vijf `<button>`-elementen in een `role="group"`, met `aria-pressed` op de actieve stap en een
`aria-label` per stap ("Zet op Verleend"). Echte buttons, geen klikbare `<span>`s — dat is de
lijn die deze app sinds de toegankelijkheidsronde aanhoudt. Eronder staat het fasewoord in
tekst, want kleur alleen is geen informatiedrager.

Klikken schrijft de fase weg via het bestaande `backgroundWrite`-patroon: optimistisch
muteren, opnieuw tekenen, `ensureToken`, `assertRowMatch` (de schrijf-guard die controleert
of de rij nog dezelfde taak is), dan de write. Bij een fout: terugdraaien en rode toast.
De wijziging komt in het logboek van de taak, zodat later terug te zien is wanneer de
subsidie verleend werd.

Op aanraakschermen krijgen de bolletjes een ruimer raakvlak dan hun 11 pixels, maar alleen
in de tabelvariant — in de modal staan ze al ruim genoeg uit elkaar.

### Prioriteit en rust

| Regel | Waarde | Reden |
|---|---|---|
| `PRIO_REGELS` | hoog ≤14 dagen, midden ≤45 | Subsidietrajecten lopen lang; strengere drempels kleuren alles rood |
| `STIL_ESCALATIE_REGELS` | trap1 21, trap2 42 | Idem, en gelijk te houden met `CD_STIL_ESCALATIE_REGELS` in Apps Script |
| Stil-pill | **uit** | Wachten is hier de normale toestand, niet een signaal. Zelfde uitzondering als Offerte-trajecten |
| Opvolgen / wegleggen | **aan** | Dít is het echte gereedschap op dit tabblad |

Zonder een `PRIO_REGELS`-regel krijgt elke subsidietaak prioriteit `''`: het prioriteitsfilter
matcht dan nooit en de rij zakt altijd naar onderen. Dat valt makkelijk over het hoofd omdat
"te laat" wél blijft werken.

### Kleur

Nieuwe familie in `styles.css`, in beide thema's, in dezelfde stijl als `--am`/`--pu`/`--rd`:

```
:root            --tl:#0F766E; --tl-l:#e3f2f0; --tl-b:#b3ddd7;
[data-theme=dark] --tl:#5EC8BC; --tl-l:#10302E; --tl-b:#1F5049;
```

`SECS['SUBSIDIE-TRAJECTEN'].color` krijgt de **letterlijke hex** `#0F766E`, geen `var(--tl)`.
Reden: de donut op Analytics haalt die waarde door `_lightenHex()` en
`ctx.createLinearGradient()`, en die kunnen niet met een `var()`-string overweg.

De tab-onderstreping blijft leiblauw, net als bij alle vijf de tabs. Dat is bestaand gedrag;
het veranderen zou de vier huidige tabbladen ook raken en valt buiten deze opdracht. De teal
komt terug in de fase-bolletjes, het "Ook hier"-lijstje en het sorteerpijltje.

### Subcategorie

Alle vijf de bewerkschermen krijgen `Subsidie-trajecten` als extra keuze. Daarmee kan een taak
die formeel in Oppakken of Offerte-trajecten thuishoort tóch onderaan het subsidie-tabblad
meelopen in het lijstje "Ook hier", zonder uit zijn eigen scherm te verdwijnen. Dat is de
opvang voor de vijf twijfelgevallen die nu blijven staan.

## Migratie

### De zes trajecten

| VvE | Beginfase |
|---|---|
| 381105 · Schlegelstraat 18-20-22 | Aangevraagd |
| 311028 · Naarderstraat 107 t/m 117 | Aangevraagd |
| 381017 · Van Musschenbroekstraat 31/33/35 | Aangevraagd |
| 311059 · Nunspeetlaan 355 t/m 365 | Voorbereiden |
| 311122 · Harderwijkstraat 161-163-165 | Aangevraagd |
| 301042 · Steijnlaan 189/191/193 | Aangevraagd |

Knippen, niet kopiëren. Volledig bereik A t/m Q, met de kolomvertaling uit bevinding 4.
Het vaste taaknummer in Q gaat mee, zodat de schrijf-guard de rij blijft herkennen.

De kolom **Subsidie** wordt gevuld met `Subsidieaanvraag`. Dat is bewust neutraal: de
werkelijke omschrijving per VvE is niet bekend en wordt niet geraden. De gebruiker
overschrijft die zes velden zelf in het dashboard.

### Het logboek

Eerst was het plan: alle logregels van deze zes VvE's met sectie `OPPAKKEN` omzetten naar
`SUBSIDIE-TRAJECTEN`. Inspectie van het Logboek-tabblad (2.195 rijen) liet zien dat dat te
grof is. Codes als 381017 en 381105 hebben tientallen Oppakken-logregels die over maanden
lopen en zichtbaar over ándere, inmiddels afgeronde taken gaan. Het logboek kent geen
taaknummer, alleen VvE-code + sectie, dus die zijn niet automatisch uit elkaar te houden.

**Aangepaste aanpak:** per VvE wordt de lijst Oppakken-logregels met datum en tekst aan de
gebruiker voorgelegd; die wijst aan vanaf welk moment het subsidieverhaal begint. Alleen
regels vanaf dat moment krijgen sectie `SUBSIDIE-TRAJECTEN`. Vóór de wijziging een
backup-tab, zoals bij de vorige logboek-opschoning.

Dit gebeurt **niet** tijdens de nachtelijke bouw — het vraagt een oordeel dat alleen de
gebruiker kan geven.

## Bewust niet

| Punt | Besluit |
|---|---|
| Herhaalregels voor subsidie | **Nee.** De sectiekeuze in `#hh-sectie` biedt alleen Oppakken en LOD. Een subsidieaanvraag is per VvE eenmalig, geen terugkerende taak |
| Server-side prioriteitsherberekening | **Nee.** `cd_recalcPrioriteiten` werkt alleen op Oppakken, de enige sectie met een Prioriteit-kolom. Wordt vastgelegd in het SYNC-commentaar |
| `RASTER_MIN` ophogen | **Nee.** Het aantal kolommen blijft 17; alleen het aantal rijen groeit, en dat bewaakt de structuurcheck niet |
| Tab-onderstreping in sectiekleur | **Nee.** Zou de vier bestaande tabbladen ook raken |
| Automatisch alles met "subsidie" verhuizen | **Nee.** Door gebruiker afgewezen: veel logregels noemen subsidie als *mogelijkheid*, niet als lopend traject |
| Bedrag / dossiernummer als kolom | **Nee.** "Anders wordt het te druk en mis je de simpliciteit die overzicht juist mogelijk maakt" |

## Opruiming die meelift

`SEC_ICONS` en `SEC_THEMES` (src/render-lijsten.js:17-32) zijn gedefinieerd en geëxporteerd
maar worden nergens geïmporteerd — restant van de compacte-statkop-verbouwing (v8.8). Ze
worden verwijderd in plaats van uitgebreid met een vijfde entry, anders tekent de volgende
lezer een subsidie-icoon dat nooit getoond wordt.

## Uitrol

1. Rooster verlengen op TEST en PROD (`Nog Te Doen` naar ±160 rijen)
2. Code naar `staging` → automatische deploy naar de Vercel-testomgeving + TEST-Apps Script
3. Blok toevoegen aan de TEST-Sheet ("Nog Te Doen" én "Afgerond"), inclusief de
   afvink-checkbox als data-validatie op kolom I
4. Gebruiker test **ingelogd** op de staging-URL (inloggen kan alleen daar — localhost geeft
   `origin_mismatch`)
5. Na akkoord: `staging` → `main` → GitHub Pages + PROD-Apps Script
6. Harde verversing, dán het blok toevoegen aan de PROD-Sheet
7. Zes trajecten migreren, omschrijvingen invullen, logboek-knip bepalen

Stap 5 en verder zijn nadrukkelijk **niet** autonoom uit te voeren: ze raken de dagelijkse
werkomgeving van vier mensen en vragen een ingelogde controle die alleen de gebruiker kan doen.

## Testen

De suite draait nu 788 asserts (`?test=1` → `window._testResult`). Erbij komen ten minste:

- `parseSections` leest het nieuwe blok, met `subsidieFase` uit kolom D en zonder botsing
  met de offerte-`fase` uit kolom O
- Leeg en onbekend fasewoord vallen terug op stap 1 zonder fout
- `berekenPrioriteit` geeft Hoog/Midden/Laag op de grenzen 14 en 45
- De stil-pill blijft weg op dit tabblad, maar opvolgen/wegleggen werkt wel
- `SECS.keys` blijft precies 8 lang (bewaakt `afOff`)
- `submitTask` en `bulkAfronden` schrijven 11 waarden in de juiste kolomvolgorde
- `BULK_DEADLINE_KOLOM` en `NTD_DATUM` wijzen naar kolom F, niet D
- De kolomvertaling van de migratie: een Oppakken-rij wordt correct omgezet naar de nieuwe
  kolomindeling
