# Compacte statkop op Nog Te Doen — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De statstrook van ~132px boven de takenlijst vervangen door vier pillen in de paginakop plus een uitklappaneel, zodat er drie taakregels extra zichtbaar zijn.

**Architecture:** De vier tellers worden gerenderd als pillen in `.hdr-info`, waar ze op de NTD-pagina de ondertitel vervangen. Twee pillen zijn filterknoppen die via `state.ntdStatus` en een extra parameter op `filterNtd` de lijst én de tabtellers filteren. De bestaande `.ntd-top-row` blijft bestaan maar wordt het uitklappaneel met Week + vergaderbalk, met de open/dicht-keuze in `localStorage`.

**Tech Stack:** Vanilla ES-modules, geen build-stap. Zelftest in `src/tests.js`, gedraaid in de browser via `?test=1`.

**Spec:** `docs/superpowers/specs/2026-07-27-ntd-kop-compact-design.md`

**Branch:** `feat/ntd-kop-compact` (bestaat al, spec staat erop)

---

## Testen in dit project

Er is geen Node en geen testrunner. De suite is een in-browser zelftest.

**Server starten** (eenmalig, blijft draaien):

Gebruik het preview-gereedschap met `name: "dashboard"` — dat draait
`~/.claude/nocache-server.py` met `Cache-Control: no-store`. Poort is dynamisch;
de tool geeft de URL terug.

**Suite draaien:**

1. Navigeer naar `<preview-url>/index.html?test=1`
2. Lees `window._testResult` uit → string in de vorm `"653 OK, 0 FAIL"`
3. Individuele failures staan als `FAIL: <label> → verwacht X, kreeg Y` in de console

**Cache-valkuil:** een eerder geregistreerde service worker kan oude modules
serveren. Bij een onverklaarbare uitslag eerst opruimen in de preview:
`navigator.serviceWorker.getRegistrations()` → unregister, `caches.keys()` →
`caches.delete`, daarna verse navigatie.

**Meetvalkuil:** in de preview vuurt `requestAnimationFrame` niet. Beoordeel
overgangen en kleuren dus met een screenshot, niet met `getComputedStyle` —
die loopt één stap achter.

**Assert-helpers** in `src/tests.js`:

```js
eq(label, got, exp)      // vergelijkt via JSON.stringify
truthy(label, got)       // faalt op falsy
```

---

## File Structure

| Bestand | Verantwoordelijkheid na deze wijziging |
|---|---|
| `src/state.js` | `ntdStatus` erbij: `'' \| 'telaat' \| 'weggelegd'` |
| `src/render-lijsten.js` | `filterNtd` met statusparameter; `renderNtdStats` rendert pillen in de kop; weekblok naar het paneel; `kopOpen`/`zetKopOpen`/`vulProgressBalk` |
| `src/actions.js` | acties `ntd-stat` en `ntd-kop-toggle` |
| `src/ui.js` | pillen tonen op NTD, ondertitel tonen daarbuiten |
| `index.html` | pillen-container in `.hdr-info`; `.ntd-top-row` wordt uitklappaneel; `#ntd-stats` weg |
| `styles.css` | pilstijlen, chevron, paneel, mobiele terugval; dode regels weg |
| `src/config.js` | `APP_VERSION` → 8.8 |
| `sw.js` | `CACHE_VERSION` → cd-v83 |
| `src/tests.js` | tests voor filter, pillen, uitklap, paginawissel |

---

### Task 0: Baseline vastleggen

**Files:** geen

- [ ] **Step 1: Controleer dat je op de juiste branch staat**

```bash
cd /Users/servicedesk/collectief-dashboard && git branch --show-current
```

Verwacht: `feat/ntd-kop-compact`. Zo niet: `git checkout feat/ntd-kop-compact`.

- [ ] **Step 2: Start de preview-server**

Gebruik het preview-gereedschap met `name: "dashboard"`. Noteer de URL.

- [ ] **Step 3: Draai de suite en noteer de baseline**

Navigeer naar `<preview-url>/index.html?test=1`, lees `window._testResult`.

Verwacht: `"<N> OK, 0 FAIL"`. Schrijf N op — elke volgende taak moet minstens
dit aantal OK houden en 0 FAIL.

Als er al FAILs zijn vóór je begint: stop en meld dit. Bouw niet verder op een
rode suite.

---

### Task 1: Statusfilter in de filterlaag

De pure logica eerst, zonder DOM. Hierna filtert `filterNtd` op te-laat en
weggelegd, en volgen de tabtellers automatisch omdat `renderNtd` diezelfde
functie per sectie aanroept.

**Files:**
- Modify: `src/state.js`
- Modify: `src/render-lijsten.js:174` (`filterNtd`), `:108` en `:117` (aanroepen), `:130-146` (cross-list)
- Test: `src/tests.js`

- [ ] **Step 1: Voeg de import toe die de test nodig heeft**

In `src/tests.js` regel 4, voeg `_vandaagAmsterdam` toe aan de util-import:

```js
import { esc, filt, berekenPrioriteit, _parseAnyDate, displayName, opvolgStatus, volgendeDeadline, STIL_ESCALATIE_REGELS, offerteFase, parseOff, parseAannemers, serializeAannemers, deriveOffertes, reconcileOffertes, vveCodeSpan, isoWeek, coerceDagenVooraf, _vandaagAmsterdam } from "./util.js";
```

Let op: neem de bestaande importregel over en plak er alleen
`, _vandaagAmsterdam` achter vóór de sluitaccolade. Verwijder niets.

