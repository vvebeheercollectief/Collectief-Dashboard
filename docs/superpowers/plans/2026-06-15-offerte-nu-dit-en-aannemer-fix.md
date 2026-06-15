# Offerte "Nu dit"-kaart + aannemer-toevoegen-fix — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een aannemer toevoegen laat de regel niet meer wegspringen, er komt een zichtbare "Toevoegen"-knop, en bovenaan de offerte-tab staat een "Nu dit"-kaart die de eerstvolgende taak aanwijst.

**Architecture:** Pure frontend (ES-modules, geen build). De motor (`offerteNuOpvolgen`/termijnen) en de Sheet-structuur blijven ongewijzigd. Alle werk zit in de render-laag (`render-lijsten.js`), één sorteer-tiebreak (`util.js`), één nieuwe actie (`actions.js`) en bijbehorende CSS. Tests draaien in-browser via `?test=1` (truthy/eq-helpers in `tests.js`).

**Tech Stack:** Vanilla JS ES-modules, template-strings voor markup, CSS-custom-properties (`--ac`, `--ac-b`, `--ac-l`, `--sur`, `--sur2`, `--bor`, `--txt`, `--mut`, `--rd`, `--am`). Lokale verificatie via statische preview-server (`python3 -m http.server`).

---

## File Structure

- `src/util.js` — `offerteSorteerScore`: kleine tiebreak "bal bij ons eerst".
- `src/render-lijsten.js` — `offerteAannemerPaneel` (Toevoegen-knop), nieuwe helper `offerteHeroKaart`, en `renderOfferteBriefing` (pin van bewerkte rijen + Nu-dit-kaart).
- `src/actions.js` — nieuwe actie `offerte-aann-add` (Enter-pad blijft).
- `src/tests.js` — testen; `D` toevoegen aan de state-import.
- `styles.css` — stijl voor `.of-hero*`, `.of-pin`, `.of-sec-h.pin`, `.of-aann-toevoeg`.
- `sw.js` — `CACHE_VERSION` → `cd-v17`.

---

## Task 1: Sorteer-tiebreak "bal bij ons eerst"

**Files:**
- Modify: `src/util.js:246-250`
- Test: `src/tests.js` (offerte-sectie, ~na regel 358)

- [ ] **Step 1: Voeg de import van `D` toe aan tests.js** (nodig voor latere taken; nu vast doen)

Wijzig `src/tests.js:10` van:

```js
import { state } from "./state.js";
```

naar:

```js
import { state, D } from "./state.js";
```

- [ ] **Step 2: Schrijf de falende test**

Voeg toe in `src/tests.js` direct ná het blok "2/2 uit lijst → bal bij ons" (rond regel 358):

```js
  // ── offerte: sorteer-tiebreak — bal bij ons (snel af te ronden) wint bij gelijke dagen ──
  truthy('sorteer-tiebreak: bal bij ons > bal bij aannemer bij gelijke dagen', (()=>{
    const vandaag=new Date(2026,5,15);
    const basis={ datumAangevraagd:'1 mei 2026', opvolgdatum:'', laatsteActiviteit:'', aannemers:'' };
    const rOns ={ ...basis, code:'TIE-ONS', offertes:'1/1' }; // recv>0 → ontvangen → ons
    const rAann={ ...basis, code:'TIE-AAN', offertes:'0/1' }; // recv=0 → aangevraagd → aannemer
    return offerteSorteerScore(rOns,vandaag) > offerteSorteerScore(rAann,vandaag);
  })());
```

- [ ] **Step 3: Verifieer dat de test faalt**

Start de preview-server (eenmalig) en open de testpagina:

Run: `mcp__Claude_Preview__preview_start` (config `dashboard`), daarna in de pagina navigeren naar `http://localhost:8123/index.html?test=1` via `preview_eval: window.location.href='/index.html?test=1'`, en `window._testResult` uitlezen.
Expected: FAIL op "sorteer-tiebreak" (score gelijk, want tiebreak bestaat nog niet) — `_testResult` toont ≥1 FAIL, en de console toont `FAIL: sorteer-tiebreak...`.

- [ ] **Step 4: Implementeer de tiebreak**

Vervang `src/util.js:246-250`:

```js
function offerteSorteerScore(r, vandaag, termijnen){
  const s = offerteNuOpvolgen(r, vandaag, termijnen);
  const prioRank = { hoog:2, midden:1, laag:0 }[(((r&&r.prioriteit)||'')+'').trim().toLowerCase()];
  return (s.deadlineTeLaat ? 1e6 : 0) + ((s.dagen || 0) * 100) + (prioRank == null ? 1 : prioRank);
}
```

