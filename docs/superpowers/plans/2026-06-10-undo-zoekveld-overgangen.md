# Undo bij verwijderen + VvE-zoekveld + zichtbare overgangen · Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verwijderen krijgt een undo-vangnet (pop-up weg), de AI-hulp krijgt een typebaar VvE-zoekveld, en rij-acties worden zichtbaar via kleurpulsen/fades (effect B, sterkte 2) — daarna wordt Fase 2 afgerond met de script-CSP (mijlpaal C).

**Architecture:** Spec: [`docs/superpowers/specs/2026-06-10-undo-zoekveld-overgangen-design.md`](../specs/2026-06-10-undo-zoekveld-overgangen-design.md). Twee nieuwe mini-modules (`src/vve-zoekveld.js`, `src/anim.js`); verwijder-flows worden gespiegeld aan het bestaande optimistische afrond-patroon (`doCompleteTask` + `backgroundWrite` + `showUndoToast`). Geen nieuwe `data-action`-labels nodig.

**Tech Stack:** Vanilla ES-modules, `?test=1`-zelftest, preview-tools. Werken op branch **`staging`**.

**Verificatie-routine (élke taak):** de preview cachet agressief (PWA + HTTP-heuristiek). Vóór elke browser-check in `preview_eval` draaien:
```js
(async()=>{ await caches.delete('cd-v7'); for(const f of ['index.html','styles.css','src/main.js','src/crud.js','src/ai.js','src/notifications.js','src/render-overig.js','src/render-lijsten.js','src/vve-zoekveld.js','src/anim.js','src/state.js','src/tests.js']) await fetch(f,{cache:'reload'}).catch(()=>{}); location.href='http://localhost:8080/index.html?test=1'; })()
```
IJkpunt zelftest vóór dit plan: **56 OK, 0 FAIL**.

---

### Task 1: `filterVves` — pure zoekfunctie (TDD)

**Files:**
- Create: `src/vve-zoekveld.js`
- Modify: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test.** In `src/tests.js`, ná de `_isStagingHost`-asserts en vóór de actions-registry-sectie:

```js
  // ── filterVves ── (VvE-zoekveld: zoekt op code én naam, case-insensitief)
  const _vves=[{code:'VVE-001',naam:'Parkzicht'},{code:'VVE-002',naam:'De Boog'},{code:'B-100',naam:'Vveldzicht'}];
  eq('filterVves op code',        filterVves('vve-001',_vves).map(r=>r.code), ['VVE-001']);
  eq('filterVves op naam',        filterVves('boog',_vves).map(r=>r.code),    ['VVE-002']);
  eq('filterVves hoofdletters',   filterVves('PARK',_vves).length, 1);
  eq('filterVves leeg → alles',   filterVves('',_vves).length, 3);
  eq('filterVves geen match',     filterVves('xyz',_vves).length, 0);
  eq('filterVves deelstring',     filterVves('vve',_vves).length, 3);
```
en bovenaan de import: `import { filterVves } from "./vve-zoekveld.js";`

- [ ] **Stap 2: Run en zie hem falen.** Preview + cache-bust-routine, `?test=1`. Verwacht: module-resolve-fout ("vve-zoekveld.js" bestaat niet) → tests draaien niet. Dat is de rode fase.

- [ ] **Stap 3: Minimale implementatie.** Maak `src/vve-zoekveld.js`:

```js
// ══════════════════════════════════════
//  VVE-ZOEKVELD — herbruikbare zoek/kies-component (taakmodal + AI-hulp)
// ══════════════════════════════════════
import { D } from './state.js';
import { esc } from './util.js';

// Pure filter: zoekt case-insensitief op code én naam. Lege query → hele lijst.
function filterVves(q, lijst){
  const z=(q||'').trim().toLowerCase();
  const vves=(lijst||[]).filter(r=>r&&r.code);
  if(!z) return vves;
  return vves.filter(r=>String(r.code).toLowerCase().includes(z)||String(r.naam||'').toLowerCase().includes(z));
}

export { filterVves };
```

- [ ] **Stap 4: Run en zie hem slagen.** Cache-bust + `?test=1`. Verwacht: **62 OK, 0 FAIL** (56+6).