- [ ] **Step 2: Schrijf de falende test**

Voeg toe aan `src/tests.js`, direct vóór de slotregels met `const totOk`:

```js
  // ── Statusfilter uit de kop-pillen (te laat / weggelegd) ──
  (()=>{
    const _vd = _vandaagAmsterdam();
    const _mnd = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const _dag = n => { const d = new Date(_vd.getFullYear(), _vd.getMonth(), _vd.getDate()+n);
                        return `${d.getDate()} ${_mnd[d.getMonth()]} ${d.getFullYear()}`; };
    const rijen = [
      {code:'A1', naam:'Te laat',   deadline:_dag(-3), opvolgdatum:'',       behandelaar:''},
      {code:'A2', naam:'Op tijd',   deadline:_dag(10), opvolgdatum:'',       behandelaar:''},
      {code:'A3', naam:'Weggelegd', deadline:_dag(10), opvolgdatum:_dag(5),  behandelaar:''},
      {code:'A4', naam:'Laat+weg',  deadline:_dag(-2), opvolgdatum:_dag(4),  behandelaar:''},
    ];
    const codes = st => filterNtd(rijen,'','','','','OPPAKKEN',st).map(r=>r.code);
    eq('statusfilter leeg → alles',        codes('').length, 4);
    eq('statusfilter telaat',              codes('telaat'), ['A1','A4']);
    eq('statusfilter weggelegd',           codes('weggelegd'), ['A3','A4']);
    eq('statusfilter onbekend → alles',    codes('bestaatniet').length, 4);
    eq('statusfilter combineert met zoek',
       filterNtd(rijen,'te laat','','','','OPPAKKEN','telaat').map(r=>r.code), ['A1']);
  })();
```

- [ ] **Step 3: Draai de suite en zie hem falen**

Navigeer naar `<preview-url>/index.html?test=1`, lees `window._testResult`.

Verwacht: FAIL-regels voor `statusfilter telaat` en `statusfilter weggelegd`
(die geven nu 4 codes terug in plaats van 2), omdat `filterNtd` de zevende
parameter negeert.

- [ ] **Step 4: Voeg `ntdStatus` toe aan de state**

In `src/state.js`, direct onder de regel met `ntdSort`:

```js
  ntdSort: {key:null, asc:true}, // kolomkop-sortering NTD: key 'code'|'deadline'|null (null = standaardvolgorde)
  ntdStatus: '',                 // statusfilter uit de kop-pillen: '' | 'telaat' | 'weggelegd'
```

- [ ] **Step 5: Breid `filterNtd` uit**

In `src/render-lijsten.js:174`, vervang de functiekop en het filterblok:

```js
function filterNtd(rows,q,fCode,beh,prio,sec,status){
  const out=rows.filter(r=>{
    if(q&&!SECS[sec].keys.some(k=>(r[k]||'').toLowerCase().includes(q))) return false;
    if(fCode&&!(r.code||'').toLowerCase().includes(fCode)) return false;
    if(beh&&!(r.behandelaar||'').toLowerCase().includes(beh.toLowerCase())) return false;
    if(prio){
      const berekend = berekenPrioriteit(r.deadline, sec).prioriteit;
      if (berekend !== prio) return false;
    }
    // Statusfilter uit de kop-pillen. Onbekende waarden filteren niets weg, zodat een
    // oude/rare state nooit een lege lijst oplevert.
    if(status==='telaat'    && !berekenPrioriteit(r.deadline, sec).teLaat) return false;
    if(status==='weggelegd' && !opvolgStatus(r).weggelegd) return false;
    return true;
  });
```

De rest van de functie (de offerte-verrijking en de sortering) blijft
ongewijzigd.

- [ ] **Step 6: Geef het filter door op beide aanroepplekken**

In `src/render-lijsten.js`, in `renderNtd`. De tabtellers (rond regel 108):

```js
    const rows = filterNtd(D.ntd[s]||[], q, fCode, fBeh, fPrio, s, state.ntdStatus);
```

En de tabel zelf (rond regel 117):

```js
  const rows=sorteerNtd(filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd,state.ntdStatus),state.ntdSort);
```

- [ ] **Step 7: Laat de "leeg"-melding het statusfilter meetellen**

Nog in `renderNtd`, de `renderTbody`-aanroep. De laatste parameter zegt of er
filters actief zijn (bepaalt de tekst bij een lege lijst):

```js
  renderTbody('ntd-tbody',rows,state.activeNtd,pgs.ntd,false,!!(q||fCode||fBeh||fPrio||state.ntdStatus));
```

- [ ] **Step 8: Laat de cross-list het filter respecteren**

In `renderNtdCrossList`, na de regel met `fPrio`, voeg het statusfilter toe.
Zonder dit toont "Ook hier" gewoon alles terwijl er bovenin een filter aanstaat.

Voeg direct ná deze bestaande regel:

```js
        if(fPrio && berekenPrioriteit(r.deadline,s).prioriteit!==fPrio) return;
```

deze twee regels toe:

```js
        if(state.ntdStatus==='telaat'    && !berekenPrioriteit(r.deadline,s).teLaat) return;
        if(state.ntdStatus==='weggelegd' && !opvolgStatus(r).weggelegd) return;
```

- [ ] **Step 9: Draai de suite en zie hem slagen**

Navigeer opnieuw naar `<preview-url>/index.html?test=1`.

Verwacht: `"<N+5> OK, 0 FAIL"` waarbij N de baseline uit Task 0 is.

- [ ] **Step 10: Commit**

