# Offerte-opvolgsysteem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het bestaande offerte-tabblad ("OFFERTE-TRAJECTEN" binnen "Nog Te Doen") slim maken met een zelf-sorterende "Nu opvolgen"-groep, een dagelijkse briefing, een fase-balk en één-klik opvolg-acties — zonder dataverhuizing of nieuwe pagina.

**Architecture:** Pure, testbare motor-functies in `src/util.js` (fase, bal-bij-wie, dagen-stil, nu-opvolgen, sorteerscore, briefing-feiten) bepalen wat aandacht nodig heeft. De render-laag (`src/render-lijsten.js`) toont de offerte-sectie als twee groepen ("Nu opvolgen" + "Lopend") met een briefing-banner en fase-balk. Acties (`src/actions.js`) leggen via het bestaande `addContactLog`-patroon een `Logboek`-regel vast en zetten de opvolgdatum. Alles leest de bestaande offerte-rijen uit `D.ntd['OFFERTE-TRAJECTEN']`.

**Tech Stack:** Vanilla ES-modules, Google Sheets REST (bestaand `api.js`), optimistische writes (`backgroundWrite`), zelfgebouwde testsuite via `?test=1` (`src/tests.js`). Geen build-stap, geen dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-offerte-opvolgsysteem-design.md`

**Vastgelegde keuzes:** termijnen 5/7/7 (aannemer werkdagen, delen/eigenaren kalenderdagen); "Bij VvE" krijgt een eigen klok; geen aparte pagina (tabblad verrijken); geen migratie; `Aannemers`-tabblad pas bij eerste gebruik (Fase 5, optioneel).

---

## File Structure

- `src/util.js` — **uitbreiden**: pure motor-functies + termijnen-constante + werkdagen-helper. Eén verantwoordelijkheid: berekeningen, geen IO/DOM. Wordt geëxporteerd en getest.
- `src/tests.js` — **uitbreiden**: `eq()`/`truthy()`-assertions voor de nieuwe functies.
- `src/render-lijsten.js` — **uitbreiden**: offerte-sectie rendert briefing-banner + "Nu opvolgen"/"Lopend"-groepen + fase-balk; FLIP-herordening.
- `src/actions.js` — **uitbreiden**: `ACTIONS`-handlers `offerte-nabellen` / `offerte-doorsturen`.
- `src/ai.js` — **uitbreiden**: briefing-tekst (AI-toon) bovenop de regel-gebaseerde feiten, met fallback.
- `src/config.js` — **uitbreiden**: `OFFERTE_TERMIJNEN`-constante.
- `styles.css` — **uitbreiden**: stijlen voor briefing-banner, fase-balk, groepkoppen.
- `src/data.js`, `src/state.js`, `src/kenmerken.js`-achtig nieuw `src/aannemers.js` — **alleen Fase 5 (optioneel)**.

---

## Phase 0 — Staging klaarzetten

### Task 0: Branch op staging, gelijk aan main

**Files:** geen code; git.

- [ ] **Step 1: Controleer dat staging geen eigen commits heeft**

Run: `git log --oneline main..origin/staging`
Expected: lege output (staging zit volledig in main).

- [ ] **Step 2: Werk staging bij naar main en stap erop over**

```bash
git checkout staging
git merge --ff-only main
git push origin staging
```
Expected: staging staat op dezelfde commit als main (fast-forward, geen conflicten).

- [ ] **Step 3: Bevestig branch**

Run: `git branch --show-current`
Expected: `staging`

> Alle volgende commits gaan op `staging`. Pas na akkoord van de beheerder mergen we naar `main`.

---

## Phase 1 — Pure motor-logica (TDD, volledig getest)

Alle functies in deze fase zijn puur (input → output, geen DOM/IO) en worden getest in `src/tests.js`. De testsuite draait via `http://localhost:<poort>/?test=1` (of de staging-URL) en logt `window._testResult = "X OK, Y FAIL"`.

### Task 1.1: Termijnen-constante + `parseOff` + `offerteFase`

**Files:**
- Modify: `src/config.js` (constante toevoegen)
- Modify: `src/util.js` (functies + export)
- Modify: `src/tests.js` (tests)

- [ ] **Step 1: Voeg de termijnen-constante toe in `src/config.js`**

Voeg toe onder `export const SKEYS = ...` (na regel ~57):

```javascript
// Opvolg-termijnen voor de offerte-motor (Fase: offerte-opvolgsysteem).
// aannemer = werkdagen; delen/eigenaren = kalenderdagen.
export const OFFERTE_TERMIJNEN = { aannemer: 5, delen: 7, eigenaren: 7 };
export const OFFERTE_FASES = ['aangevraagd', 'ontvangen', 'bij_vve', 'gegund'];
```

- [ ] **Step 2: Schrijf de falende test**

Voeg in `src/tests.js` vóór de eind-tally (vóór `const totOk = ok + _tOk` op regel ~213) toe:

```javascript
  // ── offerte-motor: fase-afleiding ──
  eq('fase leeg → aangevraagd', offerteFase({offertes:'0/3'}), 'aangevraagd');
  eq('fase X>0 → ontvangen',    offerteFase({offertes:'2/3'}), 'ontvangen');
  eq('fase expliciet bij_vve',  offerteFase({offertes:'3/3', fase:'bij_vve'}), 'bij_vve');
  eq('fase expliciet "Bij VvE"',offerteFase({fase:'Bij VvE'}), 'bij_vve');
  eq('fase gegund',             offerteFase({fase:'gegund'}), 'gegund');
```

En vul de util-import bovenaan `src/tests.js` (regel 4) aan met `offerteFase`:

```javascript
import { berekenPrioriteit, _parseAnyDate, displayName, opvolgStatus, volgendeDeadline, STIL_ESCALATIE_REGELS, offerteFase } from "./util.js";
```

- [ ] **Step 3: Run de test, verifieer FAIL**

