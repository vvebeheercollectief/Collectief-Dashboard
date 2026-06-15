# Offerte "Vandaag"-focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De platte 24-item "Nu opvolgen"-lijst vervangen door een korte "Vandaag"-focus die splitst in Doorsturen (zelf afmaken) en Nabellen (najagen), met "later=morgen", een subtiel vastgelopen-signaal, en de volledige tabel ingeklapt.

**Architecture:** Het "Vandaag"-paneel wordt in `#off-briefing-slot` gerenderd (vervangt de C2-briefing). Het consumeert de bestaande motor (`offerteNuOpvolgen` → `st.actie`/`balBij`/`dagen`, `offerteSorteerScore`, `offerteBriefingFeiten`). Acties hergebruiken `openOfferteActieModal`; "later" hergebruikt `schrijfOpvolgdatum` (opvolgdatum=morgen). De C2-tabel (`#ntd-tbody`) blijft, maar is standaard ingeklapt.

**Tech Stack:** Vanilla ES-modules, geen bundler. Tests via `?test=1` → `window._testResult`. Branch `staging`.

---

## Bestanden

- `src/util.js` — nieuwe pure helper `offerteNabelTeller(code, logboek)`.
- `src/render-lijsten.js` — `renderOfferteBriefing()` wordt het Vandaag-paneel; nieuwe `offerteFocusRij()`; tabel-zichtbaarheid in `renderNtd()`; `parseOff` importeren.
- `src/state.js` — `offerteDoorsturenOpen`, `offerteNabellenOpen`, `offerteTabelOpen`.
- `src/actions.js` — handlers `offerte-later`, `offerte-meer-d`, `offerte-meer-n`, `offerte-tabel-toggle`.
- `src/snooze.js` — `snoozeMorgen(rid)`.
- `index.html` — `id="ntd-tbl-wrap"` op de offerte-tabelwrap (regel 152).
- `styles.css` — Vandaag-paneel + focus-rijen + knoppen + later + vastgelopen + inklap-voet.
- `src/tests.js` — tests voor teller + splitsing + markup.
- `sw.js` — cache bump.

**Niet aanraken:** motor in `util.js` (alleen consumeren), `src/offerte-acties.js`.

---

### Task 1: util — vastgelopen-teller

**Files:** Modify `src/util.js` (helper + export), `src/tests.js` (test)

- [ ] **Step 1: Test schrijven** in `src/tests.js`, vlak na de bestaande balBijTekst-tests:

```javascript
  // ── offerte: vastgelopen-teller (Nabellen-logregels per code) ──
  eq('nabelteller telt 2 nabel-acties', offerteNabelTeller('A', [
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'Telefoon'},
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'E-mail'},   // doorsturen telt niet
    {sectie:'OFFERTE-TRAJECTEN',code:'A',veld:'Telefoon'},
    {sectie:'OFFERTE-TRAJECTEN',code:'B',veld:'Telefoon'}, // andere code
  ]), 2);
```

En voeg `offerteNabelTeller` toe aan de util-import bovenaan `src/tests.js` (regel 4).

- [ ] **Step 2: Test draaien → faalt** (functie bestaat niet). Zie Task 7 voor het draaien.

- [ ] **Step 3: Helper toevoegen** in `src/util.js` (bij de andere offerte-helpers, na `offerteBriefingFeiten`):

```javascript
// Aantal keren dat een offerte-traject is nagebeld (Contact-logregels met veld 'Telefoon').
function offerteNabelTeller(code, logboek){
  let n = 0;
  (logboek || []).forEach(e => { if (e.sectie === 'OFFERTE-TRAJECTEN' && e.code === code && e.veld === 'Telefoon') n++; });
  return n;
}
```

Voeg `offerteNabelTeller` toe aan de `export { … }` van util.js.