```bash
git add src/state.js src/render-lijsten.js src/tests.js
git commit -m "Statusfilter (te laat / weggelegd) in de NTD-filterlaag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pillen renderen in de paginakop

**Files:**
- Modify: `index.html:99`
- Modify: `src/render-lijsten.js:33-62` (`renderNtdStats`)
- Test: `src/tests.js`

- [ ] **Step 1: Voeg de container toe aan de kop**

In `index.html:99`, vervang:

```html
    <div class="hdr-info"><h1 id="page-title">Vandaag</h1><p id="page-sub">Jouw persoonlijke dagstart</p></div>
```

door:

```html
    <div class="hdr-info"><h1 id="page-title">Vandaag</h1><p id="page-sub">Jouw persoonlijke dagstart</p><div class="kop-pillen" id="ntd-kop-pillen" hidden></div></div>
```

- [ ] **Step 2: Schrijf de falende test**

Voeg toe aan `src/tests.js`, vóór de slotregels met `const totOk`:

```js
  // ── Kop-pillen: vier tellers, twee ervan zijn knoppen ──
  (()=>{
    const ntdOud = D.ntd, afOud = D.af, statusOud = state.ntdStatus;
    try{
      const _vd = _vandaagAmsterdam();
      const _mnd = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
      const _dag = n => { const d = new Date(_vd.getFullYear(), _vd.getMonth(), _vd.getDate()+n);
                          return `${d.getDate()} ${_mnd[d.getMonth()]} ${d.getFullYear()}`; };
      D.ntd = {OPPAKKEN:[
        {code:'P1', naam:'Laat', deadline:_dag(-1), opvolgdatum:'', _row:3},
        {code:'P2', naam:'Weg',  deadline:_dag(9),  opvolgdatum:_dag(4), _row:4},
      ], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};
      D.af = {OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};
      state.ntdStatus = '';
      renderNtdStats();

      const host = document.getElementById('ntd-kop-pillen');
      truthy('kop-pillen container bestaat', !!host);
      eq('vier pillen in de kop', host.querySelectorAll('.kop-pil').length, 4);
      eq('twee pillen zijn knoppen', host.querySelectorAll('button.kop-pil').length, 2);

      const pil = s => host.querySelector(`[data-action="ntd-stat"][data-status="${s}"]`);
      truthy('pil te laat bestaat',    !!pil('telaat'));
      truthy('pil weggelegd bestaat',  !!pil('weggelegd'));
      truthy('pil te laat telt 1',     pil('telaat').textContent.includes('1'));
      truthy('pil weggelegd telt 1',   pil('weggelegd').textContent.includes('1'));
      eq('pil te laat niet aangedrukt', pil('telaat').getAttribute('aria-pressed'), 'false');

      truthy('chevron bestaat', !!host.querySelector('[data-action="ntd-kop-toggle"]'));
    } finally { D.ntd = ntdOud; D.af = afOud; state.ntdStatus = statusOud; }
  })();
```

- [ ] **Step 3: Draai de suite en zie hem falen**

Verwacht: FAIL op `kop-pillen container bestaat` of `vier pillen in de kop` —
`renderNtdStats` schrijft nu nog naar `#ntd-stats`.

- [ ] **Step 4: Herschrijf `renderNtdStats`**

In `src/render-lijsten.js`, vervang de hele functie `renderNtdStats`
(regels 33 t/m 62) door:

```js
// Open/dicht-stand van het uitklappaneel. Bewust in localStorage: de gebruiker die
// hem één keer openzet wil hem morgen ook open.
const KOP_KEY = 'ntd_kop_open';
function kopOpen(){ return localStorage.getItem(KOP_KEY) === '1'; }

const CHEV_SVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

function renderNtdStats(){
  let open=0, telaat=0, weg=0;
  SKEYS.forEach(s=>{
    (D.ntd[s]||[]).forEach(r=>{
      open++;
      if(berekenPrioriteit(r.deadline,s).teLaat) telaat++;
      if(opvolgStatus(r).weggelegd) weg++;
    });
  });
  const tv=_vandaagAmsterdam();
  const todayISO=`${tv.getFullYear()}-${String(tv.getMonth()+1).padStart(2,'0')}-${String(tv.getDate()).padStart(2,'0')}`;
  let afVandaag=0;
  SKEYS.forEach(s=>{(D.af?.[s]||[]).forEach(r=>{ if(toISODate(r.datum||'')===todayISO) afVandaag++; })});

  const host=document.getElementById('ntd-kop-pillen');
  if(!host) return;

  // Plat = alleen aflezen. 'Open' filtert niet (filteren op alles is geen filter) en
  // 'af' komt uit D.af, dat de lijst eronder niet kan tonen.
  const plat=(val,cap,cls='')=>
    `<span class="kop-pil ${cls}"><b>${val}</b> ${cap}</span>`;
  const knop=(val,cap,cls,status)=>{
    const aan=state.ntdStatus===status;
    return `<button type="button" class="kop-pil kop-pil-klik ${cls}${aan?' aan':''}" data-action="ntd-stat" data-status="${status}" aria-pressed="${aan}" title="${aan?'Filter uitzetten':'Toon alleen '+cap}"><b>${val}</b> ${cap}${aan?' <span aria-hidden="true">✕</span>':''}</button>`;
  };
  const paneelOpen=kopOpen();
  const chev=`<button type="button" class="kop-chev" data-action="ntd-kop-toggle" aria-expanded="${paneelOpen}" aria-controls="ntd-top-row" aria-label="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}" title="${paneelOpen?'Details verbergen':'Week en vergaderingen tonen'}">${CHEV_SVG}</button>`;

  host.innerHTML=
    plat(open,'open')+
    knop(telaat,'te laat','pil-rd','telaat')+
    knop(weg,'weggelegd','pil-am','weggelegd')+
    plat(afVandaag,'af','pil-dof')+
    chev;

  renderNtdWeek();
  renderNtdDonut();
}

// Weekblok, nu in het uitklappaneel in plaats van in de statstrook.
function renderNtdWeek(){
  const host=document.getElementById('ntd-week'); if(!host) return;
  const tv=_vandaagAmsterdam();
  const MND=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const wk=isoWeek(tv);
  const ma=new Date(tv); ma.setDate(tv.getDate()-((tv.getDay()+6)%7));
  const zo=new Date(ma); zo.setDate(ma.getDate()+6);
  const range=`${ma.getDate()} ${MND[ma.getMonth()]} – ${zo.getDate()} ${MND[zo.getMonth()]} ${zo.getFullYear()}`;
  host.innerHTML=`<span class="stat-week-cap">Week</span><span class="stat-week-val">${wk}</span>`;
  host.title=`ISO-week ${wk} · ${range}`;
}
```

