# Offerte-trajecten: "Nu dit"-kaart + aannemer-toevoegen-fix — ontwerp

Datum: 2026-06-15
Status: goedgekeurd door gebruiker (concept akkoord), klaar voor implementatieplan
Branch: `staging`
Bouwt voort op: [`2026-06-15-offerte-aannemers-lijst-design.md`](2026-06-15-offerte-aannemers-lijst-design.md)

## Aanleiding

Twee punten van de gebruiker op de offerte-tab (live op staging):

1. **Bug — een aannemer toevoegen lijkt niets te doen.** Je typt een naam, drukt Enter,
   "het veld blijft leeg". De aannemer wórdt opgeslagen, maar de regel verdwijnt uit beeld.
2. **Niet duidelijk wat als éérste moet.** De secties Doorsturen/Nabellen zijn er wel, maar
   er is geen ondubbelzinnige "doe dít nu". De gebruiker wil dat het systeem de eerstvolgende
   taak aanwijst — "zo soepel moet het lopen".

### Root cause van de bug (gereproduceerd, runtime-bewijs)

De aannemerslijst stuurt de "X/N binnen"-teller (afgeleid in `_verrijkOfferteRij`, zie
het vorige ontwerp §2.3). Gevolg bij toevoegen van één aannemer aan een regel die op `1/3`
stond:

| | offertes | fase | bal bij | sectie |
|---|---|---|---|---|
| vóór | `1/3` | ontvangen | ons | **Doorsturen** |
| ná +1 aannemer | `0/1` | aangevraagd | aannemer | **Nabellen** |

In het Vandaag-focuspaneel (`renderOfferteBriefing`) worden `nu`-rijen gesplitst in
Doorsturen/Nabellen, op urgentie gesorteerd en **afgekapt** (`DCAP=3`, `NCAP=5`). Door de
herberekening verspringt de bewerkte regel van sectie én zakt vaak onder de "Toon X meer"-vouw.
De regel (met open paneel) verdwijnt dus uit beeld → het lijkt of er niets is toegevoegd.
Er is **geen** opslag- of bedradingsfout; het is een verstorend neveneffect van her-sectioneren
midden in het bewerken.

Tweede, kleinere oorzaak: er is geen zichtbare "toevoegen"-knop. De `+` is een decoratieve
`span`; alleen Enter voegt toe (niet ontdekbaar).

## Doel

- **Bug weg:** een aannemer toevoegen/afvinken/verwijderen laat de regel **op z'n plek staan
  en zichtbaar** zolang het paneel open is. Geen wegspringen, geen verdwijnen.
- **Duidelijke toevoeg-actie:** een echte **"Toevoegen"-knop** naast het veld (Enter blijft werken).
- **"Nu dit"-kaart:** bovenaan de offerte-tab één opvallende kaart met dé eerstvolgende taak,
  met reden en directe actieknop, plus een "Daarna: …"-vooruitblik. De vertrouwde
  Doorsturen/Nabellen-secties blijven eronder staan (keuze gebruiker).

## Niet-doelen (YAGNI)

- De teller-logica blíjft "lijst stuurt X/N" (bevestigde keuze gebruiker) — geen ontkoppeling.
- Geen wijziging aan de opvolg-motor (`offerteNuOpvolgen`, termijnen) zelf.
- Geen nieuw tabblad, geen herontwerp van de navigatiebalk.
- Geen wijziging aan kolom D in de Sheet (override blijft in het geheugen).

## Onderdeel 1 — Aannemer-toevoegen-fix

### 1.1 Bewerkte regel blijft staan (kern van de bugfix)

In `renderOfferteBriefing`: een traject waarvan het aannemer-paneel open is
(`state.offerteAannOpen.has(r.code)`) wordt **gepind** en is **nooit** onderhevig aan de
sectie-cap.

Aanpak (vastgelegd, te verfijnen in het plan):
- Bepaal `nu` zoals nu (gesorteerd op urgentie).
- `const bewerken = nu.filter(r => state.offerteAannOpen.has(r.code))` → render deze **eerst**,
  als gepinde focusrij(en) met open paneel, bovenaan het paneel (onder de "Nu dit"-kaart en
  cijferstrip). Zo verspringt de regel niet tussen secties en valt 'ie niet onder een vouw weg.
- De Doorsturen/Nabellen-secties renderen `nu` **zonder** de `bewerken`-rijen (geen dubbeling).
- Zodra het paneel sluit (`offerte-aann-open` toggelt dicht), zakt de regel vanzelf terug naar
  z'n juiste sectie.

Effect voor de gebruiker: de regel die je bewerkt "zweeft" rustig bovenaan en blijft staan
terwijl je namen toevoegt en afvinkt; de "X/N" loopt live mee (bv. `0/1` → `0/3` → `1/3`).

In de **volledige tabel** speelt het verspringen tussen secties niet (geen Doorsturen/Nabellen-
splitsing); daar blijft het bestaande gedrag. Wel: open panelen in de tabel blijven open (al zo).

### 1.2 "Toevoegen"-knop

In `offerteAannemerPaneel` wordt de toevoeg-regel: tekstveld + een echte knop
**"+ Toevoegen"** (`data-action="offerte-aann-add" data-code`). De klik leest het naastgelegen
veld, voegt toe en leegt het. De bestaande Enter-keydown blijft als sneltoets. De decoratieve
`+`-span vervalt (de knop neemt die rol over).

