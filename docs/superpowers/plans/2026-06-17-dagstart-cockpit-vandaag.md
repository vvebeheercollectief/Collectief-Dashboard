# Dagstart-cockpit "Vandaag" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een persoonlijk dagstart-scherm ("Vandaag") bovenaan de bestaande Dashboard-pagina, met een testbare urgentie-motor die per taak één score + reden berekent.

**Architecture:** Twee nieuwe ES-modules — `src/urgentie.js` (pure, unit-getest) en `src/render-vandaag.js` (DOM). De cockpit wordt in `#page-dash` boven de bestaande totalen gerenderd; aangeroepen vanuit `goTo('dash')`, `applyTheme` en de `loadAll`-resync, net als `buildDash`.

**Tech Stack:** Vanilla ES-modules (geen build-stap), Google Sheets-backend (ongewijzigd), zelftest via `?test=1` → `window._testResult`. Staging = `staging`-branch → Vercel preview-URL die op de TEST-Sheet draait.

**Ontwerp:** `docs/superpowers/specs/2026-06-17-dagstart-cockpit-vandaag-design.md`

---

## File Structure

- **Create `src/urgentie.js`** — pure motor: `urgentieScore`, `dagenStil`, `isVanMij`, `letOpSignalen`. Hergebruikt helpers uit `util.js`. Geen DOM.
- **Create `src/render-vandaag.js`** — `renderVandaag()`: vult `#dash-vandaag` met begroeting, let-op-strook, doe-dit-eerst-top-3, mijn-lijst, Mijn/Iedereen-toggle.
- **Modify `index.html`** — `#dash-vandaag`-container bovenaan `#page-dash`; nav-label "Dashboard" → "Vandaag".
- **Modify `src/config.js`** — `PAGE_META.dash` titel/subtitel.
- **Modify `src/ui.js`** — `goTo('dash')` en `applyTheme` roepen ook `renderVandaag()` aan.
- **Modify `src/data.js`** — `loadAll`-resync rendert ook de cockpit als de dash-pagina actief is.
- **Modify `styles.css`** — cockpit-stijlen met bestaande CSS-vars (`--sur`, `--sur2`, `--mut`, `--ac`, `--rd`, `--am`, `--pu`, `--bl`).
- **Modify `src/tests.js`** — unit-tests voor `urgentieScore` / `dagenStil` / `isVanMij`.
- **Modify `sw.js`** — nieuwe modules in `APP_SHELL` + `CACHE_VERSION` → `cd-v28`.

---

### Task 1: Urgentie-motor — `urgentieScore`, `dagenStil`, `isVanMij`

**Files:**
- Create: `src/urgentie.js`
- Test: `src/tests.js` (import + assert-blok)

- [ ] **Step 1: Schrijf de falende tests** — voeg aan de import-regel boven in `src/tests.js` toe: `import { urgentieScore, dagenStil, isVanMij } from "./urgentie.js";` en plak dit blok ná het bestaande auto-prioriteit-blok (T = 2 jun 2026, `plus(n)` bestaan al):

