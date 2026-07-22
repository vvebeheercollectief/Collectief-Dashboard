# ALV "Klaargezet" + resetknop — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een stap `Klaargezet` toevoegen vóór `Uitnodiging verstuurd` in het ALV's Overzicht, met een vier-traps status, een afstreepfilter, en een resetknop die de ronde eerst archiveert en dan alle vier de vinkjes wist.

**Architecture:** Eén nieuwe boolean-kolom G in het Sheet-tabblad "ALV's overzicht". De status blijft afgeleid (niets extra's opgeslagen). De resetlogica komt in een nieuwe, aparte module `src/alv-reset.js` zodat `render-alv.js` puur over renderen en losse vlaggen blijft gaan. De pure rekenhelpers (`_resetBereik`, `_archiefNaam`) zijn los testbaar zonder netwerk.

**Tech Stack:** Statische ES-modules (geen bundler), Google Sheets API v4 via OAuth-token, Apps Script backend, zelftest-harnas in `src/tests.js` met `?test=1`.

**Spec:** `docs/superpowers/specs/2026-07-22-alv-klaargezet-design.md`

**Tak:** `feature/alv-klaargezet` (bestaat al, vanaf `main`). NIET op `staging` werken — die tak is 30 commits divergent met geparkeerd spraakmemo-werk.

---

## Werkwijze per taak

Testen draaien: server starten vanuit de repo-root en `?test=1` openen.

```bash
cd /Users/servicedesk/collectief-dashboard && python3 -m http.server 8899
```

Daarna in de browser `http://localhost:8899/index.html?test=1` openen en de console lezen; `window._testResult` bevat `"N OK, M FAIL"`. Zonder inloggen draaien de tests gewoon — ze werken op verzonnen data.

**Belangrijk:** de service worker kan oude modules serveren. Bij twijfel hard verversen (Cmd+Shift+R) of in DevTools → Application → Service Workers op "Unregister".

---

### Taak 0: Kolom G in beide Sheets (handmatig, vóór alle code)

Dit gaat via de Chrome-UI, niet via de Sheets-MCP — die is in dit project alleen-lezen.

**Sheets:**
- TEST: `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4`
- PROD: `1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`

- [ ] **Stap 1: Rasterbreedte controleren (TEST-Sheet)**

Open het tabblad "ALV's overzicht". Kijk of er een kolom G bestaat. Is de laatste kolom F, dan eerst rechtsklikken op F → "1 kolom rechts invoegen". Een schrijfactie buiten het raster mislukt geruisloos — die les staat al in dit project (Offerte, kolom P).

- [ ] **Stap 2: Kop zetten (TEST-Sheet)**

Zet in cel `G2` de tekst `Klaargezet`. Rij 1 en 2 zijn koprijen; `parseAlvo` begint bij rij 3. Neem de opmaak van kop `F2` over.

- [ ] **Stap 3: Selectievakjes (TEST-Sheet)**

Selecteer `G3` tot en met de laatste VvE-rij (dus NIET de samenvattingsregels "Totaal…"/"Uitnodigingen…" onderaan). Menu Invoegen → Selectievakje. Controleer daarna dat een leeg vakje als `FALSE` uitleest, net als kolom C.

- [ ] **Stap 4: Laatste tabblad noteren**

Noteer welk tabblad op dit moment het **laatste** is in de spreadsheet. De oude `verplaatsALV`-trigger schrijft afgeronde ALV's naar `allSheets[allSheets.length - 1]`. Dit moet ná de reset-implementatie nog steeds hetzelfde tabblad zijn. Schrijf de naam op in de commit-boodschap van Taak 10.

- [ ] **Stap 5: Herhaal stap 1 t/m 4 op de PROD-Sheet**

Dezelfde handelingen. De kolom mag gerust vóór de frontend-uitrol al bestaan: oude code leest hem simpelweg niet.

- [ ] **Stap 6: Vastleggen dat dit gebeurd is**

```bash
git commit --allow-empty -m "Sheet: kolom G 'Klaargezet' toegevoegd in TEST en PROD (handmatig)"
```

---

### Taak 1: `parseAlvo` leest kolom G

**Files:**
- Modify: `src/data.js:199-213` (functie `parseAlvo`)
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

Zoek in `src/tests.js` het blok waar `parseAlvo` al getest wordt (grep op `parseAlvo`). Voeg daar deze regels toe:

```js
  // ── Klaargezet: kolom G als vierde vlag + vier-traps status ──
  const _alvoRows = [
    ['','','','','','',''],
    ['Code','Naam','Uitnodiging','Notulen','Begroting','Opmerkingen','Klaargezet'],
    ['A1','Alfahof',   'FALSE','FALSE','FALSE','',      'TRUE' ],
    ['A2','Betaplein', 'TRUE', 'FALSE','FALSE','',      'TRUE' ],
    ['A3','Gammalaan', 'FALSE','FALSE','FALSE','',      'FALSE'],
    ['A4','Deltastraat','TRUE','TRUE', 'FALSE','',      'TRUE' ],
    ['A5','Epsilonweg','TRUE', 'FALSE','FALSE','Budget','FALSE'],
  ];
  const _alvo = parseAlvo(_alvoRows);
  eq('alvo: klaargezet uit kolom G',        _alvo[0].klaargezet, true);
  eq('alvo: klaargezet FALSE leest false',  _alvo[2].klaargezet, false);
  eq('alvo: status Klaargezet',             _alvo[0].status, 'Klaargezet');
  eq('alvo: uitnodiging wint van klaargezet', _alvo[1].status, 'Gepland');
  eq('alvo: geen enkele vlag → Open',       _alvo[2].status, 'Open');
  eq('alvo: notulen wint van alles',        _alvo[3].status, 'Afgerond');
  eq('alvo: budget nog steeds herkend',     _alvo[4].budget, true);
  eq('alvo: rijnummer klopt nog',           _alvo[0]._row, 3);
```

- [ ] **Stap 2: Draai de test, controleer dat hij faalt**

Open `http://localhost:8899/index.html?test=1`.
Verwacht: `FAIL: alvo: klaargezet uit kolom G → verwacht true, kreeg undefined` en `FAIL: alvo: status Klaargezet → verwacht "Klaargezet", kreeg "Open"`.

- [ ] **Stap 3: Pas `parseAlvo` aan**

In `src/data.js`, binnen `parseAlvo`, ná de regel met `begr`:

```js
    const begr=(r[4]||'').trim()==='TRUE';
    const klaar=(r[6]||'').trim()==='TRUE';
```

Vervang de statusregel:

```js
    const status=notu?'Afgerond':uitn?'Gepland':klaar?'Klaargezet':'Open';
```

En neem het veld op in het teruggegeven object:

```js
    return{code,naam:(r[1]||'').trim(),uitnodiging:uitn,notulen:notu,begroting:begr,klaargezet:klaar,opmerkingen:opm,budget,status,_row:i+3};
```

- [ ] **Stap 4: Draai de test, controleer dat hij slaagt**

Verwacht: geen FAIL-regels voor `alvo:`, en `window._testResult` telt 8 tests hoger dan vóór deze taak.

- [ ] **Stap 5: Commit**

```bash
git add src/data.js src/tests.js && git commit -m "ALV: parseAlvo leest kolom G als 'klaargezet' + vier-traps status"
```

---

### Taak 2: Statusafleiding en kolomkaart in render-alv

`_recomputeAlvoStatus` doet dezelfde afleiding als `parseAlvo` maar dan optimistisch na een klik. Die twee moeten identiek blijven, anders springt de status na een verversing terug.

**Files:**
- Modify: `src/render-alv.js:68-81`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

Voeg toe in `src/tests.js`, direct ná het blok uit Taak 1. Voeg `_recomputeAlvoStatus, ALVO_COLS, ALVO_LABELS` toe aan de bestaande import uit `./render-alv.js` (die import bestaat al niet — voeg de importregel toe bovenaan, tussen de andere imports):

```js
import { _recomputeAlvoStatus, ALVO_COLS, ALVO_LABELS } from "./render-alv.js";
```

En de tests:

```js
  // ── _recomputeAlvoStatus moet exact hetzelfde antwoord geven als parseAlvo ──
  const _st = (k,u,n) => { const r={klaargezet:k,uitnodiging:u,notulen:n}; _recomputeAlvoStatus(r); return r.status; };
  eq('recompute: niets → Open',           _st(false,false,false), 'Open');
  eq('recompute: klaargezet → Klaargezet',_st(true, false,false), 'Klaargezet');
  eq('recompute: uitnodiging → Gepland',  _st(true, true, false), 'Gepland');
  eq('recompute: notulen → Afgerond',     _st(true, true, true ), 'Afgerond');
  eq('recompute: uitnodiging zonder klaargezet → Gepland', _st(false,true,false), 'Gepland');
  eq('ALVO_COLS: klaargezet is kolom G',  ALVO_COLS.klaargezet, 6);
  eq('ALVO_LABELS: klaargezet',           ALVO_LABELS.klaargezet, 'Klaargezet');
```

Controleer daarnaast dat parse en recompute niet uit elkaar lopen:

```js
  const _combi = [[false,false,false],[true,false,false],[false,true,false],[true,true,false],[false,false,true],[true,true,true]];
  _combi.forEach(([k,u,n]) => {
    const rij = ['C1','Combi', u?'TRUE':'FALSE', n?'TRUE':'FALSE', 'FALSE', '', k?'TRUE':'FALSE'];
    const uitParse = parseAlvo([[],[],rij])[0].status;
    eq(`parse==recompute bij k=${k} u=${u} n=${n}`, uitParse, _st(k,u,n));
  });
```

- [ ] **Stap 2: Draai de test, controleer dat hij faalt**

Verwacht: `FAIL: recompute: klaargezet → Klaargezet → verwacht "Klaargezet", kreeg "Open"` en `FAIL: ALVO_COLS: klaargezet is kolom G → verwacht 6, kreeg undefined`.

- [ ] **Stap 3: Pas `render-alv.js` aan**

Vervang de twee constanten:

```js
const ALVO_COLS={uitnodiging:2,notulen:3,begroting:4,klaargezet:6};
const ALVO_LABELS={uitnodiging:'Uitnodiging',notulen:'Notulen',begroting:'Begroting',klaargezet:'Klaargezet'};
```

En de statusafleiding:

```js
function _recomputeAlvoStatus(r){
  r.status=r.notulen?'Afgerond':r.uitnodiging?'Gepland':r.klaargezet?'Klaargezet':'Open';
}
```

Voeg `Klaargezet` toe aan `statusIco`:

```js
function statusIco(s){return{Open:ico('zandloper'),Klaargezet:ico('klembord'),Gepland:ico('kalender'),Afgerond:ico('vinkCirkel')}[s]||''}
```

- [ ] **Stap 4: Draai de test, controleer dat hij slaagt**

Verwacht: geen FAIL, en de zes `parse==recompute`-tests slagen allemaal.

- [ ] **Stap 5: Commit**

```bash
git add src/render-alv.js src/tests.js && git commit -m "ALV: vier-traps statusafleiding gelijkgetrokken tussen parse en render"
```

---

### Taak 3: Kolom in de tabel, filteroptie en statuskleur

**Files:**
- Modify: `index.html:196-206` (kop van de ALV-tabel + het statusfilter)
- Modify: `src/render-alv.js:52-65` (rij-opbouw + `emptyRow`)
- Modify: `styles.css:248-250` (statuskleur)

- [ ] **Stap 1: Kolomkop in `index.html`**

In de `<thead>` van de ALV-tabel, tussen de koppen `VvE Naam` en `Uitnodiging`:

```html
              <th style="background:var(--ac-l);color:var(--ac);border-bottom:1px solid var(--ac-b)">Klaargezet</th>
```

- [ ] **Stap 2: Filteroptie in `index.html`**

Vervang de select `#f-status-alvo`:

```html
            <select class="filter-select" id="f-status-alvo"><option value="">Alle statussen</option><option>Open</option><option>Klaargezet</option><option>Gepland</option><option>Afgerond</option></select>
```

- [ ] **Stap 3: Rij-opbouw in `src/render-alv.js`**

Voeg de cel toe tussen de naamcel en de uitnodigingscel, en verhoog `emptyRow`:

```js
        <td class="cell-name">${esc(r.naam)}${r.budget?' <span class="badge budget-tag" title="Budgetpakket — vergadert zelf">Budget</span>':''}</td>
        <td>${flagPill(idx,'klaargezet',r.klaargezet)}</td>
        <td>${flagPill(idx,'uitnodiging',r.uitnodiging)}</td>
```

En onderaan `renderAlvo`:

```js
    :emptyRow(7);
```

- [ ] **Stap 4: Statuskleur in `styles.css`**

Direct ná `.status-open`:

```css
    .status-klaargezet{background:var(--ac-l);color:var(--ac)}
```

- [ ] **Stap 5: Controleer met het oog**

Open `http://localhost:8899/index.html`. Log in, ga naar ALV's Overzicht. Verwacht: zeven kolommen, `Klaargezet` staat vóór `Uitnodiging`, het filter heeft vier statussen, en een rij met alleen klaargezet toont een leiblauwe pil "Klaargezet".

- [ ] **Stap 6: Draai de tests**

Verwacht: geen nieuwe FAIL. `emptyRow(7)` mag geen bestaande test breken.

- [ ] **Stap 7: Commit**

```bash
git add index.html src/render-alv.js styles.css && git commit -m "ALV: kolom Klaargezet in de tabel, filteroptie en statuskleur"
```

---

### Taak 4: Stat-tegel Klaargezet en klikbare tegels

De tegels boven de tabel worden de afstreeplijst: klikken zet het statusfilter.

**Files:**
- Modify: `src/render-alv.js:28-40` (functie `renderAlvo`, statsblok)
- Modify: `src/actions.js:43` (nieuwe actie erbij)
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

In `src/tests.js`, bij de andere ALV-tests. Deze test raakt de DOM, dus hij gebruikt de echte elementen uit `index.html`:

```js
  // ── stat-tegels zijn klikbaar en zetten het statusfilter ──
  (() => {
    const alvoOud = D.alvo, filterOud = document.getElementById('f-status-alvo').value;
    try {
      D.alvo = [
        {code:'T1',naam:'Een',  klaargezet:true, uitnodiging:false,notulen:false,begroting:false,status:'Klaargezet',_row:3},
        {code:'T2',naam:'Twee', klaargezet:true, uitnodiging:true, notulen:false,begroting:false,status:'Gepland',   _row:4},
        {code:'T3',naam:'Drie', klaargezet:false,uitnodiging:false,notulen:false,begroting:false,status:'Open',      _row:5},
      ];
      document.getElementById('s-alvo').value = '';
      document.getElementById('f-status-alvo').value = '';
      renderAlvo();
      const tegel = document.querySelector('[data-action="alvo-stat"][data-status="Klaargezet"]');
      truthy('stat-tegel Klaargezet bestaat', !!tegel);
      eq('stat-tegel Klaargezet telt 1', tegel.textContent.includes('1'), true);
      ACTIONS['alvo-stat'](tegel);
      eq('klik zet filter op Klaargezet', document.getElementById('f-status-alvo').value, 'Klaargezet');
      eq('tabel toont alleen die rij', document.querySelectorAll('#alvo-tbody tr').length, 1);
      ACTIONS['alvo-stat'](document.querySelector('[data-action="alvo-stat"][data-status="Klaargezet"]'));
      eq('tweede klik wist het filter', document.getElementById('f-status-alvo').value, '');
      eq('tabel toont weer alles', document.querySelectorAll('#alvo-tbody tr').length, 3);
    } finally {
      D.alvo = alvoOud;
      document.getElementById('f-status-alvo').value = filterOud;
    }
  })();
```

Voeg `renderAlvo` toe aan de import uit `./render-alv.js` bovenaan `tests.js`.

- [ ] **Stap 2: Draai de test, controleer dat hij faalt**

Verwacht: `FAIL: stat-tegel Klaargezet bestaat → verwacht waar, kreeg false`.

- [ ] **Stap 3: Bouw de tegels om in `src/render-alv.js`**

Vervang het statsblok bovenaan `renderAlvo`:

```js
  const tot=D.alvo.length;
  const afd=D.alvo.filter(r=>r.status==='Afgerond').length;
  const gep=D.alvo.filter(r=>r.status==='Gepland').length;
  const kla=D.alvo.filter(r=>r.status==='Klaargezet').length;
  const opn=D.alvo.filter(r=>r.status==='Open').length;
  const huidig=document.getElementById('f-status-alvo').value;
  const aItem=(val,cls,cap)=>`<div class="stat-item"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span></div></div>`;
  const aKnop=(val,cls,cap,status)=>`<button type="button" class="stat-item stat-klik${huidig===status?' aan':''}" data-action="alvo-stat" data-status="${status}" aria-pressed="${huidig===status}" title="Toon alleen ${cap}"><span class="stat-val ${cls}">${val}</span><div class="stat-meta"><span class="stat-cap">${cap}</span></div></button>`;
  document.getElementById('alvo-stats').innerHTML=
    aItem(tot,'',"Totaal VvE's")+
    aKnop(afd,'green','Afgerond','Afgerond')+
    aKnop(gep,'amber','Gepland','Gepland')+
    aKnop(kla,'teal','Klaargezet','Klaargezet')+
    aKnop(opn,opn?'red':'muted','Open','Open');
```

- [ ] **Stap 4: Voeg de actie toe in `src/actions.js`**

Naast `'alvo-flag'`:

```js
  'alvo-stat':             (el) => { const f=document.getElementById('f-status-alvo');
                                     f.value = f.value===el.dataset.status ? '' : el.dataset.status;
                                     pgs.alvo=1; renderAlvo(); },
```

Voeg `renderAlvo` toe aan de import uit `./render-alv.js` in `actions.js` als die er nog niet staat, en controleer dat `pgs` al geïmporteerd is uit `./state.js` (dat is zo, `pagineer` gebruikt hem).

- [ ] **Stap 5: Stijl de knop-tegels in `styles.css`**

Direct ná `.stat-item:last-child`:

```css
    .stat-item.stat-klik{background:none;border:none;border-right:1px solid var(--bor);font:inherit;text-align:left;cursor:pointer;border-radius:0}
    .stat-item.stat-klik:hover .stat-cap{color:var(--txt)}
    .stat-item.stat-klik.aan{box-shadow:inset 0 -2px 0 var(--ac)}
```

- [ ] **Stap 6: Draai de test, controleer dat hij slaagt**

Verwacht: alle zes de nieuwe asserts slagen.

- [ ] **Stap 7: Controleer met het oog**

Klik in de echte app op de tegel Klaargezet. Verwacht: het filter springt, de tabel krimpt, de tegel krijgt een streep eronder. Nogmaals klikken zet alles terug.

- [ ] **Stap 8: Commit**

```bash
git add src/render-alv.js src/actions.js styles.css src/tests.js && git commit -m "ALV: stat-tegels klikbaar als afstreepfilter, tegel Klaargezet erbij"
```

---

### Taak 5: Vlag op de VvE-dossierpagina

**Files:**
- Modify: `src/render-vve.js:239`

- [ ] **Stap 1: Voeg `klaargezet` toe aan de vlaggenlijst**

```js
        <div class="vve-alv-flags">${['klaargezet','uitnodiging','notulen','begroting'].map(f=>
```

- [ ] **Stap 2: Controleer met het oog**

Open een VvE-dossier van een VvE met `Klaargezet` aan. Verwacht: vier badges, de eerste is "✓ Klaargezet" in het groen, de rest grijs.

- [ ] **Stap 3: Draai de tests**

Verwacht: geen nieuwe FAIL. De bestaande `vveOverzicht`-tests raken dit niet.

- [ ] **Stap 4: Commit**

```bash
git add src/render-vve.js && git commit -m "VvE-dossier: Klaargezet-vlag naast de andere ALV-vlaggen"
```

---

### Taak 6: Tweede segment in de voortgangsbalk

De balk blijft meten op verstuurde uitnodigingen. Er komt een lichter segment bij voor "wel klaargezet, nog niet verstuurd".

**Files:**
- Modify: `src/render-lijsten.js:64-82` (functie `renderNtdDonut`)
- Modify: `index.html` (element `#ntd-progress-track`)
- Modify: `styles.css`

- [ ] **Stap 1: Voeg het element toe in `index.html`**

Zoek `id="ntd-progress-fill"` en zet er een tweede laag vóór, binnen dezelfde track:

```html
              <div class="ntd-progress-voor" id="ntd-progress-voor"></div>
```

- [ ] **Stap 2: Stijl het in `styles.css`**

Zoek de regel voor `#ntd-progress-fill` en voeg toe:

```css
    .ntd-progress-voor{position:absolute;left:0;top:0;bottom:0;background:var(--ac-l);width:0;transition:width .6s ease}
```

Controleer dat `#ntd-progress-fill` een hogere stapelvolgorde heeft; zo niet, geef fill `position:relative;z-index:1`.

- [ ] **Stap 3: Vul het in `src/render-lijsten.js`**

In `renderNtdDonut`, ná de bestaande `pct`-berekening:

```js
  const voorbereid=(D.alvo||[]).filter(r=>r.klaargezet||r.uitnodiging).length;
  const pctVoor=total?Math.round(voorbereid/total*100):0;
```

En in het `requestAnimationFrame`-blok:

```js
    const voor=document.getElementById('ntd-progress-voor');
    if(voor) voor.style.width=pctVoor+'%';
```

Pas de ondertekst aan zodat hij het verschil benoemt:

```js
  document.getElementById('ntd-progress-sub').textContent =
    voorbereid>done
      ? `${pct}% verstuurd, ${pctVoor}% klaargezet`
      : `${pct}% van de vergaderingen uitgeschreven`;
```

- [ ] **Stap 4: Controleer met het oog**

Vink op de test-Sheet één VvE op Klaargezet. Verwacht: de balk krijgt een licht voorloopstuk en de ondertekst wordt "x% verstuurd, y% klaargezet".

- [ ] **Stap 5: Draai de tests**

Verwacht: geen nieuwe FAIL.

- [ ] **Stap 6: Commit**

```bash
git add index.html styles.css src/render-lijsten.js && git commit -m "Takenpagina: voortgangsbalk toont klaargezette vergaderingen als voorloopstuk"
```

---

### Taak 7: Dossier-chat kent de nieuwe stap

**Files:**
- Modify: `src/dossier-chat.js:35`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

Zoek in `src/tests.js` het dossier-chat-blok (grep op `dossierContextTekst`). Vul de bestaande `alvo`-testdata aan met `klaargezet:true` en voeg toe:

```js
  truthy('chat-context noemt klaargezet', dossierContextTekst('CH1', _Dchat, TF).toLowerCase().includes('klaargezet'));
```

Gebruik de naam van het bestaande chat-testdata-object in plaats van `_Dchat` als die anders heet.

- [ ] **Stap 2: Draai de test, controleer dat hij faalt**

Verwacht: `FAIL: chat-context noemt klaargezet → verwacht waar, kreeg false`.

- [ ] **Stap 3: Pas de contextregel aan**

In `src/dossier-chat.js`, de regel die begint met `` L.push(`Komende ALV: status ${o.alvo.status}; `` — voeg de klaargezet-stand toe:

```js
    L.push(`Komende ALV: status ${o.alvo.status}; agenda ${o.alvo.klaargezet?'klaargezet':'nog niet klaargezet'}, `
```

Laat de rest van de bestaande regel (uitnodiging, notulen, begroting) ongewijzigd staan.

- [ ] **Stap 4: Draai de test, controleer dat hij slaagt**

Verwacht: de nieuwe assert slaagt, de bestaande chat-tests blijven groen.

- [ ] **Stap 5: Commit**

```bash
git add src/dossier-chat.js src/tests.js && git commit -m "Dossier-chat: vertelt of de agenda al klaargezet is"
```

---

### Taak 8: Pure rekenhelpers voor de reset

Twee functies zonder netwerk, zodat de gevaarlijke rekenkunde los te testen is: welk rijbereik wordt gewist, en hoe heet het archieftabblad.

**Files:**
- Create: `src/alv-reset.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

Bovenaan `src/tests.js` de import:

```js
import { _resetBereik, _archiefNaam } from "./alv-reset.js";
```

En de tests, bij de andere ALV-tests:

```js
  // ── _resetBereik: alleen de echte VvE-rijen, nooit de samenvattingsregels ──
  eq('resetbereik: aaneengesloten',
     _resetBereik([{_row:3},{_row:4},{_row:5}]),
     {start:3,eind:5,aaneengesloten:true,aantal:3});
  eq('resetbereik: gat erin',
     _resetBereik([{_row:3},{_row:5}]),
     {start:3,eind:5,aaneengesloten:false,aantal:2});
  eq('resetbereik: één rij',
     _resetBereik([{_row:7}]),
     {start:7,eind:7,aaneengesloten:true,aantal:1});
  eq('resetbereik: lege lijst',
     _resetBereik([]),
     {start:0,eind:0,aaneengesloten:false,aantal:0});
  eq('resetbereik: ongesorteerde invoer',
     _resetBereik([{_row:5},{_row:3},{_row:4}]),
     {start:3,eind:5,aaneengesloten:true,aantal:3});

  // ── _archiefNaam: wijkt uit als de naam al bestaat ──
  eq('archiefnaam: vrij',        _archiefNaam(2026, ["ALV's overzicht",'Logboek']), 'ALV-archief 2026');
  eq('archiefnaam: bezet',       _archiefNaam(2026, ['ALV-archief 2026']), 'ALV-archief 2026 (2)');
  eq('archiefnaam: twee bezet',  _archiefNaam(2026, ['ALV-archief 2026','ALV-archief 2026 (2)']), 'ALV-archief 2026 (3)');
```

- [ ] **Stap 2: Draai de test, controleer dat hij faalt**

Verwacht: de module bestaat nog niet, dus de app laadt niet en de console toont een importfout op `./alv-reset.js`. Dat telt als falen.

- [ ] **Stap 3: Maak `src/alv-reset.js` met alleen de pure helpers**

```js
// ══════════════════════════════════════
//  ALV-RESET — nieuwe vergaderronde starten
//  Archiveert het tabblad "ALV's overzicht" en wist daarna de vier vinkjes
//  (C=Uitnodiging, D=Notulen, E=Begroting, G=Klaargezet).
// ══════════════════════════════════════

// Welke rijen mag de reset raken? Onderaan het tabblad staan samenvattingsregels
// ('Totaal …', 'Uitnodigingen …') die parseAlvo overslaat; die mogen niet gewist worden.
// Daarom rekenen we het bereik uit de geparseerde VvE-rijen, niet uit de laatste rij.
function _resetBereik(alvo){
  if(!alvo||!alvo.length) return {start:0,eind:0,aaneengesloten:false,aantal:0};
  const rijen=alvo.map(r=>r._row).sort((a,b)=>a-b);
  const start=rijen[0], eind=rijen[rijen.length-1];
  return {start,eind,aaneengesloten:(eind-start+1)===rijen.length,aantal:rijen.length};
}

function _archiefNaam(jaar,bestaandeNamen){
  const basis=`ALV-archief ${jaar}`;
  if(!bestaandeNamen.includes(basis)) return basis;
  let n=2;
  while(bestaandeNamen.includes(`${basis} (${n})`)) n++;
  return `${basis} (${n})`;
}

export { _resetBereik, _archiefNaam };
```

- [ ] **Stap 4: Voeg de module toe aan de service-worker-precache**

In `sw.js`, in de lijst met `'./src/…'`-paden, ná `'./src/render-alv.js',`:

```js
  './src/alv-reset.js',
```

- [ ] **Stap 5: Draai de test, controleer dat hij slaagt**

Verwacht: alle acht de nieuwe asserts slagen.

- [ ] **Stap 6: Commit**

```bash
git add src/alv-reset.js src/tests.js sw.js && git commit -m "ALV-reset: pure helpers voor rijbereik en archiefnaam"
```

---

### Taak 9: Resetknop en bevestigingsvenster

**Files:**
- Modify: `index.html` (kaartkop ALV-overzicht + nieuw modaal venster)
- Modify: `src/actions.js`
- Modify: `src/alv-reset.js`

- [ ] **Stap 1: Knop in de kaartkop van `index.html`**

Zoek `<h2>ALV's Overzicht</h2>` en zet de knop ernaast, binnen dezelfde `card-hdr`, ná de `filter-bar`:

```html
          <button class="btn btn-sec btn-sm" data-action="alvo-reset-open" title="Alle vinkjes wissen voor een nieuwe vergaderronde">Nieuwe ronde starten</button>
```

- [ ] **Stap 2: Modaal venster in `index.html`**

Zet dit naast de andere `.modal-bg`-blokken (bijvoorbeeld direct ná `id="snooze-bg"`):

```html
<div class="modal-bg" id="alvoreset-bg">
  <div class="modal" style="max-width:440px">
    <div class="modal-hdr">
      <h2 id="alvoreset-title">Weet je zeker dat je het overzicht wilt resetten?</h2>
      <button class="modal-close" id="alvoreset-close">×</button>
    </div>
    <div class="modal-body">
      <p id="alvoreset-tekst" style="line-height:1.6;margin:0"></p>
    </div>
    <div class="modal-ft" style="justify-content:space-between">
      <button class="btn btn-sec" data-action="alvo-reset-annuleer">Annuleer</button>
      <button class="btn btn-del" data-action="alvo-reset-doe" id="alvoreset-doe">Reset</button>
    </div>
  </div>
</div>
```

Let op de volgorde: **Annuleer links, Reset rechts.** Controleer dat de klassen `modal-hdr`, `modal-body` en `modal-ft` overeenkomen met die van het snooze-venster; wijken ze af, neem dan de namen van het snooze-venster over.

- [ ] **Stap 3: Open- en sluitfuncties in `src/alv-reset.js`**

Voeg bovenaan de imports toe:

```js
import { D } from "./state.js";
```

En onderaan, vóór de export:

```js
function openResetModal(){
  const b=_resetBereik(D.alvo||[]);
  if(!b.aantal){ alert('Er staan geen VvE-rijen in het overzicht om te resetten.'); return; }
  document.getElementById('alvoreset-tekst').textContent =
    `Alle vier de vinkjes gaan uit bij ${b.aantal} ${b.aantal===1?'VvE':"VvE's"}. `+
    `Elke VvE staat daarna weer op Open. De huidige ronde wordt eerst weggeschreven naar een archieftabblad, `+
    `dus er gaat niets verloren.`;
  document.getElementById('alvoreset-bg').classList.add('open');
}
function closeResetModal(){
  document.getElementById('alvoreset-bg').classList.remove('open');
}
```

Pas de exportregel aan:

```js
export { _resetBereik, _archiefNaam, openResetModal, closeResetModal };
```

- [ ] **Stap 4: Acties koppelen in `src/actions.js`**

```js
  'alvo-reset-open':       ()   => openResetModal(),
  'alvo-reset-annuleer':   ()   => closeResetModal(),
```

Met de bijbehorende import bovenaan:

```js
import { openResetModal, closeResetModal } from "./alv-reset.js";
```

De actie `alvo-reset-doe` komt in Taak 10; laat die nu nog weg zodat de knop nog niets doet.

- [ ] **Stap 5: Koppel de sluitknop**

Zoek waar `snooze-close` en `snooze-cancel` aan hun klik gekoppeld worden (grep op `snooze-close` in `src/main.js` of `src/ui.js`) en voeg `alvoreset-close` op dezelfde manier toe, met `closeResetModal`.

- [ ] **Stap 6: Controleer met het oog**

Klik op "Nieuwe ronde starten". Verwacht: het venster opent met de juiste titel, het aantal VvE's klopt met het aantal rijen in het overzicht, Annuleer staat links en Reset rechts. Escape sluit het venster (dat regelt `modal-a11y.js` al). Reset doet nog niets.

- [ ] **Stap 7: Commit**

```bash
git add index.html src/actions.js src/alv-reset.js src/main.js src/ui.js && git commit -m "ALV-reset: knop en bevestigingsvenster (nog zonder uitvoering)"
```

---

### Taak 10: De reset uitvoeren — archiveren, wissen, loggen

Dit is de gevaarlijkste taak van het plan. Drie beveiligingen: verse data ophalen, rij-identiteit controleren, en archiveren vóór het wissen.

**Files:**
- Modify: `src/alv-reset.js`
- Modify: `src/actions.js`

- [ ] **Stap 1: Breid de imports uit in `src/alv-reset.js`**

```js
import { state, D } from "./state.js";
import { SID } from "./config.js";
import { getSheetIds } from "./crud.js";
import { ensureToken } from "./auth.js";
import { loadAll } from "./data.js";
import { showToast } from "./notifications.js";
import { logEvent } from "./render-overig.js";
import { renderAll } from "./main.js";
```

- [ ] **Stap 2: Helper die de tabbladeigenschappen ophaalt**

```js
// Eén GET met alle tabblad-eigenschappen: nodig voor de invoegpositie, een vrije
// archiefnaam, de rasterbreedte, én de controle dat het laatste tabblad niet verschuift.
async function _tabbladen(){
  const resp=await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SID}?fields=sheets.properties(sheetId,title,index,gridProperties)`,
    {headers:{Authorization:`Bearer ${state.oauthToken}`}});
  if(!resp.ok) throw new Error(`Tabbladen ophalen mislukt: HTTP ${resp.status}`);
  const j=await resp.json();
  return (j.sheets||[]).map(s=>s.properties);
}
```

- [ ] **Stap 3: Controle op rij-identiteit**

```js
// De losse vlaggen gebruiken assertRowMatch op één rij. Voor een bulkschrijfactie is dat
// te smal: hier lezen we kolom A over het hele bereik terug en vergelijken met wat we
// denken te wissen. Eén afwijking → afbreken, niets schrijven.
async function _controleerCodes(bereik,codes){
  const rng=encodeURIComponent(`ALV's overzicht!A${bereik.start}:A${bereik.eind}`);
  const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/${rng}`,
    {headers:{Authorization:`Bearer ${state.oauthToken}`}});
  if(!resp.ok) throw new Error(`Controle mislukt: HTTP ${resp.status}`);
  const rijen=(await resp.json()).values||[];
  const gelezen=rijen.map(r=>((r&&r[0])||'').toString().trim());
  if(gelezen.length!==codes.length) throw new Error('Het overzicht is gewijzigd — ververs de pagina en probeer opnieuw.');
  for(let i=0;i<codes.length;i++){
    if(gelezen[i]!==codes[i]) throw new Error(`Rij ${bereik.start+i} hoort niet meer bij ${codes[i]} — ververs de pagina en probeer opnieuw.`);
  }
}
```

- [ ] **Stap 4: De resetfunctie zelf**

```js
const RESET_KOLOMMEN=[2,3,4,6]; // C=Uitnodiging, D=Notulen, E=Begroting, G=Klaargezet (0-gebaseerd)

async function doeReset(){
  const knop=document.getElementById('alvoreset-doe');
  if(state._alvoResetBezig) return;          // dubbelklik-rem, ná de tokencheck-volgorde van dit project
  if(!await ensureToken()){ showToast('Niet ingelogd','Kan niet resetten','var(--rd)'); return; }
  state._alvoResetBezig=true;
  if(knop){ knop.disabled=true; knop.textContent='Bezig…'; }

  try{
    await loadAll(true);                     // verse stand vóór een onomkeerbare bulkschrijfactie
    const bereik=_resetBereik(D.alvo||[]);
    if(!bereik.aantal) throw new Error('Geen VvE-rijen gevonden.');
    if(!bereik.aaneengesloten) throw new Error('De VvE-rijen zijn niet aaneengesloten — reset afgebroken uit voorzorg. Meld dit even.');

    const codes=[...D.alvo].sort((a,b)=>a._row-b._row).map(r=>r.code);
    await _controleerCodes(bereik,codes);

    const props=await _tabbladen();
    const bron=props.find(p=>p.title.trim()==="ALV's overzicht");
    if(!bron) throw new Error("Tabblad 'ALV's overzicht' niet gevonden.");
    if((bron.gridProperties?.columnCount||0)<7) throw new Error('Kolom G bestaat nog niet in dit tabblad — voeg hem eerst toe.');

    const laatsteVoor=props.slice().sort((a,b)=>a.index-b.index).pop().title;
    const jaar=new Date().getFullYear();
    const naam=_archiefNaam(jaar,props.map(p=>p.title));

    // Archiveren: het archief komt DIRECT NA 'ALV's overzicht', nooit achteraan.
    // De oude verplaatsALV-trigger schrijft afgeronde ALV's naar het laatste tabblad;
    // een archief achteraan zou die stil opslokken.
    const arch=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{duplicateSheet:{
        sourceSheetId:bron.sheetId, insertSheetIndex:bron.index+1, newSheetName:naam
      }}]})
    });
    if(!arch.ok) throw new Error(`Archiveren mislukt: HTTP ${arch.status} — er is niets gewist.`);

    // Wissen: vier repeatCell-verzoeken in één batchUpdate, alleen over het VvE-bereik.
    const wis=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({requests:RESET_KOLOMMEN.map(col=>({repeatCell:{
        range:{sheetId:bron.sheetId,startRowIndex:bereik.start-1,endRowIndex:bereik.eind,
               startColumnIndex:col,endColumnIndex:col+1},
        cell:{userEnteredValue:{boolValue:false}},
        fields:'userEnteredValue'
      }}))})
    });
    if(!wis.ok) throw new Error(`Wissen mislukt: HTTP ${wis.status} — het archief '${naam}' is wel aangemaakt.`);

    const naProps=await _tabbladen();
    const laatsteNa=naProps.slice().sort((a,b)=>a.index-b.index).pop().title;
    if(laatsteNa!==laatsteVoor){
      showToast('Let op','Het laatste tabblad is verschoven — controleer de spreadsheet','var(--am)');
    }

    logEvent('', 'ALVS', 'Nieuwe ronde gestart',
             `${bereik.aantal} VvE's gereset, archief '${naam}'`, '', '');
    closeResetModal();
    await loadAll(true);
    renderAll();
    showToast('Nieuwe ronde gestart', `${bereik.aantal} VvE's op Open, archief '${naam}'`, 'var(--gn)', 'herhaal');
  }catch(e){
    console.error('doeReset fout:',e);
    showToast('Reset mislukt', e.message||'Onbekende fout','var(--rd)');
  }finally{
    state._alvoResetBezig=false;
    if(knop){ knop.disabled=false; knop.textContent='Reset'; }
  }
}
```

Vul de export aan:

```js
export { _resetBereik, _archiefNaam, openResetModal, closeResetModal, doeReset };
```

- [ ] **Stap 5: Koppel de actie in `src/actions.js`**

```js
  'alvo-reset-doe':        ()   => doeReset(),
