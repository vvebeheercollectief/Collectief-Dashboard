# Fase 4 — Opvolging & herhaling: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opvolgdatums (wegleggen), herhaalregels, twee-traps escalatie van stille dossiers en een verrijkte 08:30-digest, conform de goedgekeurde spec `docs/superpowers/specs/2026-06-11-fase4-opvolging-herhaling-design.md`.

**Architecture:** Frontend (ES-modules in `src/`, geen bundler) leest/schrijft de nieuwe kolommen L/M/N in "Nog Te Doen" en een nieuw tabblad "Herhaalregels" rechtstreeks via de Sheets-API (OAuth). Eén dagelijkse Apps Script-motor (`cd_opvolgingMotor`, ±06:30, nieuw bestand `apps-script/Opvolging.gs`) is de enige die taken klaarzet, escaleert en wakker-pushes stuurt. De bestaande `cd_dailySummary` (08:30) wordt verrijkt.

**Tech Stack:** Vanilla ES-modules, Google Sheets API v4, Google Apps Script, OneSignal (via bestaande helpers), eigen testsuite via `?test=1`.

**Werkwijze:** Alles op branch `staging` (al uitgecheckt). Elke push → Vercel-staging + clasp-push naar het TEST-script (CI). Lokaal verifiëren: `python3 -m http.server 8000` in de repo-root en `http://localhost:8000/index.html?test=1` openen (localhost = testomgeving, veilig). Pas na GO van de gebruiker → merge naar `main`.

**Geverifieerde feiten (niet opnieuw uitzoeken):**
- Echte kolomindeling "Nog Te Doen" (alle 4 secties): taakvelden in A–H (0-geteld 0–7; OFFERTE gebruikt 0–6), I = legacy "Afgerond"-kolom, J = subcategorie (door `submitTask` geschreven), K = ongebruikt (maar `parseSections` mapt hem op `subcategorie`; NIET aankomen). **Nieuw: L (11) = Opvolgdatum, M (12) = Herhaal-ID, N (13) = Esc-stempel.** 1-geteld in Apps Script: L=12, M=13, N=14.
- `parseSections` (src/data.js:95) leest per rij `keys` (0..7), daarna `afOff = max(keys.length,8)` → datum=8, opmerking=9, subcategorie=10.
- Sortering zit in `filterNtd` (src/render-lijsten.js:115), groepering (in-behandeling onderaan) in `renderTbody` (src/render-lijsten.js:302), de stil-pil in `bepaalStil` (src/render-lijsten.js:318).
- Datums in Sheets als string `dd-mm-yyyy` schrijven; `_parseAnyDate` (frontend) en `cd_parseDate` (Apps Script) lezen dat. Sheets geeft soms NL-long-dates terug; beide parsers kunnen dat aan (cd_parseDate valt terug op `new Date(s)`).
- Maandagbriefing leest A1:K95 → kolommen L+ zijn veilig.
- Schrijfacties in de frontend altijd: optimistische mutatie → `renderAll()` → `backgroundWrite(writeFn, rollback, foutTitel)`.

---

## Bestandsoverzicht

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `src/util.js` | wijzig | pure helpers: `STIL_ESCALATIE_REGELS`, `opvolgStatus`, `volgendeDeadline` |
| `src/data.js` | wijzig | L/M/N parsen, `parseHerhaal`, Herhaalregels mee-laden |
| `src/state.js` | wijzig | `D.herhaal`, `state._snoozeRow`, `state.herhaalEditRow` |
| `src/render-lijsten.js` | wijzig | sortering, Weggelegd-groep, pillen, snooze-knop, bepaalStil |
| `src/snooze.js` | **nieuw** | wegleggen-modal + opvolgdatum schrijven |
| `src/render-herhaal.js` | **nieuw** | Herhaalregels-pagina + CRUD |
| `src/actions.js`, `src/main.js`, `src/ui.js`, `src/config.js` | wijzig | acties, bindings, route, PAGE_META |
| `src/crud.js` | wijzig | herhaalId mee naar Afgerond; undo-data verbreed |
| `src/tests.js` | wijzig | nieuwe asserts |
| `index.html`, `styles.css` | wijzig | nav, pagina, 2 modals, pill-/groep-CSS |
| `apps-script/Opvolging.gs` | **nieuw** | dagelijkse motor + setup + trigger-installer |
| `apps-script/Notifications.gs` | wijzig | `cd_createTaskRow` (extra param), `cd_dailySummary` (verrijkt) |

---

### Task 1: Pure helpers + tests (util.js)

**Files:**
- Modify: `src/util.js`
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

In `src/tests.js`: breid de import uit util.js uit met de nieuwe helpers:

```js
import { berekenPrioriteit, _parseAnyDate, displayName, opvolgStatus, volgendeDeadline, STIL_ESCALATIE_REGELS } from "./util.js";
```

Voeg vóór de slotregels (`const totOk = ...`) toe:

```js
  // ── volgendeDeadline ── (herhaalregels; maandgrens-clamp)
  eq('vd maand',            volgendeDeadline('15-01-2026','maand'),            '15-02-2026');
  eq('vd maandgrens 31jan', volgendeDeadline('31-01-2026','maand'),            '28-02-2026');
  eq('vd kwartaal clamp',   volgendeDeadline('30-11-2026','kwartaal'),         '28-02-2027');
  eq('vd jaar schrikkel',   volgendeDeadline('29-02-2028','jaar'),             '28-02-2029');
  eq('vd week',             volgendeDeadline('28-02-2026','week'),             '07-03-2026');
  eq('vd na-afronden 6m',   volgendeDeadline('15-06-2026','na-afronden',6),    '15-12-2026');
  eq('vd onbekend type',    volgendeDeadline('15-06-2026','dagelijks'),        '');
  eq('vd lege datum',       volgendeDeadline('','maand'),                      '');

  // ── opvolgStatus ── (weggelegd vs. opvolgen-vandaag)
  const TV = new Date(2026, 5, 11); // 11 juni 2026
  eq('opvolg leeg',     opvolgStatus({opvolgdatum:''}, TV),           {weggelegd:false, vandaag:false});
  eq('opvolg toekomst', opvolgStatus({opvolgdatum:'16-06-2026'}, TV), {weggelegd:true,  vandaag:false});
  eq('opvolg vandaag',  opvolgStatus({opvolgdatum:'11-06-2026'}, TV), {weggelegd:false, vandaag:true});
  eq('opvolg verleden', opvolgStatus({opvolgdatum:'01-06-2026'}, TV), {weggelegd:false, vandaag:true});

  // ── STIL_ESCALATIE_REGELS ── (per categorie, trap1 < trap2)
  truthy('esc-regels compleet', ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD']
    .every(s => STIL_ESCALATIE_REGELS[s] && STIL_ESCALATIE_REGELS[s].trap1 < STIL_ESCALATIE_REGELS[s].trap2));
```

- [ ] **Step 2: Draai de tests — verwacht FAIL (import-fout)**

Start (eenmalig, blijft draaien): `python3 -m http.server 8000 --directory /Users/servicedesk/collectief-dashboard` (run_in_background). Open met de preview-tools `http://localhost:8000/index.html?test=1` en lees de console: verwacht een module-importfout ("does not provide an export named 'opvolgStatus'").

- [ ] **Step 3: Implementeer de helpers**

In `src/util.js`, direct onder de `STIL_DREMPEL_DAGEN`-regel (r.26):

```js
// ══════════════════════════════════════
//  FASE 4 — OPVOLGING & HERHALING (zie docs/superpowers/specs/2026-06-11-…-design.md)
// ══════════════════════════════════════
// LET OP — SYNC: gelijk houden aan CD_STIL_ESCALATIE_REGELS in apps-script/Opvolging.gs
const STIL_ESCALATIE_REGELS = {
  'OPPAKKEN':          { trap1:  7, trap2: 14 },
  'VERGADERVERZOEKEN': { trap1: 14, trap2: 21 },
  'OFFERTE-TRAJECTEN': { trap1: 21, trap2: 35 },
  'LOD':               { trap1: 30, trap2: 60 },
};

// Status van de opvolgdatum: weggelegd (toekomst) of opvolgen-vandaag (vandaag/verleden).
function opvolgStatus(r, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  const p = _parseAnyDate((r && r.opvolgdatum) || '');
  if (!p) return { weggelegd:false, vandaag:false };
  const d = new Date(p.y, p.m - 1, p.d);
  const diff = _verschilInKalenderdagen(d, vandaag);
  return { weggelegd: diff > 0, vandaag: diff <= 0 };
}

// Volgende deadline voor een herhaalregel. Types: week|maand|kwartaal|halfjaar|jaar|na-afronden.
// LET OP — SYNC: zelfde logica als cd_volgendeDeadlineStr in apps-script/Opvolging.gs
const HERHAAL_MAANDEN = { maand:1, kwartaal:3, halfjaar:6, jaar:12 };
function volgendeDeadline(huidigStr, type, intervalMaanden){
  const p = _parseAnyDate(huidigStr || '');
  if (!p) return '';
  const d = new Date(p.y, p.m - 1, p.d);
  if (type === 'week'){ d.setDate(d.getDate() + 7); }
  else {
    const mnd = type === 'na-afronden' ? (parseInt(intervalMaanden) || 0) : HERHAAL_MAANDEN[type];
    if (!mnd) return '';
    const dag = d.getDate();
    d.setMonth(d.getMonth() + mnd);
    if (d.getDate() !== dag) d.setDate(0); // maandgrens: 31 jan +1m → 28/29 feb
  }
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}
```

