# verplaatsALV: doeltabblad op naam in plaats van "het laatste tabblad"

**Datum:** 2026-07-22
**Status:** ontwerp goedgekeurd
**Raakt:** `apps-script/Code.gs` (kern), `apps-script/Notifications.gs` (constante),
`src/alv-reset.js` en `src/tests.js` (alleen commentaar/omschrijving)

## Probleem

De onEdit-trigger `verplaatsALV` (`apps-script/Code.gs`, rond regel 107) schrijft een
afgeronde ALV naar `allSheets[allSheets.length - 1]` — het **laatste** tabblad van de
spreadsheet, wat toevallig lange tijd "ALV's afgerond" was. In de PROD-spreadsheet is het
laatste tabblad inmiddels "Logboek backup 2026-07-15-1259" (index 10); "ALV's afgerond"
staat op index 6. Zet iemand handmatig in de Sheet-UI het Notulen-vinkje (kolom D) aan,
dan belandt de rij dus in het backup-tabblad.

Gecontroleerd op 2026-07-22: er staan nog géén zwerfrijen in het backup-tabblad. Het is
een latente val, geen actieve datacorruptie. API-writes vanuit het dashboard vuren geen
onEdit; alleen handmatige Sheet-edits raken dit pad.

Tweede gat, tijdens de verkenning gevonden: de sheet-guard is een *blocklist*
("alles behalve *Nog Te Doen* en *Afgerond*"). De trigger vuurt daardoor ook op
kolom-D-vinkjes in álle andere tabbladen — inclusief de reset-archieven (duplicaten van
het overzicht, mét checkboxes in kolom D) en backup-tabbladen.

## Besluiten (met gebruiker afgestemd)

1. **Repareren, niet uitschakelen.** De trigger is niet dormant: hij is de enige
   automatische vuller van "ALV's afgerond". Het dashboard flipt alleen booleans in
   "ALV's overzicht" (`toggleAlvoFlag`); de status "Afgerond" is daarvan afgeleid.
   `parseAlfa` (`src/data.js`) leest exact drie kolommen (code, naam, datum) — precies de
   rijvorm die `verplaatsALV` schrijft. De rijvorm is dus compatibel; alleen het
   doeltabblad is fout.
2. **Ontbreekt "ALV's afgerond": loggen, niets schrijven, niets aanmaken.** Het vinkje
   blijft staan, er verdwijnt geen rij. Automatisch aanmaken (zoals zusterfunctie
   `verplaatsAfgerond` doet voor "Afgerond") is bewust afgewezen: bij een hernoemd
   tabblad zou dat een tweede, concurrerende lijst opleveren.

## Ontwerp

### 1. Doeltabblad op naam

- Nieuwe constante `ALFA_SHEET = "ALV's afgerond"` in `apps-script/Notifications.gs`,
  direct naast de bestaande `ALVO_SHEET`. Alle `.gs`-bestanden delen één globale scope;
  constanten declareren we maar op één plek (zie `apps-script/README.md`).
- Lookup hoofdletterongevoelig én met trim over `e.source.getSheets()`, in de stijl van
  `_isAlvoTab` in `src/alv-reset.js`. Zo breekt een hoofdletterverschil
  ("ALV's Afgerond") de trigger niet. Let op de apostrof: exact dezelfde rechte apostrof
  als in `src/data.js` (`lees("ALV's afgerond")`) — dat is de canonieke naam.

### 2. Guard: van blocklist naar allowlist

`if (sheetName === "Nog Te Doen" || sheetName === "Afgerond") return;` vervalt.
Daarvoor in de plaats: alléén doorgaan als het bewerkte tabblad "ALV's overzicht" is
(vergelijking via `ALVO_SHEET`, hoofdletterongevoelig + trim). Daarmee is het
archief-/backuptabblad-gat in één beweging dicht.

### 3. Foutgedrag bij ontbrekend doeltabblad

Wordt `ALFA_SHEET` niet gevonden:

- `Logger.log` met functienaam en tabbladnaam (technische uitvoeringslog);
- één regel in de Logboek-sheet via bestaand `cd_schrijfLogboek(...)`:
  sectie `ALVS` (zelfde sectiecode als het dashboard voor ALV-gebeurtenissen gebruikt),
  VvE-code van de bewerkte rij, en als melding dat het tabblad "ALV's afgerond" niet is
  gevonden en de ALV niet is gearchiveerd;
- daarna `return` — géén schrijfactie, geen tabblad aanmaken.

### 4. Wat ongewijzigd blijft

- Rijvorm `[vveCode, vveNaam, datumAfgerond]` en de kop-regel-aanmaak bij een leeg
  doeltabblad (`lastRow === 0`).
- De kolom-4-check, de `row <= 1`-check en de lege-rij-check.
- `cd_lockedRun`-omhulling.
- De bronrij wordt (net als nu) níet verwijderd of uitgevinkt.

### 5. Commentaar-hygiëne frontend

Na de fix klopt de motivering "anders slokt verplaatsALV het archief op" niet meer:

- `src/alv-reset.js` (rond regel 106): commentaar bijwerken. Het archief blijft wél
  direct na "ALV's overzicht" ingevoegd worden — prettiger navigeren en dubbele
  zekerheid — maar de tekst mag niet langer een bug als reden aanvoeren.
- `src/tests.js` (rond regel 1034): testomschrijving idem. De test zelf blijft
  inhoudelijk gelijk (archief direct na het overzicht).

Geen gedragswijziging in de frontend; geen versiebump (backend-fix, geen release).

## Testen en uitrol

1. Werken op een aparte tak vanaf `main` (deze worktree-tak). **Niet** via `staging` —
   die is divergent met geparkeerd spraakmemo-werk.
2. TEST-deploy zonder staging aan te raken: de workflow
   `.github/workflows/apps-script-deploy.yml` heeft `workflow_dispatch`; handmatig
   starten op de feature-tak kiest het TEST-script (alleen `ref_name == main` gaat naar
   PROD).
3. Handmatige scenario's in de TEST-spreadsheet:
   - Notulen-vinkje (kolom D) in "ALV's overzicht" → rij `[code, naam, datum]` verschijnt
     onderaan "ALV's afgerond", ongeacht de tabbladvolgorde;
   - vinkje in kolom D van een archief-/backup-tabblad → er gebeurt niets;
   - "ALV's afgerond" tijdelijk hernoemen, dan vinkje zetten → waarschuwingsregel in
     Logboek, vinkje blijft staan, nergens een rij bijgeschreven; daarna terug hernoemen;
   - vinkje in kolom D op rij 1 of in een lege rij → er gebeurt niets.
4. Frontendtests draaien via `?test=1` (commentaarwijzigingen mogen niets breken).
5. Merge naar `main` → GitHub Action deployt automatisch naar PROD.

## Buiten scope

- De trigger verwijderen of de installable trigger in de Apps Script-UI aanpassen.
- Dedupe bij her-aanvinken (bestaand gedrag: elke tick voegt een rij toe).
- Het dashboard rijen naar "ALV's afgerond" laten schrijven bij het aanvinken van
  Notulen (API-pad); dat blijft zoals het is.