```

En vul de import aan met `doeReset`.

- [ ] **Stap 6: Test op de TEST-Sheet, met de hand**

Draai de app op staging-instellingen (of lokaal, waar `IS_STAGING` waar is, zodat `SID_TEST` gebruikt wordt). Controleer vóór het resetten hoe het overzicht eruitziet en welk tabblad het laatste is.

Klik Reset. Verwacht, in deze volgorde:
1. Er verschijnt een tabblad `ALV-archief 2026` direct ná "ALV's overzicht", met alle oude vinkjes erin.
2. In "ALV's overzicht" staan C, D, E en G op FALSE voor alle VvE-rijen.
3. De samenvattingsregels onderaan ("Totaal…", "Uitnodigingen…") zijn **onaangeroerd**.
4. Het laatste tabblad is nog steeds hetzelfde als vóór de reset.
5. Alle VvE's staan in het dashboard op *Open*, de tegel Open telt alles.
6. Het logboek heeft één regel "Nieuwe ronde gestart".

Faalt punt 3 of 4, dan stoppen en het plan bijstellen — niet doorgaan naar productie.

- [ ] **Stap 7: Test het vangnet**

Voer de reset nog een keer uit op de TEST-Sheet. Verwacht: een tweede tabblad `ALV-archief 2026 (2)`, en geen foutmelding.

- [ ] **Stap 8: Draai de tests**

Verwacht: geen nieuwe FAIL.

- [ ] **Stap 9: Commit**

Vermeld in de boodschap welk tabblad het laatste is, zodat dat later terug te vinden is.

```bash
git add src/alv-reset.js src/actions.js && git commit -m "ALV-reset: archiveren, wissen en loggen van een nieuwe vergaderronde"
```

---

### Taak 11: Apps Script bestand tegen kolom G

`cd_handleAlvoEdit` leest zes kolommen. Bij een handmatige plak-actie in kolom G is `e.value` leeg en valt de code terug op `rowData[6]` — dat is `undefined`, en `.toString()` daarop gooit een fout. De try/catch eromheen vangt het op, maar het hoort niet.

**Files:**
- Modify: `apps-script/Notifications.gs:167-192` (functie `cd_handleAlvoEdit`)

- [ ] **Stap 1: Verbreed het bereik en zet er een guard op**

Vervang in `cd_handleAlvoEdit`:

```js
  const rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
