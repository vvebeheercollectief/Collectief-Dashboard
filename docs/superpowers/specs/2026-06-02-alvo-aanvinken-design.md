# Aanvinkbare velden op ALV's Overzicht

**Datum:** 2026-06-02
**Status:** Goedgekeurd, klaar voor implementatie

## Probleem

Op de ALV's Overzicht-pagina staan drie booleaanse kolommen — **Uitnodiging**, **Notulen** en **Begroting** — die uit Google Sheets gelezen worden als `TRUE`/`FALSE`. Ze worden read-only getoond als `✓ Ja` of `–`. Beheerders moeten nu naar Google Sheets schakelen om een vinkje te zetten, wat de workflow onderbreekt.

## Doel

Maak de drie kolommen op ALV's Overzicht klikbaar zodat één klik direct de waarde in Google Sheets aanpast — gelijk aan hoe Sheets zelf werkt — met optimistische UI-update, audit-log en toast-bevestiging.

## Scope

**In scope:**
- Klikbare pills voor Uitnodiging / Notulen / Begroting op ALV's Overzicht
- Directe write naar Sheet "ALV's overzicht" via bestaande Sheets API
- Optimistische UI-update + automatische rollback bij API-fout
- Logboek-entry per toggle
- Toast-bevestiging
- Herberekening van afgeleid `status` veld (Open / Gepland / Afgerond)

**Niet in scope (YAGNI):**
- Toggle-functie elders (dashboard, Recentelijk afgerond)
- Modal / save-knop / opmerking-veld bij toggle
- Volgorde-regels tussen de drie velden
- Undo-functie binnen het dashboard (Sheets heeft eigen versiegeschiedenis)
- Permissie-restricties bovenop de bestaande ALLOWED_EMAILS

## Architectuur

### Bestaande infrastructuur (hergebruik)
- `ensureToken()` — OAuth refresh
- `getSheetIds()` — naam→ID mapping voor batchUpdate
- Sheets API `batchUpdate` met `updateCells`-request
- `logEvent(code, sec, actie, veld, oud, nieuw, bron)` — Logboek-rij
- `showToast(title, body, color)` — UI feedback
- `loadAll()` — herlaadt alle data

### Nieuwe code
1. **`renderAlvo()` aanpassing** — drie cellen worden `<button>` met `data-idx` en `data-field`.
2. **`toggleAlvoFlag(idx, field)` functie** — uitvoert toggle-flow.
3. **CSS** — `.flag-toggle` met hover/active state, disabled state tijdens API-call.

## Data model

`D.alvo` rij-object (uit `parseAlvo`):
```js
{ code, naam, uitnodiging:bool, notulen:bool, begroting:bool, opmerkingen, status, _row }
```

Sheet "ALV's overzicht" kolommen:
- A: code
- B: naam
- **C: uitnodiging** (index 2)
- **D: notulen** (index 3)
- **E: begroting** (index 4)
- F: opmerkingen

Waarde-conventie: string `"TRUE"` of `"FALSE"` (matcht wat `parseAlvo` leest met `(r[2]||'').trim()==='TRUE'`).

Veld→kolomindex + label mapping:
```js
const ALVO_COLS = { uitnodiging: 2, notulen: 3, begroting: 4 };
const ALVO_LABELS = { uitnodiging: 'Uitnodiging', notulen: 'Notulen', begroting: 'Begroting' };
```

## Data flow

```
1. Klik op pill (idx=i, field=f)
2. Check token via ensureToken(); zo niet → foutmelding
3. Lock UI: pill krijgt class .toggling (pointer-events:none, opacity:.6)
4. Snapshot oude waarde: const old = D.alvo[i][f]
5. Optimistic flip: D.alvo[i][f] = !old
6. Herbereken status: D.alvo[i].status = notulen?'Afgerond':uitnodiging?'Gepland':'Open'
7. renderAlvo() — pill werkt direct bij
8. Sheets API: batchUpdate updateCells naar rij D.alvo[i]._row kolom ALVO_COLS[f]
   met booleanValue=!old (Sheets accepteert booleanValue; parseAlvo leest userEnteredValue
   als string TRUE/FALSE → moet via stringValue gaan voor consistente parse)
9. Bij OK: logEvent + showToast('✓ <Veld> aan/uit', '<code> – <naam>', kleur)
10. Bij FAIL: revert D.alvo[i][f]=old + status herberekenen + renderAlvo() + foutmelding-toast
11. Unlock UI (class .toggling weg)
```