- [ ] **Step 4: Test draaien → slaagt.**

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js && git commit -m "feat(offerte): offerteNabelTeller (vastgelopen-signaal uit logboek)"
```

---

### Task 2: state + index.html + snooze (steigers)

**Files:** Modify `src/state.js`, `index.html` (regel 152), `src/snooze.js`

- [ ] **Step 1: State-vlaggen toevoegen** in `src/state.js`, vlak na `vveCode: null,`:

```javascript
  offerteDoorsturenOpen: false, // Vandaag-focus: Doorsturen-blok volledig uitgeklapt?
  offerteNabellenOpen: false,   // Vandaag-focus: Nabellen-blok volledig uitgeklapt?
  offerteTabelOpen: false,      // Vandaag-focus: volledige offerte-tabel zichtbaar?
```

- [ ] **Step 2: Tabelwrap een id geven** in `index.html` regel 152:

```html
        <div class="tbl-wrap" id="ntd-tbl-wrap"><table><thead id="ntd-thead"></thead><tbody id="ntd-tbody"></tbody></table></div>
```

- [ ] **Step 3: `snoozeMorgen` toevoegen** in `src/snooze.js` (vóór de `export`):

```javascript
// "Later" uit de Vandaag-focus: leg het traject weg tot morgen (één tik, geen modal).
function snoozeMorgen(rid){
  const r = state._rowCache[rid]; if(!r) return;
  const d = new Date(); d.setDate(d.getDate()+1);
  const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  schrijfOpvolgdatum(r, toDutchDate(iso), 'Weggelegd tot morgen');
}
```

En voeg `snoozeMorgen` toe aan de `export { … }` van snooze.js (`toDutchDate` is al geïmporteerd).

- [ ] **Step 4: Commit**

```bash
git add src/state.js index.html src/snooze.js && git commit -m "feat(offerte): steigers voor Vandaag-focus (toggles, tabel-id, snoozeMorgen)"
```

---

### Task 3: render — het Vandaag-paneel

**Files:** Modify `src/render-lijsten.js`

- [ ] **Step 1: `parseOff` importeren** — voeg `parseOff` toe aan de util-import (regel 1) van `src/render-lijsten.js`.

- [ ] **Step 2: Vervang `renderOfferteBriefing()`** (de huidige C2-versie) door het Vandaag-paneel:

```javascript
// Het "Vandaag"-focuspaneel: cijfer-strip + Doorsturen/Nabellen-blokken + inklap-voet.
function renderOfferteBriefing(){
  const slot=document.getElementById('off-briefing-slot');
  if(!slot) return;
  if(state.activeNtd!=='OFFERTE-TRAJECTEN'){ slot.innerHTML=''; return; }
  const rijen=D.ntd['OFFERTE-TRAJECTEN']||[];
  const actMap=_offerteActiviteitMap(D.logboek);
  rijen.forEach(r=>_verrijkOfferteRij(r,actMap));
  const vandaag=_vandaagAmsterdam();
  const nu=[];
  rijen.forEach(r=>{ const st=offerteNuOpvolgen(r,vandaag); r._offStatus=st; r._offNu=st.nodig; if(st.nodig) nu.push(r); });
  nu.sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag));
  const doorsturen=nu.filter(r=>r._offStatus.actie==='Doorsturen');
  const nabellen=nu.filter(r=>r._offStatus.actie!=='Doorsturen');
  const vastgelopen=nabellen.filter(r=>offerteNabelTeller(r.code,D.logboek)>=3).length;
  const f=offerteBriefingFeiten(rijen);
  const datumLabel=new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  const DCAP=3, NCAP=5;
  const dShow=state.offerteDoorsturenOpen?doorsturen:doorsturen.slice(0,DCAP);
  const nShow=state.offerteNabellenOpen?nabellen:nabellen.slice(0,NCAP);
  const stat=(val,cls,cap)=>`<div class="of-stat"><span class="of-num ${cls}">${val}</span><span class="of-cap">${cap}</span></div>`;
  const blok=(titel,cnt,sub,rows,soort,meer,actie)=>
    `<div class="of-sec-h ${soort==='doorsturen'?'send':'call'}"><span>${titel}</span><span class="of-cnt">· ${cnt}</span><span class="of-sub">— ${sub}</span></div>`
    +(rows.length?rows.map(r=>offerteFocusRij(r,soort)).join('')
      :`<div class="of-leeg">Niets ${soort==='doorsturen'?'klaar om te versturen':'om na te bellen'}</div>`)
    +(meer>0?`<button class="of-meer" data-action="${actie}">Toon ${meer} meer ▾</button>`:'');
  slot.innerHTML=`<div class="of-pan">
    <div class="of-top"><span class="of-kick">Vandaag</span><span class="of-date">${esc(datumLabel)}</span></div>
    <div class="of-strip">
      ${stat(nu.length,'','Te doen')}
      ${stat(vastgelopen,vastgelopen?'red':'muted','Vastgelopen')}
      ${stat(doorsturen.length,'','Klaar te versturen')}
      ${stat(f.klaarTeGunnen,f.klaarTeGunnen?'':'muted','Bij de VvE')}
    </div>
    ${blok('Doorsturen',doorsturen.length,'offerte binnen, klaar voor de eigenaren · kun je nu afmaken',dShow,'doorsturen',state.offerteDoorsturenOpen?0:doorsturen.length-dShow.length,'offerte-meer-d')}
    ${blok('Nabellen',nabellen.length,'langst stil eerst, bal bij de aannemer',nShow,'nabellen',state.offerteNabellenOpen?0:nabellen.length-nShow.length,'offerte-meer-n')}
    <div class="of-voet"><span class="of-voet-lbl">Hele lijst · ${rijen.length} trajecten</span>
      <button class="of-voet-tog" data-action="offerte-tabel-toggle">${state.offerteTabelOpen?'Tabel verbergen ▴':'Volledige tabel tonen ▾'}</button></div>
  </div>`;
}