```js
  // ── Urgentie-motor (Dagstart-cockpit) ──
  const uOpp = (d, extra={}) => ({ deadline: d, ...extra });
  // te laat domineert
  truthy('urg: OPPAKKEN 3d te laat → label vandaag', urgentieScore(uOpp(plus(-3)), 'OPPAKKEN', {vandaag:T}).label === 'vandaag');
  truthy('urg: OPPAKKEN 3d te laat → score >= 80', urgentieScore(uOpp(plus(-3)), 'OPPAKKEN', {vandaag:T}).score >= 80);
  // ver weg = later
  eq('urg: OPPAKKEN +30d → label later', urgentieScore(uOpp(plus(30)), 'OPPAKKEN', {vandaag:T}).label, 'later');
  // LOD-gewicht telt mee bij korte termijn
  eq('urg: LOD +2d → label deze-week', urgentieScore(uOpp(plus(2)), 'LOD', {vandaag:T}).label, 'deze-week');
  // opvolgen-vandaag geeft vaste bump + reden
  const uOv = urgentieScore({deadline:'', opvolgdatum:plus(0)}, 'OPPAKKEN', {vandaag:T});
  eq('urg: opvolgen vandaag → score 15', uOv.score, 15);
  eq('urg: opvolgen vandaag → reden', uOv.reden, 'opvolgafspraak voor vandaag');
  // dagen-stil uit logboek
  const stilTaak = {code:'X1', inBehandeling:'TRUE', deadline:''};
  const stilLog = [{code:'X1', sectie:'OPPAKKEN', timestamp:'2026-05-23T09:00:00'}];
  eq('stil: 10 dagen sinds laatste log', dagenStil(stilTaak, 'OPPAKKEN', stilLog, T), 10);
  eq('urg: 10d stil → score 16', urgentieScore(stilTaak, 'OPPAKKEN', {vandaag:T, logboek:stilLog}).score, 16);
  // niet-in-behandeling telt niet als stil
  eq('stil: niet in behandeling → null', dagenStil({code:'X1', inBehandeling:''}, 'OPPAKKEN', stilLog, T), null);
  // isVanMij
  truthy('mij: behandelaar "Jer, Cihad" matcht Jer', isVanMij({behandelaar:'Jer, Cihad'}, 'Jer'));
  truthy('mij: behandelaar matcht niet Gabos', !isVanMij({behandelaar:'Jer, Cihad'}, 'Gabos'));
  truthy('mij: lege behandelaar → false', !isVanMij({behandelaar:''}, 'Jer'));
```

- [ ] **Step 2: Run de tests — verwacht FAIL.** Serveer de repo en open `index.html?test=1` (zie Task 9 voor de preview-aanpak); verwacht een module-load-fout (`urgentie.js` bestaat niet) of FAILs.

- [ ] **Step 3: Schrijf `src/urgentie.js`:**

