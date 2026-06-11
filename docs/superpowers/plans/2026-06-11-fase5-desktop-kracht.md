# Fase 5 — Desktop-kracht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-VvE overzichtspagina, Ctrl+K-commandocentrum, bulk-acties op de NTD-lijst en chart.js lazy-load — frontend-only, geen Sheet/Apps Script-wijzigingen.

**Architecture:** Drie nieuwe ES-modules (`src/render-vve.js`, `src/palette.js`, `src/bulk.js`) die de bestaande patronen hergebruiken: data-action-klikregistry (`actions.js`), optimistisch schrijven via `backgroundWrite`/`_writeChain` (`data.js`), pagina-routing via `goTo` (`ui.js`), pure helpers apart exporteren voor de `?test=1`-suite. Spec: `docs/superpowers/specs/2026-06-11-fase5-desktop-kracht-design.md`.

**Tech Stack:** Vanilla ES-modules zonder bundler, Google Sheets API (OAuth), bestaande testsuite in `src/tests.js` (draait in browser-console met `?test=1`).

**Werkwijze tests:** geen Node aanwezig. Lokaal serveren met `python3 -m http.server 8123` vanuit de projectroot en `http://localhost:8123/index.html?test=1` openen; de console toont `[TESTS] N OK, M FAIL`. De pure tests draaien zónder login. Console uitlezen via de browser-tools (Chrome MCP) of preview-tools. Huidige stand: **81 OK, 0 FAIL** — elke taak laat dat aantal groeien, nooit dalen.

**Branch:** alles op `staging` committen en pushen (CI deployt alleen Apps Script en die wijzigt niet; Vercel bouwt de test-link automatisch).

---

### Task 1: Per-VvE pure helper `vveOverzicht` + tests

**Files:**
- Create: `src/render-vve.js` (alleen de pure helper; UI komt in Task 2)
- Modify: `src/state.js` (state-velden), `src/tests.js`

- [ ] **Step 1: Voeg state-velden toe** in `src/state.js`, in het `state`-object ná de regel `_snoozeRow: null,        // taak waarvoor de wegleggen-modal open staat (Fase 4)`:

```js
  vveCode: null,           // VvE op de per-VvE-pagina (Fase 5)
  _vveAfAlles: false,      // per-VvE: alle afgeronde taken uitgeklapt
  bulkMode: false,         // bulk-selecteerstand op de NTD-lijst (Fase 5)
```

- [ ] **Step 2: Maak `src/render-vve.js`** met alleen de pure helper (de render/UI-functies komen in Task 2 in ditzelfde bestand):

```js
// ══════════════════════════════════════
//  PER-VVE-PAGINA — alles van één VvE op één scherm (Fase 5)
// ══════════════════════════════════════
import { esc, persBadges, berekenPrioriteit, opvolgStatus, parseDt, _vandaagAmsterdam, _verschilInKalenderdagen } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";

// Pure helper (testbaar zonder DOM): verzamelt alles van één VvE uit de D-data.
function vveOverzicht(code, data, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  const open=[], weggelegd=[];
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(r.code!==code) return;
    if(opvolgStatus(r, vandaag).weggelegd) weggelegd.push(r); else open.push(r);
  }));
  // open: te laat eerst, dan vroegste deadline
  open.sort((a,b)=>{
    const pa=berekenPrioriteit(a.deadline,a._sec,vandaag), pb=berekenPrioriteit(b.deadline,b._sec,vandaag);
    if(pa.teLaat!==pb.teLaat) return pa.teLaat?-1:1;
    return (parseDt(a.deadline)||Infinity)-(parseDt(b.deadline)||Infinity);
  });
  weggelegd.sort((a,b)=>parseDt(a.opvolgdatum)-parseDt(b.opvolgdatum));
  const afgerond=[];
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{ if(r.code===code) afgerond.push(r); }));
  afgerond.sort((a,b)=>parseDt(b.datum)-parseDt(a.datum));
  const teLaat=open.filter(r=>berekenPrioriteit(r.deadline,r._sec,vandaag).teLaat).length;
  const logboek=(data.logboek||[]).filter(e=>e.code===code)
    .slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  let laatsteDagen=null;
  if(logboek.length){
    const t=new Date(logboek[0].timestamp);
    if(!isNaN(t)) laatsteDagen=_verschilInKalenderdagen(vandaag,t);
  }
  const alvo=(data.alvo||[]).find(r=>r.code===code)||null;
  const alfa=(data.alfa||[]).filter(r=>r.code===code);
  const naam=(open[0]?.naam)||(weggelegd[0]?.naam)||(alvo?.naam)||(afgerond[0]?.naam)||'';
  const behandelaars=[...new Set(open.concat(weggelegd)
    .flatMap(r=>(r.behandelaar||'').split(/[,\/]/).map(s=>s.trim()).filter(Boolean)))];
  return { code, naam, behandelaars, open, weggelegd, afgerond, alvo, alfa, logboek,
           cijfers:{ open:open.length, teLaat, weggelegd:weggelegd.length, laatsteDagen } };
}

export { vveOverzicht };
```

Let op: `_verschilInKalenderdagen(a,b)` rekent `a − b` in dagen; `(vandaag, t)` geeft dus "dagen geleden" als positief getal.

- [ ] **Step 3: Schrijf de tests** — in `src/tests.js`. Bovenaan bij de imports toevoegen:

```js
import { vveOverzicht } from "./render-vve.js";
```

Onderaan, vóór de `const totOk = …`-regel:

```js
  // ── vveOverzicht ── (Fase 5: per-VvE-pagina — kerncijfers & verzameling)
  const TF = new Date(2026, 5, 11); // 11 juni 2026
  const _D5 = {
    ntd:{OPPAKKEN:[
      {code:'X1',naam:'Testhof',actiepunt:'Dak nakijken',deadline:'01-06-2026',behandelaar:'Jer',inBehandeling:'FALSE',opvolgdatum:'',_sec:'OPPAKKEN',_row:3},
      {code:'X1',naam:'Testhof',actiepunt:'Brief sturen',deadline:'20-06-2026',behandelaar:'Cihad',inBehandeling:'FALSE',opvolgdatum:'20-07-2026',_sec:'OPPAKKEN',_row:4},
      {code:'X2',naam:'Ander',actiepunt:'Niets',deadline:'',behandelaar:'',inBehandeling:'FALSE',opvolgdatum:'',_sec:'OPPAKKEN',_row:5}],
      VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    af:{OPPAKKEN:[{code:'X1',naam:'Testhof',actiepunt:'Oud klusje',datum:'01-05-2026',_sec:'OPPAKKEN',_row:2}],
      VERGADERVERZOEKEN:[],'OFFERTE-TRAJECTEN':[],LOD:[]},
    alvo:[{code:'X1',naam:'Testhof',uitnodiging:true,notulen:false,begroting:false,status:'Gepland'}],
    alfa:[],
    logboek:[{timestamp:'2026-06-09T10:00:00',code:'X1',actie:'Bewerkt',gebruiker:'info@vvebeheercollectief.nl'}],
  };
  const _o5 = vveOverzicht('X1', _D5, TF);
  eq('vve open',          _o5.cijfers.open, 1);
  eq('vve te laat',       _o5.cijfers.teLaat, 1);
  eq('vve weggelegd',     _o5.cijfers.weggelegd, 1);
  eq('vve naam',          _o5.naam, 'Testhof');
  eq('vve behandelaars',  _o5.behandelaars, ['Jer','Cihad']);
  eq('vve laatste act.',  _o5.cijfers.laatsteDagen, 2);
  eq('vve afgerond',      _o5.afgerond.length, 1);
  eq('vve onbekende code',vveOverzicht('ZZZ', _D5, TF).cijfers.open, 0);
```

- [ ] **Step 4: Draai de tests.** Start (eenmalig, blijft draaien): `cd /Users/servicedesk/collectief-dashboard && python3 -m http.server 8123` (achtergrond). Open `http://localhost:8123/index.html?test=1` en lees de console.
Expected: `[TESTS] 89 OK, 0 FAIL` (81 + 8 nieuwe).

