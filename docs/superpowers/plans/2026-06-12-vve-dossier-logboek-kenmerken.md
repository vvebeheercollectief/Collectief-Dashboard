# VvE-dossier (logboek + beheerderskenmerken) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-VvE-pagina verrijken met een volle-breedte dossier-logboek (incl. handmatige contactmomenten) en een bewerkbaar Beheerderskenmerken-paneel (nieuw Sheet-tabblad `Kenmerken`), conform spec `docs/superpowers/specs/2026-06-12-vve-dossier-logboek-kenmerken-design.md`.

**Architecture:** Frontend-only op het bestaande modulaire patroon (ES-modules zonder bundler, data-action klik-registry, optimistische writes via `backgroundWrite`). Contactmomenten hergebruiken het bestaande `Logboek`-tabblad (actie=`Contact`); kenmerken krijgen een nieuw tabblad `Kenmerken` (A:F, upsert per VvE-code) met audit-regels (actie=`Kenmerk`) in het logboek.

**Tech Stack:** Vanilla ES-modules, Google Sheets API (OAuth van ingelogde gebruiker), in-app testsuite (`?test=1`, uitslag in `window._testResult`).

**Werkwijze:** Alles op branch `staging`. Testen lokaal: `python3 -m http.server 8123` en dan `http://127.0.0.1:8123/index.html?test=1` openen (LET OP browsercache-les: na een edit verifiëren via een verse tab of de ándere origin localhost↔127.0.0.1). Huidige stand vóór dit werk: **116 OK, 0 FAIL**.

---

### Task 1: Data-laag kenmerken (`src/kenmerken.js` — pure helpers + tests)

**Files:**
- Create: `src/kenmerken.js`
- Modify: `src/state.js` (D.kenmerken + nieuwe state-velden)
- Modify: `src/tests.js` (nieuwe tests)

- [x] **Step 1: Schrijf de failing tests** — in `src/tests.js`, ná het `vveOverzicht`-blok (regel ~153), met import bovenaan bij de andere imports:

```js
import { parseKenmerken, vveKenmerken } from "./kenmerken.js";
```

```js
  // ── kenmerken ── (VvE-dossier: tab 'Kenmerken' A:F, laatste rij per code wint)
  const _kmkRows=[
    ['Code','Balkons','Kozijnen','Bron','GewijzigdDoor','GewijzigdOp'],
    ['X1','Ja','Nee','akte art. 17','info@vvebeheercollectief.nl','2026-06-12T10:00:00.000Z'],
    ['X2','','Deels','','',''],
    ['',  'Ja','','','',''],                 // lege code → genegeerd
    ['X1','Deels','Nee','akte art. 18','info@vvebeheercollectief.nl','2026-06-12T11:00:00.000Z'], // dubbel → laatste wint
  ];
  const _kmk=parseKenmerken(_kmkRows);
  eq('kenmerken aantal (dedupe)', _kmk.length, 2);
  eq('kenmerken laatste wint', _kmk.find(k=>k.code==='X1').balkons, 'Deels');
  eq('kenmerken _row laatste', _kmk.find(k=>k.code==='X1')._row, 5);
  eq('kenmerken leeg blad', parseKenmerken([]), []);
  eq('kenmerken alleen kop', parseKenmerken([_kmkRows[0]]), []);
  eq('vveKenmerken gevonden', vveKenmerken('X2',{kenmerken:_kmk}).kozijnen, 'Deels');
  eq('vveKenmerken default', vveKenmerken('ZZZ',{kenmerken:_kmk}).balkons, '');
  eq('vveKenmerken default row', vveKenmerken('ZZZ',{kenmerken:_kmk})._row, 0);
```

- [x] **Step 2: Run de tests, verifieer FAIL** — server starten, `http://127.0.0.1:8123/index.html?test=1` laden; verwacht: module-importfout (kenmerken.js bestaat niet) of FAILs in console.

- [x] **Step 3: Maak `src/kenmerken.js`** met de pure helpers (schrijflogica komt in Task 4):