- [ ] **Stap 5: Commit.**
```bash
git add src/vve-zoekveld.js src/tests.js
git commit -m "feat: filterVves (zoeken op VvE-code en -naam) + zelftests"
```

### Task 2: Zoekveld-component + taakmodal erop aansluiten

**Files:**
- Modify: `src/vve-zoekveld.js`, `src/crud.js` (onCodeInput/selectVvE eruit), `src/main.js`

- [ ] **Stap 1: Component toevoegen** aan `src/vve-zoekveld.js` (onder `filterVves`):

```js
function sugItemsHtml(matches){
  return matches.map(r=>`
    <div class="vve-sug-item" data-code="${esc(r.code)}" data-naam="${esc(r.naam||'')}">
      <div class="vve-sug-code">${esc(r.code)}</div>
      <div class="vve-sug-naam">${esc(r.naam||'')}</div>
    </div>`).join('');
}

// Wired een input + suggestielijst op D.alvo.
//   minTekens : pas tonen vanaf N tekens (0 = volledige lijst al bij focus)
//   maxItems  : afkappen op N (null = alles; lijst scrolt via .vve-suggestions)
//   onSelect  : ({code,naam}) => …
function initVveZoekveld({input, lijstEl, minTekens=0, maxItems=null, onSelect}){
  const toon=()=>{
    const q=input.value.trim();
    if(q.length<minTekens){ lijstEl.style.display='none'; return; }
    let m=filterVves(q, D.alvo).slice()
      .sort((a,b)=>String(a.code).localeCompare(String(b.code)));
    if(maxItems) m=m.slice(0,maxItems);
    if(!m.length){ lijstEl.style.display='none'; return; }
    lijstEl.innerHTML=sugItemsHtml(m);
    lijstEl.style.display='block';
    lijstEl.querySelectorAll('.vve-sug-item').forEach(el=>{
      el.onclick=()=>{ lijstEl.style.display='none'; onSelect({code:el.dataset.code, naam:el.dataset.naam}); };
    });
  };
  input.addEventListener('input', toon);
  input.addEventListener('focus', toon);
  input.addEventListener('keydown', e=>{ if(e.key==='Escape') lijstEl.style.display='none'; });
  input.addEventListener('blur', ()=>setTimeout(()=>{ lijstEl.style.display='none'; }, 200));
}

export { filterVves, sugItemsHtml, initVveZoekveld };
```
(Vervang de bestaande `export { filterVves };`-regel door dit export-blok.)

- [ ] **Stap 2: Taakmodal omhangen.** In `src/crud.js`: verwijder de functies `onCodeInput` en `selectVvE` (regels ~82–106, sectie "VvE CODE AUTOCOMPLETE") en haal beide namen uit het export-blok onderaan. In `src/main.js`: vervang het blok

```js
  // VvE autocomplete
  const codeInput = document.getElementById('m-code');
  codeInput.addEventListener('input',onCodeInput);
  codeInput.addEventListener('blur',()=>setTimeout(()=>{document.getElementById('vve-sug').style.display='none'},200));
```
door
```js
  // VvE autocomplete (gedeeld component; gedrag identiek: ≥2 tekens, max 8)
  initVveZoekveld({
    input: document.getElementById('m-code'),
    lijstEl: document.getElementById('vve-sug'),
    minTekens: 2, maxItems: 8,
    onSelect: ({code,naam}) => {
      document.getElementById('m-code').value = code;
      document.getElementById('m-naam').value = naam;
    },
  });
```
en pas de imports aan: `onCodeInput` weg uit de crud-import; nieuwe regel `import { initVveZoekveld } from './vve-zoekveld.js';`

- [ ] **Stap 3: Verifieer.** Cache-bust + reload. Uitgelogd is `D.alvo` leeg, dus test met nepdata via `preview_eval`:
```js
(async()=>{ const st=await import('./src/state.js');
  st.D.alvo=[{code:'VVE-001',naam:'Parkzicht'},{code:'VVE-002',naam:'De Boog'}];
  const inp=document.getElementById('m-code'); inp.value='park';
  inp.dispatchEvent(new Event('input'));
  const zichtbaar=document.getElementById('vve-sug').style.display==='block';
  document.querySelector('#vve-sug .vve-sug-item')?.click();
  return { zichtbaar, code:document.getElementById('m-code').value, naam:document.getElementById('m-naam').value, alvoLeeg:(st.D.alvo=[]).length===0 };
})()
```
Verwacht: `zichtbaar:true, code:'VVE-001', naam:'Parkzicht'`. `?test=1` → 62 OK.

