# Fase 2 — Modularisatie + centraal klik-systeem · Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De ene `index.html` (~4.100 r.) opsplitsen in native ES-modules (`src/*.js` + `styles.css`), alle 35 inline klik-handlers vervangen door één centraal `data-action`-systeem, en de bestaande script-CSP dichttimmeren — gedrag en uiterlijk identiek, alles eerst op `staging`.

**Architecture:** `index.html` houdt alleen `<head>`, HTML-markup en één `<script type="module" src="src/main.js">` over. De ±115 functies verhuizen naar focus-modules. Gedeelde toestand woont in `state.js`; één delegatie-listener in `actions.js` koppelt `data-action`-labels aan functies. Geen bundler/Node — de browser laadt de modules zelf, dus `git push` → live blijft ongewijzigd.

**Tech Stack:** Vanilla JS (ES-modules), HTML, CSS. Verificatie via de bestaande `?test=1`-zelftest + de preview-tools (geen testframework). Backend (Google Sheets/Apps Script) ongewijzigd.

---

## Achtergrond & spec

Ontwerp: [`docs/superpowers/specs/2026-06-10-fase2-modularisatie-design.md`](../specs/2026-06-10-fase2-modularisatie-design.md). Lees dat eerst. Kernkeuzes (met gebruiker): **native ES-modules, géén bundler**; ambitie = **opsplitsen + centraal klik-systeem + slot op scripts** (stijl-CSP blijft bewust soepel).

**Werk uitsluitend op branch `staging`.** Productie (`main` → GitHub Pages) blijft ongemoeid tot de eindmerge. De test-link is `collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app` (serveert `staging`). De apps-script-CI is path-gefilterd op `apps-script/**` en wordt door dit frontend-werk niet getriggerd.

## Toestands-strategie (de sleutel tot laag risico)

ES-modules delen geen globale ruimte, dus gedeelde toestand verhuist naar `src/state.js`. Twee soorten:

1. **Objecten die nooit hervonden/hertoegekend worden, alleen ín-plaats aangepast** (`D.ntd=…`, `pgs.ntd=1`, `charts[id]=…`): geverifieerd geen `D = …` / `pgs = …` / `charts = …` behalve de declaratie. Deze exporteren we **direct** en importeren we as-is — **geen enkele referentie hoeft te wijzigen**:
   ```js
   // state.js
   export const D = {ntd:{},af:{},alvo:[],alfa:[],ontw:[],logboek:[],ntdSecInfo:{},afSecInfo:{}};
   export const pgs = {ntd:1,af:1,alvo:1,alfa:1,ontw:1,logboek:1};
   export const charts = {};
   export const shownToasts = new Set();   // (heet nu _shownToasts; in-plaats gemuteerd)
   ```
   In een consument: `import {D, pgs, charts} from './state.js';` — `D.ntd = …` blijft werken (live referentie naar hetzelfde object).

2. **Losse waarden die WÉL hertoegekend worden** (`oauthToken = …`, `activeNtd = …`, `pendingWrites++`): die kun je niet vanuit een andere module hertoekennen via een import (imports zijn alleen-lezen). Daarom op één `state`-object, en de referenties worden `state.x`:
   ```js
   // state.js
   export const state = {
     oauthToken:null, oauthExpiry:0, currentUserEmail:null, _gsiTokenClient:null,
     activeNtd:'OPPAKKEN', activeAf:'OPPAKKEN', activeOntw:'Alles',
     editMode:false, editRowData:null, editSec:null,
     anaPeriod:'maand', anaMetric:'vergader', activeHeroView:'alv',
     pendingWrites:0, _writeChain:Promise.resolve(),
     _rowCache:[], _undoStack:[], _lastDHash:null, _loadInFlight:false, _loadAgain:false,
     _sheetIds:null, _completeIdx:null, _aiLastCode:'', _aiLastNaam:'',
     ontwEditMode:false, ontwEditRow:null,
     oneSignalReady:false, isSubscribed:false, _lastNotifTs:new Date().toISOString(),
     _notifPollTimer:null, logWho:'', logAct:'',
   };
   ```
   `clientId` is een vaste string → die hoort bij **`config.js`**, niet `state`.

   **Per variabele bevestigen** met `grep -nE '(^|[^.])\bNAAM\s*=' index.html | grep -v '=='`: vind je alleen de declaratie, dan mág hij in groep 1 (direct export). Vind je échte hertoekenningen, dan groep 2 (`state.x`). Bij twijfel → groep 2 (altijd veilig).

## Doelstructuur (`src/`)