```js
// ══════════════════════════════════════
//  KENMERKEN — beheerderskenmerken per VvE (tab 'Kenmerken', kolommen A:F)
//  A=code  B=balkons  C=kozijnen  D=bron  E=gewijzigdDoor  F=gewijzigdOp
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { writeRange, appendRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { backgroundWrite } from "./data.js";
import { logEvent } from "./render-overig.js";
import { getCurrentWho } from "./notifications.js";
import { renderVve } from "./render-vve.js";
// (kringverwijzing kenmerken ⇄ render-vve: zelfde live-bindings-patroon als crud ⇄ main)

export const KENMERK_WAARDEN = ['Onbekend','Ja','Nee','Deels'];

// Pure parser: laatste rij per code wint (vangnet tegen dubbele appends)
function parseKenmerken(rows){
  if(!rows||rows.length<2) return [];
  const per={};
  rows.slice(1).forEach((r,i)=>{
    const code=((r&&r[0])||'').trim();
    if(!code) return;
    per[code]={_row:i+2,code,balkons:(r[1]||'').trim(),kozijnen:(r[2]||'').trim(),
      bron:(r[3]||'').trim(),gewijzigdDoor:(r[4]||'').trim(),gewijzigdOp:(r[5]||'').trim()};
  });
  return Object.values(per);
}

// Pure helper: kenmerk-record van één VvE, of leeg default — testbaar zonder DOM
function vveKenmerken(code, data){
  return (data.kenmerken||[]).find(k=>k.code===code)
    || {_row:0,code,balkons:'',kozijnen:'',bron:'',gewijzigdDoor:'',gewijzigdOp:''};
}

export { parseKenmerken, vveKenmerken };
```

- [x] **Step 4: Breid `src/state.js` uit** — in de `D`-export `kenmerken:[]` toevoegen en in `state` vier velden (onder het Fase 5-blok):

```js
export const D = {ntd:{},af:{},alvo:[],alfa:[],ontw:[],logboek:[],herhaal:[],kenmerken:[],ntdSecInfo:{},afSecInfo:{}};
```

```js
  // VvE-dossier (logboek + kenmerken)
  kenmerkenEdit: false,    // kenmerken-paneel in bewerkmodus
  vveLogFilter: 'alles',   // 'alles' | 'contact'
  _vveLogAlles: false,     // dossier-feed volledig uitgeklapt
  _contactSoort: 'Telefoon',
```

- [x] **Step 5: Run de tests, verifieer PASS** — verwacht `window._testResult` = **124 OK, 0 FAIL**.

- [x] **Step 6: Commit**

```bash
git add src/kenmerken.js src/state.js src/tests.js
git commit -m "feat(dossier): kenmerken-datalaag (parseKenmerken/vveKenmerken) + state"
```

---

### Task 2: Logboek-vocabulaire uitbreiden (`Contact` + `Kenmerk`)

