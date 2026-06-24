# Logboek bewerken & verwijderen — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Op de Logboek-pagina notitie-/contactregels kunnen bewerken én alle getoonde regels (incl. automatische) kunnen verwijderen, met "Ongedaan maken".

**Architecture:** Pure helpers (rij-verschuiving + schrijf-celbepaling) zijn unit-getest in `tests.js`. De UI hangt aan de bestaande centrale `data-action`-dispatcher (`actions.js`). Bewerken gebeurt inline in de feed (`render-overig.js`), schrijven via de bestaande `writeRange`; verwijderen via het bestaande `deleteDimension`+`getSheetIds`-patroon met optimistische update, `assertRowMatch`-bescherming en `showUndoToast`. Undo herinsert met `insertAndWriteRow` + `loadAll` (zoals taak-undo).

**Tech Stack:** Vanilla ES-modules, Google Sheets REST API (`values` + `:batchUpdate`), bestaand `backgroundWrite`/undo-toast-raamwerk. Geen nieuwe dependencies, geen Sheet-schemawijziging.

**Branch:** `feat/logboek-bewerken` (vertakt van `main`; spraakmemo blijft op `staging`).

---

## File Structure

- `src/render-overig.js` — **hoofdmoot**: nieuwe pure helpers + edit/delete-functies + actieknopjes in `logItemHtml` + preserve-on-render in `renderLogboek`. (Logboek-logica woont hier al.)
- `src/actions.js` — 5 nieuwe `data-action`-entries + Ctrl+Enter-opslaan in de edit-textarea.
- `src/state.js` — `logEdit` / `logEditSoort` initialiseren.
- `styles.css` — knopjes (`.log-acts`/`.log-act-btn`) + inline edit-form (`.log-edit*`).
- `src/tests.js` — testblok voor de pure helpers.
- `src/config.js` + `sw.js` — versienummer ophogen (PROD: `6.0`→`6.1`, `cd-v55`→`cd-v56`).

---

## Task 1: Pure helpers + tests

**Files:**
- Modify: `src/render-overig.js` (helpers + export)
- Modify: `src/tests.js` (import + testblok)

- [ ] **Step 1: Schrijf de pure helpers in `src/render-overig.js`**

Plaats vlak vóór `function renderLogboek(){` (rond regel 293):

```js
// Pure (testbaar): verschuif _row van entries ONDER fromRow met delta.
// Gebruikt na invoegen/verwijderen van een Sheet-rij, zodat een volgende
// optimistische actie de juiste rij raakt (analoog aan _shiftNtdRows).
function _shiftRows(entries, fromRow, delta){
  (entries||[]).forEach(e=>{ if(e._row>fromRow) e._row+=delta; });
}
function _shiftLogboekRows(fromRow, delta){ _shiftRows(D.logboek, fromRow, delta); }

// Pure (testbaar): welke Sheet-cellen worden geschreven bij het bewerken van een
// logregel. Opmerking → alleen tekst (kol G). Contact → soort (E), wie (F), tekst (G).
function logEditWrite(actie, row, soort, wie, tekst){
  return actie==='Contact'
    ? { range:`'Logboek'!E${row}:G${row}`, values:[soort, wie, tekst] }
    : { range:`'Logboek'!G${row}`,        values:[tekst] };
}

// Korte omschrijving voor de verwijder-undo-toast.
function logDeleteLabel(r){
  const t=(r.nieuweWaarde||r.actie||'').toString();
  return `${r.code||'—'} · ${t.length>40?t.slice(0,40)+'…':t}`;
}
```

- [ ] **Step 2: Voeg de helpers toe aan de `export {…}` van `src/render-overig.js`**

Voeg aan de bestaande export-lijst (onderaan het bestand) toe:
`_shiftRows, _shiftLogboekRows, logEditWrite, logDeleteLabel,`

- [ ] **Step 3: Importeer de pure helpers in `src/tests.js`**

