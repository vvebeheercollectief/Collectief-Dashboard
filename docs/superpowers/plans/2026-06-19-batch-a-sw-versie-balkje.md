# Batch A — "Nieuwe versie — herladen"-balkje + cache-aanpak — Implementatieplan

> **Voor uitvoerders:** VERPLICHTE SUB-SKILL: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak-voor-taak uit te voeren. Stappen gebruiken checkbox-syntax (`- [ ]`).

**Goal:** Een nieuwe deploy van het dashboard bereikt de gebruiker direct: zodra er een nieuwe versie klaarstaat verschijnt onderin een subtiel balkje "Nieuwe versie — Herladen"; klikken laadt de verse code. Werkt óók op GitHub Pages (de echte productie) ondanks diens HTTP-cache.

**Architecture:** De service worker stopt met onvoorwaardelijk `skipWaiting()` en activeert de nieuwe versie pas op verzoek (bericht `SKIP_WAITING`). De client registreert met `updateViaCache:'none'`, checkt periodiek op updates, detecteert een wachtende nieuwe versie en toont dan het balkje. Klikken stuurt `SKIP_WAITING`; bij `controllerchange` herlaadt de pagina eenmalig. Een eerste installatie (geen bestaande controller) toont géén balkje en herlaadt niet.

**Tech Stack:** Vanilla JS ES-modules, bestaande in-browser testsuite (`src/tests.js`, `?test=1`), service worker (`sw.js`).

**Spec:** `docs/superpowers/specs/2026-06-19-werkwijzen-verbeterprogramma-design.md` (Batch A).

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Actie |
|---------|----------------------|-------|
| `src/sw-update.js` | SW registreren + update detecteren + balkje tonen + herladen | **Aanmaken** |
| `src/tests.js` | Unit-test voor de pure beslisregel `shouldPromptReload` | Wijzigen |
| `styles.css` | Stijl van het `.sw-update-bar`-balkje | Wijzigen |
| `src/main.js` | Inline SW-registratie vervangen door `initSwUpdate()` | Wijzigen (regels 50-56) |
| `sw.js` | `skipWaiting` via bericht i.p.v. install; nieuw module in app-shell; versie-bump | Wijzigen |

**Belangrijk om te weten (rollout-eigenaardigheid):** de eerste deploy van deze batch is zélf een update voor gebruikers die nu op `cd-v33` draaien. Hún oude code kent het balkje nog niet, dus die ene keer komt de update nog op de oude manier binnen (volgende keer dat ze de app verversen). Vanáf de daaropvolgende deploy werkt het balkje. Vermeld dit niet als bug.

---

## Taak 1: `src/sw-update.js` — pure beslisregel (TDD) + de module

**Files:**
- Create: `src/sw-update.js`
- Test: `src/tests.js` (import + assertions toevoegen)

- [ ] **Stap 1: Schrijf de falende test**

Voeg bovenaan `src/tests.js` bij de andere imports toe:

```javascript
import { shouldPromptReload } from "./sw-update.js";
```

Voeg in het testblok (bijv. direct ná de bestaande Auto-prioriteit-cases, vóór regel waar `window._testResult` wordt gezet) toe:

```javascript
  // ── SW-update: balk alleen bij echte update, niet bij eerste installatie ──
  eq('sw: geen balk bij eerste installatie (geen controller)', shouldPromptReload(null), false);
  eq('sw: geen balk bij undefined controller', shouldPromptReload(undefined), false);
  truthy('sw: wel balk bij bestaande controller (update)', shouldPromptReload({ scriptURL: 'x' }));
```

- [ ] **Stap 2: Draai de tests en controleer dat ze falen**

Start de no-cache testserver en open de app met `?test=1` (zie `reference_lokaal_testen`):
```bash
cd /Users/servicedesk/.claude && python3 -m http.server 8123 &
```
Open `http://localhost:8123/.../index.html?test=1` (of de bestaande lokale testroute) en lees de console / `window._testResult`.
Verwacht: FAIL — de import `./sw-update.js` bestaat nog niet (module load error), tests draaien niet.

