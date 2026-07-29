# Subsidie-trajecten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een vijfde sectie `SUBSIDIE-TRAJECTEN` toevoegen aan het scherm "Nog Te Doen" (en daarmee aan "Afgerond"), met zes kolommen en een klikbare fase-indicator van vijf stappen.

**Architecture:** Het dashboard leidt zijn tabbladen af uit één configuratie-object `SECS` in `src/config.js`. Veel code itereert over `SKEYS` en groeit dus vanzelf mee; daarnaast bestaan er ~40 plekken met een handgeschreven vier-weg-`switch`, een vier-item-lijst of een kolom-map die niet meegroeit. Dit plan loopt die plekken langs, in de volgorde: definitie → lezen → tonen → schrijven → backend → uitrol.

**Tech Stack:** Statische PWA zonder bundler. `index.html` + `styles.css` + ES-modules in `src/`. Backend = Google Sheets via Apps Script (`apps-script/`, deployt via CI). Geen Node, geen build-stap, geen npm.

---

## Testen: hoe dat hier werkt

Er is één testbestand, `src/tests.js`, met twee helpers: `eq(label, got, exp)` en `truthy(label, got)`. De suite wordt lazy geladen door `src/main.js:347` zodra de URL `?test=1` bevat, en schrijft het eindresultaat naar `window._testResult` als `"N OK, M FAIL"`.

**Server starten** (één keer, blijft draaien):

```
preview_start name=dashboard
```

Dat draait `~/.claude/nocache-server.py` met `Cache-Control: no-store` op `/Users/servicedesk/collectief-dashboard`. De no-store is essentieel: zonder dat cachet de browser de ES-modules en draaien de tests op oude code.

**Suite draaien:** navigeer naar `/index.html?test=1` en lees daarna `window._testResult`.

```js
// via javascript_tool, ná de navigatie
await new Promise(r => setTimeout(r, 1200)); window._testResult
```

**Cache-valkuil:** ook met no-store kan een eerder geregistreerde service worker oude modules serveren. Bij een onverklaarbare FAIL eerst opschonen:

```js
(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
(await caches.keys()).forEach(k => caches.delete(k));
```

**Baseline vóór dit werk: 788 OK, 0 FAIL.** Elke taak hieronder moet dat getal laten stijgen en FAIL op 0 houden.

---

## Correctie op de impactaudit

De audit van 2026-07-29 (13 agents, 116 bevindingen) ging er in de render-bevinding van uit dat een rij **zeven** cellen krijgt, inclusief een zichtbare kolom Opmerkingen. Dat is **onjuist**: de gebruiker koos expliciet voor **zes** kolommen om de rij rustig te houden. Opmerkingen bestaat wel als veld (kolom G, sleutel `opmerkingen`) maar staat niet in de tabel.

Dus overal in dit plan: `cols` heeft **6** items, `keys` heeft **8** items, en `rowNtd` schrijft **6** `<td>` plus de acties-`<td>`.

---

## File Structure

| Bestand | Verantwoordelijkheid | Actie |
|---|---|---|
| `src/config.js` | `SECS`-definitie van de nieuwe sectie | Wijzigen |
| `styles.css` | Teal kleurfamilie + fase-indicator CSS | Wijzigen |
| `src/util.js` | Prioriteit-/escalatiedrempels, `taakTitel` | Wijzigen |
| `src/subsidie-fase.js` | **Nieuw.** Pure fase-helpers + HTML van de indicator. Importeert alleen `esc` uit `util.js` | Aanmaken |
| `src/render-tabel.js` | Rij-weergave van de nieuwe sectie, stil-pill-uitzondering | Wijzigen |
| `src/crud.js` | Modal openen/vullen/legen, opslaan, afronden | Wijzigen |
| `src/actions.js` | Klik-actie op een fase-bolletje | Wijzigen |
| `src/bulk.js`, `src/api.js` | Bulk-afronden, deadline-kolom voor datumopmaak | Wijzigen |
| `src/palette.js`, `src/ai.js`, `src/dossier-chat.js`, `src/render-analytics.js` | Zoeken, AI-context, grafiek en dashboardpillen | Wijzigen |
| `index.html` | Vijfde formuliergroep + subcategorie-opties | Wijzigen |
| `apps-script/*.gs` | Sectielijsten, kolom-maps, sorteerblok, escalatie | Wijzigen |
| `src/tests.js` | Nieuwe tests | Wijzigen |
| `sw.js` | Cacheversie | Wijzigen |

Waarom een **nieuw bestand** `src/subsidie-fase.js`: de fase-logica bestaat uit pure functies (woord ↔ stapnummer) plus HTML-opbouw. Die in `render-tabel.js` proppen maakt een bestand dikker dat al 300+ regels doet; los houden maakt ze bovendien direct testbaar.

**De module blijft strikt puur.** De schrijfweg (`zetSubsidieFase`) hoort er níet in, maar in `crud.js`. Reden: `subsidie-fase.js` zou dan `renderNtd` uit `render-lijsten.js` moeten importeren, terwijl `render-tabel.js` op zijn beurt `faseRijHtml` uit `subsidie-fase.js` haalt — en `render-lijsten.js` importeert `render-tabel.js`. Dat is een kringloop (`subsidie-fase → render-lijsten → render-tabel → subsidie-fase`). ES-modules laten dat technisch toe, maar de volgorde van initialisatie wordt dan afhankelijk van wie er toevallig als eerste geladen wordt — precies het soort storing dat zich pas in productie laat zien. `crud.js` importeert render, api én data al, dus daar past de schrijfweg zonder nieuwe afhankelijkheid.

Let op: een nieuw bestand in `src/` betekent dat `sw.js` het in `APP_SHELL` moet krijgen (Taak 11).

---

### Task 1: Sectiedefinitie en kleur

**Files:**
- Modify: `src/config.js:52-65` (`SECS`)
- Modify: `styles.css:14` en `styles.css:41`
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

Voeg toe aan `src/tests.js`, direct ná het blok met bestaande `SECS`-tests (zoek op `SECS`):

