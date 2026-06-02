# Auto-prioriteit & deadline-workflow — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vervang de handmatige Prioriteit-selectie in het Collectief Dashboard door een automatische, deadline-gedreven berekening per categorie, met visuele markering van verstreken deadlines en een 'stille taken'-detector.

**Architecture:** Frontend in `index.html` berekent prioriteit live bij rendering/sortering/filter (pure functie). Apps Script trigger (`cd_recalcPrioriteiten`) draait dagelijks om 06:00 en schrijft de berekende waarde terug naar de "Nog Te Doen"-sheet voor traceerbaarheid en externe rapportage. Logica staat op twee plekken (JS + GAS) als korte config-tabel, zodat onderhoud één-edit-per-bestand blijft.

**Tech Stack:** Vanilla JS in `index.html` (single-file PWA), Google Apps Script (`AppsScript.gs`), Google Sheets als backend. Geen build-stap, geen test-framework — tests via `?test=1`-querystring met `console.assert`.

**Spec:** `docs/superpowers/specs/2026-06-02-auto-prioriteit-design.md`

**Implementation note over scope:** De Prioriteit-kolom bestaat in de Sheet alleen voor de OPPAKKEN-sectie (kolom F, index 5). De andere 3 secties (VERGADERVERZOEKEN, OFFERTE-TRAJECTEN, LOD) hebben momenteel geen Prioriteit-kolom. Voor deze iteratie geldt:
- **Frontend toont prioriteit voor alle 4 categorieën** (live berekend bij render).
- **Apps Script-writeback raakt alleen OPPAKKEN aan** (bestaande kolom).
- Een aparte Sheet-uitbreiding om Prioriteit-kolommen toe te voegen aan VERG/OFF/LOD is een mogelijke vervolgstap — niet in dit plan.

---

## File Structure

**Te wijzigen:**
- `/Users/servicedesk/collectief-dashboard/index.html` — frontend (config-blok, pure functies, render, sortering, filter, modal, CSS).
- `/Users/servicedesk/collectief-dashboard/AppsScript.gs` — backend (config-blok, recalc-functie, trigger-registratie).

**Te maken:** geen nieuwe bestanden.

**Verantwoordelijkheid per bestand:**
- `index.html`: alle UI-presentatie en client-side berekeningen.
- `AppsScript.gs`: dagelijkse Sheet-synchronisatie en logging.

---

## Task 1: Core berekenPrioriteit-functie + test-harness

**Files:**
- Modify: `index.html` — voeg config-blok en functies toe vlak boven `function prioBadge` (rond regel 2642).
- Modify: `index.html` — voeg test-harness toe aan einde van laatste `<script>` blok.

**Wat we doen:** Een pure functie `berekenPrioriteit(deadline, categorie, vandaag)` die `{prioriteit, dagenTot, teLaat}` teruggeeft. Plus 15 console.assert-tests die draaien als `?test=1` in de URL staat.

- [ ] **Step 1.1: Voeg config-blok + pure functies toe**

Voeg toe in `index.html` net boven `function prioBadge(v){` (rond regel 2642):

```javascript
// ══════════════════════════════════════
//  AUTO-PRIORITEIT (zie docs/superpowers/specs/2026-06-02-auto-prioriteit-design.md)
// ══════════════════════════════════════
const PRIO_REGELS = {
  'OPPAKKEN':          { hoog:  7, midden:  14 },
  'VERGADERVERZOEKEN': { hoog: 14, midden:  21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden:  42 },
  'LOD':               { hoog: 90, midden: 240 },
};
const STIL_DREMPEL_DAGEN = 14;

function _vandaagAmsterdam(){
  // Lokale datum (Europe/Amsterdam = browser-locale van de gebruiker), tijd op 00:00
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}

function _verschilInKalenderdagen(deadline, vandaag){
  if (!(deadline instanceof Date) || isNaN(deadline)) return null;
  const d = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const v = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate());
  return Math.round((d - v) / 86400000);
}

function berekenPrioriteit(deadlineStr, categorie, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  if (!deadlineStr) return { prioriteit: '', dagenTot: null, teLaat: false };
  const deadline = _parseAnyDate(deadlineStr);
  if (!deadline) return { prioriteit: '', dagenTot: null, teLaat: false };
  const dagenTot = _verschilInKalenderdagen(deadline, vandaag);
  const teLaat = dagenTot < 0;
  const regels = PRIO_REGELS[categorie];
  if (!regels) return { prioriteit: '', dagenTot, teLaat };
  let prioriteit;
  if (dagenTot <= regels.hoog) prioriteit = 'Hoog';
  else if (dagenTot <= regels.midden) prioriteit = 'Midden';
  else prioriteit = 'Laag';
  return { prioriteit, dagenTot, teLaat };
}
```

