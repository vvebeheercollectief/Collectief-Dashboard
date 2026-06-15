# Offerte-tab herontwerp (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De offerte-tab in een volwassen, on-brand C2-stijl zetten (zakelijke briefing, geen emoji/chips/candy), met de motor/logica volledig ongewijzigd.

**Architecture:** Puur presentatie: CSS-herontwerp in `styles.css` + markup-wijzigingen in `src/render-lijsten.js`. De briefing wordt altijd zichtbaar (open/dicht-plumbing eruit). Feiten komen ongewijzigd uit `offerteBriefingFeiten` (util.js).

**Tech Stack:** Vanilla ES-modules, geen bundler. Tests draaien in de browser via `?test=1` → `window._testResult`. Branch `staging` → na akkoord merge naar `main`.

---

## Bestanden

- `styles.css` — offerte-blokken (briefing, fase-balk, off-actie, grp-kop, empty); `.off-briefing*` weg.
- `src/render-lijsten.js` — `renderOfferteBriefing` (C2, altijd zichtbaar), nieuw `offerteBalBijTekst`, `faseBalk` (label), groepkoppen + lege staat (emoji weg), `setNtd` auto-open weg, `offerteBriefingTekst` weg, exports bijwerken.
- `src/state.js` — `offerteBriefingOpen` weg.
- `src/actions.js` — 2 briefing-handlers weg.
- `src/tests.js` — imports + offerte-briefing-tests bijwerken.
- `sw.js` — cacheversie ophogen.

**Niet aanraken:** `src/util.js` (motor + `offProg` blijven section-paars), `src/offerte-acties.js`, data/Sheets/Apps Script.

---

### Task 1: CSS — offerte-blokken herontwerpen

**Files:** Modify `styles.css` (regels ~185-192 grp-kop, ~614-635 offerte-blok)

- [ ] **Step 1: Vervang het fase-balk + off-actie + briefing-blok (regels ~614-635)** door:

```css
/* ── Offerte-motor: fase-balk (verfijnd, met fasenaam-label) ── */
.fase-wrap{display:flex;align-items:center;gap:8px;margin-top:4px}
.fase-balk{display:flex;gap:4px;width:64px}
.fase-stap{flex:1;height:5px;border-radius:2px;background:var(--bor)}
.fase-stap.done{background:var(--ac)}
.fase-label{font-size:10.5px;font-weight:700;color:var(--ac);white-space:nowrap}

/* ── Offerte-motor: contextuele actieknop (teal-outline ghost, géén paars) ── */
.off-actie{background:transparent;border-color:var(--ac-b);color:var(--ac);font-weight:700}
.off-actie:hover{background:var(--ac-l);border-color:var(--ac);color:var(--ac)}

/* ── Offerte-briefing (C2): zakelijke kop bovenaan de offerte-tab ── */
.off-brief{background:var(--sur);border:1px solid var(--bor);border-radius:14px;padding:15px 18px;margin:14px 16px 0}
.ob-top{display:flex;justify-content:space-between;align-items:baseline;padding-bottom:11px;border-bottom:1px solid var(--bor)}
.ob-kick{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.ob-date{font-size:12px;font-weight:600;color:var(--mut)}
.ob-urg{border-left:2px solid var(--ac);padding-left:13px;margin-top:14px}
.ob-urg.ob-rust{border-left-color:var(--bor)}
.ob-uk{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--ac)}
.ob-uh{font-size:16px;font-weight:800;color:var(--txt);margin-top:4px;letter-spacing:-.01em}
.ob-rust .ob-uh{font-size:15px}
.ob-um{font-size:12.5px;color:var(--mut);margin-top:3px}
.ob-strip{display:flex;gap:26px;flex-wrap:wrap;margin-top:15px;padding-top:13px;border-top:1px solid var(--bor)}
.ob-stat{display:flex;flex-direction:column;gap:4px}
.ob-num{font-size:24px;font-weight:900;letter-spacing:-.04em;line-height:1;color:var(--txt);font-variant-numeric:tabular-nums}
.ob-num.red{color:var(--rd)} .ob-num.amber{color:var(--am)} .ob-num.teal{color:var(--ac)}
.ob-cap{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
```

- [ ] **Step 2: Vervang grp-kop (regels 191-192)** door:

```css
.grp-kop{background:transparent;padding:14px 13px 9px;font-size:10.5px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;border:none;border-top:1px solid var(--bor)}
.grp-kop.grp-nu{color:var(--ac)}
.grp-n{color:var(--mut);opacity:.6;font-weight:800}
.empty-rust{padding:14px 13px;color:var(--mut);font-size:13px}
```

- [ ] **Step 3: Commit**

```bash
git add styles.css && git commit -m "style(offerte): C2-briefing, verfijnde fase-balk, teal-outline actieknop"
```

---

### Task 2: render-lijsten.js — briefing C2 + helpers + markup

