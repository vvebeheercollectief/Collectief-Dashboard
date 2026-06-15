# Offerte-aannemerslijst + bewerken vanuit Vandaag — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per offerte-traject een uitklapbaar aannemers-lijstje (naam + 'binnen'-vlag) dat de "X/N binnen"-teller automatisch voedt, plus een bewerk-knop op de Vandaag-regels.

**Architecture:** Bron van waarheid = nieuwe kolom P ('Aannemers') in tab 'Nog Te Doen', als rauwe string `naam|0/1` per regel. Pure helpers in `util.js` parsen/serializen/leiden de teller af. De render-verrijking (`_verrijkOfferteRij`) zet bij elke render `r._aannemers` + overschrijft `r.offertes` in het geheugen wanneer er aannemers zijn (kolom D wordt nooit overschreven; motor blijft pure consument). Een gedeeld paneel-component rendert de lijst onder de Vandaag-focusregel én de tabelrij. Muterende acties schrijven optimistisch met rollback (zelfde patroon als `offerte-acties.js`).

**Tech Stack:** Vanilla ES-modules (geen bundler), Google Sheets via Apps Script, in-browser zelftest via `?test=1` (`window._testResult`).

---

## Bestandsoverzicht

- `src/util.js` — Modify: 3 pure helpers (`parseAannemers`, `serializeAannemers`, `deriveOffertes`) + export.
- `src/data.js` — Modify (`parseSections`): kolom P inlezen als `entry.aannemers`.
- `src/render-lijsten.js` — Modify: verrijking-derivatie; `offerteAannemerPaneel` + `offerteAannSamenvatting` helpers; bewerk-potlood + samenvatting + paneel in `offerteFocusRij`; uitklap-rij + samenvatting in de tabel (`rowNtd`); exports.
- `src/state.js` — Modify: `offerteAannOpen: new Set()`.
- `src/offerte-aannemers.js` — Create: muterende acties (`addAannemer`, `toggleAannemerBinnen`, `verwijderAannemer`).
- `src/actions.js` — Modify: 3 click-handlers + Enter-keydown voor het invoerveld + import.
- `styles.css` — Modify: paneel-/knop-styling (thema-tokens, dark-mode).
- `src/tests.js` — Modify: unit- + integratietests + import.
- `sw.js` — Modify: `CACHE_VERSION` → `cd-v16`.

Sheet-voorbereiding (buiten code): tab 'Nog Te Doen' kolom **P** kopje **"Aannemers"**.

---

### Task 1: Pure helpers — parse/serialize/derive

**Files:**
- Modify: `src/util.js` (na `offerteNabelTeller`, rond regel 224; export rond regel 290)
- Test: `src/tests.js` (na het nabelteller-blok, rond regel 325; import regel 4)

- [ ] **Step 1: Schrijf de falende tests**

In `src/tests.js`, voeg `parseAannemers, serializeAannemers, deriveOffertes` toe aan de util-import op regel 4. Voeg daarna (vlak na de `nabelteller telt 2 nabel-acties`-test, ~regel 325) toe:

```javascript
  // ── offerte-aannemers: parse / serialize / derive ──
  eq('parseAannemers leeg', parseAannemers(''), []);
  eq('parseAannemers naam zonder vlag', parseAannemers('Klusbouw Meesters'),
     [{naam:'Klusbouw Meesters', binnen:false}]);
  eq('parseAannemers met binnen-vlag', parseAannemers('Zegwaard en Motec|1'),
     [{naam:'Zegwaard en Motec', binnen:true}]);
  eq('parseAannemers meerdere regels + lege regel', parseAannemers('A|1\n\nB|0\nC'),
     [{naam:'A',binnen:true},{naam:'B',binnen:false},{naam:'C',binnen:false}]);
  eq('serialize ↔ parse round-trip',
     parseAannemers(serializeAannemers([{naam:'Heijstek en Klus',binnen:true},{naam:'Alvin Lin',binnen:false}])),
     [{naam:'Heijstek en Klus',binnen:true},{naam:'Alvin Lin',binnen:false}]);
  eq('serialize stript pipe/newline uit naam',
     serializeAannemers([{naam:'A|B\nC',binnen:false}]), 'A B C|0');
  eq('deriveOffertes leeg', deriveOffertes([]), '');
  eq('deriveOffertes 1 van 3',
     deriveOffertes([{naam:'a',binnen:true},{naam:'b',binnen:false},{naam:'c',binnen:false}]), '1/3');
```