// Eén mini-rij in het Vandaag-paneel (krijgt een eigen rid in _rowCache voor de knoppen).
function offerteFocusRij(r, soort){
  const rid=state._rowCache.length; state._rowCache.push(r);
  const omschr=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,60));
  let ctx, knop;
  if(soort==='doorsturen'){
    const [recv,req]=parseOff(r.offertes||'');
    ctx=`<span class="of-recv">${recv}/${req} binnen</span>${omschr?` · ${omschr}`:''}`;
    knop=`<button class="of-btn-send" data-action="offerte-doorsturen" data-rid="${rid}">Doorsturen</button>`;
  } else {
    const dagen=r._offStatus&&r._offStatus.dagen;
    const t=offerteNabelTeller(r.code,D.logboek);
    const vast=t>=3?` · <span class="of-vast">${t}× nagebeld</span>`:'';
    ctx=`<span class="of-stil">${dagen!=null?dagen+' dagen stil':'opvolgen'}</span>${vast}${omschr?` · ${omschr}`:''}`;
    knop=`<button class="of-btn-call" data-action="offerte-nabellen" data-rid="${rid}">Nabellen</button>`;
  }
  return `<div class="of-r"><span class="of-code" style="color:var(--sec)">${esc(r.code)}</span>
    <div class="of-mid"><div class="of-naam">${esc(r.naam||'')}</div><div class="of-ctx">${ctx}</div></div>
    <div class="of-act"><span class="of-later" data-action="offerte-later" data-rid="${rid}" title="Tot morgen wegleggen">later</span>${knop}</div></div>`;
}
```

- [ ] **Step 3: `offerteFocusRij` exporteren** — voeg `offerteFocusRij` toe aan de `export { … }` van render-lijsten.js (naast `offerteBalBijTekst`; die mag blijven, wordt niet meer in de briefing gebruikt maar de export schaadt niet — of verwijder 'm als hij nergens meer heen gaat). Behoud `offerteBalBijTekst` in de export zolang `tests.js` 'm gebruikt.

- [ ] **Step 4: Tabel-zichtbaarheid** in `renderNtd()` — voeg na `renderOfferteBriefing();` toe:

```javascript
  const tblWrap=document.getElementById('ntd-tbl-wrap'), pag=document.getElementById('ntd-pag');
  const verberg=state.activeNtd==='OFFERTE-TRAJECTEN' && !state.offerteTabelOpen;
  if(tblWrap) tblWrap.style.display=verberg?'none':'';
  if(pag) pag.style.display=verberg?'none':'';