- [ ] **Step 1.2: Voeg test-harness toe**

Plak helemaal onderaan in het laatste `<script>`-blok (vóór de closing `</script>`-tag van het hoofdscript):

```javascript
// ══════════════════════════════════════
//  TESTS (alleen actief met ?test=1)
// ══════════════════════════════════════
if (location.search.includes('test=1')) {
  console.log('%c[TESTS] Auto-prioriteit', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
  const T = new Date(2026, 5, 2); // 2 juni 2026
  const fmt = d => `${d.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]} ${d.getFullYear()}`;
  const plus = n => fmt(new Date(T.getFullYear(), T.getMonth(), T.getDate() + n));

  const cases = [
    // [deadline-offset-dagen, categorie, verwachte prio, verwacht teLaat]
    [  7, 'OPPAKKEN',          'Hoog',   false],
    [  8, 'OPPAKKEN',          'Midden', false],
    [ 14, 'OPPAKKEN',          'Midden', false],
    [ 15, 'OPPAKKEN',          'Laag',   false],
    [ 14, 'VERGADERVERZOEKEN', 'Hoog',   false],
    [ 15, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 21, 'VERGADERVERZOEKEN', 'Midden', false],
    [ 22, 'VERGADERVERZOEKEN', 'Laag',   false],
    [ 21, 'OFFERTE-TRAJECTEN', 'Hoog',   false],
    [ 42, 'OFFERTE-TRAJECTEN', 'Midden', false],
    [ 43, 'OFFERTE-TRAJECTEN', 'Laag',   false],
    [ 90, 'LOD',               'Hoog',   false],
    [240, 'LOD',               'Midden', false],
    [241, 'LOD',               'Laag',   false],
    [ -3, 'OPPAKKEN',          'Hoog',   true ], // verstreken = Hoog + teLaat
    [  0, 'OPPAKKEN',          'Hoog',   false], // vandaag = nog niet te laat
  ];
  let ok = 0, fail = 0;
  cases.forEach(([off, cat, prio, teLaat]) => {
    const got = berekenPrioriteit(plus(off), cat, T);
    const pass = got.prioriteit === prio && got.teLaat === teLaat;
    if (pass) ok++; else { fail++; console.error(`FAIL: ${cat} +${off}d → expected ${prio}/teLaat=${teLaat}, got ${got.prioriteit}/teLaat=${got.teLaat}`); }
  });
  // Edge: lege deadline
  const leeg = berekenPrioriteit('', 'OPPAKKEN', T);
  if (leeg.prioriteit === '' && leeg.teLaat === false) ok++; else { fail++; console.error('FAIL: lege deadline →', leeg); }

  console.log(`%c[TESTS] ${ok} OK, ${fail} FAIL`, fail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
}
```

- [ ] **Step 1.3: Verifieer tests via preview**

```
preview_start (index.html)
preview_eval: location.href = location.href.split('?')[0] + '?test=1'
preview_console_logs
```

Expected: console toont "[TESTS] 15 OK, 0 FAIL".

- [ ] **Step 1.4: Commit**