door:

```js
function offerteSorteerScore(r, vandaag, termijnen){
  const s = offerteNuOpvolgen(r, vandaag, termijnen);
  const prioRank = { hoog:2, midden:1, laag:0 }[(((r&&r.prioriteit)||'')+'').trim().toLowerCase()];
  return (s.deadlineTeLaat ? 1e6 : 0) + ((s.dagen || 0) * 100)
       + (s.balBij === 'ons' ? 10 : 0)            // tiebreak: snel af te ronden (bal bij ons) eerst
       + (prioRank == null ? 1 : prioRank);
}
```

- [ ] **Step 5: Verifieer dat de test slaagt**

Run: herlaad `?test=1` (`preview_eval: window.location.reload()`), lees `window._testResult`.
Expected: PASS — geen FAIL op "sorteer-tiebreak"; totaal-FAIL onveranderd t.o.v. baseline.

- [ ] **Step 6: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "feat(offerte): sorteer-tiebreak — bal bij ons eerst bij gelijke dagen"
```

---

## Task 2: Zichtbare "+ Toevoegen"-knop in het aannemer-paneel

**Files:**
- Modify: `src/render-lijsten.js:199-210` (`offerteAannemerPaneel`)
- Modify: `src/actions.js` (ACTIONS-map, ~regel 59)
- Modify: `styles.css` (~na regel 680)
- Test: `src/tests.js` (offerte-aannemers-sectie, ~regel 373)

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe in `src/tests.js` ná het blok "actie offerte-aann-verwijder bestaat" (rond regel 373):

```js
  // ── offerte-aannemers: zichtbare Toevoegen-knop + actie ──
  truthy('aannemer-paneel heeft Toevoegen-knop',
    offerteAannemerPaneel({code:'Q',_aannemers:[]}).includes('offerte-aann-add'));
  truthy('actie offerte-aann-add bestaat', typeof ACTIONS['offerte-aann-add']==='function');
```

- [ ] **Step 2: Verifieer dat de tests falen**

Run: herlaad `?test=1`, lees `window._testResult`.
Expected: FAIL op beide nieuwe regels (knop/markup en actie bestaan nog niet).

- [ ] **Step 3: Vervang de toevoeg-regel in `offerteAannemerPaneel`**

Vervang in `src/render-lijsten.js` (regel 206-209):

```js
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add"><span class="of-aann-plus" aria-hidden="true">+</span>
      <input class="of-aann-input" data-code="${code}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen"></div>
  </div>`;
```

door:

```js
  return `<div class="of-aann-paneel">${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" data-code="${code}" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button class="of-aann-toevoeg" data-action="offerte-aann-add" data-code="${code}">+ Toevoegen</button>
    </div>
  </div>`;
```

- [ ] **Step 4: Voeg de actie toe in `actions.js`**

Voeg in de ACTIONS-map (direct ná de regel `'offerte-aann-verwijder':...`, ~regel 59) toe:

```js
  'offerte-aann-add':      (el) => { const inp=el.closest('.of-aann-add')?.querySelector('.of-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; addAannemer(el.dataset.code, v); },
```

(`addAannemer` is al geïmporteerd in `actions.js:19`. Het Enter-pad in de keydown-handler blijft ongewijzigd.)

- [ ] **Step 5: Voeg de knop-stijl toe in `styles.css`**

Voeg toe direct ná `.of-aann-input:focus{...}` (regel 680):

```css
    .of-aann-toevoeg{flex-shrink:0;font-family:inherit;font-size:12px;font-weight:800;color:#fff;background:var(--ac);border:1px solid var(--ac);border-radius:7px;padding:0 12px;height:30px;cursor:pointer;white-space:nowrap}
    .of-aann-toevoeg:hover{background:var(--ac-b)}
```

- [ ] **Step 6: Verifieer dat de tests slagen**

Run: herlaad `?test=1`, lees `window._testResult`.
Expected: PASS op beide nieuwe regels.

- [ ] **Step 7: Commit**

```bash
git add src/render-lijsten.js src/actions.js styles.css src/tests.js
git commit -m "feat(offerte): zichtbare '+ Toevoegen'-knop voor aannemers (Enter blijft)"
```

---

## Task 3: Pin bewerkte rijen + "Nu dit"-kaart

**Files:**
- Modify: `src/render-lijsten.js` (nieuwe helper `offerteHeroKaart` + herschreven `renderOfferteBriefing:149-187`)
- Modify: `styles.css` (~na regel 680, ná de knop uit Task 2)
- Test: `src/tests.js` (offerte-briefing-sectie, ~regel 386)

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe in `src/tests.js` direct ná het blok "Vandaag-paneel rendert strip + beide blokken" (rond regel 386):

```js
  // ── offerte-briefing: 'Nu dit'-kaart + gepinde bewerk-rij (regressie wegspringen) ──
  truthy('Nu-dit-kaart toont de urgentste taak', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'], vO=new Set(state.offerteAannOpen);
      state.offerteAannOpen.clear();
      D.ntd['OFFERTE-TRAJECTEN']=[
        {code:'HERO-1',naam:'VvE Urgentst',offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'1 mei 2026',_row:9101},
        {code:'HERO-2',naam:'VvE Tweede', offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'20 mei 2026',_row:9102},
      ];
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; state.offerteAannOpen=vO; setNtd(vA);
      return html.includes('of-hero')&&html.includes('VvE Urgentst')&&html.includes('Begin hier');
    }catch(e){ console.error('nu-dit-test:',e); return false; }
  })());

  truthy('bewerkte rij blijft zichtbaar + gepind (springt niet weg)', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'], vO=new Set(state.offerteAannOpen);
      const rows=[];
      for(let i=0;i<8;i++) rows.push({code:'NB-'+i,naam:'VvE Na '+i,offertes:'0/1',aannemers:'',fase:'',datumAangevraagd:'1 mei 2026',_row:9200+i});
      D.ntd['OFFERTE-TRAJECTEN']=rows;
      state.offerteAannOpen.clear(); state.offerteAannOpen.add('NB-7'); // minst urgente, zou onder de cap vallen
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; state.offerteAannOpen=vO; setNtd(vA);
      return html.includes('of-pin')&&html.includes('NB-7');
    }catch(e){ console.error('pin-test:',e); return false; }
  })());

  truthy('lege nu-lijst → rustige leeg-staat', (()=>{
    try{
      const vA=state.activeNtd, vR=D.ntd['OFFERTE-TRAJECTEN'];
      D.ntd['OFFERTE-TRAJECTEN']=[];
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      D.ntd['OFFERTE-TRAJECTEN']=vR; setNtd(vA);
      return html.includes('Niets dringends');
    }catch(e){ console.error('leeg-test:',e); return false; }
  })());
```

- [ ] **Step 2: Verifieer dat de tests falen**

Run: herlaad `?test=1`, lees `window._testResult`.
Expected: FAIL op "Nu-dit-kaart", "bewerkte rij ... gepind" en "lege nu-lijst" (kaart/pin/leeg-staat bestaan nog niet).

- [ ] **Step 3: Voeg de helper `offerteHeroKaart` toe**

Voeg in `src/render-lijsten.js` direct vóór `function renderOfferteBriefing(){` (regel 149) toe:

```js
// 'Nu dit'-kaart: de urgentste taak van dit moment, met reden en directe actieknop.
function offerteHeroKaart(r, daarna, nuLen){
  const rid=state._rowCache.length; state._rowCache.push(r);
  const st=r._offStatus||{};
  const dagen=st.dagen;
  const omschr=esc(((r.opmerkingen||'').split('\n')[0]||'').slice(0,70));
  const isSend=st.actie==='Doorsturen';
  const reden=st.deadlineTeLaat
    ? `<span class="of-hero-reden laat">Deadline verlopen</span>`
    : (dagen!=null?`<span class="of-hero-reden">${dagen} dagen stil</span>`:`<span class="of-hero-reden">opvolgen</span>`);
  const ctx=[dagen!=null?`${dagen} dagen geen reactie`:'opvolgen', offerteBalBijTekst(st.balBij), omschr].filter(Boolean).join(' · ');
  const knop=isSend
    ? `<button class="of-btn-send" data-action="offerte-doorsturen" data-rid="${rid}">Doorsturen</button>`
    : `<button class="of-btn-call" data-action="offerte-nabellen" data-rid="${rid}">Nabellen</button>`;
  const voet=`<div class="of-hero-voet"><span>${daarna?`Daarna: <b>${esc(daarna.naam||'')}</b>`:''}</span><span>${nuLen} te doen vandaag</span></div>`;
  return `<div class="of-hero">
    <div class="of-hero-kick">Begin hier</div>
    <div class="of-hero-body">
      <div class="of-hero-mid">
        <div class="of-hero-line">${reden}<span class="of-hero-code">${esc(r.code)}</span></div>
        <div class="of-hero-naam">${esc(r.naam||'')}</div>
        <div class="of-hero-ctx">${ctx}</div>
      </div>
      <div class="of-hero-act">${knop}</div>
    </div>
    ${voet}
  </div>`;
}
```

- [ ] **Step 4: Herschrijf `renderOfferteBriefing`**

Vervang de hele functie `renderOfferteBriefing` (`src/render-lijsten.js:149-187`) door:

```js
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
  // Rijen met open aannemer-paneel pinnen we bovenaan: niet in de secties, niet onder de cap,
  // zodat ze tijdens het bewerken niet wegspringen of verdwijnen.
  const bewerkt=r=>state.offerteAannOpen.has(r.code);
  const bewerken=nu.filter(bewerkt);
  // 'Nu dit'-kaart = urgentste taak die NIET in bewerking is.
  const hero=nu.find(r=>!bewerkt(r))||null;
  const inSectie=r=>r!==hero && !bewerkt(r);
  const doorsturenAll=nu.filter(r=>r._offStatus.actie==='Doorsturen');
  const nabellenAll=nu.filter(r=>r._offStatus.actie!=='Doorsturen');
  const doorsturen=doorsturenAll.filter(inSectie);
  const nabellen=nabellenAll.filter(inSectie);
  const vastgelopen=nabellenAll.filter(r=>offerteNabelTeller(r.code,D.logboek)>=3).length;
  const f=offerteBriefingFeiten(rijen);
  const datumLabel=new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  const DCAP=3, NCAP=5;
  const dShow=state.offerteDoorsturenOpen?doorsturen:doorsturen.slice(0,DCAP);
  const nShow=state.offerteNabellenOpen?nabellen:nabellen.slice(0,NCAP);
  const daarna=nabellen.concat(doorsturen).length ? [...doorsturen,...nabellen].sort((a,b)=>offerteSorteerScore(b,vandaag)-offerteSorteerScore(a,vandaag))[0] : null;
  const stat=(val,cls,cap)=>`<div class="of-stat"><span class="of-num ${cls}">${val}</span><span class="of-cap">${cap}</span></div>`;
  const blok=(titel,cnt,sub,rows,soort,meer,actie)=>
    `<div class="of-sec-h ${soort==='doorsturen'?'send':'call'}"><span>${titel}</span><span class="of-cnt">· ${cnt}</span><span class="of-sub">— ${sub}</span></div>`
    +(rows.length?rows.map(r=>offerteFocusRij(r,soort)).join('')
      :`<div class="of-leeg">Niets ${soort==='doorsturen'?'klaar om te versturen':'om na te bellen'}</div>`)
    +(meer>0?`<button class="of-meer" data-action="${actie}">Toon ${meer} meer ▾</button>`:'');
  const heroHtml = hero ? offerteHeroKaart(hero, daarna, nu.length)
                 : (nu.length ? '' : `<div class="of-hero leeg">Niets dringends vandaag — mooi bezig.</div>`);
  const pinHtml = bewerken.length
    ? `<div class="of-pin"><div class="of-sec-h pin"><span>Aan het bijwerken</span></div>`
      + bewerken.map(r=>offerteFocusRij(r, r._offStatus.actie==='Doorsturen'?'doorsturen':'nabellen')).join('')
      + `</div>`
    : '';
  slot.innerHTML=`<div class="of-pan">
    <div class="of-top"><span class="of-kick">Vandaag</span><span class="of-date">${esc(datumLabel)}</span></div>
    ${heroHtml}
    <div class="of-strip">
      ${stat(nu.length,'','Te doen')}
      ${stat(vastgelopen,vastgelopen?'red':'muted','Vastgelopen')}
      ${stat(doorsturenAll.length,'','Klaar te versturen')}
      ${stat(f.klaarTeGunnen,f.klaarTeGunnen?'':'muted','Bij de VvE')}
    </div>
    ${pinHtml}
    ${blok('Doorsturen',doorsturen.length,'offerte binnen, klaar voor de eigenaren · kun je nu afmaken',dShow,'doorsturen',state.offerteDoorsturenOpen?0:doorsturen.length-dShow.length,'offerte-meer-d')}
    ${blok('Nabellen',nabellen.length,'langst stil eerst, bal bij de aannemer',nShow,'nabellen',state.offerteNabellenOpen?0:nabellen.length-nShow.length,'offerte-meer-n')}
    <div class="of-voet"><span class="of-voet-lbl">Hele lijst · ${rijen.length} trajecten</span>
      <button class="of-voet-tog" data-action="offerte-tabel-toggle">${state.offerteTabelOpen?'Tabel verbergen ▴':'Volledige tabel tonen ▾'}</button></div>
  </div>`;
}
```

- [ ] **Step 5: Voeg de CSS toe in `styles.css`**

Voeg toe direct ná `.of-aann-toevoeg:hover{...}` (uit Task 2):

```css
    .of-hero{background:var(--ac-l);border:1px solid var(--ac-b);border-radius:12px;padding:13px 16px;margin-top:14px}
    .of-hero.leeg{background:var(--sur2);border-color:var(--bor);color:var(--mut);font-size:13px;font-weight:600;margin-top:14px}
    .of-hero-kick{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:var(--ac);margin-bottom:6px}
    .of-hero-body{display:flex;align-items:center;gap:12px}
    .of-hero-mid{flex:1;min-width:0}
    .of-hero-line{display:flex;align-items:center;gap:8px;margin-bottom:3px}
    .of-hero-reden{font-size:11px;font-weight:800;color:var(--ac);background:var(--sur);border:1px solid var(--ac-b);border-radius:6px;padding:2px 8px;white-space:nowrap}
    .of-hero-reden.laat{color:#fff;background:var(--rd);border-color:var(--rd)}
    .of-hero-code{font-size:12px;font-weight:700;color:var(--mut)}
    .of-hero-naam{font-size:16px;font-weight:800;color:var(--txt);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .of-hero-ctx{font-size:12.5px;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .of-hero-act{flex-shrink:0}
    .of-hero-voet{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding-top:9px;border-top:1px solid var(--ac-b);font-size:12px;color:var(--mut)}
    .of-pin{margin-top:6px}
    .of-sec-h.pin{color:var(--am)}
```

- [ ] **Step 6: Verifieer dat de tests slagen**

Run: herlaad `?test=1`, lees `window._testResult`.
Expected: PASS op alle drie de nieuwe regels; geen nieuwe FAILs elders.

- [ ] **Step 7: Commit**

```bash
git add src/render-lijsten.js styles.css src/tests.js
git commit -m "feat(offerte): 'Nu dit'-kaart + pin bewerkte rij (lost wegspringen op)"
```

---

## Task 4: Cache-versie bumpen, volledige suite + handmatige verificatie

**Files:**
- Modify: `sw.js:4`

- [ ] **Step 1: Bump de cache-versie**

Vervang `sw.js:4`:

```js
const CACHE_VERSION = 'cd-v16';
```

door:

```js
const CACHE_VERSION = 'cd-v17';
```

- [ ] **Step 2: Volledige testsuite groen**

Run: herlaad `?test=1`, lees `window._testResult`.
Expected: `_testResult` toont `N OK, 0 FAIL` (baseline 199 OK + de nieuwe tests; 0 FAIL).

- [ ] **Step 3: Handmatige rooktest in de preview (visueel)**

Via `preview_eval` een offerte-rij injecteren met open paneel en `renderNtd()` draaien; daarna `preview_screenshot` voor het beeld van de "Nu dit"-kaart + gepinde rij. Controleer met `preview_console_logs level=error` dat er geen JS-fouten zijn.

- [ ] **Step 4: Commit + push naar staging**

```bash
git add sw.js
git commit -m "chore(sw): cache-versie cd-v17 voor 'Nu dit'-kaart + aannemer-fix"
git push origin staging
```

(Staging deployt automatisch — zie Fase 2 CI. Daarna bekijkt de gebruiker het op de staging-URL en geeft GO voor cherry-pick naar `main`.)

---

## Self-Review

**Spec-dekking:**
- Bug "regel springt weg" → Task 3 (pin van bewerkte rijen, regressietest). ✅
- "Toevoegen"-knop → Task 2. ✅
- Teller blijft lijst-gestuurd (geen wijziging) → bewust niet aangeraakt. ✅
- "Nu dit"-kaart (kaart + secties behouden) → Task 3. ✅
- Urgentie-volgorde (deadline trumpt → langst stil → bal-bij-ons-tiebreak) → bestaande score + Task 1. ✅
- Leeg-staat → Task 3 (test + render). ✅
- `sw` cache → Task 4. ✅
- Motor ongewijzigd → geen taak raakt `offerteNuOpvolgen`/termijnen. ✅

**Placeholder-scan:** geen TBD/TODO; alle stappen bevatten echte code/commando's.

**Type-consistentie:** `offerteHeroKaart(r, daarna, nuLen)` aangeroepen met die 3 args in `renderOfferteBriefing`. `offerte-aann-add` consistent in markup (`offerteAannemerPaneel`) en handler (`actions.js`). `of-pin`/`of-hero`/`of-aann-toevoeg`-klassen consistent tussen markup en CSS. CSS-vars (`--ac`, `--ac-b`, `--ac-l`, `--sur`, `--sur2`, `--bor`, `--txt`, `--mut`, `--rd`, `--am`) bestaan al in `styles.css`.
