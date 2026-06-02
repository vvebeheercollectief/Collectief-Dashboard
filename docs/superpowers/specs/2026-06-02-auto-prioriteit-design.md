# Auto-prioriteit & deadline-gedreven workflow — Ontwerp

**Datum:** 2026-06-02
**Project:** Collectief Dashboard 4.0
**Status:** Ter review

---

## Doel

De huidige handmatige prioriteit-selectie (Hoog/Midden/Laag) vervangen door een automatische, deadline-gedreven berekening per categorie. Doel: consistentie afdwingen, productiviteit verhogen en menselijke vergissingen elimineren.

Daarnaast twee aanvullende verbeteringen:
1. Sortering binnen prioriteit-groepen op vroegste deadline.
2. 'Stille' taken-detector: signaleert taken in behandeling die al >14 dagen geen activiteit hebben.

---

## Scope

**Binnen scope:**
- Automatische prioriteit-berekening voor alle 4 subcategorieën (Oppakken, Vergaderverzoeken, Offerte-trajecten, LOD).
- Verwijdering van het handmatige Prioriteit-veld uit het bewerkscherm.
- Visuele markering van verstreken deadlines ('Te laat'-status).
- Sortering op prioriteit + deadline.
- 'Stille' taken-detector.
- Dagelijkse Apps Script-writeback naar de Sheet.

**Buiten scope:**
- Wekelijkse e-mail/push 'jouw Hoog-taken' (advies: latere uitbreiding).
- Wijziging van de prioriteit-filterselect (blijft hetzelfde, werkt op berekende waarden).
- Wijziging van de bestaande notificatie-triggers (cd_checkDeadlines, cd_dailySummary).

---

## Architectuur

### Frontend (`index.html`)

Centrale pure functie bovenin het script-blok:

```js
// === AUTO-PRIORITEIT CONFIG ===
const PRIO_REGELS = {
  OPPAKKEN:          { hoog:  7, midden: 14 },   // dagen
  VERGADERVERZOEKEN: { hoog: 14, midden: 21 },
  OFFERTE:           { hoog: 21, midden: 42 },
  LOD:               { hoog: 90, midden: 240 },
};
const STIL_DREMPEL_DAGEN = 14;

function berekenPrioriteit(deadlineStr, categorie, vandaag = new Date()) {
  if (!deadlineStr) return { prioriteit: '', dagenTot: null, teLaat: false };
  const deadline = _parseAnyDate(deadlineStr);
  if (!deadline) return { prioriteit: '', dagenTot: null, teLaat: false };
  const dagenTot = _verschilInKalenderdagen(deadline, vandaag);
  const teLaat = dagenTot < 0;
  const regels = PRIO_REGELS[categorie];
  let prioriteit;
  if (dagenTot <= regels.hoog) prioriteit = 'Hoog';
  else if (dagenTot <= regels.midden) prioriteit = 'Midden';
  else prioriteit = 'Laag';
  return { prioriteit, dagenTot, teLaat };
}
```

Aanroepingen:
- Bij elke rij-render in de tabel (`renderRow` of vergelijkbare functie).
- Bij sortering (`sortTaken`).
- Bij filtering op prioriteit.
- Bij badge-weergave (`prioBadge`).

### Backend (`AppsScript.gs`)

Nieuwe functie + trigger:

```js
const CD_PRIO_REGELS = {
  OPPAKKEN:          { hoog:  7, midden: 14 },
  VERGADERVERZOEKEN: { hoog: 14, midden: 21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden: 42 },
  LOD:               { hoog: 90, midden: 240 },
};

function cd_recalcPrioriteiten() { /* zie sectie Apps Script writeback */ }
```

Trigger: dagelijks 06:00 (vóór de 08:30 summary). Toegevoegd aan `CD_TRIGGER_FUNCS` in de installer.

---

## Prioriteits-regels

| Categorie            | Hoog       | Midden        | Laag    |
|----------------------|------------|---------------|---------|
| Oppakken             | ≤ 7 dagen  | 8–14 dagen    | > 14 d  |
| Vergaderverzoeken    | ≤ 14 dagen | 15–21 dagen   | ≥ 22 d  |
| Offerte-trajecten    | ≤ 21 dagen | 22–42 dagen   | ≥ 43 d  |
| LOD                  | ≤ 90 dagen | 91–240 dagen  | > 240 d |

**Berekening:**
- `dagenTot = verschilInKalenderdagen(deadline, vandaag)`. Vandaag = 0, morgen = 1, gisteren = -1.
- Maanden worden vertaald naar vaste dagen (3 mnd = 90 d, 8 mnd = 240 d) — voorspelbaar, geen randgevallen rond februari.
- Datums worden geïnterpreteerd in `Europe/Amsterdam`, niet UTC — voorkomt midnight-flip.

---

## Edge cases & visuele status

### Geen deadline ingevuld
- Prioriteit-cel blijft leeg (geen badge).
- Deadline-kolom toont oranje indicator ⚠ "Geen deadline".
- Prioriteit-filter Hoog/Midden/Laag verbergt deze taken; "Alle prioriteiten" toont ze.

### Verstreken deadline (dagenTot < 0)
- Hele rij krijgt lichtrode achtergrond + linker rode rand.
  - Voorgestelde CSS-tokens: `background: rgba(220, 38, 38, 0.08); border-left: 3px solid #dc2626;`
- Naast actie-tekst een rode pill: "Te laat (Xd)" waarbij X = `Math.abs(dagenTot)`.
- Prioriteit blijft **Hoog** (urgent), maar Te laat-styling overruled visueel.
- Te-late taken sorteren bovenaan binnen Hoog.