Run: open `http://localhost:<poort>/?test=1`, lees console.
Expected: FAIL — `offerteFase is not defined` (of de eq-FAIL-regels).

- [ ] **Step 4: Implementeer `parseOff` + `offerteFase` in `src/util.js`**

Voeg toe (bv. net vóór `function offProg`), en importeer `OFFERTE_FASES` bovenaan `util.js` vanuit config:

```javascript
// "X/N" → [ontvangen, aangevraagd]
function parseOff(v){
  const [recv, req] = ((v||'')+'').split('/').map(s => parseInt(s)||0);
  return [recv||0, req||0];
}

// Fase van een offerte-traject. Expliciet `fase`-veld wint; anders afgeleid uit X/N.
function offerteFase(r){
  const f = (((r&&r.fase)||'')+'').trim().toLowerCase().replace(/\s+/g,'_');
  if (OFFERTE_FASES.includes(f)) return f;
  const [recv] = parseOff(r && r.offertes);
  return recv > 0 ? 'ontvangen' : 'aangevraagd';
}
```

Voeg `parseOff, offerteFase` toe aan het `export { ... }`-blok onderaan `util.js` (regels 175-180).
Importeer `OFFERTE_FASES` bovenaan `util.js`: voeg toe aan de bestaande `import ... from "./config.js"` (of maak die import aan als util.js nog niets uit config importeert — controleer eerst; `STIL_DREMPEL_DAGEN` e.d. staan in util zelf, dus voeg een nieuwe regel toe):

```javascript
import { OFFERTE_FASES } from "./config.js";
```

- [ ] **Step 5: Run de test, verifieer PASS**

Run: herlaad `http://localhost:<poort>/?test=1`.
Expected: de 5 fase-tests tellen mee in `X OK`, geen FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/util.js src/tests.js
git commit -m "feat(offerte): offerteFase + parseOff + OFFERTE_TERMIJNEN (TDD)"
```

---

### Task 1.2: `offerteBalBij`

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js` (bij de offerte-tests) toevoegen, en `offerteBalBij` aan de util-import toevoegen:

```javascript
  // ── offerte-motor: bal bij wie ──
  eq('balBij aangevraagd → aannemer', offerteBalBij({offertes:'0/2'}), 'aannemer');
  eq('balBij ontvangen → ons',        offerteBalBij({offertes:'2/2'}), 'ons');
  eq('balBij bij_vve → vve',          offerteBalBij({fase:'bij_vve'}), 'vve');
  eq('balBij gegund → null',          offerteBalBij({fase:'gegund'}), null);
```

- [ ] **Step 2: Run, verifieer FAIL**

Run: `?test=1`. Expected: FAIL (`offerteBalBij is not defined`).

- [ ] **Step 3: Implementeer in `src/util.js`**

```javascript
// Bij wie ligt de bal? 'aannemer' | 'ons' | 'vve' | null (gegund).
function offerteBalBij(r){
  const fase = offerteFase(r);
  if (fase === 'gegund')  return null;
  if (fase === 'bij_vve') return 'vve';
  if (fase === 'ontvangen') return 'ons';
  return 'aannemer';
}
```

Voeg `offerteBalBij` toe aan het export-blok.

- [ ] **Step 4: Run, verifieer PASS**

Run: `?test=1`. Expected: 4 extra OK, geen FAIL.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): offerteBalBij (TDD)"
```

---

### Task 1.3: `_verschilInWerkdagen`

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js` toevoegen (+ import van `_verschilInWerkdagen`):

```javascript
  // ── offerte-motor: werkdagen-verschil (vr→ma = 1, weekend telt niet) ──
  eq('werkdagen vr→ma', _verschilInWerkdagen(new Date(2026,5,5), new Date(2026,5,8)), 1);
  eq('werkdagen vr→di', _verschilInWerkdagen(new Date(2026,5,5), new Date(2026,5,9)), 2);
  eq('werkdagen ma→do', _verschilInWerkdagen(new Date(2026,5,1), new Date(2026,5,4)), 3);
  eq('werkdagen zelfde dag', _verschilInWerkdagen(new Date(2026,5,8), new Date(2026,5,8)), 0);
```

(2026-06-05 is een vrijdag, 06-08 maandag, 06-01 maandag, 06-04 donderdag.)

- [ ] **Step 2: Run, verifieer FAIL**

Run: `?test=1`. Expected: FAIL (`_verschilInWerkdagen is not defined`).

- [ ] **Step 3: Implementeer in `src/util.js`**

```javascript
// Aantal werkdagen (ma–vr) ná `van` t/m `tot`. Negatief/gelijk → 0.
function _verschilInWerkdagen(van, tot){
  if (!(van instanceof Date) || !(tot instanceof Date) || isNaN(van) || isNaN(tot)) return null;
  let a = new Date(van.getFullYear(), van.getMonth(), van.getDate());
  const b = new Date(tot.getFullYear(), tot.getMonth(), tot.getDate());
  let n = 0;
  while (a < b){
    a.setDate(a.getDate() + 1);
    const wd = a.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
```

Voeg `_verschilInWerkdagen` toe aan het export-blok.

- [ ] **Step 4: Run, verifieer PASS**

Run: `?test=1`. Expected: 4 extra OK.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): _verschilInWerkdagen (TDD)"
```

---

### Task 1.4: `offerteStilBasis` + `offerteNuOpvolgen`

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js` toevoegen (+ import `offerteNuOpvolgen`, `offerteStilBasis`). Gebruik een vaste `vandaag`:

```javascript
  // ── offerte-motor: nu-opvolgen ──
  const VANDAAG_OFF = new Date(2026, 5, 12); // vr 12 juni 2026
  // aannemer 10 werkdagen stil (aangevraagd 29 mei) → nodig
  eq('nu-opvolgen aannemer te lang stil',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'29 mei 2026'}, VANDAAG_OFF).nodig, true);
  // aannemer pas 2 dagen geleden aangevraagd → niet nodig
  eq('nu-opvolgen aannemer nog vers',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'10 juni 2026'}, VANDAAG_OFF).nodig, false);
  // ontvangen, 9 dagen niet gedeeld → nodig, bal bij ons, actie Doorsturen
  truthy('nu-opvolgen ontvangen → doorsturen',
     (()=>{const s=offerteNuOpvolgen({offertes:'2/2', datumAangevraagd:'3 juni 2026'}, VANDAAG_OFF);
           return s.nodig && s.balBij==='ons' && s.actie==='Doorsturen';})());
  // gegund → nooit nodig
  eq('nu-opvolgen gegund nooit',
     offerteNuOpvolgen({fase:'gegund', datumAangevraagd:'1 jan 2026'}, VANDAAG_OFF).nodig, false);
  // weggelegd (opvolgdatum in toekomst) → niet nodig
  eq('nu-opvolgen weggelegd',
     offerteNuOpvolgen({offertes:'0/2', datumAangevraagd:'1 mei 2026', opvolgdatum:'1 juli 2026'}, VANDAAG_OFF).nodig, false);
  // deadline overschreden → altijd nodig
  eq('nu-opvolgen deadline te laat',
     offerteNuOpvolgen({offertes:'2/2', datumAangevraagd:'11 juni 2026', deadline:'1 juni 2026'}, VANDAAG_OFF).nodig, true);
```

- [ ] **Step 2: Run, verifieer FAIL**

Run: `?test=1`. Expected: FAIL (`offerteNuOpvolgen is not defined`).

- [ ] **Step 3: Implementeer in `src/util.js`**

Importeer `OFFERTE_TERMIJNEN` (voeg toe aan de config-import uit Task 1.1):

```javascript
import { OFFERTE_FASES, OFFERTE_TERMIJNEN } from "./config.js";
```

```javascript
// Laatste "aanraak"-datum van een traject (voor de stil-teller): de jongste van
// laatsteActiviteit (door render gezet uit logboek), opvolgdatum, datumAangevraagd.
function offerteStilBasis(r){
  const kandidaten = [r && r.laatsteActiviteit, r && r.opvolgdatum, r && r.datumAangevraagd];
  let laatst = null;
  kandidaten.forEach(s => {
    const p = _parseAnyDate(s || '');
    if (p){ const d = new Date(p.y, p.m - 1, p.d); if (!laatst || d > laatst) laatst = d; }
  });
  return laatst;
}

// Heeft dit traject vandaag opvolging nodig? + context (bal-bij-wie, dagen, actie).
function offerteNuOpvolgen(r, vandaag, termijnen){
  vandaag = vandaag || _vandaagAmsterdam();
  termijnen = termijnen || OFFERTE_TERMIJNEN;
  const fase   = offerteFase(r);
  const balBij = offerteBalBij(r);
  const ov     = opvolgStatus(r, vandaag);
  const basis  = offerteStilBasis(r);
  const dagen     = basis ? _verschilInKalenderdagen(vandaag, basis) : null;
  const werkdagen = basis ? _verschilInWerkdagen(basis, vandaag) : null;
  const dlp = _parseAnyDate((r && r.deadline) || '');
  const deadlineTeLaat = dlp ? (_verschilInKalenderdagen(new Date(dlp.y, dlp.m - 1, dlp.d), vandaag) < 0) : false;
  const opvolgenVandaag = ov.vandaag && !!_parseAnyDate((r && r.opvolgdatum) || '');
  const actie = balBij === 'ons' ? 'Doorsturen' : 'Nabellen';
  if (fase === 'gegund' || ov.weggelegd){
    return { nodig:false, fase, balBij, dagen, werkdagen, deadlineTeLaat, actie };
  }
  const termijn = balBij === 'aannemer' ? termijnen.aannemer
                : balBij === 'ons'      ? termijnen.delen
                : balBij === 'vve'      ? termijnen.eigenaren : Infinity;
  const meting = balBij === 'aannemer' ? werkdagen : dagen;
  const nodig = (meting != null && meting >= termijn) || deadlineTeLaat || opvolgenVandaag;
  return { nodig: !!nodig, fase, balBij, dagen, werkdagen, deadlineTeLaat, actie };
}
```

Voeg `offerteStilBasis, offerteNuOpvolgen` toe aan het export-blok.

- [ ] **Step 4: Run, verifieer PASS**

Run: `?test=1`. Expected: 6 extra OK, geen FAIL.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): offerteNuOpvolgen + offerteStilBasis (TDD)"
```

---

### Task 1.5: `offerteSorteerScore`

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js` toevoegen (+ import `offerteSorteerScore`):

```javascript
  // ── offerte-motor: sorteerscore (hoger = urgenter) ──
  truthy('score: deadline-te-laat > gewoon',
     offerteSorteerScore({offertes:'2/2', datumAangevraagd:'11 juni 2026', deadline:'1 juni 2026', prioriteit:'Laag'}, VANDAAG_OFF)
     > offerteSorteerScore({offertes:'0/2', datumAangevraagd:'1 juni 2026', prioriteit:'Hoog'}, VANDAAG_OFF));
  truthy('score: langer stil > korter stil',
     offerteSorteerScore({offertes:'0/2', datumAangevraagd:'1 mei 2026', prioriteit:'Midden'}, VANDAAG_OFF)
     > offerteSorteerScore({offertes:'0/2', datumAangevraagd:'10 juni 2026', prioriteit:'Midden'}, VANDAAG_OFF));
```

- [ ] **Step 2: Run, verifieer FAIL**

Run: `?test=1`. Expected: FAIL (`offerteSorteerScore is not defined`).

- [ ] **Step 3: Implementeer in `src/util.js`**

