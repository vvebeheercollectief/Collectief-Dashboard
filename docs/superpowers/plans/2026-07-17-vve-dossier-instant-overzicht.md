# VvE-dossier instant overzicht — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het VvE-dossier omvormen tot een schermvullend naslagscherm met drie panelen die elk apart scrollen, een + tegel in kerncijfer-stijl, en een tijdlijn waarin automatische ruis gedempt is.

**Architecture:** Alle wijzigingen zitten in drie bestanden. `render-overig.js` krijgt de zin-reparatie (één zinnengenerator, `logZin`, in plaats van twee). `render-vve.js` krijgt de nieuwe pagina-opbouw. `styles.css` krijgt de paneel-layout. Pure helpers worden eerst getest, daarna pas gebruikt in de render.

**Tech Stack:** Vanilla ES-modules, geen build. Tests draaien in de browser via `?test=1` en schrijven `window._testResult`. Deploy via GitHub Pages (main) — zie `docs/` en de deploy-pijplijn-notitie.

**Spec:** `docs/superpowers/specs/2026-07-17-vve-dossier-instant-overzicht-design.md`
**Mockup (leidend voor de opmaak):** `mockups/mockup-dossier-C.html`
**Branch:** `dossier-instant-overzicht` (bestaat al, spec is er al op gecommit)

---

## Testen — hoe je dat hier doet

Er is **geen** node-testrunner. Elke "run de tests"-stap gaat zo:

```bash
cd /Users/servicedesk/collectief-dashboard
python3 -m http.server 8899 >/tmp/cd-test.log 2>&1 &
```

Open dan `http://localhost:8899/index.html?test=1` in de browser en lees `window._testResult` uit. Dat is een string als `"357 OK, 0 FAIL"`. Falende asserts staan als `FAIL: <label> → verwacht X, kreeg Y` in de console.

Via de browser-tools:

```js
// na laden van http://localhost:8899/index.html?test=1
window._testResult
```

**Let op de service-worker-valkuil:** de SW cachet agressief. Zie je oude code, hard-refresh (Cmd+Shift+R) of unregister de SW via DevTools → Application. Dit staat ook in de memory-notitie "Lokaal testen dashboard".

---

## Task 1: `logZin` kent "Aangevinkt" en "Uitgevinkt"

Dit repareert de klacht "Cihad — Aangevinkt 121027" bij de wortel. Die regel ontstaat doordat `logZin` geen geval heeft voor deze acties en terugvalt op zijn default (de ruwe actienaam). De actie komt uit `render-alv.js:121`, met `veld` = het label van de aangevinkte kolom (Uitnodiging / Notulen / Begroting).

**Files:**
- Modify: `src/render-overig.js` (functie `logZin`, rond regel 245)
- Test: `src/tests.js` (bij de bestaande logZin-asserts, rond regel 128)

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe in `src/tests.js`, direct ná de bestaande regel met `logZin Kenmerk bevat "kenmerk"`:

```js
  truthy('logZin Aangevinkt bevat "vinkte"', logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'}).includes('vinkte'));
  truthy('logZin Aangevinkt noemt het veld', logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'}).includes('Notulen'));
  truthy('logZin Aangevinkt eindigt op "aan"', /\baan\b/.test(logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'})));
  truthy('logZin Uitgevinkt bevat "uit"', /\buit\b/.test(logZin({actie:'Uitgevinkt', code:'TEST01', veld:'Begroting', gebruiker:'info@vvebeheercollectief.nl'})));
  truthy('logZin Aangevinkt toont niet de ruwe actienaam', !logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'}).includes('— Aangevinkt'));
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Open `http://localhost:8899/index.html?test=1`, lees `window._testResult`.
Verwacht: FAIL-regels voor de nieuwe asserts (de default-tak levert "— Aangevinkt", dus "vinkte" ontbreekt).

- [ ] **Step 3: Voeg de gevallen toe aan `logZin`**

In `src/render-overig.js`, in de `switch(r.actie)` van `logZin`, direct vóór `case'Kenmerk':`:

```js
    case'Aangevinkt':          return A('vinkte','var(--gn)')+`<b>${esc(r.veld||'')}</b> aan bij `+chip;
    case'Uitgevinkt':          return A('vinkte','var(--am)')+`<b>${esc(r.veld||'')}</b> uit bij `+chip;
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Verwacht: `window._testResult` toont 0 FAIL, en het aantal OK is met 5 gestegen t.o.v. de uitgangswaarde.

- [ ] **Step 5: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: nette zin voor aan-/uitvinken i.p.v. ruwe actienaam"
```

---

## Task 2: `logZin` kan de code-chip weglaten

In het dossier is de VvE-code redundant — je zít in dat dossier. Juist die chip maakt de regel lang. Default blijft mét chip, zodat de Logboek-pagina niet verandert.

**Files:**
- Modify: `src/render-overig.js` (functie `logZin`)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe in `src/tests.js`, na de asserts uit Task 1:

```js
  truthy('logZin default toont de code', logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('TEST01'));
  truthy('logZin zonderCode verbergt de code', !logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}, {zonderCode:true}).includes('TEST01'));
  truthy('logZin zonderCode houdt het werkwoord', logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}, {zonderCode:true}).includes('rondde'));
  truthy('logZin zonderCode werkt ook bij Aangevinkt', logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'}, {zonderCode:true}).includes('Notulen'));
  truthy('logZin zonderCode laat geen "bij" bungelen', !/\bbij\s*$/.test(logZin({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', gebruiker:'info@vvebeheercollectief.nl'}, {zonderCode:true}).replace(/<[^>]*>/g,'').trim()));
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Verwacht: FAIL op "zonderCode verbergt de code" (de tweede parameter wordt genegeerd, de chip staat er nog).

- [ ] **Step 3: Implementeer de optie**

Vervang in `src/render-overig.js` de kop van `logZin` en de chip-opbouw. De zinnen die eindigen op `'bij '+chip` moeten bij `zonderCode` niet met een bungelend "bij" achterblijven — daarom wordt de hele staart één variabele:

```js
// Eén zinnengenerator voor alle logregels (gedeeld door Logboek-pagina en VvE-dossier).
// opts.zonderCode → laat de VvE-code weg; in een dossier is die redundant.
function logZin(r, opts){
  const zonderCode=!!(opts&&opts.zonderCode);
  const naam=esc(displayName(r.gebruiker)||'Iemand');
  const chip=vveCodeSpan(r.code, '--sec:var(--ac);--sec-l:var(--ac-l)');
  // "… bij 121027" → in het dossier gewoon niets; anders blijft "bij" bungelen.
  const bij=zonderCode?'':' bij '+chip;
  const va =zonderCode?'':' '+chip;   // waar de code lijdend voorwerp is ("rondde X af")
  const A=(verb,kleur)=>`<b>${naam}</b> <span class="log-act" style="color:${kleur}">${verb}</span> `;
  switch(r.actie){
    case'Afgerond':            return A('rondde','var(--gn)')+(zonderCode?'deze taak':chip)+' af';
    case'Verwijderd':          return A('verwijderde','var(--rd)')+'een taak'+bij;
    case'Teruggezet':          return A('zette','var(--am)')+(zonderCode?'deze taak':chip)+' terug';
    case'Opmerking':           return A('noteerde','var(--am)')+(zonderCode?'iets':'bij '+chip);
    case'Behandelaar gewijzigd':return A('wees','var(--ac)')+(zonderCode?'deze taak':chip)+' toe';
    case'Aangemaakt':
    case'Aangemaakt (sheet)':  return A('maakte','var(--pu)')+'een nieuwe taak'+bij+(r.nieuweWaarde?` <span style="color:var(--mut)">→ ${esc(r.nieuweWaarde)}</span>`:'');
    case'Contact':             return A('sprak','var(--ac)')+`met ${esc(r.oudeWaarde||'—')}`+bij+` <span style="color:var(--mut)">· ${esc(r.veld||'')}</span>`;
    case'Aangevinkt':          return A('vinkte','var(--gn)')+`<b>${esc(r.veld||'')}</b> aan`+bij;
    case'Uitgevinkt':          return A('vinkte','var(--am)')+`<b>${esc(r.veld||'')}</b> uit`+bij;
    case'Kenmerk':             return A('wijzigde','var(--pu)')+`kenmerk <b>${esc(r.veld||'')}</b>`+bij;
    default:                   return `<b>${naam}</b> — ${esc(r.actie||'')}`+va;
  }
}
```

Let op: `va` wordt alleen in de default gebruikt; de andere takken regelen hun eigen plaatsing omdat de code daar grammaticaal lijdend voorwerp is.

- [ ] **Step 4: Draai de tests en zie ze slagen**

Verwacht: 0 FAIL. **Ook de bestaande logZin-asserts (tests.js:128-133) moeten nog groen zijn** — die roepen aan zonder tweede argument en mogen niet veranderd zijn.

- [ ] **Step 5: Controleer de Logboek-pagina op regressie**

Open `http://localhost:8899/index.html`, ga naar de Logboek-pagina. De regels moeten er identiek uitzien als voorheen, met de code-chip erin, behalve dat aan-/uitvink-regels nu een nette zin tonen.

