# Undo bij verwijderen + VvE-zoekveld in AI-hulp + zichtbare overgangen · Ontwerp

**Datum:** 2026-06-10 · **Status:** goedgekeurd door gebruiker (richting, effect-variant B, puls-sterkte 2)
**Aanleiding:** gebruikersacceptatie van Fase 2 mijlpaal B; drie verbeterwensen uit dat gesprek.

## Wat verandert

1. **Ongedaan maken bij verwijderen.** De `confirm()`-pop-up bij het verwijderen van een taak verdwijnt. Verwijderen wordt optimistisch (zoals afronden al is): de rij verdwijnt direct uit de lijst, de Sheet-wijziging loopt op de achtergrond, en er verschijnt 8 seconden een undo-toast "🗑️ Taak verwijderd — ↩ Ongedaan maken". Undo zet de taak terug in dezelfde sectie en logt "Teruggezet". Hetzelfde geldt voor Ontwikkeling-items.
2. **VvE-zoekveld in de AI-hulp.** De `<select id="ai-vve">` wordt een typebaar zoekveld met suggestielijst, zoals het VvE-veld in de taakmodal: zoeken op code én naam. Extra: klik/focus op het lege veld toont de volledige (scrollbare) lijst, en een wis-knopje (×) maakt de koppeling leeg.
3. **Zichtbare overgangen (effect B, sterkte 2).** Rijen verdwijnen of wijzigen niet meer abrupt:
   - **Afronden:** rij pulst groen (~0,75 s), vervaagt, dán re-render.
   - **Verwijderen:** idem, maar rood.
   - **Bewerken (opslaan):** rij blijft staan en flitst kort (teal-puls ~1,2 s) na de re-render.
   - **Toevoegen:** nieuwe rij flitst kort groen na de re-render.
   - **Teruggezet (undo):** teruggekeerde rij flitst kort amber (best effort, na `loadAll`).
   - `prefers-reduced-motion: reduce` schakelt alle pulsen/fades uit (geen wachttijd).

## Technisch ontwerp

### 1. Undo bij verwijderen

**`deleteTaskRow(r)` (crud.js) wordt gespiegeld aan `doCompleteTask`:**
- `confirm()` en `alert`-afhandeling van het happy path vervallen.
- Vóór de mutatie `undoData` vastleggen: `{sec, code, ntdValues}` met `ntdValues = SECS[sec].keys.map(k=>r[k]||'')` + `r.subcategorie` (zelfde serialisatie als bij afronden).
- Optimistisch: rij uit `D.ntd[sec]`, `_shiftNtdRows(r._row,-1)`, undo-toast direct, rij-animatie en pas daarná `renderAll()` — exacte volgorde in §3 (verdwijn-flow).
- Toast: `showUndoToast('🗑️ Taak verwijderd', `${code} — ${omschrijving}`, () => undoDelete(undoData))`.
- Sheets-delete (bestaande `deleteDimension`-batchUpdate) verhuist naar `backgroundWrite(writeFn, rollback, 'Verwijderen mislukt')`; rollback zet de rij lokaal terug (zelfde patroon als de rollback in `doCompleteTask`). `logEvent('Verwijderd', …)` blijft, binnen de write.

**Nieuw `undoDelete(undoData)` (notifications.js, naast `undoComplete`):**
- Wacht eerst tot de lopende schrijf-keten klaar is (`await state._writeChain`) zodat de delete gegarandeerd vóór de re-insert zit.
- `getInsertRow(sec)` + `insertAndWriteRow('Nog Te Doen', insertRow, ntdValues)`, `logEvent('Teruggezet', status, 'Verwijderd', 'Nog Te Doen')`, toast "↩ Ongedaan gemaakt", `loadAll()`.
- Verschil met `undoComplete`: er is géén Afgerond-rij om op te ruimen.

**`deleteOntwItem` (render-overig.js): zelfde patroon** op de sheet 'Ontwikkeling' — confirm weg, rijwaarden vastleggen, optimistische verwijdering + rode puls, undo-toast met re-insert, achtergrond-delete via `backgroundWrite`.

**Aanroepers:** `deleteCurrentEditTask` (modal-knop, registry-actie `taak-verwijder-modal`) blijft het enige taak-verwijderpad; `deleteTask(idx)` is een dunne wrapper en volgt vanzelf.

### 2. VvE-zoekveld (herbruikbaar)

