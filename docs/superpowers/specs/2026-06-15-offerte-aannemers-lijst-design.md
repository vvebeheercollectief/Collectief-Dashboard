# Offerte-aannemers per traject + bewerken vanuit "Vandaag" — ontwerp

Datum: 2026-06-15
Status: goedgekeurd door gebruiker, klaar voor implementatieplan
Branch: `staging`

## Aanleiding

Twee punten van de gebruiker na het zien van het Vandaag-focuspaneel op echte data:

1. **Bewerken kan niet vanuit "Vandaag".** De korte regels in het Vandaag-paneel
   (`offerteFocusRij`) hebben alleen *later* + *Doorsturen/Nabellen*. De bewerk-knop
   (potlood → bestaande taak-bewerk-popup) die wél in de volledige tabel staat, ontbreekt
   hier.
2. **Nergens staat bij wélke partijen een offerte is aangevraagd.** De data kent wel
   "X/N binnen" (aantal offertes binnen van aangevraagd), maar niet de namen. Iedereen
   tikt dat nu los in de omschrijving ("aangevraagd bij: Heijstek en Klus"). Gewenst:
   een echte invul-lijst per traject — "zo simpel als een regel toevoegen en de naam
   van de aannemer typen".

Keuzes van de gebruiker (brainstorm): **namen + 'offerte binnen'-status per aannemer**,
en **uitklapbaar direct op de regel** (niet in een apart popup).

## Doel

- Vanuit het Vandaag-paneel een traject kunnen bewerken (zelfde popup als de tabel).
- Per offerte-traject een uitklapbaar lijstje aannemers beheren: naam toevoegen,
  per aannemer aanvinken of de offerte binnen is, en verwijderen.
- De bestaande "X/N binnen"-teller automatisch laten meelopen met dat lijstje, zónder
  iets aan de opvolg-motor te veranderen en zónder bestaande trajecten te raken.

## Niet-doelen (YAGNI)

- Geen apart "Aannemers"-tabblad of per-aannemer-detailpagina.
- Geen contactgegevens/telefoon/e-mail per aannemer — alleen de naam + binnen-vlag.
- Geen migratie van bestaande omschrijvingen; oude trajecten blijven ongemoeid.
- Geen koppeling naar het Logboek of de stil-teller (een aannemer toevoegen telt
  bewust níet als "activiteit").

## Onderdeel 1 — Bewerken vanuit "Vandaag"

`offerteFocusRij(r, soort)` krijgt in het actie-blok een potlood-icoon vóór *later*,
identiek aan de tabel: `data-action="taak-bewerken" data-rid="${rid}"`. De bestaande
actie `'taak-bewerken'` → `openModal(true, state._rowCache[rid])` werkt ongewijzigd.
De rij pusht z'n object al naar `state._rowCache` (zoals nu voor de actieknoppen).

Geen nieuwe modal, geen nieuwe state. Puur de ontbrekende knop toevoegen.

## Onderdeel 2 — Aannemerslijst per traject

### 2.1 Opslag

Eén nieuwe kolom in de tab **'Nog Te Doen'**, kolom **P** (`row[15]`), genaamd
`Aannemers`. Kolommen A–O zijn in gebruik (O = offerte-fase); P is vrij.

Inhoud per cel: één aannemer per regel, naam en binnen-vlag gescheiden door `|`:

```
Zegwaard en Motec|1
Klusbouw Meesters|0
Alvin Lin Bouw|0
```

- `|1` = offerte binnen, `|0` (of ontbrekend) = nog niet.
- Lege cel = geen aannemers.
- Bij het typen worden `|` en regeleindes uit de naam gestript (kan niet botsen
  met de scheidingstekens).

### 2.2 Pure helpers (in `util.js`, getest)