```

En de waarde-bepaling:

```js
  const ruw = (e.value !== undefined ? e.value : rowData[col - 1]);
  if (ruw === undefined || ruw === null) return;
  const newVal = ruw.toString().toUpperCase();
```

De labelketen blijft ongewijzigd: kolom 7 levert geen label op, dus er gaat geen pushmelding uit voor `Klaargezet`. Dat is een bewuste keuze uit de spec.

- [ ] **Stap 2: Controleer dat er niets anders op zes kolommen rekent**

```bash
grep -n "1, 1, 1, 6\|getRange(row, 1, 1, 6)" apps-script/*.gs
```

Verwacht: geen treffers meer in `cd_handleAlvoEdit`. Treffers in `cd_handleNtdEdit` (die leest negen kolommen van een ander tabblad) blijven staan.

- [ ] **Stap 3: Commit**

De CI rolt dit automatisch uit: push naar `staging` → TEST-script, push naar `main` → PROD-script. Handmatig plakken in de editor is niet nodig.

```bash
git add apps-script/Notifications.gs && git commit -m "Apps Script: ALV-onEdit leest zeven kolommen en valt niet om op kolom G"
```

---

### Taak 12: Versie ophogen, volledige testronde, uitrol

**Files:**
- Modify: `src/config.js:8` (`APP_VERSION`)
- Modify: `sw.js:4` (`CACHE_VERSION`)

- [ ] **Stap 1: Versienummers ophogen**

In `src/config.js`:

```js
export const APP_VERSION = '7.9';
```

In `sw.js`:

```js
const CACHE_VERSION = 'cd-v74';
```

- [ ] **Stap 2: Volledige testronde**

Open `http://localhost:8899/index.html?test=1` en lees `window._testResult`.
Verwacht: `0 FAIL`, en het aantal OK ligt ongeveer 30 hoger dan de 473 van vóór dit plan.

- [ ] **Stap 3: Commit**

```bash
git add src/config.js sw.js && git commit -m "Versie 7.9 / cd-v74: stap 'Klaargezet' in het ALV-overzicht + resetknop"
```

- [ ] **Stap 4: Naar staging voor de echte test**

`staging` is 30 commits divergent met geparkeerd spraakmemo-werk; niet kaal mergen. Zet dit werk er als losse commits bovenop:

```bash
git checkout staging && git cherry-pick main..feature/alv-klaargezet
```

Los eventuele conflicten op (verwacht in `sw.js` en `src/config.js`, omdat staging op 7.0/cd-v64 staat — houd dáár de staging-nummers aan) en push:

```bash
git push origin staging
```

- [ ] **Stap 5: Controleer op de testomgeving**

Open `collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`. Verwacht: de TESTOMGEVING-balk staat er, het ALV-overzicht heeft zeven kolommen, de tegels filteren, en de reset werkt tegen de test-Sheet.

- [ ] **Stap 6: Naar productie**

```bash
git checkout main && git merge --ff-only feature/alv-klaargezet && git push origin main
```

- [ ] **Stap 7: Controleer op productie**

Open `https://vvebeheercollectief.github.io/Collectief-Dashboard/`. Verwacht: versie 7.9, géén TESTOMGEVING-balk, zeven kolommen, en de resetknop staat er. **Druk daar niet op** — de echte ronde loopt.

Draai op de live URL de zelftest: `…/Collectief-Dashboard/?test=1`. Verwacht: `0 FAIL`.

- [ ] **Stap 8: Geheugen bijwerken**

Werk `/Users/servicedesk/.claude/projects/-Users-servicedesk/memory/` bij met een projectbestand voor deze functie, en zet een regel in `MEMORY.md`.

---

## Zelfcontrole van dit plan

**Spec-dekking.** Datamodel → Taak 0 en 1. Statusmodel → Taak 1 en 2. Schermen → Taak 3, 4, 5, 6, 7. Werkproces → volgt uit Taak 3 en 4 (filter + tegels). Resetknop, archivering, rijbereik, rij-identiteit, invoegpositie → Taak 8, 9, 10. Technische aandachtspunten → Taak 0 stap 1 (raster), Taak 10 (invoegpositie, identiteit), Taak 11 (Apps Script). Bewust-niet-lijst → nergens een taak, klopt. Testen → in elke taak, plus Taak 12. Uitrol → Taak 12.

**Namen die over taken heen gebruikt worden:** `klaargezet` (veld), `ALVO_COLS.klaargezet` = 6, `_resetBereik` → `{start,eind,aaneengesloten,aantal}`, `_archiefNaam(jaar,namen)`, `openResetModal`, `closeResetModal`, `doeReset`, `state._alvoResetBezig`, elementen `alvoreset-bg` / `alvoreset-tekst` / `alvoreset-doe` / `alvoreset-close`, acties `alvo-stat` / `alvo-reset-open` / `alvo-reset-annuleer` / `alvo-reset-doe`. Deze zijn in het hele plan consistent gebruikt.

**Volgorde-afhankelijkheden:** Taak 0 moet vóór Taak 10 (de reset controleert op zeven kolommen). Taak 8 moet vóór Taak 9 en 10 (`_resetBereik` wordt daar gebruikt). De rest is onafhankelijk.