En breid de export-lijst onderaan uit met: `STIL_ESCALATIE_REGELS, opvolgStatus, volgendeDeadline, HERHAAL_MAANDEN,`

- [ ] **Step 4: Draai de tests — verwacht PASS**

Herlaad `?test=1`; console moet eindigen op `[TESTS] <n> OK, 0 FAIL`.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "Fase 4: helpers opvolgStatus/volgendeDeadline + escalatie-regels (incl. tests)"
```

---

### Task 2: Parsing & state (L/M/N + Herhaalregels-tab)

**Files:**
- Modify: `src/data.js`
- Modify: `src/state.js`

- [ ] **Step 1: state.js uitbreiden**

In `src/state.js`: in `D` → `herhaal:[]` toevoegen; in `state` (onder `_completeIdx: null,`):

```js
  _snoozeRow: null,
  herhaalEditRow: null,
```

- [ ] **Step 2: parseSections uitbreiden**

In `src/data.js` (`parseSections`, na de `entry.subcategorie=...`-regel r.116):

```js
    entry.opvolgdatum=(row[11]||'').trim();  // L — Fase 4
    entry.herhaalId  =(row[12]||'').trim();  // M
    entry.esc        =(row[13]||'').trim();  // N (alleen door Apps Script geschreven)
```

- [ ] **Step 3: parseHerhaal + mee-laden**

In `src/data.js`, onder `parseAlvo`/`parseAlfa`, nieuwe functie:

```js
// Herhaalregels-tab: A=ID B=Omschrijving C=Sectie D=Code E=Naam F=Behandelaar
// G=Type H=IntervalMnd I=DagenVooraf J=VolgendeDeadline K=Status L=LaatstKlaargezet
function parseHerhaal(rows){
  if(!rows||rows.length<2) return [];
  return rows.slice(1).map((r,i)=>({
    _row:i+2,
    id:(r[0]||'').toString().trim(), omschrijving:(r[1]||'').toString().trim(),
    sectie:(r[2]||'').toString().trim().toUpperCase(),
    code:(r[3]||'').toString().trim(), naam:(r[4]||'').toString().trim(),
    behandelaar:(r[5]||'').toString().trim(), type:(r[6]||'').toString().trim().toLowerCase(),
    interval:(r[7]||'').toString().trim(), dagenVooraf:parseInt(r[8])||14,
    volgendeDeadline:(r[9]||'').toString().trim(),
    status:((r[10]||'ACTIEF')+'').trim().toUpperCase(),
    laatstKlaargezet:(r[11]||'').toString().trim(),
  })).filter(r=>r.id);
}
```

In `loadAll`: voeg aan de `Promise.all` toe: `fetchSheet("Herhaalregels").catch(()=>[]),` (als 7e, na Logboek) en vang hem op in de destructure als `hhR`. Na `D.logboek=parseLogboek(logR);`: `D.herhaal=parseHerhaal(hhR);`. Voeg `D.herhaal` toe aan de `hash`-array zodat wijzigingen her-renderen.

- [ ] **Step 4: Verifieer**

Herlaad `?test=1` — geen nieuwe fouten, zelfde aantal OK. (Tab bestaat nog niet → catch geeft `[]`, geen crash.)

- [ ] **Step 5: Commit**

```bash
git add src/data.js src/state.js
git commit -m "Fase 4: kolommen L/M/N en Herhaalregels-tab parsen"
```

---

### Task 3: Lijstgedrag — sortering, Weggelegd-groep, pillen

**Files:**
- Modify: `src/render-lijsten.js`
- Modify: `src/styles.css` → LET OP: het bestand heet `styles.css` (repo-root)
- Modify: `src/tests.js`

- [ ] **Step 1: Schrijf de falende sorteer-test**

In `src/tests.js`: importeer `filterNtd`:

```js
import { filterNtd } from "./render-lijsten.js";
```

Voeg toe (vóór de slotregels):

```js
  // ── filterNtd ── volgorde: te laat → opvolgen-vandaag → prio/deadline → in behandeling → weggelegd
  const _vd=new Date();
  const _f=n=>{const d=new Date(_vd.getFullYear(),_vd.getMonth(),_vd.getDate()+n);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`};
  const _rows=[
    {code:'NORM', deadline:_f(3),  inBehandeling:'FALSE', opvolgdatum:''},
    {code:'WEG',  deadline:_f(2),  inBehandeling:'FALSE', opvolgdatum:_f(5)},
    {code:'IB',   deadline:_f(1),  inBehandeling:'TRUE',  opvolgdatum:''},
    {code:'OPV',  deadline:_f(9),  inBehandeling:'FALSE', opvolgdatum:_f(0)},
    {code:'LAAT', deadline:_f(-2), inBehandeling:'FALSE', opvolgdatum:''},
  ];
  eq('ntd-sortering fase4', filterNtd(_rows,'','','','','OPPAKKEN').map(r=>r.code),
     ['LAAT','OPV','NORM','IB','WEG']);
```

- [ ] **Step 2: Draai — verwacht FAIL** (volgorde klopt nog niet: WEG/OPV staan verkeerd)

- [ ] **Step 3: Implementeer in render-lijsten.js**

a) Import uitbreiden (r.4): voeg `opvolgStatus` toe aan de util-import.

b) `filterNtd`-comparator vervangen door:

```js
  }).sort((a,b)=>{
    // Groepen: 0 = actief, 1 = in behandeling, 2 = weggelegd (opvolgdatum in de toekomst)
    const grp = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
    const gA = grp(a), gB = grp(b);
    if (gA !== gB) return gA - gB;
    if (gA === 2){ // binnen Weggelegd: vroegste opvolgdatum eerst
      const oA = parseDt(a.opvolgdatum), oB = parseDt(b.opvolgdatum);
      if (oA !== oB) return oA - oB;
    }
    const pa = berekenPrioriteit(a.deadline, sec);
    const pb = berekenPrioriteit(b.deadline, sec);
    // 1. Te laat altijd bovenaan
    if (pa.teLaat !== pb.teLaat) return pa.teLaat ? -1 : 1;
    // 2. Opvolgen-vandaag direct daarna
    const ovA = opvolgStatus(a).vandaag ? 0 : 1, ovB = opvolgStatus(b).vandaag ? 0 : 1;
    if (ovA !== ovB) return ovA - ovB;
    // 3. Prioriteit-rang
    const rang = { 'Hoog':0, 'Midden':1, 'Laag':2, '':3 };
    if (rang[pa.prioriteit] !== rang[pb.prioriteit]) return rang[pa.prioriteit] - rang[pb.prioriteit];
    // 4. Deadline oplopend (vroegste eerst)
    const dA = parseDt(a.deadline), dB = parseDt(b.deadline);
    if (dA && dB && dA !== dB) return dA - dB;
    if (dA && !dB) return -1;
    if (dB && !dA) return 1;
    // 5. VvE-code alfabetisch
    return (a.code || '').localeCompare(b.code || '');
  });
```

c) `renderTbody`: vervang de main/ib-splitsing door drie groepen:

```js
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  const main=sl.filter(r=>grpOf(r)===0);
  const ib=sl.filter(r=>grpOf(r)===1);
  const wg=sl.filter(r=>grpOf(r)===2);
  let html=main.map(r=>rowNtd(r,sec)).join('');
  const cols=SECS[sec].cols.length+1;
  if(ib.length){
    html+=`<tr><td colspan="${cols}" style="background:var(--ac-l);padding:8px 13px;font-size:11px;font-weight:700;color:var(--ac);text-transform:uppercase;letter-spacing:.05em;border:none">⟳ In behandeling (${ib.length})</td></tr>`;
    html+=ib.map(r=>rowNtd(r,sec)).join('');
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">⏸ Weggelegd (${wg.length}) — komt terug op de opvolgdatum</td></tr>`;
    html+=wg.map(r=>rowNtd(r,sec)).join('');
  }
  el.innerHTML=html;