Wijzig de bestaande regel:
```js
import { logZin, logPaginaSoort } from "./render-overig.js";
```
naar:
```js
import { logZin, logPaginaSoort, _shiftRows, logEditWrite } from "./render-overig.js";
```

- [ ] **Step 4: Schrijf het falende testblok in `src/tests.js`**

Plaats het direct ná de bestaande `logPaginaSoort`-tests (rond regel 143):

```js
  // ── Logboek bewerken/verwijderen (pure helpers) ──
  (()=>{
    const arr=[{_row:2},{_row:5},{_row:8}];
    _shiftRows(arr,5,-1);
    eq('_shiftRows: rij 2 (boven) blijft', arr[0]._row, 2);
    eq('_shiftRows: rij 5 (==from) blijft', arr[1]._row, 5);
    eq('_shiftRows: rij 8 (onder) schuift -1', arr[2]._row, 7);
    _shiftRows(arr,5,+1);
    eq('_shiftRows: +1 herstelt rij 8', arr[2]._row, 8);

    const op=logEditWrite('Opmerking',12,'','','nieuwe tekst');
    eq('logEditWrite Opmerking range = G12', op.range, "'Logboek'!G12");
    eq('logEditWrite Opmerking values', op.values, ['nieuwe tekst']);
    const co=logEditWrite('Contact',7,'E-mail','Bestuur','gebeld');
    eq('logEditWrite Contact range = E7:G7', co.range, "'Logboek'!E7:G7");
    eq('logEditWrite Contact values', co.values, ['E-mail','Bestuur','gebeld']);
  })();
```

- [ ] **Step 5: Draai de tests en bevestig dat ze slagen**

Start de lokale no-cache server (zie geheugen *Lokaal testen dashboard*) en open `…/index.html?test=1`.
Run in de browserconsole of via preview: lees `window._testResult`.
Expected: `"NNN OK, 0 FAIL"` (alle bestaande + de 8 nieuwe asserts groen; geen FAIL).

- [ ] **Step 6: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: pure helpers (_shiftRows, logEditWrite, logDeleteLabel) + tests"
```

---

## Task 2: Actieknopjes in de feed + CSS

**Files:**
- Modify: `src/render-overig.js` (`logItemHtml` signatuur + knoppen; `renderLogboek`-call)
- Modify: `styles.css` (knop- en edit-styling)

- [ ] **Step 1: Breid `logItemHtml` uit met een `acties`-parameter (alleen Logboek-pagina)**

Vervang de huidige functie `logItemHtml(r,subtiel){…}` (regels 264-291) door:

```js
function logItemHtml(r,subtiel,acties){
  if(subtiel){
    const naam=esc(displayName(r.gebruiker)||'Iemand');
    const code=`<b>${esc(r.code||'—')}</b>`;
    const isAf=r.actie==='Afgerond';
    const zin=isAf
      ? `${naam} rondde ${code} af`
      : `${naam} maakte ${code} aan${r.nieuweWaarde?` <span class="log-mini-meta">→ ${esc(r.nieuweWaarde)}</span>`:''}`;
    const acts=acties?`<span class="log-acts"><button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">🗑</button></span>`:'';
    return `<div class="log-mini">
      <span class="log-mini-dot" style="background:${isAf?'var(--gn)':'var(--pu)'}"></span>
      <span class="log-mini-txt">${zin}</span>
      <span class="log-time">${esc(logTijd(r.timestamp))}</span>
      ${acts}
    </div>`;
  }
  if(acties && state.logEdit===r._row) return logEditForm(r);
  let extra='';
  if((r.actie==='Behandelaar gewijzigd'||r.actie==='Bewerkt'||r.actie==='Kenmerk') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
    extra=`<div class="log-change"><span class="old">${esc(r.oudeWaarde||'—')}</span><span class="arr">→</span><span class="new">${esc(r.nieuweWaarde||'—')}</span></div>`;
  }
  if((r.actie==='Opmerking'||r.actie==='Contact') && r.nieuweWaarde){
    extra=`<div class="log-note">${esc(r.nieuweWaarde)}</div>`;
  }
  const init=(displayName(r.gebruiker)||'?').charAt(0).toUpperCase();
  const acts=acties?`<span class="log-acts">
    <button class="log-act-btn" data-action="log-bewerken" data-row="${r._row}" title="Bewerken" aria-label="Regel bewerken">✎</button>
    <button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">🗑</button>
  </span>`:'';
  return `<div class="log-item">
    <span class="log-av" style="background:${avatarKleur(displayName(r.gebruiker))}">${esc(init)}</span>
    <div class="log-body"><div class="log-line">${logZin(r)}</div>${extra}</div>
    <span class="log-time">${esc(logTijd(r.timestamp))}</span>
    ${acts}
  </div>`;
}
```

- [ ] **Step 2: Laat `renderLogboek` de acties aanzetten**

In `renderLogboek` (regel ~320) wijzig:
```js
      html+=logItemHtml(r,logPaginaSoort(r.actie)==='subtiel');