- `parseAannemers(cel)` → `[{naam, binnen}]`. Splitst op regels; per regel op de
  láátste `|`; trailing `1` → `binnen:true`, anders `false`; geen `|` → hele regel is
  de naam, `binnen:false`. Lege/whitespace-regels worden overgeslagen.
- `serializeAannemers(lijst)` → string `naam|0|1`-regels, één per aannemer.
- `deriveOffertes(lijst)` → `"X/N"` met `N = lijst.length`, `X = #binnen`. Lege lijst → `''`.

### 2.3 Afgeleide "X/N binnen" (motor blijft ongemoeid)

Bij het verrijken van een offerte-rij (in `_verrijkOfferteRij`, dat al per render vóór
de motor-aanroepen draait):

```
if (r._offertesManual === undefined) r._offertesManual = r.offertes; // eenmalig de echte D-waarde vastleggen
r._aannemers = parseAannemers(r.aannemers);                          // r.aannemers = kolom P
r.offertes = r._aannemers.length ? deriveOffertes(r._aannemers)      // lijst stuurt de teller
                                 : r._offertesManual;                // anders de handmatige D-waarde
```

`r._offertesManual` legt éénmalig (guard op `undefined`) de oorspronkelijke kolom-D-waarde
vast, vóór enige override. Daardoor is de verrijking idempotent per render én herstelt de
teller zich naar de handmatige waarde zodra de lijst leeg raakt — geen achterblijvende
afgeleide waarde. Na een volledige herlaad (`loadAll` maakt nieuwe entries) wordt
`_offertesManual` opnieuw uit de verse D-cel afgeleid.

Gevolg: zodra een traject aannemers heeft, leest álles (de "X/N binnen"-tekst,
`offProg`, en de hele motor: `offerteFase`/`offerteBalBij`/`offerteNuOpvolgen`) het
berekende getal. Heeft een traject géén aannemers, dan blijft de handmatige waarde
uit kolom D staan — bestaande trajecten veranderen dus niet.

Belangrijk: kolom D (handmatige `offertes`) wordt **nooit** overschreven. De override
zit alleen in het geheugen. Bron van waarheid voor "wie + binnen" is kolom P; verwijdert
de gebruiker alle aannemers weer, dan herleeft de oude D-waarde vanzelf.

`parseSections` in `data.js` leest de nieuwe kolom: `entry.aannemers = _f4v(row[15])`.

### 2.4 UI — uitklappen op de regel

Een gedeelde render-helper `offerteAannemerPaneel(r)` wordt gebruikt op **twee** plekken,
zodat élk traject bereikbaar is:

- in `offerteFocusRij` (Vandaag-paneel), en
- in de offerte-rij van de **volledige tabel** (trajecten die vandaag niet hoeven).

Ingeklapt toont de regel een klikbare samenvatting: chevron + "Aannemers · X van N binnen"
(of "Aannemers toevoegen" als de lijst leeg is), met `data-action="offerte-aann-open"
data-code="${code}"`.

Uitgeklapt (paneel eronder):
- per aannemer een regel: **naam** · **binnen-knop** (teal "✓ binnen" / grijs "nog niet",
  `data-action="offerte-aann-binnen" data-code data-idx`) · **×** (`offerte-aann-verwijder`).
- onderaan een invoerregel: plus-icoon + tekstveld "Aannemer toevoegen…"
  (`data-action="offerte-aann-add"` op een veld met `data-code`); **Enter** voegt toe
  en leegt het veld.

Open/dicht-status leeft in `state.offerteAannOpen` (een `Set` van codes) zodat het paneel
een re-render overleeft. Styling met bestaande thema-tokens (var(--sur)/(--bor)/(--ac)/
(--rd)/(--am)/(--mut)), dark-mode-proof, in lijn met de C2/Vandaag-stijl.

### 2.5 Acties & schrijven (`src/offerte-aannemers.js`, nieuw)

Alle muterende acties volgen het bestaande optimistisch-met-rollback patroon van
`offerte-acties.js` (`backgroundWrite(doFn, rollbackFn, label)`):

