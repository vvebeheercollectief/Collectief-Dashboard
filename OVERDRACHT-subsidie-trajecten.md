# Subsidie-trajecten — waar we staan

**Voor:** Jer · **Datum:** 29 juli 2026, 's nachts afgerond
**Korte versie:** het is af en getest. Het staat op de oefenomgeving, niet op productie. Jij moet drie dingen doen, in deze volgorde.

---

## Wat er klaar is

Het vijfde tabblad **Subsidie-trajecten** bestaat, met zes kolommen en de fase als vijf klikbare bolletjes. Alles eromheen doet mee: zoeken, filteren, sorteren, bulk-acties, wegleggen, afronden, het VvE-dossier, Ctrl+K, de grafiek op Analytics, en de meldingen.

- **886 tests groen**, nul fouten (waren er 788 — er zijn er 98 bijgekomen).
- Staat op **staging**: [collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app](https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app)
- Versie 10.1, cache cd-v96. Branch `feature/subsidie-trajecten`, ook doorgezet naar `staging`.
- Ontwerp en plan staan vast in `docs/superpowers/specs/` en `docs/superpowers/plans/` (2026-07-29).

**Productie is niet aangeraakt.** Daar draait nog gewoon 10.0.

---

## Wat jij moet doen — in deze volgorde

### Stap 1 · Kijk op staging of het klopt

Open de link hierboven en **log in**. Dat kan alleen daar; op mijn eigen testserver kan ik niet inloggen (Google weigert dat).

Je ziet een leeg tabblad Subsidie-trajecten. Dat hoort zo — het blok bestaat nog niet in de test-Sheet. Klik gerust rond in de andere tabbladen om te controleren dat daar niets veranderd is.

> **Let op:** klik op dit tabblad nog niet op *Toevoegen*. Je krijgt dan een nette foutmelding ("De sectie Subsidie-trajecten bestaat nog niet in het tabblad Nog Te Doen"). Dat is een beveiliging die ik er bewust in heb gezet — zonder die melding zou een nieuwe taak middenin Oppakken belanden.

### Stap 2 · ~~Zet het blok in de test-Sheet~~ — AL GEDAAN

Klaar in de Sheet **"Collectief Dashboard - Kopie"**. Jer heeft de losse aantekeningen opgeruimd en het blok zelf strak achter LOD gezet:

- **Nog Te Doen:** blokkop op rij 87, kolomkoppen op rij 88. Rooster 154 rijen.
- **Afgerond:** blokkop op rij 117, kolomkoppen op rij 118.

Geverifieerd door de echte vorm door `parseSections` te halen: kolomkoprij komt uit op 88, `subsidieFase` wordt uit kolom D gelezen terwijl de offerte-`fase` uit kolom O leeg blijft, en de lege regels met "FALSE" in kolom H worden genegeerd. LOD blijft ongemoeid.

Je kunt op staging dus meteen op *Toevoegen* klikken en de bolletjes uitproberen. Ik heb bewust geen voorbeeldrijen neergezet — zelf een traject aanmaken is een betere test.

### Stap 3 · Zeg het als het goed is

Dan zet ik het op productie. Daar is de volgorde **dwingend**:

1. code live zetten
2. iedereen één keer verversen
3. **pas dán** het blok in de productie-Sheet

Andersom leest de oude code de kopregel en de trajecten als **LOD-rijen**, en dan staat er rommel in LOD op ieders scherm. Daarom doe ik dit niet alleen.

---

## Twee dingen die ik voor je heb opengelaten

### 1. De omschrijving per traject

De kolom **Subsidie** krijgt bij de zes verhuizende trajecten de neutrale tekst `Subsidieaanvraag`. Ik weet niet waar ze precies over gaan en ik ga daar niet naar gokken. Jij overschrijft die zes velden zelf in het dashboard — zes keer klikken en typen, twee minuten werk.

### 2. De knip in het logboek

Je koos ervoor de logboek-geschiedenis mee te verhuizen. Bij het voorbereiden zag ik dat dat te grof zou uitpakken: **381017** en **381105** hebben tientallen Oppakken-logregels die over meerdere maanden lopen en zichtbaar over ándere, allang afgeronde taken gaan. Het logboek kent geen taaknummer — alleen VvE-code en tabblad — dus die zijn niet automatisch uit elkaar te houden.