```javascript
// Sorteerscore voor "Nu opvolgen": hoger = urgenter (sorteer aflopend).
function offerteSorteerScore(r, vandaag){
  const s = offerteNuOpvolgen(r, vandaag);
  const prioRank = { hoog:2, midden:1, laag:0 }[(((r&&r.prioriteit)||'')+'').trim().toLowerCase()];
  return (s.deadlineTeLaat ? 1e6 : 0) + ((s.dagen || 0) * 100) + (prioRank == null ? 1 : prioRank);
}
```

Voeg `offerteSorteerScore` toe aan het export-blok.

- [ ] **Step 4: Run, verifieer PASS**

Run: `?test=1`. Expected: 2 extra OK.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): offerteSorteerScore (TDD)"
```

---

### Task 1.6: `offerteBriefingFeiten`

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js` toevoegen (+ import `offerteBriefingFeiten`):

```javascript
  // ── offerte-motor: briefing-feiten (regel-gebaseerde kern) ──
  const RIJEN_OFF = [
    {code:'A', naam:'VvA Lekstraat 15', offertes:'0/2', datumAangevraagd:'1 mei 2026'},   // aannemer, lang stil
    {code:'B', naam:'VvE Hoofdstraat 22', offertes:'2/2', datumAangevraagd:'3 juni 2026'},// ons (doorsturen)
    {code:'C', naam:'VvE Parkweg 8', offertes:'1/1', fase:'bij_vve', datumAangevraagd:'1 juni 2026'}, // bij vve
    {code:'D', naam:'VvE Verswijk', offertes:'0/1', datumAangevraagd:'11 juni 2026'},      // vers → niet nodig
  ];
  const FEITEN = offerteBriefingFeiten(RIJEN_OFF, VANDAAG_OFF);
  eq('briefing nuOpvolgen telt 3', FEITEN.nuOpvolgen, 3);
  eq('briefing balBijOns telt 1',  FEITEN.balBijOns, 1);
  eq('briefing klaarTeGunnen telt 1', FEITEN.klaarTeGunnen, 1);
  truthy('briefing urgentste is A (langst stil)', FEITEN.urgentste && FEITEN.urgentste.code === 'A');
```

- [ ] **Step 2: Run, verifieer FAIL**

Run: `?test=1`. Expected: FAIL (`offerteBriefingFeiten is not defined`).

- [ ] **Step 3: Implementeer in `src/util.js`**

Importeer `STIL_ESCALATIE_REGELS` is al in util.js gedefinieerd (regel 32) — direct bruikbaar.

```javascript
// Regel-gebaseerde kern voor de briefing: telt en kiest het urgentste traject.
function offerteBriefingFeiten(rijen, vandaag, termijnen){
  vandaag = vandaag || _vandaagAmsterdam();
  rijen = rijen || [];
  const trap1 = STIL_ESCALATIE_REGELS['OFFERTE-TRAJECTEN'].trap1;
  let nuOpvolgen = 0, langStil = 0, balBijOns = 0, klaarTeGunnen = 0;
  let urgentste = null, urgScore = -1;
  rijen.forEach(r => {
    if (offerteFase(r) === 'bij_vve') klaarTeGunnen++;
    const s = offerteNuOpvolgen(r, vandaag, termijnen);
    if (!s.nodig) return;
    nuOpvolgen++;
    if ((s.dagen || 0) >= trap1) langStil++;
    if (s.balBij === 'ons') balBijOns++;
    const sc = offerteSorteerScore(r, vandaag);
    if (sc > urgScore){ urgScore = sc; urgentste = { code:(r.code||''), naam:(r.naam||''), dagen:s.dagen, balBij:s.balBij }; }
  });
  return { nuOpvolgen, langStil, balBijOns, klaarTeGunnen, urgentste };
}
```

Voeg `offerteBriefingFeiten` toe aan het export-blok.

- [ ] **Step 4: Run, verifieer PASS**

Run: `?test=1`. Expected: 4 extra OK, geen FAIL. Noteer het nieuwe totaal (was 62, nu ~62 + 25 = ~87).

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): offerteBriefingFeiten regel-gebaseerde kern (TDD)"
```

---

## Phase 2 — Render: "Nu opvolgen"-groep + fase-balk in de offerte-sectie

> Integratie tegen de live render. Volg het bestaande groep-render-patroon in `src/render-lijsten.js` (rond regels 332–391: `grpOf`, groepkoppen `grp-kop`, `bepaalStil`, `extraPills`). De offerte-rij-cellen staan in de `case 'OFFERTE-TRAJECTEN'` (regels ~416–426).

### Task 2.1: Sorteer & groepeer de offerte-sectie

**Files:**
- Modify: `src/render-lijsten.js` (de functie die `OFFERTE-TRAJECTEN`-rijen rangschikt vóór render; zelfde plek als de bestaande `grpOf`/sortering rond regel 332)
- Modify: `src/render-lijsten.js` import-regel 4 (voeg `offerteNuOpvolgen, offerteSorteerScore, offerteFase` toe)

- [ ] **Step 1: Verrijk offerte-rijen met `laatsteActiviteit` vóór de motor draait**

In de render-functie voor de NTD-sectie, wanneer `sec === 'OFFERTE-TRAJECTEN'`, bereken per rij de laatste logboek-activiteit (hergebruik de logica uit `bepaalStil`) en zet die op `r.laatsteActiviteit` (ISO-string), zodat de pure `offerteStilBasis` hem meeneemt:

```javascript
function _verrijkOfferteRij(r){
  const entries = (D.logboek || []).filter(e => e.code === r.code && e.sectie === 'OFFERTE-TRAJECTEN');
  let laatst = null;
  entries.forEach(e => { const t = e.timestamp ? new Date(e.timestamp) : null; if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t; });
  r.laatsteActiviteit = laatst ? laatst.toISOString() : '';
  return r;
}
```

- [ ] **Step 2: Splits in twee groepen en sorteer "Nu opvolgen" aflopend op score**

Waar de offerte-sectie zijn rijen rendert, vóór het bouwen van de rij-HTML:

```javascript
const vandaag = _vandaagAmsterdam();
rijen.forEach(_verrijkOfferteRij);
const nu     = rijen.filter(r => offerteNuOpvolgen(r, vandaag).nodig)
                    .sort((a,b) => offerteSorteerScore(b, vandaag) - offerteSorteerScore(a, vandaag));