- [ ] **Step 2: Draai de suite — verwacht FAIL**

Open de app met `?test=1` (zie verificatie-noot onderaan over cache-bust). Verwacht in de console `FAIL: parseAannemers …` en `window._testResult` met meerdere FAIL (helpers bestaan nog niet → `ReferenceError`/import-fout).

- [ ] **Step 3: Implementeer de helpers**

In `src/util.js`, direct ná de functie `offerteNabelTeller` (rond regel 224):

```javascript
// ── Aannemers per offerte-traject (kolom P 'Nog Te Doen') ──────────────────
// Eén aannemer per regel; naam en 'binnen'-vlag gescheiden door '|':  "Naam|1".
// '|1' = offerte binnen, anders nog niet. Lege/whitespace-regels worden genegeerd.
function parseAannemers(cel){
  return ((cel||'')+'').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const i=l.lastIndexOf('|');
    if(i<0) return {naam:l, binnen:false};
    return {naam:l.slice(0,i).trim(), binnen:l.slice(i+1).trim()==='1'};
  }).filter(a=>a.naam);
}
function serializeAannemers(lijst){
  return (lijst||[]).map(a=>`${(a.naam||'').replace(/[|\n]/g,' ').trim()}|${a.binnen?1:0}`).join('\n');
}
// Afgeleide "X/N binnen": N = aantal aannemers, X = aantal met offerte binnen. Leeg → ''.
function deriveOffertes(lijst){
  if(!lijst||!lijst.length) return '';
  return `${lijst.filter(a=>a.binnen).length}/${lijst.length}`;
}
```

Voeg de drie namen toe aan de `export {…}` (rond regel 290), bijvoorbeeld op de offerte-regel:

```javascript
  offerteStilBasis, offerteNuOpvolgen, offerteSorteerScore, offerteBriefingFeiten, offerteNabelTeller,
  parseAannemers, serializeAannemers, deriveOffertes,
```

- [ ] **Step 4: Draai de suite — verwacht PASS**

Herlaad `?test=1`. De 8 nieuwe assertions slagen; `window._testResult` toont 0 nieuwe FAIL.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): pure helpers voor aannemerslijst (parse/serialize/derive)"
```

---

### Task 2: Kolom P inlezen in parseSections

**Files:**
- Modify: `src/data.js:128` (na de `fase`-regel in `parseSections`)

- [ ] **Step 1: Voeg het inlezen van kolom P toe**

In `src/data.js`, in `parseSections`, direct ná de regel `entry.fase = _f4v(row[14]);  // O …` (regel 128):

```javascript
    entry.aannemers  =_f4v(row[15]);  // P — aannemerslijst (naam|0/1 per regel)
```

- [ ] **Step 2: Sanity-check (geen aparte test)**

`_f4v` zet erfenis-`TRUE`/`FALSE` om naar leeg; voor kolom P (vrije tekst) is dat ongevaarlijk. Geen losse test: dit wordt gedekt door de integratietest in Task 3 (die zet `aannemers` rechtstreeks op het rij-object). Bevestig alleen dat de app nog laadt zonder console-fout.

- [ ] **Step 3: Commit**

```bash
git add src/data.js
git commit -m "feat(offerte): lees aannemers-kolom P uit 'Nog Te Doen'"
```

---

### Task 3: Verrijking leidt X/N af uit de aannemerslijst

**Files:**
- Modify: `src/render-lijsten.js:220-224` (`_verrijkOfferteRij`); import regel 4
- Test: `src/tests.js` (na de helper-tests uit Task 1)

- [ ] **Step 1: Schrijf de falende integratietest**

In `src/tests.js`, voeg ná de derive-tests toe:

