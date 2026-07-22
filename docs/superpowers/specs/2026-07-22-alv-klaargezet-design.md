# ALV's Overzicht: stap "Klaargezet" + resetknop voor een nieuwe vergaderronde

**Datum:** 2026-07-22
**Status:** ontwerp, goedgekeurd door gebruiker
**Versie na uitrol:** APP_VERSION 7.9 / CACHE_VERSION cd-v74

## Aanleiding

In de vakantieperiode worden er geen vergaderingen gehouden, maar wordt het voorwerk
al gedaan: agenda's uitschrijven en vergaderingen klaarzetten. De uitnodigingen gaan
pas weken later de deur uit.

Het ALV's Overzicht meet voortgang nu op `Uitnodiging verstuurd`. Dat vinkje kan tijdens
het voorwerk niet worden gezet zonder de administratie onwaar te maken — er is nog niets
verstuurd. Daardoor is er geen manier om te zien welke vergaderingen al klaarstaan en
welke uitnodigingen straks nog verstuurd moeten worden.

Tot nu toe werd dit opgelost door elk jaar een lijst uit te printen en met de hand af te
strepen. Dat papieren ritueel moet het dashboard overnemen, inclusief het "nieuw vel"-moment.

## Beslissingen

Genomen tijdens de brainstorm van 2026-07-22:

| # | Vraag | Besluit |
|---|-------|---------|
| 1 | Eén vinkje of meerdere deelstappen? | **Eén vinkje: `Klaargezet`** — agenda uitgeschreven, klaar om verstuurd te worden |
| 2 | Extra kolom of apart scherm? | **Extra kolom in het bestaande ALV's Overzicht**, geen tweede scherm |
| 3 | Reset voor een nieuwe ronde? | **Ja, een resetknop** — dit bestond nog niet, de lijst werd jaarlijks uitgeprint |
| 4 | Wat wist de reset? | **Alle vier de vinkjes** (Klaargezet, Uitnodiging, Notulen, Begroting) |
| 5 | Bevestiging? | **Ja**: "Weet je zeker dat je het overzicht wilt resetten?", **Annuleer links, Reset rechts** |
| 6 | Vangnet onder de reset? | **Ja, eerst archiveren** naar een archieftabblad |
| 7 | Budget-VvE's uit de werklijst filteren? | **Nee**, blijft zoals het is — het blauwe Budget-label volstaat |

## Datamodel

Eén nieuwe kolom in het tabblad **"ALV's overzicht"**:

| Kolom | Veld | Type |
|-------|------|------|
| A | VvE-code | tekst |
| B | VvE-naam | tekst |
| C | Uitnodiging | selectievakje |
| D | Notulen | selectievakje |
| E | Begroting | selectievakje |
| F | Opmerkingen | tekst (`Budget` = budgetpakket) |
| **G** | **Klaargezet** | **selectievakje (nieuw)** |

`Klaargezet` komt **achteraan** en nadrukkelijk niet tussen B en C. De kolomnummers 3/4/5
zitten hard gecodeerd op meerdere plaatsen (zie Technische aandachtspunten); een kolom
ertussen zou die stil kapotmaken.

In `parseAlvo` (`src/data.js`) komt er één regel bij, met dezelfde `'TRUE'`-vergelijking als
de andere vlaggen:

```js
const klaar = (r[6]||'').trim()==='TRUE';
```

## Statusmodel

De status blijft **afgeleid**, er wordt niets extra's opgeslagen. Vier trappen in plaats van drie:

```
notulen      → Afgerond
uitnodiging  → Gepland
klaargezet   → Klaargezet   ← nieuw
anders       → Open
```

Dit geldt op beide plekken waar de status wordt bepaald: `parseAlvo` (`src/data.js`) en
`_recomputeAlvoStatus` (`src/render-alv.js`). Die twee moeten gelijk blijven.

De vlaggen blijven **onafhankelijk**, precies zoals nu. `Uitnodiging` aanvinken zet
`Klaargezet` niet automatisch aan, en `Klaargezet` blijft aan staan nadat de uitnodiging
verstuurd is — zo blijft zichtbaar dat een vergadering netjes was voorbereid.

## Schermen

### ALV's Overzicht

- Nieuwe kolom `Klaargezet`, in de tabel weergegeven **vóór** `Uitnodiging`. De volgorde in
  de Sheet is een technisch detail; de schermvolgorde volgt de werkvolgorde.
- Zelfde `flag-toggle`-pil als de bestaande vlaggen, via `ALVO_COLS.klaargezet = 6` en
  `ALVO_LABELS.klaargezet = 'Klaargezet'`.
