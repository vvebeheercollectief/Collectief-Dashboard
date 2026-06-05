# Spec — Snelle UX-winst (dichtheid per collega + "voelt direct")

**Datum:** 2026-06-05
**Project:** [[Collectief Dashboard 4.0]] — `index.html`
**Status:** Goedgekeurd ontwerp, klaar voor implementatieplan

## Doel

Het dagelijks gebruik van het dashboard prettiger en sneller laten voelen, zonder
de werking of de huisstijl te veranderen. Twee verbeteringen:

1. **Dichtheid per collega** — iedere gebruiker kiest zelf hoe compact of ruim de
   takenlijsten worden weergegeven; de keuze wordt onthouden in zijn eigen browser.
2. **"Voelt direct"** — bij Afronden, Opslaan en Toevoegen verschijnt het resultaat
   meteen op het scherm; het wegschrijven naar Google Sheets gebeurt op de
   achtergrond, met automatische terugrol bij een fout.

Niet-doelen (bewust buiten scope): zebra-strepen, sneltoetsen, een aparte
zoek/filter-uitbreiding (bestaat al), en uitbreiding van het "voelt direct"-principe
naar Verwijderen of de Ontwikkeling-/ALV-schermen.

---

## Deel 1 — Dichtheid per collega

### Gedrag
- Drie standen: **Compact**, **Standaard** (huidige weergave), **Ruim**.
- Keuze via een klein keuzeknopje in de bovenbalk, naast het thema-knopje (zon/maan).
- De keuze wordt onthouden in `localStorage` — exact hetzelfde mechanisme als de
  bestaande dark-mode-instelling (`localStorage 'theme'`). Omdat elke collega op zijn
  eigen apparaat/browser inlogt, krijgt ieder vanzelf zijn eigen stand. Geen backend
  nodig.
- Standaardwaarde bij een nieuwe gebruiker: **Standaard** (geen gedragsverandering
  voor wie niets instelt).
- Extra polish die iedereen krijgt (geen knop): **zachtere scheidingslijnen** tussen
  rijen — een subtiele lichtere `border-bottom`-kleur.

### Techniek
- Dichtheid wordt aangestuurd via CSS-variabelen op `:root` (of een
  `data-density`-attribuut op `<html>`), die de bestaande tabel-CSS gebruikt:
  - `td{padding:var(--row-py) var(--row-px)}` en `font-size`/`line-height` van de
    rij-cellen koppelen aan variabelen.
  - Waarden:
    - Compact: `--row-py:5px; --row-fs:12.5px; --row-lh:1.3`
    - Standaard: `--row-py:9px; --row-fs:13px; --row-lh:1.4` (huidige waarden)
    - Ruim: `--row-py:14px; --row-fs:14px; --row-lh:1.6`
- Een `applyDensity(d)`-helper, gemodelleerd naar de bestaande `applyTheme(t)`:
  zet het attribuut/variabelen, schrijft naar `localStorage`, werkt de actieve
  knop-status bij.
- Bij het laden van de pagina wordt de opgeslagen dichtheid toegepast, net zoals
  het thema nu al hersteld wordt.