```javascript
  // ── offerte: aannemerslijst stuurt de X/N-teller (via filterNtd-verrijking) ──
  truthy('verrijking leidt X/N af uit aannemerslijst', (()=>{
    const row={code:'ZZ-TEST',naam:'Test',offertes:'5/5',aannemers:'A|1\nB|0',_row:9999};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return row.offertes==='1/2';
  })());
  truthy('lege aannemerslijst laat handmatige X/N staan', (()=>{
    const row={code:'ZZ-LEEG',naam:'Test',offertes:'2/4',aannemers:'',_row:9998};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return row.offertes==='2/4';
  })());
  truthy('2/2 uit lijst → bal bij ons', (()=>{
    const row={code:'ZZ-ONS',naam:'Test',offertes:'',aannemers:'A|1\nB|1',_row:9997};
    filterNtd([row],'','','','','OFFERTE-TRAJECTEN');
    return offerteBalBij(row)==='ons';
  })());
```

(`filterNtd` en `offerteBalBij` zijn al geïmporteerd in tests.js.)

- [ ] **Step 2: Draai de suite — verwacht FAIL**

Herlaad `?test=1`. Verwacht FAIL op "verrijking leidt X/N af …" (de teller wordt nog niet afgeleid; `row.offertes` blijft `5/5`).

- [ ] **Step 3: Implementeer de derivatie in `_verrijkOfferteRij`**

In `src/render-lijsten.js`, voeg `parseAannemers, deriveOffertes` toe aan de util-import (regel 4). Vervang de functie `_verrijkOfferteRij` (regel 220-224) door:

```javascript
function _verrijkOfferteRij(r, actMap){
  const t=actMap.get(r.code)||null;
  r.laatsteActiviteit=t?`${t.getFullYear()}-${t.getMonth()+1}-${t.getDate()}`:'';
  // Aannemerslijst (kolom P) stuurt de X/N-teller: leg de echte D-waarde éénmalig vast,
  // override alleen in het geheugen wanneer er aannemers zijn. Kolom D blijft ongewijzigd.
  if(r._offertesManual===undefined) r._offertesManual=r.offertes;
  r._aannemers=parseAannemers(r.aannemers);
  r.offertes=r._aannemers.length ? deriveOffertes(r._aannemers) : r._offertesManual;
  return r;
}
```

- [ ] **Step 4: Draai de suite — verwacht PASS**

Herlaad `?test=1`. De drie nieuwe `truthy`-tests slagen.

- [ ] **Step 5: Commit**

```bash
git add src/render-lijsten.js src/tests.js
git commit -m "feat(offerte): aannemerslijst voedt X/N-teller bij verrijking"
```

---

### Task 4: Open-state voor uitgeklapte panelen

**Files:**
- Modify: `src/state.js:59` (na de Vandaag-focus-vlaggen)

- [ ] **Step 1: Voeg de Set toe**

In `src/state.js`, direct ná `offerteTabelOpen: false, …` (regel 59):

```javascript
  offerteAannOpen: new Set(), // codes van trajecten met uitgeklapt aannemers-paneel
```

- [ ] **Step 2: Commit**

```bash
git add src/state.js
git commit -m "feat(offerte): state voor uitgeklapte aannemers-panelen"
```

---

### Task 5: Paneel-component + bewerken & uitklappen op de Vandaag-regel

**Files:**
- Modify: `src/render-lijsten.js` (`offerteFocusRij` 190-208; nieuwe helpers ervoor; exports onderaan het bestand)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende component-tests**

In `src/tests.js`, voeg `offerteAannemerPaneel, offerteAannSamenvatting` toe aan de import uit `./render-lijsten.js` (regel 9). Voeg daarna toe (na de tests uit Task 3):

```javascript
  // ── offerte-aannemers: paneel- en samenvatting-component ──
  truthy('aannemer-paneel heeft toevoeg-veld',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:true}]}).includes('of-aann-add'));
  truthy('aannemer-paneel toont binnen-actie',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:true}]}).includes('offerte-aann-binnen'));
  truthy('aannemer-paneel toont verwijder-actie',
    offerteAannemerPaneel({code:'Q',_aannemers:[{naam:'X',binnen:false}]}).includes('offerte-aann-verwijder'));
  truthy('aannemer-samenvatting heeft open-actie',
    offerteAannSamenvatting({code:'Q',_aannemers:[]}).includes('offerte-aann-open'));
```

- [ ] **Step 2: Draai de suite — verwacht FAIL**

Herlaad `?test=1`. Verwacht een import-/`ReferenceError`-FAIL (helpers bestaan nog niet).