- [ ] **Stap 3: Maak `src/sw-update.js`**

```javascript
// ══════════════════════════════════════
//  SERVICE WORKER — registratie + "nieuwe versie"-balk
// ══════════════════════════════════════

// Pure beslisregel: toon de herlaad-balk alleen als er al een actieve
// controller is (= dit is een UPDATE, geen eerste installatie).
export function shouldPromptReload(hasController) {
  return !!hasController;
}

let _userWantsReload = false;
let _reloading = false;

function toonUpdateBalk(onReload) {
  if (document.getElementById('sw-update-bar')) return; // nooit dubbel
  const bar = document.createElement('div');
  bar.id = 'sw-update-bar';
  bar.className = 'sw-update-bar';
  bar.innerHTML =
    '<span class="sw-update-txt">Er is een nieuwe versie van het dashboard.</span>'
    + '<button type="button" class="sw-update-btn" id="sw-update-reload">Herladen</button>'
    + '<button type="button" class="sw-update-x" id="sw-update-dismiss" aria-label="Sluiten">×</button>';
  document.body.appendChild(bar);
  document.getElementById('sw-update-reload').addEventListener('click', onReload);
  document.getElementById('sw-update-dismiss').addEventListener('click', () => bar.remove());
}

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // Nieuwe SW heeft overgenomen → eenmalig herladen naar verse code,
  // maar alléén als de gebruiker zelf op "Herladen" klikte (niet bij eerste claim).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!_userWantsReload || _reloading) return;
    _reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    const base = location.pathname.replace(/\/[^/]*$/, '') || '';
    navigator.serviceWorker.register(base + '/sw.js', {
      scope: base + '/',
      updateViaCache: 'none', // omzeil HTTP-cache (GitHub Pages) bij update-checks
    }).then(reg => {
      const vraagHerladen = () => {
        _userWantsReload = true;
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      };

      // Nieuwe versie gevonden tijdens deze sessie
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && shouldPromptReload(navigator.serviceWorker.controller)) {
            toonUpdateBalk(vraagHerladen);
          }
        });
      });

      // Er stond al een nieuwe versie klaar bij het laden van de pagina
      if (reg.waiting && shouldPromptReload(navigator.serviceWorker.controller)) {
        toonUpdateBalk(vraagHerladen);
      }

      // Periodiek + bij terugkeer naar het tabblad actief checken
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000); // elk half uur
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(e => console.warn('SW registratie mislukt:', e));
  });
}
```

- [ ] **Stap 4: Draai de tests en controleer dat ze slagen**

Herlaad `index.html?test=1`. Verwacht: de drie `sw:`-assertions slagen; `window._testResult` toont `… OK, 0 FAIL` (totaal opgehoogd met 3 OK).

- [ ] **Stap 5: Commit**

```bash
git add src/sw-update.js src/tests.js
git commit -m "feat(sw): pure shouldPromptReload + sw-update module (balk bij update)"
```

---

## Taak 2: Stijl voor het balkje

**Files:**
- Modify: `styles.css` (toevoegen bij de andere toast/overlay-stijlen, rond regel 258)

- [ ] **Stap 1: Voeg de CSS toe**

Voeg ná de bestaande `.toast-*`-regels (rond `styles.css:258`) toe:

```css
    /* ── "Nieuwe versie"-balk ── */
    .sw-update-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100001;background:var(--sur);color:var(--txt);border:1px solid var(--bor);border-left:4px solid var(--ac);border-radius:var(--r);box-shadow:var(--shl);padding:10px 12px;display:flex;align-items:center;gap:12px;font:500 13px/1.3 system-ui,sans-serif;max-width:calc(100vw - 32px);animation:toast-in .25s ease}
    .sw-update-btn{background:var(--ac);color:#fff;border:none;border-radius:8px;padding:6px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;white-space:nowrap}
    .sw-update-btn:hover{filter:brightness(1.05)}
    .sw-update-x{background:none;border:none;color:var(--mut);font-size:18px;line-height:1;cursor:pointer;padding:0 2px}
    .sw-update-x:hover{color:var(--txt)}
```