```js
// ══════════════════════════════════════
//  URGENTIE — pure motor voor de Dagstart-cockpit (zie spec 2026-06-17)
// ══════════════════════════════════════
// Bundelt deadline + dagen-stil + opvolgen-vandaag + LOD-gewicht tot één score (0–100)
// met de zwaarst wegende reden. Gewichten zijn richtinggevend (afgestemd via deze tests).
import {
  PRIO_REGELS, STIL_ESCALATIE_REGELS, berekenPrioriteit, opvolgStatus,
  _vandaagAmsterdam, _verschilInKalenderdagen,
} from './util.js';

const STIL_DREMPEL = 4;

// Dagen sinds de laatste logboek-activiteit van deze taak (code + sectie).
// Spiegelt bepaalStil() in render-lijsten.js: alleen taken IN BEHANDELING, niet weggelegd.
// Geeft null als er geen activiteit-data is. Geen drempel hier — die past urgentieScore toe.
export function dagenStil(taak, sec, logboek, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  if (!taak) return null;
  if (opvolgStatus(taak, vandaag).weggelegd) return null;
  if (taak.inBehandeling !== 'TRUE') return null;
  const entries = (logboek || []).filter(e => e.code === taak.code && (!sec || e.sectie === sec));
  if (!entries.length) return null;
  let laatst = null;
  entries.forEach(e => {
    const t = e.timestamp ? new Date(e.timestamp) : null;
    if (t && !isNaN(t) && (!laatst || t > laatst)) laatst = t;
  });
  if (!laatst) return null;
  return _verschilInKalenderdagen(vandaag, laatst); // positief = dagen geleden
}

// Eén urgentie-score + reden + label voor een taak.
export function urgentieScore(taak, sec, opts){
  opts = opts || {};
  const vandaag = opts.vandaag || _vandaagAmsterdam();
  const logboek = opts.logboek || [];
  const { dagenTot, teLaat } = berekenPrioriteit(taak && taak.deadline, sec, vandaag);
  const reg = PRIO_REGELS[sec] || { hoog: 7, midden: 14 };

  let dPts = 0, dTxt = '';
  const dStr = n => `${n} ${n === 1 ? 'dag' : 'dagen'}`;
  if (dagenTot === null) { dPts = 0; }
  else if (teLaat) { dPts = Math.min(90, 65 + Math.abs(dagenTot) * 5); dTxt = `deadline ${dStr(Math.abs(dagenTot))} te laat`; }
  else if (dagenTot <= reg.hoog) {
    dPts = Math.round(20 + (1 - dagenTot / reg.hoog) * 30);
    dTxt = sec === 'LOD' ? `officiële LOD-termijn — nog ${dStr(dagenTot)}` : `deadline over ${dStr(dagenTot)}`;
  }
  else if (dagenTot <= reg.midden) { dPts = 12; dTxt = `deadline over ${dStr(dagenTot)}`; }
  else { dPts = 4; dTxt = 'deadline nog ver weg'; }

  const stilReg = STIL_ESCALATIE_REGELS[sec] || { trap1: 7, trap2: 14 };
  const dS = dagenStil(taak, sec, logboek, vandaag);
  let sPts = 0;
  if (dS !== null && dS >= STIL_DREMPEL) {
    if (dS < stilReg.trap1) sPts = Math.round((dS - STIL_DREMPEL) / Math.max(1, stilReg.trap1 - STIL_DREMPEL) * 10);
    else if (dS < stilReg.trap2) sPts = 12 + Math.round((dS - stilReg.trap1) / Math.max(1, stilReg.trap2 - stilReg.trap1) * 10);
    else sPts = 25;
  }
  const sTxt = (dS !== null && dS >= STIL_DREMPEL) ? `${dS} dagen geen activiteit` : '';

  const oPts = opvolgStatus(taak, vandaag).vandaag ? 15 : 0;
  const lPts = sec === 'LOD' ? 20 : 0;

  const score = Math.min(100, dPts + sPts + oPts + lPts);
  const termen = [
    { pts: dPts, txt: dTxt },
    { pts: sPts, txt: sTxt },
    { pts: oPts, txt: 'opvolgafspraak voor vandaag' },
    { pts: lPts, txt: 'officiële LOD-termijn weegt extra' },
  ];
  let top = termen[0];
  termen.forEach(t => { if (t.pts > top.pts) top = t; });
  const reden = (top.pts > 0 && top.txt) ? top.txt : 'geen urgentie';
  const label = score >= 70 ? 'vandaag' : score >= 40 ? 'deze-week' : 'later';
  return { score, reden, label };
}

// Hoort deze taak bij <naam>? behandelaar kan meerdere namen bevatten (',' of '/').
export function isVanMij(taak, naam){
  if (!naam) return false;
  const b = ((taak && taak.behandelaar) || '') + '';
  return b.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean).includes(naam.toLowerCase());
}
```

- [ ] **Step 4: Run de tests — verwacht PASS** (alle nieuwe asserts groen, totaal `… OK, 0 FAIL`).

- [ ] **Step 5: Commit**

```bash
git add src/urgentie.js src/tests.js
git commit -m "feat(vandaag): urgentie-motor (score/reden/label) + tests"
```

---

### Task 2: Kantoorbrede let-op-signalen

**Files:**
- Modify: `src/urgentie.js`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test** — voeg toe aan de import: `letOpSignalen`; en het assert-blok:

```js
  // ── let-op-signalen (kantoorbreed) ──
  const Dlos = {
    'OPPAKKEN':[], 'VERGADERVERZOEKEN':[],
    'OFFERTE-TRAJECTEN':[{code:'A', offertes:'1/1', fase:'bij_vve', deadline:''}],
    'LOD':[{code:'L1', naam:'De Linden', deadline:plus(2)}],
  };
  const sig = letOpSignalen(Dlos, {vandaag:T, logboek:[]});
  truthy('let-op: levert minstens 1 LOD-signaal', sig.some(s => /LOD/i.test(s.tekst)));
  truthy('let-op: elk signaal heeft soort+tekst', sig.every(s => s.soort && s.tekst));
```