```
index.html            ← <head> (incl. CSP + externe scripts + <link styles.css>), HTML-markup, <script type="module" src="src/main.js">
styles.css            ← de ±450 regels uit het huidige <style>-blok
src/
  config.js           ← constanten + iconen + kleuren (PROD_HOSTS, SID_*/ONESIGNAL_*, ALLOWED_EMAILS, EMAIL_NAMES, clientId, SECS, SKEYS, PAGE_META, PG, PRIO_REGELS, STIL_DREMPEL_DAGEN, ONTW_CATS/_COLORS, SEC_ICONS/_THEMES, ALVO_ICONS/_COLS/_LABELS, DASH_ICONS, HERO_VIEWS/_BUCKETS, PERIODS, MAAND_KORT, PERIODE_LABEL_*, AI_WANT_TEKST, AI_KOPPEN, _MAANDEN, _LOG_AVKLEUR, DENSITIES, SPARK_BUCKETS)
  state.js            ← gedeelde toestand (zie boven)
  util.js             ← pure helpers (esc, displayName, _parseAnyDate, parseDt, toISODate, toDutchDate, _vandaagAmsterdam, _verschilInKalenderdagen, berekenPrioriteit, _splitBeh, _lightenHex, getWeekNum, _toDateObj, emptyRow, filt, filterNtd, statusIco, flagPill, subBadge, prioBadge, persBadges, ibBadge, _inPeriod, _weekIndex, bucketKey/Label, lastBucketKeys)
  api.js              ← Sheets-laag (fetchSheet, writeRange, appendRange, getSheetIds, _isTransient, _withRetry, _shiftNtdRows, getInsertRow, getAfInsertRow, insertAndWriteRow, deleteTaskRow)
  data.js             ← laden/parsen/achtergrond-schrijven (loadAll, parseSections, parseAlvo, parseAlfa, parseOntw, parseLogboek, backgroundWrite, setSyncing/setSynced/setSyncErr/dot, _lastDHash-gebruik)
  auth.js             ← login/OAuth (doOAuth, fetchUserEmail, doLogin, ensureToken)
  ui.js               ← schil (goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch)
  render-taken.js     ← Nog-te-doen + Afgerond (renderNtd, setNtd, renderAf, setAf, filterNtd→(of util), renderNtdStats, renderNtdDonut, buildDash, renderThead, renderTbody, deadlineCel, bepaalStil, rowNtd, rowAf, renderPag)
  render-alv.js       ← ALV's (renderAlvo, _recomputeAlvoStatus, toggleAlvoFlag, renderHeroDonut)
  render-analytics.js ← grafieken/KPI's (buildAnalytics, renderAll-deel?, seriesByPeriod, seriesPerPersonByPeriod, computeTrend, renderSparkline, renderKpiTile, renderKpiPersonTile, renderHeroChart, renderLeaderboard, renderPeriodBar, renderMetricToggle, buildPeriodBtns, buildBarChart, buildDonut, getWeekNum→util, _try)
  render-overig.js    ← Alfabetisch + Ontwikkeling + Logboek (renderAlfa, parseOntw→data?, renderOntw, setOntw, openOntwModal, closeOntwModal, submitOntwItem, deleteOntwItem, editOntwItem, renderLogboek, fmtLogTs, actieBadge, avatarKleur, logDayLabel, logZin, logTijd, histNoteKey, renderTaskHistory, addTaskNote)
  crud.js             ← taak-modals & -acties (openModal, editRow, closeModal, fillModalFields, setv, clearModal, onCodeInput, selectVvE, deleteTask, deleteCurrentEditTask, completeTask, doCompleteTask, closeCompleteModal, submitTask, gv, adjOff, offProg, prefillNieuweTaak, logEvent, fireNotifEvent)
  ai.js               ← AI-hulp (openAiHelp, closeAiHelp, aiSelectedWants, aiVveContext, buildAiPrompt, copyAiPrompt, aiParseSections, parseAiAnswer, aiOvernemen, aiActieTaak, aiKopieerConcept)
  notifications.js    ← toasts + push (showToast, dismissToast, showUndoToast, undoComplete, getNotifPrefs, pollNotifsForToast, startNotifPoll, openNotifModal, closeNotifModal, refreshNotifUI, onWhoChange, getCurrentWho, saveNotifPrefs, waitForOneSignal, subscribeNotifs, unsubscribeNotifs, sendTestNotif)
  renderAll.js (of in main) ← renderAll() roept de losse render-modules aan (kruispunt; mag in main.js)
  actions.js          ← (mijlpaal B) data-action-registry + delegatie-listener
  main.js             ← opstart: imports, DOMContentLoaded-blok, vaste listeners, intervallen, sessieherstel, goTo('ntd'); bevat renderAll()
  tests.js            ← de ?test=1-zelftest (importeert te testen functies)
```

> Exacte functie→bestand-indeling mag tijdens uitvoer licht schuiven; leidend is "één bestand, één verantwoordelijkheid" en dat `renderAll()` alle render-modules kan aanroepen. `renderAll()` mag in `main.js` blijven om kringverwijzingen te beperken. **Kringverwijzingen tussen UI-modules zijn toegestaan**: ESM-imports zijn live bindings, dus `render-taken.js` mag `openModal` uit `crud.js` importeren terwijl `crud.js` `renderNtd` uit `render-taken.js` importeert — dat werkt omdat de aanroepen pas op runtime gebeuren, niet bij het laden.

## Tijdelijke `window`-shim (alleen mijlpaal A)

Zodra `index.html` een module laadt, zijn top-level functies niet meer globaal → de 35 inline-handlers breken. In mijlpaal A houden we ze werkend door de gerefereerde namen tijdelijk op `window` te zetten (onderaan `main.js`). In mijlpaal B verdwijnt deze shim. De paginering (`onclick="(${cb})(${p})"`) bakt een callback als tekst in die op runtime in **globale** scope draait en `pgs`+render-functies aanroept; daarom staan die er óók bij.

```js
// TIJDELIJK — verwijderd in mijlpaal B. Houdt de inline-handlers werkend.
Object.assign(window, {
  // functies gerefereerd door inline on*-handlers:
  adjOff, histNoteKey, addTaskNote, deleteCurrentEditTask, saveNotifPrefs,
  copyAiPrompt, doLogin, setNtd, setAf, toggleAlvoFlag, editRow, completeTask,
  aiOvernemen, aiActieTaak, aiKopieerConcept, setOntw, editOntwItem, dismissToast,
  // nodig voor de paginerings-callback die in globale scope draait:
  pgs, renderNtd, renderAf, renderAlvo, renderAlfa, renderOntw, renderLogboek,
});
```

## `data-action`-omzettabel (mijlpaal B — de kern)

35 inline-handlers → labels. Volledige lijst (regelnummers verwijzen naar de huidige `index.html`):