- [ ] **Step 6: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: logZin kan de VvE-code weglaten (voor dossier-context)"
```

---

## Task 3: `logItemHtml` gebruikt één zinnengenerator

De `subtiel`-tak van `logItemHtml` heeft nu zijn eigen, armere zinnen (`isAf ? "rondde X af" : "maakte X aan"`) naast `logZin`. Die duplicatie moet weg, anders divergeren ze.

**Files:**
- Modify: `src/render-overig.js` (functie `logItemHtml`, rond regel 270)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

`logItemHtml` is nog niet geïmporteerd in tests.js. Breid de bestaande import-regel uit:

```js
import { logZin, logPaginaSoort, parseLogboek, _shiftRows, logEditWrite, logItemHtml } from "./render-overig.js";
```

Voeg dan de exportnaam toe aan de export-regel onderaan `src/render-overig.js` (`logItemHtml` staat daar al bij — controleer dit; zo niet, voeg toe).

Nieuwe asserts in `src/tests.js`:

```js
  // ── logItemHtml: de dunne (subtiele) regel gebruikt dezelfde zinnengenerator als de volle regel ──
  truthy('logItemHtml subtiel Aangevinkt geeft nette zin', logItemHtml({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', timestamp:'2026-07-15T12:41:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:5}, true, false).includes('vinkte'));
  truthy('logItemHtml subtiel Aangevinkt is geen "maakte aan"', !logItemHtml({actie:'Aangevinkt', code:'TEST01', veld:'Notulen', timestamp:'2026-07-15T12:41:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:5}, true, false).includes('maakte'));
  truthy('logItemHtml subtiel gebruikt log-mini', logItemHtml({actie:'Afgerond', code:'TEST01', timestamp:'2026-07-15T12:41:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:5}, true, false).includes('log-mini'));
  truthy('logItemHtml subtiel Afgerond zegt nog "rondde"', logItemHtml({actie:'Afgerond', code:'TEST01', timestamp:'2026-07-15T12:41:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:5}, true, false).includes('rondde'));
  truthy('logItemHtml subtiel met acties heeft verwijderknop', logItemHtml({actie:'Afgerond', code:'TEST01', timestamp:'2026-07-15T12:41:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:5}, true, true).includes('log-verwijderen'));
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Verwacht: FAIL op "subtiel Aangevinkt geeft nette zin" — de subtiel-tak zegt nu ten onrechte "maakte TEST01 aan" voor elke niet-Afgerond actie.

- [ ] **Step 3: Herschrijf de subtiel-tak**

Vervang in `src/render-overig.js` het begin van `logItemHtml` (de hele `if(subtiel){…}`-tak) door:

```js
// Eén logregel als HTML (gedeeld door Logboek-pagina en VvE-dossier).
// subtiel=true → gedempte dunne regel voor automatische acties.
// opts.zonderCode → geef door aan logZin (dossier: code is redundant).
function logItemHtml(r,subtiel,acties,opts){
  if(subtiel){
    const kleur=r.actie==='Afgerond'?'var(--gn)':(r.actie==='Aangevinkt'||r.actie==='Uitgevinkt')?'var(--gn)':'var(--pu)';
    const acts=acties?`<span class="log-acts"><button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button></span>`:'';
    return `<div class="log-mini">
      <span class="log-mini-dot" style="background:${kleur}"></span>
      <span class="log-mini-txt">${logZin(r,opts)}</span>
      <span class="log-time">${esc(logTijd(r.timestamp))}</span>
      ${acts}
    </div>`;
  }
```

Geef in dezelfde functie `opts` ook door aan de volle regel. Vervang `<div class="log-line">${logZin(r)}</div>` door:

```js
    <div class="log-body"><div class="log-line">${logZin(r,opts)}</div>${extra}</div>
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Verwacht: 0 FAIL. Alle bestaande asserts blijven groen.

- [ ] **Step 5: Controleer de Logboek-pagina opnieuw**

Open de Logboek-pagina. De dunne grijze regels moeten er hetzelfde uitzien; aan-/uitvinken toont nu een nette zin. `logPaginaSoort` bepaalt daar nog steeds wat subtiel is — dat is niet aangeraakt.

- [ ] **Step 6: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: dunne regel gebruikt dezelfde zinnengenerator als de volle regel"
```

---

## Task 4: Lege omschrijving valt terug op de sectienaam

De regel in "Laatst afgerond" met lege taaknaam die alleen `✓ 8-5-2026` toont (klacht 4). We verzinnen geen omschrijving; we vallen terug op wat wél in de data zit.

**Files:**
- Modify: `src/render-vve.js` (nieuwe pure helper + export)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

Breid de import in `src/tests.js` uit:

```js
import { vveOverzicht, filterDossierLog, dossierFeed, afOmschrijving } from "./render-vve.js";
```

Nieuwe asserts:

```js
  // ── afOmschrijving: nooit een lege regel, nooit een verzonnen omschrijving ──
  eq('afOmschrijving neemt actiepunt',  afOmschrijving({actiepunt:'Offertes opvragen', _sec:'oppakken'}).tekst, 'Offertes opvragen');
  eq('afOmschrijving valt terug op periode', afOmschrijving({actiepunt:'', periode:'juni/juli', _sec:'oppakken'}).tekst, 'juni/juli');
  eq('afOmschrijving leeg → sectielabel', afOmschrijving({actiepunt:'', periode:'', agendapunten:'', _sec:'alv'}).leeg, true);
  truthy('afOmschrijving leeg noemt "geen omschrijving"', afOmschrijving({actiepunt:'', periode:'', agendapunten:'', _sec:'alv'}).tekst.includes('geen omschrijving'));
  eq('afOmschrijving onbekende sectie crasht niet', afOmschrijving({actiepunt:'', _sec:'bestaatniet'}).leeg, true);
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Verwacht: FAIL met "afOmschrijving is not a function" / import-fout.

- [ ] **Step 3: Implementeer de helper**

Voeg toe in `src/render-vve.js`, direct ná de functie `vveOverzicht`:

```js
// Pure helper (testbaar): omschrijving van een afgeronde regel.
// Een rij zonder tekst mag niet als kale datum in beeld komen (leest als een fout).
// We verzinnen niets: we vallen terug op het sectielabel dat wél in de data zit.
function afOmschrijving(r){
  const tekst=(r.actiepunt||r.periode||r.agendapunten||'').trim();
  if(tekst) return { tekst, leeg:false };
  const label=(SECS[r._sec]||{}).label||'Onbekende sectie';
  return { tekst:`${label} — geen omschrijving`, leeg:true };
}
```

Voeg `afOmschrijving` toe aan de export-regel onderaan `src/render-vve.js`:

```js
export { vveOverzicht, openVvePagina, renderVve, filterDossierLog, dossierFeed, addContactLog, afOmschrijving };
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Verwacht: 0 FAIL.

- [ ] **Step 5: Commit**

```bash
git add src/render-vve.js src/tests.js
git commit -m "Dossier: afgeronde regel zonder omschrijving toont sectienaam i.p.v. kale datum"
```

---

## Task 5: De + tegel

**Files:**
- Modify: `styles.css` (bij de `.kc`-regels, rond regel 607-611)
- Modify: `src/render-vve.js` (de knop in `renderVve`, regel 206)

- [ ] **Step 1: Voeg de CSS toe**

In `styles.css`, direct ná de regel `.kc.rood b{…}.kc.teal b{…}.kc.grijs b{…}` (rond 611):

```css
    /* + tegel: zelfde vorm als een kerncijfer-tegel, gevuld in het accent. Alleen het +-teken. */
    .kc-plus{background:var(--ac);border:1px solid var(--ac);border-radius:10px;box-shadow:var(--sh);color:#fff;min-width:52px;padding:8px;display:flex;align-items:center;justify-content:center;transition:background var(--tr)}
    .kc-plus:hover{background:var(--ac-900)}
    .kc-plus:focus-visible{outline:2px solid var(--ac-900);outline-offset:2px}
```

Wijzig `.kerncijfers` (regel 607) zodat de tegels even hoog worden:

```css
    .kerncijfers{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
```

- [ ] **Step 2: Vervang de knop**

In `src/render-vve.js`, vervang regel 206 (de hele `<button class="btn btn-pri btn-sm" data-action="vve-taak-nieuw" …>Nieuwe taak</button>`) door:

```js
        <button class="kc-plus" data-action="vve-taak-nieuw" data-code="${esc(o.code)}" data-naam="${esc(o.naam||'')}" title="Nieuwe taak voor deze VvE" aria-label="Nieuwe taak voor deze VvE"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
```

Verplaats deze knop in de HTML naar *binnen* `<div class="kerncijfers">`, ná de laatste `kc(...)`-aanroep, en haal de omhullende `<div class="vve-kop-rechts">` weg als die daarna alleen nog de kerncijfers bevat.

- [ ] **Step 3: Controleer in de browser**

Open `http://localhost:8899/index.html`, open een VvE-dossier (Ctrl+K → 121027). De + tegel moet even hoog zijn als de tegels ernaast, zelfde radius en rand, gevuld leiblauw, alleen een +.

Klik erop: de "nieuwe taak"-modal moet openen zoals voorheen. Tab ernaartoe: er moet een zichtbare focusrand verschijnen.

- [ ] **Step 4: Commit**

```bash
git add styles.css src/render-vve.js
git commit -m "Dossier: + knop als tegel in kerncijfer-stijl, alleen het plusteken"
```

---

## Task 6: Twee kerncijfers in plaats van vier

**Files:**
- Modify: `src/render-vve.js` (rond regel 200-205)

- [ ] **Step 1: Beperk de tegels**

In `src/render-vve.js`, vervang de vier `kc(...)`-aanroepen door twee. De labels worden enkelvoud/meervoud-correct:

```js
          ${kc(o.cijfers.open, o.cijfers.open===1?'open taak':'open taken','teal')}
          ${kc(o.cijfers.laatsteDagen==null?'—':o.cijfers.laatsteDagen+' d','laatste activiteit','grijs')}
```

De tegels voor `teLaat` en `weggelegd` vervallen hier; die informatie komt in Task 7 als voetregel terug in het werkpaneel.

- [ ] **Step 2: Controleer in de browser**

Open een dossier. Er staan nu twee tegels plus de + tegel. Bij VvE 121027: "1 open taak" en "2 d laatste activiteit".

- [ ] **Step 3: Commit**

```bash
git add src/render-vve.js
git commit -m "Dossier: kerncijfers terug naar de twee die er echt toe doen"
```

---

## Task 7: De drie panelen

Dit is de kern van de herindeling. Volg `mockups/mockup-dossier-C.html` voor de exacte opmaak — dat bestand is leidend.

**Files:**
- Modify: `styles.css` (`.vve-grid` rond regel 612-623)
- Modify: `src/render-vve.js` (de `wrap.innerHTML=` in `renderVve`, regel 192-251)

- [ ] **Step 1: Vervang de grid-CSS**

In `styles.css`, vervang `.vve-grid` (regel 612) en de bijbehorende media-query (regel 613) door:

```css
    /* Dossier = schermvullend: kop vast, drie panelen vullen de rest en scrollen elk apart. */
    #page-vve.active{display:flex;flex-direction:column;height:100%}
    .vve-kop{flex-shrink:0}
    .vve-grid{display:grid;grid-template-columns:300px 330px 1fr;gap:16px;align-items:stretch;flex:1;min-height:380px}
    .vve-paneel{background:var(--sur);border:1px solid var(--bor);border-radius:var(--r);box-shadow:var(--sh);padding:13px 15px;display:flex;flex-direction:column;min-height:0;overflow-y:auto}
    .vve-paneel.tl-paneel{overflow:hidden}
    .tl-scroll{overflow-y:auto;min-height:0;flex:1;margin-right:-5px;padding-right:5px}
    /* Onder 1240px zijn drie kolommen niet vol te houden: terugval op twee met de
       tijdlijn eronder over de volle breedte, en de pagina scrollt weer normaal. */
    @media(max-width:1240px){
      #page-vve.active{height:auto}
      .vve-grid{grid-template-columns:1fr 1fr;min-height:0}
      .vve-paneel{overflow:visible}
      .vve-paneel.tl-paneel{overflow:visible;grid-column:1/-1}
      .tl-scroll{overflow:visible}
    }
    @media(max-width:900px){.vve-grid{grid-template-columns:1fr}}
```

- [ ] **Step 2: Herbouw de pagina-opbouw**

In `src/render-vve.js`, vervang de `wrap.innerHTML=`-template. De kop blijft zoals na Task 5 en 6. De grid wordt:

```js
    <div class="vve-grid">

      <div class="vve-paneel">
        <div class="vve-sectie">ALV</div>
        ${alvKaart()}
        <div class="vve-sectie" style="margin-top:20px">Beheerderskenmerken
          ${state.kenmerkenEdit?'':`<button class="btn btn-sec btn-sm" data-action="kenmerken-bewerken" style="margin-left:auto">${ico('potlood',12)} Bewerken</button>`}
        </div>
        ${kenmerkenKaart(code)}
      </div>

      <div class="vve-paneel">
        <div class="vve-sectie">Open taken <span class="n">${o.open.length}</span></div>
        ${o.open.map(r=>taakRij(r,false)).join('')||`<div class="tk-leeg">Geen open taken ${ico('feest',14).replace('<svg ','<svg style="vertical-align:-2.5px" ')}</div>`}
        ${o.weggelegd.length?`<div class="vve-sectie" style="margin-top:20px">Weggelegd <span class="n">${o.weggelegd.length}</span></div>
        ${o.weggelegd.map(r=>taakRij(r,true)).join('')}`:''}
        <div class="vve-sectie" style="margin-top:20px">Laatst afgerond <span class="n">${o.afgerond.length}</span></div>
        ${o.afgerond.slice(0,afLimiet).map(afRij).join('')||'<div class="tk-leeg">Nog niets afgerond</div>'}
        ${meerKnop}
        <div class="vve-voet">${o.cijfers.teLaat} te laat · ${o.cijfers.weggelegd} weggelegd</div>
      </div>

      <div class="vve-paneel tl-paneel">
        <div class="vve-sectie">Geschiedenis <span class="n">${o.logboek.length}</span>
          <span class="dos-filters">
            <button class="dos-filter${state.vveLogFilter!=='contact'?' aan':''}" data-action="vve-log-filter" data-modus="alles">Alles</button>
            <button class="dos-filter${state.vveLogFilter==='contact'?' aan':''}" data-action="vve-log-filter" data-modus="contact">Alleen contactmomenten</button>
          </span>
        </div>
        <div class="dos-composer">
          <textarea id="dos-tekst" data-code="${esc(o.code)}" rows="2" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
          <div class="dos-rij">
            <div class="dos-chips">${CONTACT_SOORTEN.map(([s,sIco])=>
              `<button class="soort-chip${(state._contactSoort||'Telefoon')===s?' aan':''}" data-action="contact-soort" data-soort="${s}">${sIco} ${s}</button>`).join('')}</div>
            <select id="dos-wie" title="Met wie was het contact?">
              <option>Bewoner/eigenaar</option><option>Bestuur</option><option>Leverancier</option><option>Overig</option>
            </select>
            <button class="btn btn-pri btn-sm" data-action="contact-vastleggen">Vastleggen</button>
          </div>
        </div>
        <div class="tl-scroll">${dossierFeed(dosEntries.slice(0,dosLimiet))}${dosMeer}</div>
      </div>

    </div>`;
```

De composer staat hier nog uitgeklapt, letterlijk zoals nu; Task 8 vervangt dit blok door `composerHtml(o.code)`. Zo werkt deze taak op zichzelf.

`taakRij` en `afRij` gaan van `<tr>/<td>` naar platte `div`s — dat haalt de loze ruimte weg die de vierkolomstabel veroorzaakte:

```js
  const taakRij=(r,weg)=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const sec=r._sec, p=berekenPrioriteit(r.deadline,sec);
    const meta=SECS[sec]||{css:'',label:(sec||'?')}; // vangnet: één rij zonder geldige sectie mag niet de hele dossierpagina blanco maken
    const dl=weg
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}">terug op ${esc(r.opvolgdatum)}</span>`
      : r.deadline
        ? `${esc(r.deadline)}${p.teLaat?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}`
        : '<span class="warn-geen-deadline">Geen deadline</span>';
    return `<div class="tk${weg?' snooze-row':''}" data-action="taak-bewerken" data-rid="${rid}" style="cursor:pointer">
      <span class="nm">${esc(r.actiepunt||r.periode||r.agendapunten||r.status||'')}
        <span class="mt">${esc(meta.label)}${r.behandelaar?' · '+esc(r.behandelaar):''}</span></span>
      <span class="dl">${dl}</span></div>`;
  };
  const afRij=r=>{
    const om=afOmschrijving(r);
    return `<div class="tk">
      <span class="nm${om.leeg?' geen-oms':''}">${esc(om.tekst)}${r.opmerking?`<span class="mt">${esc(r.opmerking)}</span>`:''}</span>
      <span class="dl af">${esc(r.datum||'')}</span></div>`;
  };
```

Pas de `meerKnop` aan (was een `<tr>`):

```js
  const meerKnop=(!state._vveAfAlles&&o.afgerond.length>5)
    ?`<button class="btn btn-sec btn-sm" data-action="vve-af-alles" style="margin-top:8px;align-self:flex-start">Alle ${o.afgerond.length} tonen</button>`:'';
```

Pas `alvKaart()` en `kenmerkenKaart()` aan: die zaten in een `<div class="vve-kaart">`; die omhulling vervalt want het paneel ís nu de kaart. Haal de `<div class="vve-kaart">`-wrappers uit de template (niet uit de functies — die geven al kale inhoud terug).

- [ ] **Step 3: Voeg de rij-CSS toe**

In `styles.css`, bij de dossier-regels (rond 620-640):

```css
    .tk{display:flex;align-items:baseline;gap:10px;padding:8px 0;border-bottom:1px solid var(--row-divider);font-size:13px}
    .tk:last-of-type{border-bottom:none}
    .tk .nm{flex:1;min-width:0}
    .tk .nm .mt{display:block;font-size:11px;color:var(--fnt);margin-top:2px}
    .tk .dl{font-family:'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace;font-size:11.5px;color:var(--mut);flex-shrink:0}
    .tk .dl.af{color:var(--gn)}
    .tk-leeg{padding:10px 0;color:var(--fnt);font-size:12.5px}
    .geen-oms{color:var(--fnt);font-style:italic}
    .vve-voet{font-size:12px;color:var(--fnt);border-top:1px solid var(--row-divider);padding-top:8px;margin-top:auto}
```

- [ ] **Step 4: Draai de tests**

Verwacht: 0 FAIL. `dossierFeed` en `vveOverzicht` zijn niet aangeraakt, dus die asserts blijven groen.

- [ ] **Step 5: Controleer in de browser, op drie breedtes**

Open een dossier op 1420×980. Verwacht: drie panelen naast elkaar, **geen paginascroll**. Controleer met:

```js
const c=document.getElementById('content'); c.scrollHeight <= c.clientHeight  // → true
```

Verklein naar 1366×768: nog steeds drie kolommen, nog steeds geen paginascroll.
Verklein naar 1100px: twee kolommen met de tijdlijn eronder, pagina scrollt normaal.
Verklein naar 700px: één kolom.

Klik een taakrij aan: de bewerk-modal moet openen (de `data-rid`/`_rowCache`-koppeling is ongewijzigd).

- [ ] **Step 6: Commit**

```bash
git add styles.css src/render-vve.js
git commit -m "Dossier: drie panelen naast elkaar, schermvullend, elk eigen scroll"
```

---

## Task 8: Ingeklapte composer

De invoerbalk pakt nu altijd ruimte, ook als je niets wilt vastleggen.

**Let op — bestaande logica die stuk kan:** `renderVve()` bewaart half getypte tekst omdat de 8s-poll de pagina re-rendert (zie de `_bewaar`-code onderaan `renderVve`). De open/dicht-stand moet dáárom in `state`, niet alleen in de DOM — anders klapt de composer tijdens het typen dicht.

**Files:**
- Modify: `src/render-vve.js` (nieuwe `composerHtml`, `openVvePagina`, `renderVve`)
- Modify: `src/actions.js` (nieuwe actie)
- Modify: `styles.css`

- [ ] **Step 1: Voeg de state-vlag toe**

In `src/render-vve.js`, in `openVvePagina`, bij de andere resets:

```js
  state.dosComposerOpen=false;
```

- [ ] **Step 2: Schrijf `composerHtml` en gebruik hem**

Voeg toe in `src/render-vve.js`, vóór `renderVve`, en vervang daarna in de template van Task 7 het hele `<div class="dos-composer">…</div>`-blok door `${composerHtml(o.code)}`:

```js
// Composer: standaard ingeklapt tot één regel; opent bij klik en blijft open zolang er tekst staat.
function composerHtml(code){
  if(!state.dosComposerOpen){
    return `<div class="comp-dicht" data-action="composer-openen">
      Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar…
      <span class="btn btn-pri btn-sm">Vastleggen</span>
    </div>`;
  }
  return `<div class="dos-composer">
    <textarea id="dos-tekst" data-code="${esc(code)}" rows="2" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
    <div class="dos-rij">
      <div class="dos-chips">${CONTACT_SOORTEN.map(([s,sIco])=>
        `<button class="soort-chip${(state._contactSoort||'Telefoon')===s?' aan':''}" data-action="contact-soort" data-soort="${s}">${sIco} ${s}</button>`).join('')}</div>
      <select id="dos-wie" title="Met wie was het contact?">
        <option>Bewoner/eigenaar</option><option>Bestuur</option><option>Leverancier</option><option>Overig</option>
      </select>
      <button class="btn btn-pri btn-sm" data-action="contact-vastleggen">Vastleggen</button>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Bescherm het composer-behoud**

Onderaan `renderVve` staat de `_bewaar`-logica. Zorg dat de composer open blijft als er tekst in stond — vervang het `_bewaar`-blok bovenaan `renderVve` door:

```js
  const _oudT=document.getElementById('dos-tekst');
  const _bewaar=(_oudT&&_oudT.dataset.code===code)?{tekst:_oudT.value,wie:document.getElementById('dos-wie')?.value}:null;
  // Half getypte tekst mag de 8s-poll overleven én de composer niet dichtklappen.
  if(_bewaar&&_bewaar.tekst.trim()) state.dosComposerOpen=true;
```

- [ ] **Step 4: Registreer de actie**

In `src/actions.js`, voeg toe bij de andere dossier-acties:

```js
  'composer-openen': ()=>{ state.dosComposerOpen=true; renderVve();
    setTimeout(()=>document.getElementById('dos-tekst')?.focus(),0); },
```

Zorg dat `state` en `renderVve` daar geïmporteerd zijn (controleer de bestaande imports bovenaan `actions.js`; `renderVve` wordt daar mogelijk al gebruikt voor `vve-log-filter`).

- [ ] **Step 5: Voeg de CSS toe**

In `styles.css`, bij de `.dos-`-regels (rond 643):

```css
    .comp-dicht{display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px dashed var(--bor-input);border-radius:var(--rs);color:var(--fnt);font-size:12.5px;cursor:text;background:var(--sur2);margin-bottom:10px;flex-shrink:0}
    .comp-dicht:hover{border-color:var(--ac-b);color:var(--mut)}
    .comp-dicht .btn{margin-left:auto;flex-shrink:0}
    .dos-composer{flex-shrink:0}
```

- [ ] **Step 6: Controleer in de browser**

Open een dossier. De composer is één regel. Klik erin → hij klapt open en de cursor staat in het tekstvak. Typ tekst en wacht 10 seconden (de poll draait): de tekst moet er nog staan en de composer moet open blijven. Leg een contactmoment vast: het verschijnt in de tijdlijn.

- [ ] **Step 7: Draai de tests**

Verwacht: 0 FAIL.

- [ ] **Step 8: Commit**

```bash
git add src/render-vve.js src/actions.js styles.css
git commit -m "Dossier: invoerbalk ingeklapt tot hij nodig is"
```

---

## Task 9: Gedempte tijdlijn in het dossier

`dossierFeed` rendert nu álles als volwaardige regel. Automatische acties worden gedempt en de code-chip gaat eruit.

**Files:**
- Modify: `src/render-vve.js` (functie `dossierFeed`)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende tests**

De bestaande `dossierFeed`-asserts staan rond tests.js:330. Voeg toe:

```js
  // ── dossierFeed: eigen notities blijven vol, automatische regels worden gedempt ──
  const _dosMix=[
    {actie:'Contact', code:'TST', veld:'Telefoon', oudeWaarde:'Bestuur', nieuweWaarde:'Gebeld over de ALV', timestamp:'2026-07-15T10:24:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:2},
    {actie:'Aangevinkt', code:'TST', veld:'Notulen', timestamp:'2026-07-15T09:00:00Z', gebruiker:'info@vvebeheercollectief.nl', _row:3},
  ];
  truthy('dossierFeed: contact is een volle regel', dossierFeed(_dosMix).includes('log-item'));
  truthy('dossierFeed: aangevinkt is een dunne regel', dossierFeed(_dosMix).includes('log-mini'));
  truthy('dossierFeed: aangevinkt toont nette zin', dossierFeed(_dosMix).includes('vinkte'));
  truthy('dossierFeed: code-chip is weg in het dossier', !dossierFeed(_dosMix).includes('data-action="vve-open"'));
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Verwacht: FAIL op "aangevinkt is een dunne regel" en op "code-chip is weg".

- [ ] **Step 3: Pas `dossierFeed` aan**

Vervang in `src/render-vve.js`:

```js
function dossierFeed(entries){
  if(!entries.length) return '<div class="log-empty">Nog geen gebeurtenissen in dit dossier.</div>';
  let html='',lastDay='';
  entries.forEach(r=>{
    const dag=logDayLabel(r.timestamp);
    if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
    // Eigen notities/contactmomenten blijven volwaardig en bewerkbaar. Alles wat de app
    // zelf logt wordt een gedempte dunne regel — wel per stuk verwijderbaar, want ze
    // samenvatten zou dat onmogelijk maken.
    const eigen=logPaginaSoort(r.actie)==='normaal';
    html+=logItemHtml(r, !eigen, true, {zonderCode:true});
  });
  return html;
}
```

- [ ] **Step 4: Draai de tests en zie ze slagen**

Verwacht: 0 FAIL.

- [ ] **Step 5: Controleer in de browser**

Open dossier 121027. De "Aangevinkt"-regels zijn nu dunne grijze regels met een stipje en een nette zin, zonder de code 121027. Je eigen notities/contactmomenten staan er nog vol met avatar en soort.

Hover over een dunne regel → prullenbak verschijnt, verwijderen werkt. Hover over een eigen notitie → potlood én prullenbak, bewerken werkt.

- [ ] **Step 6: Commit**

```bash
git add src/render-vve.js src/tests.js
git commit -m "Dossier: automatische logregels gedempt, eigen notities blijven vol"
```

---

## Task 10: Versie ophogen en volledige controle

**Files:**
- Modify: `src/config.js:8`
- Modify: `sw.js:4`

- [ ] **Step 1: Hoog de versies op**

In `src/config.js` regel 8:

```js
export const APP_VERSION = '7.1';
```

In `sw.js` regel 4:

```js
const CACHE_VERSION = 'cd-v66';
```

- [ ] **Step 2: Draai de volledige testsuite**

Open `http://localhost:8899/index.html?test=1` en lees `window._testResult`.
Verwacht: `0 FAIL`, en het totaal aantal OK ligt boven de 357 (er zijn ~24 asserts bijgekomen).

- [ ] **Step 3: Loop de handmatige controle af**

- [ ] Dossier op 1420×980: drie panelen, geen paginascroll
- [ ] Dossier op 1366×768: idem
- [ ] Dossier op 1100px: twee kolommen, tijdlijn eronder
- [ ] Dossier op 700px: één kolom
- [ ] + tegel: zelfde hoogte als de kerncijfers, opent de taak-modal, heeft een focusrand
- [ ] Taakrij aanklikken → bewerk-modal
- [ ] Logregel bewerken en verwijderen (beide soorten regels)
- [ ] Composer: klikken opent, tekst overleeft de 8s-poll, vastleggen werkt
- [ ] Kenmerken bewerken en opslaan
- [ ] **Logboek-pagina op regressie**: ziet er hetzelfde uit, mét code-chips
- [ ] Donker thema: panelen, + tegel en dunne regels kloppen
- [ ] Een VvE met véél taken en logregels: panelen scrollen intern, kop blijft staan

- [ ] **Step 4: Commit**

```bash
git add src/config.js sw.js
git commit -m "Versie 7.1 / cd-v66: dossier instant overzicht"
```

---

## Task 11: Naar productie

**Let op:** volgens de deploy-notitie is de echte prod-URL `github.io/Collectief-Dashboard/` (de kale root geeft 404). Apps Script deployt automatisch via de CI-Action; hier verandert niets aan Apps Script, dus dat speelt niet.

**Let op:** volgens de merge-notitie mag `staging` niet kaal naar `main` — die tak bevat divergent, niet-goedgekeurd werk. Deze tak (`dossier-instant-overzicht`) is vanaf `main` gemaakt en is dus wél veilig te mergen.

- [ ] **Step 1: Vraag de gebruiker om akkoord**

Laat het resultaat zien (schermafbeelding van het nieuwe dossier) en vraag of het live mag. Niet zelf besluiten.

- [ ] **Step 2: Merge naar main en push**

```bash
git checkout main
git merge --ff-only dossier-instant-overzicht
git push origin main
```

- [ ] **Step 3: Controleer op productie**

Open `https://<gebruiker>.github.io/Collectief-Dashboard/` na ~1 minuut. Hard-refresh (de SW cachet). Controleer dat de versiebalk 7.1 toont en dat het dossier de drie panelen heeft.