```

- [ ] **Step 5: Commit**

```bash
git add src/render-lijsten.js && git commit -m "feat(offerte): Vandaag-focuspaneel (Doorsturen/Nabellen-split + inklapbare tabel)"
```

---

### Task 4: actions — handlers

**Files:** Modify `src/actions.js`

- [ ] **Step 1: Import uitbreiden** — voeg `snoozeMorgen` toe aan de bestaande import uit `./snooze.js`.

- [ ] **Step 2: Handlers toevoegen** bij de andere offerte-handlers:

```javascript
  'offerte-later':         (el) => snoozeMorgen(+el.dataset.rid),
  'offerte-meer-d':        ()   => { state.offerteDoorsturenOpen=true; renderNtd(); },
  'offerte-meer-n':        ()   => { state.offerteNabellenOpen=true;   renderNtd(); },
  'offerte-tabel-toggle':  ()   => { state.offerteTabelOpen=!state.offerteTabelOpen; renderNtd(); },
```

(`renderNtd` + `state` worden al door dit bestand gebruikt; controleer dat ze geïmporteerd zijn.)

- [ ] **Step 3: Commit**

```bash
git add src/actions.js && git commit -m "feat(offerte): handlers voor later/toon-meer/tabel-toggle"
```

---

### Task 5: CSS — Vandaag-paneel

**Files:** Modify `styles.css` (vervang het `.off-brief`-blok uit het C2-herontwerp, ~regel 624)

- [ ] **Step 1: Vervang het `.off-brief …`-blok** (de C2-briefing-CSS) door:

```css
    /* ── Offerte "Vandaag"-focuspaneel ── */
    .of-pan{background:var(--sur);border:1px solid var(--bor);border-radius:14px;padding:16px 18px;margin:14px 16px 0}
    .of-top{display:flex;justify-content:space-between;align-items:baseline}
    .of-kick{font-size:15px;font-weight:900;color:var(--txt);letter-spacing:-.01em}
    .of-date{font-size:12px;font-weight:600;color:var(--mut)}
    .of-strip{display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--bor)}
    .of-stat{display:flex;flex-direction:column;gap:3px}
    .of-num{font-size:22px;font-weight:900;letter-spacing:-.04em;line-height:1;color:var(--txt);font-variant-numeric:tabular-nums}
    .of-num.red{color:var(--rd)} .of-num.muted{color:var(--bor)}
    .of-cap{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
    .of-sec-h{display:flex;align-items:baseline;gap:8px;margin:17px 0 2px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}
    .of-sec-h.send{color:var(--ac)} .of-sec-h.call{color:var(--txt)}
    .of-cnt{color:var(--mut);opacity:.6}
    .of-sub{font-size:11px;font-weight:600;color:var(--mut);text-transform:none;letter-spacing:0}
    .of-r{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--sur2)}
    .of-r:first-of-type{border-top:none}
    .of-code{font-size:12.5px;font-weight:900;width:64px;flex:none;white-space:nowrap}
    .of-mid{flex:1;min-width:0}
    .of-naam{font-size:13.5px;font-weight:700;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .of-ctx{font-size:12px;color:var(--mut);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .of-ctx .of-stil{color:var(--rd);font-weight:700} .of-ctx .of-recv{color:var(--ac);font-weight:700} .of-ctx .of-vast{color:var(--am);font-weight:700}
    .of-act{display:flex;align-items:center;gap:10px;flex:none}
    .of-later{font-size:11.5px;color:var(--mut);cursor:pointer;white-space:nowrap}
    .of-later:hover{text-decoration:underline}
    .of-btn-send{font-family:inherit;font-size:12px;font-weight:800;color:#fff;background:var(--ac);border:1px solid var(--ac);border-radius:7px;padding:6px 13px;cursor:pointer;white-space:nowrap}
    .of-btn-call{font-family:inherit;font-size:12px;font-weight:700;color:var(--ac);background:transparent;border:1px solid var(--ac-b);border-radius:7px;padding:6px 13px;cursor:pointer;white-space:nowrap}
    .of-btn-call:hover{background:var(--ac-l)}
    .of-meer{margin-top:9px;font-size:12px;font-weight:700;color:var(--ac);background:none;border:none;cursor:pointer;padding:2px 0}
    .of-meer:hover{text-decoration:underline}
    .of-leeg{padding:8px 0;font-size:12.5px;color:var(--mut)}
    .of-voet{margin-top:15px;padding-top:12px;border-top:1px solid var(--bor);display:flex;justify-content:space-between;align-items:center}
    .of-voet-lbl{font-size:12.5px;font-weight:700;color:var(--mut)}
    .of-voet-tog{font-size:12px;font-weight:700;color:var(--ac);background:none;border:none;cursor:pointer}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css && git commit -m "style(offerte): CSS voor Vandaag-focuspaneel"
```

---

### Task 6: Tests — splitsing + markup

**Files:** Modify `src/tests.js` (vervang de C2-markuptest uit het vorige herontwerp)

- [ ] **Step 1: Vervang de test `'briefing rendert C2-cijfer-strip zonder emoji'`** door een Vandaag-paneel-test:

```javascript
  truthy('Vandaag-paneel rendert strip + beide blokken', (()=>{
    try{
      const vorige=state.activeNtd;
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      setNtd(vorige);
      return html.includes('of-strip')&&html.includes('Doorsturen')&&html.includes('Nabellen')
        &&html.includes('Volledige tabel')&&!html.includes('✦');
    }catch(e){ console.error('vandaag-paneel-test:',e); return false; }
  })());
```

- [ ] **Step 2: Tests draaien → alles groen** (zie Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/tests.js && git commit -m "test(offerte): Vandaag-paneel-markup"
```

---

### Task 7: sw + verifiëren + staging

- [ ] **Step 1: sw cache bump** in `sw.js` (`cd-v14` → `cd-v15`).
- [ ] **Step 2: Tests draaien.** `preview_start` (config "dashboard"), navigeer naar `/index.html?test=1`, lees `window._testResult`. Verwacht `… OK, 0 FAIL`.
- [ ] **Step 3: Visuele check** — injecteer mock-offertes (zelfde aanpak als vorige sessie: login-gate verbergen, `D.ntd['OFFERTE-TRAJECTEN']` vullen, `ui.goTo('ntd')`, `setNtd('OFFERTE-TRAJECTEN')`), screenshot in licht + donker. Controleer: kort paneel, Doorsturen/Nabellen-split, "toon meer", "later"-link, vastgelopen-tag bij ≥3 nabel-logregels, tabel verborgen tot "Volledige tabel tonen".
- [ ] **Step 4: Commit sw + push.**

```bash
git add sw.js && git commit -m "chore: sw-cache bump voor Vandaag-focus"
git push origin staging
```

---

## Self-review

- **Spec-dekking:** Vandaag-paneel + strip (T3), Doorsturen/Nabellen-split via `st.actie` (T3), flexibele lengte + toon-meer (T3+T4), later=morgen via snooze (T2+T4), vastgelopen-signaal (T1+T3), volledige tabel ingeklapt (T2+T3+T4), nieuwe strip-labels (T3). Alle spec-secties gedekt.
- **Placeholders:** geen.
- **Type-consistentie:** `offerteNabelTeller(code,logboek)` gedefinieerd (T1), gebruikt in T3 + getest in T1/T6. `snoozeMorgen(rid)` gedefinieerd (T2), gebruikt in T4. `offerteFocusRij(r,soort)` gedefinieerd + geëxporteerd (T3). State-vlaggen `offerteDoorsturenOpen`/`offerteNabellenOpen`/`offerteTabelOpen` gedefinieerd (T2), gebruikt in T3/T4. Handler-namen `offerte-meer-d`/`offerte-meer-n`/`offerte-tabel-toggle`/`offerte-later` consistent tussen render-markup (T3) en handlers (T4).