| # | Regel | NU (inline) | STRAKS (attributen) | Registry-actie |
|---|------|-------------|---------------------|----------------|
| 1 | 917 | `onclick="this.classList.toggle('on')"` (`#tog-ib`) | `data-action="toggle"` | toggle el.classList |
| 2 | 934 | idem (`#tog-ib-v`) | `data-action="toggle"` | toggle |
| 3 | 984 | idem (`#tog-ib-l`) | `data-action="toggle"` | toggle |
| 4–7 | 951/953/958/960 | `onclick="adjOff('m-off-recv',-1)"` etc. | `data-action="off" data-off="m-off-recv" data-delta="-1"` | `adjOff(off,delta)` |
| 8 | 999 | `onclick="addTaskNote()"` | `data-action="notitie-toevoegen"` | `addTaskNote()` |
| 9 | 1006 | `onclick="deleteCurrentEditTask()"` | `data-action="taak-verwijder-modal"` | `deleteCurrentEditTask()` |
| 10–14 | 1058/1059/1060/1071/1072 | `onclick="this.classList.toggle('on');saveNotifPrefs()"` | `data-action="notif-toggle"` | toggle el + `saveNotifPrefs()` |
| 15 | 1129 | `onclick="copyAiPrompt('Claude')"` | `data-action="ai-kopieer" data-waar="Claude"` | `copyAiPrompt(waar)` |
| 16 | 1130 | `onclick="copyAiPrompt('Gemini')"` | `data-action="ai-kopieer" data-waar="Gemini"` | `copyAiPrompt(waar)` |
| 17 | 1147 | `onclick="doLogin()"` | `data-action="login"` | `doLogin()` |
| 18 | 1728 | `onclick="setNtd('${s}')"` | `data-action="ntd-sectie" data-sec="${s}"` | `setNtd(sec)` |
| 19 | 1779 | `onclick="setAf('${s}')"` | `data-action="af-sectie" data-sec="${s}"` | `setAf(sec)` |
| 20 | 1844 | `onclick="toggleAlvoFlag(${idx},'${field}')"` | `data-action="alvo-flag" data-idx="${idx}" data-field="${field}"` | `toggleAlvoFlag(idx,field)` |
| 21 | 2532 | `onclick="editRow(${rid})"` (potlood) | `data-action="taak-bewerken" data-rid="${rid}"` | `openModal(true, state._rowCache[rid])` |
| 22 | 2532 | `onclick="completeTask(${rid})"` (vinkje) | `data-action="taak-afronden" data-rid="${rid}"` | `completeTask(rid)` |
| 23 | 2536 | `onclick="event.stopPropagation(); editRow(${rid})"` (Stil-pill) | `data-action="taak-bewerken" data-rid="${rid}"` | `openModal(...)` (delegatie stopt vanzelf bij sluiten rij-klik — zie noot) |
| 24–26 | 2620/2622/2623 | `onclick="(${cb})(${p})"` (paginering) | `data-action="pagineer" data-doel="${doel}" data-pg="${p}"` | `state.pgs[doel]=pg; PAG_RENDER[doel]()` |
| 27 | 3101 | `onclick="aiOvernemen('${catSec}')"` | `data-action="ai-overnemen" data-sec="${catSec}"` | `aiOvernemen(sec)` |
| 28 | 3105 | `onclick="aiActieTaak(this)"` | `data-action="ai-actie-taak"` | `aiActieTaak(el)` |
| 29 | 3109 | `onclick="aiKopieerConcept(this)"` | `data-action="ai-kopieer-concept"` | `aiKopieerConcept(el)` |
| 30 | 3382 | `onclick="setOntw('${c…}')"` | `data-action="ontw-cat" data-cat="${c}"` | `setOntw(cat)` (esc-truc vervalt — data-attr is veilig) |
| 31 | 3405 | `onclick="editOntwItem(${rid})"` | `data-action="ontw-bewerken" data-rid="${rid}"` | `editOntwItem(rid)` |
| 32–33 | 3721/3765 | `onclick="dismissToast(this.parentElement)"` | `data-action="toast-sluiten"` | `dismissToast(el.closest('.toast'))` |
| 34 | 996 | `onkeydown="histNoteKey(event)"` (textarea) | géén data-action; **expliciete listener** in `main.js`: `#m-note` → `keydown` → `histNoteKey` | n.v.t. |
| 35 | 1063 | `onchange="saveNotifPrefs()"` (select) | géén data-action; **expliciete listener** in `main.js`: `#notif-who-other`-buur of `change` → `saveNotifPrefs` | n.v.t. |

**Noot bij #23 (Stil-pill):** stond binnen een tabelrij die mogelijk z'n eigen rij-klik heeft; controleer of de rij een eigen click-handler heeft. Zo ja, behoud `event.stopPropagation()` in een aparte actie `taak-bewerken-stop` die eerst `e.stopPropagation()` doet. Zo nee, gebruik gewoon `taak-bewerken`.

**Paginering:** wijzig `renderPag(id,total,cur,cb)` → `renderPag(id,total,cur,doel)` met `doel ∈ {'ntd','af','alvo','alfa','ontw','logboek'}`. Pas de 6 aanroepers aan (regels 1739/1785/1833/1919/3408/3602): `renderPag('ntd-pag',rows.length,pgs.ntd,'ntd')` enz. De registry-actie `pagineer` gebruikt:
```js
const PAG_RENDER = { ntd:renderNtd, af:renderAf, alvo:renderAlvo, alfa:renderAlfa, ontw:renderOntw, logboek:renderLogboek };
```

## `actions.js` (mijlpaal B — volledig)

```js
import { state } from './state.js';
import { pgs } from './state.js';
import { setNtd, renderNtd, setAf, renderAf, renderPag } from './render-taken.js';
import { renderAlvo, toggleAlvoFlag } from './render-alv.js';
import { renderAlfa } from './render-analytics.js';
import { setOntw, renderOntw, editOntwItem, addTaskNote, renderLogboek } from './render-overig.js';
import { openModal, completeTask, deleteCurrentEditTask, adjOff } from './crud.js';
import { copyAiPrompt, aiOvernemen, aiActieTaak, aiKopieerConcept } from './ai.js';
import { dismissToast, saveNotifPrefs } from './notifications.js';
import { doLogin } from './auth.js';

const PAG_RENDER = { ntd:renderNtd, af:renderAf, alvo:renderAlvo, alfa:renderAlfa, ontw:renderOntw, logboek:renderLogboek };

export const ACTIONS = {
  'toggle':                (el) => el.classList.toggle('on'),
  'notif-toggle':          (el) => { el.classList.toggle('on'); saveNotifPrefs(); },
  'off':                   (el) => adjOff(el.dataset.off, +el.dataset.delta),
  'notitie-toevoegen':     ()   => addTaskNote(),
  'taak-verwijder-modal':  ()   => deleteCurrentEditTask(),
  'ai-kopieer':            (el) => copyAiPrompt(el.dataset.waar),
  'login':                 ()   => doLogin(),
  'ntd-sectie':            (el) => setNtd(el.dataset.sec),
  'af-sectie':             (el) => setAf(el.dataset.sec),
  'alvo-flag':             (el) => toggleAlvoFlag(+el.dataset.idx, el.dataset.field),
  'taak-bewerken':         (el) => openModal(true, state._rowCache[+el.dataset.rid]),
  'taak-afronden':         (el) => completeTask(+el.dataset.rid),
  'pagineer':              (el) => { const d=el.dataset.doel; pgs[d]=+el.dataset.pg; PAG_RENDER[d](); },
  'ai-overnemen':          (el) => aiOvernemen(el.dataset.sec),
  'ai-actie-taak':         (el) => aiActieTaak(el),
  'ai-kopieer-concept':    (el) => aiKopieerConcept(el),
  'ontw-cat':              (el) => setOntw(el.dataset.cat),
  'ontw-bewerken':         (el) => editOntwItem(+el.dataset.rid),
  'toast-sluiten':         (el) => dismissToast(el.closest('.toast')),
};

export function initActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) fn(el, e);
  });
}
```