```bash
git add index.html
git commit -m "feat(prio): voeg berekenPrioriteit-functie + tests toe

Pure functie die op basis van deadline + categorie de prioriteit
bepaalt (Hoog/Midden/Laag) en signaleert of de deadline verstreken
is. Tests draaien via ?test=1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Render prioriteit live in tabel + filter voor alle 4 secties

**Files:**
- Modify: `index.html` — `function prioBadge` (rond regel 2642).
- Modify: `index.html` — `function rowNtd` (rond regel 2173) — voeg prio-kolom toe aan VERG/OFF/LOD.
- Modify: `index.html` — `const SECS = {…}` definitie (gebruik `grep -n "SKEYS\|^const SECS" index.html` om exacte regel te vinden) — voeg 'Prio' toe aan cols voor VERG/OFF/LOD.
- Modify: `index.html` — `function filterNtd` (rond regel 1429) — pas prio-filter toe op alle 4 secties.

**Wat we doen:** De prio-badge baseren op de berekende waarde i.p.v. `r.prioriteit`. Prioriteit-kolom toevoegen aan de andere 3 tabs. Filter laten werken voor alle 4 secties.

- [ ] **Step 2.1: Pas prioBadge aan om object te accepteren**

Vervang het bestaande `function prioBadge` (regels 2642-2647):

```javascript
function prioBadge(r, sec){
  // Backwards-compat: oude calls met alleen string blijven werken via fallback
  let prio, dagenTot, teLaat;
  if (typeof r === 'string') { prio = r; dagenTot = null; teLaat = false; }
  else {
    const res = berekenPrioriteit(r.deadline, sec);
    prio = res.prioriteit; dagenTot = res.dagenTot; teLaat = res.teLaat;
  }
  if (!prio) return '';
  const cls = { Hoog:'prio-hoog', Midden:'prio-mid', Laag:'prio-laag' }[prio] || 'prio-mid';
  const ico = { Hoog:'↑', Midden:'→', Laag:'↓' }[prio] || '';
  return `<span class="badge ${cls}">${ico} ${esc(prio)}</span>`;
}
```

- [ ] **Step 2.2: Voeg Prio-kolom toe aan SECS-definitie voor VERG/OFF/LOD**

Zoek het `SECS`-object in `index.html` (zoek met grep: `grep -n "OPPAKKEN.*label\|VERGADERVERZOEKEN.*label" index.html`). Voor elke sectie dat een `cols` en `keys` array heeft, voeg `'Prio'` toe aan `cols` net vóór `'Opmerkingen'` (en niets toevoegen aan `keys` — de prio is berekend, niet gelezen).

**Belangrijk:** dit verandert de kolomvolgorde — Task 2.3 past de rij-render dienovereenkomstig aan.

- [ ] **Step 2.3: Voeg prio-cel toe aan VERG/OFF/LOD in rowNtd**

In `rowNtd` (regel 2173), pas aan:

`case'OPPAKKEN'` — vervang `<td>${prioBadge(r.prioriteit)}</td>` door `<td>${prioBadge(r, 'OPPAKKEN')}</td>`.

`case'VERGADERVERZOEKEN'` — voeg vlak vóór de opmerkingen-cel toe: `<td>${prioBadge(r, 'VERGADERVERZOEKEN')}</td>`.

`case'OFFERTE-TRAJECTEN'` — idem: `<td>${prioBadge(r, 'OFFERTE-TRAJECTEN')}</td>` vlak vóór opmerkingen.

`case'LOD'` — idem: `<td>${prioBadge(r, 'LOD')}</td>` vlak vóór opmerkingen.

- [ ] **Step 2.4: Update filterNtd om prio op alle 4 secties te filteren**

Vervang in `function filterNtd` (rond regel 1434) de regel:

```javascript
if(prio&&sec==='OPPAKKEN'&&r.prioriteit!==prio) return false;
```

Door:

```javascript
if(prio){
  const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
  if (berekend !== prio) return false;
}
```

- [ ] **Step 2.5: Verifieer via preview**

```
preview_start (index.html zonder ?test=1)
preview_snapshot
```

Expected: alle 4 tabs tonen Prio-kolom met badges; filter op "Hoog/Midden/Laag" werkt op alle 4 tabs.

- [ ] **Step 2.6: Commit**

```bash
git add index.html
git commit -m "feat(prio): toon berekende prioriteit voor alle 4 secties + filter

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 'Te laat'- en 'Geen deadline'-visuele markering

**Files:**
- Modify: `index.html` — `<style>`-blok (voeg CSS toe).
- Modify: `index.html` — `function rowNtd` (regel 2173).

- [ ] **Step 3.1: Voeg CSS toe aan het `<style>`-blok**

Zoek naar de regel `.prio-hoog` in de bestaande CSS (`grep -n "prio-hoog\|prio-mid" index.html`). Voeg vlak na de prio-classes toe:

```css
.row-telaat td {
  background: rgba(220, 38, 38, 0.06);
  position: relative;
}
.row-telaat td:first-child {
  box-shadow: inset 3px 0 0 #dc2626;
}
.pill-telaat {
  display: inline-block;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  margin-left: 6px;
  letter-spacing: .02em;
}
.warn-geen-deadline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #d97706;
  font-size: 12px;
  font-weight: 600;
}
.warn-geen-deadline::before { content: '⚠'; }
.pill-stil {
  display: inline-block;
  background: rgba(107, 114, 128, 0.15);
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  margin-left: 6px;
  cursor: pointer;
}
.pill-stil::before { content: '🔕 '; }
```

- [ ] **Step 3.2: Voeg helper toe boven rowNtd**

Voeg toe net boven `function rowNtd(r,sec){`:

```javascript
function deadlineCel(r, sec){
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  const pill = teLaat ? ` <span class="pill-telaat">Te laat (${Math.abs(dagenTot)}d)</span>` : '';
  return `<td class="cell-sm">${esc(r.deadline)}${pill}</td>`;
}
```

- [ ] **Step 3.3: Gebruik deadlineCel in alle 4 rij-renders + voeg row-class toe**

In `rowNtd`, vervang per sectie de deadline-`<td>` door `${deadlineCel(r, '<SEC>')}`. Concreet:

`case'OPPAKKEN'`: vervang `<td class="cell-sm">${r.deadline?esc(r.deadline):'<span style="color:var(--fnt)">–</span>'}</td>` door `${deadlineCel(r, 'OPPAKKEN')}`.

`case'VERGADERVERZOEKEN'`: idem met `'VERGADERVERZOEKEN'`.

`case'OFFERTE-TRAJECTEN'`: idem met `'OFFERTE-TRAJECTEN'`.

`case'LOD'`: idem met `'LOD'`.

Pas ook de return-regel aan (regel 2223):

```javascript
const { teLaat: rowTeLaat } = berekenPrioriteit(r.deadline, sec);
const rowCls = [
  r.inBehandeling === 'TRUE' ? 'ib-row' : '',
  rowTeLaat ? 'row-telaat' : ''
].filter(Boolean).join(' ');
return `<tr class="${rowCls}">${cells}</tr>`;
```

(Vervang de oude single-line `return\`<tr class="${r.inBehandeling==='TRUE'?'ib-row':''}">${cells}</tr>\`;`.)

- [ ] **Step 3.4: Verifieer via preview**

Maak via de Sheet een test-taak aan met deadline gisteren (of pas tijdelijk een bestaande taak aan), en een taak zonder deadline.

```
preview_start
preview_snapshot
preview_screenshot
```

Expected: rij met verstreken deadline kleurt licht-rood met rode linkerband en rode "Te laat (1d)"-pill; rij zonder deadline toont oranje "⚠ Geen deadline".

- [ ] **Step 3.5: Commit**

```bash
git add index.html
git commit -m "feat(prio): voeg Te laat- en Geen-deadline-markering toe

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Sortering — Te laat → prio → deadline → code

**Files:**
- Modify: `index.html` — `function filterNtd` sort-callback (rond regel 1436).

- [ ] **Step 4.1: Vervang de sort-callback in filterNtd**

Vervang het volledige `.sort(...)`-blok (regels 1436-1444):

```javascript
.sort((a,b)=>{
  const ibA = a.inBehandeling==='TRUE'?1:0, ibB = b.inBehandeling==='TRUE'?1:0;
  if (ibA !== ibB) return ibA - ibB;
  const pa = berekenPrioriteit(a.deadline, sec);
  const pb = berekenPrioriteit(b.deadline, sec);
  // 1. Te laat altijd bovenaan
  if (pa.teLaat !== pb.teLaat) return pa.teLaat ? -1 : 1;
  // 2. Prioriteit-rang
  const rang = { 'Hoog':0, 'Midden':1, 'Laag':2, '':3 };
  if (rang[pa.prioriteit] !== rang[pb.prioriteit]) return rang[pa.prioriteit] - rang[pb.prioriteit];
  // 3. Deadline oplopend (vroegste eerst)
  const dA = parseDt(a.deadline), dB = parseDt(b.deadline);
  if (dA && dB && dA.getTime() !== dB.getTime()) return dA - dB;
  if (dA && !dB) return -1;
  if (dB && !dA) return 1;
  // 4. VvE-code alfabetisch
  return (a.code || '').localeCompare(b.code || '');
});
```

- [ ] **Step 4.2: Verifieer sortering via preview**

```
preview_start
preview_snapshot
```

Expected per tab: te-late taken bovenaan, daarna Hoog (eerste deadline eerst), Midden, Laag, lege deadline onderaan. In-behandeling-taken (toggle aan) onderaan zoals voorheen.

- [ ] **Step 4.3: Commit**

```bash
git add index.html
git commit -m "feat(prio): sorteer op Te laat > prio > deadline > code

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Verwijder handmatig Prioriteit-veld uit bewerkscherm