- [ ] **Step 3: Voeg de twee helpers toe + bewerk/uitklap in de focusrij**

In `src/render-lijsten.js`, direct vóór `function offerteFocusRij` (regel 190), voeg toe:

```javascript
// Klikbare samenvatting boven het aannemers-paneel (gedeeld: Vandaag + tabel).
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  const open=state.offerteAannOpen.has(r.code);
  const lbl=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  return `<span class="of-aann-tog" data-action="offerte-aann-open" data-code="${esc(r.code)}">${open?'▾':'▸'} ${lbl}</span>`;
}
// Uitklapbaar aannemers-lijstje voor één traject (gedeeld: Vandaag-focusrij + tabelrij).
function offerteAannemerPaneel(r){
  const code=esc(r.code);
  const rijen=(r._aannemers||[]).map((a,i)=>`<div class="of-aann-rij">
      <span class="of-aann-naam">${esc(a.naam)}</span>
      <button class="of-aann-st ${a.binnen?'in':''}" data-action="offerte-aann-binnen" data-code="${code}" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button class="of-aann-x" data-action="offerte-aann-verwijder" data-code="${code}" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`).join('');
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add"><span class="of-aann-plus" aria-hidden="true">+</span>
      <input class="of-aann-input" data-code="${code}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen"></div>
  </div>`;
}
```

Vervang vervolgens de `return`-regel onderaan `offerteFocusRij` (regel 205-207) door een wrapper met potlood, samenvatting en (indien open) paneel:

```javascript
  const open=state.offerteAannOpen.has(r.code);
  return `<div class="of-rij-wrap${open?' open':''}">
    <div class="of-r"><span class="of-code" style="color:var(--sec)">${esc(r.code)}</span>
      <div class="of-mid"><div class="of-naam">${esc(r.naam||'')}</div><div class="of-ctx">${ctx}</div>${offerteAannSamenvatting(r)}</div>
      <div class="of-act"><button class="of-edit" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><span class="of-later" data-action="offerte-later" data-rid="${rid}" title="Tot morgen wegleggen">later</span>${knop}</div></div>
    ${open?offerteAannemerPaneel(r):''}
  </div>`;
```

Voeg `offerteAannemerPaneel` en `offerteAannSamenvatting` toe aan de `export {…}` van `render-lijsten.js` (zoek de bestaande export met `offerteBalBijTekst, filterNtd, offerteGroepen, _offerteActiviteitMap` en vul deze twee namen aan).

- [ ] **Step 4: Draai de suite — verwacht PASS**

Herlaad `?test=1`. De vier component-tests slagen. Controleer ook visueel: open de offerte-tab; elke Vandaag-regel heeft nu een potlood (opent de bewerk-popup) en een "Aannemers …"-link; klikken klapt (nog leeg, want kolom P leeg) het paneel met invoerveld uit.

- [ ] **Step 5: Commit**

```bash
git add src/render-lijsten.js src/tests.js
git commit -m "feat(offerte): bewerk-potlood + uitklapbaar aannemers-paneel op Vandaag-regel"
```

---

### Task 6: Uitklap-rij in de volledige tabel

**Files:**
- Modify: `src/render-lijsten.js` (`rowNtd`: OFFERTE-TRAJECTEN-cel 578 + return 606-607)

- [ ] **Step 1: Voeg de samenvatting toe in de voortgangs-cel**

In `src/render-lijsten.js`, in `rowNtd`, in de `case'OFFERTE-TRAJECTEN'`-cellen, vervang de voortgangs-cel (regel 578):

```javascript
        <td>${offProg(r.offertes)}${faseBalk(r)}</td>
```

door:

```javascript
        <td>${offProg(r.offertes)}${faseBalk(r)}<div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></td>
```

- [ ] **Step 2: Voeg de uitklap-rij toe in de return**

In `rowNtd`, vervang de slot-return (regel 606-607):

```javascript
  const flipAttr = sec==='OFFERTE-TRAJECTEN' ? ` data-flip="${esc(r.code)}|${esc(r.datumAangevraagd||'')}"` : '';
  return `<tr class="${rowCls}" data-row="${r._row}"${flipAttr}>${bulkCel}${cells}</tr>`;