**Files:**
- Modify: `src/render-overig.js` (logZin, actieBadge, renderLogboek-extra's, gedeelde logItemHtml)
- Modify: `src/tests.js`

- [x] **Step 1: Schrijf de failing tests** — in `src/tests.js` direct onder de bestaande logZin-tests (regel ~71):

```js
  truthy('logZin Contact bevat "sprak"', logZin({actie:'Contact', code:'TEST01', veld:'Telefoon', oudeWaarde:'Bewoner/eigenaar', gebruiker:'info@vvebeheercollectief.nl'}).includes('sprak'));
  truthy('logZin Contact toont soort', logZin({actie:'Contact', code:'TEST01', veld:'Telefoon', oudeWaarde:'Bestuur', gebruiker:'info@vvebeheercollectief.nl'}).includes('Telefoon'));
  truthy('logZin Kenmerk bevat "kenmerk"', logZin({actie:'Kenmerk', code:'TEST01', veld:'Balkons', gebruiker:'info@vvebeheercollectief.nl'}).includes('kenmerk'));
```

- [x] **Step 2: Run de tests, verifieer FAIL** (3 nieuwe FAILs — default-case bevat 'sprak'/'kenmerk' niet).

- [x] **Step 3: Implementeer** — in `src/render-overig.js`:

(a) twee cases in `logZin` (vóór `default:`):

```js
    case'Contact':             return A('sprak','var(--ac)')+`met ${esc(r.oudeWaarde||'—')} bij `+chip+` <span style="color:var(--mut)">· ${esc(r.veld||'')}</span>`;
    case'Kenmerk':             return A('wijzigde','var(--pu)')+`kenmerk <b>${esc(r.veld||'')}</b> bij `+chip;
```

(b) twee items in de `actieBadge`-map:

```js
    'Contact':['--sec:var(--ac);--sec-l:var(--ac-l)','📞'],
    'Kenmerk':['--sec:var(--pu);--sec-l:var(--pu-l)','📋'],
```

(c) extract het log-item-bouwblok uit `renderLogboek` naar een gedeelde, geëxporteerde functie (DRY met de dossier-feed van Task 5), en laat `renderLogboek` 'm gebruiken. De `extra`-condities krijgen meteen `Kenmerk` (oud→nieuw) en `Contact` (citaat) erbij:

```js
// Eén logregel als HTML (gedeeld door Logboek-pagina en VvE-dossier-feed)
function logItemHtml(r){
  let extra='';
  if((r.actie==='Behandelaar gewijzigd'||r.actie==='Bewerkt'||r.actie==='Kenmerk') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
    extra=`<div class="log-change"><span class="old">${esc(r.oudeWaarde||'—')}</span><span class="arr">→</span><span class="new">${esc(r.nieuweWaarde||'—')}</span></div>`;
  }
  if((r.actie==='Opmerking'||r.actie==='Contact') && r.nieuweWaarde){
    extra=`<div class="log-note">"${esc(r.nieuweWaarde)}"</div>`;
  }
  const init=(displayName(r.gebruiker)||'?').charAt(0).toUpperCase();
  return `<div class="log-item">
    <span class="log-av" style="background:${avatarKleur(displayName(r.gebruiker))}">${esc(init)}</span>
    <div class="log-body"><div class="log-line">${logZin(r)}</div>${extra}</div>
    <span class="log-time">${esc(logTijd(r.timestamp))}</span>
  </div>`;
}
```

In `renderLogboek` vervalt de inline opbouw; de forEach wordt:

```js
    sl.forEach(r=>{
      const dag=logDayLabel(r.timestamp);
      if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
      html+=logItemHtml(r);
    });
```

(d) `logItemHtml` toevoegen aan de export-lijst van `render-overig.js`.

- [x] **Step 4: Run de tests, verifieer PASS** — verwacht **127 OK, 0 FAIL**. Controleer ook visueel niets stuk op de Logboek-pagina (geen login nodig om te laden; rendering met lege data volstaat als rooktest via testrun zonder errors in console).

- [x] **Step 5: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "feat(dossier): logZin/actieBadge voor Contact en Kenmerk + gedeeld logItemHtml"
```

---

### Task 3: `Kenmerken`-tab meeladen in `src/data.js`

**Files:**
- Modify: `src/data.js`

- [x] **Step 1: Implementeer** — drie kleine edits in `src/data.js`:

(a) import bovenaan: `import { parseKenmerken } from "./kenmerken.js";`
   LET OP kringgevaar: `kenmerken.js` importeert `backgroundWrite` uit `data.js` en `data.js` importeert `parseKenmerken` uit `kenmerken.js`. Beide aanroepen gebeuren op runtime (niet tijdens module-init), dus dit is veilig met live bindings — zelfde patroon als `crud ⇄ main`.

(b) in `loadAll` de Promise.all uitbreiden (na `Herhaalregels`):

```js
      fetchSheet("Kenmerken").catch(()=>[]),
```

en de destructuring: `const[ntdR,afR,alvoR,alfaR,ontwR,logR,hhR,kmkR]=await Promise.all([`

(c) na `D.herhaal=parseHerhaal(hhR);`:

```js
    D.kenmerken=parseKenmerken(kmkR);
```

en de hash-regel wordt:

```js
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek,D.herhaal,D.kenmerken]);
```

- [x] **Step 2: Run de tests** — verwacht nog steeds **127 OK, 0 FAIL** en géén console-errors bij het laden.

- [x] **Step 3: Commit**

```bash
git add src/data.js
git commit -m "feat(dossier): Kenmerken-tab meeladen + in render-hash"
```

---

### Task 4: Kenmerken-paneel op de VvE-pagina (weergave + bewerkmodus + opslaan)

**Files:**
- Modify: `src/kenmerken.js` (saveKenmerken)
- Modify: `src/render-vve.js` (kaart i.p.v. "Recente activiteit")
- Modify: `src/actions.js` (3 acties)
- Modify: `styles.css`
- Modify: `src/tests.js` (actions-dekking)

- [x] **Step 1: Schrijf de failing test** — in `src/tests.js` de `VERWACHTE_ACTIES`-lijst uitbreiden met:

```js
'kenmerken-bewerken','kenmerken-opslaan','kenmerken-annuleren',
```

- [x] **Step 2: Run, verifieer FAIL** (3 FAILs: acties bestaan nog niet).

- [x] **Step 3: `saveKenmerken` in `src/kenmerken.js`** (onder `vveKenmerken`, en aan de export toevoegen). Besluit upsert-rij op klikmoment; `Onbekend` wordt als lege cel opgeslagen; alleen écht gewijzigde velden krijgen een audit-regel:

```js
// Opslaan vanuit de bewerkmodus van het kenmerken-paneel (VvE-pagina).
// Optimistisch: lokaal bijwerken + audit-regels in D.logboek; serieel wegschrijven.
async function saveKenmerken(){
  const code=state.vveCode;
  if(!code) return;
  const norm=v=>v==='Onbekend'?'':(v||'').trim();
  const nieuw={
    balkons:norm(document.getElementById('kmk-balkons')?.value),
    kozijnen:norm(document.getElementById('kmk-kozijnen')?.value),
    bron:(document.getElementById('kmk-bron')?.value||'').trim(),
  };
  const oud=vveKenmerken(code,D);
  const gewijzigd=[['Balkons','balkons'],['Kozijnen','kozijnen'],['Bron','bron']]
    .filter(([,k])=>nieuw[k]!==(oud[k]||''));
  state.kenmerkenEdit=false;
  if(!gewijzigd.length){ renderVve(); return; }
  if(!await ensureToken()){ renderVve(); alert('Inloggen mislukt.'); return; }
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const sn={...oud};                       // snapshot voor rollback
  let rec=(D.kenmerken||[]).find(k=>k.code===code);
  if(!rec){ rec={...oud}; D.kenmerken.push(rec); }
  Object.assign(rec,nieuw,{gewijzigdDoor:who,gewijzigdOp:ts});
  gewijzigd.forEach(([lbl,k])=>{
    logEvent(code,'','Kenmerk',lbl,oud[k]||'',nieuw[k]||'');
    D.logboek.unshift({_row:0,timestamp:ts,code,sectie:'',actie:'Kenmerk',veld:lbl,
      oudeWaarde:oud[k]||'',nieuweWaarde:nieuw[k]||'',gebruiker:who});
  });
  renderVve();
  const waarden=[code,rec.balkons,rec.kozijnen,rec.bron,who,ts];
  const rij=sn._row;                        // 0 = nog geen rij → append
  backgroundWrite(
    ()=> rij>0 ? writeRange(`'Kenmerken'!A${rij}:F${rij}`,waarden)
               : appendRange("'Kenmerken'!A:F",waarden),
    ()=>{ Object.assign(rec,sn); },
    'Kenmerken opslaan'
  );
}
```

en exporteren: `export { parseKenmerken, vveKenmerken, saveKenmerken };`

- [x] **Step 4: Kaart in `src/render-vve.js`** —

(a) imports uitbreiden:

```js
import { avatarKleur, logZin, logTijd, fmtLogTs, logItemHtml, logDayLabel } from "./render-overig.js";
import { vveKenmerken, KENMERK_WAARDEN } from "./kenmerken.js";
```

(b) helpers boven `renderVve`:

```js
// Kenmerken-kaart: weergave- of bewerkmodus (Beheerderskenmerken)
const KMK_PIL={'Ja':'background:var(--gn-l);color:var(--gn)','Nee':'background:var(--rd-l);color:var(--rd)','Deels':'background:var(--am-l);color:var(--am)'};
const kmkPil=v=>{const w=v||'Onbekend';return `<span class="badge" style="${KMK_PIL[w]||'background:var(--sur2);color:var(--mut)'}">${esc(w)}</span>`;};
function kenmerkenKaart(code){
  const k=vveKenmerken(code,D);
  if(state.kenmerkenEdit){
    const sel=(id,val)=>`<select id="${id}">${KENMERK_WAARDEN.map(w=>`<option${(val||'Onbekend')===w?' selected':''}>${w}</option>`).join('')}</select>`;
    return `<div class="kmk-rij"><span>Balkons gemeenschappelijk</span>${sel('kmk-balkons',k.balkons)}</div>
      <div class="kmk-rij"><span>Kozijnen gemeenschappelijk</span>${sel('kmk-kozijnen',k.kozijnen)}</div>
      <div class="kmk-bron-lbl">Bron</div>
      <textarea id="kmk-bron" rows="2" placeholder="bv. splitsingsakte art. 17, mail gemeente 03-2024">${esc(k.bron)}</textarea>
      <div class="kmk-knoppen">
        <button class="btn btn-sec btn-sm" data-action="kenmerken-annuleren">Annuleren</button>
        <button class="btn btn-pri btn-sm" data-action="kenmerken-opslaan">Opslaan</button>
      </div>`;
  }
  const wijz=k.gewijzigdOp?`<div class="kmk-wijz">laatst gewijzigd door ${esc(displayName(k.gewijzigdDoor)||'?')} · ${esc(fmtLogTs(k.gewijzigdOp))}</div>`:'';
  return `<div class="kmk-rij"><span>Balkons gemeenschappelijk</span>${kmkPil(k.balkons)}</div>
    <div class="kmk-rij"><span>Kozijnen gemeenschappelijk</span>${kmkPil(k.kozijnen)}</div>
    <div class="kmk-bron-lbl">Bron</div>
    <div class="kmk-bron">${k.bron?esc(k.bron):'<span style="color:var(--mut)">Nog geen bron vastgelegd</span>'}</div>${wijz}`;
}
```

(c) in de rechterkolom van de `wrap.innerHTML`-template vervangt dit blok het huidige "Recente activiteit"-blok (de `actiKaart`-const en zijn gebruik verwijderen):

```js
        <div class="vve-sectie" style="margin-top:18px">Beheerderskenmerken
          ${state.kenmerkenEdit?'':'<button class="btn btn-sec btn-sm" data-action="kenmerken-bewerken" style="margin-left:auto">✎ Bewerken</button>'}
        </div>
        <div class="vve-kaart">${kenmerkenKaart(code)}</div>
```

(d) in `openVvePagina` de dossier-state resetten (na `state._vveAfAlles=false;`):

```js
  state.kenmerkenEdit=false;
  state.vveLogFilter='alles';
  state._vveLogAlles=false;
```

- [x] **Step 5: Acties in `src/actions.js`** — import + registry:

```js
import { saveKenmerken } from './kenmerken.js';
```

```js
  'kenmerken-bewerken':    ()   => { state.kenmerkenEdit=true; renderVve(); },
  'kenmerken-opslaan':     ()   => saveKenmerken(),
  'kenmerken-annuleren':   ()   => { state.kenmerkenEdit=false; renderVve(); },
```

- [x] **Step 6: CSS in `styles.css`** — onder het per-VvE-blok (na regel ~545):

```css
    /* Beheerderskenmerken (VvE-pagina) */
    .kmk-rij{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--bor);font-size:13px}
    .kmk-bron-lbl{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin:10px 0 4px}
    .kmk-bron{font-size:12.5px;line-height:1.5;word-break:break-word}
    .kmk-wijz{font-size:11px;color:var(--mut);margin-top:8px}
    .kmk-knoppen{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
    #kmk-bron{width:100%;border:1px solid var(--bor);border-radius:8px;padding:7px 9px;font:inherit;font-size:12.5px;resize:vertical;background:var(--sur)}
    .kmk-rij select{font-size:12.5px;padding:4px 7px;border:1px solid var(--bor);border-radius:7px;background:var(--sur);color:var(--txt)}
```

- [x] **Step 7: Run de tests, verifieer PASS** — verwacht **130 OK, 0 FAIL** (127 + 3 actie-dekking), geen console-errors.

- [x] **Step 8: Commit**

```bash
git add src/kenmerken.js src/render-vve.js src/actions.js styles.css src/tests.js
git commit -m "feat(dossier): Beheerderskenmerken-paneel (weergave/bewerken/opslaan + audit)"
```

---

### Task 5: Dossier-logboek op de VvE-pagina (composer + feed + filter)

**Files:**
- Modify: `src/render-vve.js` (sectie + addContactLog + filterDossierLog)
- Modify: `src/actions.js` (4 acties + Ctrl/Cmd+Enter-delegatie)
- Modify: `styles.css`
- Modify: `src/tests.js`

- [x] **Step 1: Schrijf de failing tests** —

(a) import-regel `vveOverzicht` in `src/tests.js` uitbreiden:

```js
import { vveOverzicht, filterDossierLog } from "./render-vve.js";
```

(b) onder de vveOverzicht-tests:

```js
  // ── filterDossierLog ── (dossier-feed: 'contact' toont alleen handmatige contactmomenten)
  const _dosLog=[{actie:'Contact'},{actie:'Afgerond'},{actie:'Contact'},{actie:'Kenmerk'}];
  eq('dossierfilter alles',   filterDossierLog(_dosLog,'alles').length, 4);
  eq('dossierfilter contact', filterDossierLog(_dosLog,'contact').length, 2);
```

(c) `VERWACHTE_ACTIES` uitbreiden met:

```js
'contact-soort','contact-vastleggen','vve-log-filter','vve-log-alles',
```

- [x] **Step 2: Run, verifieer FAIL** (importfout filterDossierLog of 6 FAILs).

- [x] **Step 3: Implementeer in `src/render-vve.js`** —

(a) extra imports (bovenaan, naast bestaande):

```js
import { backgroundWrite } from "./data.js";
import { appendRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getCurrentWho } from "./notifications.js";
```

(b) helpers boven `renderVve`:

```js
// Dossier-logboek: contactsoorten, filter en feed-opbouw
const CONTACT_SOORTEN=[['Telefoon','📞'],['E-mail','✉️'],['Gesprek','🤝'],['Notitie','📝']];

// Pure helper (testbaar): 'contact' = alleen handmatige contactmomenten
function filterDossierLog(entries, modus){
  return modus==='contact' ? entries.filter(e=>e.actie==='Contact') : entries;
}

function dossierFeed(entries){
  if(!entries.length) return '<div class="log-empty">Nog geen gebeurtenissen in dit dossier.</div>';
  let html='',lastDay='';
  entries.forEach(r=>{
    const dag=logDayLabel(r.timestamp);
    if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
    html+=logItemHtml(r);
  });
  return html;
}

// Handmatig contactmoment vastleggen (composer op de VvE-pagina)
async function addContactLog(){
  const tekst=(document.getElementById('dos-tekst')?.value||'').trim();
  if(!tekst){ alert('Typ eerst wat er gebeurd is.'); return; }
  const code=state.vveCode;
  if(!code) return;
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const soort=state._contactSoort||'Telefoon';
  const wie=document.getElementById('dos-wie')?.value||'Overig';
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const entry={_row:0,timestamp:ts,code,sectie:'',actie:'Contact',veld:soort,oudeWaarde:wie,nieuweWaarde:tekst,gebruiker:who};
  D.logboek.unshift(entry);
  const t=document.getElementById('dos-tekst'); if(t) t.value='';
  renderVve();
  backgroundWrite(
    ()=>appendRange("'Logboek'!A:H",[ts,code,'','Contact',soort,wie,tekst,who]),
    ()=>{ const i=D.logboek.indexOf(entry); if(i>-1) D.logboek.splice(i,1); },
    'Contactmoment vastleggen'
  );
}
```

(c) in `renderVve`, direct na `const o=vveOverzicht(code,D);`, composer-behoud (de 8s-poll re-rendert de pagina; half getypte tekst mag niet verdwijnen — alleen behouden bij dézelfde VvE):

```js
  const _oudT=document.getElementById('dos-tekst');
  const _bewaar=(_oudT&&_oudT.dataset.code===code)?{tekst:_oudT.value,wie:document.getElementById('dos-wie')?.value}:null;
```

en helemaal aan het eind van `renderVve` (na `wrap.innerHTML=...`):

```js
  if(_bewaar){
    const t=document.getElementById('dos-tekst'); if(t) t.value=_bewaar.tekst;
    const w=document.getElementById('dos-wie'); if(w&&_bewaar.wie) w.value=_bewaar.wie;
  }
```

(d) in de `wrap.innerHTML`-template, ná de sluitende `</div>` van `.vve-grid`, de dossier-sectie:

```js
    <div class="vve-sectie" style="margin-top:22px">Dossier-logboek <span class="n">${o.logboek.length}</span>
      <span class="dos-filters">
        <button class="dos-filter${state.vveLogFilter!=='contact'?' aan':''}" data-action="vve-log-filter" data-modus="alles">Alles</button>
        <button class="dos-filter${state.vveLogFilter==='contact'?' aan':''}" data-action="vve-log-filter" data-modus="contact">Alleen contactmomenten</button>
      </span>
    </div>
    <div class="card dossier-card">
      <div class="dos-composer">
        <textarea id="dos-tekst" data-code="${esc(o.code)}" rows="2" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
        <div class="dos-rij">
          <div class="dos-chips">${CONTACT_SOORTEN.map(([s,ico])=>
            `<button class="soort-chip${(state._contactSoort||'Telefoon')===s?' aan':''}" data-action="contact-soort" data-soort="${s}">${ico} ${s}</button>`).join('')}</div>
          <select id="dos-wie" title="Met wie was het contact?">
            <option>Bewoner/eigenaar</option><option>Bestuur</option><option>Leverancier</option><option>Overig</option>
          </select>
          <button class="btn btn-pri btn-sm" data-action="contact-vastleggen">Vastleggen</button>
        </div>
      </div>
      <div class="dos-feed">${dossierFeed(dosEntries.slice(0,dosLimiet))}${dosMeer}</div>
    </div>
```

met vlak vóór de template deze consts:

```js
  const dosEntries=filterDossierLog(o.logboek,state.vveLogFilter);
  const dosLimiet=state._vveLogAlles?dosEntries.length:30;
  const dosMeer=(!state._vveLogAlles&&dosEntries.length>30)
    ?`<button class="btn btn-sec btn-sm" data-action="vve-log-alles" style="margin:10px auto 2px;display:block">Alle ${dosEntries.length} tonen</button>`:'';
```

(e) exports onderaan uitbreiden:

```js
export { vveOverzicht, openVvePagina, renderVve, filterDossierLog, addContactLog };
```

- [x] **Step 4: Acties + sneltoets in `src/actions.js`** —

(a) import uitbreiden: `import { openVvePagina, renderVve, addContactLog } from './render-vve.js';`

(b) registry:

```js
  'contact-soort':         (el) => { state._contactSoort=el.dataset.soort;
    document.querySelectorAll('.soort-chip').forEach(c=>c.classList.toggle('aan',c.dataset.soort===el.dataset.soort)); },
  'contact-vastleggen':    ()   => addContactLog(),
  'vve-log-filter':        (el) => { state.vveLogFilter=el.dataset.modus; state._vveLogAlles=false; renderVve(); },
  'vve-log-alles':         ()   => { state._vveLogAlles=true; renderVve(); },
```

(`contact-soort` togglet klassen ín plaats van re-renderen, zodat de getypte tekst onaangeroerd blijft.)

(c) in `initActions`, na de click-listener, Ctrl/Cmd+Enter-delegatie (element wordt steeds opnieuw aangemaakt, dus document-niveau):

```js
  document.addEventListener('keydown',(e)=>{
    if(e.target&&e.target.id==='dos-tekst'&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      e.preventDefault(); addContactLog();
    }
  });
```

- [x] **Step 5: CSS in `styles.css`** — onder het kmk-blok van Task 4:

```css
    /* Dossier-logboek (VvE-pagina) */
    .dossier-card{padding:14px 16px}
    .dos-composer{background:var(--sur2);border:1px solid var(--bor);border-radius:10px;padding:10px;margin-bottom:12px}
    .dos-composer textarea{width:100%;border:1px solid var(--bor);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;resize:vertical;min-height:44px;background:var(--sur);color:var(--txt)}
    .dos-rij{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
    .dos-chips{display:flex;gap:6px;flex-wrap:wrap}
    .soort-chip{border:1px solid var(--bor);background:var(--sur);color:var(--mut);border-radius:20px;padding:4px 11px;font-size:12px;font-weight:600;cursor:pointer;transition:all var(--tr)}
    .soort-chip.aan{background:var(--ac-l);border-color:var(--ac-b);color:var(--ac)}
    #dos-wie{margin-left:auto;font-size:12.5px;padding:6px 8px;border:1px solid var(--bor);border-radius:8px;background:var(--sur);color:var(--txt)}
    .dos-filters{margin-left:auto;display:inline-flex;gap:5px}
    .dos-filter{border:1px solid var(--bor);background:var(--sur);color:var(--mut);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0;text-transform:none;transition:all var(--tr)}
    .dos-filter.aan{background:var(--ac-l);border-color:var(--ac-b);color:var(--ac)}
    @media(max-width:700px){#dos-wie{margin-left:0}}
```

- [x] **Step 6: Run de tests, verifieer PASS** — verwacht **136 OK, 0 FAIL** (130 + 2 filter + 4 actie-dekking), geen console-errors.

- [x] **Step 7: Commit**

```bash
git add src/render-vve.js src/actions.js styles.css src/tests.js
git commit -m "feat(dossier): dossier-logboek met contactmomenten-composer en filter op VvE-pagina"
```

---

### Task 6: `Kenmerken`-tab in de test-Sheet + e2e-controle + push

**Files:** geen code; Sheet-setup + verificatie.

- [x] **Step 1: Maak het tabblad `Kenmerken` aan in de TEST-Sheet** (`SID_TEST` = `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4`, "Collectief Dashboard - Kopie") met kopregel `A1:F1`:

```
Code | Balkons | Kozijnen | Bron | GewijzigdDoor | GewijzigdOp
```

(via de Google Sheets MCP-tools: create-worksheet + update-row; het PROD-tabblad komt pas bij GO.)

- [x] **Step 2: Volledige lokale testrun** — verwacht **136 OK, 0 FAIL**; service-worker-cache hoeft niet opgehoogd (sw cachet alleen statics die al een nieuwe hash/URL hebben? — check: `sw.js` cachet vaste lijst; als `src/kenmerken.js` NIET in de cache-lijst staat maar andere src-bestanden wél, voeg 'm toe en hoog de cacheversie op naar v9).

- [x] **Step 3: Push naar staging**

```bash
git push origin staging
```

- [x] **Step 4: Verifieer op de staging-URL** — `https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app/?test=1`: verwacht **136 OK, 0 FAIL** + TESTOMGEVING-balk zichtbaar. Controleer in de bron dat de nieuwe module geladen wordt.

- [x] **Step 5: Door gebruiker op staging te checken (ingelogd, kan niet geautomatiseerd):**
  - VvE-pagina openen via Ctrl+K → kenmerken-paneel toont "Onbekend"-pillen.
  - Kenmerk bewerken → opslaan → pil verandert + audit-regel in dossier-feed + rij in `Kenmerken`-tab van de test-Sheet.
  - Contactmoment vastleggen → verschijnt bovenaan feed + rij in `Logboek`-tab.
  - Filter "Alleen contactmomenten" werkt; herladen → alles blijft staan.
  - Tijdens typen in de composer 10s wachten (poll) → tekst blijft staan.

---

## Self-review (uitgevoerd bij schrijven)

- **Spec-dekking:** composer (soort+wie+tekst) → Task 5; feed+filter → Task 5; Logboek-kolommapping D/E/F/G → addContactLog Task 5; kenmerken-paneel + upsert + audit → Task 4; nieuw tabblad + parse → Task 1/3/6; "Recente activiteit" vervalt → Task 4 (c); Ctrl+Enter → Task 5; optimistisch + rollback → backgroundWrite in Task 4/5. Geen gaten.
- **Placeholder-scan:** geen TBD's; alle code volledig uitgeschreven.
- **Type-consistentie:** `vveKenmerken(code,data)` overal met `(code, D)`; `filterDossierLog(entries,modus)`; veldnamen `balkons/kozijnen/bron/gewijzigdDoor/gewijzigdOp` consistent in parse, save en kaart; logvelden Contact: veld=soort, oudeWaarde=wie, nieuweWaarde=tekst — gelijk in addContactLog, logZin en logItemHtml.