**Files:**
- Modify: `index.html` — modal HTML (rond regel 794-799 — Prioriteit-veld in OPPAKKEN form-group).
- Modify: `index.html` — `function fillModalFields` (rond regel 2303).
- Modify: `index.html` — `function submitTask` (rond regel 2519).

- [ ] **Step 5.1: Verwijder Prioriteit-veld uit modal-HTML**

Zoek regels 794-799 (de OPPAKKEN-formgroup). Vervang dit blok:

```html
<div class="fld-row">
  <div class="fld"><label>Prioriteit</label>
    <select id="m-prio"><option value="">Selecteer…</option><option>Hoog</option><option>Midden</option><option>Laag</option></select>
  </div>
  <div class="fld"><label>Opmerkingen</label><input type="text" id="m-opm"/></div>
</div>
```

Door (Opmerkingen op volle breedte, géén Prioriteit-veld):

```html
<div class="fld-row">
  <div class="fld" style="flex:1"><label>Opmerkingen</label><input type="text" id="m-opm"/></div>
</div>
```

- [ ] **Step 5.2: Verwijder m-prio uit fillModalFields**

In `function fillModalFields`, OPPAKKEN-case (rond regel 2303), vervang:

```javascript
setv('m-prio',r.prioriteit);setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
```

Door:

```javascript
setv('m-opm',r.opmerkingen);setv('m-sub-opp',r.subcategorie);
```

- [ ] **Step 5.3: Bereken prioriteit in submitTask i.p.v. uit veld lezen**

In `submitTask` (regel 2519), vervang voor OPPAKKEN-case:

```javascript
case'OPPAKKEN':
  values=[code,naam,gv('m-actie'),toDutchDate(gv('m-dl')),gv('m-beh'),gv('m-prio'),gv('m-opm'),
    document.getElementById('tog-ib').classList.contains('on'),'',sub];break;
```

Door:

```javascript
case'OPPAKKEN':{
  const _berekend = berekenPrioriteit(toDutchDate(gv('m-dl')), 'OPPAKKEN').prioriteit;
  values=[code,naam,gv('m-actie'),toDutchDate(gv('m-dl')),gv('m-beh'),_berekend,gv('m-opm'),
    document.getElementById('tog-ib').classList.contains('on'),'',sub];break;}
```

- [ ] **Step 5.4: Verifieer via preview**

```
preview_start
preview_click op een edit-knop
preview_snapshot
```

Expected: bewerkscherm toont géén Prioriteit-veld meer. Bij Opslaan wordt de berekende prio in de Sheet weggeschreven (verifieer door Google Sheet handmatig te openen).

- [ ] **Step 5.5: Commit**