- [ ] **Step 2: Run — verwacht FAIL** (`letOpSignalen is not a function`).

- [ ] **Step 3: Implementeer** — voeg onderaan `src/urgentie.js` toe (importeer ook `offerteBriefingFeiten` in de bestaande import van util.js):

```js
// Kantoorbrede signalen voor de let-op-strook. D = de geparste secties (state.D).
// Elk signaal: { soort:'danger'|'warning'|'info', icon, tekst }.
export function letOpSignalen(D, opts){
  opts = opts || {};
  const vandaag = opts.vandaag || _vandaagAmsterdam();
  const logboek = opts.logboek || [];
  const out = [];
  const lod = (D && D['LOD']) || [];
  const lodNabij = lod
    .map(r => ({ r, p: berekenPrioriteit(r.deadline, 'LOD', vandaag) }))
    .filter(x => x.p.dagenTot !== null && x.p.dagenTot <= 7);
  if (lodNabij.length) {
    lodNabij.sort((a, b) => a.p.dagenTot - b.p.dagenTot);
    const e = lodNabij[0];
    out.push({ soort:'danger', icon:'alert', tekst:
      `LOD ${e.r.naam || e.r.code} ${e.p.teLaat ? 'is over de termijn' : `verloopt over ${e.p.dagenTot} ${e.p.dagenTot===1?'dag':'dagen'}`}` });
  }
  const SECS_ALL = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  let langStil = 0;
  SECS_ALL.forEach(sec => ((D && D[sec]) || []).forEach(r => {
    const reg = STIL_ESCALATIE_REGELS[sec];
    const dS = dagenStil(r, sec, logboek, vandaag);
    if (dS !== null && reg && dS >= reg.trap2) langStil++;
  }));
  if (langStil) out.push({ soort:'warning', icon:'clock', tekst:
    `${langStil} ${langStil===1?'taak ligt':'taken liggen'} lang stil` });
  const offFeiten = offerteBriefingFeiten((D && D['OFFERTE-TRAJECTEN']) || [], vandaag);
  if (offFeiten.klaarTeGunnen) out.push({ soort:'info', icon:'file', tekst:
    `${offFeiten.klaarTeGunnen} ${offFeiten.klaarTeGunnen===1?'offerte wacht':'offertes wachten'} op gunning` });
  return out;
}
```

- [ ] **Step 4: Run — verwacht PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/urgentie.js src/tests.js
git commit -m "feat(vandaag): kantoorbrede let-op-signalen + test"
```

---

### Task 3: Cockpit-rendering `renderVandaag()`

**Files:**
- Create: `src/render-vandaag.js`

- [ ] **Step 1: Implementeer `src/render-vandaag.js`** (geen unit-test — DOM; geverifieerd via no-regressie + staging):

```js
// ══════════════════════════════════════
//  RENDER-VANDAAG — Dagstart-cockpit (zie spec 2026-06-17)
// ══════════════════════════════════════
import { D, state } from './state.js';
import { SKEYS } from './config.js';
import { displayName, esc } from './util.js';
import { urgentieScore, isVanMij, letOpSignalen } from './urgentie.js';

let _scope = 'mijn'; // 'mijn' | 'iedereen'

const SOORT_CLS = { danger:'lo-danger', warning:'lo-warning', info:'lo-info' };
const LABEL_CLS = { 'vandaag':'u-vandaag', 'deze-week':'u-week', 'later':'u-later' };

function alleTaken(){
  return SKEYS.flatMap(sec => (D[sec] || []).map(r => ({ r, sec })));
}