> Stil-pill (#23) gebruikt `taak-bewerken`; als `event.stopPropagation()` echt nodig blijkt, voeg `'taak-bewerken-stop': (el,e)=>{ e.stopPropagation(); openModal(true, state._rowCache[+el.dataset.rid]); }` toe en gebruik dat label daar.

## Eind-CSP (mijlpaal C)

Huidige regel 11 → script-deel dichttimmeren (`'unsafe-inline'`+`'unsafe-eval'` eruit, stray `unpkg.com` weg). Streefwaarde (empirisch bijstellen o.b.v. console op de test-link):

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net https://accounts.google.com https://cdn.onesignal.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
connect-src 'self' https://sheets.googleapis.com https://www.googleapis.com https://script.google.com https://accounts.google.com https://onesignal.com https://*.onesignal.com;
img-src 'self' data: https:;
frame-src https://accounts.google.com;
```

> OneSignal injecteert mogelijk een worker/extra origin → laat de console aanwijzen of `worker-src`/extra `*.onesignal.com`/`https://accounts.google.com` in `frame-src`/`script-src` nodig is. Pas alleen aan o.b.v. een echte overtreding.

---

# MIJLPAAL A — Opsplitsen (gedrag identiek)

### Task A0: Branch + nul-meting

**Files:** geen wijziging.

- [ ] **Stap 1: Sta op `staging` met schone, actuele basis.**

Run:
```bash
cd /Users/servicedesk/collectief-dashboard
git checkout staging && git pull
git status -sb
git log --oneline -1
```
Verwacht: branch `staging`, schone of bekende werkmap.

- [ ] **Stap 2: Nul-meting zelftest.** Start de preview en open `?test=1`.

Gebruik `preview_start` (servet de map) en open `index.html?test=1`; lees de console.
Verwacht: `[TESTS] 37 OK, 0 FAIL` (of het actuele aantal — noteer dit getal als ijkpunt).

- [ ] **Stap 3: Nul-meting beeld.** Maak een screenshot van het ingelogde dashboard (of het login-scherm) met `preview_screenshot`, als visuele referentie voor "ziet er identiek uit".

> Geen commit — dit is meten.

### Task A1: CSS → `styles.css`

**Files:**
- Create: `styles.css`
- Modify: `index.html` (regels 25–480 = het `<style>…</style>`-blok; regel 24/481 omgeving)

- [ ] **Stap 1: Verplaats de stijl.** Knip de **inhoud** tussen `<style>` (na regel 25) en `</style>` (regel 480) naar een nieuw `styles.css`. Vervang het hele `<style>…</style>`-blok in `index.html` door:
```html
  <link rel="stylesheet" href="styles.css"/>
```
Plaats deze `<link>` op dezelfde plek (vlak vóór `</head>`).

- [ ] **Stap 2: Verifieer beeld identiek.** Herlaad de preview, maak `preview_screenshot`, vergelijk met A0-stap 3. Geen verschil.

- [ ] **Stap 3: Verifieer zelftest.** Open `?test=1`. Verwacht: zelfde aantal OK, 0 FAIL.

- [ ] **Stap 4: Commit.**
```bash
git add index.html styles.css
git commit -m "Fase 2A: CSS naar styles.css"
```

### Task A2: Script externaliseren → `src/main.js` (module) + window-shim

**Files:**
- Create: `src/main.js`
- Modify: `index.html` (regels 1152–4102 = het `<script>…</script>`-blok)

- [ ] **Stap 1: Verplaats het script.** Knip de **inhoud** tussen `<script>` (regel 1152) en `</script>` (regel 4102) naar `src/main.js`. Vervang het `<script>…</script>`-blok in `index.html` door:
```html
<script type="module" src="src/main.js"></script>
```

- [ ] **Stap 2: Voeg de window-shim toe** onderaan `src/main.js` (zie sectie "Tijdelijke window-shim"). Dit houdt de 35 inline-handlers + de paginering werkend nu de functies module-scoped zijn.

- [ ] **Stap 3: Verifieer volledige werking.** Herlaad. Loop met de preview-tools door: login-scherm rendert, (na inloggen of met test-sessie) tabellen, tabs aanklikken (`setNtd`/`setAf`), paginering, een rij bewerken (potlood), de Ontwikkeling-tab, AI-modal openen. Controleer `preview_console_logs` op fouten. Geen fouten, alles werkt als vóór.

- [ ] **Stap 4: Verifieer zelftest.** `?test=1` → zelfde OK, 0 FAIL.

- [ ] **Stap 5: Commit.**
```bash
git add index.html src/main.js
git commit -m "Fase 2A: script naar src/main.js als ES-module (+ tijdelijke window-shim)"
```

### Task A3: `config.js` — constanten & iconen

**Files:**
- Create: `src/config.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Knip de constanten** (zie config-lijst in "Doelstructuur") uit `main.js` naar `src/config.js` en zet `export` voor elke declaratie. Pure data, geen afhankelijkheden. Let op: `_isStagingHost`/`IS_STAGING`/`SID`/`ONESIGNAL_APP_ID` zijn afgeleid — verplaats `_isStagingHost` + de afgeleide consts mee (export beide).

- [ ] **Stap 2: Importeer in `main.js`** bovenaan:
```js
import { PROD_HOSTS, IS_STAGING, SID, ONESIGNAL_APP_ID, ALLOWED_EMAILS, EMAIL_NAMES, clientId, SECS, SKEYS, PAGE_META, PG, PRIO_REGELS, STIL_DREMPEL_DAGEN, /* …alle gebruikte… */ } from './config.js';
```
Importeer precies wat `main.js` nog gebruikt (laat de browser-console "X is not defined" aanwijzen en vul aan).

- [ ] **Stap 3: Verifieer.** Herlaad → geen console-fouten; `?test=1` (de staging-asserts gebruiken `_isStagingHost`/`PROD_HOSTS`) → zelfde OK, 0 FAIL. Korte klik-doorloop.

- [ ] **Stap 4: Commit.**
```bash
git add src/config.js src/main.js
git commit -m "Fase 2A: config.js (constanten + iconen)"
```

### Task A4: `state.js` — gedeelde toestand

**Files:**
- Create: `src/state.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Bepaal per variabele de groep** (zie "Toestands-strategie"). Run voor de twijfelgevallen:
```bash
for v in D pgs charts _shownToasts _undoStack _rowCache _writeChain; do
  echo "== $v =="; grep -nE "(^|[^.])\b$v\s*=" index.html | grep -v '==' ;
done
```
Alleen-declaratie → groep 1 (direct export). Echte hertoekenning → groep 2 (`state.x`).

- [ ] **Stap 2: Maak `src/state.js`** met groep 1 als directe exports en groep 2 op `export const state = {…}` (zie sectie). Verwijder deze declaraties uit `main.js`.

- [ ] **Stap 3: Werk de referenties bij.** Groep 1: alleen `import {D, pgs, charts, …} from './state.js'` toevoegen (geen referentie-wijziging). Groep 2: vervang `oauthToken`→`state.oauthToken`, `activeNtd`→`state.activeNtd`, enz. Doe dit **één variabele tegelijk** met woordgrens-regex en controleer elke vervanging (niet in strings/commentaar raken). Werk ook de window-shim bij (`pgs` blijft direct; verwijs render-fns nog ongewijzigd).

- [ ] **Stap 4: Verifieer grondig** (dit is de gevoeligste stap). Herlaad → geen fouten. Klik-doorloop: tabs wisselen (muteert `state.activeNtd`), paginering (muteert `pgs`), inloggen/sessie (muteert `state.oauthToken`), een taak bewerken+opslaan, afronden. `?test=1` → zelfde OK, 0 FAIL.

- [ ] **Stap 5: Commit.**
```bash
git add src/state.js src/main.js
git commit -m "Fase 2A: state.js (gedeelde toestand)"
```

### Task A5: `util.js` — pure helpers

**Files:**
- Create: `src/util.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Knip de pure helpers** (zie util-lijst) uit `main.js` naar `src/util.js`, `export` per functie. Deze hangen alleen van `config.js` af (bv. `berekenPrioriteit`→`PRIO_REGELS`, `displayName`→`EMAIL_NAMES`); voeg daar de nodige `import … from './config.js'` toe.

- [ ] **Stap 2: Importeer in `main.js`** wat nog gebruikt wordt.

- [ ] **Stap 3: Verifieer.** `?test=1` test juist véél van deze functies (`berekenPrioriteit`, `_parseAnyDate`, `displayName`) → moet `37 OK, 0 FAIL` blijven. Klik-doorloop kort.

- [ ] **Stap 4: Commit.**
```bash
git add src/util.js src/main.js
git commit -m "Fase 2A: util.js (pure helpers)"
```

### Task A6: Gegevenslaag — `api.js`, `data.js`, `auth.js`

**Files:**
- Create: `src/api.js`, `src/data.js`, `src/auth.js`
- Modify: `src/main.js`

- [ ] **Stap 1: `api.js`.** Knip de Sheets-laag-functies (zie lijst) naar `src/api.js` met `export`; `import {state} from './state.js'` (gebruikt `state.oauthToken`, `state._sheetIds`), `import {SID} from './config.js'`.

- [ ] **Stap 2: `data.js`.** Knip laden/parsen/`backgroundWrite`/sync-indicator naar `src/data.js`; importeert uit `api.js`, `state.js`, `config.js`, `util.js`. `loadAll` roept `renderAll()` aan → die staat in `main.js`; importeer `renderAll` uit `main.js` **of** laat `loadAll` een doorgegeven callback gebruiken. Eenvoudigst: `import { renderAll } from './main.js';` (live binding, kringverwijzing is ok want aanroep op runtime).

- [ ] **Stap 3: `auth.js`.** Knip `doOAuth/fetchUserEmail/doLogin/ensureToken` naar `src/auth.js`; importeert `state`, `config` (clientId, ALLOWED_EMAILS), en `loadAll` uit `data.js`.

- [ ] **Stap 4: Importeer** in `main.js` wat nog gebruikt wordt; werk de window-shim bij (`doLogin` blijft erop tot mijlpaal B).

- [ ] **Stap 5: Verifieer.** Herlaad, log in (of sessieherstel), data laadt, tabellen vullen, een schrijf-actie (taak opslaan) werkt en `backgroundWrite` rondt af. Console schoon. `?test=1` ok.

- [ ] **Stap 6: Commit.**
```bash
git add src/api.js src/data.js src/auth.js src/main.js
git commit -m "Fase 2A: gegevenslaag (api/data/auth)"
```

### Task A7: `ui.js` — schil

**Files:**
- Create: `src/ui.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Knip** `goTo, closeSb, applyTheme, applyDensity, cycleDensity, setupSearch` naar `src/ui.js` met `export`; importeer wat nodig is (`config`: DENSITIES; `state`/render voor `goTo` indien het rendert).

- [ ] **Stap 2: Importeer** in `main.js`.

- [ ] **Stap 3: Verifieer.** Navigatie (zijbalk-items), thema-knop, dichtheid-knop, zoekvelden werken. `?test=1` ok.

- [ ] **Stap 4: Commit.**
```bash
git add src/ui.js src/main.js
git commit -m "Fase 2A: ui.js (navigatie/thema/dichtheid/zoeken)"
```

### Task A8: Renderlaag — `render-taken.js`, `render-alv.js`, `render-analytics.js`, `render-overig.js`

**Files:**
- Create: `src/render-taken.js`, `src/render-alv.js`, `src/render-analytics.js`, `src/render-overig.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Verdeel de render-functies** over de vier bestanden (zie "Doelstructuur"). Elke functie `export`. Importeer per bestand wat het gebruikt uit `config/state/util/api/data` en — bij kruisverwijzing — uit `crud.js`/elkaar (kringverwijzing toegestaan; bv. `render-taken` → `openModal` uit `crud`, dat in A9 ontstaat → zet die import er pas in A9 bij, óf houd `openModal` voorlopig via window-shim). Laat `renderAll()` in `main.js`; het importeert de losse `render*`-functies.

- [ ] **Stap 2: Importeer** in `main.js`; werk window-shim bij (`setNtd, setAf, toggleAlvoFlag, editRow, setOntw, editOntwItem, addTaskNote` + de render-fns voor paginering blijven erop tot B).

- [ ] **Stap 3: Verifieer.** Alle pagina's renderen: Nog-te-doen (tabs/secties, badges, deadlines, Stil-pill), Afgerond, ALV's (vinkjes), Analytics (grafieken/sparklines/leaderboard — Chart.js werkt), Alfabetisch, Ontwikkeling, Logboek (tijdlijn, filterchips). Console schoon. `?test=1` ok (incl. `logZin`).

- [ ] **Stap 4: Commit.**
```bash
git add src/render-taken.js src/render-alv.js src/render-analytics.js src/render-overig.js src/main.js
git commit -m "Fase 2A: renderlaag (taken/alv/analytics/overig)"
```

### Task A9: Actielaag — `crud.js`, `ai.js`, `notifications.js`

**Files:**
- Create: `src/crud.js`, `src/ai.js`, `src/notifications.js`
- Modify: `src/main.js`, render-modules (kruis-imports invullen)

- [ ] **Stap 1: `crud.js`.** Knip taak-modal/CRUD-functies (zie lijst) hierheen, `export` per functie. Importeer `state/config/util/api/data` en render-functies (voor re-render na opslaan) + `notifications` (toast/notif). Vul nu de in A8 uitgestelde kruis-imports in (render→`openModal/completeTask` uit `crud`).

- [ ] **Stap 2: `ai.js`.** Knip AI-hulp-functies hierheen; importeert `state` (`state._aiLastCode/_aiLastNaam`), `config` (AI_KOPPEN/AI_WANT_TEKST), `util` (esc), en `crud` (`prefillNieuweTaak`).

- [ ] **Stap 3: `notifications.js`.** Knip toasts + push hierheen; importeert `state/config/util/api`. (`fireNotifEvent`/`logEvent` zitten functioneel bij schrijven — mogen in `crud.js` of `data.js`; kies één plek en importeer waar nodig.)

- [ ] **Stap 4: Importeer** in `main.js`; trim de window-shim tot enkel nog wat de inline-handlers nodig hebben (alle functies nu via imports beschikbaar).

- [ ] **Stap 5: Verifieer (volledige doorloop).** Nieuwe taak toevoegen, bewerken, afronden (optimistische update + achtergrond-write + undo-toast), verwijderen; Ontwikkeling toevoegen/bewerken/verwijderen; AI-modal: mail plakken → chips → prompt kopiëren → antwoord plakken → kaarten → "Overnemen"/"+ Taak"; notificatie-modal: who kiezen, test-melding. Console schoon. `?test=1` ok.

- [ ] **Stap 6: Commit.**
```bash
git add src/crud.js src/ai.js src/notifications.js src/main.js src/render-*.js
git commit -m "Fase 2A: actielaag (crud/ai/notifications)"
```

### Task A10: `tests.js` — zelftest los

**Files:**
- Create: `src/tests.js`
- Modify: `src/main.js`

- [ ] **Stap 1: Knip het `if (location.search.includes('test=1')) {…}`-blok** (regels ~4030–einde) naar `src/tests.js`. Importeer de geteste functies (`berekenPrioriteit, _parseAnyDate, displayName, logZin, _isStagingHost`) uit hun modules. Roep de test vanuit `main.js` aan met een dynamische import zodat hij niet in productie meelaadt:
```js
// onderaan main.js, na boot:
if (location.search.includes('test=1')) import('./tests.js');
```
en laat `tests.js` de testlogica bij import meteen draaien (top-level), of exporteer `runTests()` en roep die aan.

- [ ] **Stap 2: Verifieer.** `?test=1` → `37 OK, 0 FAIL`. Zonder `?test=1` → `tests.js` wordt niet geladen (check `preview_network`: geen `tests.js`-request).

- [ ] **Stap 3: Commit.**
```bash
git add src/tests.js src/main.js
git commit -m "Fase 2A: tests.js (zelftest los, lazy-load)"
```

### Task A11: Mijlpaal-A acceptatie

**Files:** geen wijziging.

- [ ] **Stap 1: Inventariseer `main.js`.** `main.js` bevat nu vooral: imports, `renderAll()`, het `DOMContentLoaded`-blok (vaste listeners + intervallen + sessieherstel + `goTo('ntd')`), en de (nog aanwezige) window-shim. Bevestig dat er geen grote functie-blokken zijn blijven hangen die in een module horen.

- [ ] **Stap 2: Volledige doorloop op de test-link.** Push naar `staging`, open de echte test-link, log in, en loop álle flows na (render alle pagina's, CRUD, AI, notificaties, thema/dichtheid, paginering, TESTOMGEVING-balk zichtbaar). `preview_console_logs`/test-link-console schoon.
```bash
git push origin staging
```
- [ ] **Stap 3: `?test=1` op de test-link** → `37 OK, 0 FAIL`.

- [ ] **Stap 4: Checkpoint-commit (indien nog iets aangepast) of door.** Mijlpaal A klaar: zelfde gedrag/uiterlijk, code opgesplitst.

---

# MIJLPAAL B — Centraal klik-systeem

### Task B1: `actions.js` — registry + delegatie + dekkings-test

**Files:**
- Create: `src/actions.js`
- Modify: `src/main.js`, `src/tests.js`

- [ ] **Stap 1: Maak `src/actions.js`** met `ACTIONS` + `initActions()` (zie sectie "actions.js volledig"). Importeer de benodigde functies.

- [ ] **Stap 2: Roep `initActions()` aan** in het `DOMContentLoaded`-blok van `main.js` (één keer).

- [ ] **Stap 3: Nieuwe test (TDD) — dekking.** Voeg aan `tests.js` een assert toe die controleert dat elke verwachte actie bestaat:
```js
import { ACTIONS } from './actions.js';
const VERWACHTE_ACTIES = ['toggle','notif-toggle','off','notitie-toevoegen','taak-verwijder-modal','ai-kopieer','login','ntd-sectie','af-sectie','alvo-flag','taak-bewerken','taak-afronden','pagineer','ai-overnemen','ai-actie-taak','ai-kopieer-concept','ontw-cat','ontw-bewerken','toast-sluiten'];
VERWACHTE_ACTIES.forEach(a => truthy(`actie '${a}' bestaat`, typeof ACTIONS[a] === 'function'));
```
- [ ] **Stap 4: Verifieer test rood→groen.** Eerst draait niets via delegatie (inline-handlers doen nog het werk), maar de dekkings-assert hoort meteen groen te zijn zodra de registry compleet is. `?test=1` → OK-aantal omhoog (≈37+19), 0 FAIL.

- [ ] **Stap 5: Commit.**
```bash
git add src/actions.js src/main.js src/tests.js
git commit -m "Fase 2B: actions.js (registry + delegatie + dekkings-test)"
```

### Task B2: Statische markup-handlers omzetten

**Files:**
- Modify: `index.html` (regels 917–1147), `src/main.js`

- [ ] **Stap 1: Vervang in `index.html`** de inline-handlers #1–17 + #34/#35 uit de omzettabel door hun `data-action`-attributen. Voor #34 (`onkeydown`) en #35 (`onchange`): verwijder het inline-attribuut en voeg in het `DOMContentLoaded`-blok van `main.js` een expliciete listener toe:
```js
document.getElementById('m-note')?.addEventListener('keydown', histNoteKey);
// #35: vervang door change-listener op het juiste select-element:
document.getElementById('<select-id>')?.addEventListener('change', saveNotifPrefs);
```
(Zoek de exacte id's op regel 996 en 1063.)

- [ ] **Stap 2: Verwijder uit de window-shim** de functies die nu via de registry lopen: `adjOff, histNoteKey, addTaskNote, deleteCurrentEditTask, saveNotifPrefs, copyAiPrompt, doLogin`.

- [ ] **Stap 3: Verifieer.** In-behandeling-toggles, offerte +/- knoppen, notitie toevoegen, taak verwijderen (modal), notificatie-toggles + who-select, AI Claude/Gemini-kopieerknoppen, **inloggen**. Console schoon. `?test=1` ok.

- [ ] **Stap 4: Commit.**
```bash
git add index.html src/main.js
git commit -m "Fase 2B: statische markup-handlers -> data-action"
```

### Task B3: Render-handlers (taken/alv/ontw) omzetten

**Files:**
- Modify: `src/render-taken.js`, `src/render-alv.js`, `src/render-overig.js`, `src/main.js`

- [ ] **Stap 1: Vervang in de render-strings** de handlers #18–23, #30–31 uit de tabel:
  - `setNtd('${s}')` → `data-action="ntd-sectie" data-sec="${s}"` (regel 1728-equivalent in `render-taken.js`)
  - `setAf('${s}')` → `data-action="af-sectie" data-sec="${s}"`
  - `toggleAlvoFlag(${idx},'${field}')` → `data-action="alvo-flag" data-idx="${idx}" data-field="${field}"` (`render-alv.js`)
  - editRow-potlood → `data-action="taak-bewerken" data-rid="${rid}"`
  - completeTask-vinkje → `data-action="taak-afronden" data-rid="${rid}"`
  - Stil-pill → `data-action="taak-bewerken" data-rid="${rid}"` (zie noot #23; voeg `taak-bewerken-stop` toe als de rij een eigen click-handler heeft)
  - `setOntw(...)` → `data-action="ontw-cat" data-cat="${c}"` (de `replace(/'/g,…)`-esc-truc vervalt) (`render-overig.js`)
  - `editOntwItem(${rid})` → `data-action="ontw-bewerken" data-rid="${rid}"`

- [ ] **Stap 2: Verwijder uit de window-shim:** `setNtd, setAf, toggleAlvoFlag, editRow, completeTask, setOntw, editOntwItem`.

- [ ] **Stap 3: Verifieer.** Sectie-tabs (Nog-te-doen + Afgerond), ALV-vinkjes togglen + status werkt, rij bewerken via potlood én via Stil-pill, taak afronden, Ontwikkeling-categorietabs + item bewerken. Console schoon. `?test=1` ok.

- [ ] **Stap 4: Commit.**
```bash
git add src/render-*.js src/main.js
git commit -m "Fase 2B: render-handlers (taken/alv/ontw) -> data-action"
```

### Task B4: Paginering omzetten (callback → doel)

**Files:**
- Modify: `src/render-taken.js` (renderPag + ntd/af-aanroepers), `src/render-alv.js`, `src/render-analytics.js` (alfa-aanroeper), `src/render-overig.js` (ontw/logboek-aanroepers), `src/main.js`

- [ ] **Stap 1: Wijzig `renderPag`-signatuur** naar `renderPag(id,total,cur,doel)` en de drie knop-templates (regels 2620/2622/2623-equivalent) naar `data-action="pagineer" data-doel="${doel}" data-pg="${...}"` (prev=`cur-1`, page=`p`, next=`cur+1`).

- [ ] **Stap 2: Pas de 6 aanroepers aan** (regels 1739/1785/1833/1919/3408/3602-equivalent): laatste argument van een callback → de doel-string (`'ntd'`,`'af'`,`'alvo'`,`'alfa'`,`'ontw'`,`'logboek'`).

- [ ] **Stap 3: Verwijder uit de window-shim** `pgs` + alle `render*`-functies (alleen nog door de registry's `PAG_RENDER` gebruikt). De shim hoort nu (vrijwel) leeg.

- [ ] **Stap 4: Verifieer.** Paginering op álle pagina's met >25 rijen: vorige/volgende/cijferknoppen springen naar de juiste pagina en re-renderen. Console schoon. `?test=1` ok.

- [ ] **Stap 5: Commit.**
```bash
git add src/render-*.js src/main.js
git commit -m "Fase 2B: paginering via data-action (callback-truc verwijderd)"
```

### Task B5: AI-kaart- & toast-handlers omzetten

**Files:**
- Modify: `src/ai.js`, `src/notifications.js`

- [ ] **Stap 1: Vervang** #27–29 (`aiOvernemen('${catSec}')`, `aiActieTaak(this)`, `aiKopieerConcept(this)`) en #32–33 (toast `dismissToast(this.parentElement)`) door hun `data-action`-attributen uit de tabel. Pas `dismissToast` aan zodat hij met het toast-element overweg kan via `el.closest('.toast')` (registry doet dat al).

- [ ] **Stap 2: Verwijder uit de window-shim** `aiOvernemen, aiActieTaak, aiKopieerConcept, dismissToast`. De shim moet nu **leeg** zijn → verwijder het `Object.assign(window, …)`-blok volledig.

- [ ] **Stap 3: Verifieer.** AI-kaarten: "Overnemen" (categorie/VvE), "+ Taak" per actiepunt, "Kopieer" concept-antwoord; toasts sluiten met het kruisje (gewone toast én undo-toast). Console schoon. `?test=1` ok.

- [ ] **Stap 4: Commit.**
```bash
git add src/ai.js src/notifications.js src/main.js
git commit -m "Fase 2B: AI-kaart- en toast-handlers -> data-action; window-shim weg"
```

### Task B6: Mijlpaal-B acceptatie — nul inline-handlers

**Files:** geen of kleine opschoning.

- [ ] **Stap 1: Bewijs dat er geen inline-handlers meer zijn.**
```bash
grep -nE '(^|[^.])\b(onclick|onchange|oninput|onsubmit|onkeyup|onkeydown|onfocus|onblur|onmousedown|onmouseup)=' index.html | grep -vE 'addEventListener|\.(onclick|onchange|oninput|onsubmit)='
```
Verwacht: **geen treffers**. (De resterende `.onclick=`/`addEventListener` in `src/*.js` zijn JS-toegekend en CSP-veilig — die mogen blijven.)

- [ ] **Stap 2: Bevestig window-shim weg.**
```bash
grep -n "Object.assign(window" src/main.js   # verwacht: geen treffer
```
- [ ] **Stap 3: Volledige doorloop op de test-link** (push → test-link): álle flows opnieuw, met focus op alles wat nu via delegatie loopt. Console schoon.
```bash
git push origin staging
```
- [ ] **Stap 4: `?test=1`** → alle OK, 0 FAIL.

- [ ] **Stap 5: Checkpoint.** Mijlpaal B klaar: één centraal klik-systeem, nul inline-handlers.

---

# MIJLPAAL C — Slot dichttimmeren (script-CSP)

### Task C1: Voorcontrole — geen eval/inline script

**Files:** geen wijziging (alleen controle).

- [ ] **Stap 1: Controleer op string-naar-code.**
```bash
grep -nE '\beval\(|new Function\(' index.html src/*.js   # verwacht: geen treffers
```
(De paginerings-callback-truc was het enige patroon dat hierop leek en is in B4 verwijderd.)

- [ ] **Stap 2: Controleer op inline `<script>` zonder src.**
```bash
grep -nE '<script(?![^>]*src=)' index.html   # verwacht: geen inline scriptblok meer (alleen <script ... src=...>)
```
- [ ] **Stap 3: Noteer bevindingen.** Als iets `eval`/inline-script gebruikt: stop en los eerst op (mag niet onder strikte script-CSP).

### Task C2: CSP aanscherpen + empirisch dichttimmeren op de test-link

**Files:**
- Modify: `index.html` (regel 11, de CSP-`<meta>`)

- [ ] **Stap 1: Vervang de CSP** door de eind-CSP uit de sectie "Eind-CSP" (`script-src` zonder `'unsafe-inline'`/`'unsafe-eval'`, stray `unpkg.com` weg).

- [ ] **Stap 2: Push naar `staging` en open de test-link met de console open.**
```bash
git add index.html && git commit -m "Fase 2C: script-CSP aanscherpen (unsafe-inline/eval eruit)" && git push origin staging
```
- [ ] **Stap 3: Test elke gevoelige flow en lees CSP-overtredingen:**
  - **Login** (Google Sign-In): inloggen werkt, geen `script-src`/`frame-src`/`connect-src`-blokkade.
  - **Sheets**: data laadt + een schrijf-actie slaagt (`connect-src`).
  - **Grafieken** (Chart.js): Analytics rendert.
  - **Meldingen** (OneSignal): notificatie-modal, abonneren, test-melding; let op worker/extra origins.
  - **PWA/service-worker**: registreert zonder fout.
- [ ] **Stap 4: Stel de witte lijst bij** uitsluitend op echte overtredingen (voeg bv. `worker-src`/een `*.onesignal.com`/`https://accounts.google.com` toe waar de console het aanwijst). Commit + push per aanpassing tot de console schoon is.

- [ ] **Stap 5: `?test=1` op de test-link** → alle OK, 0 FAIL (geen CSP-blokkade van `tests.js`).

### Task C3: Mijlpaal-C acceptatie

**Files:** geen wijziging.

- [ ] **Stap 1: Schone-console-doorloop op de test-link**: één volledige ronde door alle flows met de console open — geen enkele CSP-overtreding, geen fout.

- [ ] **Stap 2: Bevestig dat het slot echt aanstaat.** Tijdelijk een inline `<button onclick="alert(1)">` in een gerenderde string zou nu door de browser geblokkeerd worden — niet committen, alleen ter geruststelling redeneren/aantonen. (Optioneel.)

- [ ] **Stap 3: Checkpoint.** Mijlpaal C klaar: `'unsafe-inline'`/`'unsafe-eval'` weg uit `script-src`, alles werkt.

---

# GO-LIVE

### Task D1: Eindverificatie op `staging`

- [ ] **Stap 1:** Eén laatste complete doorloop op de test-link (alle flows, console schoon, TESTOMGEVING-balk zichtbaar, `?test=1` groen).
- [ ] **Stap 2:** Bevestig dat `staging` vooruit is op `main` met alleen dit frontend-werk (`git log --oneline main..staging`), géén Apps Script-wijzigingen.

### Task D2: Merge naar `main` (= live) + productie-verificatie

> Gebruik hierbij de **superpowers:finishing-a-development-branch**-skill voor de afronding.

- [ ] **Stap 1: Wacht op expliciete GO van de gebruiker.** (Dit is de enige stap die productie raakt.)
- [ ] **Stap 2: Merge.**
```bash
git checkout main && git pull
git merge --no-ff staging -m "Fase 2: index.html gemodulariseerd + centraal klik-systeem + script-CSP"
git push origin main
```
- [ ] **Stap 3: Verifieer GitHub Pages-productie** (`vvebeheercollectief.github.io/Collectief-Dashboard`, even wachten op de Pages-deploy): **géén** TESTOMGEVING-balk, login werkt, alle pagina's renderen, console schoon, `?test=1` op productie → alle OK, 0 FAIL. (De apps-script-CI hoort niet te draaien — frontend-only, path-gefilterd.)
- [ ] **Stap 4: Terug naar `staging`** voor toekomstig werk.
```bash
git checkout staging && git merge main   # staging weer gelijk
```

---

## Zelfcontrole van dit plan (uitgevoerd)

- **Spec-dekking:** opsplitsen (A1–A11), centraal klik-systeem (B1–B6), script-CSP (C1–C3), alles-eerst-op-staging + 3 mijlpalen + eindmerge (D1–D2), `?test=1` als vangnet (elke task), wat-niet-verandert bewaakt door identiek-gedrag-verificatie. ✔
- **Placeholders:** geen TBD/TODO; elke omzetting staat concreet in de tabel; nieuwe code (state.js, window-shim, actions.js, CSP) volledig uitgeschreven; verbatim-verplaatsingen via functie-lijsten + regelbereiken. ✔
- **Type/naam-consistentie:** `data-action`-labels in de tabel == de sleutels in `ACTIONS` == de `VERWACHTE_ACTIES`-test; `renderPag(…,doel)` consistent tussen B4-signatuur, aanroepers en `PAG_RENDER`; `state.x` vs directe object-exports consistent met de toestands-strategie. ✔
- **Open punt bewust gelaten aan uitvoer:** exacte functie→bestand-grens binnen de render/actie-laag en de precieze id's op regel 996/1063 (zoekt de uitvoerder op). ✔