Alles blind meeverhuizen zou maanden vreemde geschiedenis aan het subsidietraject plakken.

**Wat ik voorstel:** als je terug bent, zet ik per VvE de Oppakken-logregels met datum en tekst voor je op een rij, en wijs jij aan vanaf welk moment het subsidieverhaal begint. Dat kost je vijf minuten en levert een schoon dossier op. Vóór er iets wijzigt maak ik een backup-tab, net als bij de vorige logboek-opschoning.

---

## De zes trajecten die verhuizen

| VvE | Beginfase |
|---|---|
| 381105 · Schlegelstraat 18-20-22 | Aangevraagd |
| 311028 · Naarderstraat 107 t/m 117 | Aangevraagd |
| 381017 · Van Musschenbroekstraat 31/33/35 | Aangevraagd |
| 311059 · Nunspeetlaan 355 t/m 365 | Voorbereiden |
| 311122 · Harderwijkstraat 161-163-165 | Aangevraagd |
| 301042 · Steijnlaan 189/191/193 | Aangevraagd |

Deze vijf blijven bewust staan waar ze staan, omdat subsidie daar alleen als *mogelijkheid* wordt genoemd: 361023 (Troelstrakade), 301074 (Herman Costerstraat), 311198 (Hoenderloostraat), 381025 (Pasteurstraat 85), 301065 (Kaapstraat). Blijkt er later een echt traject uit te komen, dan zet je bij die taak de subcategorie op *Subsidie-trajecten* en verschijnt hij onderaan het subsidie-tabblad in het lijstje "Ook hier" — zonder uit zijn eigen scherm te verdwijnen.

---

## Twee dingen die ik onderweg heb gevonden en gerepareerd

**Een gat bij het toevoegen.** Zoals hierboven beschreven: stond het sectieblok nog niet in de Sheet, dan belandde een nieuwe taak middenin Oppakken zonder dat iemand het merkte. Dat gold voor élke nieuwe sectie, niet alleen deze. Nu een duidelijke weigering.

**Een sorteerfout die op de loer lag.** LOD was altijd het laatste blok in de Sheet en werd gesorteerd als "alles onder de LOD-kop". Met een blok eronder zou LOD de subsidierijen mee gaan sorteren. Dat is nu netjes begrensd, en het subsidieblok krijgt zijn eigen sortering op deadline.

**Opgeruimd:** `SEC_ICONS` en `SEC_THEMES` waren restanten die nergens meer gebruikt werden. Weg, in plaats van er een vijfde icoon in te hangen dat toch niet getoond wordt.

---

## Precies wat er op productie moet gebeuren

Bij het inrichten van de test-Sheet ontdekte ik dat het op productie **niet** kan zoals ik eerst dacht. De situatie daar:

Productie is nog onaangeroerd (gecontroleerd). De situatie daar:

| Rijen | Wat er staat |
|---|---|
| t/m 95 | LOD-taken (laatste: 411008, Katendrechtse Lagedijk) |
| 96 – 103 | leeg |
| 104 – 107 | dezelfde losse aantekeningen in kolom B die je op test hebt opgeruimd |
| — | **het rooster stopt bij rij 107** |

Zolang die aantekeningen er staan is er geen vrije rij over. Twee wegen:

**Makkelijkst** — doe daar hetzelfde als op test: aantekeningen weghalen, blok strak achter LOD (kop op 97, kolomkoppen op 98). Dan hoeft het rooster niet eens verlengd te worden.

**Anders** — rooster eerst verlengen naar 160 rijen, dan het blok onder de aantekeningen. Let op: nieuwe rijen erven de rode opmaak van rij 107, dus daarna opmaak wissen.

Hoe dan ook blijft de volgorde dwingend:

1. Ruimte maken in de Sheet (aantekeningen weg óf rooster verlengen) — dit mag vooraf, het verandert niets aan wat het dashboard leest
2. Code naar productie
3. Iedereen één keer verversen
4. **Pas dan** het blok plaatsen
5. Hetzelfde blok onderaan het tabblad Afgerond
6. De zes trajecten verhuizen