- [ ] **Step 5: Draai de suite en zie hem slagen**

Verwacht: `0 FAIL` en het totaal opnieuw met 9 gestegen ten opzichte van Task 1.

- [ ] **Step 6: Commit**

```bash
git add index.html src/render-lijsten.js src/tests.js
git commit -m "Kop-pillen: vier tellers in de paginakop, week naar eigen blok

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Klikken op een pil filtert de lijst

**Files:**
- Modify: `src/actions.js`
- Modify: `src/render-lijsten.js:261` (exportblok)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `src/tests.js`, vóór de slotregels met `const totOk`:

```js
  // ── Klik op een pil zet het filter, nogmaals klikken wist het ──
  (()=>{
    const ntdOud=D.ntd, afOud=D.af, statusOud=state.ntdStatus, secOud=state.activeNtd;
    try{
      const _vd=_vandaagAmsterdam();
      const _mnd=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
      const _dag=n=>{ const d=new Date(_vd.getFullYear(),_vd.getMonth(),_vd.getDate()+n);
                      return `${d.getDate()} ${_mnd[d.getMonth()]} ${d.getFullYear()}`; };
      D.ntd={OPPAKKEN:[
        {code:'K1',naam:'Laat', deadline:_dag(-4), opvolgdatum:'', _row:3},
        {code:'K2',naam:'Later',deadline:_dag(12), opvolgdatum:'', _row:4},
        {code:'K3',naam:'Weg',  deadline:_dag(12), opvolgdatum:_dag(6), _row:5},
      ], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};
      D.af={OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};
      state.activeNtd='OPPAKKEN';
      state.ntdStatus='';
      document.getElementById('s-ntd').value='';
      document.getElementById('f-code-ntd').value='';
      document.getElementById('f-beh-ntd').value='';
      document.getElementById('f-prio-ntd').value='';
      renderNtdStats(); renderNtd();

      const pil=s=>document.querySelector(`[data-action="ntd-stat"][data-status="${s}"]`);
      eq('vooraf: drie rijen zichtbaar', document.querySelectorAll('#ntd-tbody tr[data-row]').length, 3);

      ACTIONS['ntd-stat'](pil('telaat'));
      eq('klik zet ntdStatus op telaat', state.ntdStatus, 'telaat');
      eq('lijst toont alleen de late rij', document.querySelectorAll('#ntd-tbody tr[data-row]').length, 1);
      eq('pil is aangedrukt', pil('telaat').getAttribute('aria-pressed'), 'true');

      ACTIONS['ntd-stat'](pil('weggelegd'));
      eq('andere pil vervangt het filter', state.ntdStatus, 'weggelegd');
      eq('lijst toont alleen de weggelegde rij', document.querySelectorAll('#ntd-tbody tr[data-row]').length, 1);
      eq('vorige pil niet meer aangedrukt', pil('telaat').getAttribute('aria-pressed'), 'false');

      ACTIONS['ntd-stat'](pil('weggelegd'));
      eq('tweede klik wist het filter', state.ntdStatus, '');
      eq('lijst toont weer alles', document.querySelectorAll('#ntd-tbody tr[data-row]').length, 3);

      // De tabtellers moeten het filter volgen: hun som is precies het getal in de pil.
      const tabSom = () => [...document.querySelectorAll('#ntd-tabs .cnt')]
                             .reduce((a,e)=>a + (+e.textContent||0), 0);
      eq('tabtellers zonder filter tellen op tot 3', tabSom(), 3);
      ACTIONS['ntd-stat'](pil('telaat'));
      eq('tabtellers volgen het filter', tabSom(), 1);

      // Het getal ÍN de pil blijft het ongefilterde totaal — anders is de weg terug weg.
      truthy('pilgetal blijft het totaal', pil('telaat').textContent.includes('1'));
      truthy('pil weggelegd toont nog steeds haar eigen totaal',
             pil('weggelegd').textContent.includes('1'));

      // Het filter hoort een tabwissel te overleven (state, niet DOM).
      state.activeNtd='VERGADERVERZOEKEN'; renderNtd();
      eq('filter overleeft een tabwissel', state.ntdStatus, 'telaat');
      state.activeNtd='OPPAKKEN'; renderNtd();
      eq('terug op het tabblad nog steeds gefilterd',
         document.querySelectorAll('#ntd-tbody tr[data-row]').length, 1);
    } finally {
      D.ntd=ntdOud; D.af=afOud; state.ntdStatus=statusOud; state.activeNtd=secOud;
    }
  })();