- [ ] **Stap 4: Commit.**
```bash
git add src/vve-zoekveld.js src/crud.js src/main.js
git commit -m "feat: herbruikbaar VvE-zoekveld-component; taakmodal gebruikt het"
```

### Task 3: AI-hulp — dropdown wordt zoekveld

**Files:**
- Modify: `index.html` (regel 665), `src/ai.js` (regels 16–24, 69, 132), `src/state.js`, `src/main.js`, `styles.css`

- [ ] **Stap 1: Markup.** In `index.html` vervang regel 665 (`<select id="ai-vve" …></select>`) door:

```html
          <div class="ai-vve-wrap">
            <input type="text" id="ai-vve-input" placeholder="Zoek op code of naam… (klik voor de hele lijst)" autocomplete="off"/>
            <button type="button" id="ai-vve-wis" title="Koppeling wissen" aria-label="Koppeling wissen" style="display:none">×</button>
            <div class="vve-suggestions" id="ai-vve-sug"></div>
          </div>
```

- [ ] **Stap 2: CSS.** Onderaan `styles.css`:

```css
    /* ── AI-hulp VvE-zoekveld ── */
    .ai-vve-wrap{position:relative}
    .ai-vve-wrap input{width:100%;padding-right:30px}
    #ai-vve-wis{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:none;background:none;font-size:17px;line-height:1;color:var(--mut);cursor:pointer;padding:4px 8px}
    #ai-vve-wis:hover{color:var(--rd)}
    .ai-vve-wrap .vve-suggestions{max-height:240px}
```

- [ ] **Stap 3: State.** In `src/state.js`, in het `state`-object onder `_aiLastNaam: '',` toevoegen:
```js
  _aiVveCode: '',
```

- [ ] **Stap 4: `src/ai.js` omhangen.** (a) In `openAiHelp` (regels 16–24) vervang het select-vullen:
```js
function openAiHelp(){
  // zoekveld toont de actuele koppeling (suggesties komen live uit D.alvo bij focus)
  if(!state._aiVveCode) document.getElementById('ai-vve-input').value='';
  document.getElementById('ai-answer').value='';
```
(b) In `buildAiPrompt` regel 69: `const code=document.getElementById('ai-vve').value;` → `const code=state._aiVveCode;`
(c) In `parseAiAnswer` regel 132: idem.

- [ ] **Stap 5: Wiring in `src/main.js`.** Vervang in het AI-blok de regel `document.getElementById('ai-vve').addEventListener('change',()=>{buildAiPrompt();parseAiAnswer();});` door:

```js
  const aiVveInput=document.getElementById('ai-vve-input');
  const aiVveWis=document.getElementById('ai-vve-wis');
  const zetAiVve=(code,naam)=>{
    state._aiVveCode=code||'';
    aiVveInput.value=code?`${code} — ${naam||''}`:'';
    aiVveWis.style.display=code?'':'none';
    buildAiPrompt(); parseAiAnswer();
  };
  initVveZoekveld({ input: aiVveInput, lijstEl: document.getElementById('ai-vve-sug'),
    minTekens: 0, onSelect: ({code,naam}) => zetAiVve(code,naam) });
  aiVveInput.addEventListener('input',()=>{   // overtypen = koppeling los
    if(state._aiVveCode){ state._aiVveCode=''; aiVveWis.style.display='none'; buildAiPrompt(); parseAiAnswer(); }
  });
  aiVveWis.onclick=()=>zetAiVve('','');
```