```
naar:
```js
      html+=logItemHtml(r,logPaginaSoort(r.actie)==='subtiel',true);
```
> De VvE-dossier-feed (`dossierFeed` in `render-vve.js`) roept `logItemHtml(r)` zonder derde argument aan en blijft dus ongewijzigd (geen knoppen).

- [ ] **Step 3: Voeg de CSS toe in `styles.css`**

Plaats direct ná de `.log-time`-regel (rond regel 512):

```css
    .log-acts{display:flex;gap:1px;align-items:flex-start;flex-shrink:0;opacity:0;transition:opacity var(--tr)}
    .log-item:hover .log-acts,.log-mini:hover .log-acts{opacity:1}
    .log-act-btn{border:none;background:transparent;color:var(--mut);cursor:pointer;font-size:13px;line-height:1;padding:4px 5px;border-radius:6px;transition:background var(--tr),color var(--tr)}
    .log-act-btn:hover{background:var(--sur2);color:var(--txt)}
    .log-act-btn.del:hover{background:var(--rd-l);color:var(--rd)}
    .log-mini .log-act-btn{font-size:12px;padding:2px 4px}
    @media(hover:none){.log-acts{opacity:.5}}
    .log-edit{flex:1;display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--ac-b);border-radius:10px;background:var(--sur2)}
    .log-edit-tekst{width:100%;resize:vertical;font:inherit;font-size:13px;line-height:1.5;padding:8px;border:1px solid var(--bor);border-radius:8px;background:var(--sur);color:var(--txt)}
    .log-edit-rij{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .log-edit-wie{margin-left:auto;font-size:12.5px;padding:6px 8px;border:1px solid var(--bor);border-radius:8px;background:var(--sur);color:var(--txt)}
    .log-edit-knoppen{display:flex;gap:8px;justify-content:flex-end}
    .log-edit-tekst:focus,.log-edit-wie:focus{outline:none;border-color:var(--ac);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 14%,transparent)}
    @media(max-width:700px){.log-edit-wie{margin-left:0}}
```

> **Let op:** `logEditForm` bestaat nog niet (komt in Task 3). De feed rendert pas knoppen; de edit-tak wordt nog niet geraakt zolang `state.logEdit` leeg is. Na deze stap is de pagina functioneel (knoppen zichtbaar) maar nog niet klikbaar — dat komt in Task 3/4.

- [ ] **Step 4: Visuele check (preview)**

Open de Logboek-pagina in de preview. Verwacht: bij hover over een notitie/contactregel verschijnen ✎ en 🗑 rechts; bij een subtiele (afgerond/aangemaakt) regel alleen 🗑. Console vrij van fouten.

- [ ] **Step 5: Commit**

```bash
git add src/render-overig.js styles.css
git commit -m "Logboek: bewerk-/verwijderknopjes per regel (UI + styling)"
```

---

## Task 3: Bewerken (inline edit-form)

**Files:**
- Modify: `src/render-overig.js` (constants, `logEditForm`, `editLogboek`, `saveLogboek`, `cancelLogboek`, `setLogSoort`, preserve-on-render, imports, exports)
- Modify: `src/state.js` (`logEdit`, `logEditSoort`)
- Modify: `src/actions.js` (dispatcher-entries + Ctrl+Enter)

- [ ] **Step 1: Voeg edit-state toe in `src/state.js`**

Voeg in het `state`-object twee velden toe (bij de andere UI-vlaggen):
```js
  logEdit: null,        // _row van de logregel die nu inline bewerkt wordt (of null)
  logEditSoort: null,   // gekozen contactsoort tijdens bewerken