```js
  // ── Subsidie-trajecten: sectiedefinitie ──
  eq('SECS heeft vijf secties', Object.keys(SECS).length, 5);
  eq('subsidie is de laatste sectie', Object.keys(SECS)[4], 'SUBSIDIE-TRAJECTEN');
  eq('subsidie-label', SECS['SUBSIDIE-TRAJECTEN'].label, 'Subsidie-trajecten');
  eq('subsidie heeft 6 kolomkoppen', SECS['SUBSIDIE-TRAJECTEN'].cols.length, 6);
  eq('subsidie heeft 8 sleutels', SECS['SUBSIDIE-TRAJECTEN'].keys.length, 8);
  eq('sleutel heet subsidieFase, niet fase',
     SECS['SUBSIDIE-TRAJECTEN'].keys[3], 'subsidieFase');
  eq('deadline staat op kolom F (index 5)',
     SECS['SUBSIDIE-TRAJECTEN'].keys[5], 'deadline');
  // ntdSorteerKey eist deze twee koppen letterlijk
  eq('eerste kop is exact "VvE Code"', SECS['SUBSIDIE-TRAJECTEN'].cols[0], 'VvE Code');
  truthy('deadline-kop begint met Deadline',
     SECS['SUBSIDIE-TRAJECTEN'].cols[5].startsWith('Deadline'));
  // color gaat door _lightenHex() in render-analytics.js → moet een echte hex zijn
  truthy('color is een letterlijke hex',
     /^#[0-9A-Fa-f]{6}$/.test(SECS['SUBSIDIE-TRAJECTEN'].color));
  // afOff = Math.max(keys.length, 8) — meer dan 8 sleutels verschuift kolom I
  Object.keys(SECS).forEach(s =>
    truthy(`${s} heeft hoogstens 8 sleutels`, SECS[s].keys.length <= 8));
```

- [ ] **Step 2: Run test to verify it fails**

Navigeer de preview naar `/index.html?test=1`, lees `window._testResult`.
Expected: FAIL-regels in de console, o.a. `FAIL: SECS heeft vijf secties → verwacht 5, kreeg 4`.

- [ ] **Step 3: Write minimal implementation**

In `src/config.js`, ná de `LOD`-entry (regel 64) en vóór de sluitende `};`:

```js
  'SUBSIDIE-TRAJECTEN':{label:'Subsidie-trajecten',css:'--sec:var(--tl);--sec-l:var(--tl-l);--sec-b:var(--tl-b)',color:'#0F766E',
    cols:['VvE Code','VvE','Subsidie','Fase','Behandelaar','Deadline'],
    keys:['code','naam','subsidie','subsidieFase','behandelaar','deadline','opmerkingen','inBehandeling']},
```

In `styles.css`, direct ná `--pk:#BE185D;--pk-l:#fce7f3;--pk-b:#fbcfe8;` (regel 14):

```css
      --tl:#0F766E;--tl-l:#e3f2f0;--tl-b:#b3ddd7;
```

En in het `[data-theme=dark]`-blok, direct ná de donkere `--pk`-regel (regel 41):

```css
      --tl:#5EC8BC;--tl-l:#10302E;--tl-b:#1F5049;
```

- [ ] **Step 4: Run test to verify it passes**

Herlaad `/index.html?test=1`. Expected: `window._testResult` toont 0 FAIL en ≈799 OK.

- [ ] **Step 5: Commit**

```bash
git add src/config.js styles.css src/tests.js
git commit -m "Vijfde sectie Subsidie-trajecten gedefinieerd, met eigen teal-kleurfamilie"
```

---

### Task 2: Drempels voor prioriteit en escalatie

**Files:**
- Modify: `src/util.js:21-26` (`PRIO_REGELS`), `src/util.js:33-38` (`STIL_ESCALATIE_REGELS`)
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: drempels ──
  // T = 2 juni 2026; plus(n) geeft de datum n dagen later in Nederlandse notatie
  eq('subsidie 10 dagen → Hoog',
     berekenPrioriteit(plus(10), 'SUBSIDIE-TRAJECTEN').prioriteit, 'Hoog');
  eq('subsidie 14 dagen → Hoog (grens)',
     berekenPrioriteit(plus(14), 'SUBSIDIE-TRAJECTEN').prioriteit, 'Hoog');
  eq('subsidie 15 dagen → Midden',
     berekenPrioriteit(plus(15), 'SUBSIDIE-TRAJECTEN').prioriteit, 'Midden');
  eq('subsidie 45 dagen → Midden (grens)',
     berekenPrioriteit(plus(45), 'SUBSIDIE-TRAJECTEN').prioriteit, 'Midden');
  eq('subsidie 46 dagen → Laag',
     berekenPrioriteit(plus(46), 'SUBSIDIE-TRAJECTEN').prioriteit, 'Laag');
  eq('subsidie-escalatie trap1',
     STIL_ESCALATIE_REGELS['SUBSIDIE-TRAJECTEN'].trap1, 21);
  eq('subsidie-escalatie trap2',
     STIL_ESCALATIE_REGELS['SUBSIDIE-TRAJECTEN'].trap2, 42);
  // Zonder eigen regel valt urgentie.js terug op 7/14 — dat mag hier niet gebeuren
  truthy('subsidie heeft een eigen escalatieregel',
     !!STIL_ESCALATIE_REGELS['SUBSIDIE-TRAJECTEN']);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: subsidie 10 dagen → Hoog → verwacht "Hoog", kreeg ""` — `berekenPrioriteit` geeft een lege prioriteit terug zolang `PRIO_REGELS` de sleutel mist (`src/util.js:104-105`).

- [ ] **Step 3: Write minimal implementation**

`src/util.js`, in `PRIO_REGELS` ná de `LOD`-regel:

```js
  'SUBSIDIE-TRAJECTEN': { hoog: 14, midden:  45 },
```

`src/util.js`, in `STIL_ESCALATIE_REGELS` ná de `LOD`-regel:

```js
  'SUBSIDIE-TRAJECTEN': { trap1: 21, trap2: 42 },
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈807 OK.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js
git commit -m "Subsidie-drempels: hoog 14, midden 45; stil-escalatie 21/42"
```

---

### Task 3: Pure fase-helpers

**Files:**
- Create: `src/subsidie-fase.js`
- Test: `src/tests.js`

De vijf fases wonen als gewoon woord in kolom D. Deze module vertaalt heen en weer en bouwt de HTML. Bewust puur: geen DOM-lees, geen netwerk.

- [ ] **Step 1: Write the failing test**

Voeg boven in `src/tests.js` toe aan de imports:

```js
import { SUBSIDIE_FASES, faseIndex, faseWoord, faseRijHtml } from "./subsidie-fase.js";
```

En bij de tests:

```js
  // ── Subsidie-trajecten: fase-helpers ──
  eq('vijf fases', SUBSIDIE_FASES.length, 5);
  eq('fasevolgorde', SUBSIDIE_FASES,
     ['Voorbereiden','Aangevraagd','Verleend','Uitgevoerd','Vastgesteld']);
  eq('woord → index', faseIndex('Verleend'), 3);
  eq('index is 1-gebaseerd', faseIndex('Voorbereiden'), 1);
  eq('leeg telt als Voorbereiden', faseIndex(''), 1);
  eq('undefined telt als Voorbereiden', faseIndex(undefined), 1);
  eq('onbekend woord valt terug op stap 1', faseIndex('Kwijtgeraakt'), 1);
  eq('hoofdletterongevoelig', faseIndex('vErLeEnD'), 3);
  eq('spaties eromheen', faseIndex('  Aangevraagd  '), 2);
  eq('index → woord', faseWoord(4), 'Uitgevoerd');
  eq('index buiten bereik → eerste woord', faseWoord(99), 'Voorbereiden');
  // HTML: vijf echte buttons, aria-pressed op de actieve stap
  const _fh = faseRijHtml('Verleend', 7);
  eq('vijf knoppen', (_fh.match(/<button/g) || []).length, 5);
  eq('één actieve stap', (_fh.match(/aria-pressed="true"/g) || []).length, 1);
  truthy('rij-id gaat mee', _fh.includes('data-rid="7"'));
  truthy('fasewoord staat er in tekst onder', _fh.includes('>Verleend<'));
  truthy('groep heeft een rol', _fh.includes('role="group"'));
  // XSS: een fasewoord uit de Sheet mag geen HTML injecteren
  truthy('onbekende waarde wordt niet ruw doorgegeven',
     !faseRijHtml('<img src=x onerror=alert(1)>', 1).includes('<img'));