(De gebruikte variabelen `--sur/--txt/--bor/--ac/--r/--shl/--mut` en de keyframe `toast-in` bestaan al in `styles.css` — hergebruik.)

- [ ] **Stap 2: Commit**

```bash
git add styles.css
git commit -m "style(sw): balkje 'Nieuwe versie — herladen'"
```

---

## Taak 3: `src/main.js` — inline registratie vervangen door `initSwUpdate()`

**Files:**
- Modify: `src/main.js:30` (import) en `src/main.js:50-56` (SW-blok)

- [ ] **Stap 1: Voeg de import toe**

Voeg ná `import { initPalette } from './palette.js';` (regel 30) toe:

```javascript
import { initSwUpdate } from './sw-update.js';
```

- [ ] **Stap 2: Vervang het inline SW-registratieblok**

Vervang in `src/main.js` het hele blok (regels 50-56):

```javascript
  // Service worker registreren (PWA-ondersteuning)
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      const _swBase=location.pathname.replace(/\/[^/]*$/,'')||'';
      navigator.serviceWorker.register(_swBase+'/sw.js',{scope:_swBase+'/'}).catch(e=>console.warn('SW registratie mislukt:',e));
    });
  }
```

door:

```javascript
  // Service worker registreren + "nieuwe versie"-balk (PWA-ondersteuning)
  initSwUpdate();
```

- [ ] **Stap 3: Commit**

```bash
git add src/main.js
git commit -m "refactor(sw): main.js gebruikt initSwUpdate i.p.v. inline registratie"
```

---

## Taak 4: `sw.js` — skipWaiting via bericht + module in app-shell

**Files:**
- Modify: `sw.js:42` (app-shell), `sw.js:44-52` (install), nieuwe message-listener

- [ ] **Stap 1: Voeg `src/sw-update.js` toe aan de app-shell**

Voeg in `sw.js` in de `APP_SHELL`-array (ná `'./src/main.js',`, regel 14) toe:

```javascript
  './src/sw-update.js',
```

- [ ] **Stap 2: Haal het onvoorwaardelijke `skipWaiting()` uit install**

Vervang het install-blok (`sw.js:44-52`):

```javascript
self.addEventListener('install', e => {
  e.waitUntil(
    // Per-resource cachen: één gemiste/hernoemd bestand mag de hele install niet laten falen
    // (anders blijft de oude SW hangen en komt een release nooit door).
    caches.open(CACHE_VERSION)
      .then(c => Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
```

door (let op: géén `skipWaiting()` meer hier — de nieuwe versie wacht tot de gebruiker op "Herladen" klikt):

```javascript
self.addEventListener('install', e => {
  e.waitUntil(
    // Per-resource cachen: één gemiste/hernoemd bestand mag de hele install niet laten falen
    // (anders blijft de oude SW hangen en komt een release nooit door).
    caches.open(CACHE_VERSION)
      .then(c => Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {}))))
  );
});

// De client vraagt de wachtende versie om actief te worden ("Herladen"-knop).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
```

(De `activate`-listener met `clients.claim()` blijft ongewijzigd: bij eerste installatie — geen oude worker — activeert de nieuwe SW sowieso meteen.)

- [ ] **Stap 3: Commit**

```bash
git add sw.js
git commit -m "feat(sw): skipWaiting via bericht; sw-update.js in app-shell"
```

---

## Taak 5: Volledige testsuite groen (regressie)

- [ ] **Stap 1: Draai alle tests**