**Files:** Modify `src/render-lijsten.js`

- [ ] **Step 1: Vervang `offerteBriefingTekst` (regels ~145-160) door `offerteBalBijTekst`:**

```javascript
// Offerte-briefing: balBij → natuurlijke NL-tekst.
function offerteBalBijTekst(balBij){
  return {aannemer:'bal bij de aannemer', ons:'bal bij ons', vve:'bal bij de eigenaren'}[balBij] || '';
}
```

- [ ] **Step 2: Vervang `renderOfferteBriefing` (regels ~163-186) door de C2-versie:**

```javascript
// Vult de briefing-slot met de C2-kop (altijd zichtbaar op de offerte-tab); leeg op andere tabs.
function renderOfferteBriefing(){
  const slot=document.getElementById('off-briefing-slot');
  if(!slot) return;
  if(state.activeNtd!=='OFFERTE-TRAJECTEN'){ slot.innerHTML=''; return; }
  const rijen=D.ntd['OFFERTE-TRAJECTEN']||[];
  const actMap=_offerteActiviteitMap(D.logboek);
  rijen.forEach(r=>_verrijkOfferteRij(r,actMap));
  const f=offerteBriefingFeiten(rijen);
  const datumLabel=new Date().toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  let urgHtml;
  if(f.urgentste){
    const u=f.urgentste, bal=offerteBalBijTekst(u.balBij);
    const meta=`${u.dagen!=null?`${u.dagen} dagen stil`:''}${bal?`${u.dagen!=null?' · ':''}${bal}`:''}`;
    urgHtml=`<div class="ob-urg"><div class="ob-uk">Urgentst</div>
      <div class="ob-uh">${esc(u.naam||u.code)}</div>
      <div class="ob-um">${esc(meta)}</div></div>`;
  } else {
    const extra=f.klaarTeGunnen?` ${f.klaarTeGunnen===1?'Eén traject ligt':f.klaarTeGunnen+' trajecten liggen'} bij de VvE voor akkoord.`:'';
    urgHtml=`<div class="ob-urg ob-rust"><div class="ob-uh">Niets dat nu opvolging vraagt.</div>
      <div class="ob-um">Alle lopende trajecten zitten binnen hun termijn.${extra}</div></div>`;
  }
  slot.innerHTML=`<div class="off-brief">
    <div class="ob-top"><span class="ob-kick">Vandaag</span><span class="ob-date">${esc(datumLabel)}</span></div>
    ${urgHtml}
    <div class="ob-strip">
      <div class="ob-stat"><span class="ob-num">${f.nuOpvolgen}</span><span class="ob-cap">Nu opvolgen</span></div>
      <div class="ob-stat"><span class="ob-num red">${f.langStil}</span><span class="ob-cap">Lang stil</span></div>
      <div class="ob-stat"><span class="ob-num amber">${f.balBijOns}</span><span class="ob-cap">Wacht op jou</span></div>
      <div class="ob-stat"><span class="ob-num teal">${f.klaarTeGunnen}</span><span class="ob-cap">Bij de VvE</span></div>
    </div></div>`;
}
```

- [ ] **Step 3: Verwijder de auto-open-localStorage-tak in `setNtd` (regels ~132-137).** Resultaat:

```javascript
function setNtd(s){
  state.activeNtd=s;pgs.ntd=1;bulkWis();
  renderNtd();renderBulkUi();
}
```

- [ ] **Step 4: Vervang de groepkoppen + lege staat (regels ~434, ~437, ~440):**

```javascript
      html+=`<tr><td colspan="${colsOff}" class="grp-kop grp-nu">Nu opvolgen <span class="grp-n">· ${nu.length}</span></td></tr>`;
      html+=nu.length
        ?nu.map(r=>rowNtd(r,sec)).join('')
        :`<tr><td colspan="${colsOff}"><div class="empty-rust">Niets dat nu opvolging vraagt</div></td></tr>`;
    }
    if(lopend.length){
      html+=`<tr><td colspan="${colsOff}" class="grp-kop">Lopend <span class="grp-n">· ${lopend.length}</span></td></tr>`;
```

- [ ] **Step 5: Vervang `faseBalk` (regels ~480-487):**

```javascript
// Offerte-motor: verfijnde fase-balk (4 mijlpalen) + fasenaam-label.
function faseBalk(r){
  const fases=['aangevraagd','ontvangen','bij_vve','gegund'];
  const kort={aangevraagd:'Aangevr.',ontvangen:'Ontvangen',bij_vve:'Bij VvE',gegund:'Gegund'};
  const idx=fases.indexOf(offerteFase(r));
  const segs=fases.map((f,i)=>`<span class="fase-stap ${i<=idx?'done':''}"></span>`).join('');
  return `<div class="fase-wrap"><div class="fase-balk">${segs}</div><span class="fase-label">${kort[fases[idx]]||''}</span></div>`;
}
```