- [ ] **Stap 6: Verifieer.** Cache-bust + reload, dan `preview_eval`:
```js
(async()=>{ const st=await import('./src/state.js'); const ai=await import('./src/ai.js');
  st.D.alvo=[{code:'VVE-001',naam:'Parkzicht'},{code:'VVE-002',naam:'De Boog'}];
  ai.openAiHelp();
  const inp=document.getElementById('ai-vve-input');
  inp.dispatchEvent(new Event('focus'));
  const lijstBijFocus=document.querySelectorAll('#ai-vve-sug .vve-sug-item').length;
  inp.value='boog'; inp.dispatchEvent(new Event('input'));
  document.querySelector('#ai-vve-sug .vve-sug-item')?.click();
  const naSelect={code:st.state._aiVveCode, veld:inp.value, wisZichtbaar:document.getElementById('ai-vve-wis').style.display!=='none'};
  document.getElementById('ai-vve-wis').click();
  const naWis={code:st.state._aiVveCode, veld:inp.value};
  ai.closeAiHelp(); st.D.alvo=[];
  return { lijstBijFocus, naSelect, naWis };
})()
```
Verwacht: `lijstBijFocus:2`, `naSelect:{code:'VVE-002',veld:'VVE-002 — De Boog',wisZichtbaar:true}`, `naWis:{code:'',veld:''}`. Plus: geen console-fouten, `?test=1` → 62 OK.

- [ ] **Stap 7: Commit.**
```bash
git add index.html styles.css src/state.js src/ai.js src/main.js
git commit -m "feat: AI-hulp VvE-koppeling als typebaar zoekveld (code+naam, lijst bij focus, wis-knop)"
```

### Task 4: Animatie-fundament — CSS, `data-row`, `src/anim.js`, poll-guard

**Files:**
- Create: `src/anim.js`
- Modify: `styles.css`, `src/render-lijsten.js` (regel 401), `src/render-overig.js` (ontw-`<tr>`), `src/state.js`, `src/main.js` (8s-poll)

- [ ] **Stap 1: CSS.** Onderaan `styles.css`:

```css
    /* ── Rij-overgangen: kleurpuls + fade bij acties (effect B, sterkte 2) ── */
    :root{--puls-gn:#C0DD97;--puls-gn-t:#173404;--puls-rd:#F7C1C1;--puls-rd-t:#501313;--flits-gn:#C0DD97;--flits-am:#FAC775}
    [data-theme=dark]{--puls-gn:#27500A;--puls-gn-t:#C0DD97;--puls-rd:#791F1F;--puls-rd-t:#F7C1C1;--flits-gn:#27500A;--flits-am:#854F0B}
    @media (prefers-reduced-motion: no-preference){
      tr.rij-puls-groen td{background:var(--puls-gn)!important;color:var(--puls-gn-t)!important;transition:background .15s ease}
      tr.rij-puls-rood td{background:var(--puls-rd)!important;color:var(--puls-rd-t)!important;transition:background .15s ease}
      tr.rij-fade-weg{opacity:0;transition:opacity .4s ease}
      @keyframes rijFlits{0%{background:var(--ac-l)}100%{background:transparent}}
      tr.rij-flits td{animation:rijFlits 1.2s ease}
      @keyframes rijFlitsGroen{0%{background:var(--flits-gn)}100%{background:transparent}}
      tr.rij-flits-groen td{animation:rijFlitsGroen 1.2s ease}
      @keyframes rijFlitsAmber{0%{background:var(--flits-am)}100%{background:transparent}}
      tr.rij-flits-amber td{animation:rijFlitsAmber 1.2s ease}
    }
```

- [ ] **Stap 2: `src/anim.js`:**

```js
// ══════════════════════════════════════
//  ANIM — zichtbare rij-overgangen (kleurpuls + fade bij acties)
// ══════════════════════════════════════
import { state } from './state.js';

const motionOk = () => window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

// Pulst een <tr> in actie-kleur (~0,75s), vervaagt hem (~0,4s) en roept dán `klaar()`
// (meestal renderAll). Zonder tr of bij 'verminder beweging': direct klaar().
function animateRowOut(tr, pulsClass, klaar){
  if(!tr || !motionOk()){ klaar(); return; }
  state._animBusy = true;
  tr.classList.add(pulsClass);
  setTimeout(()=>{
    tr.classList.add('rij-fade-weg');
    setTimeout(()=>{ state._animBusy = false; klaar(); }, 420);
  }, 750);
}

// Korte flits op een rij ná een re-render (bewerkt/toegevoegd/teruggezet).
// Stil bij niet-gevonden (bv. andere sectie actief).
function flashRow(tbodyId, row, cls = 'rij-flits'){
  if(!motionOk()) return;
  const tr = document.querySelector(`#${tbodyId} tr[data-row="${row}"]`);
  if(!tr) return;
  tr.classList.add(cls);
  tr.addEventListener('animationend', () => tr.classList.remove(cls), { once: true });
}