- **toevoegen** `addAannemer(code, naam)`: naam saniteren; bestaat 'ie al (case-insensitief)
  dan niets doen; anders `{naam, binnen:false}` toevoegen.
- **binnen togglen** `toggleAannemerBinnen(code, idx)`: vlag omklappen.
- **verwijderen** `verwijderAannemer(code, idx)`: regel eruit.

Elke actie muteert de **rauwe** kolom-P-string `r.aannemers` (één bron); de
verrijking (§2.3) leidt bij de volgende render `r._aannemers` én `r.offertes` daaruit af.
Zo is er geen tweede afleid-pad en blijft de teller consistent.

1. zoek de rij op `code` in `D.ntd['OFFERTE-TRAJECTEN']`; bewaar `vorige = r.aannemers`;
2. bouw de nieuwe lijst, en zet optimistisch `r.aannemers = serializeAannemers(nieuweLijst)`;
3. `renderNtd()` — de verrijking herparset en herberekent de teller vanzelf;
4. `backgroundWrite`: `writeRange('Nog Te Doen'!P${r._row}', [r.aannemers])`,
   met rollback `r.aannemers = vorige`.

Zonder `r._row` (zeldzaam) geen schrijfactie; de uitklap wordt dan niet getoond.

## Randgevallen

- **Expliciete fase** (`bij_vve`/`gegund`) wint in `offerteFase` boven X/N — ongewijzigd;
  de afgeleide X/N stoort dat niet.
- **Dubbele naam**: case-insensitief genegeerd bij toevoegen.
- **Naam met `|` of regeleinde**: gestript bij invoer.
- **Alle aannemers verwijderd**: lijst leeg → kolom P leeg; `offProg`/motor vallen terug
  op de (ongewijzigde) handmatige kolom D.
- **Resync/herladen**: kolom P wordt opnieuw geparset; de geheugen-override is idempotent.

## Tests (`src/tests.js`, in-browser via `?test=1`)

- `parseAannemers`: leeg → `[]`; één regel zonder `|` → `binnen:false`; `naam|1` → `binnen:true`;
  naam met spaties behouden; lege regels overgeslagen.
- `serializeAannemers` ↔ `parseAannemers` round-trip.
- `deriveOffertes`: `[]` → `''`; 1 van 3 binnen → `'1/3'`.
- Motor-integratie: rij met `aannemers` van 0/2 binnen ⇒ na verrijking `offertes==='0/2'`
  en `offerteBalBij==='aannemer'`; rij met 2/2 ⇒ `offerteBalBij==='ons'`.
- Markup: Vandaag-paneel met een aannemer-rij bevat de uitklap-haak
  (`offerte-aann-open`) en, uitgeklapt, `offerte-aann-add`.

## Raakvlakken / risico

- `data.js` (`parseSections`): één regel erbij voor kolom P.
- `util.js`: drie pure helpers + export + tests.
- `render-lijsten.js`: potlood in `offerteFocusRij`; `offerteAannemerPaneel` in focusrij
  én tabel; aanroep van verrijking ongewijzigd.
- `state.js`: `offerteAannOpen` (Set).
- `actions.js`: vier `data-action`-handlers + Enter-keydown voor het invoerveld.
- `offerte-aannemers.js`: nieuw, de drie muterende acties.
- `index.html`: niets (geen nieuwe vaste DOM).
- `sw.js`: `CACHE_VERSION` → `cd-v16`.
- Motor (`offerteNuOpvolgen` e.d.) en `offerte-acties.js`: **ongewijzigd**.

## Sheet-voorbereiding

Kolom P 'Nog Te Doen' moet bestaan met kop `Aannemers`. Te doen vóór deploy naar
productie (op staging/test eerst verifiëren dat schrijven naar P werkt). Apps Script
schrijft niet naar P; alleen de frontend.