```

- [ ] **Step 2: Draai de suite en zie hem falen**

Verwacht: een `TypeError` of FAIL omdat `ACTIONS['ntd-stat']` nog niet bestaat.

- [ ] **Step 3: Exporteer `kopOpen`**

In `src/render-lijsten.js:261`, voeg `kopOpen` toe aan het exportblok. Neem de
bestaande regel over en vul aan:

```js
  SEC_ICONS, SEC_THEMES, renderNtdStats, renderNtdDonut, renderNtd, setNtd, filterNtd, sorteerNtd, ntdSorteerKey, renderAf, setAf,
  kopOpen,
```

`zetKopOpen` komt pas in Task 4 en wordt daar aan deze regel toegevoegd.

- [ ] **Step 4: Voeg de actie toe**

In `src/actions.js`, direct onder de regel met `'alvo-stat'`:

```js
  'ntd-stat':              (el) => { const s=el.dataset.status;
                                     state.ntdStatus = state.ntdStatus===s ? '' : s;
                                     pgs.ntd=1; renderNtd(); renderNtdStats(); },
```

Controleer bovenin `src/actions.js` dat `renderNtdStats` in de import uit
`./render-lijsten.js` staat. Zo niet, voeg hem toe aan die importregel.
Controleer ook dat `state` en `pgs` geïmporteerd zijn uit `./state.js` — die
worden elders in het bestand al gebruikt, dus dat hoort te kloppen.

- [ ] **Step 5: Draai de suite en zie hem slagen**

Verwacht: `0 FAIL`, totaal met 16 gestegen.

- [ ] **Step 6: Commit**

```bash
git add src/actions.js src/render-lijsten.js src/tests.js
git commit -m "Kop-pillen te laat en weggelegd filteren de takenlijst

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Uitklappaneel met chevron

**Files:**
- Modify: `index.html:122-135`
- Modify: `src/render-lijsten.js` (`renderNtdDonut`, nieuwe `zetKopOpen`/`vulProgressBalk`)
- Modify: `src/actions.js`
- Modify: `src/main.js`
- Test: `src/tests.js`

- [ ] **Step 1: Bouw `.ntd-top-row` om tot paneel**

In `index.html`, vervang regels 123 t/m 135 (van `<div class="ntd-top-row">`
tot en met de bijbehorende `</div>`) door:

```html
      <div class="ntd-top-row" id="ntd-top-row" hidden>
        <div class="ntd-week" id="ntd-week"></div>
        <div class="ntd-progress-card" id="ntd-progress-card">
          <div class="ntd-progress-lbl">Vergaderingen uitgeschreven</div>
          <div class="ntd-progress-track" id="ntd-progress-track">
            <div class="ntd-progress-voor" id="ntd-progress-voor"></div>
            <div class="ntd-progress-fill" id="ntd-progress-fill"></div>
            <span class="ntd-progress-val ntd-progress-val-base" id="ntd-progress-val-base">0 / 0</span>
            <span class="ntd-progress-val ntd-progress-val-rev" id="ntd-progress-val-rev">0 / 0</span>
          </div>
          <div class="ntd-progress-sub" id="ntd-progress-sub">0% van de vergaderingen uitgeschreven</div>
        </div>
      </div>
```

De `<div class="stat-strip" id="ntd-stats"></div>` verdwijnt hiermee.

- [ ] **Step 2: Schrijf de falende test**

Voeg toe aan `src/tests.js`, vóór de slotregels met `const totOk`:

```js
  // ── Uitklappaneel: chevron togglet en onthoudt ──
  (()=>{
    const bewaard = localStorage.getItem('ntd_kop_open');
    const ntdOud = D.ntd, afOud = D.af;
    try{
      D.ntd={OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};
      D.af ={OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[]};

      localStorage.setItem('ntd_kop_open','0');
      zetKopOpen(false);
      renderNtdStats();
      const paneel = document.getElementById('ntd-top-row');
      const chev   = () => document.querySelector('[data-action="ntd-kop-toggle"]');
      truthy('paneel is dicht bij start', paneel.hidden);
      eq('chevron meldt dicht', chev().getAttribute('aria-expanded'), 'false');
      eq('chevron wijst naar het paneel', chev().getAttribute('aria-controls'), 'ntd-top-row');

      ACTIONS['ntd-kop-toggle']();
      truthy('klik opent het paneel', !paneel.hidden);
      eq('onthouden als open', localStorage.getItem('ntd_kop_open'), '1');
      eq('chevron meldt open', chev().getAttribute('aria-expanded'), 'true');

      ACTIONS['ntd-kop-toggle']();
      truthy('tweede klik sluit het paneel', paneel.hidden);
      eq('onthouden als dicht', localStorage.getItem('ntd_kop_open'), '0');

      eq('kopOpen leest de opslag', (localStorage.setItem('ntd_kop_open','1'), kopOpen()), true);
    } finally {
      if(bewaard===null) localStorage.removeItem('ntd_kop_open');
      else localStorage.setItem('ntd_kop_open', bewaard);
      D.ntd=ntdOud; D.af=afOud;
      zetKopOpen(kopOpen());
    }
  })();
```

Voeg `zetKopOpen` en `kopOpen` toe aan de bestaande import uit
`./render-lijsten.js` bovenin `src/tests.js` (regel 9).

- [ ] **Step 3: Draai de suite en zie hem falen**