```bash
git add index.html
git commit -m "feat(prio): verwijder handmatig Prioriteit-veld uit bewerkscherm

Bij Opslaan wordt de berekende prioriteit automatisch in de
Sheet geschreven. Veld zat alleen in de OPPAKKEN-form (andere
secties hadden het nooit).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: 'Stille' taken-detector

**Files:**
- Modify: `index.html` — voeg `bepaalStil()` helper toe boven `rowNtd`.
- Modify: `index.html` — `function rowNtd` — voeg Stil-pill toe aan elke sectie.

- [ ] **Step 6.1: Voeg bepaalStil helper toe**

Voeg toe net boven `function deadlineCel` (uit Task 3):

```javascript
function bepaalStil(r, vandaag){
  if (r.inBehandeling !== 'TRUE') return null;
  vandaag = vandaag || _vandaagAmsterdam();
  // Laatste activiteit: maximum van geschiedenis-laatste-datum en bewerkt-op
  const dates = [];
  if (Array.isArray(r.geschiedenis)) {
    r.geschiedenis.forEach(g => {
      const d = _parseAnyDate(g.datum || g.date || '');
      if (d) dates.push(d);
    });
  }
  const bew = _parseAnyDate(r.bewerktOp || r.bewerkt || '');
  if (bew) dates.push(bew);
  if (!dates.length) return null; // geen activiteit-data → niet markeren
  const laatst = new Date(Math.max(...dates.map(d => d.getTime())));
  const dagen = _verschilInKalenderdagen(vandaag, laatst); // omgekeerd: vandaag - laatst
  if (dagen >= STIL_DREMPEL_DAGEN) return dagen;
  return null;
}
```

**Noot voor implementer:** controleer met `grep -n "geschiedenis\|bewerktOp\|bewerkt op\|bewerkt_op" index.html` welke veldnamen daadwerkelijk op `r` staan. Pas de helper aan zodat hij die exacte namen leest. Als geen van beide bestaat, gebruik alleen de aanmaakdatum (`r.aangemaakt` / `r.created` — zoek ook hierop).

- [ ] **Step 6.2: Voeg stil-pill toe aan elke rowNtd-case**

In `rowNtd`, voeg vlak boven het `switch(sec)`-statement toe:

```javascript
const stilDagen = bepaalStil(r);
const stilPill = stilDagen !== null
  ? `<span class="pill-stil" onclick="event.stopPropagation(); editRow(${rid})" title="Geen activiteit in ${stilDagen} dagen">Stil ${stilDagen}d</span>`
  : '';