**Nieuw klein module-bestand `src/vve-zoekveld.js`:**
- `filterVves(q, lijst)` — pure filterfunctie (code/naam, case-insensitief, `includes`), geëxporteerd en getest in de zelftest.
- `initVveZoekveld({input, lijstEl, toonAllesBijFocus, onSelect, onClear})` — wired input/focus/klik-events, rendert suggestie-items (code + naam, zelfde opmaak als `#vve-sug`), max-hoogte + scroll, sluit bij blur/Escape/klik-buiten. Het component beheert zijn eigen listeners (geen nieuwe registry-acties nodig).

**AI-hulp:** in index.html wordt de `<select>` vervangen door input + suggestiecontainer + wis-knop (×, alleen zichtbaar bij koppeling). `ai.js` leest niet langer `.value` van de select (2 plekken) maar `state._aiVveCode` (gezet door `onSelect`, geleegd door `onClear`); na selectie/wissen draaien `buildAiPrompt()` + `parseAiAnswer()` zoals nu bij `change`. `openAiHelp` vult geen options meer, maar reset het veld naar de actuele koppeling. Veldweergave na selectie: `CODE — Naam`.

**Taakmodal:** gedrag blijft identiek (≥2 tekens, geen volle lijst bij focus); `onCodeInput`/`selectVvE` gaan intern via dezelfde `filterVves`/render-helper zodat er één implementatie is.

### 3. Zichtbare overgangen

**CSS (styles.css):** klassen `rij-puls-groen` (#C0DD97, tekst groen-900), `rij-puls-rood` (#F7C1C1, tekst rood-900), `rij-flits` (teal-puls, blijft staan), `rij-flits-amber`, `rij-fade-weg` (opacity → 0). Dark-mode-overrides via `[data-theme="dark"]` (donkere ramp-stops, lichte tekst). Alles binnen `@media (prefers-reduced-motion: no-preference)`.

**Verdwijn-flow (afronden + verwijderen):** de registry-actie kent het geklikte element → `el.closest('tr')`. Volgorde: (1) D-mutatie + `_shiftNtdRows` direct (data klopt meteen), (2) puls- en daarna fade-klasse op de bestaande `<tr>` (~0,75 s + ~0,4 s), (3) ná de animatie `renderAll()`, (4) undo-toast direct bij stap 1. Tijdens de animatie staat een vlag `state._animBusy`; de 8s-poll-guard en tussentijdse `renderAll`-aanroepen slaan over zolang die waar is (voorkomt dat een poll-render de animerende rij wegrendert). Bij `reduced-motion` slaat de animatie over en rendert direct.

**Flits-flow (bewerken/toevoegen/teruggezet):** `rowNtd`/`rowAf`/ontw-rijen krijgen `data-row="${r._row}"`. Na `renderAll()` zoekt de actie de rij op (`[data-row]` binnen de juiste tabel) en zet de flits-klasse; de klasse verwijdert zichzelf na de animatie (`animationend`). Voor "Teruggezet" gebeurt dit best-effort na `loadAll()` op code-match; niet gevonden = geen flits, geen fout.

## Wat verandert NIET
- Afronden houdt zijn bestaande undo-flow (`undoComplete`) — krijgt alleen de groene puls erbij.
- De taakmodal-autocomplete blijft functioneel identiek.
- Geen wijzigingen aan Apps Script, sheets-structuur of de CSP (mijlpaal C volgt apart).
- Alles eerst op `staging`; productie pas bij de eindmerge.

## Testen
- Zelftest-asserts voor `filterVves` (zoekt op code, op naam, case-insensitief, lege query) — draaien mee in `?test=1`.
- Bestaande 56 asserts blijven groen (registry-dekking ongewijzigd; er komen geen nieuwe `data-action`-labels bij).
- Ingelogde flows op de test-link (gebruiker): taak verwijderen + ongedaan maken, Ontwikkeling-item verwijderen + ongedaan maken, AI-VvE zoeken op code/naam/scrollen/wissen, pulsen zichtbaar bij afronden/verwijderen/bewerken/toevoegen, dark mode.

## Risico's
- **Volgorde delete→undo:** ondervangen door `await state._writeChain` in `undoDelete`.
- **Poll-render tijdens animatie:** ondervangen door `state._animBusy`-guard.
- **Rij-indexdrift:** de bestaande `_shiftNtdRows`/rollback-mechanismen blijven leidend; undo gebruikt `getInsertRow` (sectie-einde), niet de oude rijpositie — bewust, zelfde keuze als `undoComplete`.