Verwacht: importfout of FAIL omdat `zetKopOpen` en
`ACTIONS['ntd-kop-toggle']` nog niet bestaan.

- [ ] **Step 4: Splits het vullen van de balk af**

In `src/render-lijsten.js`, vervang de functie `renderNtdDonut` door:

```js
// NTD: voortgangsbalk uitgeschreven vergaderingen (alvo: uitnodiging=TRUE → uitnodiging verzonden)
function renderNtdDonut(){
  const track=document.getElementById('ntd-progress-track');
  if(!track) return;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const total=(D.alvo||[]).length;
  const pct=total?Math.round(done/total*100):0;
  // Voorbereid = klaargezet óf al verstuurd; de balk toont dat als lichter voorloopstuk.
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  const txt=`${done} / ${total}`;
  document.getElementById('ntd-progress-val-base').textContent=txt;
  document.getElementById('ntd-progress-val-rev').textContent=txt;
  document.getElementById('ntd-progress-sub').textContent = voorbereid>done
    ? `${pct}% verstuurd, ${pctVoor}% klaargezet`
    : `${pct}% van de vergaderingen uitgeschreven`;
  // Alleen vullen als het paneel zichtbaar is. Staat het op hidden, dan zou de animatie
  // ongezien afgelopen zijn en de balk bij het openklappen in één keer vol staan.
  if(kopOpen()) vulProgressBalk();
}

// Vollopend effect + reveal: witte cijfers worden onthuld over het gevulde deel,
// donkere cijfers blijven leesbaar over het lichte deel (beide identiek gecentreerd).
function vulProgressBalk(){
  const fill=document.getElementById('ntd-progress-fill'); if(!fill) return;
  const total=(D.alvo||[]).length;
  const done=(D.alvo||[]).filter(r=>r.uitnodiging).length;
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pct=total?Math.round(done/total*100):0;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
  requestAnimationFrame(()=>{
    const voor=document.getElementById('ntd-progress-voor');
    if(voor) voor.style.width=pctVoor+'%';
    fill.style.width=pct+'%';
    const rev=document.getElementById('ntd-progress-val-rev');
    if(rev) rev.style.clipPath=`inset(0 ${100-pct}% 0 0)`;
  });
}

// Paneel openen/sluiten. Schrijft de keuze weg en houdt de chevron in sync.
function zetKopOpen(aan){
  localStorage.setItem(KOP_KEY, aan?'1':'0');
  const paneel=document.getElementById('ntd-top-row');
  if(paneel) paneel.hidden=!aan;
  const chev=document.querySelector('[data-action="ntd-kop-toggle"]');
  if(chev){
    chev.setAttribute('aria-expanded', aan?'true':'false');
    const lbl = aan?'Details verbergen':'Week en vergaderingen tonen';
    chev.setAttribute('aria-label', lbl);
    chev.setAttribute('title', lbl);
  }
  if(aan) vulProgressBalk();
}
```

- [ ] **Step 5: Zet `zetKopOpen` in het exportblok**

In `src/render-lijsten.js:261`, maak de export compleet:

```js
  SEC_ICONS, SEC_THEMES, renderNtdStats, renderNtdDonut, renderNtd, setNtd, filterNtd, sorteerNtd, ntdSorteerKey, renderAf, setAf,
  kopOpen, zetKopOpen,
```

- [ ] **Step 6: Voeg de toggle-actie toe**

In `src/actions.js`, direct onder de `'ntd-stat'`-regel:

```js
  'ntd-kop-toggle':        ()   => zetKopOpen(!kopOpen()),
```

Voeg `kopOpen` en `zetKopOpen` toe aan de import uit `./render-lijsten.js`
bovenin `src/actions.js`.

- [ ] **Step 7: Zet de beginstand bij het opstarten**

In `src/main.js`, direct ná de bestaande aanroep `renderNtdStats();` op
regel 322:

```js
  renderNtdStats();
  zetKopOpen(kopOpen());
```

Voeg `zetKopOpen, kopOpen` toe aan de import uit `./render-lijsten.js` op
regel 9 van `src/main.js`.

- [ ] **Step 8: Draai de suite en zie hem slagen**

Verwacht: `0 FAIL`, totaal met 9 gestegen.

- [ ] **Step 9: Commit**

```bash
git add index.html src/render-lijsten.js src/actions.js src/main.js src/tests.js
git commit -m "Uitklappaneel met week en vergaderbalk achter een chevron

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Pillen alleen op de Nog Te Doen-pagina

**Files:**
- Modify: `src/ui.js:26-27`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

Voeg toe aan `src/tests.js`, vóór de slotregels met `const totOk`:

```js
  // ── De pillen horen alleen bij Nog Te Doen; elders staat de ondertitel ──
  (()=>{
    const pillen = document.getElementById('ntd-kop-pillen');
    const sub    = document.getElementById('page-sub');
    goTo('ntd');
    truthy('op NTD zijn de pillen zichtbaar', !pillen.hidden);
    truthy('op NTD is de ondertitel verborgen', sub.hidden);
    goTo('alvo');
    truthy('elders zijn de pillen verborgen', pillen.hidden);
    truthy('elders is de ondertitel zichtbaar', !sub.hidden);
    truthy('elders staat er tekst in de ondertitel', sub.textContent.length > 0);
    goTo('ntd');
    truthy('terug op NTD zijn de pillen weer zichtbaar', !pillen.hidden);
  })();