```

Voeg in elke `case`-cells-template `${stilPill}` toe aan de actie-tekst-cel:

- OPPAKKEN: vervang `<td class="cell-txt">${esc(r.actiepunt)}</td>` door `<td class="cell-txt">${esc(r.actiepunt)}${stilPill}</td>`.
- VERGADERVERZOEKEN: `<td class="cell-txt">${esc(r.agendapunten||r.actiepunt||'')}${stilPill}</td>`.
- OFFERTE-TRAJECTEN: er is geen actie-tekst-cel; voeg toe aan de opmerkingen-cel: `<td class="cell-txt">${r.opmerkingen?\`<span style="font-size:12px">${esc(r.opmerkingen)}</span>\`:''}${stilPill}</td>`.
- LOD: `<td class="cell-txt">${esc(r.actiepunt||'')}${stilPill}</td>`.

- [ ] **Step 6.3: Verifieer via preview**

Maak handmatig een taak die "In behandeling" staat en waarvan de laatste geschiedenis-entry >14 dagen oud is (of pas de drempel tijdelijk aan naar 1 dag voor de test).

```
preview_start
preview_snapshot
```

Expected: betreffende rij toont grijze "🔕 Stil Xd"-pill achter de actie-tekst.

- [ ] **Step 6.4: Commit**

```bash
git add index.html
git commit -m "feat(prio): voeg stille-taken-detector toe (>14d geen activiteit)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Apps Script dagelijkse writeback

**Files:**
- Modify: `AppsScript.gs` — voeg config-blok + functie + trigger toe.

- [ ] **Step 7.1: Voeg config-blok toe bovenaan AppsScript.gs**

Voeg toe net onder `const DEADLINE_TOLERANCE_HOURS = 1;` (regel 24):

```javascript
// ════════════════════════════════════════════════════════════
//  AUTO-PRIORITEIT CONFIG (zie spec 2026-06-02-auto-prioriteit)
// ════════════════════════════════════════════════════════════
const CD_PRIO_REGELS = {
  'OPPAKKEN':          { hoog:  7, midden:  14 },
  'VERGADERVERZOEKEN': { hoog: 14, midden:  21 },
  'OFFERTE-TRAJECTEN': { hoog: 21, midden:  42 },
  'LOD':               { hoog: 90, midden: 240 },
};
// Voor deze iteratie schrijven we alleen weg voor OPPAKKEN (kolom F).
// Andere secties hebben (nog) geen Prioriteit-kolom in de Sheet.
const CD_PRIO_WRITEBACK = { 'OPPAKKEN': 5 }; // 0-indexed kolompositie
```

- [ ] **Step 7.2: Voeg cd_recalcPrioriteiten functie toe**

Voeg toe net boven `// HELPERS`-comment (rond regel 269):

```javascript
// ════════════════════════════════════════════════════════════
//  TRIGGER 4: dagelijkse auto-prioriteit herberekening (06:00)
// ════════════════════════════════════════════════════════════
function cd_recalcPrioriteiten() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0,0,0,0);
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  const DEADLINE_COL = { 'OPPAKKEN': 3, 'VERGADERVERZOEKEN': 5, 'OFFERTE-TRAJECTEN': 5, 'LOD': 5 };

  let curSec = null;
  const updates = { OPPAKKEN: 0, VERGADERVERZOEKEN: 0, 'OFFERTE-TRAJECTEN': 0, LOD: 0 };

  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;
    // Alleen secties met een writeback-kolom
    if (!(curSec in CD_PRIO_WRITEBACK)) continue;

    const dlVal = data[i][DEADLINE_COL[curSec]];
    const prioCol = CD_PRIO_WRITEBACK[curSec];
    const huidig = (data[i][prioCol] || '').toString().trim();
    const nieuwe = cd_berekenPrioriteit(dlVal, curSec, today);

    if (nieuwe !== huidig) {
      // 1-indexed row & column voor setValue
      sheet.getRange(i + 1, prioCol + 1).setValue(nieuwe);
      updates[curSec]++;
    }
  }

  const totaal = Object.values(updates).reduce((a,b) => a+b, 0);
  Logger.log('cd_recalcPrioriteiten: ' + totaal + ' updates ' + JSON.stringify(updates));
  cd_logToLogboek('Auto-prioriteit', 'Bijgewerkt: ' + Object.keys(updates).map(k => k + '=' + updates[k]).join(', '));
}

function cd_berekenPrioriteit(dlVal, sec, today) {
  if (!dlVal) return '';
  const dl = cd_parseDate(dlVal);
  if (!dl) return '';
  const dlDate = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate());
  const dagenTot = Math.round((dlDate - today) / 86400000);
  const r = CD_PRIO_REGELS[sec];
  if (!r) return '';
  if (dagenTot <= r.hoog) return 'Hoog';
  if (dagenTot <= r.midden) return 'Midden';
  return 'Laag';
}

function cd_logToLogboek(actie, detail) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName('Logboek');
    if (!sheet) return;
    const ts = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd HH:mm');
    sheet.appendRow([ts, 'systeem', actie, '', '', '', detail]);
  } catch (err) {
    Logger.log('cd_logToLogboek error: ' + err);
  }
}
```

**Noot voor implementer:** `cd_parseDate` bestaat al in `AppsScript.gs`. Verifieer met `grep -n "function cd_parseDate" AppsScript.gs`. Pas de `cd_logToLogboek` kolom-volgorde aan op de bestaande Logboek-kolomvolgorde (`grep -n "Logboek" AppsScript.gs` om bestaande appendRow-calls te vinden). Als er geen bestaande Logboek-conventie is, behoud de bovenstaande versie.

- [ ] **Step 7.3: Voeg trigger toe aan setup**

In `setupNotificationTriggers` (regel 36-54), voeg toe na de bestaande `cd_dailySummary`-trigger (regel 51):

```javascript
  // Dagelijks om 06:00: auto-prioriteit herberekening
  ScriptApp.newTrigger('cd_recalcPrioriteiten').timeBased().atHour(6).everyDays(1).create();
```

Pas ook `CD_TRIGGER_FUNCS` (regel 29) aan:

```javascript
const CD_TRIGGER_FUNCS = ['cd_onEditChange', 'cd_checkDeadlines', 'cd_dailySummary', 'cd_recalcPrioriteiten'];
```

Update de UI-alert string in `setupNotificationTriggers` (regel 53) om de nieuwe trigger te noemen:

```javascript
  SpreadsheetApp.getUi().alert('✓ Notificatie-triggers ingesteld!\n\n• cd_onEditChange (nieuwe taken / wijzigingen)\n• cd_checkDeadlines (elk uur)\n• cd_dailySummary (dagelijks 08:30)\n• cd_recalcPrioriteiten (dagelijks 06:00)\n\nJe bestaande triggers zijn ongemoeid gebleven.');
```

- [ ] **Step 7.4: Handmatige test in Apps Script editor**

1. Kopieer de gewijzigde `AppsScript.gs` inhoud naar de Apps Script editor (gehost in de spreadsheet, projectnaam "Afgerond script").
2. Selecteer functie `cd_recalcPrioriteiten` in de dropdown.
3. Druk op Run.

Expected: geen errors in execution log. Het Logger.log toont aantal updates per sectie. Open de Sheet en verifieer dat de Prioriteit-kolom (F) in OPPAKKEN-sectie nu de berekende waarden bevat. Open de Logboek-sheet — er is een regel "Auto-prioriteit | Bijgewerkt: …".

4. Run nogmaals. Expected: 0 updates (idempotent).

- [ ] **Step 7.5: Trigger registreren**

Run `setupNotificationTriggers` (handmatig in Apps Script editor). Bevestig in de Triggers-pagina van Apps Script dat er nu een dagelijkse 06:00-trigger voor `cd_recalcPrioriteiten` staat.

- [ ] **Step 7.6: Commit**

```bash
git add AppsScript.gs
git commit -m "feat(prio): dagelijkse Apps Script writeback van auto-prioriteit

Nieuwe trigger cd_recalcPrioriteiten draait dagelijks 06:00.
Voor deze iteratie alleen OPPAKKEN (enige sectie met Prioriteit-
kolom in de Sheet). Idempotent: 2e run zelfde dag = 0 wijzigingen.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Migratie + eindverificatie

- [ ] **Step 8.1: Eenmalige migratie**

In de Apps Script editor: run `cd_recalcPrioriteiten` nogmaals. Alle bestaande OPPAKKEN-prio-waarden worden nu overschreven met berekende waarden. Verifieer in de Sheet.

- [ ] **Step 8.2: End-to-end verificatie via Preview**

```
preview_start (index.html, productie-versie zonder ?test=1)
```

Doorloop deze checklist en maak een screenshot van het eindresultaat:

1. Tab Oppakken: prio-badges zichtbaar, sortering klopt (Te laat → Hoog → Midden → Laag → leeg), sortering binnen prio op vroegste deadline.
2. Tab Vergaderverzoeken: prio-kolom zichtbaar, filter Hoog/Midden/Laag werkt.
3. Tab Offerte-trajecten: idem.
4. Tab LOD: idem.
5. Maak nieuwe taak aan in elke tab — Prioriteit-veld is niet meer aanwezig in modal.
6. Een taak met deadline <vandaag: rij rood, "Te laat (Xd)"-pill zichtbaar.
7. Een taak zonder deadline: "⚠ Geen deadline"-indicator in deadline-kolom.
8. Een taak >14d in behandeling zonder activiteit: "🔕 Stil Xd"-pill.

- [ ] **Step 8.3: Push naar GitHub**

```bash
git push origin main
```

(De gebruiker heeft auto-deploy via GitHub Pages; binnen ~1 min is de PWA live op vvebeheercollectief.github.io/Collectief-Dashboard/.)

- [ ] **Step 8.4: Test in productie**

Open productie-URL in browser, log in, verifieer steekproefsgewijs dat:
- Sortering en prio-badges kloppen.
- De-laat-markering werkt op een echte verstreken taak.
- Tijdens login / na refresh: dezelfde resultaten.

---

## Spec coverage check

| Spec-sectie | Geïmplementeerd in |
|---|---|
| Pure `berekenPrioriteit` | Task 1 |
| 4 categorieën, juiste grenzen | Task 1 (config + tests) |
| LOD: ≤90d=Hoog, ≤240d=Midden | Task 1 |
| Live in dashboard | Tasks 2, 4 |
| Prio-filter werkt op alle 4 | Task 2.4 |
| Geen-deadline waarschuwing | Task 3 |
| Verstreken: rij rood + Te laat-pill | Task 3 |
| Sortering Te laat→prio→deadline→code | Task 4 |
| Handmatig veld verwijderd | Task 5 |
| Stille taken-detector | Task 6 |
| Apps Script dagelijkse writeback | Task 7 |
| Logboek-entry bij recalc | Task 7.2 |
| Idempotent (2e run = 0 updates) | Task 7.4 |
| Migratie eenmalig | Task 8.1 |
| Visuele eindverificatie | Task 8.2 |