export { animateRowOut, flashRow };
```

- [ ] **Stap 3: `data-row` op rijen.** `src/render-lijsten.js` regel 401: `return `<tr class="${rowCls}">${cells}</tr>`;` → `return `<tr class="${rowCls}" data-row="${r._row}">${cells}</tr>`;`. `src/render-overig.js` (renderOntw, regel ~58): `return`<tr>` → `return`<tr data-row="${r._row}">`.

- [ ] **Stap 4: Guard.** `src/state.js`: voeg in het `state`-object toe (onder `_loadAgain: false,`): `_animBusy: false,`. `src/main.js`, in de 8s-interval direct onder `if(state.pendingWrites>0) return;`: `if(state._animBusy) return;`

- [ ] **Stap 5: Verifieer fundament.** Cache-bust + reload; `preview_eval`: `import('./src/anim.js').then(m=>typeof m.animateRowOut+','+typeof m.flashRow)` → `"function,function"`. `?test=1` → 62 OK, geen console-fouten.

- [ ] **Stap 6: Commit.**
```bash
git add styles.css src/anim.js src/render-lijsten.js src/render-overig.js src/state.js src/main.js
git commit -m "feat: animatie-fundament (pulsklassen, data-row, anim.js, poll-guard)"
```

### Task 5: Afronden — groene puls vóór het hertekenen

**Files:**
- Modify: `src/crud.js` (doCompleteTask, regels ~240–247)

- [ ] **Stap 1: Ombouwen.** In `doCompleteTask`, vervang het blok "1) optimistisch …" t/m `showUndoToast(…)`:

```js
    // 1) optimistisch: meteen uit de lokale lijst + indexen meeschuiven;
    //    de oude DOM-rij pulst groen en pas daarná hertekenen we (anim.js)
    const tr=document.querySelector(`#ntd-tbody tr[data-row="${r._row}"]`);
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(r._row,-1);
    closeCompleteModal();
    showUndoToast('✅ Taak afgerond',`${r.code} — ${r.actiepunt||r.naam||''}`,()=>undoComplete(undoData));
```
en vervang de losse regel `renderAll();` uit dat blok door — ná de `backgroundWrite(...)`-aanroep —:
```js
    animateRowOut(tr,'rij-puls-groen',renderAll);
```
Imports in `crud.js`: `import { animateRowOut, flashRow } from './anim.js';` (flashRow is voor Task 8).

- [ ] **Stap 2: Verifieer met nepdata** (uitgelogd kan de write niet slagen, maar puls + lokale flow wel — de foutmelding "Afronden mislukt" met rollback is dan juist het bewijs dat het vangnet werkt):
```js
(async()=>{ const st=await import('./src/state.js'); const c=await import('./src/crud.js'); const m=await import('./src/main.js');
  st.D.ntd.OPPAKKEN=[{_row:3,_sec:'OPPAKKEN',code:'TEST-1',naam:'Demo',actiepunt:'Pulstest',deadline:'',behandelaar:'',prioriteit:'',opmerkingen:'',inBehandeling:'',subcategorie:''}];
  st.state.oauthToken='nep'; st.state.oauthExpiry=Date.now()+600000;
  (await import('./src/ui.js')).goTo('ntd');
})()
```
Daarna `renderAll` is al gedraaid via goTo? Zo niet: roep in dezelfde eval `document.querySelector('[data-action="ntd-sectie"]')` na — eenvoudiger: voer ná bovenstaande een tweede eval uit die `#ntd-tbody tr[data-row="3"]` controleert, op het vinkje klikt (`[data-action="taak-afronden"]`), de afrond-modal bevestigt (`#complete-confirm`), en checkt: (a) tr krijgt klasse `rij-puls-groen`, (b) undo-toast zichtbaar, (c) na ~1,3s is de rij weg. Console: "Afronden mislukt"-toast mag (nep-token), rij komt door rollback terug — óók goed om te zien.