Nieuwe actie in `actions.js`: `'offerte-aann-add'` → leest het inputveld in hetzelfde paneel
(via `el.closest('.of-aann-add').querySelector('.of-aann-input')`), roept `addAannemer(code, val)`
aan, leegt het veld. (Enter-pad blijft ongewijzigd.)

## Onderdeel 2 — "Nu dit"-kaart

### 2.1 Keuze van de taak

`nu` is al op urgentie gesorteerd (`offerteSorteerScore`, aflopend). De kaart toont `nu[0]`.
Volgorde-logica (bevestigd met de gebruiker, = grotendeels de huidige score):

1. **Verlopen deadline** trumpt alles (springt bovenaan) — bestaand (`deadlineTeLaat ? 1e6`).
2. **Langst stil** is de dagelijkse hoofdregel — bestaand (`dagen * 100`).
3. **Tiebreak:** bij gelijke score eerst "bal bij ons" (snel af te ronden / quick win) —
   kleine extra term toevoegen aan `offerteSorteerScore` (`balBij==='ons'` → +klein bedrag).

### 2.2 Inhoud van de kaart

- Label "Begin hier" / accent-rand (geen badge-pill boven heading — zie voorkeur "geen badges").
- Reden-chip: "Langst stil" of "Deadline verlopen" (rood) naar gelang de trump.
- Code (gedempt) + VvE-naam (groot).
- Contextregel: `N dagen geen reactie · bal bij <wie> · <eerste regel omschrijving>`.
- Eén actieknop: **Doorsturen** of **Nabellen**, afhankelijk van `_offStatus.actie`
  (hergebruik van de bestaande `offerte-doorsturen` / `offerte-nabellen` acties + `rid`).
- Voetregel: "Daarna: `<nu[1].naam>` — `<reden>`" + "`X` van `Y` klaar vandaag"
  (`X` = afgerond vandaag, `Y` = `nu.length`).
- Leeg-staat: is `nu` leeg, dan géén kaart maar een rustige "Niets dringends vandaag"-melding.

De `bewerken`-gepinde rij(en) (§1.1) renderen ná de kaart en cijferstrip, vóór de secties.
Staat de `nu[0]`-taak zelf in bewerking, dan blijft de kaart 'm tonen (kaart = spotlight, geen
losse rij-actie nodig).

### 2.3 Verhouding kaart ↔ secties

- Cijferstrip blijft (`Te doen` / `Klaar te versturen` / `Vastgelopen`) — ongewijzigde totalen.
- Doorsturen/Nabellen-secties blijven, met hun bestaande caps en "Toon meer".
- De `nu[0]`-rij wordt **niet** nogmaals in z'n sectie als losse regel herhaald; de sectie-kop
  houdt het wáre totaal en vermeldt zo nodig "1 staat bovenaan". (Detail voor het plan.)

## Randgevallen

- **`nu` leeg** → rustige leeg-staat, geen kaart, secties tonen "Niets …".
- **Meerdere open panelen** → alle gepind bovenaan; geen dubbeling met de secties.
- **`nu[0]` == bewerkte regel** → kaart toont 'm; geen aparte gepinde dubbel.
- **Tabel-weergave** → open paneel blijft open; geen sectie-sprong (geen splitsing daar).
- **Resync/8s-poll** → `loadAll` maakt nieuwe rij-objecten; `offerteAannOpen` (codes) overleeft,
  dus open panelen blijven open na refresh (bestaand gedrag).

## Tests (`src/tests.js`, in-browser via `?test=1`)

- **Regressie (bug):** rij in `D.ntd['OFFERTE-TRAJECTEN']` met open paneel
  (`offerteAannOpen.has(code)`) komt ná render in het briefing-paneel voor, óók als de rij door
  de teller-herberekening van sectie zou wisselen en buiten de cap zou vallen.
- **`offerte-aann-add`-actie bestaat** en voegt via het veld een aannemer toe (markup bevat de
  knop met `data-action="offerte-aann-add"`).
- **"Nu dit"-kaart:** bij niet-lege `nu` bevat het paneel de hero-kaart met de naam van `nu[0]`
  en de juiste actieknop (Doorsturen/Nabellen); bij lege `nu` de leeg-staat.
- **Sorteer-tiebreak:** twee rijen met gelijke dagen — die met `balBij==='ons'` scoort hoger.
- Bestaande aannemers-/motor-tests blijven groen (geen motor-wijziging).

## Raakvlakken / risico

- `render-lijsten.js`: `renderOfferteBriefing` (pin-logica + hero-kaart), `offerteAannemerPaneel`
  ("Toevoegen"-knop). Hoofdmoot van het werk.
- `util.js`: kleine tiebreak in `offerteSorteerScore` (+ test).
- `actions.js`: nieuwe actie `offerte-aann-add` (Enter-pad blijft).
- `state.js`: geen nieuwe state nodig (`offerteAannOpen` bestaat al).
- `styles.css`: stijl voor de "Nu dit"-kaart + gepinde-bewerken-zone (in lijn met C2/Vandaag,
  geen dot-grid, kleurvlakken/accent-rand; geen badge-pills).
- `sw.js`: `CACHE_VERSION` → `cd-v17`.
- Motor (`offerteNuOpvolgen`, termijnen) en `offerte-acties.js`: **ongewijzigd**.

## Aanpak van werken

- Op `staging` bouwen, TDD, in-browser tests via `?test=1` groen.
- Eerst lokaal verifiëren met de preview-server (statisch) + bestaande testsuite.
- Pas na akkoord van de gebruiker cherry-picken richting `main` (niet kaal mergen — zie
  staging→main-les).