```

- [ ] **Step 2: Run test to verify it fails**

Expected: de module bestaat niet — de import faalt en de suite laadt niet. In de console: `Failed to resolve module specifier` of een 404 op `/src/subsidie-fase.js`.

- [ ] **Step 3: Write minimal implementation**

Maak `src/subsidie-fase.js`:

```js
// ══════════════════════════════════════
//  SUBSIDIE-FASE — vijf stappen, opgeslagen als woord in kolom D
// ══════════════════════════════════════
// De fase staat bewust als leesbaar woord in de Sheet, niet als nummer: zo is de
// kolom ook bruikbaar als je het tabblad zelf openslaat. Alles wat hier binnenkomt
// komt uit die Sheet en is dus mensenwerk — leeg, een typfout of een andere
// schrijfwijze mogen nooit een lege tabel opleveren. Vandaar de terugval op stap 1.
import { esc } from './util.js';

export const SUBSIDIE_FASES = ['Voorbereiden','Aangevraagd','Verleend','Uitgevoerd','Vastgesteld'];

// Woord → 1-gebaseerd stapnummer. Onbekend/leeg = 1 (Voorbereiden).
export function faseIndex(woord){
  const w = ((woord == null ? '' : woord) + '').trim().toLowerCase();
  const i = SUBSIDIE_FASES.findIndex(f => f.toLowerCase() === w);
  return i < 0 ? 1 : i + 1;
}

// Stapnummer → woord. Buiten bereik = het eerste woord.
export function faseWoord(n){
  return SUBSIDIE_FASES[(n | 0) - 1] || SUBSIDIE_FASES[0];
}