```

- [ ] **Step 2: Voeg `insertAndWriteRow` toe aan de crud-import in `src/render-overig.js`**

Wijzig:
```js
import { getSheetIds, setv, gv } from "./crud.js";
```
naar:
```js
import { getSheetIds, setv, gv, insertAndWriteRow } from "./crud.js";
```

- [ ] **Step 3: Voeg de optie-constanten + `logEditForm` toe in `src/render-overig.js`**

Plaats vlak vóór `function renderLogboek(){`:

```js
// Spiegelt de contact-composer op de VvE-pagina (lokaal gehouden om een
// circulaire import render-overig ↔ render-vve te vermijden).
const LOG_CONTACT_SOORTEN=[['Telefoon','📞'],['E-mail','✉️'],['Gesprek','🤝'],['Notitie','📝']];
const LOG_WIE_OPTIES=['Bewoner/eigenaar','Bestuur','Leverancier','Overig'];

function logEditForm(r){
  const isContact=r.actie==='Contact';
  const sel=state.logEditSoort||r.veld||'Telefoon';
  const contactRij=isContact?`<div class="log-edit-rij">
    <div class="dos-chips">${LOG_CONTACT_SOORTEN.map(([s,ico])=>
      `<button type="button" class="soort-chip${sel===s?' aan':''}" data-action="log-soort" data-soort="${esc(s)}">${ico} ${esc(s)}</button>`).join('')}</div>
    <select id="log-edit-wie" class="log-edit-wie" title="Met wie?">${LOG_WIE_OPTIES.map(w=>
      `<option${(r.oudeWaarde||'Overig')===w?' selected':''}>${esc(w)}</option>`).join('')}</select>
  </div>`:'';
  return `<div class="log-item"><div class="log-edit" data-row="${r._row}">
    <textarea id="log-edit-tekst" class="log-edit-tekst" rows="2">${esc(r.nieuweWaarde||'')}</textarea>
    ${contactRij}
    <div class="log-edit-knoppen">
      <button class="btn btn-sec btn-sm" data-action="log-annuleren">Annuleren</button>
      <button class="btn btn-pri btn-sm" data-action="log-opslaan" data-row="${r._row}">Opslaan</button>
    </div>
  </div></div>`;
}

function editLogboek(row){
  state.logEdit=row;
  const e=(D.logboek||[]).find(x=>x._row===row);
  state.logEditSoort=e?e.veld:null;
  renderLogboek();
  setTimeout(()=>{ const t=document.getElementById('log-edit-tekst'); if(t){ t.focus(); t.setSelectionRange(t.value.length,t.value.length); } },0);
}

function cancelLogboek(){ state.logEdit=null; state.logEditSoort=null; renderLogboek(); }

function setLogSoort(soort){
  state.logEditSoort=soort;
  document.querySelectorAll('.log-edit .soort-chip').forEach(c=>c.classList.toggle('aan', c.dataset.soort===soort));
}

async function saveLogboek(row){
  const entry=(D.logboek||[]).find(e=>e._row===row);
  if(!entry) return;
  const tekst=(document.getElementById('log-edit-tekst')?.value||'').trim();
  if(!tekst){ alert('De tekst mag niet leeg zijn.'); return; }
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const isContact=entry.actie==='Contact';
  const soort=isContact ? (state.logEditSoort||entry.veld||'Telefoon') : entry.veld;
  const wie=isContact ? (document.getElementById('log-edit-wie')?.value||entry.oudeWaarde||'Overig') : entry.oudeWaarde;
  const oud={veld:entry.veld, oudeWaarde:entry.oudeWaarde, nieuweWaarde:entry.nieuweWaarde};
  // optimistisch bijwerken + sluiten
  if(isContact){ entry.veld=soort; entry.oudeWaarde=wie; }
  entry.nieuweWaarde=tekst;
  state.logEdit=null; state.logEditSoort=null;
  renderLogboek();
  const w=logEditWrite(entry.actie, row, soort, wie, tekst);
  backgroundWrite(
    async ()=>{ await assertRowMatch(row, entry.timestamp, 'Logboek'); await writeRange(w.range, w.values); },
    ()=>{ entry.veld=oud.veld; entry.oudeWaarde=oud.oudeWaarde; entry.nieuweWaarde=oud.nieuweWaarde; },
    'Bewerken mislukt'
  );
}
```

- [ ] **Step 4: Bescherm half-getypte bewerktekst tegen de 8s-poll in `renderLogboek`**

Voeg bovenaan `function renderLogboek(){` (vóór de filter) toe:
```js
  const _editEl=document.getElementById('log-edit-tekst');
  const _editBewaar=(state.logEdit && _editEl)?{
    tekst:_editEl.value,
    wie:document.getElementById('log-edit-wie')?.value
  }:null;
```
En vlak vóór de afsluitende `renderPag('logboek-pag',…);` toe:
```js
  if(_editBewaar){
    const t=document.getElementById('log-edit-tekst'); if(t) t.value=_editBewaar.tekst;
    const w=document.getElementById('log-edit-wie'); if(w&&_editBewaar.wie) w.value=_editBewaar.wie;
  }
```

- [ ] **Step 5: Exporteer de nieuwe functies in `src/render-overig.js`**

Voeg aan de `export {…}`-lijst toe:
`logEditForm, editLogboek, saveLogboek, cancelLogboek, setLogSoort,`

- [ ] **Step 6: Koppel de acties in `src/actions.js`**

Wijzig de import uit `render-overig.js` van:
```js
import {
  setOntw, renderOntw, editOntwItem, addTaskNote, renderLogboek,
} from './render-overig.js';
```
naar:
```js
import {
  setOntw, renderOntw, editOntwItem, addTaskNote, renderLogboek,
  editLogboek, saveLogboek, cancelLogboek, setLogSoort, deleteLogboek,
} from './render-overig.js';
```
Voeg in het `ACTIONS`-object toe (bij de andere acties):
```js
  'log-bewerken':    (el) => editLogboek(+el.dataset.row),
  'log-opslaan':     (el) => saveLogboek(+el.dataset.row),
  'log-annuleren':   ()   => cancelLogboek(),
  'log-soort':       (el) => setLogSoort(el.dataset.soort),
  'log-verwijderen': (el) => deleteLogboek(+el.dataset.row),
```
Voeg in `initActions()` binnen de bestaande `keydown`-listener toe (Ctrl/Cmd+Enter = opslaan):
```js
    if (e.target && e.target.id === 'log-edit-tekst' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const box = e.target.closest('.log-edit');
      if (box) saveLogboek(+box.dataset.row);
    }
```
> `deleteLogboek` wordt pas in Task 4 gedefinieerd en geëxporteerd. Importeer 'm hier alvast mee; tot Task 4 klaar is niet committen/laden met een klik op 🗑.

- [ ] **Step 7: Handmatige verificatie (preview) — bewerken**

Op de Logboek-pagina: klik ✎ bij een notitie → inline veld verschijnt met de tekst. Pas de tekst aan, klik **Opslaan** → regel toont de nieuwe tekst; geen console-fout. Klik ✎ bij een **contact** → ook soort-chips + "met wie"-keuze verschijnen, vooringevuld; wijzig en sla op. **Annuleren** sluit zonder wijziging. (Schrijven naar de Sheet wordt geverifieerd in Task 5/deploy; bij een ingelogde sessie controleer dat de cel in het Sheet-tabblad `Logboek` is bijgewerkt.)

- [ ] **Step 8: Commit**

```bash
git add src/render-overig.js src/state.js src/actions.js
git commit -m "Logboek: notitie/contact inline bewerken (tekst + soort + met wie)"
```

---

## Task 4: Verwijderen + ongedaan maken

**Files:**
- Modify: `src/render-overig.js` (`deleteLogboek`, `undoDeleteLog` + export)

- [ ] **Step 1: Schrijf `deleteLogboek` en `undoDeleteLog` in `src/render-overig.js`**

Plaats ná `saveLogboek`:

```js
async function deleteLogboek(row){
  const entries=D.logboek||[];
  const idx=entries.findIndex(e=>e._row===row);
  if(idx<0) return;
  const entry=entries[idx];
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const vals=[entry.timestamp, entry.code, entry.sectie, entry.actie, entry.veld, entry.oudeWaarde, entry.nieuweWaarde, entry.gebruiker];
  const oudeRow=entry._row;
  // optimistisch: lokaal weg + rij-indexen meeschuiven + edit sluiten
  entries.splice(idx,1);
  _shiftLogboekRows(oudeRow,-1);
  if(state.logEdit===row){ state.logEdit=null; state.logEditSoort=null; }
  renderLogboek();
  showUndoToast('🗑️ Logregel verwijderd', logDeleteLabel(entry), ()=>undoDeleteLog(vals, oudeRow));
  // Idempotentie-vlag: deleteDimension is positie-gebaseerd en NIET idempotent (zie deleteTaskRow).
  let verwijderd=false;
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Logboek'];
      if(sheetId==null) throw new Error('Sheet "Logboek" niet gevonden');
      if(!verwijderd){
        await assertRowMatch(oudeRow, entry.timestamp, 'Logboek'); // rij nog de juiste vóór verwijderen
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',
          headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
        });
        if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
        verwijderd=true;
      }
    },
    ()=>{ if(entries.indexOf(entry)===-1){ _shiftLogboekRows(oudeRow,+1); entries.splice(Math.min(idx,entries.length),0,entry); } },
    'Verwijderen mislukt'
  );
}