- [ ] **Step 5: Commit**

```bash
git add src/render-vve.js src/state.js src/tests.js
git commit -m "Fase 5: vveOverzicht-helper voor per-VvE-pagina (+tests)"
```

---

### Task 2: Per-VvE-pagina — UI, route en klikbare code-pills

**Files:**
- Modify: `src/render-vve.js` (render + openVvePagina erbij), `index.html` (pagina-container), `src/config.js` (PAGE_META), `src/ui.js` (goTo), `src/actions.js`, `src/render-lijsten.js` (klikbare pills), `src/main.js` (renderAll), `styles.css`

- [ ] **Step 1: Pagina-container** in `index.html`, direct ná het `</div>` van `<div class="page" id="page-herhaal">…` (regel ~330):

```html
    <!-- ══ PER-VVE-DOSSIER (Fase 5) ══ -->
    <div class="page" id="page-vve"><div id="vve-inhoud"></div></div>
```

- [ ] **Step 2: PAGE_META-entry** in `src/config.js`, in het `PAGE_META`-object ná de `herhaal:`-regel:

```js
  vve:['VvE-dossier','Alles van één VvE op één scherm'],
```

- [ ] **Step 3: Render-functies** toevoegen aan `src/render-vve.js`. Imports bovenaan uitbreiden tot:

```js
import { esc, persBadges, berekenPrioriteit, opvolgStatus, parseDt, _vandaagAmsterdam, _verschilInKalenderdagen } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";
import { goTo } from "./ui.js";
import { displayName } from "./util.js";
import { avatarKleur, logZin, logTijd } from "./render-overig.js";
```

(De kringverwijzing render-vve ⇄ ui is hetzelfde patroon als crud ⇄ main: live bindings, aanroep op runtime.)

Daarna deze functies, en de export-regel onderaan vervangen door `export { vveOverzicht, openVvePagina, renderVve };`

```js
// Navigeer naar het dossier van een VvE (en onthoud 'm voor het commandocentrum)
function openVvePagina(code){
  state.vveCode=code;
  state._vveAfAlles=false;
  try{
    const lijst=JSON.parse(localStorage.getItem('recentVves')||'[]').filter(c=>c!==code);
    lijst.unshift(code);
    localStorage.setItem('recentVves',JSON.stringify(lijst.slice(0,3)));
  }catch(e){}
  goTo('vve');
}

function renderVve(){
  const wrap=document.getElementById('vve-inhoud');
  if(!wrap) return;
  const code=state.vveCode;
  if(!code){ wrap.innerHTML='<div class="empty"><div class="empty-ico">🏢</div>Zoek een VvE via Ctrl+K of klik op een VvE-code</div>'; return; }
  const o=vveOverzicht(code,D);
  if(document.getElementById('page-vve').classList.contains('active')){
    document.getElementById('page-title').textContent=`${o.code} — ${o.naam||'VvE'}`;
    document.getElementById('page-sub').textContent='VvE-dossier · alles op één scherm';
  }

  const taakRij=(r,weg)=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const sec=r._sec, p=berekenPrioriteit(r.deadline,sec);
    const dl=weg
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}">terug op ${esc(r.opvolgdatum)}</span>`
      : r.deadline
        ? `${esc(r.deadline)}${p.teLaat?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}`
        : '<span class="warn-geen-deadline">Geen deadline</span>';
    return `<tr class="${weg?'snooze-row':''}" data-action="taak-bewerken" data-rid="${rid}" style="cursor:pointer">
      <td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}</td>
      <td><span class="badge" style="${SECS[sec].css};background:var(--sec-l);color:var(--sec)">${esc(SECS[sec].label)}</span></td>
      <td>${persBadges(r.behandelaar)}</td>
      <td class="cell-sm">${dl}</td></tr>`;
  };
  const afLimiet=state._vveAfAlles?o.afgerond.length:5;
  const afRij=r=>`<tr><td class="cell-txt">${esc(r.actiepunt||r.periode||r.agendapunten||'')}</td>
    <td><span class="badge" style="background:var(--gn-l);color:var(--gn)">✓ ${esc(r.datum||'')}</span></td>
    <td class="cell-sm">${esc(r.opmerking||'')}</td></tr>`;
  const meerKnop=(!state._vveAfAlles&&o.afgerond.length>5)
    ?`<tr><td colspan="3"><button class="btn btn-sec btn-sm" data-action="vve-af-alles">Alle ${o.afgerond.length} tonen</button></td></tr>`:'';

  const alvKaart=()=>{
    let html='';
    if(o.alvo){
      html+=`<div class="vve-alv-rij"><b>Komende ALV</b><span class="badge status-${o.alvo.status.toLowerCase()}">${esc(o.alvo.status)}</span></div>
        <div class="vve-alv-flags">${['uitnodiging','notulen','begroting'].map(f=>
          `<span class="badge" style="background:${o.alvo[f]?'var(--gn-l)':'var(--sur2)'};color:${o.alvo[f]?'var(--gn)':'var(--mut)'}">${o.alvo[f]?'✓':'–'} ${f.charAt(0).toUpperCase()+f.slice(1)}</span>`).join('')}</div>`;
    }
    if(o.alfa.length){
      const l=o.alfa[o.alfa.length-1];
      html+=`<div class="vve-alv-rij" style="color:var(--mut)">Laatst gehouden: ${esc(l.datum||'')}</div>`;
    }
    return html||'<span style="color:var(--mut);font-size:12.5px">Geen ALV-gegevens</span>';
  };

  const actiKaart=o.logboek.slice(0,10).map(e=>{
    const naam=displayName(e.gebruiker)||'—';
    const dagen=_verschilInKalenderdagen(_vandaagAmsterdam(),new Date(e.timestamp));
    const wanneer=isNaN(dagen)||dagen===null?'':dagen<=0?`vandaag ${logTijd(e.timestamp)}`:dagen===1?'gisteren':`${dagen} d`;
    return `<li><span class="log-av" style="background:${avatarKleur(naam)}">${esc(naam.charAt(0))}</span>
      <div class="vve-tl-zin">${logZin(e)}</div><span class="t">${esc(wanneer)}</span></li>`;
  }).join('')||'<li style="color:var(--mut)">Nog geen activiteit in het logboek</li>';

  const kc=(n,lbl,cls)=>`<div class="kc ${cls}"><b>${n}</b><span>${lbl}</span></div>`;
  wrap.innerHTML=`
    <div class="vve-kop">
      <div class="vve-naam">
        <span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l);font-size:15px;padding:5px 11px">${esc(o.code)}</span>
        <div><h3>${esc(o.naam||'Onbekende VvE')}</h3>
        <div class="sub">${o.behandelaars.length?'behandelaars: '+persBadges(o.behandelaars.join(', ')):'<span style="color:var(--mut)">geen lopende taken</span>'}</div></div>
      </div>
      <div class="kerncijfers">
        ${kc(o.cijfers.open,'open taken','teal')}
        ${kc(o.cijfers.teLaat,'te laat',o.cijfers.teLaat?'rood':'grijs')}
        ${kc(o.cijfers.weggelegd,'weggelegd','grijs')}
        ${kc(o.cijfers.laatsteDagen==null?'—':o.cijfers.laatsteDagen+' d','laatste activiteit','')}
      </div>
    </div>
    <div class="vve-grid">
      <div>
        <div class="vve-sectie">Open taken <span class="n">${o.open.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table>
          <thead><tr><th>Taak</th><th>Categorie</th><th>Wie</th><th>Deadline</th></tr></thead>
          <tbody>${o.open.map(r=>taakRij(r,false)).join('')||'<tr><td colspan="4" style="color:var(--mut);padding:14px">Geen open taken 🎉</td></tr>'}</tbody>
        </table></div></div>
        ${o.weggelegd.length?`<div class="vve-sectie">Weggelegd <span class="n">${o.weggelegd.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table><tbody>${o.weggelegd.map(r=>taakRij(r,true)).join('')}</tbody></table></div></div>`:''}
        <div class="vve-sectie">Laatst afgerond <span class="n">${o.afgerond.length}</span></div>
        <div class="card"><div class="tbl-wrap"><table>
          <tbody>${o.afgerond.slice(0,afLimiet).map(afRij).join('')||'<tr><td style="color:var(--mut);padding:14px">Nog niets afgerond</td></tr>'}${meerKnop}</tbody>
        </table></div></div>
      </div>
      <div>
        <div class="vve-sectie">ALV's</div>
        <div class="vve-kaart">${alvKaart()}</div>
        <div class="vve-sectie">Recente activiteit</div>
        <div class="vve-kaart"><ul class="vve-tl">${actiKaart}</ul></div>
      </div>
    </div>`;
}
```

- [ ] **Step 4: Route** — in `src/ui.js`: import toevoegen `import { renderVve } from "./render-vve.js";` en in `goTo()` ná `if(page==='herhaal') renderHerhaal();`:

```js
  if(page==='vve') renderVve();