// Vijf knoppen op een lijn met het fasewoord eronder. `rid` is de index in
// state._rowCache, zodat de klik-actie de rij terugvindt — hetzelfde patroon als
// de bewerk- en afrondknoppen in render-tabel.js.
export function faseRijHtml(huidig, rid, extraClass){
  const n = faseIndex(huidig);
  let rail = '';
  for (let i = 1; i <= 5; i++){
    const cls = i < n ? 'af' : i === n ? 'nu' : '';
    rail += `<button type="button" class="fase-bol ${cls}" data-action="subsidie-fase"`
          + ` data-rid="${rid}" data-fase="${i}" aria-pressed="${i === n}"`
          + ` title="Zet op ${esc(SUBSIDIE_FASES[i-1])}"`
          + ` aria-label="Zet op ${esc(SUBSIDIE_FASES[i-1])}"></button>`;
    if (i < 5) rail += `<span class="fase-lijn ${i < n ? 'af' : ''}"></span>`;
  }
  return `<div class="fase-rij ${extraClass || ''}" role="group" aria-label="Fase van dit subsidietraject">`
       + `<div class="fase-rail">${rail}</div>`
       + `<div class="fase-lbl">${esc(faseWoord(n))}</div></div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈823 OK.

- [ ] **Step 5: Commit**

```bash
git add src/subsidie-fase.js src/tests.js
git commit -m "Fase-helpers: vijf stappen, terugval op stap 1 bij leeg of onbekend"
```

---

### Task 4: De rij in de tabel

**Files:**
- Modify: `src/render-tabel.js:90-160` (`rowNtd`)
- Modify: `styles.css` (fase-CSS, ná de `.off-*`-regels rond 933-940)
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: rij-opbouw ──
  // rowNtd is niet geëxporteerd; we testen via renderNtd op echte data.
  D.ntd['SUBSIDIE-TRAJECTEN'] = [{
    _row: 99, _sec: 'SUBSIDIE-TRAJECTEN', code: '311028', naam: 'VvE Naarderstraat',
    subsidie: 'SVVE isolatie', subsidieFase: 'Verleend', behandelaar: 'Cihad',
    deadline: plus(30), opmerkingen: 'niet zichtbaar in de tabel', inBehandeling: 'TRUE',
  }];
  state.activeNtd = 'SUBSIDIE-TRAJECTEN'; pgs.ntd = 1;
  renderNtd();
  const _tr = document.querySelector('#ntd-tbody tr[data-row="99"]');
  truthy('subsidierij wordt getekend', !!_tr);
  eq('zes kolommen plus de actiekolom', _tr.querySelectorAll('td').length, 7);
  eq('kolomkoppen in de thead',
     document.querySelectorAll('#ntd-thead th').length, 7);
  truthy('subsidie-omschrijving staat in de rij', _tr.textContent.includes('SVVE isolatie'));
  truthy('fasewoord staat in de rij', _tr.textContent.includes('Verleend'));
  truthy('opmerkingen staan NIET in de tabel',
     !_tr.textContent.includes('niet zichtbaar in de tabel'));
  eq('vijf fase-knoppen in de rij', _tr.querySelectorAll('.fase-bol').length, 5);
  // Stil-pill hoort hier weg te blijven: wachten is de normale toestand
  eq('geen stil-pill op dit tabblad', _tr.querySelectorAll('.pill-stil').length, 0);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: zes kolommen plus de actiekolom → verwacht 7, kreeg 0`. De `switch` in `rowNtd` heeft geen tak voor deze sectie en ook geen `default`, dus `cells` blijft leeg en de rij komt zonder enkele `<td>` uit de functie.

- [ ] **Step 3: Write minimal implementation**

In `src/render-tabel.js`, boven in de imports:

```js
import { faseRijHtml } from './subsidie-fase.js';
```

Vervang de stil-pill-voorwaarde op regel 98 (`sec !== 'OFFERTE-TRAJECTEN'`) door een lijst, zodat de uitzondering uitlegbaar blijft:

```js
  // Secties waar 'stil' geen signaal is maar de normale toestand: bij offertes wacht
  // je op een aannemer, bij subsidie op de gemeente. Een klokje bij elke rij leert de
  // gebruiker alleen maar om het klokje te negeren.
  const GEEN_STIL_PILL = ['OFFERTE-TRAJECTEN', 'SUBSIDIE-TRAJECTEN'];
  const stilPill = (_stilDagen !== null && !GEEN_STIL_PILL.includes(sec))
```

Voeg ná de `case'LOD':`-tak (die eindigt op regel 147 met `break;`) toe:

```js
    case'SUBSIDIE-TRAJECTEN':
      cells=`<td>${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
        <td class="cell-txt"><span class="ct" title="${esc(r.subsidie||'')}">${esc(r.subsidie||'')}</span>${extraPills}</td>
        <td>${faseRijHtml(r.subsidieFase, rid)}</td>
        <td>${persBadges(r.behandelaar)}</td>
        ${deadlineCel(r, 'SUBSIDIE-TRAJECTEN')}
        <td>${editBtn}</td>`;
      break;
```

Voeg in `styles.css` toe, ná de `.off-*`-regels:

```css
    /* Fase-indicator (subsidie-trajecten): vijf stappen op een lijn.
       Alleen var()-kleuren, zodat er geen aparte donkere-modus-regels nodig zijn. */
    .fase-rij{display:flex;flex-direction:column;gap:5px;min-width:158px}
    .fase-rail{display:flex;align-items:center}
    .fase-bol{position:relative;width:11px;height:11px;padding:0;border-radius:50%;box-sizing:border-box;flex:none;background:var(--bor-input);border:2px solid var(--bor-input);cursor:pointer;transition:background var(--tr),border-color var(--tr),transform var(--tr-fast)}
    .fase-bol:hover{transform:scale(1.28)}
    .fase-bol.af{background:var(--tl);border-color:var(--tl)}
    .fase-bol.nu{background:var(--sur);border-color:var(--tl)}
    .fase-lijn{height:2px;flex:1;min-width:9px;background:var(--bor-input)}
    .fase-lijn.af{background:var(--tl)}
    .fase-lbl{font-size:11.5px;font-weight:600;color:var(--mut);white-space:nowrap}
    .fase-rij-modal{min-width:0;max-width:280px}
    /* Op aanraakschermen is 11px te klein om te raken. Alleen in de tabel: in de
       modal staan de bolletjes al ruim uit elkaar. */
    @media(pointer:coarse){
      .fase-rij:not(.fase-rij-modal) .fase-bol::before{content:'';position:absolute;inset:-11px -3px}
    }
```

Voeg `.fase-bol:active` toe aan de bestaande `transform:scale(.97)`-selectorlijst op regel 955.

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈831 OK. Controleer daarna visueel met een screenshot van `/index.html?test=1` — de suite laat de testrij staan.

- [ ] **Step 5: Commit**

```bash
git add src/render-tabel.js styles.css src/tests.js
git commit -m "Subsidierij in de tabel: zes kolommen, fase-bolletjes, geen stil-pill"
```

---

### Task 5: Omschrijving overal waar een taak een titel krijgt

**Files:**
- Modify: `src/util.js:316` (`taakTitel`)
- Modify: `src/palette.js:29`, `:39`, `:99`, `:103`
- Modify: `src/ai.js:42`, `:55`, `:153-159`, `:169-174`
- Modify: `src/dossier-chat.js:16`
- Modify: `src/render-analytics.js:624`
- Modify: `src/crud.js:168`, `:201`, `:262`, `:332`; `src/snooze.js:66`
- Test: `src/tests.js`

Een subsidietaak heeft geen `actiepunt`, `periode`, `agendapunten` of `status`. Overal waar code die vier velden aan elkaar knoopt om een titel te maken, valt een subsidietaak door de mand en toont het dashboard de kale sectienaam — of in het VvE-dossier letterlijk "Subsidie-trajecten — geen omschrijving".

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: omschrijving ──
  const _sr = { _sec:'SUBSIDIE-TRAJECTEN', code:'311028', naam:'VvE Naarderstraat',
                subsidie:'SVVE isolatie', subsidieFase:'Verleend' };
  eq('taakTitel pakt de subsidie-omschrijving',
     taakTitel(_sr, 'SUBSIDIE-TRAJECTEN'), 'SVVE isolatie');
  truthy('dossier-context noemt de omschrijving',
     dossierContextTekst('311028', { ntd:{ 'SUBSIDIE-TRAJECTEN':[_sr] }, logboek:[], alvo:[], kenmerken:[] })
       .includes('SVVE isolatie'));
  // Ctrl+K moet een subsidietraject vinden op zijn omschrijving
  D.ntd['SUBSIDIE-TRAJECTEN'] = [_sr];
  truthy('Ctrl+K vindt op omschrijving',
     zoekAlles('SVVE').some(t => t.r && t.r.code === '311028'));
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: taakTitel pakt de subsidie-omschrijving → verwacht "SVVE isolatie", kreeg "Subsidie-trajecten"`.

- [ ] **Step 3: Write minimal implementation**

`src/util.js:316` — voeg `schoon(r.subsidie)` toe aan de keten:

```js
  const eigen = schoon(r.actiepunt) || schoon(r.agendapunten) || schoon(r.periode) || schoon(r.status) || schoon(r.subsidie);
```

`src/palette.js:29` — voeg `r.subsidie` toe aan de `hit()`-velden voor open taken; idem op `:39` voor afgeronde taken (let op: dáár heet het veld `r.opmerking`, enkelvoud). Op `:99` en `:103` de titelketen uitbreiden met `r.subsidie`.

`src/dossier-chat.js:16`:

```js
  const t = r => (r.actiepunt || r.agendapunten || r.status || r.periode || r.subsidie || '').trim();
```

`src/render-analytics.js:624` — vervang `${esc(r.actiepunt||r.periode||'')}` door `${esc(taakTitel(r, r._sec))}` en importeer `taakTitel` uit `./util.js`.

`src/ai.js:42` — `r.subsidie` toevoegen vóór de label-terugval.
`src/ai.js:55` — de categorie-opsomming in de prompttekst uitbreiden met `Subsidie-trajecten`.
`src/ai.js:153-159` — in `aiGisCategorie`, vóór de offerte-tak:

```js
  if(t.includes('subsidie')) return 'SUBSIDIE-TRAJECTEN';
```

`src/ai.js:169-174` — vijfde tak in `prefillNieuweTaak`:

```js
  else if(sec==='SUBSIDIE-TRAJECTEN') setIf('m-subsidie', actiepunt);
```

`src/crud.js` regels 168, 201, 262 en 332 en `src/snooze.js:66` — voeg `r.subsidie` toe aan de omschrijvingsketens, zodat toasts en logregels ("Taak verwijderd: …") niet leeg zijn.

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈834 OK.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/palette.js src/ai.js src/dossier-chat.js src/render-analytics.js src/crud.js src/snooze.js src/tests.js
git commit -m "Subsidie-omschrijving overal waar een taak een titel krijgt"
```

---

### Task 6: Het bewerkscherm

**Files:**
- Modify: `index.html:497`, `:514`, `:548`, `:564` (subcategorie-selects) en een nieuw blok ná `:566`
- Modify: `src/crud.js:31-35` (`openModal`), `:61-82` (`fillModalFields`), `:85-89` (`clearModal`), `:374` (`subId`)
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: bewerkscherm ──
  truthy('vijfde formuliergroep bestaat', !!document.getElementById('fg-sub'));
  ['m-subsidie','m-beh-s','m-dl-s','m-opm-s','m-sub-sub','tog-ib-s']
    .forEach(id => truthy(`veld ${id} bestaat`, !!document.getElementById(id)));
  eq('fase-kiezer in de modal',
     document.querySelectorAll('#fg-sub .fase-bol').length, 5);
  // Alle vijf de subcategorie-dropdowns bieden alle vijf de secties
  ['m-sub-opp','m-sub-verg','m-sub-off','m-sub-lod','m-sub-sub'].forEach(id => {
    const opts = [...document.getElementById(id).options].map(o => o.text);
    truthy(`${id} biedt Subsidie-trajecten`, opts.includes('Subsidie-trajecten'));
    eq(`${id} heeft Geen + vijf secties`, opts.length, 6);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: vijfde formuliergroep bestaat → verwacht waar, kreeg null`.

- [ ] **Step 3: Write minimal implementation**

Voeg in `index.html` aan alle vier de bestaande subcategorie-selects (`m-sub-opp`, `m-sub-verg`, `m-sub-off`, `m-sub-lod`) als laatste optie toe:

```html
<option>Subsidie-trajecten</option>
```

Voeg tussen het sluit-`</div>` van `#fg-lod` (regel 566) en `<!-- Logboek per taak -->` (regel 567) de vijfde groep toe:

```html
      <!-- SUBSIDIE-TRAJECTEN -->
      <div id="fg-sub" style="display:none">
        <div class="fld"><label>Subsidie</label><textarea id="m-subsidie" placeholder="Waar gaat dit traject over? bv. SVVE isolatie"></textarea></div>
        <div class="fld">
          <label id="lbl-fase-modal">Fase</label>
          <div id="m-fase" class="fase-host"></div>
        </div>
        <div class="fld-row">
          <div class="fld"><label>Deadline</label><input type="date" id="m-dl-s"/></div>
          <div class="fld"><label>Behandelaar</label>
            <select id="m-beh-s"><option value="">Selecteer…</option><option>Jer</option><option>Cihad</option><option>Gabos</option><option>Cihad, Jer</option><option>Jer, Gabos</option><option>Cihad, Gabos</option></select>
          </div>
        </div>
        <div class="fld"><label>Opmerkingen</label><input type="text" id="m-opm-s"/></div>
        <div class="fld"><label>Subcategorie</label><select id="m-sub-sub"><option value="">Geen</option><option>Oppakken</option><option>Vergaderverzoeken</option><option>Offerte-trajecten</option><option>LOD</option><option>Subsidie-trajecten</option></select></div>
        <div class="toggle-row"><button type="button" class="tog" role="switch" aria-checked="false" id="tog-ib-s" data-action="toggle"></button><span>In behandeling</span></div>
      </div>
```

In `src/crud.js`, `openModal` (regel 31-35): trek de vier verberg-regels en de map samen in één const boven de functie en laat de lus eroverheen lopen, zodat een zesde sectie later niet weer vier plekken raakt:

```js
const FG_PER_SECTIE = {
  OPPAKKEN:'fg-opp', VERGADERVERZOEKEN:'fg-verg', 'OFFERTE-TRAJECTEN':'fg-off',
  LOD:'fg-lod', 'SUBSIDIE-TRAJECTEN':'fg-sub',
};
```

en in `openModal`:

```js
  Object.values(FG_PER_SECTIE).forEach(id => { document.getElementById(id).style.display='none'; });
  const fg = FG_PER_SECTIE[sec];
```

In `fillModalFields` (regel 61-82) een vijfde case:

```js
    case'SUBSIDIE-TRAJECTEN':
      setv('m-subsidie', r.subsidie||''); setv('m-beh-s', r.behandelaar||'');
      setv('m-dl-s', toISODate(r.deadline)); setv('m-opm-s', r.opmerkingen||'');
      setv('m-sub-sub', r.subcategorie||'');
      tog('tog-ib-s', r.inBehandeling==='TRUE');
      zetModalFase(r.subsidieFase);
      break;
```

In `clearModal` (regel 88) `'tog-ib-s'` toevoegen aan de lijst en `zetModalFase('')` aanroepen.

In `submitTask` (regel 374) de id-map uitbreiden met `'SUBSIDIE-TRAJECTEN':'m-sub-sub'`.

Voeg in `src/crud.js` de hulpfunctie toe die de fase-kiezer in de modal tekent en zijn stand bijhoudt in een module-variabele:

```js
// Fase-stand van het geopende bewerkscherm. Bewust een module-variabele en geen
// DOM-lees: submitTask heeft het woord nodig, niet de knoppen.
let _modalFase = 1;
function zetModalFase(woord){
  _modalFase = faseIndex(woord);
  const host = document.getElementById('m-fase');
  if (host) host.innerHTML = faseRijHtml(faseWoord(_modalFase), -1, 'fase-rij-modal');
}
function kiesModalFase(n){ zetModalFase(faseWoord(n)); }
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈851 OK.

- [ ] **Step 5: Commit**

```bash
git add index.html src/crud.js src/tests.js
git commit -m "Bewerkscherm voor subsidietrajecten, met fase-kiezer en subcategorie-optie"
```

---

### Task 7: Opslaan, afronden en bulk

**Files:**
- Modify: `src/crud.js:292-302` (`doCompleteTask`), `:379-395` (`submitTask`), `:400` (`newBeh`)
- Modify: `src/bulk.js:60` (`BULK_DEADLINE_KOLOM`), `:106-113` (`bulkAfronden`)
- Modify: `src/api.js:141` (`NTD_DATUM`)
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: schrijfwegen ──
  eq('bulk-deadline staat op kolom F',
     BULK_DEADLINE_KOLOM['SUBSIDIE-TRAJECTEN'], 'F');
  // NTD_DATUM stuurt de datumopmaak van de Sheet aan: kolom F (index 5), niet D.
  // Bij deze sectie is D de fase — daar mag geen datumopmaak op.
  // NTD_DATUM stond niet in de export van api.js; die wordt in stap 3 toegevoegd
  // (alleen om te kunnen testen — verder verandert er niets aan het gebruik).
  eq('datumkolom is F, niet D', NTD_DATUM['SUBSIDIE-TRAJECTEN'], [5]);
  // serializeNtdUndo moet A..P vullen zodat een undo niets kwijtraakt
  const _u = serializeNtdUndo({ _sec:'SUBSIDIE-TRAJECTEN', code:'311028', naam:'VvE N',
    subsidie:'SVVE', subsidieFase:'Verleend', behandelaar:'Cihad', deadline:'1 juli 2026',
    opmerkingen:'x', inBehandeling:'TRUE' });
  truthy('undo-rij is minstens 16 kolommen breed', _u.length >= 16);
  eq('undo houdt de fase op kolom D', _u[3], 'Verleend');
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: bulk-deadline staat op kolom F → verwacht "F", kreeg undefined`.

- [ ] **Step 3: Write minimal implementation**

`src/bulk.js:60` — `'SUBSIDIE-TRAJECTEN':'F'` toevoegen aan `BULK_DEADLINE_KOLOM` en de toelichting op regels 57-58 bijwerken.

`src/api.js:141` — `'SUBSIDIE-TRAJECTEN':[5]` toevoegen aan `NTD_DATUM`, met een comment dat D hier de fase is en dus géén datumkolom. Voeg `NTD_DATUM` óók toe aan de export op regel 270, anders kan de test er niet bij.

`src/crud.js`, `submitTask`, nieuwe case in de switch:

```js
      case'SUBSIDIE-TRAJECTEN':
        values=[code,naam,gv('m-subsidie'),faseWoord(_modalFase),gv('m-beh-s'),toDutchDate(gv('m-dl-s')),gv('m-opm-s'),
          document.getElementById('tog-ib-s').classList.contains('on'),'','',sub];break;
```

`src/crud.js:400` — de ternaire ketting voor `newBeh` uitbreiden:

```js
    const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):sec==='SUBSIDIE-TRAJECTEN'?gv('m-beh-s'):gv('m-beh-l'));
```

`src/crud.js`, `doCompleteTask`, nieuwe case (deze switch heeft een `default: throw`, dus zonder tak breekt afronden hard):

```js
      case'SUBSIDIE-TRAJECTEN':
        values=[r.code,r.naam,r.subsidie||'',r.subsidieFase||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',today,comment,r.subcategorie||''];break;
```

`src/bulk.js`, `bulkAfronden`, nieuwe case vóór de bestaande `default`:

```js
      case'SUBSIDIE-TRAJECTEN':
        return [r.code,r.naam,r.subsidie||'',r.subsidieFase||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||'',vandaag,'',r.subcategorie||''];
```

Laat de bestaande `default`-tak in `bulk.js` staan — die vangt een onbekende sectie op met een generieke rij in plaats van een harde fout, en dat is bij een bulk-actie over veel rijen het veiligere gedrag.

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈856 OK.

- [ ] **Step 5: Commit**

```bash
git add src/crud.js src/bulk.js src/api.js src/tests.js
git commit -m "Schrijfwegen voor subsidietrajecten: opslaan, afronden, bulk, datumkolom F"
```

---

### Task 8: Klikken op een fase-bolletje

**Files:**
- Modify: `src/actions.js` (`ACTIONS`-map)
- Modify: `src/crud.js` (schrijfweg `zetSubsidieFase`)
- Test: `src/tests.js`

Het patroon om te volgen staat in `src/offerte-aannemers.js:20-30`: optimistisch muteren, opnieuw tekenen, `ensureToken`, dan `backgroundWrite` met `assertRowMatch` als guard.

De schrijfweg komt in `crud.js`, niet in `subsidie-fase.js` — zie "File Structure" voor de reden (kringloop). Herkomst van de helpers: `ensureToken` uit `./auth.js`, `backgroundWrite` uit `./data.js`, `assertRowMatch` en `writeRange` uit `./api.js`, `logEvent` uit `./render-overig.js`. `crud.js` importeert die alle vijf al.

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: fase klikken ──
  truthy('klik-actie is geregistreerd', typeof ACTIONS['subsidie-fase'] === 'function');
  // De modal-variant mag niets naar de Sheet schrijven, alleen lokale stand zetten
  truthy('modal-fase-actie bestaat', typeof ACTIONS['subsidie-fase-modal'] === 'function');
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: klik-actie is geregistreerd → verwacht waar, kreeg "undefined"`.

- [ ] **Step 3: Write minimal implementation**

Voeg in `src/crud.js` de schrijfweg toe (naast de andere schrijfacties, ná `doCompleteTask`):

```js
// Fase wegschrijven naar kolom D. Zelfde vorm als _bewaar in offerte-aannemers.js:
// eerst lokaal muteren zodat het scherm meteen klopt, dan pas de Sheet — met de
// rij-guard ertussen, zodat we nooit een ándere taak overschrijven als er
// intussen rijen zijn verschoven.
export async function zetSubsidieFase(rid, stap){
  const r = state._rowCache[rid];
  if (!r || r._sec !== 'SUBSIDIE-TRAJECTEN') return;
  const nieuw = faseWoord(stap);
  const oud = r.subsidieFase || '';
  if (nieuw === oud) return;
  if (!await ensureToken()) { alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  r.subsidieFase = nieuw;
  renderNtd();
  backgroundWrite(
    async () => {
      await assertRowMatch(r._row, { ...r, subsidieFase: oud });
      await writeRange(`'Nog Te Doen'!D${r._row}`, [nieuw]);
      await logEvent(r.code, 'SUBSIDIE-TRAJECTEN', 'Fase gewijzigd', 'fase', oud, nieuw);
    },
    () => { r.subsidieFase = oud; },
    'Fase opslaan mislukt'
  );
}
```

Controleer dat `crud.js` deze namen al importeert (`ensureToken` uit `./auth.js`, `backgroundWrite` uit `./data.js`, `assertRowMatch` + `writeRange` uit `./api.js`, `logEvent` uit `./render-overig.js`, `renderNtd` uit `./render-lijsten.js`) en vul aan wat ontbreekt. Voeg daarnaast toe:

```js
import { faseIndex, faseWoord, faseRijHtml, SUBSIDIE_FASES } from './subsidie-fase.js';
```

Registreer in `src/actions.js` twee acties:

```js
  'subsidie-fase': (el) => zetSubsidieFase(+el.dataset.rid, +el.dataset.fase),
  'subsidie-fase-modal': (el) => kiesModalFase(+el.dataset.fase),
```

Let op: `faseRijHtml` zet `data-action="subsidie-fase"`. Voor de modal-variant moet `zetModalFase` in `crud.js` het attribuut ná het tekenen omzetten naar `subsidie-fase-modal`, zodat een klik in de modal niet meteen naar de Sheet schrijft:

```js
  host.querySelectorAll('.fase-bol').forEach(b => { b.dataset.action = 'subsidie-fase-modal'; });
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈858 OK.

- [ ] **Step 5: Commit**

```bash
git add src/subsidie-fase.js src/actions.js src/crud.js src/tests.js
git commit -m "Fase-bolletje klikbaar: schrijft kolom D met rij-guard en logregel"
```

---

### Task 9: Analytics, dashboardpillen en de grafiek

**Files:**
- Modify: `src/render-analytics.js:561` (donut-kleuren), `:612-617` (`secPill`)
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  // ── Subsidie-trajecten: grafiek en pillen ──
  // HERO_VIEWS is een ARRAY van view-objecten met .key en .build().
  // De kleurenlijst in build() stond hardgecodeerd op vier items naast twee
  // SKEYS.map()-aanroepen; die liep dus stil uit de pas.
  // HERO_VIEWS wordt in stap 3 geëxporteerd zodat de test erbij kan.
  const _donut = HERO_VIEWS.find(v => v.key === 'taken').build();
  eq('donut heeft evenveel kleuren als secties',
     _donut.colors.length, Object.keys(SECS).length);
  eq('donut heeft evenveel labels als secties',
     _donut.labels.length, Object.keys(SECS).length);
  truthy('elke donutkleur is een echte hex of rgb',
     _donut.colors.every(c => /^(#|rgb)/.test(c)));
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: donut heeft evenveel kleuren als secties → verwacht 5, kreeg 4`.

- [ ] **Step 3: Write minimal implementation**

`src/render-analytics.js:561` — vervang de handmatige lijst door een afleiding uit `SECS`, zodat hij nooit meer uit de pas kan lopen. Exporteer `HERO_VIEWS` onderaan het bestand, zodat de test de opbouw kan nalopen:

```js
      return{labels:SKEYS.map(s=>SECS[s].label),data,colors:SKEYS.map(s=>s==='OPPAKKEN'?acColor():SECS[s].color),centerVal:`${tot}`,centerLbl:'Open Taken'};
```

(`OPPAKKEN` houdt `acColor()`, want die volgt het thema.)

`src/render-analytics.js:612-617` — vijfde entry in `secPill`:

```js
    'SUBSIDIE-TRAJECTEN':'<span style="background:var(--tl-l);color:var(--tl)" class="badge">Subsidie</span>',
```

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈860 OK.

- [ ] **Step 5: Commit**

```bash
git add src/render-analytics.js src/tests.js
git commit -m "Analytics: donutkleuren uit SECS afgeleid, subsidie-pil op het dashboard"
```

---

### Task 10: De backend (Apps Script)

**Files:**
- Modify: `apps-script/Notifications.gs:131-136`, `:212-215`, `:270-272`, `:316-319`, `:335`, `:623`
- Modify: `apps-script/Opvolging.gs:8-13`, `:15`
- Modify: `apps-script/Code.gs:29`, `:63`, `:79-96`, `:182-206`, `:253-266`
- Modify: `apps-script/AutoPrioriteit.gs:6-10` (alleen commentaar)

Deze bestanden hebben geen testsuite; ze deployen via de CI-Action naar het TEST-script bij een push naar `staging`. Controle gebeurt daar, via de Executions-pagina.

- [ ] **Step 1: Sectielijsten aanvullen**

Voeg `'SUBSIDIE-TRAJECTEN'` toe aan élk van deze lijsten:
- `Notifications.gs:212`, `:270`, `:335`, `:623` (`CD_NTD_SECTIES`)
- `Opvolging.gs:15` (`CD_OPV_SKEYS`) — zonder dit draait de dagelijkse escalatiemotor het nieuwe blok nooit door
- `Code.gs:29` en `:63` (sectiekop-detectie in `verplaatsAfgerond`)

- [ ] **Step 2: Kolom-maps aanvullen**

De nieuwe sectie lijkt qua kolommen op **LOD**, niet op Oppakken: behandelaar op E, deadline op F.

```js
// Notifications.gs:131-136  behandelaarColMap
'SUBSIDIE-TRAJECTEN': 5,
// Notifications.gs:214-215 en :271-272
DEADLINE_COL['SUBSIDIE-TRAJECTEN'] = 5;   // 0-geteld: kolom F
BEH_COL['SUBSIDIE-TRAJECTEN']      = 4;   // 0-geteld: kolom E
```

En in `cd_dailySummary` (regels 316-319) een regel voor de dagelijkse samenvatting:

```js
    if (p.secs['SUBSIDIE-TRAJECTEN']) parts.push(p.secs['SUBSIDIE-TRAJECTEN'] + ' subsidie');
```

- [ ] **Step 3: Escalatiedrempels gelijktrekken**

`Opvolging.gs:8-13`, in `CD_STIL_ESCALATIE_REGELS` — moet gelijk zijn aan `src/util.js`:

```js
  'SUBSIDIE-TRAJECTEN': { trap1: 21, trap2: 42 },
```

- [ ] **Step 4: Sorteerblok in Code.gs**

`_sorteerOfferteTrajectenImpl` begrenst het LOD-blok op "lege kolom A". Nu er een blok ná LOD komt, moet die einde-detectie ook breken op een bekende sectiekop (regel 259), anders sorteert LOD de subsidierijen mee. Voeg `subsidieHeader` toe aan de kopherkenning (182-193), begrens `inLOD` op regel 206, en voeg ná regel 266 een sorteerblok toe naar het model van LOD, met `sort({column: 6})` (kolom F = deadline).

- [ ] **Step 5: Afgerond-blok en commentaar**

`Code.gs:79-96` (`setupAfgerondSheet`) een vijfde blok toevoegen. Let op: deze functie maakt een *nieuw* tabblad op; het echte tabblad Afgerond krijgt zijn blok met de hand (Taak 12).

`AutoPrioriteit.gs:6-10` — vul het SYNC-commentaar aan met "Subsidie-trajecten 14/45" en leg vast dat deze sectie bewust **buiten** de server-side herberekening blijft: `AP_PRIO_COL` wijst naar kolom F, en dat is bij deze sectie de deadline, geen prioriteit. Een herberekening zou daar de deadline overschrijven. De code op regel 31 hoeft niet gewijzigd.

- [ ] **Step 6: Commit**

```bash
git add apps-script/
git commit -m "Backend kent de vijfde sectie: meldingen, escalatie, sortering, afgerond-blok"
```

---

### Task 11: Opruiming, versie en documentatie

**Files:**
- Modify: `src/render-lijsten.js:17-32` (verwijderen), `:336` (export)
- Modify: `src/config.js:8` (`APP_VERSION`), `sw.js:4` (`CACHE_VERSION`), `sw.js:5-56` (`APP_SHELL`)
- Modify: `beheer-playbook.md` §2 en §6
- Test: `src/tests.js`

- [ ] **Step 1: Write the failing test**

```js
  eq('versie opgehoogd', APP_VERSION, '10.1');
```

- [ ] **Step 2: Run test to verify it fails**

Expected: `FAIL: versie opgehoogd → verwacht "10.1", kreeg "10.0"`.

- [ ] **Step 3: Write minimal implementation**

Verwijder `SEC_ICONS` en `SEC_THEMES` uit `src/render-lijsten.js` (regels 17-32) en haal ze uit de export op regel 336. Ze zijn nergens geïmporteerd — restant van de compacte-statkop-verbouwing (v8.8). Controleer vóór het verwijderen nog één keer:

```bash
grep -rn "SEC_ICONS\|SEC_THEMES" --include=*.js --include=*.html . | grep -v node_modules | grep -v mockups/
```

Verwacht: alleen de definitie- en exportregels zelf.

Zet `APP_VERSION` op `'10.1'` (`src/config.js:8`) en `CACHE_VERSION` op `'cd-v96'` (`sw.js:4`). Voeg `'./src/subsidie-fase.js'` toe aan `APP_SHELL` in `sw.js` — dit is een nieuw moduelbestand en zonder die regel valt het buiten de precache.

Vul in `beheer-playbook.md` §2 ("Categorie kiezen") en de JSON-opsomming in §6 de vijfde categorie aan, zodat de mail-intake-instructies niet stilzwijgend achterlopen.

- [ ] **Step 4: Run test to verify it passes**

Expected: 0 FAIL, ≈861 OK. Controleer daarna dat de app nog laadt (geen import-fout door de verwijderde export).

- [ ] **Step 5: Commit**

```bash
git add src/render-lijsten.js src/config.js sw.js beheer-playbook.md src/tests.js
git commit -m "Dode SEC_ICONS/SEC_THEMES weg, versie 10.1 / cd-v96, playbook bijgewerkt"
```

---

### Task 12: Test-Sheet inrichten en naar staging

Geen code. Volgorde is dwingend — zie de spec, bevinding 3.

- [ ] **Step 1: Rooster verlengen op de TEST-Sheet**

Spreadsheet `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4`, tabblad "Nog Te Doen" (`worksheetId 0`): van 91 naar 160 rijen. Kolommen blijven 17.

- [ ] **Step 2: Code naar staging**

```bash
git checkout staging && git merge --ff-only feature/subsidie-trajecten && git push origin staging
```

Wacht tot de Vercel-branchdeploy staat; controleer met een fetch op `/sw.js` dat `CACHE_VERSION` op `cd-v96` staat.

- [ ] **Step 3: Blok toevoegen aan de TEST-Sheet**

Pas ná stap 2. In "Nog Te Doen", ná de laatste gevulde rij (80), met één lege rij ertussen:

| Rij | A | B–H |
|---|---|---|
| 82 | `SUBSIDIE-TRAJECTEN` | leeg |
| 83 | `VvE Code` | `VvE`, `Subsidie`, `Fase`, `Behandelaar`, `Deadline`, `Overige opmerkingen`, `In behandeling` |

Kolom A van rij 82 moet de enige gevulde cel van die rij zijn, anders herkent `isSectieKop` hem niet. Zet daarna op de datarijen eronder de **afvink-checkbox** als data-validatie op kolom I — zonder die validatie kan een subsidietraject niet afgevinkt worden en werkt `verplaatsAfgerond` niet.

Herhaal hetzelfde blok onderaan het tabblad "Afgerond".

- [ ] **Step 4: Controleren zonder login**

De app zit achter een login-gate en op staging kan alleen de gebruiker inloggen. Wat wél kan:

```js
document.getElementById('login-gate').style.display='none';
const st = await import('/src/state.js');
st.D.ntd['SUBSIDIE-TRAJECTEN'] = [/* proefrij */];
const rl = await import('/src/render-lijsten.js');
st.state.activeNtd = 'SUBSIDIE-TRAJECTEN'; rl.renderNtd();
```

Daarna een `computer{action:"screenshot"}` — geen `getComputedStyle`, want in de preview tikken overgangen niet door en loopt die meting één stap achter.

- [ ] **Step 5: Overdracht klaarleggen**

Zie taak 5 in de takenlijst: één document met de staging-link, de productie-stappen in volgorde, en de twee openstaande keuzes (omschrijving per traject, logboek-knip).

---

## Zelfcontrole

**Spec-dekking.** Alle zeven besluiten uit de spec hebben een taak: kolommen (1, 4), fase-weergave (3, 4, 6, 8), vijf fases (3), migratie van de zes (buiten dit plan — handmatig, na uitrol), logboek (bewust niet geautomatiseerd), kleur (1), positie achter LOD (1). De vier sturende bevindingen zijn belegd: `subsidieFase` (1), rooster (12), uitrolvolgorde (12), kolomvertaling (spec + overdracht).

**Placeholders.** Geen TBD of "handel edge cases af"; elke codestap toont de code.

**Naamconsistentie.** `subsidieFase` (sleutel), `faseIndex`/`faseWoord`/`faseRijHtml`/`zetSubsidieFase` (module), `m-subsidie`/`m-beh-s`/`m-dl-s`/`m-opm-s`/`m-sub-sub`/`tog-ib-s`/`m-fase` (velden), `fase-rij`/`fase-rail`/`fase-bol`/`fase-lijn`/`fase-lbl` (CSS) — overal gelijk gehouden.

**Bewust buiten dit plan.** De migratie van de zes taken en de logboek-knip staan niet als taak: ze raken productiedata en vragen een oordeel van de gebruiker. Ze staan in de overdracht.