function rowHtml(item){
  const { r, sec, u } = item;
  return `<div class="vd-row ${LABEL_CLS[u.label]||''}" data-action="vve-open" data-code="${esc(r.code)}" title="Open VvE-dossier">
    <span class="vd-bar"></span>
    <div class="vd-body">
      <div class="vd-top"><span class="vd-actie">${esc(r.actiepunt || r.periode || r.agendapunten || '—')}</span><span class="vd-reden">${esc(u.reden)}</span></div>
      <div class="vd-meta">${esc(r.code)}${r.naam?` · ${esc(r.naam)}`:''}</div>
    </div>
  </div>`;
}

export function renderVandaag(){
  const host = document.getElementById('dash-vandaag');
  if (!host) return;
  const naam = displayName(state.currentUserEmail || '') || '';
  const opts = { logboek: D.logboek || [] };

  let items = alleTaken().map(it => ({ ...it, u: urgentieScore(it.r, it.sec, opts) }));
  if (_scope === 'mijn' && naam) items = items.filter(it => isVanMij(it.r, naam));
  items.sort((a, b) => b.u.score - a.u.score);

  const top = items.slice(0, 3);
  const rest = items.slice(3);
  const sig = letOpSignalen(D, opts);

  const uur = new Date().getHours();
  const groet = uur < 6 ? 'Goedenacht' : uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
  const datum = new Date().toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });
  const wieTxt = _scope === 'mijn' ? (naam ? `${items.length} ${items.length===1?'taak':'taken'} voor jou` : 'log in voor je eigen lijst') : `${items.length} ${items.length===1?'taak':'taken'} kantoorbreed`;

  const sigHtml = sig.map(s => `<span class="vd-lo ${SOORT_CLS[s.soort]||''}">${esc(s.tekst)}</span>`).join('');
  const topHtml = top.length ? top.map(rowHtml).join('') : `<div class="vd-leeg">Niks dringends — mooi!</div>`;
  const restHtml = rest.length ? `<div class="vd-sub">Verder vandaag</div>${rest.map(rowHtml).join('')}` : '';

  host.innerHTML = `
    <div class="vd-head">
      <div><div class="vd-groet">${esc(groet)}${naam?`, ${esc(naam)}`:''}</div><div class="vd-datum">${esc(datum)} · ${esc(wieTxt)}</div></div>
      <div class="vd-toggle" id="vd-toggle">
        <span class="${_scope==='mijn'?'on':''}" data-scope="mijn">Mijn</span><span class="${_scope==='iedereen'?'on':''}" data-scope="iedereen">Iedereen</span>
      </div>
    </div>
    ${sigHtml ? `<div class="vd-lo-strip">${sigHtml}</div>` : ''}
    <div class="vd-eerst-lbl">Doe dit eerst</div>
    <div class="vd-lijst">${topHtml}</div>
    ${restHtml ? `<div class="vd-lijst vd-rest">${restHtml}</div>` : ''}`;

  const tog = document.getElementById('vd-toggle');
  if (tog) tog.addEventListener('click', e => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    _scope = b.dataset.scope; renderVandaag();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/render-vandaag.js
git commit -m "feat(vandaag): cockpit-rendering renderVandaag()"
```

---

### Task 4: Inhaken in de pagina (markup + routing)

**Files:**
- Modify: `index.html` (rond regel 426 + nav regel 77-80)
- Modify: `src/config.js` (PAGE_META.dash)
- Modify: `src/ui.js` (goTo + applyTheme)
- Modify: `src/data.js` (loadAll-resync)

- [ ] **Step 1: `index.html`** — voeg de cockpit-container toe als eerste kind van `#page-dash` (vóór `<div class="stat-strip" id="dash-stats">`):

```html
    <div class="page" id="page-dash">
      <div id="dash-vandaag"></div>
      <div class="kantoor-lbl">Kantooroverzicht</div>
      <div class="stat-strip" id="dash-stats"></div>
```

- [ ] **Step 2: `index.html`** — nav-label "Dashboard" → "Vandaag" (regel ~79, de tekst ná de svg binnen `data-page="dash"`): vervang `      Dashboard` door `      Vandaag`.

- [ ] **Step 3: `src/config.js`** — wijzig `PAGE_META.dash`:

```js
  dash:['Vandaag','Jouw dagstart en kantooroverzicht'],
```

- [ ] **Step 4: `src/ui.js`** — importeer `renderVandaag` en roep hem aan waar `buildDash()` staat. Bovenaan toevoegen: `import { renderVandaag } from "./render-vandaag.js";`. Wijzig regel `if(page==='dash') buildDash();` naar:

```js
  if(page==='dash'){ renderVandaag(); buildDash(); }
```

En in `applyTheme`, wijzig de dash-regel naar:

```js
  if(document.getElementById('page-dash').classList.contains('active')){ renderVandaag(); buildDash(); }
```

- [ ] **Step 5: `src/data.js`** — importeer `renderVandaag` (`import { renderVandaag } from "./render-vandaag.js";`) en zet hem naast de bestaande dash-resync in `loadAll`:

```js
      if(document.getElementById('page-dash')?.classList.contains('active')){ renderVandaag(); buildDash(); }
```

- [ ] **Step 6: Commit**

```bash
git add index.html src/config.js src/ui.js src/data.js
git commit -m "feat(vandaag): cockpit inhaken op Dashboard-pagina + routing"
```

---

### Task 5: Stijlen

**Files:**
- Modify: `styles.css` (toevoegen aan het eind)

- [ ] **Step 1: Voeg cockpit-stijlen toe** (bestaande vars; werkt in licht/donker). Pas kleuren aan als de vars-namen in `styles.css` afwijken — controleer de `:root`-blokken:

```css
/* ── Dagstart-cockpit (Vandaag) ── */
#dash-vandaag{margin-bottom:22px}
.vd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px}
.vd-groet{font-size:20px;font-weight:600;color:var(--txt)}
.vd-datum{font-size:13px;color:var(--mut);margin-top:2px;text-transform:capitalize}
.vd-toggle{display:inline-flex;border:1px solid var(--bd);border-radius:8px;overflow:hidden;font-size:12px}
.vd-toggle span{padding:6px 12px;cursor:pointer;color:var(--mut)}
.vd-toggle span.on{background:var(--ac);color:#fff}
.vd-lo-strip{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.vd-lo{display:inline-flex;align-items:center;font-size:12px;padding:5px 10px;border-radius:8px}
.lo-danger{background:var(--rd-l);color:var(--rd)}
.lo-warning{background:var(--am-l);color:var(--am)}
.lo-info{background:var(--bl-l);color:var(--bl)}
.vd-eerst-lbl,.vd-sub{font-size:11.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin:0 0 8px}
.vd-sub{margin-top:14px}
.vd-lijst{display:flex;flex-direction:column;gap:8px}
.vd-rest{margin-top:14px}
.vd-row{display:flex;background:var(--sur);border:1px solid var(--bd);border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .12s}
.vd-row:hover{border-color:var(--ac)}
.vd-bar{width:4px;flex-shrink:0;background:var(--bl)}
.vd-row.u-vandaag .vd-bar{background:var(--rd)}
.vd-row.u-week .vd-bar{background:var(--am)}
.vd-body{padding:9px 12px;flex:1;min-width:0}
.vd-top{display:flex;justify-content:space-between;gap:10px}
.vd-actie{font-size:13.5px;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vd-reden{font-size:11.5px;color:var(--mut);white-space:nowrap;flex-shrink:0}
.vd-meta{font-size:11.5px;color:var(--mut);margin-top:3px}
.vd-leeg{padding:14px;text-align:center;color:var(--mut);font-size:13px;background:var(--sur);border:1px solid var(--bd);border-radius:8px}
.kantoor-lbl{font-size:11.5px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);margin:0 0 12px;padding-top:14px;border-top:1px solid var(--bd)}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat(vandaag): cockpit-stijlen"
```

---

### Task 6: Service-worker — modules cachen + versie ophogen

**Files:**
- Modify: `sw.js`

- [ ] **Step 1:** Verhoog `const CACHE_VERSION = 'cd-v27';` → `'cd-v28';`.
- [ ] **Step 2:** Voeg in `APP_SHELL` toe (bij de andere `./src/...`-regels):

```js
  './src/urgentie.js',
  './src/render-vandaag.js',
```

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore(sw): cache cd-v28 + nieuwe vandaag-modules"
```

---

### Task 7: Volledige zelftest groen

- [ ] **Step 1:** Draai de volledige `?test=1`-suite (Task 9-aanpak). Verwacht: nieuwe urgentie-asserts groen én géén regressie — `… OK, 0 FAIL` (totaal ≥ vorige aantal, was ~237+).
- [ ] **Step 2:** Bij FAIL: lees de `console.error`-regel, fix de bron, herhaal. Niet doorgaan tot 0 FAIL.

---

### Task 8: Verifieer dat de hele app nog laadt

- [ ] **Step 1:** Open `index.html` zonder `?test=1` in de preview, check de console op module-/import-fouten (geen rode errors).
- [ ] **Step 2:** De login-gate hoort te verschijnen (geen data zonder login) — dat is correct; de cockpit-DOM-vulling test de beheerder live op staging.

---

### Task 9: Naar staging deployen

**Aanpak zelftest (preview):** serveer de repo-root met een statische server zonder cache en open `/index.html?test=1`; lees `window._testResult`. (Lokale conventie: no-cache python-server in `~/.claude`; of de Claude-preview-tools.)

- [ ] **Step 1:** Zorg dat alle commits op `feat/dagstart-cockpit` staan en de zelftest groen is.
- [ ] **Step 2:** Breng het werk op de `staging`-branch:

```bash
git checkout staging
git merge --no-ff feat/dagstart-cockpit -m "feat(vandaag): Dagstart-cockpit op staging voor test"
git push origin staging
```

- [ ] **Step 3:** Vercel maakt automatisch een preview-deploy van `staging`. De URL (`…-git-staging-…vercel.app`) staat NIET in `PROD_HOSTS` → draait op de TEST-Sheet. Geef die URL aan de beheerder om live te testen.
- [ ] **Step 4:** Productie (`main` → GitHub Pages) blijft ongewijzigd. Pas na akkoord van de beheerder integreren we richting `main` (niet kaal mergen — zie [[feedback_staging_main_merge]]).

---

## Self-Review

**Spec-dekking:** urgentie-motor (Task 1-2), persoonlijke lijst + Mijn/Iedereen + Niet-toegewezen via scope (Task 3), let-op-strook (Task 2-3), cockpit boven totalen (Task 4-5), geen backend-werk (geen apps-script-wijziging), SW-cache (Task 6), tests (Task 1-2,7), staging-deploy (Task 9). Lege staat + geen-login-degradatie zitten in Task 3. ✔

**Placeholder-scan:** geen TBD/TODO; alle code volledig uitgeschreven. ✔

**Type-consistentie:** `urgentieScore(taak, sec, {vandaag, logboek})`, `dagenStil(taak, sec, logboek, vandaag)`, `isVanMij(taak, naam)`, `letOpSignalen(D, {vandaag, logboek})`, `renderVandaag()` — overal gelijk gebruikt. Signalen-vorm `{soort, icon, tekst}` consistent tussen Task 2 en de `SOORT_CLS`-map in Task 3. ✔

**Kanttekening:** "Niet-toegewezen" wordt in v1 gedekt door de Iedereen-scope (toont álles, incl. taken zonder behandelaar). Een aparte gelabelde bak kan later; valt binnen YAGNI van de spec.
```