```

- [ ] **Step 5: Acties registreren** — in `src/actions.js`: import `import { openVvePagina, renderVve } from './render-vve.js';` en in `ACTIONS`:

```js
  'vve-open':              (el) => openVvePagina(el.dataset.code),
  'vve-af-alles':          ()   => { state._vveAfAlles=true; renderVve(); },
```

- [ ] **Step 6: Klikbare code-pills.** In `src/render-lijsten.js`:
  - In `rowNtd` (4 plekken, één per sectie-case) de cel `<td><span class="code" style="${css}">${esc(r.code)}</span></td>` vervangen door:
    `<td><span class="code code-klik" style="${css}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">${esc(r.code)}</span></td>`
  - In `rowAf` hetzelfde voor de code-cel.

- [ ] **Step 7: Verversing** — in `src/main.js` in `renderAll()` ná `renderHerhaal();`:

```js
  renderVve();
```

en bovenaan importeren: `import { renderVve } from './render-vve.js';`

- [ ] **Step 8: CSS** — onderaan `styles.css` toevoegen:

```css
    /* ── Per-VvE-dossier (Fase 5) ── */
    .vve-kop{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
    .vve-naam{display:flex;align-items:center;gap:12px}
    .vve-naam h3{margin:0;font-size:19px;font-weight:800}
    .vve-naam .sub{font-size:12.5px;color:var(--mut);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .kerncijfers{display:flex;gap:10px;flex-wrap:wrap}
    .kc{background:var(--sur);border:1px solid var(--bor);border-radius:10px;padding:8px 14px;text-align:center;min-width:84px;box-shadow:var(--sh)}
    .kc b{display:block;font-size:19px;font-weight:800;line-height:1.2}
    .kc span{font-size:11px;color:var(--mut);font-weight:600}
    .kc.rood b{color:var(--rd)}.kc.teal b{color:var(--ac)}.kc.grijs b{color:var(--mut)}
    .vve-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:20px;align-items:start}
    @media(max-width:900px){.vve-grid{grid-template-columns:1fr}}
    .vve-sectie{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:18px 0 8px;display:flex;align-items:center;gap:8px}
    .vve-sectie:first-child{margin-top:0}
    .vve-sectie .n{background:var(--sur2);border:1px solid var(--bor);border-radius:20px;padding:0 8px;font-size:11px;color:var(--txt)}
    .vve-kaart{background:var(--sur);border:1px solid var(--bor);border-radius:10px;padding:12px 14px;box-shadow:var(--sh)}
    .vve-alv-rij{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:13px}
    .vve-alv-flags{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
    .vve-tl{list-style:none;margin:0;padding:0}
    .vve-tl li{display:flex;gap:10px;padding:7px 0;border-bottom:1px dashed var(--bor);font-size:12.5px;align-items:flex-start}
    .vve-tl li:last-child{border-bottom:none}
    .vve-tl .t{color:var(--mut);font-size:11px;white-space:nowrap;margin-left:auto;padding-left:8px}
    .vve-tl-zin{min-width:0}
    .code-klik{cursor:pointer;transition:filter var(--tr)}
    .code-klik:hover{filter:brightness(.9);text-decoration:underline}
```

Let op: `.log-av` bestaat al (logboek-tijdlijn) en wordt hergebruikt.

- [ ] **Step 9: Smoke-test toevoegen** in `src/tests.js` (vóór de totaaltelling):

```js
  // ── Fase 5 rooktests: nieuwe DOM-ankers bestaan ──
  truthy('page-vve bestaat', !!document.getElementById('page-vve'));
```

- [ ] **Step 10: Draai de tests.** Herlaad `http://localhost:8123/index.html?test=1`.
Expected: `[TESTS] 90 OK, 0 FAIL`. Controleer in de console ook dat er geen import-fouten staan.

- [ ] **Step 11: Visuele check** (zonder login mogelijk?): nee — data vereist login. Sla visuele controle hier over; die volgt op de staging-URL in Task 8.

- [ ] **Step 12: Commit**

```bash
git add src/render-vve.js src/ui.js src/actions.js src/render-lijsten.js src/main.js src/config.js index.html styles.css src/tests.js
git commit -m "Fase 5: per-VvE-dossierpagina met klikbare VvE-codes"
```

---

### Task 3: Commandocentrum — pure zoekfunctie `zoekAlles` + tests

**Files:**
- Create: `src/palette.js` (alleen pure functie; UI in Task 4)
- Modify: `src/tests.js`

- [ ] **Step 1: Maak `src/palette.js`:**

```js
// ══════════════════════════════════════
//  COMMANDOCENTRUM — Ctrl+K: zoek door alles + acties (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, berekenPrioriteit } from "./util.js";
import { SECS, SKEYS } from "./config.js";
import { state, D } from "./state.js";

const PAL_MAX = { vves:3, taken:5, afgerond:3, logboek:3 };

// Pure zoekfunctie (testbaar): doorzoekt VvE's, open taken, afgerond en logboek.
function zoekAlles(q, data, max){
  max = max || PAL_MAX;
  const z=(q||'').trim().toLowerCase();
  const res={vves:[],taken:[],afgerond:[],logboek:[]};
  if(!z) return res;
  const hit=(...velden)=>velden.some(v=>String(v||'').toLowerCase().includes(z));
  res.vves=(data.alvo||[]).filter(r=>hit(r.code,r.naam)).slice(0,max.vves);
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(res.taken.length<max.taken && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.status,r.opmerkingen)) res.taken.push(r);
  }));
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{
    if(res.afgerond.length<max.afgerond && hit(r.code,r.naam,r.actiepunt,r.periode,r.agendapunten,r.opmerking)) res.afgerond.push(r);
  }));
  res.logboek=(data.logboek||[])
    .filter(e=>hit(e.code,e.actie,e.veld,e.oudeWaarde,e.nieuweWaarde,displayName(e.gebruiker)))
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
    .slice(0,max.logboek);
  return res;
}

export { zoekAlles, PAL_MAX };
```

- [ ] **Step 2: Tests** in `src/tests.js` — import erbij: `import { zoekAlles } from "./palette.js";` en vóór de totaaltelling (gebruikt de `_D5`-fixture uit Task 1):

```js
  // ── zoekAlles ── (Fase 5: commandocentrum — groepering & limieten)
  eq('zoek taak op woord',   zoekAlles('dak',_D5).taken.map(r=>r.actiepunt), ['Dak nakijken']);
  eq('zoek vve op naam',     zoekAlles('testhof',_D5).vves.map(r=>r.code), ['X1']);
  eq('zoek vve op code',     zoekAlles('x1',_D5).vves.length, 1);
  eq('zoek hoofdletters',    zoekAlles('DAK',_D5).taken.length, 1);
  eq('zoek leeg → niets',    zoekAlles('',_D5).taken.length, 0);
  eq('zoek afgerond',        zoekAlles('klusje',_D5).afgerond.length, 1);
  eq('zoek logboek',         zoekAlles('bewerkt',_D5).logboek.length, 1);
  eq('zoek logboek op naam', zoekAlles('jer',_D5).logboek.length, 1);
  eq('zoek max vves (3)',    zoekAlles('x',Object.assign({},_D5,{alvo:[1,2,3,4,5].map(i=>({code:'X'+i,naam:''}))})).vves.length, 3);
```

- [ ] **Step 3: Draai de tests.** Herlaad de testpagina. Expected: `[TESTS] 99 OK, 0 FAIL`.

- [ ] **Step 4: Commit**

```bash
git add src/palette.js src/tests.js
git commit -m "Fase 5: zoekAlles-zoekfunctie voor het commandocentrum (+tests)"
```

---

### Task 4: Commandocentrum — UI (Ctrl+K, modal, topbar-knop)

**Files:**
- Modify: `src/palette.js`, `index.html` (modal + topbar-knop), `src/actions.js`, `src/main.js`, `styles.css`, `src/tests.js`

- [ ] **Step 1: Modal-markup** in `index.html`, direct vóór `<div id="toast-container"></div>`:

```html
<!-- ═══════ COMMANDOCENTRUM (Fase 5) ═══════ -->
<div class="modal-bg" id="pal-bg">
  <div class="pal" role="dialog" aria-label="Zoeken en acties">
    <div class="pal-zoek">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="pal-input" type="text" placeholder="Zoek VvE, taak of logboek…" autocomplete="off"/>
      <span class="pal-esc">ESC</span>
    </div>
    <div class="pal-bd" id="pal-bd"></div>
    <div class="pal-voet"><span><b>↑↓</b> kiezen</span><span><b>Enter</b> openen</span><span><b>Esc</b> sluiten</span></div>
  </div>
</div>
```

- [ ] **Step 2: Topbar-knop** in `index.html`, direct vóór de `#notif-btn`-button:

```html
    <button class="ico-btn" id="zoek-btn" title="Zoeken (Ctrl+K)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    </button>
```

- [ ] **Step 3: UI-laag** toevoegen aan `src/palette.js`. Imports uitbreiden:

```js
import { goTo } from "./ui.js";
import { openModal } from "./crud.js";
import { openVvePagina, vveOverzicht } from "./render-vve.js";
import { logZin } from "./render-overig.js";
```

en deze code (export-regel wordt `export { zoekAlles, PAL_MAX, openPalette, closePalette, palKies };`):

```js
// ── UI-laag ──────────────────────────────────────────────────────────
let _palItems=[];   // platte lijst aanklikbare items (over groepsgrenzen heen)
let _palSel=0;      // geselecteerde index (pijltjes)

function openPalette(){
  document.getElementById('pal-bg').classList.add('open');
  const inp=document.getElementById('pal-input');
  inp.value='';
  renderPal('');
  setTimeout(()=>inp.focus(),30);
}
function closePalette(){ document.getElementById('pal-bg').classList.remove('open'); }
function palOpen(){ return document.getElementById('pal-bg').classList.contains('open'); }

function _item(html,doe){ const idx=_palItems.length; _palItems.push({doe});
  return `<div class="pal-res${idx===_palSel?' actief':''}" data-action="pal-kies" data-idx="${idx}">${html}</div>`; }
function _groep(kop,inhoud){ return inhoud?`<div class="pal-groep"><div class="pal-groep-kop">${kop}</div>${inhoud}</div>`:''; }

function renderPal(q){
  _palItems=[]; if(_palSel<0)_palSel=0;
  const bd=document.getElementById('pal-bd');
  let html='';
  if(!q.trim()){
    // lege staat: snelkoppelingen + laatst bezochte VvE's
    let recent=[];
    try{ recent=JSON.parse(localStorage.getItem('recentVves')||'[]'); }catch(e){}
    const rHtml=recent.map(code=>{
      const v=(D.alvo||[]).find(r=>r.code===code);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(code)}</span><div class="pal-tekst"><b>${esc(v?.naam||code)}</b><span>laatst bezocht</span></div>`,
        ()=>{ closePalette(); openVvePagina(code); });
    }).join('');
    html+=_groep('Laatst bezochte VvE\'s',rHtml);
    const acties=[
      ['＋','Nieuwe taak aanmaken',()=>{ closePalette(); goTo('ntd'); openModal(false); }],
      ['📊','Ga naar statistieken',()=>{ closePalette(); goTo('analytics'); }],
      ['🔁','Ga naar herhaalregels',()=>{ closePalette(); goTo('herhaal'); }],
      ['📒','Ga naar logboek',()=>{ closePalette(); goTo('logboek'); }],
    ];
    html+=_groep('Acties',acties.map(([ico,lbl,doe])=>
      _item(`<span class="pal-ico pal-ico-act">${ico}</span><div class="pal-tekst"><b>${esc(lbl)}</b></div>`,doe)).join(''));
  }else{
    const res=zoekAlles(q,D);
    html+=_groep("VvE's",res.vves.map(v=>{
      const ov=vveOverzicht(v.code,D);
      return _item(`<span class="pal-ico pal-ico-vve">${esc(v.code)}</span><div class="pal-tekst"><b>${esc(v.naam||v.code)}</b><span>${ov.cijfers.open} open · ${ov.cijfers.teLaat} te laat${ov.cijfers.laatsteDagen!=null?` · laatste activiteit ${ov.cijfers.laatsteDagen} d`:''}</span></div><span class="pal-hint">Enter → dossier</span>`,
        ()=>{ closePalette(); openVvePagina(v.code); });
    }).join(''));
    html+=_groep('Open taken',res.taken.map(r=>{
      const p=berekenPrioriteit(r.deadline,r._sec);
      const pill=p.teLaat?`<span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:esc(r.deadline||'');
      return _item(`<span class="pal-ico pal-ico-taak">○</span><div class="pal-tekst"><b>${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}</b><span>${esc(r.code)} ${esc(r.naam||'')} · ${esc(SECS[r._sec].label)} · ${esc(r.behandelaar||'—')}</span></div><span class="pal-hint">${pill}</span>`,
        ()=>{ closePalette(); openModal(true,r); });
    }).join(''));
    html+=_groep('Afgerond',res.afgerond.map(r=>
      _item(`<span class="pal-ico pal-ico-af">✓</span><div class="pal-tekst"><b>${esc(r.actiepunt||r.periode||r.agendapunten||'')}</b><span>${esc(r.code)} · afgerond ${esc(r.datum||'')}</span></div>`,
        ()=>{ closePalette(); openVvePagina(r.code); })).join(''));
    html+=_groep('Logboek',res.logboek.map(e=>
      _item(`<span class="pal-ico pal-ico-log">✎</span><div class="pal-tekst"><b class="pal-logzin">${logZin(e)}</b></div>`,
        ()=>{ closePalette(); openVvePagina(e.code); })).join(''));
    html+=_groep('Acties',
      _item(`<span class="pal-ico pal-ico-act">＋</span><div class="pal-tekst"><b>Nieuwe taak aanmaken met "${esc(q)}"</b></div><span class="pal-hint">opent invulscherm</span>`,
        ()=>{ closePalette(); goTo('ntd'); openModal(false);
              const f=document.getElementById('m-actie'); if(f) f.value=q; }));
  }
  bd.innerHTML=html||'<div class="pal-leeg">Geen resultaten</div>';
  if(_palSel>=_palItems.length) _palSel=Math.max(0,_palItems.length-1);
}

function palKies(idx){ const it=_palItems[idx]; if(it) it.doe(); }

function palToets(e){
  if(e.key==='ArrowDown'){ e.preventDefault(); _palSel=Math.min(_palSel+1,_palItems.length-1); _palMarkeer(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); _palSel=Math.max(_palSel-1,0); _palMarkeer(); }
  else if(e.key==='Enter'){ e.preventDefault(); palKies(_palSel); }
}
function _palMarkeer(){
  document.querySelectorAll('#pal-bd .pal-res').forEach((el,i)=>{
    el.classList.toggle('actief',i===_palSel);
    if(i===_palSel) el.scrollIntoView({block:'nearest'});
  });
}
function initPalette(){
  const inp=document.getElementById('pal-input');
  inp.addEventListener('input',()=>{ _palSel=0; renderPal(inp.value); });
  inp.addEventListener('keydown',palToets);
  document.getElementById('pal-bg').addEventListener('mousedown',e=>{ if(e.target.id==='pal-bg') closePalette(); });
  document.getElementById('zoek-btn').onclick=openPalette;
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); palOpen()?closePalette():openPalette(); }
    else if(e.key==='Escape'&&palOpen()){ closePalette(); }
  });
}
```

Export-regel onderaan: `export { zoekAlles, PAL_MAX, openPalette, closePalette, palKies, initPalette, palOpen };`

- [ ] **Step 4: Actie registreren** — `src/actions.js`: import `import { palKies } from './palette.js';` en in `ACTIONS`:

```js
  'pal-kies':              (el) => palKies(+el.dataset.idx),
```

- [ ] **Step 5: Init + poll-guard** — `src/main.js`:
  - import: `import { initPalette } from './palette.js';`
  - in de DOMContentLoaded-handler, ná `initActions();`: `initPalette();`
  - in de 8s-poll de guard-reeks uitbreiden met:

```js
    if(document.getElementById('pal-bg').classList.contains('open')) return;
```

- [ ] **Step 6: CSS** — onderaan `styles.css`:

```css
    /* ── Commandocentrum (Fase 5) ── */
    #pal-bg.open{align-items:flex-start;padding-top:10vh}
    .pal{width:min(620px,94vw);background:var(--sur);border-radius:14px;box-shadow:var(--shl);overflow:hidden;border:1px solid var(--bor)}
    .pal-zoek{display:flex;align-items:center;gap:10px;padding:13px 17px;border-bottom:1px solid var(--bor);color:var(--mut)}
    .pal-zoek input{border:none;outline:none;background:none;font-size:16px;flex:1;color:var(--txt)}
    .pal-esc{font-size:10.5px;font-weight:700;color:var(--mut);border:1px solid var(--bor);border-radius:5px;padding:2px 6px;background:var(--sur2)}
    .pal-bd{max-height:55vh;overflow-y:auto;padding:4px 8px 8px}
    .pal-groep-kop{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--mut);padding:10px 12px 4px}
    .pal-res{display:flex;align-items:center;gap:11px;padding:8px 12px;border-radius:9px;font-size:13.5px;cursor:pointer}
    .pal-res:hover{background:var(--sur2)}
    .pal-res.actief{background:var(--ac-l);outline:1.5px solid var(--ac-b)}
    .pal-ico{width:32px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0}
    .pal-ico-vve{background:var(--ac-l);color:var(--ac);font-size:10px}
    .pal-ico-taak{background:var(--bl-l);color:var(--bl)}
    .pal-ico-af{background:var(--gn-l);color:var(--gn)}
    .pal-ico-log{background:var(--sur2);color:var(--mut);border:1px solid var(--bor)}
    .pal-ico-act{background:var(--nv);color:#fff}
    .pal-tekst{flex:1;min-width:0}
    .pal-tekst b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pal-tekst span{font-size:11.5px;color:var(--mut);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pal-logzin{font-weight:500!important}
    .pal-hint{font-size:11px;color:var(--mut);white-space:nowrap}
    .pal-voet{display:flex;gap:16px;padding:8px 17px;border-top:1px solid var(--bor);background:var(--sur2);font-size:11px;color:var(--mut)}
    .pal-voet b{font-weight:700;border:1px solid var(--bor);background:var(--sur);border-radius:4px;padding:0 5px;font-size:10px}
    .pal-leeg{padding:22px;text-align:center;color:var(--mut);font-size:13px}
```

- [ ] **Step 7: Tests** — in `src/tests.js` de rooktest uitbreiden:

```js
  truthy('pal-bg bestaat', !!document.getElementById('pal-bg'));
  truthy('zoek-btn bestaat', !!document.getElementById('zoek-btn'));
```

- [ ] **Step 8: Draai de tests + handmatige check.** Herlaad de testpagina: `[TESTS] 101 OK, 0 FAIL`. Test daarnaast op de lokale pagina (login-gate is zichtbaar, maar het palette werkt los daarvan): druk Ctrl+K → venster opent, typ iets → "Geen resultaten" (geen data zonder login is ok), Esc → sluit. Controleer geen console-fouten.

- [ ] **Step 9: Commit**

```bash
git add src/palette.js src/actions.js src/main.js index.html styles.css src/tests.js
git commit -m "Fase 5: Ctrl+K-commandocentrum met gegroepeerd zoeken en acties"
```

---

### Task 5: Bulk-selecteerstand (knop, vinkjes, teller, balk — nog zonder acties)

**Files:**
- Create: `src/bulk.js`
- Modify: `index.html`, `src/render-lijsten.js`, `src/actions.js`, `src/main.js`, `styles.css`, `src/tests.js`

- [ ] **Step 1: Selecteren-knop + teller** in `index.html`, in de NTD-filter-bar direct vóór de `#btn-add`-button:

```html
            <span id="bulk-teller" class="bulk-teller" style="display:none">0 geselecteerd</span>
            <button class="btn btn-sec btn-sm" id="bulk-btn" data-action="bulk-toggle" title="Meerdere taken selecteren">☑ Selecteren</button>
```

- [ ] **Step 2: Actiebalk** in `index.html`, direct vóór `<div id="toast-container"></div>`:

```html
<!-- ═══════ BULK-ACTIEBALK (Fase 5) ═══════ -->
<div id="bulk-balk" style="display:none">
  <button class="bb-knop bb-groen" data-action="bulk-doe" data-wat="afronden">✓ Afronden</button>
  <div class="bb-wrap">
    <button class="bb-knop" data-action="bulk-menu" data-menu="geven">👤 Aan iemand geven ▾</button>
    <div class="bb-menu" id="bb-menu-geven">
      <button data-action="bulk-doe" data-wat="geven" data-naam="Jer">Jer</button>
      <button data-action="bulk-doe" data-wat="geven" data-naam="Cihad">Cihad</button>
      <button data-action="bulk-doe" data-wat="geven" data-naam="Gabos">Gabos</button>
      <button data-action="bulk-doe" data-wat="geven" data-naam="Cihan">Cihan</button>
    </div>
  </div>
  <div class="bb-wrap">
    <button class="bb-knop" data-action="bulk-menu" data-menu="wegleggen">🔕 Wegleggen ▾</button>
    <div class="bb-menu" id="bb-menu-wegleggen">
      <button data-action="bulk-doe" data-wat="wegleggen" data-dagen="3">+3 dagen</button>
      <button data-action="bulk-doe" data-wat="wegleggen" data-dagen="7">+1 week</button>
      <button data-action="bulk-doe" data-wat="wegleggen" data-dagen="14">+2 weken</button>
      <div class="bb-datum"><input type="date" id="bb-datum-weg"><button data-action="bulk-doe" data-wat="wegleggen">OK</button></div>
    </div>
  </div>
  <div class="bb-wrap">
    <button class="bb-knop" data-action="bulk-menu" data-menu="deadline">📅 Deadline ▾</button>
    <div class="bb-menu" id="bb-menu-deadline">
      <div class="bb-datum"><input type="date" id="bb-datum-dl"><button data-action="bulk-doe" data-wat="deadline">OK</button></div>
    </div>
  </div>
  <button class="bb-knop bb-rood" data-action="bulk-doe" data-wat="verwijderen">🗑 Verwijderen</button>
  <button class="bb-knop bb-x" data-action="bulk-toggle" title="Selecteren uit">✕</button>
</div>
```

- [ ] **Step 3: Maak `src/bulk.js`** — selectiestand + balk-besturing (acties komen in Task 6):

```js
// ══════════════════════════════════════
//  BULK-ACTIES — selecteren + groepsacties op de NTD-lijst (Fase 5)
// ══════════════════════════════════════
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";

const _sel = new Set();   // geselecteerde taak-objecten (rij-referenties in D)

// Pure helper (testbaar): verwerk-volgorde hoog→laag _row, zodat
// rij-verwijderingen in de Sheet elkaars indexen niet verschuiven.
function _bulkVolgorde(rows){ return [...rows].sort((a,b)=>b._row-a._row); }

function bulkGeselecteerd(r){ return _sel.has(r); }
function bulkSelectie(){ return _bulkVolgorde(_sel); }

function toggleBulkMode(){
  state.bulkMode=!state.bulkMode;
  _sel.clear();
  document.getElementById('bulk-btn').classList.toggle('on',state.bulkMode);
  renderNtd();
  renderBulkUi();
}
function bulkVink(rid){
  const r=state._rowCache[rid]; if(!r) return;
  _sel.has(r)?_sel.delete(r):_sel.add(r);
  renderNtd();
  renderBulkUi();
}
function bulkWis(){ _sel.clear(); }
function renderBulkUi(){
  const teller=document.getElementById('bulk-teller');
  const balk=document.getElementById('bulk-balk');
  teller.style.display=state.bulkMode?'':'none';
  teller.textContent=`${_sel.size} geselecteerd`;
  balk.style.display=(state.bulkMode&&_sel.size>0)?'flex':'none';
  if(!state.bulkMode) _sluitMenus();
}
function toggleBulkMenu(menu){
  const el=document.getElementById('bb-menu-'+menu);
  const open=el.classList.contains('open');
  _sluitMenus();
  if(!open) el.classList.add('open');
}
function _sluitMenus(){ document.querySelectorAll('.bb-menu').forEach(m=>m.classList.remove('open')); }

export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis, renderBulkUi, toggleBulkMenu, _sluitMenus };
```

- [ ] **Step 4: Vinkjes-kolom in de tabel** — `src/render-lijsten.js`:
  - import toevoegen: `import { bulkGeselecteerd } from "./bulk.js";`
  - In `renderNtd()` de thead-regel vervangen door:

```js
  renderThead('ntd-thead',[...(state.bulkMode?['']:[]),...SECS[state.activeNtd].cols,''],SECS[state.activeNtd].css);
```

  - In `renderTbody()` de kolomtelling aanpassen: `const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);`
  - In `rowNtd()`, direct ná `const rid=state._rowCache.length; state._rowCache.push(r);`:

```js
  const bulkCel=state.bulkMode
    ?`<td class="bulk-cel"><span class="cb${bulkGeselecteerd(r)?' aan':''}" data-action="bulk-vink" data-rid="${rid}" role="checkbox" aria-checked="${bulkGeselecteerd(r)}"></span></td>`
    :'';
```

  en in de afsluitende return de cellen voorafgaan: `return `<tr class="${rowCls}" data-row="${r._row}">${bulkCel}${cells}</tr>`;`

- [ ] **Step 5: Acties + Esc + poll-guard.**
  - `src/actions.js`: import `import { toggleBulkMode, bulkVink, toggleBulkMenu } from './bulk.js';` (de `bulk-doe`-actie volgt in Task 6) en in `ACTIONS`:

```js
  'bulk-toggle':           ()   => toggleBulkMode(),
  'bulk-vink':             (el) => bulkVink(+el.dataset.rid),
  'bulk-menu':             (el) => toggleBulkMenu(el.dataset.menu),
```

  - `src/main.js`: in de globale Escape-afhandeling kan niet (die zit in palette.js); voeg in `initPalette`'s keydown-listener in `src/palette.js` toe ná de bestaande Escape-tak:

```js
    else if(e.key==='Escape'&&state.bulkMode){ toggleBulkMode(); }
```

  met import in palette.js: `import { toggleBulkMode } from "./bulk.js";` en `state` is daar al geïmporteerd.
  - `src/main.js`: poll-guard uitbreiden met `if(state.bulkMode) return;`
  - `src/render-lijsten.js` in `setNtd()`: selectie legen bij tab-wissel (spec: selectie geldt per lijst). Vervang de functie door:

```js
function setNtd(s){state.activeNtd=s;pgs.ntd=1;bulkWis();renderNtd();renderBulkUi();}
```

  met import: `import { bulkGeselecteerd, bulkWis, renderBulkUi } from "./bulk.js";`

- [ ] **Step 6: CSS** — onderaan `styles.css`:

```css
    /* ── Bulk-acties (Fase 5) ── */
    .bulk-teller{font-size:12px;font-weight:800;color:var(--ac);background:var(--ac-l);border:1px solid var(--ac-b);border-radius:20px;padding:4px 12px;white-space:nowrap}
    #bulk-btn.on{background:var(--ac-l);border-color:var(--ac-b);color:var(--ac)}
    .bulk-cel{width:34px}
    .cb{width:16px;height:16px;border:2px solid var(--bor);border-radius:4px;display:inline-block;vertical-align:middle;background:var(--sur);cursor:pointer;position:relative;transition:all var(--tr)}
    .cb:hover{border-color:var(--ac)}
    .cb.aan{background:var(--ac);border-color:var(--ac)}
    .cb.aan::after{content:'✓';position:absolute;color:#fff;font-size:11px;font-weight:800;left:2px;top:-3px}
    #bulk-balk{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:600;background:var(--nv);color:#fff;border-radius:14px;box-shadow:var(--shl);display:flex;align-items:center;gap:4px;padding:9px 13px}
    .bb-knop{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#fff;border-radius:8px;padding:7px 11px;background:transparent;white-space:nowrap;transition:background var(--tr)}
    .bb-knop:hover{background:rgba(255,255,255,.12)}
    .bb-groen{background:var(--gn)}
    .bb-rood{color:#FCA5A5}
    .bb-x{margin-left:4px;opacity:.7;font-size:15px;padding:7px 8px}
    .bb-wrap{position:relative}
    .bb-menu{display:none;position:absolute;bottom:calc(100% + 8px);left:0;background:var(--sur);color:var(--txt);border:1px solid var(--bor);border-radius:10px;box-shadow:var(--shm);padding:6px;min-width:170px;flex-direction:column;gap:2px}
    .bb-menu.open{display:flex}
    .bb-menu > button{text-align:left;font-size:13px;font-weight:600;padding:7px 10px;border-radius:7px;color:var(--txt)}
    .bb-menu > button:hover{background:var(--sur2)}
    .bb-datum{display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--bor);margin-top:4px}
    .bb-datum input{flex:1;border:1px solid var(--bor);border-radius:7px;padding:5px 7px;font-size:12px;background:var(--sur2);color:var(--txt)}
    .bb-datum button{font-size:12px;font-weight:700;background:var(--ac);color:#fff;border-radius:7px;padding:5px 11px}
```

- [ ] **Step 7: Tests** — in `src/tests.js`: import `import { _bulkVolgorde } from "./bulk.js";` en vóór de totaaltelling:

```js
  // ── bulk-helpers ── (Fase 5: verwerk-volgorde hoog→laag)
  eq('bulk volgorde hoog→laag', _bulkVolgorde([{_row:3},{_row:9},{_row:5}]).map(r=>r._row), [9,5,3]);
  eq('bulk volgorde leeg', _bulkVolgorde([]), []);
  truthy('bulk-balk bestaat', !!document.getElementById('bulk-balk'));
```

- [ ] **Step 8: Draai de tests.** Herlaad de testpagina. Expected: `[TESTS] 104 OK, 0 FAIL`, geen import-fouten.

- [ ] **Step 9: Commit**

```bash
git add src/bulk.js src/render-lijsten.js src/actions.js src/main.js src/palette.js index.html styles.css src/tests.js
git commit -m "Fase 5: bulk-selecteerstand met vinkjes, teller en actiebalk"
```

---

### Task 6: Bulk-acties — afronden, geven, wegleggen, deadline, verwijderen (+ groeps-undo)

**Files:**
- Modify: `src/bulk.js`, `src/actions.js`, `src/tests.js`

- [ ] **Step 1: Acties implementeren** in `src/bulk.js`. Imports bovenaan uitbreiden tot:

```js
import { state, D } from "./state.js";
import { renderNtd } from "./render-lijsten.js";
import { esc, toDutchDate } from "./util.js";
import { SECS, SID } from "./config.js";
import { ensureToken } from "./auth.js";
import { writeRange, _shiftNtdRows } from "./api.js";
import { getSheetIds, getAfInsertRow, getInsertRow, insertAndWriteRow } from "./crud.js";
import { backgroundWrite, loadAll } from "./data.js";
import { showToast, showUndoToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";
import { renderAll } from "./main.js";
```

En deze code toevoegen (export-regel uitbreiden met `bulkDoe`, `BULK_DEADLINE_KOLOM`):

```js
// Kolomletters in 'Nog Te Doen': behandelaar is overal E (keys-index 4);
// deadline is D bij OPPAKKEN (index 3) en F bij de andere drie (index 5).
const BULK_BEH_KOLOM='E';
const BULK_DEADLINE_KOLOM={OPPAKKEN:'D',VERGADERVERZOEKEN:'F','OFFERTE-TRAJECTEN':'F',LOD:'F'};
const OPVOLG_KOLOM='L';

// Serialiseer een taakrij naar de NTD-kolomwaarden (zelfde vorm als crud.js)
function _ntdValues(r){
  const v=SECS[r._sec].keys.map(k=>r[k]||'');
  while(v.length<8) v.push('');
  v.push('', r.subcategorie||'', '', r.opvolgdatum||'', r.herhaalId||''); // I, J=sub, K, L, M
  return v;
}

function _eindBulk(){
  state.bulkMode=false; bulkWis();
  document.getElementById('bulk-btn').classList.remove('on');
  renderAll(); renderBulkUi();
}

async function bulkDoe(el){
  const wat=el.dataset.wat;
  const rows=bulkSelectie();             // hoog→laag _row
  if(!rows.length) return;
  if(!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  _sluitMenus();
  if(wat==='afronden')    bulkAfronden(rows);
  else if(wat==='geven')  bulkVeld(rows,'geven',el.dataset.naam);
  else if(wat==='wegleggen'){
    let iso=document.getElementById('bb-datum-weg').value;
    if(el.dataset.dagen){ const d=new Date(); d.setDate(d.getDate()+ +el.dataset.dagen);
      iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    if(!iso){ alert('Kies een datum.'); return; }
    bulkVeld(rows,'wegleggen',toDutchDate(iso));
  }
  else if(wat==='deadline'){
    const iso=document.getElementById('bb-datum-dl').value;
    if(!iso){ alert('Kies een datum.'); return; }
    bulkVeld(rows,'deadline',toDutchDate(iso));
  }
  else if(wat==='verwijderen') bulkVerwijderen(rows);
}

// ── Afronden (verplaats naar 'Afgerond') ────────────────────────────────
function bulkAfronden(rows){
  const d=new Date();
  const vandaag=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const items=rows.map(r=>{
    let values;
    switch(r._sec){
      case 'OPPAKKEN':          values=[r.code,r.naam,r.actiepunt||'',r.deadline||'',r.behandelaar||'',r.prioriteit||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];break;
      case 'VERGADERVERZOEKEN': values=[r.code,r.naam,r.periode||'',r.agendapunten||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];break;
      case 'OFFERTE-TRAJECTEN': values=[r.code,r.naam,r.datumAangevraagd||'',r.offertes||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'','',vandaag,'',r.subcategorie||''];break;
      default:                  values=[r.code,r.naam,r.actiepunt||'',r.status||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];
    }
    values.push(r.herhaalId||'');
    return { r, sec:r._sec, origRow:r._row, afValues:values, ntdValues:_ntdValues(r), code:r.code };
  });
  // optimistisch: hoog→laag lokaal verwijderen + indexen meeschuiven
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`✅ ${items.length} taken afgerond`,items.map(i=>i.code).join(', '),()=>bulkUndoAfronden(items));
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const afSheetId=ids['Afgerond'], ntdSheetId=ids['Nog Te Doen'];
    if(afSheetId==null||ntdSheetId==null) throw new Error('Sheet niet gevonden');
    for(const it of items){           // hoog→laag: deletes verschuiven elkaars rijen niet
      const afAfterRow=getAfInsertRow(it.sec);
      const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({requests:[
          {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
          {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:it.afValues.length},
            rows:[{values:it.afValues.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
          {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}
        ]})});
      if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-afronden fout');err.status=resp.status;throw err}
      logEvent(it.code,it.sec,'Afgerond','status','Nog Te Doen','Afgerond op '+vandaag+' (bulk)');
    }
  },()=>{ // rollback: laag→hoog terugzetten
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _shiftNtdRows(it.origRow,+1); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-afronden mislukt');
}
async function bulkUndoAfronden(items){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  try{
    await state._writeChain;
    await loadAll(true);
    const ids=await getSheetIds();
    for(const it of items){
      // verwijder de zojuist toegevoegde Afgerond-rij als die aan de staart staat
      const afEntries=D.af[it.sec]||[];
      const lastAf=afEntries.length?afEntries[afEntries.length-1]:null;
      if(lastAf&&lastAf.code===it.code){
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:ids['Afgerond'],dimension:'ROWS',startIndex:lastAf._row-1,endIndex:lastAf._row}}}]})});
        afEntries.pop();
      }
      await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec),it.ntdValues);
      logEvent(it.code,it.sec,'Teruggezet','status','Afgerond','Nog Te Doen (bulk-undo)');
    }
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
}

// ── Verwijderen ─────────────────────────────────────────────────────────
function bulkVerwijderen(rows){
  if(!confirm(`${rows.length} ${rows.length===1?'taak':'taken'} verwijderen?`)) return;
  const items=rows.map(r=>({r,sec:r._sec,origRow:r._row,ntdValues:_ntdValues(r),code:r.code}));
  items.forEach(it=>{
    const arr=D.ntd[it.sec]||[]; const pos=arr.indexOf(it.r);
    if(pos>-1) arr.splice(pos,1);
    _shiftNtdRows(it.origRow,-1);
    it.pos=pos;
  });
  _eindBulk();
  showUndoToast(`🗑️ ${items.length} taken verwijderd`,items.map(i=>i.code).join(', '),()=>bulkUndoVerwijderen(items));
  backgroundWrite(async()=>{
    const ids=await getSheetIds();
    const sheetId=ids['Nog Te Doen'];
    if(sheetId==null) throw new Error('Sheet "Nog Te Doen" niet gevonden');
    const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:items.map(it=>({deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:it.origRow-1,endIndex:it.origRow}}}))})});
    if(!resp.ok){const e=await resp.json();if(resp.status===401){state.oauthToken=null;state.oauthExpiry=0}const err=new Error(e.error?.message||'Bulk-verwijderfout');err.status=resp.status;throw err}
    items.forEach(it=>logEvent(it.code,it.sec,'Verwijderd','',it.ntdValues[2]||'','(bulk)'));
  },()=>{
    [...items].reverse().forEach(it=>{
      const a=(D.ntd[it.sec]=D.ntd[it.sec]||[]);
      if(a.indexOf(it.r)===-1){ _shiftNtdRows(it.origRow,+1); a.splice(Math.min(it.pos<0?a.length:it.pos,a.length),0,it.r); }
    });
  },'Bulk-verwijderen mislukt');
}
async function bulkUndoVerwijderen(items){
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  try{
    await state._writeChain;
    for(const it of items) await insertAndWriteRow('Nog Te Doen',getInsertRow(it.sec),it.ntdValues);
    items.forEach(it=>logEvent(it.code,it.sec,'Teruggezet','status','Verwijderd','Nog Te Doen (bulk-undo)'));
    showToast('↩ Ongedaan gemaakt',`${items.length} taken terug in Nog Te Doen`,'var(--am)');
    await loadAll();
  }catch(e){ alert('Undo fout: '+e.message); }
}

// ── Veld-acties: geven / wegleggen / deadline (cel-schrijfacties) ───────
function bulkVeld(rows,soort,waarde){
  const conf={
    geven:    { veld:'behandelaar', kolom:()=> BULK_BEH_KOLOM,            titel:`👤 ${rows.length} taken aan ${waarde} gegeven`,  log:'Behandelaar gewijzigd' },
    wegleggen:{ veld:'opvolgdatum', kolom:()=> OPVOLG_KOLOM,              titel:`🔕 ${rows.length} taken weggelegd tot ${waarde}`, log:'Weggelegd' },
    deadline: { veld:'deadline',    kolom:(r)=>BULK_DEADLINE_KOLOM[r._sec],titel:`📅 ${rows.length} deadlines → ${waarde}`,        log:'Deadline gewijzigd' },
  }[soort];
  const items=rows.map(r=>({r,sec:r._sec,code:r.code,oud:r[conf.veld]||''}));
  items.forEach(it=>{ it.r[conf.veld]=waarde; });
  _eindBulk();
  const schrijf=(val)=>async()=>{
    for(const it of items){
      const kol=conf.kolom(it.r);
      await writeRange(`'Nog Te Doen'!${kol}${it.r._row}:${kol}${it.r._row}`,[typeof val==='function'?val(it):val]);
      logEvent(it.code,it.sec,conf.log,conf.veld,typeof val==='function'?it.r[conf.veld]:it.oud,typeof val==='function'?val(it):val);
    }
  };
  showUndoToast(conf.titel,items.map(i=>i.code).join(', '),async()=>{
    await state._writeChain;
    items.forEach(it=>{ it.r[conf.veld]=it.oud; });
    renderAll();
    backgroundWrite(schrijf((it)=>it.oud),()=>{},'Undo mislukt');
  });
  backgroundWrite(schrijf(waarde),
    ()=>{ items.forEach(it=>{ it.r[conf.veld]=it.oud; }); },
    'Bulk-actie mislukt');
}
```

Pas de export-regel onderaan aan naar:

```js
export { _bulkVolgorde, bulkGeselecteerd, bulkSelectie, toggleBulkMode, bulkVink, bulkWis,
         renderBulkUi, toggleBulkMenu, _sluitMenus, bulkDoe, BULK_DEADLINE_KOLOM };
```

- [ ] **Step 2: Actie registreren** — `src/actions.js`: de bulk-import uitbreiden met `bulkDoe` en in `ACTIONS`:

```js
  'bulk-doe':              (el) => bulkDoe(el),
```

- [ ] **Step 3: Tests** — in `src/tests.js`: import uitbreiden met `BULK_DEADLINE_KOLOM` en vóór de totaaltelling:

```js
  // ── bulk kolom-mapping ── (behandelaar=E overal; deadline D/F per sectie)
  eq('bulk deadline-kolom OPPAKKEN', BULK_DEADLINE_KOLOM['OPPAKKEN'], 'D');
  eq('bulk deadline-kolom VERG',     BULK_DEADLINE_KOLOM['VERGADERVERZOEKEN'], 'F');
  eq('bulk deadline-kolom OFF',      BULK_DEADLINE_KOLOM['OFFERTE-TRAJECTEN'], 'F');
  eq('bulk deadline-kolom LOD',      BULK_DEADLINE_KOLOM['LOD'], 'F');
```

- [ ] **Step 4: Draai de tests.** Herlaad de testpagina. Expected: `[TESTS] 108 OK, 0 FAIL`.

- [ ] **Step 5: Commit**

```bash
git add src/bulk.js src/actions.js src/tests.js
git commit -m "Fase 5: bulk-acties afronden/geven/wegleggen/deadline/verwijderen met groeps-undo"
```

---

### Task 7: Chart.js lazy-load

**Files:**
- Modify: `index.html` (script-tag weg), `src/render-analytics.js`, `src/tests.js`

- [ ] **Step 1: Controleer eerst `sw.js`** (service worker): `grep -n "chart" sw.js`. Als chart.js in een precache-lijst staat: daaruit verwijderen. (Verwacht: staat er niet in.)

- [ ] **Step 2: Verwijder de script-tag** in `index.html` (regel ~21):

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

- [ ] **Step 3: Loader toevoegen** in `src/render-analytics.js`, direct ná de imports:

```js
// ── Chart.js lazy-load (Fase 5): pas laden bij eerste bezoek statistiek/dashboard ──
let _chartJsPromise=null;
function ensureChartJs(){
  if(window.Chart) return Promise.resolve();
  if(_chartJsPromise) return _chartJsPromise;
  _chartJsPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload=res;
    s.onerror=()=>{ _chartJsPromise=null; rej(new Error('Chart.js laden mislukt')); };
    document.head.appendChild(s);
  });
  return _chartJsPromise;
}
```

- [ ] **Step 4: Beide bouwers beveiligen.** Zoek `function buildAnalytics(` en `function buildDash(` in `src/render-analytics.js` en voeg als állereerste regel in beide functies toe:

```js
  if(!window.Chart){ ensureChartJs().then(buildAnalytics).catch(e=>console.warn(e)); return; }
```

(in `buildDash` uiteraard `.then(buildDash)`). Daardoor blijft de functie-signatuur synchroon en werken alle bestaande aanroepen (goTo, applyTheme, loadAll) ongewijzigd; bij de eerste keer wordt het script geladen en daarna draait de bouwer alsnog.

- [ ] **Step 5: Test toevoegen** in `src/tests.js`:

```js
  // ── chart.js lazy-load ── (Fase 5: niet meer vooraf geladen)
  truthy('chart.js niet vooraf geladen', typeof window.Chart === 'undefined');
```

- [ ] **Step 6: Draai de tests.** Herlaad de testpagina. Expected: `[TESTS] 109 OK, 0 FAIL`. Controleer in het Network-paneel (of via console `typeof Chart`) dat chart.js niet bij het laden van de pagina wordt opgehaald.

- [ ] **Step 7: Commit**

```bash
git add index.html src/render-analytics.js src/tests.js
git commit -m "Fase 5: chart.js lazy-load — pas laden op de statistiekpagina"
```

---

### Task 8: Actions-dekking, eindverificatie op staging

**Files:**
- Modify: `src/tests.js`
- Push: `staging`

- [ ] **Step 1: Actions-dekkingtest bijwerken** — in `src/tests.js` de array `VERWACHTE_ACTIES` uitbreiden met:

```js
'vve-open','vve-af-alles','pal-kies','bulk-toggle','bulk-vink','bulk-menu','bulk-doe'
```

- [ ] **Step 2: Draai de volledige suite lokaal.** Herlaad `http://localhost:8123/index.html?test=1`.
Expected: `[TESTS] 116 OK, 0 FAIL` (109 + 7 actions-checks), geen console-fouten.

- [ ] **Step 3: Push naar staging**

```bash
git push origin staging
```

- [ ] **Step 4: Verifieer op de staging-URL** `https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app/?test=1` (na de Vercel-build):
  - console: `[TESTS] 116 OK, 0 FAIL`
  - TESTOMGEVING-balk zichtbaar
  - Inloggen (test-Sheet) en handmatig nalopen: Ctrl+K → VvE-code typen → Enter → dossierpagina klopt (kerncijfers, taken, ALV's, activiteit); code-pill in de NTD-lijst klikbaar; Selecteren → 2 taken aanvinken → wegleggen +3 dagen → undo-toast → Ongedaan maken; statistiekpagina openen → grafieken verschijnen (lazy-load); donkere modus op de nieuwe onderdelen.

- [ ] **Step 5: Stop de lokale server** (`python3 -m http.server`-proces beëindigen).

- [ ] **Step 6: Gebruiker informeren** — staging-link delen voor eigen check; merge naar `main` (productie) pas na GO van de gebruiker, zoals bij Fase 4.

---

## Self-review checklist (uitgevoerd bij het schrijven)

- **Spec-dekking:** per-VvE-pagina (Task 1–2), commandocentrum (Task 3–4), bulk (Task 5–6), chart.js (Task 7), tests/uitrol (alle taken + Task 8). YAGNI-lijst uit de spec: niets daarvan zit in dit plan.
- **Type-consistentie:** `vveOverzicht(code,data,vandaag)`, `zoekAlles(q,data,max)`, `_bulkVolgorde(rows)`, `bulkSelectie()` hoog→laag — overal gelijk gebruikt. `_ntdValues` volgt exact de serialisatie uit `crud.js` (I, J=sub, K, L=opvolgdatum, M=herhaalId).
- **Risico's afgedekt:** rij-indexverschuivingen (hoog→laag + `_shiftNtdRows`), poll-pauze bij bulkstand en open palette, selectie leeg bij tab-wissel, kringverwijzingen volgens bestaand patroon (live bindings), Escape-volgorde (palette vóór bulk).