- [ ] **Stap 3: Opruimen testdata.** Reload de preview (vers, zonder nepdata). `?test=1` → 62 OK.

- [ ] **Stap 4: Commit.**
```bash
git add src/crud.js
git commit -m "feat: groene puls + fade bij taak afronden"
```

### Task 6: Verwijderen van taken — optimistisch + rode puls + undo

**Files:**
- Modify: `src/crud.js` (deleteTaskRow, regels ~156–173), `src/notifications.js` (undoDelete + export)

- [ ] **Stap 1: `deleteTaskRow` vervangen** door:

```js
async function deleteTaskRow(r){
  const omschrijving=r.actiepunt||r.periode||r.code||'deze taak';
  if(!await ensureToken()){alert('Inloggen mislukt. Probeer het opnieuw.');return}
  const sec=r._sec;
  // undo-data vastleggen vóór de mutatie (zelfde serialisatie als afronden)
  const ntdKeys=SECS[sec].keys;
  const ntdValues=ntdKeys.map(k=>r[k]||''); ntdValues.push(r.subcategorie||'');
  const undoData={sec,code:r.code,ntdValues};
  const oudeRow=r._row;
  const tr=document.querySelector(`#ntd-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: meteen lokaal weg + indexen meeschuiven
  const arr=D.ntd[sec]||[];
  const pos=arr.indexOf(r);
  if(pos>-1) arr.splice(pos,1);
  _shiftNtdRows(oudeRow,-1);
  showUndoToast('🗑️ Taak verwijderd',`${r.code} — ${omschrijving}`,()=>undoDelete(undoData));
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Nog Te Doen'];
      if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
      });
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
      logEvent(r.code, sec, 'Verwijderd', '', r.actiepunt||r.periode||'', '');
    },
    ()=>{ if(arr.indexOf(r)===-1){ _shiftNtdRows(oudeRow,+1); arr.splice(Math.min(pos<0?arr.length:pos,arr.length),0,r); } },
    'Verwijderen mislukt'
  );
  animateRowOut(tr,'rij-puls-rood',renderAll);
}
```
Imports: `crud.js` importeert al `backgroundWrite`? Zo nee: `import { backgroundWrite, loadAll } from './data.js';` aanvullen. Voeg `undoDelete` toe aan de notifications-import van crud.js.

- [ ] **Stap 2: `undoDelete` in `src/notifications.js`** (onder `undoComplete`), en toevoegen aan het export-blok:

```js
async function undoDelete(undoData) {
  if (!await ensureToken()) { alert('Inloggen mislukt.'); return; }
  try {
    await state._writeChain;            // delete-write gegarandeerd vóór de re-insert
    const { sec, ntdValues } = undoData;
    const insertRow = getInsertRow(sec);
    await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
    logEvent(undoData.code, sec, 'Teruggezet', 'status', 'Verwijderd', 'Nog Te Doen');
    showToast('↩ Ongedaan gemaakt', `${undoData.code} terug in Nog Te Doen`, 'var(--am)');
    await loadAll();
  } catch(e) { alert('Undo fout: ' + e.message); }
}
```
(`getInsertRow`, `insertAndWriteRow`, `logEvent`, `loadAll`, `ensureToken` zijn daar al geïmporteerd t.b.v. `undoComplete` — controleer en vul aan waar nodig.)

- [ ] **Stap 3: Verifieer** zoals Task 5 stap 2, maar via bewerken-modal: nepdata-rij, potlood (`[data-action="taak-bewerken"]`), dan `#m-del` (verwijder-knop): (a) géén confirm-pop-up meer, (b) rode puls, (c) undo-toast "🗑️ Taak verwijderd", (d) rij weg na animatie, (e) "Verwijderen mislukt"-rollback (nep-token) zet de rij terug. Reload daarna vers; `?test=1` → 62 OK.

- [ ] **Stap 4: Commit.**
```bash
git add src/crud.js src/notifications.js
git commit -m "feat: taak verwijderen optimistisch met rode puls en ongedaan-maken (confirm-popup weg)"
```

### Task 7: Verwijderen van Ontwikkeling-items — zelfde patroon

**Files:**
- Modify: `src/render-overig.js` (deleteOntwItem, regels ~118–134 + imports)