Open `index.html?test=1` op de no-cache lokale server. Lees `window._testResult`.
Verwacht: `<N> OK, 0 FAIL` (N = vorige aantal + 3 nieuwe SW-asserts; eerder 264 → nu 267).
Bij FAIL: lees de console-regel `FAIL: …`, corrigeer, herhaal.

---

## Taak 6: Versie-bump, deploy & handmatige eindcontrole op de echte URL

> Dit is de enige manier om het lifecycle-gedrag écht te verifiëren — unit-tests dekken alleen de pure beslisregel.

- [ ] **Stap 1: Bump de cacheversie**

Wijzig in `sw.js:4`:
```javascript
const CACHE_VERSION = 'cd-v34';
```

- [ ] **Stap 2: Commit + naar staging**

```bash
git add sw.js
git commit -m "chore(sw): cache cd-v34 (Batch A — versie-balk live)"
git push -u origin feat/sw-versie-balkje
```
Breng de wijziging naar `staging` volgens het vaste ritme (FF/cherry-pick, geen kale staging-merge — zie `feedback_staging_main_merge`).

- [ ] **Stap 3: Handmatige verificatie op staging (het balkje zélf testen)**

1. Open de staging-URL en laat de huidige SW (cd-v34) registreren (1× verversen).
2. Bump lokaal `CACHE_VERSION` naar `cd-v35`, commit, deploy naar staging.
3. Houd de staging-tab open (of wissel weg en terug → `visibilitychange` triggert de check). Binnen ~30 min, of direct bij tab-terugkeer:
   - **Verwacht:** onderin verschijnt het balkje "Er is een nieuwe versie van het dashboard. [Herladen] [×]".
4. Klik **Herladen** → de pagina herlaadt éénmaal en draait cd-v35.
5. Klik bij een volgende update op **×** → balk verdwijnt, geen herlaad, app blijft werken.
6. **Eerste-installatie-check:** open de app in een privévenster (geen bestaande SW) → er verschijnt **géén** balkje en de pagina herlaadt niet vanzelf.
7. **Offline-check:** zet het netwerk uit en herlaad → de app-shell laadt nog uit cache (network-first fallback intact).

- [ ] **Stap 4: Naar productie**

Na akkoord: breng `feat/sw-versie-balkje` naar `main` (FF/cherry-pick) en controleer de echte GitHub-Pages-URL (`vvebeheercollectief.github.io`). Let op de rollout-eigenaardigheid hierboven: het balkje is pas zichtbaar vanaf de éérstvolgende deploy ná deze.

---

## Zelf-review (door de planner uitgevoerd)

- **Spec-dekking (Batch A):** "fixes bereiken de gebruiker" → Taak 1+3+4 (banner + message-skipWaiting). "subtiel balkje, geen auto-reload" → `toonUpdateBalk` + `_userWantsReload`-guard (Taak 1) + Taak 2 (stijl). "cache-aanpak GitHub Pages" → `updateViaCache:'none'` + periodieke `reg.update()` (Taak 1). "geen balk/geen reload bij eerste installatie" → `shouldPromptReload`-guard + controllerchange-intent-guard (Taak 1), getest (Taak 1 Stap 1) en handmatig (Taak 6 Stap 3.6). ✅ Geen gaten.
- **Placeholders:** geen TBD/“error handling toevoegen”; alle code volledig uitgeschreven. ✅
- **Type-/naamconsistentie:** `shouldPromptReload` identiek in `src/sw-update.js` (definitie + export), `src/tests.js` (import + 3 asserts). `initSwUpdate` geëxporteerd in `sw-update.js`, geïmporteerd+aangeroepen in `main.js`. Bericht-type `'SKIP_WAITING'` identiek in `sw-update.js` (postMessage) en `sw.js` (message-listener). Element-id `sw-update-bar` identiek in JS (`toonUpdateBalk`) en CSS (`.sw-update-bar`). ✅