- Statusfilter `#f-status-alvo` krijgt de optie `Klaargezet`.
- Stat-tegel `Klaargezet` erbij (tussen Gepland en Open), en **alle stat-tegels worden
  klikbaar**: een klik zet `#f-status-alvo` op die status en hertekent. Dat is de afstreeplijst.
  Nogmaals klikken op de actieve tegel wist het filter.
- Knop **"Nieuwe ronde starten"** in de kaartkop.

### VvE-dossier

`src/render-vve.js` toont de ALV-vlaggen van één VvE. `klaargezet` gaat mee in die lijst,
zodat de twee schermen niet uit elkaar lopen.

### Takenpagina

De voortgangsbalk (`renderNtdDonut`, `src/render-lijsten.js`) blijft meten op *verstuurde
uitnodigingen* — dat is de mijlpaal naar buiten. Er komt een lichter segment bij voor
"klaargezet maar nog niet verstuurd", zodat zichtbaar is dat er voorwerk klaarstaat.

### Dossier-chat

`src/dossier-chat.js` vertelt de assistent nu of de uitnodiging verstuurd is. Daar komt de
klaargezet-stand bij, zodat de chat geen achterhaald beeld geeft.

## Werkproces

Dit is waar het ontwerp voor bedoeld is; de rest is techniek.

**Vakantieperiode — klaarzetten.** Filter op *Open* (of klik de tegel). Dat is de stapel werk.
Per VvE de agenda uitschrijven, dan `Klaargezet` aanvinken. De teller Open loopt terug,
Klaargezet loopt op. Dat is het afstrepen.

**Verstuurweken — uitnodigingen eruit.** Filter op *Klaargezet*. Dat is exact de stapel
uitnodigingen die de deur uit moet, en niets anders. `Uitnodiging` aanvinken → de rij wordt
*Gepland* en valt uit het filter. Lijst leeg = alles verstuurd.

**Na de vergadering.** Notulen aanvinken → *Afgerond*. Ongewijzigd.

**Nieuwe ronde.** Eén keer op "Nieuwe ronde starten". Schoon vel.

Er is nooit een tweede lijst en er hoeft nergens onthouden te worden hoe ver je was: het
filter ís de afstreeplijst.

## Resetknop

### Flow

1. Klik op **"Nieuwe ronde starten"** in de kaartkop van het ALV-overzicht.
2. Bevestigingsvenster:
   - Titel: **"Weet je zeker dat je het overzicht wilt resetten?"**
   - Toelichting met het aantal geraakte VvE's en de mededeling dat de huidige ronde eerst
     naar een archieftabblad wordt weggeschreven.
   - Knoppen: **Annuleer links, Reset rechts.** Reset in de waarschuwingskleur.
   - Toetsenbord: Escape annuleert, focus-trap via de bestaande `modal-a11y.js`.
3. Verse `loadAll()` en hercontrole van de rij-identiteit (zie hieronder).
4. **Archiveren**: het tabblad "ALV's overzicht" wordt gedupliceerd naar
   `ALV-archief <jaar>`. Bestaat die naam al, dan `ALV-archief <jaar> (2)`, enzovoort.
5. **Wissen**: kolommen C, D, E en G worden op `FALSE` gezet voor het rijbereik van de
   echte VvE-rijen.
6. Eén logboekregel: wie, wanneer, hoeveel rijen, naar welk archieftabblad.
7. `loadAll()` en hertekenen. Toast met de uitkomst.

### Rijbereik — niet de hele kolom

Onderaan het tabblad staan samenvattingsregels (`Totaal …`, `Uitnodigingen …`) die
`parseAlvo` overslaat. Die mogen niet overschreven worden.

Daarom een pure, testbare helper:

```js
_resetBereik(alvo) → { start, end, aaneengesloten }
```

die `min(_row)` en `max(_row)` bepaalt en controleert of de rijen aaneengesloten zijn.
Aaneengesloten → vier `repeatCell`-verzoeken in één `batchUpdate`. Niet aaneengesloten →
per rij schrijven. `FALSE` en niet leeg, zodat de selectievakjes blijven staan.

### Rij-identiteit vóór de schrijfactie

De losse vlaggen zijn beschermd met `assertRowMatch`. Voor een bulkschrijfactie is dat te
smal. Vóór het wissen wordt kolom A over het hele bereik opnieuw gelezen en vergeleken met
de codes in het geheugen. Bij één afwijking: afbreken, niets schrijven, foutmelding met het
verzoek de pagina te verversen.

### Archieftabblad NIET als laatste tabblad invoegen

Kritiek. De oude `verplaatsALV`-trigger in `apps-script/Code.gs` schrijft afgeronde ALV's
naar `allSheets[allSheets.length - 1]` — het **laatste** tabblad. Een archieftabblad
achteraan zou die afgeronde ALV's in het archief laten belanden in plaats van in
"ALV's Afgerond".