- [ ] **Stap 1: `deleteOntwItem` vervangen** door:

```js
async function deleteOntwItem(){
  if(!state.ontwEditRow) return;
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  const r=state.ontwEditRow;
  const values=[r.titel||'',r.categorie||'',r.inhoud||'',r.door||'',r.datum||'',r.status||''];
  const oudeRow=r._row;
  const tr=document.querySelector(`#ontw-tbody tr[data-row="${oudeRow}"]`);
  // optimistisch: lokaal weg + rij-indexen van latere items bijwerken
  const pos=D.ontw.indexOf(r);
  if(pos>-1) D.ontw.splice(pos,1);
  D.ontw.forEach(x=>{ if(x._row>oudeRow) x._row--; });
  closeOntwModal();
  showUndoToast('🗑️ Item verwijderd', r.titel||'', ()=>undoOntwDelete(values, r.titel));
  backgroundWrite(
    async ()=>{
      const ids=await getSheetIds();
      const sheetId=ids['Ontwikkeling'];
      if(sheetId==null) throw new Error('Sheet "Ontwikkeling" niet gevonden');
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',
        headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:oudeRow-1,endIndex:oudeRow}}}]})
      });
      if(!resp.ok){const e=await resp.json();const err=new Error(e.error?.message||'Verwijderfout');err.status=resp.status;throw err}
    },
    ()=>{ if(D.ontw.indexOf(r)===-1){ D.ontw.forEach(x=>{ if(x._row>=oudeRow) x._row++; }); D.ontw.splice(Math.min(pos<0?D.ontw.length:pos,D.ontw.length),0,r); } },
    'Verwijderen mislukt'
  );
  animateRowOut(tr,'rij-puls-rood',renderOntw);
}

async function undoOntwDelete(values, titel){
  if(!await ensureToken()){alert('Inloggen mislukt.');return}
  try{
    await state._writeChain;
    await appendRange("'Ontwikkeling'!A:F", values);
    showToast('↩ Ongedaan gemaakt', `"${titel||''}" teruggezet`, 'var(--am)');
    await loadAll();
  }catch(e){alert('Undo fout: '+e.message)}
}
```
Imports aanvullen in `render-overig.js`: `showToast, showUndoToast` bij de notifications-import; `backgroundWrite` bij de data-import; `import { animateRowOut } from './anim.js';`.

- [ ] **Stap 2: Verifieer** met nepdata in `D.ontw` (zelfde recept; item bewerken → 🗑️): geen confirm, rode puls, undo-toast, rollback bij nep-token. Reload vers; `?test=1` → 62 OK.

- [ ] **Stap 3: Commit.**
```bash
git add src/render-overig.js
git commit -m "feat: Ontwikkeling-item verwijderen optimistisch met rode puls en ongedaan-maken"
```

### Task 8: Flitsen bij bewerken, toevoegen en teruggezet

**Files:**
- Modify: `src/crud.js` (submitTask), `src/notifications.js` (undoComplete + undoDelete)

- [ ] **Stap 1: submitTask.** In het bewerken-pad, direct ná `renderAll();`: `flashRow('ntd-tbody', doelRow._row);`. In het toevoegen-pad, direct ná `renderAll();`: `flashRow('ntd-tbody', nieuw._row, 'rij-flits-groen');`

- [ ] **Stap 2: Teruggezet-flits (best effort).** In `undoComplete` én `undoDelete`, ná `await loadAll();`:

```js
    const terug=(D.ntd[sec]||[]).filter(x=>x.code===undoData.code).pop();
    if(terug) flashRow('ntd-tbody', terug._row, 'rij-flits-amber');