const lopend = rijen.filter(r => !offerteNuOpvolgen(r, vandaag).nodig);
```

- [ ] **Step 3: Render twee groepkoppen (hergebruik `grp-kop`-stijl)**

Bouw eerst de "Nu opvolgen"-groep (met telkop), dan "Lopend":

```javascript
let html = '';
html += `<tr><td colspan="${cols}" class="grp-kop grp-nu">🔔 Nu opvolgen (${nu.length})</td></tr>`;
html += nu.map(r => offerteRijHtml(r, vandaag)).join('') || `<tr><td colspan="${cols}" style="color:var(--mut);padding:12px">Niets dat nu opvolging vraagt 🎉</td></tr>`;
html += `<tr><td colspan="${cols}" class="grp-kop">Lopend (${lopend.length})</td></tr>`;
html += lopend.map(r => offerteRijHtml(r, vandaag)).join('');
```

`offerteRijHtml(r, vandaag)` is de bestaande offerte-rij-render (`case 'OFFERTE-TRAJECTEN'`), uitgebreid in Task 2.2/2.3. Houd de bestaande `data-rid`/`state._rowCache`-indexering intact (rijen blijven in `state._rowCache` zoals nu).

- [ ] **Step 4: Verifieer in staging**

Open de staging-URL → "Nog Te Doen" → offerte-tabblad. Controleer: twee groepkoppen, urgente trajecten bovenaan onder "Nu opvolgen", de rest onder "Lopend". Bestaande edit/afronden-knoppen werken nog.

- [ ] **Step 5: Commit**

```bash
git add src/render-lijsten.js
git commit -m "feat(offerte): Nu opvolgen + Lopend groepen in offerte-sectie"
```

### Task 2.2: Fase-balk per traject

**Files:**
- Modify: `src/render-lijsten.js` (offerte-rij-render)
- Modify: `styles.css`

- [ ] **Step 1: Voeg een fase-balk toe aan de offerte-rij**

In `offerteRijHtml` (de `OFFERTE-TRAJECTEN`-cellen) een fase-balk-cel toevoegen die 4 mijlpalen toont op basis van `offerteFase(r)`:

```javascript
function faseBalk(r){
  const fases = ['aangevraagd','ontvangen','bij_vve','gegund'];
  const labels = {aangevraagd:'Aangevraagd', ontvangen:'Ontvangen', bij_vve:'Bij VvE', gegund:'Gegund'};
  const huidig = offerteFase(r);
  const idx = fases.indexOf(huidig);
  return `<div class="fase-balk">` + fases.map((f,i) =>
    `<span class="fase-stap ${i < idx ? 'done' : i === idx ? 'nu' : 'todo'}" title="${labels[f]}"></span>`
  ).join('') + `</div>`;
}
```

- [ ] **Step 2: Stijlen in `styles.css`**

```css
.fase-balk{display:flex;gap:3px;min-width:90px}
.fase-stap{flex:1;height:5px;border-radius:99px;background:var(--sur2)}
.fase-stap.done{background:var(--ac)}
.fase-stap.nu{background:var(--am)}
.fase-stap.todo{background:var(--sur2)}
```

- [ ] **Step 3: Verifieer in staging**

Offerte-tabblad: elke rij toont een balkje met de juiste fase gemarkeerd (teal = klaar, amber = huidige, grijs = nog te doen).

- [ ] **Step 4: Commit**

```bash
git add src/render-lijsten.js styles.css
git commit -m "feat(offerte): fase-balk per traject"
```

### Task 2.3: FLIP-zweefanimatie bij herordening

**Files:**
- Modify: `src/render-lijsten.js`

- [ ] **Step 1: Meet posities vóór de her-render, animeer ná**

Wikkel de offerte-sectie-render in een FLIP-helper. Vóór het vervangen van de tbody-HTML: bewaar `getBoundingClientRect().top` per rij (sleutel = `data-code` + onderwerp). Ná het zetten van de nieuwe HTML: voor elke rij die nog bestaat, bereken `deltaY = oudeTop - nieuweTop`, zet `transform: translateY(deltaY)` zonder transitie, forceer reflow, en zet daarna `transform:''` met `transition: transform .35s ease`. Respecteer `prefers-reduced-motion`:

```javascript
function flipOfferteRijen(container, doRender){
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = el => el.getAttribute('data-flip');
  const before = {};
  if (!reduce) container.querySelectorAll('tr[data-flip]').forEach(el => before[key(el)] = el.getBoundingClientRect().top);
  doRender();
  if (reduce) return;
  container.querySelectorAll('tr[data-flip]').forEach(el => {
    const k = key(el), oud = before[k];
    if (oud == null) return;
    const dy = oud - el.getBoundingClientRect().top;
    if (!dy) return;
    el.style.transform = `translateY(${dy}px)`; el.style.transition = 'none';
    el.getBoundingClientRect();
    el.style.transition = 'transform .35s ease'; el.style.transform = '';
  });
}
```

Geef elke offerte-`<tr>` een `data-flip="${esc(r.code)}|${esc(r.datumAangevraagd)}"`-attribuut zodat rijen herkenbaar blijven tussen renders.

- [ ] **Step 2: Verifieer in staging**

Voer een actie uit die de volgorde wijzigt (zie Phase 3) → de rij zweeft zichtbaar naar zijn nieuwe plek. Zet OS-instelling "verminder beweging" aan → geen animatie, direct verspringen.

- [ ] **Step 3: Commit**

```bash
git add src/render-lijsten.js
git commit -m "feat(offerte): FLIP-zweefanimatie bij herordening"
```

---

## Phase 3 — Eén-klik acties (Nabellen / Doorsturen)

> Hergebruik het `addContactLog`-patroon (`src/render-vve.js` regels 73–92): optimistische `D.logboek.unshift` + `appendRange("'Logboek'!A:H", [...])` via `backgroundWrite`. Registreer de handlers in de `ACTIONS`-map (`src/actions.js`).

### Task 3.1: Actie-knoppen in "Nu opvolgen"-rijen

**Files:**
- Modify: `src/render-lijsten.js` (offerte-rij-render)

- [ ] **Step 1: Voeg een contextuele actieknop toe (alleen in "Nu opvolgen")**

In `offerteRijHtml`, wanneer de rij in "Nu opvolgen" staat, render de juiste knop op basis van `offerteNuOpvolgen(r, vandaag).actie`:

```javascript
const s = offerteNuOpvolgen(r, vandaag);
const actieBtn = s.nodig
  ? `<button class="act-bw" data-action="${s.actie === 'Doorsturen' ? 'offerte-doorsturen' : 'offerte-nabellen'}" data-rid="${rid}">${s.actie}</button>`
  : '';