// Undo: rij terugzetten op de oude positie en lokaal vers herladen (zoals taak-undo).
async function undoDeleteLog(vals, oudeRow){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  state._undoInFlight=true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try{
    await state._writeChain;                         // delete gegarandeerd vóór de re-insert
    await insertAndWriteRow('Logboek', oudeRow-1, vals);
    showToast('↩ Ongedaan gemaakt','Logregel teruggezet','var(--am)');
    await loadAll();                                 // _row-indexen vers uit de Sheet
  }catch(e){ alert('Undo fout: '+e.message); }
  finally{ state._undoInFlight=false; }
}
```

- [ ] **Step 2: Exporteer `deleteLogboek` (en `undoDeleteLog`) in `src/render-overig.js`**

Voeg aan de `export {…}`-lijst toe: `deleteLogboek, undoDeleteLog,`

- [ ] **Step 3: Draai de volledige testset opnieuw**

Open `…/index.html?test=1`, lees `window._testResult`.
Expected: `"NNN OK, 0 FAIL"` — onveranderd groen (deze taak voegt geen pure logica toe die nieuwe asserts vraagt; de delete/undo zijn integratie en worden handmatig geverifieerd).

- [ ] **Step 4: Handmatige verificatie (preview) — verwijderen + undo**

Ingelogd op de Logboek-pagina:
1. Klik 🗑 bij een notitie → regel verdwijnt direct; toast "🗑️ Logregel verwijderd — Ongedaan maken" verschijnt.
2. Klik **Ongedaan maken** → toast "↩ Ongedaan gemaakt"; regel staat terug op dezelfde plek (controleer ook het Sheet-tabblad `Logboek`).
3. Verwijder een **subtiele** (afgerond/aangemaakt) regel → verdwijnt; de onderliggende taak blijft ongewijzigd (niet heropend, niet teruggekomen).
4. Verwijder zonder undo → na de toast is de regel definitief weg uit de Sheet.
Console vrij van fouten in alle gevallen.

- [ ] **Step 5: Commit**

```bash
git add src/render-overig.js
git commit -m "Logboek: regel verwijderen met 'Ongedaan maken' (deleteDimension + insert-undo)"
```

---

## Task 5: Versienummer + eindcontrole

**Files:**
- Modify: `src/config.js` (`APP_VERSION`)
- Modify: `sw.js` (`CACHE_VERSION`)

- [ ] **Step 1: Hoog het zichtbare versienummer op**

In `src/config.js`: `export const APP_VERSION = '6.0';` → `'6.1';`
In `sw.js`: `const CACHE_VERSION = 'cd-v55';` → `'cd-v56';`

- [ ] **Step 2: Volledige testset groen + versietest**

Open `…/index.html?test=1`. Expected: `window._testResult` = `"NNN OK, 0 FAIL"` (incl. de bestaande assert `versie: APP_VERSION heeft formaat X.Y`).

- [ ] **Step 3: Commit**

```bash
git add src/config.js sw.js
git commit -m "Versie 6.1 / cd-v56: logboek-regels bewerken & verwijderen"
```

---

## Self-Review (uitgevoerd bij het schrijven)

- **Spec-dekking:** bereik (notitie/contact bewerk+verwijder; automatisch verwijder-only) → Task 2 `acties`-takken + Task 3/4. Rechten (iedereen ingelogd) → geen auteurscheck, `ensureToken` volstaat. Undo → Task 4. Soort+wie bij contact → Task 3 `logEditForm`/`saveLogboek`. Rij-bescherming → `assertRowMatch` in save & delete. Rij-verschuiving → `_shiftLogboekRows`. Versiebump → Task 5. Tests → Task 1. Alles gedekt.
- **Placeholder-scan:** geen TBD/TODO; alle code-stappen tonen volledige code.
- **Type-/naamconsistentie:** `editLogboek/saveLogboek/cancelLogboek/setLogSoort/deleteLogboek/undoDeleteLog`, `_shiftRows/_shiftLogboekRows`, `logEditWrite`, `logDeleteLabel`, `LOG_CONTACT_SOORTEN/LOG_WIE_OPTIES`, `state.logEdit/logEditSoort` — consistent gebruikt in render-overig.js, actions.js, state.js, tests.js. `insertAndWriteRow('Logboek', oudeRow-1, vals)` past op de bestaande signatuur (`sheetName, afterRow, values`).
- **Volgorde-noot:** Task 3 importeert `deleteLogboek` al in actions.js terwijl die pas in Task 4 wordt geëxporteerd — niet laden/klikken op 🗑 tot Task 4 af is (zo gemarkeerd).

---

## Uitrol (na akkoord op de code)

1. **Lokaal eindcheck** — `?test=1` groen + preview-doorloop van bewerken/verwijderen/undo.
2. **Naar TEST (jij test op staging):** `git checkout staging && git merge feat/logboek-bewerken`.
   Conflicten verwacht in `actions.js`, `config.js`, `render-overig.js`, `styles.css`, `tests.js`, `sw.js` (spraakmemo raakte dezelfde bestanden) — **additief oplossen** (beide kanten behouden), en voor de versie een **verse testwaarde** kiezen (bv. `6.9` / `cd-v63`) zodat testtoestellen de nieuwe code zeker laden. Push → CI deployt naar TEST. Verifieer op de TEST-URL.
3. **Naar PROD (live):** ná jouw akkoord `git checkout main && git merge feat/logboek-bewerken` (schone merge, geen spraakmemo, versie blijft `6.1`/`cd-v56`). Push → CI deployt naar PROD. **Niet** kaal `staging→main` mergen (geheugen: *Staging→main merge-les*).
4. Verifieer op de PROD-URL (`github.io/Collectief-Dashboard/`) dat bewerken/verwijderen werkt en de versie `6.1` toont.