```
Imports in notifications.js: `import { flashRow } from './anim.js';` en `D` bij de state-import (controleer of `D` daar al geïmporteerd is — `undoComplete` gebruikt `D.af`, dus ja).

- [ ] **Stap 3: Verifieer** met nepdata: taak toevoegen (groene flits op nieuwe rij), bewerken+opslaan (teal-flits). Reload vers; `?test=1` → 62 OK.

- [ ] **Stap 4: Commit.**
```bash
git add src/crud.js src/notifications.js
git commit -m "feat: rij-flits bij bewerken (teal), toevoegen (groen) en teruggezet (amber)"
```

### Task 9: Features compleet — verificatie + push naar staging

- [ ] **Stap 1:** Volledige uitgelogde doorloop op de preview (alle pagina's, modals, zoekvelden, animaties via nepdata-recepten), console schoon (bekende OneSignal-timeout uitgezonderd), `?test=1` → **62 OK, 0 FAIL**.
- [ ] **Stap 2:** `git push origin staging`; controleer met `curl -sL …/src/vve-zoekveld.js | head -3` dat de test-link de nieuwe modules serveert (géén `?cb=`-query gebruiken — geeft een redirect-pagina).

### Task 10: Mijlpaal C — script-CSP dichttimmeren

**Files:**
- Modify: `index.html` (regel 11)

- [ ] **Stap 1: Voorcontrole (C1).**
```bash
grep -n "eval\|new Function" index.html src/*.js | grep -v "evalu"   # verwacht: alleen de CSP-meta zelf
grep -cE "<script" index.html                                          # verwacht: 4, allemaal met src=
```
⚠ Vermijd `(` in grep-patronen (geeft hier soms een ENOSPC-schijnfout in de tooling).

- [ ] **Stap 2: CSP aanscherpen (C2).** In regel 11 het `script-src`-deel:
`script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://accounts.google.com https://cdn.onesignal.com https://unpkg.com;` → `script-src 'self' https://cdn.jsdelivr.net https://accounts.google.com https://cdn.onesignal.com;`
(De rest van de CSP blijft staan; `style-src` houdt bewust `'unsafe-inline'`.)

- [ ] **Stap 3: Lokale rooktest.** Cache-bust + reload: boot voltooit, login-scherm rendert, geen CSP-fouten in console, `?test=1` → 62 OK.

- [ ] **Stap 4: Commit + push, empirisch dichttimmeren op de test-link.**
```bash
git add index.html && git commit -m "Fase 2C: script-CSP aanscherpen (unsafe-inline/eval en unpkg weg)" && git push origin staging
```
Op de test-link met console open: login (Google Sign-In), data laden, grafieken (Chart.js), meldingen-modal, service-worker-registratie. Alleen bij échte CSP-overtredingen de witte lijst bijstellen (bv. `worker-src` of extra `*.onesignal.com`), per aanpassing committen.

- [ ] **Stap 5: Checkpoint C3.** Schone console-doorloop + `?test=1` groen op de test-link.

### Task 11: Eindverificatie Fase 2 (D1) — en stoppen vóór de merge

- [ ] **Stap 1:** `git log --oneline main..staging` — alleen frontend-werk, geen `apps-script/**`.
- [ ] **Stap 2:** Gebruiker vragen: ingelogde acceptatie op de test-link (verwijderen+undo taak & ontw-item, VvE-zoekveld, pulsen/flitsen, dark mode) én expliciete GO voor de merge naar `main`. **De merge zelf (D2) gebeurt pas na die GO** — zie het Fase 2-plan voor de merge-stappen (neem bij het index.html-conflict de staging-versie).

---

## Zelfcontrole van dit plan (uitgevoerd)

- **Spec-dekking:** undo verwijderen taken (T6) + ontw (T7), confirm weg (T6/T7), VvE-zoekveld + hergebruik + wis-knop + volle lijst bij focus (T1–T3), effect B sterkte 2 + dark mode + reduced-motion (T4), pulsen afronden/verwijderen (T5–T7), flitsen bewerken/toevoegen/teruggezet (T8), `_animBusy`-guard (T4), `await state._writeChain` (T6/T7), tests `filterVves` (T1), mijlpaal C (T10), stop vóór go-live (T11). ✔
- **Placeholders:** geen; alle code volledig uitgeschreven, exacte paden/regels. ✔
- **Naam-consistentie:** `filterVves`/`initVveZoekveld`/`sugItemsHtml` (T1/T2/T3), `animateRowOut`/`flashRow` (T4 def, T5–T8 gebruik), klasse-namen CSS==JS (`rij-puls-groen/rood`, `rij-fade-weg`, `rij-flits(-groen/-amber)`), `state._aiVveCode`/`state._animBusy` gedeclareerd in T3/T4 vóór gebruik. ✔