```

Plaats `actieBtn` in de bestaande acties-cel naast `editBtn`.

- [ ] **Step 2: Verifieer in staging**

"Nu opvolgen"-rijen tonen "Nabellen" of "Doorsturen"; "Lopend"-rijen niet.

- [ ] **Step 3: Commit**

```bash
git add src/render-lijsten.js
git commit -m "feat(offerte): actieknoppen in Nu opvolgen-rijen"
```

### Task 3.2: Handlers die loggen + opvolgdatum/fase zetten

**Files:**
- Create: `src/offerte-acties.js`
- Modify: `src/actions.js` (import + 2 `ACTIONS`-entries)

- [ ] **Step 1: Schrijf `src/offerte-acties.js`**

Volg `addContactLog` (logboek-append + optimistische update) en zet daarnaast de opvolgdatum op vandaag (reset de stil-teller). `offerteNabellen` logt een belmoment; `offerteDoorsturen` logt het delen én zet fase → `bij_vve`.

```javascript
import { state, D } from "./state.js";
import { appendRange, writeRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getCurrentWho } from "./notifications.js";
import { toISODate, _vandaagAmsterdam } from "./util.js";
import { renderNtd } from "./render-lijsten.js";

async function _logEnReset(r, soort, wie, tekst, faseNieuw){
  if (!r || !r.code) return;
  if (!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const who = getCurrentWho() || '?';
  const ts = new Date().toISOString();
  const vandaagStr = toISODate(_vandaagAmsterdam());
  const entry = { _row:0, timestamp:ts, code:r.code, sectie:'OFFERTE-TRAJECTEN', actie:'Contact', veld:soort, oudeWaarde:wie, nieuweWaarde:tekst, gebruiker:who };
  D.logboek.unshift(entry);
  r.opvolgdatum = vandaagStr;            // reset de stil-teller (optimistisch)
  if (faseNieuw) r.fase = faseNieuw;     // optimistische fase-overgang
  renderNtd();
  // Logboek-append + opvolgdatum-cel (kolom L) wegschrijven
  const rij = r._row;
  await Promise.allSettled([
    appendRange("'Logboek'!A:H", [ts, r.code, 'OFFERTE-TRAJECTEN', 'Contact', soort, wie, tekst, who]),
    rij ? writeRange(`'Nog Te Doen'!L${rij}:L${rij}`, [vandaagStr]) : Promise.resolve(),
  ]);
}

export function offerteNabellen(el){
  const r = state._rowCache[+el.dataset.rid];
  _logEnReset(r, 'Telefoon', 'Aannemer', 'Nagebeld voor opvolging offerte', null);
}
export function offerteDoorsturen(el){
  const r = state._rowCache[+el.dataset.rid];
  _logEnReset(r, 'E-mail', 'Bewoner/eigenaar', 'Offerte gedeeld met de eigenaren', 'bij_vve');
}
```

> Let op: bevestig de kolomindex van het optionele `fase`-veld in het plan-open-punt vóór je fase echt naar de Sheet schrijft. In v1 mag `r.fase` optimistisch in het geheugen blijven; de persistente fase-schrijf naar een vrije kolom is een vervolgstap (zie open punt 2). `opvolgdatum` (kolom L) bestaat al en wordt hier wél persistent geschreven.

- [ ] **Step 2: Registreer in `src/actions.js`**

Voeg een import toe:

```javascript
import { offerteNabellen, offerteDoorsturen } from './offerte-acties.js';
```

En twee entries in de `ACTIONS`-map:

```javascript
  'offerte-nabellen':      (el) => offerteNabellen(el),
  'offerte-doorsturen':    (el) => offerteDoorsturen(el),
```

- [ ] **Step 3: Verifieer in staging**

Klik "Nabellen" op een urgent traject → er verschijnt een logboek-regel (zichtbaar op de VvE-pagina/Logboek), het traject zakt uit "Nu opvolgen" (opvolgdatum = vandaag) met zweef-animatie. Klik "Doorsturen" → fase schuift naar "Bij VvE". Bij netwerkfout: `backgroundWrite`-rollback toont een toast (controleer met DevTools offline).

> Verfijning: als de directe `appendRange`/`writeRange` hier buiten `backgroundWrite` draait, wikkel beide schrijfacties alsnog in `backgroundWrite(writeFn, rollback, titel)` met een rollback die `entry` uit `D.logboek` haalt en `r.opvolgdatum`/`r.fase` herstelt — consistent met `addContactLog`. Pas dit aan zodat de optimistische update netjes terugdraait bij fouten.

- [ ] **Step 4: Commit**

```bash
git add src/offerte-acties.js src/actions.js
git commit -m "feat(offerte): Nabellen/Doorsturen loggen + resetten opvolgdatum"
```

---

## Phase 4 — Dagelijkse briefing (banner + AI-toon)

### Task 4.1: Briefing-banner (regel-gebaseerd, eerste-keer-per-dag, heropenen)

**Files:**
- Modify: `src/render-lijsten.js` (briefing-banner bovenaan offerte-sectie)
- Modify: `src/actions.js` (`offerte-briefing-sluiten` / `offerte-briefing-ververs`)
- Modify: `styles.css`

- [ ] **Step 1: Render de briefing-banner bovenaan de offerte-sectie**

Bouw de regel-gebaseerde tekst uit `offerteBriefingFeiten(rijen, vandaag)`:

```javascript
function briefingTekstRegel(f){
  if (!f.nuOpvolgen) return 'Geen openstaande opvolging vandaag — alles loopt 👍';
  let t = `Vandaag hebben ${f.nuOpvolgen} traject${f.nuOpvolgen===1?'':'en'} aandacht nodig`;
  if (f.langStil) t += `, waarvan ${f.langStil} al lang stil`;
  t += '. ';
  if (f.urgentste) t += `Het urgentst: ${f.urgentste.naam} (${f.urgentste.dagen} dagen stil, bal bij ${f.urgentste.balBij}).`;
  if (f.klaarTeGunnen) t += ` ${f.klaarTeGunnen} traject${f.klaarTeGunnen===1?'':'en'} wacht op akkoord van de VvE.`;
  return t;
}
```

Banner-HTML met chips en sluit/ververs-knoppen (zichtbaar afhankelijk van `state.offerteBriefingOpen`):

```javascript
const f = offerteBriefingFeiten(rijen, vandaag);
const briefingHtml = state.offerteBriefingOpen ? `
  <div class="off-briefing">
    <div class="off-briefing-kop">
      <span>✦ Briefing · ${toDutchDate(_vandaagAmsterdam())}</span>
      <span><button class="ico" data-action="offerte-briefing-ververs" title="Opnieuw">↻</button>
            <button class="ico" data-action="offerte-briefing-sluiten" title="Sluiten">✕</button></span>
    </div>
    <p id="off-briefing-tekst">${esc(briefingTekstRegel(f))}</p>
    <div class="off-briefing-chips">
      ${f.langStil?`<span class="chip-stil">${f.langStil} lang stil</span>`:''}
      ${f.balBijOns?`<span class="chip-ons">${f.balBijOns} wacht op jou</span>`:''}
      ${f.klaarTeGunnen?`<span class="chip-gun">${f.klaarTeGunnen} bij de VvE</span>`:''}
    </div>
  </div>` : `<button class="off-briefing-knop" data-action="offerte-briefing-ververs">✦ Briefing</button>`;
```

- [ ] **Step 2: Eerste-keer-per-dag automatisch openen**

In de overgang naar het offerte-tabblad (de `setNtd`-handler of `goTo('ntd')`-pad waar `state.activeNtd` op `'OFFERTE-TRAJECTEN'` komt), zet `state.offerteBriefingOpen` op `true` als de datum-sleutel in `localStorage` nog niet die van vandaag is:

```javascript
const sleutel = 'offerteBriefing_' + toISODate(_vandaagAmsterdam());
if (state.activeNtd === 'OFFERTE-TRAJECTEN' && localStorage.getItem(sleutel) !== '1'){
  state.offerteBriefingOpen = true;
  localStorage.setItem(sleutel, '1');
}
```

Voeg `offerteBriefingOpen: false` toe aan het `state`-object in `src/state.js`.

- [ ] **Step 3: Handlers voor sluiten/heropenen in `src/actions.js`**

```javascript
  'offerte-briefing-sluiten': () => { state.offerteBriefingOpen = false; renderNtd(); },
  'offerte-briefing-ververs': () => { state.offerteBriefingOpen = true;  renderNtd(); },
```

(`renderNtd` is al geïmporteerd in `actions.js`.)

- [ ] **Step 4: Stijlen in `styles.css`**

```css
.off-briefing{background:var(--pu-l);border-radius:var(--rl);padding:14px 16px;margin-bottom:14px}
.off-briefing-kop{display:flex;justify-content:space-between;align-items:center;font-weight:600;color:var(--pu);font-size:13px;margin-bottom:6px}
.off-briefing p{margin:0;color:var(--pu);font-size:14px;line-height:1.6}
.off-briefing-chips{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.off-briefing-chips span{background:#fff;font-size:12px;padding:4px 10px;border-radius:var(--rm)}
.off-briefing-knop{margin-bottom:14px}
.off-briefing .ico{background:none;border:none;cursor:pointer;color:var(--pu);font-size:15px;margin-left:8px}
```

- [ ] **Step 5: Verifieer in staging**

Wis `localStorage` → open offerte-tabblad → briefing schuift open met juiste tekst/chips. Sluit → "✦ Briefing"-knop verschijnt; klik → opnieuw open. Herlaad → blijft dicht (al gezien vandaag).

- [ ] **Step 6: Commit**

```bash
git add src/render-lijsten.js src/actions.js src/state.js styles.css
git commit -m "feat(offerte): dagelijkse briefing-banner (regel-gebaseerd)"
```

### Task 4.2: AI-toonlaag met fallback

**Files:**
- Modify: `src/ai.js` (functie die feiten → natuurlijke tekst maakt)
- Modify: `src/render-lijsten.js` (na render: AI-tekst async inladen in `#off-briefing-tekst`)

- [ ] **Step 1: Voeg een AI-briefing-functie toe in `src/ai.js`**

Bouw een prompt uit de feiten (`offerteBriefingFeiten`) + roep de bestaande AI-aanroep aan; geef bij fout `null` terug zodat de render-laag op de regel-gebaseerde tekst blijft staan:

```javascript
export async function offerteBriefingAiTekst(feiten){
  try {
    const prompt = `Schrijf in 2-3 vriendelijke, zakelijke Nederlandse zinnen een ochtendbriefing voor een VvE-beheerder over offerte-opvolging. Feiten: ${JSON.stringify(feiten)}. Noem het urgentste traject bij naam. Geen opsomming, lopende tekst.`;
    const tekst = await _aiCall(prompt);   // hergebruik de bestaande AI-aanroep in ai.js
    return (tekst || '').trim() || null;
  } catch(e){ return null; }
}
```

> Bevestig de naam van de bestaande AI-aanroep in `ai.js` (de functie die `buildAiPrompt` gebruikt om Gemini te bevragen) en gebruik die i.p.v. `_aiCall`.

- [ ] **Step 2: Vervang de tekst async ná de render**

In de offerte-render, ná het zetten van de banner-HTML en alleen als `state.offerteBriefingOpen`:

```javascript
if (state.offerteBriefingOpen){
  offerteBriefingAiTekst(offerteBriefingFeiten(rijen, _vandaagAmsterdam())).then(t => {
    const el = document.getElementById('off-briefing-tekst');
    if (t && el) el.textContent = t;   // alleen vervangen als AI iets bruikbaars gaf
  });
}
```

- [ ] **Step 3: Verifieer in staging**

Briefing toont eerst de regel-gebaseerde tekst, daarna (indien AI beschikbaar) een natuurlijker geformuleerde versie. Blokkeer de AI-aanroep (DevTools offline of fout) → de regel-gebaseerde tekst blijft staan, geen lege briefing, geen crash.

- [ ] **Step 4: Commit**

```bash
git add src/ai.js src/render-lijsten.js
git commit -m "feat(offerte): AI-toonlaag voor briefing met regel-gebaseerde fallback"
```

---

## Phase 5 — (Optioneel) Per-aannemer detail

> Alleen bouwen wanneer de beheerder per-aannemer status wil vastleggen. v1 werkt volledig zonder. Volgt het `kenmerken.js`-patroon (parse + helper + save + `backgroundWrite`).

### Task 5.1: `Aannemers`-tabblad lezen + tonen

**Files:**
- Create: `src/aannemers.js` (parse + helper + save)
- Modify: `src/state.js` (`D.aannemers = []`)
- Modify: `src/data.js` (`fetchSheet("Aannemers").catch(()=>[])` in `loadAll` + `D.aannemers = parseAannemers(...)`)
- Modify: `src/render-lijsten.js` (per-traject detail: aannemer-regels of fallback naar `offProg`)
- Modify: `src/tests.js` (test voor `parseAannemers`)

- [ ] **Step 1: TDD `parseAannemers`** — schrijf eerst een `eq()`-test (kolommen `code,onderwerp,aannemer,status,datumUitgevraagd,laatsteContact`, `_row:i+2`, dedup niet nodig), run FAIL, implementeer naar `parseKenmerken`-patroon, run PASS.

- [ ] **Step 2: Laad het tabblad** in `loadAll` (`Promise.all`) met `.catch(()=>[])` zodat een ontbrekend tabblad geen fout geeft; parse naar `D.aannemers`.

- [ ] **Step 3: Toon per-aannemer regels** in het traject-detail; ontbreekt data → val terug op `offProg(r.offertes)` + namen uit `opmerkingen`.

- [ ] **Step 4: Verifieer + commit.**

```bash
git add src/aannemers.js src/state.js src/data.js src/render-lijsten.js src/tests.js
git commit -m "feat(offerte): optioneel per-aannemer detail (Aannemers-tabblad)"
```

---

## Afronding

### Task 6: Volledige testronde + akkoord

- [ ] **Step 1: Draai de volledige suite op staging**

Run: open `<staging-url>/?test=1`, lees console + `window._testResult`.
Expected: `~87 OK, 0 FAIL` (62 bestaand + ~25 nieuw). Geen FAIL.

- [ ] **Step 2: Handmatige doorloop op staging**

Briefing opent eerste keer per dag; "Nu opvolgen" sorteert correct; Nabellen/Doorsturen loggen + resetten + zweven; fase-balk klopt; "Lopend" toont de rest; hoofdscherm verder ongewijzigd.

- [ ] **Step 3: Vraag de beheerder om akkoord**

Laat de beheerder de staging-versie gebruiken. Pas na expliciet akkoord:

```bash
git checkout main
git merge --no-ff staging -m "Offerte-opvolgsysteem: offerte-tabblad slim gemaakt"
git push origin main
```

> Volg het bestaande sw-cache-patroon (versie ophogen in `sw.js`) zoals bij eerdere deploys, zodat de PWA de nieuwe versie ophaalt.

---

## Self-Review notities

- **Spec-dekking:** A (Nu-opvolgen-motor) → Task 1.4/1.5 + 2.1/2.3; B (briefing) → Task 1.6 + 4.1/4.2; C (fase-balk + aannemers) → Task 2.2 + 5; D (één-klik acties) → Task 3. Termijnen → Task 1.1. Geen nieuwe pagina/migratie → bevestigd in Phase 2 (in-place render).
- **Open punten uit de spec:** termijnen 5/7/7 vastgelegd (Task 1.1); werkdagen-helper (Task 1.3); "Bij VvE"-klok zit in `offerteNuOpvolgen` (balBij `vve` → `termijnen.eigenaren`); de persistente `fase`-kolom is bewust uitgesteld (v1 optimistisch in geheugen, zie noot in Task 3.2) — bevestig de vrije kolomindex vóór je fase naar de Sheet schrijft.
- **Type-consistentie:** `offerteNuOpvolgen` retourneert `{nodig, fase, balBij, dagen, werkdagen, deadlineTeLaat, actie}`; render en briefing gebruiken exact deze velden. `offerteBriefingFeiten` retourneert `{nuOpvolgen, langStil, balBijOns, klaarTeGunnen, urgentste:{code,naam,dagen,balBij}}`.