```

door:

```javascript
  const flipAttr = sec==='OFFERTE-TRAJECTEN' ? ` data-flip="${esc(r.code)}|${esc(r.datumAangevraagd||'')}"` : '';
  const aannRow = (sec==='OFFERTE-TRAJECTEN' && state.offerteAannOpen.has(r.code))
    ? `<tr class="of-aann-tr"><td colspan="${(state.bulkMode?1:0)+SECS[sec].cols.length+1}">${offerteAannemerPaneel(r)}</td></tr>`
    : '';
  return `<tr class="${rowCls}" data-row="${r._row}"${flipAttr}>${bulkCel}${cells}</tr>${aannRow}`;
```

- [ ] **Step 3: Verifieer visueel**

Open de offerte-tab → "Volledige tabel tonen". Elke rij toont onder de voortgangsbalk een "Aannemers …"-link; klikken klapt een rij over de volledige breedte uit met het paneel. De zelftest blijft groen (geen nieuwe assertions nodig; component al gedekt in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/render-lijsten.js
git commit -m "feat(offerte): aannemers-paneel ook uitklapbaar in de volledige tabel"
```

---

### Task 7: Muterende acties (offerte-aannemers.js)

**Files:**
- Create: `src/offerte-aannemers.js`

- [ ] **Step 1: Maak de module**

Schrijf `src/offerte-aannemers.js`:

```javascript
// ══════════════════════════════════════
//  OFFERTE-AANNEMERS — per-traject aannemerslijst (kolom P 'Nog Te Doen')
//  Bron van waarheid = de rauwe kolom-P-string r.aannemers; de render-verrijking
//  leidt daaruit r._aannemers én de "X/N binnen"-teller (r.offertes) af.
//  Optimistisch schrijven met rollback, zelfde patroon als offerte-acties.js.
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { parseAannemers, serializeAannemers } from "./util.js";
import { writeRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { renderNtd } from "./render-lijsten.js";

function _vindRij(code){
  return (D.ntd['OFFERTE-TRAJECTEN']||[]).find(r=>r.code===code) || null;
}

// Render direct (optimistisch) en schrijf de al-gemuteerde r.aannemers weg naar kolom P.
// backgroundWrite rolt terug + her-rendert bij falen (zie data.js).
async function _bewaar(r, vorige){
  renderNtd();
  if(!r._row) return; // zonder rijnummer geen schrijfdoel (zeldzaam) — alleen lokaal
  if(!await ensureToken()){ r.aannemers=vorige; renderNtd(); return; }
  let gedaan=false;
  backgroundWrite(
    async()=>{ if(!gedaan){ await writeRange(`'Nog Te Doen'!P${r._row}`,[r.aannemers]); gedaan=true; } },
    ()=>{ r.aannemers=vorige; },
    'Aannemers opslaan'
  );
}

function addAannemer(code, naam){
  const r=_vindRij(code); if(!r) return;
  naam=((naam||'')+'').replace(/[|\n]/g,' ').trim();
  if(!naam) return;
  const lijst=parseAannemers(r.aannemers);
  if(lijst.some(a=>a.naam.toLowerCase()===naam.toLowerCase())) return; // dubbel: niets doen
  const vorige=r.aannemers;
  lijst.push({naam, binnen:false});
  r.aannemers=serializeAannemers(lijst);
  state.offerteAannOpen.add(code); // paneel open houden
  _bewaar(r, vorige);
}

function toggleAannemerBinnen(code, idx){
  const r=_vindRij(code); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  const vorige=r.aannemers;
  lijst[idx].binnen=!lijst[idx].binnen;
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

function verwijderAannemer(code, idx){
  const r=_vindRij(code); if(!r) return;
  const lijst=parseAannemers(r.aannemers);
  if(!lijst[idx]) return;
  const vorige=r.aannemers;
  lijst.splice(idx,1);
  r.aannemers=serializeAannemers(lijst);
  _bewaar(r, vorige);
}

export { addAannemer, toggleAannemerBinnen, verwijderAannemer };
```

- [ ] **Step 2: Sanity-check import-keten**

Herlaad de app (zonder `?test=1`). Geen console-fout bij laden (de module wordt pas in Task 8 geïmporteerd, maar moet syntactisch correct zijn). Bevestig met de browser dat `src/offerte-aannemers.js` 200 OK laadt via een directe `fetch('./src/offerte-aannemers.js',{cache:'reload'}).then(r=>r.status)`.