```

d) `bepaalStil`: voeg als éérste regel toe:

```js
  if (opvolgStatus(r).weggelegd) return null; // weggelegd = bewust geparkeerd, niet stil
```

e) `rowNtd`: na de `stilPill`-const (r.345–347) toevoegen:

```js
  const ov = opvolgStatus(r);
  const opvolgPill = ov.vandaag
    ? `<span class="pill-opvolg" data-action="taak-wegleggen" data-rid="${rid}" title="Opvolgdatum: ${esc(r.opvolgdatum)}">🔔 Opvolgen vandaag</span>`
    : ov.weggelegd
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}" title="Weggelegd tot ${esc(r.opvolgdatum)}">${esc(r.opvolgdatum)}</span>`
      : '';
  const extraPills = stilPill + opvolgPill;
```

Vervang in de vier sectie-branches elke `${stilPill}` door `${extraPills}` (4 plekken).

f) `rowNtd`: snooze-knop toevoegen — vervang de `editBtn`-const door dezelfde string met vóór de afrond-knop een extra knop:

```js
  const editBtn=`<button class="btn-edit" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-edit" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></svg></button><button class="btn-done" data-action="taak-afronden" data-rid="${rid}" title="Afgehandeld"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/></svg></button>`;
```

g) Rij-klasse: in de `rowCls`-array (r.397) toevoegen: `ov.weggelegd ? 'snooze-row' : ''` als derde element.

- [ ] **Step 4: CSS toevoegen** (in `styles.css`, direct onder `.pill-stil::before` r.151):

```css
    .pill-opvolg{display:inline-block;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;cursor:pointer}
    .pill-snooze{display:inline-block;background:rgba(107,114,128,0.15);color:#4b5563;font-size:11px;font-weight:600;padding:2px 7px;border-radius:10px;margin-left:6px;cursor:pointer}
    .pill-snooze::before{content:'⏸ '}
    [data-theme=dark] .pill-snooze{color:#9ca3af}
    tr.snooze-row td{opacity:.55}
    .grp-kop{background:var(--sur2);padding:8px 13px;font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;border:none}
```

- [ ] **Step 5: Draai de tests — verwacht PASS** (`?test=1`, 0 FAIL; sorteer-test groen)

- [ ] **Step 6: Commit**

```bash
git add src/render-lijsten.js styles.css src/tests.js
git commit -m "Fase 4: Weggelegd-groep, opvolg-pillen en sortering in de takenlijst"
```

---

### Task 4: Wegleggen-UI (snooze-modal)

**Files:**
- Create: `src/snooze.js`
- Modify: `index.html` (modal), `src/actions.js`, `src/main.js`, `src/tests.js`

- [ ] **Step 1: `src/snooze.js` aanmaken** (volledig):

```js
// ══════════════════════════════════════
//  SNOOZE — taak wegleggen tot een opvolgdatum (Fase 4)
//  Schrijft kolom L in 'Nog Te Doen'; deadline wint altijd (waarschuwing).
// ══════════════════════════════════════
import { state } from "./state.js";
import { toDutchDate, toISODate, _parseAnyDate, _vandaagAmsterdam, _verschilInKalenderdagen, parseDt } from "./util.js";
import { writeRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { renderAll } from "./main.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";

const OPVOLG_KOLOM = 'L'; // Nog Te Doen: L=Opvolgdatum (M=Herhaal-ID, N=Esc)

function openSnoozeModal(rid){
  const r = state._rowCache[rid];
  if(!r) return;
  state._snoozeRow = r;
  document.getElementById('snooze-title').textContent = `Wegleggen — ${r.code} ${r.naam||''}`;
  document.getElementById('snooze-datum').value = toISODate(r.opvolgdatum||'');
  document.getElementById('snooze-wis').style.display = r.opvolgdatum ? '' : 'none';
  document.getElementById('snooze-bg').classList.add('open');
}
function closeSnoozeModal(){
  document.getElementById('snooze-bg').classList.remove('open');
  state._snoozeRow = null;
}
function snoozeKies(dagen){
  const d = new Date(); d.setDate(d.getDate()+dagen);
  document.getElementById('snooze-datum').value =
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  snoozeOpslaan();
}
function snoozeOpslaan(){
  const r = state._snoozeRow; if(!r) return;
  const iso = document.getElementById('snooze-datum').value;
  if(!iso){ alert('Kies een datum.'); return; }
  const nieuw = toDutchDate(iso);
  const p = _parseAnyDate(nieuw);
  const d = new Date(p.y, p.m-1, p.d);
  if(_verschilInKalenderdagen(d, _vandaagAmsterdam()) <= 0){ alert('Kies een datum in de toekomst.'); return; }
  const dl = parseDt(r.deadline);
  if(dl && d.getTime() > dl &&
     !confirm(`Let op: deze opvolgdatum ligt ná de deadline (${r.deadline}).\nDe taak wordt op de deadline gewoon "Te laat". Toch wegleggen?`)) return;
  schrijfOpvolgdatum(r, nieuw, 'Weggelegd');
  closeSnoozeModal();
}
function snoozeWis(){
  const r = state._snoozeRow; if(!r) return;
  schrijfOpvolgdatum(r, '', 'Opvolgdatum gewist');
  closeSnoozeModal();
}
async function schrijfOpvolgdatum(r, nieuw, actie){
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const oud = r.opvolgdatum || '';
  r.opvolgdatum = nieuw;
  renderAll();
  showToast(nieuw ? '⏸ Weggelegd tot '+nieuw : '🔔 Opvolgdatum gewist',
            `${r.code} — ${r.actiepunt||r.periode||r.naam||''}`, null);
  backgroundWrite(
    async ()=>{
      await writeRange(`'Nog Te Doen'!${OPVOLG_KOLOM}${r._row}:${OPVOLG_KOLOM}${r._row}`, [nieuw]);
      logEvent(r.code, r._sec, actie, 'opvolgdatum', oud, nieuw);
    },
    ()=>{ r.opvolgdatum = oud; },
    'Wegleggen mislukt'
  );
}
export { openSnoozeModal, closeSnoozeModal, snoozeKies, snoozeOpslaan, snoozeWis };
```

- [ ] **Step 2: Modal-HTML** — in `index.html`, direct ná het complete-bg-modal (na r.~578):

```html
<!-- ═══════ WEGLEGGEN (SNOOZE) MODAL — Fase 4 ═══════ -->
<div class="modal-bg" id="snooze-bg">
  <div class="modal" style="max-width:420px">
    <div class="modal-hdr">
      <h2 id="snooze-title">Taak wegleggen</h2>
      <button class="modal-close" id="snooze-close">×</button>
    </div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--mut);margin:0 0 10px">De taak zakt gedempt naar "Weggelegd" onderaan de lijst en komt op de opvolgdatum vanzelf terug.</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sec" data-action="snooze-kies" data-dagen="3">+3 dagen</button>
        <button class="btn btn-sec" data-action="snooze-kies" data-dagen="7">+1 week</button>
        <button class="btn btn-sec" data-action="snooze-kies" data-dagen="14">+2 weken</button>
      </div>
      <div class="fld" style="margin-top:12px"><label>Of kies een datum</label><input type="date" id="snooze-datum"/></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-sec" id="snooze-cancel">Annuleren</button>
      <button class="btn btn-del" id="snooze-wis" style="display:none">🔔 Wissen</button>
      <button class="btn btn-pri" id="snooze-opslaan">⏸ Wegleggen</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Acties + bindings**

`src/actions.js`: importeer `{ openSnoozeModal, snoozeKies }` uit `./snooze.js` en voeg toe aan `ACTIONS`:

```js
  'taak-wegleggen':        (el) => openSnoozeModal(+el.dataset.rid),
  'snooze-kies':           (el) => snoozeKies(+el.dataset.dagen),
```

`src/main.js`: importeer `{ closeSnoozeModal, snoozeOpslaan, snoozeWis }` uit `./snooze.js`; voeg bij de modal-handlers toe:

```js
  document.getElementById('snooze-close').onclick=closeSnoozeModal;
  document.getElementById('snooze-cancel').onclick=closeSnoozeModal;
  document.getElementById('snooze-opslaan').onclick=snoozeOpslaan;
  document.getElementById('snooze-wis').onclick=snoozeWis;
  let _snoozeMouseDown=null;
  document.getElementById('snooze-bg').addEventListener('mousedown',e=>{_snoozeMouseDown=e.target});
  document.getElementById('snooze-bg').addEventListener('click',e=>{if(e.target.id==='snooze-bg'&&_snoozeMouseDown?.id==='snooze-bg')closeSnoozeModal()});
```

En in de 8s-poll-guard (r.~160) een extra skip:

```js
    if(document.getElementById('snooze-bg').classList.contains('open')) return;
```

- [ ] **Step 4: Test-dekking** — in `src/tests.js` de `VERWACHTE_ACTIES`-array uitbreiden met `'taak-wegleggen','snooze-kies'`.

- [ ] **Step 5: Draai `?test=1` — verwacht PASS.** Controleer ook visueel (preview): klok-knopje zichtbaar per rij; modal opent (verder gedrag vergt login — komt in Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/snooze.js index.html src/actions.js src/main.js src/tests.js
git commit -m "Fase 4: wegleggen-modal met snelkeuzes, deadline-waarschuwing en logboek-registratie"
```

---

### Task 5: Afronden/verwijderen draagt Fase 4-kolommen mee (crud.js)

**Files:**
- Modify: `src/crud.js`

- [ ] **Step 1: doCompleteTask — herhaalId mee naar 'Afgerond' (kolom L)**

Na de `switch(sec)` die `values` vult (r.~205-215), vóór `const ids=await getSheetIds();`:

```js
    values.push(r.herhaalId||''); // L in 'Afgerond': Herhaal-ID — de motor herkent afgeronde terugkerende taken
```

(De batch gebruikt `endColumnIndex: values.length` — schuift automatisch mee naar 12 kolommen.)

- [ ] **Step 2: Undo-data verbreden (afronden én verwijderen)**

In `doCompleteTask` (r.~229) én `deleteTaskRow` (r.~136) staat 2× hetzelfde patroon:

```js
    const ntdKeys=SECS[sec].keys;
    const ntdValues=ntdKeys.map(k=>r[k]||''); ntdValues.push(r.subcategorie||'');
```

Vervang beide door (let op: dit corrigeert meteen de oude undo-afwijking waarbij de subcategorie één kolom te vroeg, in I i.p.v. J, werd teruggezet):

```js
    const ntdKeys=SECS[sec].keys;
    const ntdValues=ntdKeys.map(k=>r[k]||'');
    while(ntdValues.length<8) ntdValues.push('');                  // OFFERTE heeft 7 velden
    ntdValues.push('', r.subcategorie||'', '', r.opvolgdatum||'', r.herhaalId||''); // I, J=sub, K, L, M
```

- [ ] **Step 3: Verifieer** — `?test=1` blijft 0 FAIL (geen unit-test mogelijk zonder login; E2E in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/crud.js
git commit -m "Fase 4: herhaalId mee naar Afgerond; undo herstelt opvolgdatum/herhaalId (en sub-kolom-fix)"
```

---

### Task 6: Herhaalregels-pagina

**Files:**
- Create: `src/render-herhaal.js`
- Modify: `index.html` (nav + pagina + modal), `src/config.js`, `src/ui.js`, `src/main.js`, `src/actions.js`, `src/tests.js`

- [ ] **Step 1: `src/render-herhaal.js` aanmaken** (volledig):

```js
// ══════════════════════════════════════
//  HERHAALREGELS — beheerpagina voor terugkerende taken (Fase 4)
//  De dagelijkse Apps Script-motor zet de taken klaar; hier alleen regel-CRUD.
// ══════════════════════════════════════
import { esc, emptyRow, toISODate, toDutchDate, _parseAnyDate } from "./util.js";
import { state, D } from "./state.js";
import { SID } from "./config.js";
import { appendRange, writeRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getSheetIds } from "./crud.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";
import { backgroundWrite } from "./data.js";

const TYPE_LABELS = { week:'Elke week', maand:'Elke maand', kwartaal:'Elk kwartaal',
                      halfjaar:'Elk half jaar', jaar:'Elk jaar' };

function zichtbaarVanaf(r){
  const p=_parseAnyDate(r.volgendeDeadline); if(!p) return '';
  const d=new Date(p.y,p.m-1,p.d); d.setDate(d.getDate()-(r.dagenVooraf||14));
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

function renderHerhaal(){
  const tb=document.getElementById('herhaal-tbody');
  if(!tb) return;
  const rows=D.herhaal||[];
  const actief=rows.filter(r=>r.status==='ACTIEF').length;
  document.getElementById('herhaal-sub').textContent=`${rows.length} ${rows.length===1?'regel':'regels'} · ${actief} actief`;
  tb.innerHTML=rows.length?rows.map(r=>{
    const typeLbl=r.type==='na-afronden'?`${r.interval||'?'} mnd na afronden`:(TYPE_LABELS[r.type]||esc(r.type));
    const vk=r.volgendeDeadline
      ?`${esc(r.volgendeDeadline)}<br><span style="font-size:11px;color:var(--mut)">zichtbaar ${zichtbaarVanaf(r)}</span>`
      :'<span style="font-size:12px;color:var(--mut)">wacht op afronden</span>';
    const status=r.status==='ACTIEF'
      ?'<span class="badge prio-laag">Actief</span>'
      :'<span class="badge" style="background:var(--sur2);color:var(--mut)">Gepauzeerd</span>';
    return `<tr class="${r.status!=='ACTIEF'?'snooze-row':''}">
      <td class="cell-txt">${esc(r.omschrijving)}</td>
      <td><span class="code">${esc(r.code)}</span></td>
      <td class="cell-sm">${esc(r.behandelaar)}</td>
      <td class="cell-sm">${typeLbl}</td>
      <td class="cell-sm">${vk}</td>
      <td>${status}</td>
      <td><button class="btn-edit" data-action="herhaal-bewerken" data-hid="${r._row}" title="Bewerken"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn-edit" data-action="herhaal-status" data-hid="${r._row}" title="${r.status==='ACTIEF'?'Pauzeren':'Activeren'}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${r.status==='ACTIEF'?'<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>':'<polygon points="5 3 19 12 5 21 5 3"/>'}</svg></button></td>
    </tr>`;
  }).join(''):emptyRow(7);
}

function openHerhaalModal(hid){
  const r=hid!=null?(D.herhaal||[]).find(x=>x._row===hid):null;
  state.herhaalEditRow=r||null;
  document.getElementById('hh-title').textContent=r?'Herhaalregel bewerken':'Nieuwe herhaalregel';
  document.getElementById('hh-submit-lbl').textContent=r?'Opslaan':'Toevoegen';
  document.getElementById('hh-del').style.display=r?'inline-flex':'none';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||''};
  set('hh-omschrijving',r?.omschrijving); set('hh-code',r?.code); set('hh-naam',r?.naam);
  set('hh-sectie',r?.sectie||'OPPAKKEN'); set('hh-beh',r?.behandelaar);
  set('hh-type',r?.type||'kwartaal'); set('hh-interval',r?.interval||'6');
  set('hh-deadline',toISODate(r?.volgendeDeadline||'')); set('hh-vooraf',String(r?.dagenVooraf??14));
  syncHerhaalVelden();
  document.getElementById('hh-bg').classList.add('open');
}
function closeHerhaalModal(){document.getElementById('hh-bg').classList.remove('open');state.herhaalEditRow=null}
function syncHerhaalVelden(){
  const na=document.getElementById('hh-type').value==='na-afronden';
  document.getElementById('hh-interval-fld').style.display=na?'':'none';
  document.getElementById('hh-deadline-fld').style.display=na?'none':'';
}
function gvh(id){const el=document.getElementById(id);return el?el.value.trim():''}

async function submitHerhaal(){
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const oms=gvh('hh-omschrijving'), code=gvh('hh-code'), naam=gvh('hh-naam');
  const sectie=gvh('hh-sectie'), beh=gvh('hh-beh'), type=gvh('hh-type');
  const interval=gvh('hh-interval'), vooraf=parseInt(gvh('hh-vooraf'))||14;
  const dlIso=gvh('hh-deadline');
  if(!oms||!code){alert('Omschrijving en VvE Code zijn verplicht.');return}
  if(type==='na-afronden'&&(parseInt(interval)||0)<1){alert('Vul het aantal maanden na afronden in.');return}
  if(type!=='na-afronden'&&!dlIso){alert('Kies de eerstvolgende deadline.');return}
  if(type==='week'&&vooraf>=7){alert('Bij een wekelijkse herhaling moet "dagen vooraf" kleiner zijn dan 7, anders stapelen de taken op.');return}
  const volgende=type==='na-afronden'?'':toDutchDate(dlIso);
  const r=state.herhaalEditRow;
  const id=r?r.id:'HR-'+Date.now().toString(36).toUpperCase();
  const values=[id,oms,sectie,code,naam,beh,type,type==='na-afronden'?interval:'',String(vooraf),volgende,r?r.status:'ACTIEF',r?r.laatstKlaargezet:''];
  closeHerhaalModal();
  if(r){
    Object.assign(r,{omschrijving:oms,sectie,code,naam,behandelaar:beh,type,
      interval:type==='na-afronden'?interval:'',dagenVooraf:vooraf,volgendeDeadline:volgende});
    renderHerhaal();
    showToast('💾 Herhaalregel opgeslagen',oms,null);
    backgroundWrite(async()=>{
      await writeRange(`'Herhaalregels'!A${r._row}:L${r._row}`,values);
      logEvent(code,sectie,'Herhaalregel bewerkt','','',oms);
    },()=>{},'Opslaan mislukt');
  }else{
    showToast('➕ Herhaalregel toegevoegd',oms,null);
    backgroundWrite(async()=>{
      await appendRange("'Herhaalregels'!A:L",values);
      logEvent(code,sectie,'Herhaalregel aangemaakt','','',oms);
    },()=>{},'Toevoegen mislukt');
  }
}

function toggleHerhaalStatus(hid){
  const r=(D.herhaal||[]).find(x=>x._row===hid); if(!r) return;
  const oud=r.status, nieuw=oud==='ACTIEF'?'GEPAUZEERD':'ACTIEF';
  r.status=nieuw; renderHerhaal();
  showToast(nieuw==='ACTIEF'?'▶ Regel geactiveerd':'⏸ Regel gepauzeerd',r.omschrijving,null);
  backgroundWrite(async()=>{
    await writeRange(`'Herhaalregels'!K${r._row}:K${r._row}`,[nieuw]);
    logEvent(r.code,r.sectie,'Herhaalregel '+(nieuw==='ACTIEF'?'geactiveerd':'gepauzeerd'),'','',r.omschrijving);
  },()=>{r.status=oud;},'Status wijzigen mislukt');
}

async function deleteHerhaal(){
  const r=state.herhaalEditRow; if(!r) return;
  if(!confirm(`Herhaalregel "${r.omschrijving}" definitief verwijderen?\nTip: pauzeren kan ook.`)) return;
  closeHerhaalModal();
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const pos=(D.herhaal||[]).indexOf(r); if(pos>-1)D.herhaal.splice(pos,1);
  (D.herhaal||[]).forEach(x=>{if(x._row>r._row)x._row--;});
  renderHerhaal();
  showToast('🗑️ Herhaalregel verwijderd',r.omschrijving,null);
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Herhaalregels'];
    if(sheetId==null) throw new Error('Sheet "Herhaalregels" niet gevonden');
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}]})});
    if(!resp.ok){const e=await resp.json();const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
    logEvent(r.code,r.sectie,'Herhaalregel verwijderd','','',r.omschrijving);
  },()=>{},'Verwijderen mislukt');
}

export { renderHerhaal, openHerhaalModal, closeHerhaalModal, syncHerhaalVelden, submitHerhaal, toggleHerhaalStatus, deleteHerhaal };
```

- [ ] **Step 2: index.html — nav-item** (in de "Intern"-groep, ná het Logboek-item r.~63-66):

```html
    <div class="ni" data-page="herhaal">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
      Herhaalregels
    </div>
```

- [ ] **Step 3: index.html — pagina** (na `page-logboek`, vóór `page-analytics`):

```html
    <!-- ══ HERHAALREGELS (Fase 4) ══ -->
    <div class="page" id="page-herhaal">
      <div class="card">
        <div class="card-hdr">
          <h2>Herhaalregels</h2>
          <div class="filter-bar">
            <span id="herhaal-sub" style="font-size:12px;color:var(--mut)"></span>
            <button class="btn btn-pri btn-sm" id="btn-add-herhaal"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Nieuwe herhaalregel</button>
          </div>
        </div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Taak</th><th>VvE</th><th>Wie</th><th>Herhaling</th><th>Volgende keer</th><th>Status</th><th></th></tr></thead>
          <tbody id="herhaal-tbody"></tbody>
        </table></div>
      </div>
    </div>
```

- [ ] **Step 4: index.html — modal** (na het snooze-modal):

```html
<!-- ═══════ HERHAALREGEL MODAL — Fase 4 ═══════ -->
<div class="modal-bg" id="hh-bg">
  <div class="modal" style="max-width:520px">
    <div class="modal-hdr">
      <h2 id="hh-title">Nieuwe herhaalregel</h2>
      <button class="modal-close" id="hh-close">×</button>
    </div>
    <div class="modal-body">
      <div class="fld"><label>Taakomschrijving *</label><input type="text" id="hh-omschrijving" placeholder="bijv. Servicekosten controleren"/></div>
      <div class="fld-row">
        <div class="fld">
          <label>VvE Code *</label>
          <div class="vve-wrap">
            <input type="text" id="hh-code" placeholder="Typ code of naam…" autocomplete="off"/>
            <div class="vve-suggestions" id="hh-vve-sug"></div>
          </div>
        </div>
        <div class="fld"><label>VvE Naam</label><input type="text" id="hh-naam" placeholder="Automatisch ingevuld" readonly style="opacity:.7"/></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>Sectie</label><select id="hh-sectie"><option>OPPAKKEN</option><option>LOD</option></select></div>
        <div class="fld"><label>Behandelaar</label><select id="hh-beh"><option value="">–</option><option>Jer</option><option>Cihad</option><option>Gabos</option><option>Cihad, Jer</option></select></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>Herhaling</label><select id="hh-type">
          <option value="week">Elke week</option><option value="maand">Elke maand</option>
          <option value="kwartaal" selected>Elk kwartaal</option><option value="halfjaar">Elk half jaar</option>
          <option value="jaar">Elk jaar</option><option value="na-afronden">X maanden na afronden</option>
        </select></div>
        <div class="fld" id="hh-interval-fld" style="display:none"><label>Aantal maanden</label><input type="number" id="hh-interval" min="1" value="6"/></div>
      </div>
      <div class="fld-row">
        <div class="fld" id="hh-deadline-fld"><label>Eerstvolgende deadline *</label><input type="date" id="hh-deadline"/></div>
        <div class="fld"><label>Dagen vooraf zichtbaar</label><input type="number" id="hh-vooraf" min="0" value="14"/></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-sec" id="hh-cancel">Annuleren</button>
      <button class="btn btn-del" id="hh-del" style="display:none" data-action="herhaal-verwijderen">🗑️ Verwijder</button>
      <button class="btn btn-pri" id="hh-submit"><span id="hh-submit-lbl">Toevoegen</span></button>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Route, meta en bindings**

a) `src/config.js` — `PAGE_META` uitbreiden:

```js
  herhaal:['Herhaalregels','Terugkerende taken — automatisch klaargezet'],
```

b) `src/ui.js` — importeer `renderHerhaal` uit `./render-herhaal.js` en in `goTo`: `if(page==='herhaal') renderHerhaal();`

c) `src/main.js` — importeer `{ renderHerhaal, openHerhaalModal, closeHerhaalModal, syncHerhaalVelden, submitHerhaal }` uit `./render-herhaal.js`; in `renderAll()` als laatste regel `renderHerhaal();`; bij de modal-handlers:

```js
  document.getElementById('btn-add-herhaal').onclick=()=>openHerhaalModal(null);
  document.getElementById('hh-close').onclick=closeHerhaalModal;
  document.getElementById('hh-cancel').onclick=closeHerhaalModal;
  document.getElementById('hh-submit').onclick=submitHerhaal;
  document.getElementById('hh-type').onchange=syncHerhaalVelden;
  let _hhMouseDown=null;
  document.getElementById('hh-bg').addEventListener('mousedown',e=>{_hhMouseDown=e.target});
  document.getElementById('hh-bg').addEventListener('click',e=>{if(e.target.id==='hh-bg'&&_hhMouseDown?.id==='hh-bg')closeHerhaalModal()});
  initVveZoekveld({
    input: document.getElementById('hh-code'),
    lijstEl: document.getElementById('hh-vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('hh-code').value = code;
      document.getElementById('hh-naam').value = naam;
    },
  });
```

Plus poll-guard: `if(document.getElementById('hh-bg').classList.contains('open')) return;`

d) `src/actions.js` — importeer `{ openHerhaalModal, toggleHerhaalStatus, deleteHerhaal }` uit `./render-herhaal.js`:

```js
  'herhaal-bewerken':      (el) => openHerhaalModal(+el.dataset.hid),
  'herhaal-status':        (el) => toggleHerhaalStatus(+el.dataset.hid),
  'herhaal-verwijderen':   ()   => deleteHerhaal(),
```

e) `src/tests.js` — `VERWACHTE_ACTIES` uitbreiden met `'herhaal-bewerken','herhaal-status','herhaal-verwijderen'`.

- [ ] **Step 6: Draai `?test=1` — verwacht PASS**; check visueel: nav-item aanwezig, pagina toont lege tabel, modal opent en het type-veld wisselt interval/deadline.

- [ ] **Step 7: Commit**

```bash
git add src/render-herhaal.js index.html src/config.js src/ui.js src/main.js src/actions.js src/tests.js
git commit -m "Fase 4: Herhaalregels-pagina met regel-CRUD en pauzeren"
```

---

### Task 7: Apps Script — motor, setup en verrijkte digest

**Files:**
- Create: `apps-script/Opvolging.gs`
- Modify: `apps-script/Notifications.gs`

- [ ] **Step 1: `apps-script/Opvolging.gs` aanmaken** — volledig bestand:

```js
// ===== FASE 4 — OPVOLGING & HERHALING (dagelijkse motor ±06:30) =====
// Spec: docs/superpowers/specs/2026-06-11-fase4-opvolging-herhaling-design.md
// Kolommen 'Nog Te Doen' (1-geteld): L=12 Opvolgdatum, M=13 Herhaal-ID, N=14 Esc-stempel.
// Hergebruikt: cd_parseDate, cd_splitBehandelaar, cd_notifyByExternalId, cd_schrijfLogboek,
// cd_safeRun/cd_lockedRun, cd_createTaskRow (Notifications.gs / Extra functies.gs).

// LET OP — SYNC: gelijk houden aan STIL_ESCALATIE_REGELS in src/util.js
const CD_STIL_ESCALATIE_REGELS = {
  'OPPAKKEN':          { trap1:  7, trap2: 14 },
  'VERGADERVERZOEKEN': { trap1: 14, trap2: 21 },
  'OFFERTE-TRAJECTEN': { trap1: 21, trap2: 35 },
  'LOD':               { trap1: 30, trap2: 60 },
};
const HR_SHEET = 'Herhaalregels';
const CD_OPV_SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

function cd_opvolgingMotor() {
  cd_lockedRun('cd_opvolgingMotor', function () {
    cd_safeRun('cd_hr_zetTakenKlaar',       cd_hr_zetTakenKlaar);
    cd_safeRun('cd_hr_verwerkAfrondingen',  cd_hr_verwerkAfrondingen);
    cd_safeRun('cd_opvolgWakker',           cd_opvolgWakker);
    cd_safeRun('cd_escaleerStilleDossiers', cd_escaleerStilleDossiers);
  });
}

function cd_ddmmyyyy(d) {
  return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
}

// LET OP — SYNC: zelfde logica als volgendeDeadline() in src/util.js (incl. maandgrens-clamp)
const CD_HERHAAL_MAANDEN = { maand: 1, kwartaal: 3, halfjaar: 6, jaar: 12 };
function cd_volgendeDeadlineStr(huidig, type, intervalMnd) {
  const d = new Date(huidig.getFullYear(), huidig.getMonth(), huidig.getDate());
  if (type === 'week') { d.setDate(d.getDate() + 7); }
  else {
    const mnd = (type === 'na-afronden') ? (parseInt(intervalMnd) || 0) : CD_HERHAAL_MAANDEN[type];
    if (!mnd) return '';
    const dag = d.getDate();
    d.setMonth(d.getMonth() + mnd);
    if (d.getDate() !== dag) d.setDate(0);
  }
  return cd_ddmmyyyy(d);
}

// Laatste menselijke logboek-activiteit per taak (key: code|SECTIE). 'systeem' telt niet mee.
function cd_laatsteActiviteitMap() {
  const map = {};
  const sheet = SpreadsheetApp.getActive().getSheetByName('Logboek');
  if (!sheet) return map;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const gebruiker = (rows[i][7] || '').toString().trim().toLowerCase();
    if (gebruiker === 'systeem') continue;
    const ts = new Date(rows[i][0]);
    if (isNaN(ts)) continue;
    const key = (rows[i][1] || '').toString().trim() + '|' + (rows[i][2] || '').toString().trim().toUpperCase();
    if (!map[key] || ts > map[key]) map[key] = ts;
  }
  return map;
}

// ── 1. Herhaalregels: taken klaarzetten zodra (deadline − dagenVooraf) is bereikt ──
function cd_hr_zetTakenKlaar() {
  const ss = SpreadsheetApp.getActive();
  const hr = ss.getSheetByName(HR_SHEET);
  if (!hr) return;
  const rows = hr.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 1; i < rows.length; i++) {
    try {
      const id = (rows[i][0] || '').toString().trim();
      const status = (rows[i][10] || '').toString().trim().toUpperCase();
      if (!id || status !== 'ACTIEF') continue;
      const dl = cd_parseDate(rows[i][9]);            // J = VolgendeDeadline
      if (!dl) continue;                              // na-afronden zonder datum: wacht
      const dagenVooraf = parseInt(rows[i][8]) || 14; // I
      const zichtbaar = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate() - dagenVooraf);
      if (today.getTime() < zichtbaar.getTime()) continue;
      const sectie = (rows[i][2] || 'OPPAKKEN').toString().trim().toUpperCase();
      const code = (rows[i][3] || '').toString().trim();
      const naam = (rows[i][4] || '').toString().trim();
      const beh  = (rows[i][5] || '').toString().trim();
      const oms  = (rows[i][1] || '').toString().trim();
      const type = (rows[i][6] || '').toString().trim().toLowerCase();
      const dlStr = cd_ddmmyyyy(new Date(dl.getFullYear(), dl.getMonth(), dl.getDate()));
      cd_createTaskRow(sectie, code, naam, oms, beh, dlStr, id);
      const nieuwVolgende = (type === 'na-afronden') ? '' : cd_volgendeDeadlineStr(dl, type, rows[i][7]);
      hr.getRange(i + 1, 10).setValue(nieuwVolgende);                            // J doorschuiven
      hr.getRange(i + 1, 12).setValue(new Date().toISOString() + ' → ' + dlStr); // L = LaatstKlaargezet
      cd_schrijfLogboek(code, sectie, 'Terugkerende taak klaargezet', '', '', oms, 'systeem');
      cd_splitBehandelaar(beh).forEach(function (name) {
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          title: '🔁 Terugkerende taak klaargezet',
          body: code + (naam ? ' · ' + naam : '') + ' — ' + oms,
          url: APP_URL, dedupKey: 'hr-' + id + '-' + dlStr
        });
      });
    } catch (e) { Logger.log('cd_hr_zetTakenKlaar rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── 2. Afgeronde terugkerende taken: 'na afronden'-regels opnieuw inplannen ──
function cd_hr_verwerkAfrondingen() {
  const ss = SpreadsheetApp.getActive();
  const af = ss.getSheetByName('Afgerond');
  const hr = ss.getSheetByName(HR_SHEET);
  if (!af || !hr) return;
  const afData = af.getDataRange().getValues();
  const hrData = hr.getDataRange().getValues();
  for (let i = 0; i < afData.length; i++) {
    const herhaalId = (afData[i][11] || '').toString().trim();   // L in 'Afgerond'
    if (!herhaalId) continue;
    try {
      for (let j = 1; j < hrData.length; j++) {
        if ((hrData[j][0] || '').toString().trim() !== herhaalId) continue;
        const type = (hrData[j][6] || '').toString().trim().toLowerCase();
        const status = (hrData[j][10] || '').toString().trim().toUpperCase();
        if (type === 'na-afronden' && status === 'ACTIEF') {
          const afgerondOp = cd_parseDate(afData[i][8]) || new Date(); // I = afgerond op
          hr.getRange(j + 1, 10).setValue(cd_volgendeDeadlineStr(afgerondOp, 'na-afronden', hrData[j][7]));
        }
        break;
      }
    } catch (e) { Logger.log('cd_hr_verwerkAfrondingen rij ' + (i + 1) + ' fout: ' + e); }
    af.getRange(i + 1, 12).setValue(''); // markeer verwerkt — voorkomt dubbele verwerking
  }
}

// ── 3. Wakker geworden weggelegde taken: één push op de opvolgdag zelf ──
function cd_opvolgWakker() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let curSec = null;
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if (['VvE Code', 'VvE-Code'].indexOf((data[i][0] + '').trim()) !== -1) continue;
    try {
      const opvolg = cd_parseDate(data[i][11]);   // L
      if (!opvolg) continue;
      const d = new Date(opvolg.getFullYear(), opvolg.getMonth(), opvolg.getDate());
      if (d.getTime() !== today.getTime()) continue; // alleen de dag zelf; digest dekt de rest
      const code = (data[i][0] || '').toString().trim();
      const naam = (data[i][1] || '').toString().trim();
      const beh  = (data[i][4] || '').toString().trim(); // E
      cd_splitBehandelaar(beh).forEach(function (name) {
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          title: '🔔 Opvolgen vandaag',
          body: code + (naam ? ' · ' + naam : ''),
          url: APP_URL, dedupKey: 'opvolg-' + code + '-' + cd_ddmmyyyy(today)
        });
      });
    } catch (e) { Logger.log('cd_opvolgWakker rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── 4. Stille dossiers: twee-traps escalatie met stempel in kolom N ──
// Scope = zelfde als de 'Stil'-pil: in behandeling; OFFERTE-TRAJECTEN (geen
// in-behandeling-veld) telt als geheel mee. Weggelegde taken slaan we over.
function cd_escaleerStilleDossiers() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stilMap = cd_laatsteActiviteitMap();
  let curSec = null;
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if (['VvE Code', 'VvE-Code'].indexOf((data[i][0] + '').trim()) !== -1) continue;
    try {
      const regels = CD_STIL_ESCALATIE_REGELS[curSec];
      if (!regels) continue;
      const code = (data[i][0] || '').toString().trim();
      const naam = (data[i][1] || '').toString().trim();
      const beh  = (data[i][4] || '').toString().trim();
      const ib   = ((data[i][7] || '') + '').toString().toUpperCase() === 'TRUE';
      if (!ib && curSec !== 'OFFERTE-TRAJECTEN') continue;
      const opvolg = cd_parseDate(data[i][11]);
      if (opvolg && opvolg.getTime() > today.getTime()) continue; // weggelegd
      const laatst = stilMap[code + '|' + curSec];
      if (!laatst) continue; // geen activiteit-data → niet escaleren (zelfde keuze als bepaalStil)
      const dagen = Math.floor((today.getTime() - new Date(laatst.getFullYear(), laatst.getMonth(), laatst.getDate()).getTime()) / 86400000);
      const esc = (data[i][13] || '').toString();   // N
      const cel = sheet.getRange(i + 1, 14);
      if (dagen < regels.trap1) { if (esc) cel.setValue(''); continue; } // activiteit hervat → reset
      if (dagen >= regels.trap2 && esc.indexOf('T2') === -1) {
        cel.setValue((esc ? esc + '|' : '') + 'T2:' + cd_ddmmyyyy(today));
        cd_notifyByExternalId('Jer', 'n_assigned', '1', {
          title: '⚠️ Stil dossier — escalatie',
          body: code + (naam ? ' · ' + naam : '') + ' — ' + dagen + ' dagen geen activiteit (' + (beh || 'geen behandelaar') + ')',
          url: APP_URL, dedupKey: 'esc2-' + code + '-' + cd_ddmmyyyy(today)
        });
      } else if (dagen >= regels.trap1 && esc.indexOf('T1') === -1) {
        cel.setValue('T1:' + cd_ddmmyyyy(today));
        cd_splitBehandelaar(beh).forEach(function (name) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '🔕 Stil dossier — ' + dagen + ' dagen geen activiteit',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'esc1-' + code + '-' + cd_ddmmyyyy(today)
          });
        });
      }
    } catch (e) { Logger.log('cd_escaleerStilleDossiers rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── Setup (1× per omgeving draaien): tab + kolomkoppen ──
function cd_setupFase4() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hr = ss.getSheetByName(HR_SHEET);
  if (!hr) {
    hr = ss.insertSheet(HR_SHEET);
    hr.appendRow(['ID','Omschrijving','Sectie','VvE-code','VvE','Behandelaar','Type','IntervalMnd','DagenVooraf','VolgendeDeadline','Status','LaatstKlaargezet']);
    hr.setFrozenRows(1);
  }
  const ntd = ss.getSheetByName(NTD_SHEET);
  const data = ntd.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) === -1) continue;
    // kopregel kan 1-3 rijen onder de sectie-kop liggen (soms is er een verdwaalde rij tussen geplakt)
    for (let j = i + 1; j <= Math.min(i + 3, data.length - 1); j++) {
      const v = (data[j][0] || '').toString().trim();
      if (v === 'VvE Code' || v === 'VvE-Code') {
        ntd.getRange(j + 1, 12, 1, 3).setValues([['Opvolgdatum', 'HerhaalID', 'Esc']]);
        break;
      }
    }
  }
  Logger.log('✓ Fase 4-setup klaar: tab "' + HR_SHEET + '" + kolomkoppen L/M/N.');
}