- Werkt voor **alle** tabellen die de gedeelde tabel-CSS gebruiken (Nog Te Doen,
  Afgerond, ALV's, Logboek), zodat het overal consistent is.

### Raakvlakken in de code
- CSS-blok rond `td{padding:9px 13px}` (regel ~153) en de rij-cel-klassen
  (`.cell-txt`, `.cell-name`, `.cell-sm`).
- `applyTheme` (regel ~1233) als sjabloon; sessie-herstel bij DOM-ready (regel ~1199).
- De bovenbalk waar het thema-knopje staat (HTML) — daar komt het dichtheid-knopje bij.

---

## Deel 2 — "Voelt direct" (optimistische updates)

### Probleem nu
Bij Afronden (`doCompleteTask`), Opslaan (`saveTask`-pad) en Toevoegen wordt na het
wegschrijven `await loadAll()` aangeroepen: een volledige her-ophaal van 6 sheets
vóórdat het scherm bijwerkt. Die wachttijd (~1–2 sec) is wat "traag voelt".

### Gewenst gedrag
- **Direct tonen:** zodra de gebruiker bevestigt, wordt de lokale data (`D`) meteen
  aangepast en het scherm opnieuw getekend (`renderAll()`); de modal sluit direct.
- **Achtergrond-opslag:** dezelfde Sheets-schrijfacties als nu, maar zónder dat de
  gebruiker erop wacht.
- **Terugrol bij fout:** mislukt het wegschrijven (geen internet, sessie verlopen,
  API-fout), dan wordt de lokale wijziging teruggedraaid, het scherm opnieuw getekend,
  en verschijnt een duidelijke foutmelding-toast. Er gaat niets verloren.
- **Bevestiging:** bij succes blijft de bestaande **"Ongedaan"-toast** (Afronden)
  staan; voor Opslaan/Toevoegen een korte, neutrale bevestigingstoast.

### Aanpak: één gedeeld patroon

Een kleine helper-laag die voor alle drie de acties geldt:

1. **`pendingWrites`-teller** (getal, start 0). Zolang `> 0`:
   - slaat de 8-seconden-poll deze ronde over (uitbreiding van de bestaande
     poll-guards op regel ~1182, naast de bestaande `dot.loading`-check);
   - dit voorkomt dat een poll met nog-niet-weggeschreven data de optimistische
     wijziging kort terugdraait.
2. **Optimistische mutatie** op `D` (lokaal), dan `renderAll()`, modal dicht, toast.
3. **Achtergrond-schrijfactie** (`pendingWrites++` ervoor, `--` erna):
   - **Succes:** wanneer de teller op 0 komt, één **stille** `loadAll(true)` om de
     rij-indexen (`_row`) en de smart-diff-hash weer te synchroniseren met de Sheet.
     De gebruiker wacht hier niet op.
   - **Fout:** terugrol van de lokale mutatie + `renderAll()` + foutmelding-toast;
     bij 401 de bestaande sessie-herstel-route volgen.

> **Waarom de stille `loadAll` na succes?** De Sheets-bewerkingen verschuiven
> rij-nummers (insert/delete van rijen). De `_row`-waarden in `D` moeten daarna
> kloppen voor een volgende actie. Door dit ná de schrijfactie stil te doen, blijft
> het scherm direct reagerend en blijft de data consistent.

### Per actie

**Afronden — `doCompleteTask` (regel ~2553)**
- Nu: batchUpdate (rij in "Afgerond" invoegen + rij in "Nog Te Doen" verwijderen) →
  `await loadAll()` → `showUndoToast`.
- Nieuw: verwijder de taak meteen uit `D.ntd[sec]` → `renderAll()` →
  `closeCompleteModal()` → `showUndoToast` (bestaat al, met de bestaande
  `undoComplete`-data) → batchUpdate op de achtergrond → bij fout: taak terug in
  `D.ntd[sec]` + `renderAll()` + foutmelding.
- De bestaande `undoComplete`/`undoData`-logica blijft ongewijzigd werken.

**Opslaan — bewerken/aanmaken-pad (writeRange/insertAndWriteRow, regel ~2643/2652)**
- Bewerken: werk de bestaande rij in `D.ntd[sec]` meteen bij met de nieuwe waarden →
  `renderAll()` → modal dicht → `writeRange` op de achtergrond.
- Aanmaken: voeg de nieuwe rij meteen toe aan `D.ntd[sec]` (met een tijdelijke
  markering omdat `_row` nog onbekend is) → `renderAll()` → modal dicht →
  `insertAndWriteRow` op de achtergrond; de stille `loadAll` na succes vult de echte
  `_row` in.
- Bij fout: terugrol (oude waarden terug bij bewerken; nieuwe rij weghalen bij
  aanmaken) + foutmelding.

### Belangrijke aandachtspunten
- **Eén schrijfactie tegelijk afhandelen** (serialiseren) zodat rij-indexen geldig
  blijven tussen optimistische render en achtergrond-write. De `pendingWrites`-guard
  + stille resync dekken dit; bij snel achter elkaar klikken worden acties netjes na
  elkaar verwerkt.
- **Logboek & notificaties** (`logEvent`, `fireNotifEvent`) blijven op dezelfde
  plekken in de schrijf-stap staan — niet optimistisch, want ze hoeven het scherm
  niet te blokkeren.
- **Auto-prioriteit** (`berekenPrioriteit`) wordt al live in de frontend berekend bij
  het tekenen, dus de optimistische render toont meteen de juiste prioriteit/sortering.
- Geen wijzigingen aan de Apps Script of de Sheets-structuur nodig.

---

## Testplan (handmatig, in de browser)
1. **Dichtheid:** wissel Compact/Standaard/Ruim → lijst past meteen aan; herlaad de
   pagina → keuze blijft bewaard; open in een tweede browser/profiel → onafhankelijke
   keuze. Controleer alle vier de tabbladen van "Nog Te Doen" plus Afgerond/Logboek.
2. **Afronden:** taak afronden → verdwijnt direct, "Ongedaan"-toast verschijnt; klik
   Ongedaan → taak komt terug; controleer in de Sheet dat de rij correct verplaatst is.
3. **Opslaan:** bestaande taak bewerken → wijziging meteen zichtbaar; controleer Sheet.
4. **Toevoegen:** nieuwe taak → verschijnt meteen op de juiste plek/sortering;
   controleer dat na de stille resync de bewerk/afrond-knoppen op die nieuwe rij werken.
5. **Foutpad:** zet internet uit, doe een actie → wijziging wordt teruggedraaid met
   foutmelding; geen verlies, geen dubbele rij.
6. **Race:** twee acties snel achter elkaar → beide landen correct, geen flikkering of
   teruggedraaide rij door een tussentijdse poll.

## Risico's
- **Rij-index-verschuiving** bij snel opeenvolgende acties — afgedekt door serialiseren
  + stille resync; expliciet testen (stap 6).
- **Optimistische render wijkt kort af van de waarheid** bij een trage/mislukte write —
  afgedekt door terugrol; de gebruiker ziet altijd een toast bij falen.
- Beperkt blast-radius: alleen `index.html`, geen backend-wijzigingen.