- [ ] **Step 3: Commit**

```bash
git add src/offerte-aannemers.js
git commit -m "feat(offerte): muterende acties voor aannemerslijst (add/toggle/verwijder)"
```

---

### Task 8: Acties bedraden in actions.js

**Files:**
- Modify: `src/actions.js` (import 17-23; ACTIONS-map na regel 55; keydown in `initActions` 85-89)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test (handlers bestaan)**

In `src/tests.js` is `ACTIONS` al geïmporteerd (regel 7). Voeg toe na de component-tests:

```javascript
  // ── offerte-aannemers: actie-handlers bedraad ──
  truthy('actie offerte-aann-open bestaat', typeof ACTIONS['offerte-aann-open']==='function');
  truthy('actie offerte-aann-binnen bestaat', typeof ACTIONS['offerte-aann-binnen']==='function');
  truthy('actie offerte-aann-verwijder bestaat', typeof ACTIONS['offerte-aann-verwijder']==='function');
```

- [ ] **Step 2: Draai de suite — verwacht FAIL**

Herlaad `?test=1`. Verwacht 3× FAIL (`typeof … !== 'function'`).

- [ ] **Step 3: Bedraad de handlers**

In `src/actions.js`, voeg een import toe (na regel 18, bij de andere offerte-import):

```javascript
import { addAannemer, toggleAannemerBinnen, verwijderAannemer } from "./offerte-aannemers.js";
```

Voeg in de `ACTIONS`-map, direct ná `'offerte-tabel-toggle'` (regel 55), toe:

```javascript
  'offerte-aann-open':     (el) => { const c=el.dataset.code; if(state.offerteAannOpen.has(c)) state.offerteAannOpen.delete(c); else state.offerteAannOpen.add(c); renderNtd(); },
  'offerte-aann-binnen':   (el) => toggleAannemerBinnen(el.dataset.code, +el.dataset.idx),
  'offerte-aann-verwijder':(el) => verwijderAannemer(el.dataset.code, +el.dataset.idx),
```

Voeg in `initActions`, in de bestaande `keydown`-listener (na het `dos-tekst`-blok, regel 87), een Enter-handler voor het invoerveld toe:

```javascript
    if (e.target && e.target.classList && e.target.classList.contains('of-aann-input') && e.key === 'Enter') {
      e.preventDefault();
      const code = e.target.dataset.code, val = e.target.value;
      e.target.value = '';
      addAannemer(code, val);
    }
```

- [ ] **Step 4: Draai de suite — verwacht PASS**

Herlaad `?test=1`. De 3 handler-tests slagen.

- [ ] **Step 5: Commit**

```bash
git add src/actions.js src/tests.js
git commit -m "feat(offerte): bedraad aannemers-acties + Enter-toevoegen"
```

---

### Task 9: Styling van paneel, knoppen en uitklap-rij

**Files:**
- Modify: `styles.css` (na de bestaande `.of-voet-tog`-regel, ~regel 659)

- [ ] **Step 1: Voeg de stijlregels toe**

In `styles.css`, direct ná de regel `.of-voet-tog{…}` (regel 659):