function cd_installeerOpvolgingTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'cd_opvolgingMotor'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cd_opvolgingMotor').timeBased().atHour(6).nearMinute(30).everyDays(1).create();
  Logger.log('✓ Dagelijkse opvolging-motor (±06:30) ingesteld.');
}

// Handmatige test vanuit de editor: draait de motor direct.
function cd_testMotor() { cd_opvolgingMotor(); }
```

- [ ] **Step 2: `cd_createTaskRow` uitbreiden** (Notifications.gs r.547): signatuur wordt

```js
function cd_createTaskRow(categorie, code, naam, actiepunt, behandelaar, deadline, herhaalId) {
```

en direct ná de `deadline`-regel (r.581):

```js
  if (herhaalId) sheet.getRange(insertRow, 13).setValue(herhaalId);  // M = Herhaal-ID (Fase 4)
```

(Bestaande aanroepen geven 6 argumenten mee → `herhaalId` is `undefined` → ongewijzigd gedrag.)

- [ ] **Step 3: `cd_dailySummary` vervangen** (Notifications.gs r.255-297) door de verrijkte versie:

```js
function cd_dailySummary() {
  cd_safeRun('cd_dailySummary', () => {
    const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    let curSec = null;
    const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
    const BEH_COL = { 'OPPAKKEN': 4, 'VERGADERVERZOEKEN': 4, 'OFFERTE-TRAJECTEN': 4, 'LOD': 4 };
    const DEADLINE_COL = { 'OPPAKKEN': 3, 'VERGADERVERZOEKEN': 5, 'OFFERTE-TRAJECTEN': 5, 'LOD': 5 };
    const today = new Date(); today.setHours(0,0,0,0);
    const stilMap = cd_laatsteActiviteitMap(); // Opvolging.gs

    const perPerson = {};
    for (let i = 0; i < data.length; i++) {
      const first = (data[i][0] || '').toString().trim().toUpperCase();
      if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
      if (!curSec || !data[i][0]) continue;
      if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

      const code = (data[i][0] || '').toString().trim();
      const beh = (data[i][BEH_COL[curSec]] || '').toString().trim();
      if (!beh) continue;
      const opvolg = cd_parseDate(data[i][11]);   // L = Opvolgdatum (Fase 4)
      const weggelegd = !!(opvolg && opvolg.getTime() > today.getTime());
      const dl = cd_parseDate(data[i][DEADLINE_COL[curSec]]);
      const ib = ((data[i][7] || '') + '').toString().toUpperCase() === 'TRUE';
      const sec = curSec;
      cd_splitBehandelaar(beh).forEach(name => {
        if (!perPerson[name]) perPerson[name] = { secs:{}, telaat:0, opvolgen:0, stil:0 };
        const p = perPerson[name];
        p.secs[sec] = (p.secs[sec] || 0) + 1;
        if (!weggelegd && dl && dl.getTime() < today.getTime()) p.telaat++;
        if (opvolg && opvolg.getTime() <= today.getTime()) p.opvolgen++;
        const regels = CD_STIL_ESCALATIE_REGELS[sec];
        if (!weggelegd && regels && (ib || sec === 'OFFERTE-TRAJECTEN')) {
          const laatst = stilMap[code + '|' + sec];
          if (laatst) {
            const dagen = Math.floor((today.getTime() - new Date(laatst.getFullYear(), laatst.getMonth(), laatst.getDate()).getTime()) / 86400000);
            if (dagen >= regels.trap1) p.stil++;
          }
        }
      });
    }

    Object.keys(perPerson).forEach(name => {
      try {
        const p = perPerson[name];
        const total = Object.values(p.secs).reduce((a,b) => a+b, 0);
        const parts = [];
        if (p.telaat)   parts.push('⚠ ' + p.telaat + ' te laat');
        if (p.opvolgen) parts.push('🔔 ' + p.opvolgen + ' opvolgen');
        if (p.stil)     parts.push('🔕 ' + p.stil + ' stil');
        if (p.secs['OPPAKKEN']) parts.push(p.secs['OPPAKKEN'] + ' oppakken');
        if (p.secs['VERGADERVERZOEKEN']) parts.push(p.secs['VERGADERVERZOEKEN'] + ' vergaderverzoek' + (p.secs['VERGADERVERZOEKEN']>1?'en':''));
        if (p.secs['OFFERTE-TRAJECTEN']) parts.push(p.secs['OFFERTE-TRAJECTEN'] + ' offerte-traject' + (p.secs['OFFERTE-TRAJECTEN']>1?'en':''));
        if (p.secs['LOD']) parts.push(p.secs['LOD'] + ' LOD');

        cd_notifyByExternalId(name, 'n_daily', '1', {
          title: '☀️ Goedemorgen — ' + total + ' open ' + (total===1?'taak':'taken'),
          body: parts.join(' · '),
          url: APP_URL
        });
      } catch (e) { Logger.log('cd_dailySummary persoon ' + name + ' fout: ' + e); }
    });
  });
}
```

- [ ] **Step 4: Push** — `git add apps-script/ && git commit -m "Fase 4: dagelijkse opvolging-motor, setup en verrijkte 08:30-digest (Apps Script)" && git push`. De CI pusht automatisch naar het TEST-script. Controleer dat de GitHub Action groen is: `gh run list --limit 1`.

---

### Task 8: Test-Sheet inrichten + trigger in TEST-omgeving

**Files:** geen (Apps Script-editor van het TEST-script + test-Sheet)

- [ ] **Step 1:** Open het TEST-script (script-ID `1MPRK1OVZvQ-wh9gEsLh7NvzpUiTPlSSMMU09alQgTt0ReGK8FLftStc1`, bound aan "Collectief Dashboard - Kopie"). Controleer dat `Opvolging.gs` er na de CI-run in staat.
- [ ] **Step 2:** Draai in de editor 1× `cd_setupFase4` (maakt tab "Herhaalregels" + kolomkoppen L/M/N) en daarna 1× `cd_installeerOpvolgingTrigger`. Autorisatie-prompt accepteren.
- [ ] **Step 3:** Verifieer in de test-Sheet: tab "Herhaalregels" bestaat met 12 kolomkoppen; in "Nog Te Doen" staan per sectie de koppen Opvolgdatum/HerhaalID/Esc in L/M/N van de kopregel.

*(Dit kan Claude met de Google Sheets-tools verifiëren; het draaien van de twee functies gebeurt via de browser — met de gebruiker of via Chrome-tools.)*

---

### Task 9: End-to-end verificatie op staging

**Files:** geen (staging-URL + test-Sheet + TEST-script)

Op `https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`:

- [ ] **Scenario A — unit-tests live:** open `…?test=1` → console `0 FAIL`.
- [ ] **Scenario B — wegleggen:** log in (of laat de gebruiker meekijken): taak wegleggen (+1 week) → taak zakt gedempt naar "Weggelegd"; logboek-regel "Weggelegd"; kolom L in test-Sheet gevuld. Daarna "Wissen" → terug naar normaal.
- [ ] **Scenario C — wakker worden:** zet via de Sheets-tools de Opvolgdatum (L) van een testtaak op vandaag → herlaad dashboard → taak staat bovenin met pil "🔔 Opvolgen vandaag"; draai `cd_testMotor` in de TEST-editor → push-melding verschijnt (test-OneSignal) en blijft bij herhaald draaien uniek (dedupKey).
- [ ] **Scenario D — herhaalregel kalender:** maak via de nieuwe pagina een regel "TEST kwartaalcontrole", VvE-testcode, kwartaal, eerstvolgende deadline = vandaag + 10 dagen, 14 dagen vooraf → draai `cd_testMotor` → taak verschijnt in "Nog Te Doen" met deadline en Herhaal-ID in M; regel toont "Volgende keer" = +3 maanden; nogmaals `cd_testMotor` → géén tweede taak (idempotent).
- [ ] **Scenario E — na afronden:** maak regel type "na-afronden" (2 mnd); zet handmatig een taak klaar via een kalender-truc óf wijzig de regel naar deadline=vandaag en draai de motor; rond de klaargezette taak af in het dashboard → draai `cd_testMotor` → regel krijgt VolgendeDeadline = afronddatum + 2 maanden; kolom L in "Afgerond" is leeggemaakt.
- [ ] **Scenario F — escalatie:** zet bij een testtaak "In behandeling" aan en zorg dat de laatste logboek-regel >7 dagen oud is (timestamp in Logboek-tab tijdelijk terugzetten) → motor → kolom N krijgt `T1:…` + push; timestamp >14 dagen → motor → `T2:…` + push naar Jer; timestamp vers → motor → N leeg (reset).
- [ ] **Scenario G — digest:** draai `cd_dailySummary` in de TEST-editor → melding bevat te laat/opvolgen/stil-delen.
- [ ] **Scenario H — regressie:** taak toevoegen, bewerken, afronden + undo, verwijderen + undo werken nog; subcategorie blijft na undo behouden (J).
- [ ] **Opruimen:** testtaken/-regels uit de test-Sheet verwijderen.
- [ ] **Commit** eventuele fixes; rapporteer bevindingen aan de gebruiker.

---

### Task 10: GO-gate → productie

- [ ] **Step 1:** Samenvatting + bewijs (screenshots/telling) aan de gebruiker; **expliciete GO vragen.** ⛔ Niet verder zonder GO.
- [ ] **Step 2 (na GO):** `git checkout main && git merge staging && git push` → GitHub Pages + CI naar PROD-script (`gh run list` groen).
- [ ] **Step 3:** In het PROD-script (ID `1BALy8QbzWr7DbJy_RjYi7m-c6HdNDRs_47ndYcKV_cFIHh6GDR-GicKF`) 1× `cd_setupFase4` + 1× `cd_installeerOpvolgingTrigger` draaien.
- [ ] **Step 4:** Live-verificatie op `vvebeheercollectief.github.io/Collectief-Dashboard`: `?test=1` → 0 FAIL; Herhaalregels-pagina zichtbaar; één taak proef-wegleggen en weer wissen.
- [ ] **Step 5:** `git checkout staging && git merge main && git push` (branches gelijk houden); geheugen bijwerken (Fase 4 live).

---

## Zelf-review (uitgevoerd bij het schrijven)

- **Spec-dekking:** wegleggen (T3+T4), herhaalregels (T6+T7), escalatie (T7), digest (T7), randgevallen (deadline-wint in snooze.js; verwijderde taak → kalender-regel komt terug, na-afronden-regel wacht — zichtbaar als "wacht op afronden"; rijen verplaatst → motor zoekt op Herhaal-ID via kolom M/L-waarden, niet op rijnummer; ontbrekend tabblad → `cd_safeRun` + `getSheetByName`-null-checks).
- **Bewuste keuzes t.o.v. spec:** (1) kalender-regels schuiven hun "Volgende deadline" al door bij het klaarzetten (i.p.v. bij afronden) — eenvoudiger en je ziet de volgende keer eerder; gedrag voor de gebruiker identiek. (2) Escalatie-scope volgt de bestaande stil-pil (in behandeling), met OFFERTE-TRAJECTEN als geheel omdat die sectie geen in-behandeling-veld heeft. (3) Herhaalregels-UI beperkt tot secties OPPAKKEN en LOD (de enige met een vrij actiepunt-veld) — YAGNI.
- **Bekende beperking:** undo van een afgeronde terugkerende taak nádat de motor al gedraaid heeft kan één extra cyclus-update geven (zeldzaam; motor draait 1×/dag om 06:30).
- **Type-consistentie:** kolomindices overal L/M/N = 0-geteld 11/12/13 = 1-geteld 12/13/14; Herhaalregels A–L; `opvolgStatus`/`volgendeDeadline` namen consistent in util.js, tests.js, snooze.js, render-herhaal.js; Apps Script-spiegels heten `cd_volgendeDeadlineStr`/`CD_STIL_ESCALATIE_REGELS` met SYNC-opmerkingen.