**Belangrijk over Sheet-write formaat:** `parseAlvo` doet `(r[2]||'').trim()==='TRUE'`. De Sheets API kan zowel `booleanValue:true` als `stringValue:"TRUE"` schrijven. Met `booleanValue` toont Sheets een echte checkbox als de cel daarvoor gevalideerd is; zonder validatie toont het `TRUE`/`FALSE`. Om robuust te zijn t.o.v. de huidige cel-typing schrijven we met `userEnteredValue: { stringValue: "TRUE" }` of `"FALSE"` — dit is wat de huidige Sheet-rijen al bevatten en wat parseAlvo verwacht.

*Verfijning tijdens implementatie:* eerst quick-check op een testrij of cellen al als checkbox-validated zijn; zo ja → `booleanValue` gebruiken zodat checkbox-UI in Sheets blijft werken. Zo niet → `stringValue`. Default: `stringValue` (veilig).

## UI

### Pill states
- **Aan:** `class="flag-toggle on"` — groene achtergrond (`var(--gn-l)` bg, `var(--gn)` tekst), ✓-symbool, label "Ja"
- **Uit:** `class="flag-toggle off"` — grijze achtergrond (`var(--sur2)` bg, `var(--mut)` tekst), "–"
- **Hover (uit):** lichte groene tint als preview
- **Hover (aan):** subtiele lift + iets sterker groen
- **Toggling:** opacity .6, pointer-events:none, mini-spinner of pulsing border

### Toegankelijkheid
- Pills zijn `<button>` (toetsenbord-bedienbaar, focus-ring)
- `aria-pressed="true|false"` voor screen readers
- `title` attribuut: "Klik om <veld> aan/uit te zetten"

## Error handling

| Scenario | Gedrag |
|---|---|
| Niet ingelogd / token verlopen | `ensureToken()` toont login-prompt; bij faal → toast "Niet ingelogd" + revert |
| API HTTP-fout | Revert state, re-render, toast "Opslaan mislukt: <message>" |
| Netwerk-fout (catch) | Idem als API-fout |
| Polling overschrijft tijdens API-call | Geaccepteerd: optimistische update wint visueel; volgende poll synct |
| Dubbelklik tijdens lopende call | Pill is locked via `.toggling`; pointer-events:none voorkomt dubbele call |

## Logboek-entry

```js
logEvent(
  r.code,
  'ALVS',                              // sec
  newVal ? 'Aangevinkt' : 'Uitgevinkt',// actie
  fieldLabel,                           // 'Uitnodiging' / 'Notulen' / 'Begroting'
  oldVal ? 'TRUE' : 'FALSE',
  newVal ? 'TRUE' : 'FALSE',
  'ALV-overzicht'                      // bron
)
```

## Testen (handmatig)

1. **Happy path per veld** — klik elk van de drie pills aan, controleer:
   - Pill verandert direct
   - Status badge update (notulen aan → Afgerond, alleen uitnodiging aan → Gepland, beide uit → Open)
   - Google Sheet rij toont nieuwe waarde
   - Logboek-rij verschijnt
   - Toast verschijnt
2. **Uitvinken** — vink een aan staand veld uit, idem checks
3. **Niet ingelogd** — log uit, klik pill → foutmelding, geen state-change
4. **Offline / API down** — kill netwerk via DevTools, klik pill → revert + foutmelding
5. **Dubbelklik** — klik 2× snel → tweede klik wordt geblokkeerd
6. **Polling consistency** — toggle aan, wacht 10s, geen flikker terug

## Implementatiestappen (globaal)

1. CSS-class `.flag-toggle` toevoegen met varianten
2. `renderAlvo()` aanpassen — drie pill-cellen renderen met onclick
3. `toggleAlvoFlag(idx, field)` schrijven
4. Veld→kolom mapping + label-mapping toevoegen
5. Manual test (zie hierboven)
6. Commit + push

Implementatie-plan volgt via `writing-plans`.