```css
    .of-rij-wrap{border-top:1px solid var(--sur2)}
    .of-rij-wrap:first-of-type{border-top:none}
    .of-rij-wrap .of-r{border-top:none}
    .of-edit{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid var(--bor);border-radius:6px;background:transparent;color:var(--mut);cursor:pointer;flex:none}
    .of-edit:hover{background:var(--sur2);color:var(--txt);border-color:var(--fnt)}
    .of-edit svg{width:14px;height:14px}
    .of-aann-tog{display:inline-block;margin-top:3px;font-size:11.5px;font-weight:700;color:var(--ac);cursor:pointer}
    .of-aann-tog:hover{text-decoration:underline}
    .of-aann-paneel{margin:2px 0 10px;border:1px solid var(--bor);border-radius:9px;background:var(--sur2);overflow:hidden}
    .of-rij-wrap .of-aann-paneel{margin:0 0 10px 76px}
    .of-aann-rij{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--bor)}
    .of-aann-rij:first-child{border-top:none}
    .of-aann-naam{flex:1;min-width:0;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .of-aann-st{font-family:inherit;font-size:11px;font-weight:700;color:var(--mut);background:var(--sur);border:1px solid var(--bor);border-radius:20px;padding:3px 11px;cursor:pointer;white-space:nowrap}
    .of-aann-st.in{color:var(--ac-900);background:var(--ac-l);border-color:var(--ac-b)}
    .of-aann-x{font-size:16px;line-height:1;color:var(--fnt);background:none;border:none;cursor:pointer;padding:0 2px}
    .of-aann-x:hover{color:var(--rd)}
    .of-aann-add{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--bor)}
    .of-aann-plus{color:var(--ac);font-weight:800;font-size:15px}
    .of-aann-input{flex:1;height:30px;font-family:inherit;font-size:13px;color:var(--txt);background:var(--sur);border:1px solid var(--bor);border-radius:7px;padding:0 10px}
    .of-aann-input:focus{outline:none;border-color:var(--ac-b);box-shadow:0 0 0 2px var(--ac-l)}
    .of-aann-tbl-tog{margin-top:4px}
    .of-aann-tr>td{padding:0 14px 12px!important;background:var(--sur)}
```

- [ ] **Step 2: Verifieer visueel (licht + donker)**

Herlaad. Controleer: rij-scheidingslijntjes in het Vandaag-paneel zijn er nog (per `.of-rij-wrap`), potlood ziet er rustig uit, paneel staat ingesprongen onder de naam, "binnen"-knop is teal als actief en neutraal als "nog niet", invoerveld heeft een nette focus-ring. Toggle dark mode en herhaal.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style(offerte): aannemers-paneel, binnen-knop, bewerk-potlood (dark-mode)"
```

---

### Task 10: SW-cache bumpen, volledige suite + eind-commit

**Files:**
- Modify: `sw.js:4`

- [ ] **Step 1: Verhoog de cacheversie**

In `sw.js`, regel 4: `const CACHE_VERSION = 'cd-v15';` → `'cd-v16';`

- [ ] **Step 2: Draai de volledige zelftest**

Cache-bust eerst (zie noot onderaan), open `?test=1`, lees `window._testResult`. Verwacht **alle bestaande tests + de nieuwe (≈18) groen, 0 FAIL**. Bij FAIL: lees de console-regel, fix de betreffende task, herhaal.

- [ ] **Step 3: Hand-rooktest in de browser (ingelogd, op staging)**

Met echte data: voeg op een traject een aannemer toe (Enter), vink 'm "binnen" (de "X/N binnen"-teller en de balk lopen mee), verwijder er één, herlaad de pagina (waarde blijft staan = kolom P weggeschreven). Doe ditzelfde één keer in de volledige tabel.

- [ ] **Step 4: Commit + push naar staging**

```bash
git add sw.js
git commit -m "chore(sw): cache-versie cd-v16 voor aannemerslijst-release"
git push origin staging
```

---

## Verificatie-noot (belangrijk bij `?test=1`)

De lokale launch.json-pythonserver zet **geen** `no-store`; browser + service worker HTTP-cachen oude ES-modules. Vóór elke testronde:

1. service worker unregisteren: `navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))`
2. caches legen: `caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))`
3. de gewijzigde modules verversen: `Promise.all(['util.js','data.js','render-lijsten.js','state.js','offerte-aannemers.js','actions.js','tests.js'].map(f=>fetch('./src/'+f,{cache:'reload'}))).then(()=>fetch('./styles.css',{cache:'reload'})).then(()=>fetch('./sw.js',{cache:'reload'}))`

Anders draaien de tests op oude code.

## Self-review-bevindingen (verwerkt)

- `.of-r:first-of-type` zou met de nieuwe wrapper élke rij raken → opgelost via `.of-rij-wrap`-borders (Task 9).
- Invoerveld kreeg bewust géén `data-action` (anders vuurt click-delegatie bij focus) → toevoegen loopt via de Enter-keydown (Task 8).
- `r._offertesManual`-guard borgt idempotente verrijking + correcte terugval naar handmatige D-waarde (Task 3).
- Bron van waarheid is uitsluitend de rauwe `r.aannemers`-string; alle acties muteren die en laten de verrijking afleiden (geen tweede afleid-pad).