Het archieftabblad wordt daarom ingevoegd **direct na "ALV's overzicht"**
(`duplicateSheet.insertSheetIndex`), nooit aan het eind. Bij de implementatie wordt
gecontroleerd welk tabblad op dat moment het laatste is en dat dit onveranderd blijft.

### Rechten

Iedereen die is ingelogd mag resetten — het team is klein en de handeling wordt gelogd. De
knop staat niet prominent en de bevestiging is verplicht.

## Technische aandachtspunten

**Hard gecodeerde kolomnummers.** Deze plekken gaan uit van C/D/E en mogen niet verschuiven:
`ALVO_COLS` (`src/render-alv.js`), `cd_handleAlvoEdit` (kolom 3/4/5, `apps-script/Notifications.gs`),
`verplaatsALV` (kolom 4, `apps-script/Code.gs`). Daarom staat `Klaargezet` op G.

**Rasterbreedte controleren vóór de eerste schrijfactie.** Een write buiten het raster van een
tabblad mislukt geruisloos — die les staat al in dit project (Offerte, kolom P). Eerst
vaststellen dat het tabblad minstens 7 kolommen heeft; zo niet, eerst het raster verbreden.

**`cd_handleAlvoEdit` leest 6 kolommen.** Bij een handmatige plak-actie in kolom G is
`e.value` leeg en wordt teruggevallen op `rowData[col-1]` = `rowData[6]` = `undefined` →
`.toString()` faalt. De trigger vangt dat af in een try/catch, maar het moet netjes: bereik
verbreden naar 7 kolommen en een guard op een ontbrekende waarde. Kolom 7 krijgt géén
pushmelding.

**Apps Script-triggers vuren niet op API-writes.** De schrijfacties van het dashboard lopen
via de Sheets API en zetten `onEdit` niet in werking. De reset kan dus geen kettingreactie
van triggers veroorzaken. Dat is een prettige eigenschap, geen toeval — niet weggooien door
de reset via Apps Script te laten lopen.

**Sheet-mutaties.** De kolom toevoegen, de kop zetten en de selectievakjes instellen gebeurt
via de Chrome-UI, niet via de Sheets-MCP (die is in dit project alleen-lezen).

## Bewust niet

- **Geen pushmelding bij `Klaargezet`.** Het is eigen voorwerk; het team hoeft er niet van te piepen.
- **Geen automatisch aanvinken** van `Klaargezet` als `Uitnodiging` aangaat. Vlaggen blijven onafhankelijk.
- **Geen apart "Klaarzetten"-scherm.** Overwogen en afgewezen: het zou dezelfde gegevens op
  een tweede plek tonen en tien maanden per jaar stilstaan. Kan er later bovenop, de gegevens
  liggen er dan klaar.
- **Geen extra Budgetpakket-filter.** Het blauwe Budget-label volstaat.
- **Analytics-grafiek "ALV Voortgang — Uitnodigingen" blijft ongewijzigd** in deze ronde.
- **Geen taken in Vergaderverzoeken** per uit te schrijven vergadering. Zou honderden taken
  opleveren naast het ALV-overzicht: twee administraties die uit elkaar lopen.

## Testen

Uit te breiden in `src/tests.js` (nu 473 tests):

- `parseAlvo` leest kolom G en levert `klaargezet`.
- Statusafleiding, alle vier de trappen, inclusief de combinatie klaargezet + uitnodiging → *Gepland*.
- `parseAlvo` en `_recomputeAlvoStatus` geven hetzelfde antwoord voor dezelfde invoer.
- `_resetBereik`: aaneengesloten rijen, gaten, één rij, lege lijst.
- Statusfilter op `Klaargezet` levert de juiste rijen.
- Stat-tegel-klik zet het filter en wist het bij een tweede klik.
- Bestaande ALV-tests blijven groen (regressie op de vlaggen en de voortgangsbalk).

Handmatig op staging, met de test-Sheet: kolom G aanvinken en de status zien omslaan, het
filter gebruiken, resetten en controleren dat het archieftabblad klopt, dat de
samenvattingsregels onderaan onaangetast zijn en dat "ALV's Afgerond" nog steeds het
laatste tabblad is.

## Uitrol

Vaste route: bouwen en testen op `staging` (test-Sheet, TESTOMGEVING-balk), daarna naar
`main` → GitHub Pages. `APP_VERSION` naar 7.9, `CACHE_VERSION` naar `cd-v74`.

Volgorde is van belang: eerst kolom G met kop en selectievakjes in de **productie**-Sheet
en de test-Sheet, daarna pas de frontend uitrollen. Andersom leest de frontend een kolom
die er nog niet is — dat levert geen fout op (`klaargezet` wordt overal `false`), maar wel
een verkeerd beeld.