- [ ] **Step 6: Werk de import (regel 1) en de export (regel ~624) bij** — `offerteBriefingTekst` eruit, `offerteBalBijTekst` erin. In de import (regel 1): voeg geen util-import toe (helper staat lokaal). In de `export {…}`: vervang `offerteBriefingTekst` door `offerteBalBijTekst`.

- [ ] **Step 7: Commit**

```bash
git add src/render-lijsten.js && git commit -m "feat(offerte): C2-briefing altijd zichtbaar + verfijnde fase-balk/groepkoppen"
```

---

### Task 3: Verwijder open/dicht-plumbing

**Files:** Modify `src/state.js` (regel 57), `src/actions.js` (regels 52-53)

- [ ] **Step 1: Verwijder `offerteBriefingOpen: false,` regel uit `src/state.js`.**

- [ ] **Step 2: Verwijder de twee handlers uit `src/actions.js`:**

```javascript
  'offerte-briefing-sluiten': () => { state.offerteBriefingOpen=false; renderNtd(); },
  'offerte-briefing-openen':  () => { state.offerteBriefingOpen=true;  renderNtd(); },
```

- [ ] **Step 3: Commit**

```bash
git add src/state.js src/actions.js && git commit -m "refactor(offerte): briefing open/dicht-plumbing verwijderd (altijd zichtbaar)"
```

---

### Task 4: Tests bijwerken

**Files:** Modify `src/tests.js` (import regel 9, blok regels ~315-334)

- [ ] **Step 1: Pas de import (regel 9) aan** — `offerteBriefingTekst` → `offerteBalBijTekst`.

- [ ] **Step 2: Vervang het briefing-testblok (regels ~315-334) door:**

```javascript
  // ── offerte-briefing: balBij → NL-tekst ──
  eq('balBijTekst aannemer', offerteBalBijTekst('aannemer'), 'bal bij de aannemer');
  eq('balBijTekst ons',      offerteBalBijTekst('ons'),      'bal bij ons');
  eq('balBijTekst vve',      offerteBalBijTekst('vve'),      'bal bij de eigenaren');
  // ── offerte-briefing: DOM-rooktest (C2-markup, geen emoji) ──
  truthy('off-briefing-slot bestaat', !!document.getElementById('off-briefing-slot'));
  truthy('briefing rendert C2-cijfer-strip zonder emoji', (()=>{
    try{
      const vorige=state.activeNtd;
      setNtd('OFFERTE-TRAJECTEN');
      const html=document.getElementById('off-briefing-slot').innerHTML;
      setNtd(vorige);
      return html.includes('ob-strip')&&html.includes('Nu opvolgen')&&!html.includes('✦')&&!html.includes('🔔')&&!html.includes('🎉');
    }catch(e){ console.error('briefing-markup-test:',e); return false; }
  })());
```

- [ ] **Step 3: Draai de tests** (zie Task 6) en bevestig dat alles groen is. Commit:

```bash
git add src/tests.js && git commit -m "test(offerte): briefing-tests naar C2-markup + balBijTekst"
```

---

### Task 5: Service worker cache ophogen

**Files:** Modify `sw.js`

- [ ] **Step 1: Hoog de cacheversie op** (zoek `cd-vNN` of `const CACHE`/versie-constante; +1).

- [ ] **Step 2: Commit**

```bash
git add sw.js && git commit -m "chore: sw-cache bump voor offerte-herontwerp"
```

---

### Task 6: Verifiëren + naar staging

- [ ] **Step 1: Start lokale no-cache server** en open `index.html?test=1`; lees `window._testResult`. Verwacht: `... OK, 0 FAIL` (≥179 OK).
- [ ] **Step 2: Visuele check** van de offerte-tab in **licht én donker**: C2-briefing bovenaan, rustige groepkoppen, verfijnde fase-balk met label, teal-outline actieknop, geen emoji/paarse tint-kaders. VvE-codes + offProg blijven section-paars (correct).
- [ ] **Step 3: Push naar `staging`** en geef de beheerder de test-URL ter review.

```bash
git push origin staging
```

---

## Self-review

- **Spec-dekking:** briefing C2 (T1+T2), altijd zichtbaar (T2+T3), rust-staat (T2), groepkoppen (T2), fase-balk (T1+T2), status-tekst (ongewijzigd), contextuele actie (T1), geen-emoji lege staat (T2), paars-nuance (codes/offProg ongemoeid — niet in scope), tests (T4), sw (T5). Alles gedekt.
- **Placeholders:** geen.
- **Type-consistentie:** `offerteBalBijTekst` gedefinieerd (T2.1), gebruikt in `renderOfferteBriefing` (T2.2) en getest (T4.2), geëxporteerd (T2.6). `faseBalk` blijft dezelfde signatuur. `offerteBriefingTekst` overal verwijderd (render + import + export + tests).