### Afgeronde taken
- Geen prioriteit, geen Te laat-markering, geen Stil-pill — historisch overzicht.

---

## Sortering

Binnen elke subcategorie-tab:
1. Te laat (verstreken deadline) — bovenaan
2. Prioriteit: Hoog → Midden → Laag → leeg
3. Deadline oplopend (vroegste eerst)
4. VvE-code (tie-breaker, alfabetisch)

---

## Apps Script dagelijkse writeback

`cd_recalcPrioriteiten()`:
- Trigger: `timeBased().atHour(6).everyDays(1)`.
- Loopt door de 4 secties in de "Nog Te Doen"-sheet (via dezelfde sectie-detectie als `cd_checkDeadlines`).
- Voor elke rij: lees deadline-kolom, bereken nieuwe prioriteit, vergelijk met huidige waarde.
- Schrijf alleen weg als gewijzigd (minimaliseert sheet-writes en revisies).
- Logt totaal in Logboek-sheet: `"YYYY-MM-DD HH:MM | Auto-prioriteit | Bijgewerkt: Oppakken=3, Vergaderverzoeken=1, Offerte=0, LOD=2"`.

Idempotent: tweede draai zelfde dag = 0 wijzigingen.

---

## 'Stille' taken-detector

**Definitie:** taak met `inBehandeling = true` én geen logboek-entry of bewerking de laatste `STIL_DREMPEL_DAGEN` (= 14) dagen.

**Bepaling laatste activiteit:** maximum van (a) datum van laatste geschiedenis-entry, (b) `bewerkt op`-veld. Als beide ontbreken: aanmaakdatum.

**UI:**
- Kleine grijze pill rechts van de actietekst: 🔕 "Stil 21d" (aantal dagen sinds laatste activiteit).
- Klikken opent het bewerkscherm met focus op de geschiedenis-tijdlijn.

**Implementatie:** pure frontend in `index.html` — geen Apps Script nodig. Geen Sheet-kolom om bij te houden; berekening on the fly bij render.

---

## Migratie

Eenmalig bij eerste deploy:
1. Code-update deployen (frontend + Apps Script).
2. In Apps Script editor handmatig `cd_recalcPrioriteiten()` draaien.
3. Alle bestaande Prioriteit-waarden worden overschreven met berekende waarden.

Geen rollback nodig: oude handmatige waarden waren inconsistent — dat is het probleem dat we oplossen.

---

## Testing & verificatie

### Frontend unit-tests
Onderaan het script-blok in `index.html`, in een `if (location.search.includes('test=1'))` gate, een blok met `console.assert`-tests:
- 12 hoofd-cases: per categorie × {Hoog-grens, Midden-grens, Laag-grens}.
- 3 edge-cases: lege deadline, verstreken deadline, deadline = vandaag.
- Sortering: 5 taken in willekeurige volgorde → controleer eindvolgorde.

Roep `?test=1` aan in dev → resultaten in console.

### Apps Script
- Handmatig draaien in editor, check op fouten.
- Verifieer Logboek-regel.
- Tweede run zelfde dag → 0 wijzigingen (idempotentie).

### Visueel via Preview MCP
1. `preview_start` op `index.html`.
2. Login met test-account.
3. Maak taken aan met deadlines op: vandaag, +5 d, +10 d, +20 d, +50 d, +300 d, en zonder deadline.
4. Verifieer per categorie de prioriteits-badge + sortering.
5. Maak taak met deadline -3 d → rij rood + "Te laat (3d)"-pill.
6. Maak taak in behandeling met laatste activiteit >14 d geleden → Stil-pill zichtbaar.
7. `preview_screenshot` als bewijs.

---

## Wijzigingen per bestand (samenvatting)

**`index.html`:**
- Toevoegen: `PRIO_REGELS`, `STIL_DREMPEL_DAGEN`, `berekenPrioriteit()`, `bepaalStil()`, `_verschilInKalenderdagen()`.
- Verwijderen: Prioriteit-`<select>` blok in bewerkscherm (regels ~795-797 en idem voor de andere 3 secties).
- Aanpassen: rij-renderfunctie (Te laat-styling, Stil-pill, deadline-waarschuwing), sortering, filter, badge-functie.
- Toevoegen: CSS voor `.row-telaat`, `.pill-telaat`, `.pill-stil`, `.warn-geen-deadline`.

**`AppsScript.gs`:**
- Toevoegen: `CD_PRIO_REGELS`, `cd_recalcPrioriteiten()`, opname in `CD_TRIGGER_FUNCS`, trigger-installatie in setup-functie.

---

## Aanvullend advies (buiten deze spec)

Bewust niet ingebouwd, maar wel het overwegen waard als losse vervolg-iteraties:

1. **Wekelijks 'jouw Hoog-taken'-overzicht** (per behandelaar, maandag 08:00 push of e-mail). Versterkt het systematische ritme.
2. **'Te laat'-dagelijkse samenvatting**: voeg te-laat-tellers toe aan de bestaande `cd_dailySummary`.
3. **Deadline-historie**: log automatisch wanneer een deadline gewijzigd wordt en met hoeveel dagen — geeft inzicht in welke trajecten consequent uitlopen.
4. **Capaciteit-signaal**: dashboard-tile "Aantal Hoog-taken per behandelaar" — signaleert wie overbelast is.
5. **Auto-archivering**: taken afgerond > 6 maanden → naar een aparte archief-sheet, houdt het hoofdoverzicht licht.