```

`goTo` wordt geëxporteerd uit `src/ui.js` (regel 76). Voeg bovenin
`src/tests.js` deze importregel toe:

```js
import { goTo } from "./ui.js";
```

`'alvo'` is een geldige paginasleutel uit `PAGE_META` in `src/config.js` en
heeft een niet-lege ondertitel ("Voortgang vergaderingen per VvE"), dus de
laatste assert kan er niet per ongeluk op slagen.

- [ ] **Step 2: Draai de suite en zie hem falen**

Verwacht: FAIL op `op NTD is de ondertitel verborgen` — de ondertitel wordt nu
altijd gevuld en de pillen staan permanent op `hidden`.

- [ ] **Step 3: Pas de paginawissel aan**

In `src/ui.js`, vervang regels 26-27:

```js
  document.getElementById('page-title').textContent=t;
  document.getElementById('page-sub').textContent=s;
```

door:

```js
  document.getElementById('page-title').textContent=t;
  // Op Nog Te Doen nemen de kop-pillen de plek van de ondertitel in: die ondertitel is
  // decoratie, de tellers zijn informatie. Elders blijft de kop ongewijzigd.
  const opNtd = page==='ntd';
  const sub = document.getElementById('page-sub');
  sub.textContent = opNtd ? '' : s;
  sub.hidden = opNtd;
  const pillen = document.getElementById('ntd-kop-pillen');
  if(pillen) pillen.hidden = !opNtd;
```

- [ ] **Step 4: Draai de suite en zie hem slagen**

Verwacht: `0 FAIL`, totaal met 6 gestegen.

- [ ] **Step 5: Commit**

```bash
git add src/ui.js src/tests.js
git commit -m "Kop-pillen alleen op Nog Te Doen, ondertitel elders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Vormgeving

Geen tests — dit is puur uiterlijk. Verifieer met screenshots.

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Voeg de pilstijlen toe**

In `styles.css`, direct ná regel 87 (`.hdr-info p{...}`):

```css
    .kop-pillen{display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1;overflow:hidden}
    .kop-pil{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;color:var(--mut);background:var(--sur2);border:1px solid transparent;border-radius:999px;padding:3px 9px;white-space:nowrap;line-height:1.3}
    .kop-pil b{font-weight:700;color:var(--txt);font-variant-numeric:tabular-nums}
    .kop-pil.pil-dof b{color:var(--fnt)}
    .kop-pil-klik{cursor:pointer;background:var(--sur);border-color:var(--bor-input);font-family:inherit;transition:background var(--tr),border-color var(--tr),color var(--tr)}
    .kop-pil-klik:hover{background:var(--sur2);border-color:var(--ac-b)}
    .kop-pil.pil-rd b{color:var(--rd)}
    .kop-pil.pil-am b{color:var(--am)}
    .kop-pil-klik.pil-rd{border-color:var(--rd-b)}
    .kop-pil-klik.pil-am{border-color:var(--am-b)}
    .kop-pil-klik.aan.pil-rd{background:var(--rd);border-color:var(--rd);color:#fff}
    .kop-pil-klik.aan.pil-am{background:var(--am);border-color:var(--am);color:#fff}
    .kop-pil-klik.aan b{color:#fff}
    .kop-chev{width:22px;height:22px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--bor-input);border-radius:6px;background:var(--sur);color:var(--mut);cursor:pointer;transition:background var(--tr),color var(--tr),transform var(--tr)}
    .kop-chev:hover{background:var(--sur2);color:var(--txt)}
    .kop-chev[aria-expanded="true"]{background:var(--ac-l);color:var(--ac-900);transform:rotate(180deg)}
```

- [ ] **Step 2: Maak het paneel één regel**

In `styles.css`, vervang regel 371:

```css
    .ntd-top-row{display:flex;gap:14px;margin-bottom:18px;align-items:stretch}
```

door:

```css
    .ntd-top-row{display:flex;gap:14px;margin-bottom:18px;align-items:center;background:var(--sur);border:1px solid var(--bor);border-radius:var(--r);box-shadow:var(--sh);padding:10px 18px}
    .ntd-top-row[hidden]{display:none}
    .ntd-week{display:flex;align-items:baseline;gap:7px;flex-shrink:0;padding-right:16px;border-right:1px solid var(--bor)}
```

Let op: `[hidden]` heeft een expliciete regel nodig omdat `display:flex` het
standaard `hidden`-gedrag overschrijft.

- [ ] **Step 3: Ontdoe de voortgangskaart van haar eigen kaartvorm**

De kaart zit nu ín het paneel, dus de dubbele rand en schaduw moeten weg.
Vervang regel 374:

```css
    .ntd-progress-card{background:var(--sur);border:1px solid var(--bor);border-radius:var(--r);padding:16px 20px;box-shadow:var(--sh),0 4px 12px color-mix(in srgb,var(--ac) 18%,transparent);flex:1 1 0;width:auto;min-width:280px;max-width:560px;display:flex;flex-direction:column;justify-content:center;gap:10px}
```

door:

```css
    .ntd-progress-card{background:none;border:0;box-shadow:none;padding:0;flex:1 1 0;min-width:220px;max-width:none;display:flex;align-items:center;gap:12px}
    .ntd-progress-lbl{flex-shrink:0}
    .ntd-progress-track{flex:1 1 auto;min-width:120px}
    .ntd-progress-sub{flex-shrink:0;white-space:nowrap}
```

Pas ook de hoogte van de balk aan, regel 376, van `height:32px` naar
`height:22px` — de balk staat nu op één regel naast de rest.

- [ ] **Step 4: Verwijder de dode regel**

Verwijder regel 373 volledig:

```css
    .ntd-top-row > .stat-strip{flex:1.7 1 0;min-width:0;margin-bottom:0;align-self:stretch}
```

De statstrook zit niet meer in deze rij.

- [ ] **Step 5: Mobiele terugval**

In `styles.css`, in het blok `@media(max-width:560px)`, vervang de drie
`.stat-item` / `.stat-week`-regels die alleen de NTD-kop dienden:

```css
  .stat-strip{padding:8px 14px}
  .stat-item{border-right:none;margin-right:0;padding:8px 0;flex:1 0 45%}
  .stat-item:has(+ .stat-week){border-right:none}
  .stat-week{flex-basis:100%;border-left:none;border-top:1px solid var(--bor);justify-content:flex-start;padding:10px 0}
```

door:

```css
  .stat-strip{padding:8px 14px}
  .stat-item{border-right:none;margin-right:0;padding:8px 0;flex:1 0 45%}
  /* Kop-pillen passen niet naast hamburger + vijf icoonknoppen: ze zakken naar een
     eigen regel onder de kop. #hdr wordt daarvoor twee regels hoog. */
  #hdr{height:auto;min-height:var(--hh);flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
  .hdr-info{flex:1 1 100%;order:0}
  .kop-pillen{flex:1 1 100%;order:2;margin-top:6px;overflow-x:auto;padding-bottom:2px}
  .ntd-week{padding-right:12px}
```

`.stat-item` en `.stat-strip` blijven staan: `#alvo-stats` en `#dash-stats`
gebruiken ze nog.

- [ ] **Step 6: Verifieer visueel op desktop**

Open de preview. Log niet in — omzeil de gate:

```js
document.getElementById('login-gate').style.display='none'
```

Ga daarna naar de NTD-pagina en maak een screenshot. Controleer:
- de vier pillen staan netjes achter "Nog Te Doen"
- de takenlijst begint direct onder de kaartkop, zonder statstrook
- de chevron staat rechts van de laatste pil

- [ ] **Step 7: Verifieer het uitklappaneel**

Klik de chevron aan (of roep `ACTIONS['ntd-kop-toggle']()` aan) en maak een
screenshot. Controleer dat Week en de vergaderbalk op één regel staan en dat
de balk vol loopt in plaats van in één keer vol te staan.

- [ ] **Step 8: Verifieer donkere modus en mobiel**

Zet het thema op donker, screenshot. Zet daarna het venster op 375px breed,
screenshot. Controleer dat de pillen op een eigen regel onder de kop staan en
dat de icoonknoppen niet overlappen.

- [ ] **Step 9: Draai de suite nog een keer**

De vormgeving mag niets breken. Verwacht: `0 FAIL`.

- [ ] **Step 10: Commit**

```bash
git add styles.css
git commit -m "Vormgeving kop-pillen, chevron en uitklappaneel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Versie ophogen en afronden

**Files:**
- Modify: `src/config.js:8`
- Modify: `sw.js:4`

- [ ] **Step 1: Hoog het versienummer op**

In `src/config.js:8`:

```js
export const APP_VERSION = '8.8';
```

- [ ] **Step 2: Hoog de cacheversie op**

In `sw.js:4`:

```js
const CACHE_VERSION = 'cd-v83';
```

- [ ] **Step 3: Controleer dat er geen verwijzingen naar `ntd-stats` over zijn**

```bash
grep -rn "ntd-stats" src/ index.html styles.css
```

Verwacht: geen treffers. Vind je er nog, verwijder ze.

- [ ] **Step 4: Draai de volledige suite een laatste keer**

Ruim eerst de service worker op in de preview (`getRegistrations` →
unregister, `caches.keys()` → delete), navigeer dan vers naar
`<preview-url>/index.html?test=1`.

Verwacht: `"<baseline+45> OK, 0 FAIL"`.

- [ ] **Step 5: Controleer de diff**

```bash
git diff main --stat
```

Verwacht: wijzigingen in `index.html`, `styles.css`, `sw.js`, `src/config.js`,
`src/state.js`, `src/render-lijsten.js`, `src/actions.js`, `src/ui.js`,
`src/main.js`, `src/tests.js`, plus de twee documenten in `docs/superpowers/`.

- [ ] **Step 6: Commit**

```bash
git add src/config.js sw.js
git commit -m "Versie 8.8 / cd-v83: compacte statkop op Nog Te Doen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of Done

- [ ] Suite groen: baseline + 45 tests OK, 0 FAIL
- [ ] Vier pillen zichtbaar in de kop op Nog Te Doen, verborgen op alle andere pagina's
- [ ] "Te laat" en "weggelegd" filteren de lijst; de tabtellers tellen op tot het getal in de pil
- [ ] Actief filter herkenbaar aan gevulde pil met ✕
- [ ] Chevron opent het paneel met Week en de vergaderbalk; keuze overleeft herladen
- [ ] Vergaderbalk loopt vol bij openklappen in plaats van vol te staan
- [ ] Screenshots gemaakt van licht, donker en 375px breed
- [ ] `APP_VERSION` 8.8, `CACHE_VERSION` cd-v83
- [ ] Geen verwijzingen naar `ntd-stats` meer in de codebase

## Niet in dit plan

Deze punten staan bewust op de "bewust niet"-lijst in de spec: cijfers in de
pillen laten meebewegen met het filter, "af" laten doorlinken naar de
Afgerond-pagina, de pillen ook op Vandaag tonen, en trends in het paneel.

Deploy naar staging of productie hoort niet bij dit plan — de branch blijft
staan tot de gebruiker het werk heeft gezien.
