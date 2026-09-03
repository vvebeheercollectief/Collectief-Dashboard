# Vier updates — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het logboek toont alleen nog wat iemand geschreven heeft, afronden vraagt verplicht om een opmerking, de offerte-rij verdeelt zijn ruimte opnieuw, en taken van één VvE kunnen met één schakelaar bij elkaar gezet worden.

**Architecture:** Statische PWA zonder bundler — `index.html` + `styles.css` + ES-modules in `src/`. Alle wijzigingen zijn frontend; er komt geen Sheet-kolom bij en de Apps Script blijft ongemoeid. Het logboek wordt op de *weergave* gefilterd (`logPaginaSoort`), nooit bij het schrijven, omdat dezelfde regels het activiteitsbewijs zijn voor de stille-takenklok en de nachtelijke escalatiemotor.

**Tech Stack:** Vanilla ES-modules, Google Sheets API v4, geen build-stap, geen node op deze machine.

**Spec:** `docs/superpowers/specs/2026-09-03-vier-updates-design.md`

## Global Constraints

- **Rij-identiteit loopt altijd via `src/rij.js`** (`rijIndex`/`verseRij` op taaknummer). Nooit `arr.indexOf(object)` in een mutatiepad — `loadAll` vervangt elk rij-object bij iedere geslaagde poll. Drie broncode-toetsen bewaken dit (`vormcontrole:` tests.js:532-552, `rij-acties:` 578-614, `poort:` 628).
- **Geen nieuwe Sheet-kolom.** Het raster van 'Nog Te Doen' is vol op **S** (19 kolommen).
- **`LOG_VERBORGEN` (render-overig.js:238) blijft `new Set(['Bewerkt'])`.** Die set zit in `parseLogboek` en werkt door in álle consumenten, inclusief `bepaalStil`. Weergavefilters horen in `logPaginaSoort`, nooit daar.
- **Er verandert niets aan `bepaalStil`, `bouwStilIndex`, `urgentie.js` of `apps-script/`.**
- **Nederlands** in code-commentaar, UI-teksten, commit-berichten en testlabels.
- **Poortvolgorde in elke schrijfweg:** `blokkeerOffline()` → `ensureToken()` → dubbelklik-rem → validatie van invoer → schrijven.
- **Versie:** aan het eind `APP_VERSION = '12.8'` in `src/config.js:8` **én** `sw.js:32`, en `CACHE_VERSION = 'cd-v155'` in `sw.js:25`. Alle drie, anders blijft de service worker byte-identiek.
- **Syntaxpoort:** `osascript -l JavaScript tools/syntaxcheck.js` — er is geen node; dit draait op JavaScriptCore.
- **Toetsen:** `python3 tools/toetsen.py`. Baseline vóór dit plan: **2822 OK, 0 FAIL**.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid in dit plan |
|---|---|
| `src/render-overig.js` | `logPaginaSoort`, nieuwe `afrondOpmerking` + `logBewerkbaar`, `logItemHtml`-notitie­tak, `renderLogboek`-filterketen |
| `src/render-vve.js` | `filterDossierLog` met drie standen, `dossierFeed`, de knoppenbalk erboven |
| `src/crud.js` | `afrondLogRegel`, verplichte opmerking in `doCompleteTask`, logregel binnen de idempotentie-vlag |
| `src/bulk.js` | Bulk-afronden met één gedeelde opmerking in één venster |
| `src/config.js` | `AFROND_SNELKEUZES`, kolommen/breedtes/koppen van Offerte- en Subsidie-trajecten, `APP_VERSION` |
| `src/render-tabel.js` | Korte datum op Offerte, offerte-cel, `renderTbody` met VvE-groepskoppen, `rowAf`-opmerkingcel |
| `src/render-offerte.js` | Aannemers-toggle zonder zichtbaar label |
| `src/render-lijsten.js` | `groepeerPerVve`, aanroep in `renderNtd` |
| `src/dossier-chat.js`, `src/ai.js` | Tweedeling in de AI-context |
| `src/util.js` | `_afZoekvelden`: `toelichting` → `opmerking` |
| `index.html` | Chips, afrondvenster, bulk-venster, schakelaar 'Per VvE', dossier-knoppen |
| `styles.css` | `.grp-vve`, focusring offerte-cel, `.tk .nm .mt` afkapping, dichtheid op groepskoppen |
| `src/state.js`, `src/main.js`, `src/actions.js` | Stand `ntdPerVve`, bedrading van de nieuwe knoppen |
| `src/tests.js` | Alle toetsen |
| `tools/toetsen.py` | Testrunner (al gebouwd, alleen committen) |

---

### Task 0: Testrunner vastleggen

**Files:**
- Create: `tools/toetsen.py` (bestaat al in de werkboom)

**Interfaces:**
- Consumes: niets
- Produces: `python3 tools/toetsen.py` → stdout `"<N> OK, <M> FAIL"`, exitcode 0 bij 0 FAIL

- [ ] **Stap 1: Draai de syntaxpoort**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```
Verwacht: `✓ alle 58 bestanden parseren en zijn van vorm in orde`

- [ ] **Stap 2: Meet de baseline**

```bash
python3 tools/toetsen.py
```
Verwacht: `2822 OK, 0 FAIL`

- [ ] **Stap 3: Commit**

```bash
git add tools/toetsen.py
git commit -m "Testrunner: zelftest draaien via headless Chrome zonder node

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: `afrondOpmerking` en `logBewerkbaar` — de twee nieuwe poorten

**Files:**
- Modify: `src/render-overig.js` (naast `logPaginaSoort`, r.372)
- Test: `src/tests.js` (in het bestaande logboek-blok, na r.245)

**Interfaces:**
- Produces: `afrondOpmerking(r) → string` en `logBewerkbaar(r) → boolean`, beide geëxporteerd uit `render-overig.js`. Task 2, 4 en 5 gebruiken ze.

- [ ] **Stap 1: Schrijf de falende toetsen**

Voeg toe in `src/tests.js`, direct ná de bestaande `logPaginaSoort`-regels (r.245):

```js
  // ── afrondOpmerking ── (twee vormen naast elkaar, want er wordt niet gemigreerd)
  const _afrNieuw = {actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op 03-09-2026', nieuweWaarde:'Dak hersteld'};
  const _afrNieuwLeeg = {actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op 03-09-2026', nieuweWaarde:''};
  const _afrOud  = {actie:'Afgerond', veld:'status', oudeWaarde:'Nog Te Doen', nieuweWaarde:'Afgerond op 03-09-2026 — gebeld met bestuur'};
  const _afrOudKaal = {actie:'Afgerond', veld:'status', oudeWaarde:'Nog Te Doen', nieuweWaarde:'Afgerond op 03-09-2026'};
  const _afrBulk = {actie:'Afgerond', veld:'status', oudeWaarde:'Nog Te Doen', nieuweWaarde:'Afgerond op 14-08-2026 (bulk)'};
  const _afrJuli = {actie:'Afgerond', veld:'status', oudeWaarde:'Nog Te Doen', nieuweWaarde:'Afgerond op 1 juli'};
  eq('afrondOpmerking nieuwe vorm leest kolom G', afrondOpmerking(_afrNieuw), 'Dak hersteld');
  eq('afrondOpmerking nieuwe vorm zonder tekst is leeg', afrondOpmerking(_afrNieuwLeeg), '');
  eq('afrondOpmerking oude vorm splitst op de gedachtestreep', afrondOpmerking(_afrOud), 'gebeld met bestuur');
  eq('afrondOpmerking oude vorm zonder toelichting is leeg', afrondOpmerking(_afrOudKaal), '');
  eq('afrondOpmerking oude bulkregel geeft niet "(bulk)"', afrondOpmerking(_afrBulk), '');
  eq('afrondOpmerking "Afgerond op 1 juli" geeft niets', afrondOpmerking(_afrJuli), '');
  eq('afrondOpmerking op een andere actie is leeg', afrondOpmerking({actie:'Opmerking', nieuweWaarde:'x'}), '');
  eq('afrondOpmerking op niets is leeg', afrondOpmerking(null), '');

  // ── logBewerkbaar ── (zichtbaar ≠ bewerkbaar: kolom J van 'Afgerond' draagt dezelfde tekst)
  truthy('logBewerkbaar Opmerking', logBewerkbaar({actie:'Opmerking'}));
  truthy('logBewerkbaar Contact', logBewerkbaar({actie:'Contact'}));
  eq('logBewerkbaar Afgerond-met-opmerking is onwaar', logBewerkbaar(_afrNieuw), false);
  eq('logBewerkbaar Teruggezet is onwaar', logBewerkbaar({actie:'Teruggezet'}), false);
```

Voeg `afrondOpmerking` en `logBewerkbaar` toe aan de bestaande import van `render-overig.js` bovenaan `src/tests.js`.

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: de suite geeft **geen** uitslag, of `ReferenceError: afrondOpmerking is not defined` — de import faalt. Dat is de juiste falende staat.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/render-overig.js`, vlak vóór `logPaginaSoort` (r.372):

```js
// De opmerking uit een 'Afgerond'-logregel, of '' als er geen is.
//
// TWEE VORMEN, want er wordt niets gemigreerd:
//   nieuw (v12.8+): F = 'Afgerond op <datum>'   G = alleen de opmerking
//   oud            : F = 'Nog Te Doen'          G = 'Afgerond op <datum>[ — opmerking]'
// Bewust GEEN datum-regex om de oude vorm te strippen: 'Afgerond op 14-08-2026 (bulk)' en
// 'Afgerond op 1 juli' zouden daar allebei doorheen glippen en als notitie op het scherm komen.
// De ' — '-splitsing is precies wat crud.js tot v12.7 schreef, dus die is exact.
export function afrondOpmerking(r){
  if(!r || (r.actie||'').trim()!=='Afgerond') return '';
  if(/^Afgerond op\b/.test((r.oudeWaarde||'').trim())) return (r.nieuweWaarde||'').trim();
  const t=(r.nieuweWaarde||'').trim(), i=t.indexOf(' — ');
  return i<0 ? '' : t.slice(i+3).trim();
}

// Mag deze logregel bewerkt worden? Losgekoppeld van 'is hij zichtbaar', want een
// 'Afgerond'-regel met opmerking wordt straks wél volwaardig getoond maar mag GEEN potlood
// krijgen: `logEditWrite` schrijft voor niet-Contact alleen kolom G, terwijl diezelfde tekst
// óók in kolom J van 'Afgerond' staat. Bewerken van alleen de logregel laat die twee stil
// uit de pas lopen.
export function logBewerkbaar(r){
  const a=((r&&r.actie)||'').trim();
  return a==='Opmerking'||a==='Contact';
}
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: `2834 OK, 0 FAIL` (12 nieuwe asserts).

- [ ] **Stap 5: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: afrondOpmerking en logBewerkbaar als aparte poorten

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `logPaginaSoort` wordt een regel-functie

**Files:**
- Modify: `src/render-overig.js:372-380` (`logPaginaSoort`), `:385-410` (`logItemHtml`), `:694` en `:724` (`renderLogboek`)
- Modify: `src/render-vve.js:92` (`dossierFeed`)
- Test: `src/tests.js:242-245`, `:386-390`, `:5653`

**Interfaces:**
- Consumes: `afrondOpmerking`, `logBewerkbaar` uit Task 1
- Produces: `logPaginaSoort(r|actie) → 'normaal'|'subtiel'|null` — accepteert zowel een regel-object als (terugval) een kale actienaam

- [ ] **Stap 1: Pas de bestaande toetsen aan en schrijf de nieuwe**

Vervang in `src/tests.js` de blokken op r.242-245 en r.386-390 door:

```js
  // ── logPaginaSoort ── (allowlist: alleen wat een MENS geschreven heeft komt op het scherm.
  //    'Afgerond' telt alleen mee als er een opmerking bij staat; 'Teruggezet' hoort erbij omdat
  //    anders een ingetrokken afronding prominent blijft staan zonder dat de intrekking te zien is.)
  eq('logPaginaSoort Opmerking → normaal', logPaginaSoort({actie:'Opmerking'}), 'normaal');
  eq('logPaginaSoort Contact → normaal',   logPaginaSoort({actie:'Contact'}),   'normaal');
  eq('logPaginaSoort Teruggezet → normaal', logPaginaSoort({actie:'Teruggezet'}), 'normaal');
  eq('logPaginaSoort Afgerond MÉT opmerking → normaal', logPaginaSoort(_afrNieuw), 'normaal');
  eq('logPaginaSoort Afgerond ZONDER opmerking → null', logPaginaSoort(_afrNieuwLeeg), null);
  eq('logPaginaSoort Aangemaakt → null', logPaginaSoort({actie:'Aangemaakt'}), null);
  eq('logPaginaSoort "Aangemaakt (sheet)" → null', logPaginaSoort({actie:'Aangemaakt (sheet)'}), null);
  eq('logPaginaSoort "Fase gewijzigd" → null', logPaginaSoort({actie:'Fase gewijzigd'}), null);
  eq('logPaginaSoort Bewerkt → null', logPaginaSoort({actie:'Bewerkt'}), null);
  eq('logPaginaSoort Verwijderd → null', logPaginaSoort({actie:'Verwijderd'}), null);
  eq('logPaginaSoort Aangevinkt → null', logPaginaSoort({actie:'Aangevinkt'}), null);
  eq('logPaginaSoort Weggelegd → null', logPaginaSoort({actie:'Weggelegd'}), null);
  eq('logPaginaSoort Kenmerk → null', logPaginaSoort({actie:'Kenmerk'}), null);
  eq('logPaginaSoort leeg → null', logPaginaSoort({actie:''}), null);
  // TERUGVALTAK. Een gemiste aanroeper met een kale string zou anders '' zien en dus null geven —
  // die regel verdwijnt dan zonder foutmelding van het scherm. Deze tak vangt dat af.
  eq('logPaginaSoort accepteert nog steeds een string', logPaginaSoort('Opmerking'), 'normaal');
  eq('logPaginaSoort string Afgerond → null (geen regel om in te kijken)', logPaginaSoort('Afgerond'), null);
```

Pas r.5653 aan: `eq('fasewijziging staat niet meer op de logboekpagina', logPaginaSoort({actie:'Fase gewijzigd'}), null);`

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: minimaal 8 FAIL-regels op `logPaginaSoort …`.

- [ ] **Stap 3: Schrijf de implementatie**

Vervang `logPaginaSoort` in `src/render-overig.js:372-380`:

```js
// Bepaalt of een logregel op het scherm thuishoort (Logboek-pagina én VvE-dossier), en zo ja
// hoe prominent. ALLOWLIST, geen denylist: Apps Script schrijft ook 'Terugkerende taak
// klaargezet' (Opvolging.gs), 'Aangemaakt via mail-intake' (Notifications.gs) en
// 'Auto-prioriteit' (AutoPrioriteit.gs), en met een denylist glipt elk nieuw actietype er stil
// doorheen.
//
// Neemt de hele REGEL, niet alleen de actienaam: "een afronding is zichtbaar als er een
// opmerking bij staat" is niet uit de naam af te leiden. De string-tak blijft bestaan als
// vangnet — zonder die tak zou een gemiste aanroeper stil null teruggeven en de regel
// onzichtbaar maken.
//
// 'subtiel' komt in productie niet meer voor, maar blijft in het contract: beide renderers
// berekenen `subtiel = logPaginaSoort(r) !== 'normaal'`, zodat een regel die er onverhoopt
// tóch doorheen komt als dunne regel binnenkomt en niet als volle regel met avatar.
export function logPaginaSoort(r){
  const a=(typeof r==='string' ? r : ((r&&r.actie)||'')).trim();
  if(a==='Opmerking'||a==='Contact'||a==='Teruggezet') return 'normaal';
  // 'Teruggezet' hoort erbij: undo van een afronding verwijdert de 'Afgerond'-regel NIET
  // (notifications.js:280, bulk.js:435). Zonder deze regel beweert de tijdlijn prominent dat
  // een taak is afgerond terwijl hij weer gewoon open staat.
  if(a==='Afgerond' && afrondOpmerking(r)) return 'normaal';
  return null;
}
```

In `logItemHtml` (r.385): vervang `const magActies=!!acties&&r._row>0;` door twee regels en pas de notitietak aan:

```js
  const magActies=!!acties&&r._row>0;
  const magBewerken=magActies&&logBewerkbaar(r);
```

Vervang `if(magActies && state.logEdit===r._row) return logEditForm(r);` door `if(magBewerken && state.logEdit===r._row) return logEditForm(r);`

Vervang de notitietak:

```js
  if((r.actie==='Opmerking'||r.actie==='Contact') && r.nieuweWaarde){
    extra=`<div class="log-note">${opmaakHtml(r.nieuweWaarde)}</div>`;
  } else {
    // De afrondopmerking komt uit een KALE textarea zonder opmaakbalk (index.html #complete-comment).
    // `opmaakHtml` zou daar `**vet**`, `_schuin_` en '- ' als opsomming overheen laten lopen:
    // "kosten *inclusief* btw" verliest zijn sterretjes. Dus esc() + pre-wrap, precies zoals
    // render-vve.js dezelfde cel al toont.
    const afr=afrondOpmerking(r);
    if(afr) extra=`<div class="log-note log-note-plat">${esc(afr)}</div>`;
  }
```

Vervang in de volle-regel `acts`-opbouw de potloodknop door een voorwaardelijke:

```js
  const acts=magActies?`<span class="log-acts">
    ${magBewerken?`<button class="log-act-btn" data-action="log-bewerken" data-row="${r._row}" title="Bewerken" aria-label="Regel bewerken">${ico('potlood')}</button>`:''}
    <button class="log-act-btn del" data-action="log-verwijderen" data-row="${r._row}" title="Verwijderen" aria-label="Regel verwijderen">${ico('prullenbak')}</button>
  </span>`:'';
```

In `src/render-vve.js:92`: vervang `const eigen=logPaginaSoort(r.actie)==='normaal';` door `const eigen=logPaginaSoort(r)==='normaal';`

In `src/render-overig.js:694` en `:724`: vervang `logPaginaSoort(r.actie)` door `logPaginaSoort(r)`.

Voeg in `styles.css`, naast de bestaande `.log-note`-regel, toe:

```css
    .log-note-plat{white-space:pre-wrap}
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL. Toetsen op r.870, r.883/884/894 kunnen nu falen — die horen bij Task 3; als ze rood zijn, gaat Task 3 er meteen achteraan.

- [ ] **Stap 5: Commit**

```bash
git add src/render-overig.js src/render-vve.js styles.css src/tests.js
git commit -m "Logboek: alleen nog tonen wat iemand geschreven heeft

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: De Logboek-pagina — chips, zoeken en de bewerkstand

**Files:**
- Modify: `index.html:344-345` (chips), `src/render-overig.js:693-702` (filterketen), `:664` (bewerkstand-guard)
- Test: `src/tests.js`

**Interfaces:**
- Consumes: `logPaginaSoort(r)`, `logBewerkbaar(r)`
- Produces: geen nieuwe exports

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── Logboek-pagina: zoeken doorbreekt de zichtbaarheidspoort ──
  // De zoekbalk belooft "Zoek op VvE, woord of naam…" over het hele logboek. Filtert de poort
  // vóór de zoekterm, dan geeft zoeken op een taaknaam uit een 'Aangemaakt'-regel nul treffers
  // zonder uitleg. Zoeken is een expliciete daad; opruimen mag dat niet stiekem inperken.
  eq('logRegelZichtbaar zonder zoekterm weert een Aangemaakt-regel',
     logRegelZichtbaar({actie:'Aangemaakt', nieuweWaarde:'Dakgoot'}, ''), false);
  truthy('logRegelZichtbaar mét zoekterm laat hem door',
     logRegelZichtbaar({actie:'Aangemaakt', nieuweWaarde:'Dakgoot'}, 'dakgoot'));
  eq('logRegelZichtbaar mét zoekterm die niet matcht blijft onwaar',
     logRegelZichtbaar({actie:'Aangemaakt', nieuweWaarde:'Dakgoot'}, 'kozijn'), false);
  truthy('logRegelZichtbaar laat een notitie zonder zoekterm door',
     logRegelZichtbaar({actie:'Opmerking', nieuweWaarde:'x'}, ''));

  // ── De chips ──
  (() => {
    const chips=[...document.querySelectorAll('#logboek-act .lchip')].map(b=>b.dataset.act);
    eq('logboek-chips: vier stuks', chips.length, 4);
    eq('logboek-chips: geen Aangemaakt meer', chips.includes('Aangemaakt'), false);
    eq('logboek-chips: Afgerond blijft als filterwaarde', chips.includes('Afgerond'), true);
    const afr=document.querySelector('#logboek-act .lchip[data-act="Afgerond"]');
    truthy('logboek-chip Afgerond heet Afrondnotities', (afr?.textContent||'').includes('Afrondnotities'));
  })();
```

Voeg `logRegelZichtbaar` toe aan de import uit `render-overig.js`.

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `ReferenceError: logRegelZichtbaar is not defined` plus de chip-asserts rood.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/render-overig.js`, vlak ná `logPaginaSoort`:

```js
// Mag deze regel op de Logboek-PAGINA staan? Puur, dus los te toetsen.
// De zoekterm hoort hier en niet erna: staat er iets in de zoekbalk, dan vervalt de
// zichtbaarheidspoort en wordt er over álle regels gezocht — verborgen treffers komen dan als
// dunne regel binnen.
export function logRegelZichtbaar(r, zoekterm){
  if(logPaginaSoort(r)) return true;
  return !!(zoekterm && logZoekTekst(r).includes(zoekterm));
}

// Eén bron voor de zoekstring van een logregel, gedeeld door de poort hierboven en het filter
// in renderLogboek — anders zoekt de poort over andere velden dan het filter.
export function logZoekTekst(r){
  return `${r.timestamp} ${r.code} ${r.sectie} ${r.actie} ${r.veld} ${r.oudeWaarde} ${r.nieuweWaarde} ${r.gebruiker} ${displayName(r.gebruiker)}`.toLowerCase();
}
```

Vervang de filterketen in `renderLogboek` (r.693-702):

```js
  const rows=D.logboek.filter(r=>{
    if(!logRegelZichtbaar(r,q)) return false;
    if(state.logWho && displayName(r.gebruiker)!==state.logWho) return false;
    if(state.logAct && r.actie!==state.logAct) return false;
    if(q && !logZoekTekst(r).includes(q)) return false;
    return true;
  });
```

De prefix-uitzondering voor 'Aangemaakt' vervalt met de chip.

Voeg boven aan `renderLogboek` (na r.664) de bewerkstand-guard toe:

```js
  // Staat er een bewerkformulier open op een regel die niet meer bewerkbaar is? Dan wissen.
  // `_herankerLogEdit` doet bij meerdere ankertreffers bewust niets en houdt het kale rijnummer
  // vast; `_shiftLogEditRef` kan dat daarna naar een ándere regel schuiven. Zonder deze guard
  // opent er een formulier op een regel die de gebruiker nooit heeft aangeklikt, en schrijft
  // Opslaan kolom G van die vreemde regel.
  if(state.logEdit){
    const bezig=D.logboek.find(r=>r._row===state.logEdit);
    if(bezig && !logBewerkbaar(bezig)){ state.logEdit=null; state.logEditTs=null; }
  }
```

In `index.html`: verwijder de chip op r.345 (`data-act="Aangemaakt"`) volledig, en vervang op r.344 het woord `Afgerond` ná het `</svg>` door `Afrondnotities`.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL.

- [ ] **Stap 5: Commit**

```bash
git add index.html src/render-overig.js src/tests.js
git commit -m "Logboek-pagina: chip Aangemaakt weg, Afrondnotities, zoeken doorbreekt het filter

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Het VvE-dossier krijgt drie standen

**Files:**
- Modify: `src/render-vve.js:79-96` (`filterDossierLog`, `dossierFeed`), `:408-411` en `:424` (paneel + teller)
- Modify: `index.html` (de knoppenbalk boven de dossier-tijdlijn)
- Test: `src/tests.js:869-871`, `:883-897`

**Interfaces:**
- Produces: `filterDossierLog(entries, modus)` met modus `'notities' | 'contact' | 'alles'`; standaard `'notities'`

- [ ] **Stap 1: Pas de toetsen aan**

Vervang in `src/tests.js` het blok op r.869-871 door:

```js
  const _dosLog=[
    {actie:'Contact', oudeWaarde:'Bestuur', nieuweWaarde:'gebeld'},
    {actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op 03-09-2026', nieuweWaarde:'dak hersteld'},
    {actie:'Contact', oudeWaarde:'Bewoner', nieuweWaarde:'mail'},
    {actie:'Kenmerk', veld:'Dak', nieuweWaarde:'Gemeenschappelijk'},
    {actie:'Aangevinkt', veld:'In behandeling'},
  ];
  eq('dossierfilter alles toont ook de systeemregels', filterDossierLog(_dosLog,'alles').length, 5);
  eq('dossierfilter contact', filterDossierLog(_dosLog,'contact').length, 2);
  eq('dossierfilter notities: contact + afronding-met-opmerking', filterDossierLog(_dosLog,'notities').length, 3);
  eq('dossierfilter standaardstand is notities', filterDossierLog(_dosLog).length, 3);
  eq('dossierfilter notities weert een afronding zónder opmerking',
     filterDossierLog([{actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op 03-09-2026', nieuweWaarde:''}],'notities').length, 0);
  // De prullenbak op automatische regels moet in de 'alles'-stand blijven bestaan: dit is het
  // ENIGE scherm waar een foute 'Kenmerk'- of 'Fout'-regel weggehaald kan worden.
  truthy('dossierFeed houdt de verwijderknop op een systeemregel',
     dossierFeed([{actie:'Kenmerk', veld:'Dak', code:'X', timestamp:'2026-09-03T10:00:00Z', gebruiker:'x@y.nl', _row:9}])
       .includes('data-action="log-verwijderen"'));
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `dossierfilter notities …` rood (geeft 5 in plaats van 3).

- [ ] **Stap 3: Schrijf de implementatie**

Vervang `filterDossierLog` in `src/render-vve.js:79-81`:

```js
// Drie standen. 'notities' is de standaard en toont alleen wat een mens geschreven heeft;
// 'alles' blijft bestaan en dat is GEEN half werk maar noodzaak:
//   · dit is het enige scherm waar een foute logregel te verwijderen is (de prullenbak in
//     logItemHtml), anders kan dat alleen nog met de hand in de Sheet;
//   · het afvinkspoor van een ALV-ronde ('Aangevinkt' op sectie ALVS) heeft geen bewerkscherm
//     en is nergens anders te lezen;
//   · kenmerkwijzigingen worden hier optimistisch getoond als bevestiging van het opslaan;
//   · de kop toont 'laatste activiteit: N d' op de ONgefilterde cijfers, dus zonder deze knop
//     kan er 'laatste activiteit: 1 d' boven 'Geschiedenis 0' staan.
export function filterDossierLog(entries, modus){
  if(modus==='alles') return entries;
  if(modus==='contact') return entries.filter(e=>e.actie==='Contact');
  return entries.filter(e=>logPaginaSoort(e));
}
```

In `dossierFeed` (r.92): `const eigen=logPaginaSoort(r)==='normaal';` (al gedaan in Task 2 — controleren).

Zoek de bestaande dossier-filterknoppen in `index.html` (de balk die vandaag 'Alles' en 'Contact' biedt) en maak er drie van:

```html
<button class="lchip on" data-dosmodus="notities" aria-pressed="true">Notities &amp; contact</button>
<button class="lchip" data-dosmodus="contact" aria-pressed="false">Contact</button>
<button class="lchip" data-dosmodus="alles" aria-pressed="false">Alles</button>
```

Zet de standaardstand in `src/state.js` op `'notities'` waar vandaag `'alles'` staat, en pas de teller boven de tijdlijn (`render-vve.js:424`) aan zodat hij `N van M` toont zodra `M > N`:

```js
  const totaal=o.logboek.length, zichtbaar=dosEntries.length;
  const telTekst = zichtbaar<totaal ? `${zichtbaar} van ${totaal}` : String(zichtbaar);
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL.

- [ ] **Stap 5: Commit**

```bash
git add index.html src/render-vve.js src/state.js src/tests.js
git commit -m "VvE-dossier: drie standen, schoon als standaard en Alles een klik ver

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `afrondLogRegel` — één vorm voor beide afrondwegen

**Files:**
- Modify: `src/crud.js` (naast `afrondWaarden`, r.1209), `:1357` (de logEvent-aanroep, en die gaat binnen de idempotentie-vlag)
- Test: `src/tests.js`

**Interfaces:**
- Produces: `afrondLogRegel(code, sec, datum, opmerking) → {code, sec, actie, veld, oudeWaarde, nieuweWaarde}`, geëxporteerd uit `crud.js`. Task 6 (bulk) gebruikt hem.

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── afrondLogRegel ── (één bron voor de losse weg én bulk, zodat de vorm niet op twee
  //    plekken met de hand staat en de lezer afrondOpmerking beide altijd terugvindt)
  const _alr=afrondLogRegel('311129','OPPAKKEN','03-09-2026','Dak hersteld');
  eq('afrondLogRegel: veld leeg (anders tekent renderTaskHistory een zinloze pijl)', _alr.veld, '');
  eq('afrondLogRegel: datum in oudeWaarde', _alr.oudeWaarde, 'Afgerond op 03-09-2026');
  eq('afrondLogRegel: alleen de opmerking in nieuweWaarde', _alr.nieuweWaarde, 'Dak hersteld');
  eq('afrondLogRegel: actie', _alr.actie, 'Afgerond');
  eq('afrondLogRegel: trimt de opmerking', afrondLogRegel('X','OPPAKKEN','03-09-2026','  x  ').nieuweWaarde, 'x');
  eq('afrondLogRegel: zonder opmerking leeg', afrondLogRegel('X','OPPAKKEN','03-09-2026').nieuweWaarde, '');
  // RONDGANG: wat de schrijver maakt, moet de lezer terugvinden.
  eq('rondgang afrondLogRegel → afrondOpmerking',
     afrondOpmerking({actie:_alr.actie, veld:_alr.veld, oudeWaarde:_alr.oudeWaarde, nieuweWaarde:_alr.nieuweWaarde}),
     'Dak hersteld');
  // BRONCODE-TOETS: de logEvent-aanroep in doCompleteTask moet BINNEN de idempotentie-vlag
  // staan. backgroundWrite draait de writeFn via _withRetry tot drie keer bij een 429/5xx;
  // eronder zou dat een tweede afrondnotitie in de tijdlijn geven.
  (async () => {
    const bron = await (await fetch('./src/crud.js')).text();
    const i = bron.indexOf('if(!afgerond){');
    const j = bron.indexOf('afrondLogRegel(', i);
    const k = bron.indexOf("'Afronden mislukt'", i);
    truthy('doCompleteTask: de logregel staat binnen de idempotentie-vlag', i > -1 && j > i && j < k);
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `ReferenceError: afrondLogRegel is not defined`.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/crud.js`, vlak vóór `afrondWaarden` (r.1209):

```js
// De logregel van een afronding, als één bron voor de losse weg (doCompleteTask) én bulk.
// Vorm sinds v12.8:
//   veld (E)        = ''                       ← leeg, want renderTaskHistory tekent zijn
//                                                'oud → nieuw'-regel alleen bij een gevuld veld,
//                                                en 'status: Nog Te Doen → Afgerond op …' is een
//                                                pijl tussen twee dingen die geen voor en na zijn
//   oudeWaarde (F)  = 'Afgerond op <datum>'    ← machineleesbaar; hier hangt afrondOpmerking aan
//   nieuweWaarde(G) = de opmerking             ← puur mensentekst, zodat hij als .log-note kan
export function afrondLogRegel(code, sec, datum, opmerking){
  return { code, sec, actie:'Afgerond', veld:'',
           oudeWaarde:'Afgerond op '+datum, nieuweWaarde:(opmerking||'').trim() };
}
```

Vervang in `doCompleteTask` (r.1357) de regel

```js
        await logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
```

en verplaats hem BINNEN het `if(!afgerond){ … }`-blok, als laatste regel daarbinnen, in deze vorm:

```js
          // Binnen de vlag, niet eronder: `backgroundWrite` draait deze writeFn via `_withRetry`
          // tot drie keer bij een 429/5xx. Eronder zou elke herkansing een tweede afrondnotitie
          // schrijven — vroeger was dat ruis, nu is het een dubbele zin in de tijdlijn én in de
          // dossierteller.
          const lg = afrondLogRegel(r.code, sec, today, comment);
          await logEvent(lg.code, lg.sec, lg.actie, lg.veld, lg.oudeWaarde, lg.nieuweWaarde);
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL.

- [ ] **Stap 5: Commit**

```bash
git add src/crud.js src/tests.js
git commit -m "Afronden: één vorm voor de logregel, en binnen de idempotentie-vlag

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Het afrondvenster vraagt verplicht een opmerking

**Files:**
- Modify: `index.html:683-710` (het venster), `src/config.js` (`AFROND_SNELKEUZES`), `src/crud.js:1187` (openen) en `:1260-1266` (validatie), `src/main.js:387-388` (klik naast het venster), `src/actions.js` (snelkeuze-actie), `styles.css`
- Test: `src/tests.js`

**Interfaces:**
- Consumes: `afrondLogRegel`
- Produces: `AFROND_SNELKEUZES` (array van strings) uit `config.js`; `afrondInvoerOk(tekst) → boolean` uit `crud.js`

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── Verplichte afrond-opmerking ──
  eq('afrondInvoerOk weigert leeg', afrondInvoerOk(''), false);
  eq('afrondInvoerOk weigert spaties', afrondInvoerOk('   '), false);
  truthy('afrondInvoerOk laat tekst door', afrondInvoerOk('Dak hersteld'));
  eq('AFROND_SNELKEUZES: vier stuks', AFROND_SNELKEUZES.length, 4);
  truthy('AFROND_SNELKEUZES bevat "Uitgevoerd en akkoord"', AFROND_SNELKEUZES.includes('Uitgevoerd en akkoord'));
  (() => {
    const lbl=document.querySelector('#complete-bg label[for="complete-comment"], #complete-bg .fld label');
    const bg=document.getElementById('complete-bg');
    truthy('afrondvenster: het opmerkingveld heet "Hoe staat het er nu voor?"',
       bg.innerHTML.includes('Hoe staat het er nu voor?'));
    eq('afrondvenster: het woord optioneel staat niet meer bij de opmerking',
       (bg.querySelector('#complete-comment')?.closest('.fld')?.textContent||'').includes('optioneel'), false);
    // De knop mag NIET disabled zijn: er bestaat geen .btn:disabled-opmaak (hij zou er identiek
    // uitzien) en modal-a11y.js filtert `button:not([disabled])`, waardoor hij uit de focusval valt.
    eq('afrondvenster: Afhandelen is niet uitgeschakeld',
       document.getElementById('complete-confirm').hasAttribute('disabled'), false);
    eq('afrondvenster: vier snelkeuzeknoppen',
       bg.querySelectorAll('[data-action="afrond-snelkeuze"]').length, 4);
    truthy('afrondvenster: het veld verwijst naar zijn foutmelding',
       document.getElementById('complete-comment').getAttribute('aria-describedby'));
  })();
  // BRONCODE-TOETS: de validatie hoort NÁ blokkeerOffline. Andersom typ je eerst een zin en hoor
  // je daarna pas dat er niets weggeschreven kan worden.
  (async () => {
    const bron = await (await fetch('./src/crud.js')).text();
    const i = bron.indexOf('async function doCompleteTask');
    const o = bron.indexOf('blokkeerOffline()', i);
    const v = bron.indexOf('afrondInvoerOk(', i);
    truthy('doCompleteTask: opmerking-controle staat ná blokkeerOffline', o > -1 && v > o);
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `ReferenceError: afrondInvoerOk is not defined` plus de DOM-asserts rood.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/config.js`:

```js
// Snelkeuzes in het afrondvenster. Bewust hier en niet in de HTML: het bulk-venster gebruikt
// dezelfde lijst plus 'Opgeruimd', en twee handgeschreven kopieën lopen uiteen.
export const AFROND_SNELKEUZES = ['Uitgevoerd en akkoord','Doorgezet naar aannemer','Vervallen','Bestuur geïnformeerd'];
export const BULK_AFROND_SNELKEUZE = 'Opgeruimd';
```

In `index.html`, vervang het opmerkingveld in `#complete-bg`:

```html
      <div class="fld">
        <label for="complete-comment">Hoe staat het er nu voor? <span class="fld-req">verplicht</span></label>
        <div class="snelkeuze" id="complete-snel"></div>
        <textarea id="complete-comment" rows="3" aria-describedby="complete-comment-fout"
                  placeholder="Bijvoorbeeld: dakgoot vervangen, factuur akkoord bestuur"></textarea>
        <p class="veld-fout" id="complete-comment-fout" hidden>Vul eerst kort in hoe het er nu voor staat.</p>
      </div>
```

In `src/crud.js`:

```js
// Puur, dus los te toetsen. Eén regel, maar wel de regel waar het hele venster om draait.
export const afrondInvoerOk = tekst => !!String(tekst||'').trim();

// De snelkeuzeknoppen bouwen. Bewust géén `.soort-chip`: die heeft elders een blijvende
// `.aan`-stand (contact-composer, logEditForm) en wie die kent klikt hier twee keer omdat er
// niets aan blijft staan. Dit is een invoeg-actie, geen keuze.
function vulSnelkeuzes(hostId, extra){
  const host=document.getElementById(hostId); if(!host) return;
  const lijst=extra?[...AFROND_SNELKEUZES,extra]:AFROND_SNELKEUZES;
  host.innerHTML=lijst.map(t=>
    `<button type="button" class="snel-knop" data-action="afrond-snelkeuze" data-tekst="${esc(t)}">${esc(t)}</button>`
  ).join('');
}
```

In `completeTaskRow` (r.1187), ná `document.getElementById('complete-comment').value='';`:

```js
  vulSnelkeuzes('complete-snel');
  toonAfrondFout(false);
```

met:

```js
// De foutmelding aan- of uitzetten. Zichtbaar én hoorbaar: `aria-invalid` op het veld zorgt dat
// een schermlezer het meldt, `aria-describedby` (in de HTML) koppelt de zin eraan.
function toonAfrondFout(aan, veldId, foutId){
  const v=document.getElementById(veldId||'complete-comment');
  const f=document.getElementById(foutId||'complete-comment-fout');
  if(f) f.hidden=!aan;
  if(v){ v.setAttribute('aria-invalid', aan?'true':'false'); if(aan){ try{ v.focus(); }catch(_){} } }
}
```

In `doCompleteTask`, direct ná `if(!await ensureToken()){…}` (dus ná `blokkeerOffline`):

```js
    if(!afrondInvoerOk(comment)){ toonAfrondFout(true); return; }
```

In `src/actions.js`, een nieuwe actie:

```js
  'afrond-snelkeuze': (el) => {
    const doel = el.closest('#bulkaf-bg') ? 'bulkaf-comment' : 'complete-comment';
    const v = document.getElementById(doel);
    if(!v) return;
    v.value = el.dataset.tekst || '';
    v.focus();
    v.setSelectionRange(v.value.length, v.value.length);
    const fout = document.getElementById(doel+'-fout'); if(fout) fout.hidden = true;
    v.setAttribute('aria-invalid','false');
  },
```

In `src/main.js:387-388`, de klik-naast-het-venster:

```js
  document.getElementById('complete-bg').addEventListener('click',e=>{
    if(e.target.id!=='complete-bg'||_compMouseDown?.id!=='complete-bg') return;
    // Niet sluiten als er tekst staat. Dat is de enige TOEVALLIGE weg naar tekstverlies; het
    // kruisje, Annuleren en Escape blijven wél sluiten, want dat zijn expliciete daden.
    // Bewust geen concept-bewaring: elke sleutel daarvoor (taakId of _row|code) botst — _row
    // schuift mee met _shiftNtdRows terwijl een bewaarde sleutel bevroren is.
    if(afrondInvoerOk(document.getElementById('complete-comment')?.value)) return;
    closeCompleteModal();
  });
```

In `styles.css`:

```css
    .fld-req{margin-left:7px;font-family:var(--font-mono);font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--rd);background:var(--rd-l);border:1px solid var(--rd-b);padding:1px 5px;border-radius:3px}
    .snelkeuze{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px}
    .snel-knop{font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px;border:1px dashed var(--bor-input);background:var(--sur);color:var(--mut);cursor:pointer;transition:var(--tr)}
    .snel-knop:hover{border-style:solid;border-color:var(--ac);color:var(--ac);background:var(--ac-l)}
    .veld-fout{margin:5px 0 0;font-size:12px;font-weight:600;color:var(--rd)}
    textarea[aria-invalid="true"]{border-color:var(--rd);box-shadow:0 0 0 3px var(--rd-l)}
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL.

- [ ] **Stap 5: Commit**

```bash
git add index.html src/config.js src/crud.js src/actions.js src/main.js styles.css src/tests.js
git commit -m "Afrondvenster: opmerking verplicht, met vier snelkeuzes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Bulk-afronden met één gedeelde opmerking

**Files:**
- Create: `#bulkaf-bg` in `index.html`
- Modify: `src/bulk.js:273-340` (`bulkAfronden`), `:379` (de logEvents-append), `src/main.js` (bedrading), `src/tests.js:11473-11483` (de `vraag()`-helper)

**Interfaces:**
- Consumes: `afrondLogRegel`, `AFROND_SNELKEUZES`, `BULK_AFROND_SNELKEUZE`, `afrondInvoerOk`
- Produces: `vraagBulkAfronden({aantal, subZin}) → Promise<string|null>` — de gedeelde opmerking, of `null` bij annuleren

- [ ] **Stap 1: Schrijf de falende toetsen en repareer de testhelper**

De bestaande `vraag()`-helper (tests.js:11473-11483) klikt `#bevestig-ja`/`#bevestig-nee`. Bulk-afronden gebruikt straks `#bulkaf-bg`; zonder aanpassing antwoordt niemand, loopt `wachtTot` leeg, blijft `state._bulkBezig` op `true` en keren álle latere `bulkDoe`-aanroepen in dat blok stil terug — het blok meet dan een dode bulkbalk en blijft gróén. Breid de helper uit:

```js
  // Beantwoordt ÓF het gewone bevestigingsvenster ÓF het bulk-afrondvenster, wat er ook opengaat.
  // Zonder de tweede tak blijft state._bulkBezig hangen en meet de rest van dit blok niets meer.
  const vraag = async (ja, tekst) => {
    for(let i=0;i<40;i++){
      const b=document.getElementById('bevestig-bg');
      if(b?.classList.contains('open')){
        document.getElementById(ja?'bevestig-ja':'bevestig-nee').click();
        return 'bevestig';
      }
      const a=document.getElementById('bulkaf-bg');
      if(a?.classList.contains('open')){
        if(ja){ document.getElementById('bulkaf-comment').value = tekst||'Opgeruimd'; }
        document.getElementById(ja?'bulkaf-confirm':'bulkaf-cancel').click();
        return 'bulkaf';
      }
      await new Promise(r=>setTimeout(r,10));
    }
    return null;
  };
```

Nieuwe toetsen:

```js
  // ── Bulk-afronden met gedeelde opmerking ──
  eq('bulk: snelkeuze Opgeruimd staat erbij', BULK_AFROND_SNELKEUZE, 'Opgeruimd');
  (() => {
    const bg=document.getElementById('bulkaf-bg');
    truthy('bulk-afrondvenster bestaat', !!bg);
    truthy('bulk-afrondvenster heeft één opmerkingveld', !!document.getElementById('bulkaf-comment'));
    eq('bulk-afrondvenster: knop niet uitgeschakeld',
       document.getElementById('bulkaf-confirm').hasAttribute('disabled'), false);
    eq('bulk-afrondvenster: vijf snelkeuzes',
       bg.querySelectorAll('[data-action="afrond-snelkeuze"]').length, 5);
  })();
  // De gedeelde tekst moet in kolom J van ELKE rij landen (index 9 van de 19 archiefwaarden).
  (() => {
    const r={code:'311129', naam:'VvE X', actiepunt:'iets', deadline:'', behandelaar:'Jer',
             prioriteit:'', opmerkingen:'', inBehandeling:'FALSE', _sec:'OPPAKKEN'};
    const v=afrondWaarden(r,'OPPAKKEN','03-09-2026','Opgeruimd');
    eq('bulk: de gedeelde opmerking staat op kolom J', v[9], 'Opgeruimd');
    eq('bulk: kolom M (duur) blijft leeg', v[12], '');
  })();
  // Het merkje (bulk) verhuist naar kolom F, zodat een bulk herkenbaar blijft: logTijd toont
  // alleen uu:mm, dus twee losse afrondingen in dezelfde minuut zijn er anders niet van te
  // onderscheiden.
  (() => {
    const lg=afrondLogRegel('X','OPPAKKEN','03-09-2026 (bulk)','Opgeruimd');
    eq('bulk-logregel: merkje in kolom F', lg.oudeWaarde, 'Afgerond op 03-09-2026 (bulk)');
    eq('bulk-logregel: alleen de opmerking in kolom G', lg.nieuweWaarde, 'Opgeruimd');
    eq('bulk-logregel wordt teruggelezen', afrondOpmerking(lg), 'Opgeruimd');
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `bulk-afrondvenster bestaat` rood.

- [ ] **Stap 3: Schrijf de implementatie**

Voeg in `index.html`, naast `#complete-bg`, toe:

```html
<div class="modal-bg" id="bulkaf-bg">
  <div class="modal" style="max-width:460px">
    <div class="modal-hdr" style="--sec:var(--gn)">
      <h2 id="bulkaf-title">Taken afronden</h2>
      <button class="modal-close" id="bulkaf-close">×</button>
    </div>
    <div class="modal-body">
      <!-- De waarschuwingen (vanaf drie taken, en over achterblijvende subtaken) staan ÍN dit
           venster en niet in een tweede vraag ervoor: twee vensters achter elkaar voor één
           handeling is precies de wrijving die de bulkknop onbruikbaar maakt. -->
      <p class="modal-uitleg" id="bulkaf-uitleg"></p>
      <div class="fld">
        <label for="bulkaf-comment">Hoe staat het er nu voor? <span class="fld-req">verplicht</span></label>
        <div class="snelkeuze" id="bulkaf-snel"></div>
        <textarea id="bulkaf-comment" rows="3" aria-describedby="bulkaf-comment-fout"
                  placeholder="Deze zin komt bij elke taak in deze selectie te staan"></textarea>
        <p class="veld-fout" id="bulkaf-comment-fout" hidden>Vul eerst kort in hoe het er nu voor staat.</p>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-sec" id="bulkaf-cancel">Annuleren</button>
      <button class="btn btn-pri" id="bulkaf-confirm" style="background:var(--gn)">Afronden</button>
    </div>
  </div>
</div>
```

In `src/bulk.js`, vervang de bevestigingsvraag (r.278-300) door één aanroep die de opmerking teruggeeft:

```js
  const subZin = /* ongewijzigd opgebouwd zoals nu */ '';
  const opmerking = await vraagBulkAfronden({ aantal: rows.length, subZin });
  if(opmerking===null) return;           // geannuleerd
```

met de nieuwe functie in `src/bulk.js`:

```js
// Eén venster voor de hele selectie: de waarschuwing én de gedeelde opmerking. Geeft de tekst
// terug, of null bij annuleren. Zelfde vorm als vraagBevestiging (bevestig.js), inclusief de
// dubbelklik-rem: een tweede vraag terwijl er al één openstaat krijgt meteen 'nee'.
let _bulkAfOpen = false;
export function vraagBulkAfronden({ aantal, subZin }){
  if(_bulkAfOpen) return Promise.resolve(null);
  const bg=document.getElementById('bulkaf-bg');
  if(!bg) return Promise.resolve(null);
  _bulkAfOpen = true;
  document.getElementById('bulkaf-title').textContent =
    `${aantal} ${aantal===1?'taak':'taken'} afronden`;
  document.getElementById('bulkaf-uitleg').textContent =
    `${aantal===1?'Deze taak verhuist':'Deze taken verhuizen'} naar 'Afgerond'. `+
    `Meteen daarna kun je dit nog ongedaan maken met de knop in de melding.`+(subZin||'');
  const veld=document.getElementById('bulkaf-comment');
  veld.value=''; veld.setAttribute('aria-invalid','false');
  document.getElementById('bulkaf-comment-fout').hidden=true;
  vulBulkSnelkeuzes();
  bg.classList.add('open');
  return new Promise(klaar=>{
    const sluit=(waarde)=>{ bg.classList.remove('open'); _bulkAfOpen=false; opruimen(); klaar(waarde); };
    const opJa=()=>{
      const t=veld.value;
      if(!afrondInvoerOk(t)){
        document.getElementById('bulkaf-comment-fout').hidden=false;
        veld.setAttribute('aria-invalid','true');
        try{ veld.focus(); }catch(_){}
        return;
      }
      sluit(t.trim());
    };
    const opNee=()=>sluit(null);
    const opToets=e=>{ if(e.key==='Escape') opNee(); };
    const ja=document.getElementById('bulkaf-confirm');
    const nee=document.getElementById('bulkaf-cancel');
    const kruis=document.getElementById('bulkaf-close');
    function opruimen(){
      ja.removeEventListener('click',opJa); nee.removeEventListener('click',opNee);
      kruis.removeEventListener('click',opNee); document.removeEventListener('keydown',opToets);
    }
    ja.addEventListener('click',opJa); nee.addEventListener('click',opNee);
    kruis.addEventListener('click',opNee); document.addEventListener('keydown',opToets);
    try{ veld.focus(); }catch(_){}
  });
}

function vulBulkSnelkeuzes(){
  const host=document.getElementById('bulkaf-snel'); if(!host) return;
  host.innerHTML=[...AFROND_SNELKEUZES, BULK_AFROND_SNELKEUZE].map(t=>
    `<button type="button" class="snel-knop" data-action="afrond-snelkeuze" data-tekst="${esc(t)}">${esc(t)}</button>`
  ).join('');
}
```

Geef de opmerking door aan `afrondWaarden` (r.309): `const values=afrondWaarden(r, r._sec, vandaag, opmerking);`

Vervang de `logEvents`-append (r.379):

```js
    await logEvents(items.map(it=>afrondLogRegel(it.code, it.sec, vandaag+' (bulk)', opmerking)));
```

Trek het faalpad van `bevestigInvoegPlek` (r.330-331) gelijk met de losse weg: het venster is dan al gesloten en de tekst is weg, dus de melding moet dat zeggen én de tekst teruggeven. Eenvoudigste vorm die klopt: doe de `bevestigInvoegPlek`-controle **vóór** het venster opent.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```
Verwacht: 0 FAIL. Let vooral op het bulk-blok rond tests.js:11473 — dat moet nog steeds échte asserts doen en niet stil terugkeren.

- [ ] **Stap 5: Commit**

```bash
git add index.html src/bulk.js src/main.js src/tests.js
git commit -m "Bulk-afronden: één venster met een gedeelde opmerking

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Kolom J zichtbaar en vindbaar op de Afgerond-pagina en in het dossier

**Files:**
- Modify: `src/render-tabel.js:460` (`rowAf`), `src/util.js:39-40` (`_afZoekvelden`), `styles.css` (`.tk .nm .mt`)
- Test: `src/tests.js`

**Interfaces:**
- Geen nieuwe exports

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── Kolom J wordt nu ALTIJD gevuld; drie plekken moeten daar tegen kunnen ──
  truthy('_afZoekvelden zoekt in opmerking (parseSections schrijft kolom J als `opmerking`)',
     _afZoekvelden.includes('opmerking'));
  eq('_afZoekvelden zoekt niet meer in het niet-bestaande `toelichting`',
     _afZoekvelden.includes('toelichting'), false);
  truthy('rowAf kapt de opmerking af met een .ct-wikkel',
     rowAf({code:'X', naam:'VvE X', actiepunt:'iets', datum:'03-09-2026',
            opmerking:'een hele lange afrondtoelichting die anders de kolom uitrekt',
            _sec:'OPPAKKEN'}, 'OPPAKKEN').includes('class="ct"'));
  truthy('rowAf zet de volle tekst in de zweeftekst',
     rowAf({code:'X', naam:'VvE X', actiepunt:'iets', datum:'03-09-2026',
            opmerking:'volledige tekst', _sec:'OPPAKKEN'}, 'OPPAKKEN').includes('title="volledige tekst"'));
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: alle vier rood.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/util.js:39-40`: vervang `'toelichting'` door `'opmerking'` in `_afZoekvelden`, met een regel commentaar:

```js
// 'opmerking' en NIET 'toelichting': parseSections (data.js) schrijft kolom J van 'Afgerond'
// als `entry.opmerking`. Sinds de opmerking bij afronden verplicht is, is dit hét veld dat je
// terug wilt kunnen zoeken — met de oude naam vond de zoekbalk er niets.
```

In `src/render-tabel.js:460`, vervang de opmerkingcel van `rowAf`:

```js
    <td class="cell-note"><span class="ct" title="${esc(r.opmerking||'')}">${esc(r.opmerking||'')}</span></td>
```

In `styles.css`, bij `.tk .nm .mt`:

```css
    /* Sinds de afrondopmerking verplicht is, heeft ELKE afgeronde taak in het dossier deze
       tweede regel. Zonder afkapping werd het paneel 'Laatst afgerond' ongeveer twee keer zo
       hoog en sneuvelde de belofte 'drie panelen zonder paginascroll'. */
    .tk .nm .mt{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
```

Zet in `render-vve.js:384` een `title` op die span met de volle tekst.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```

- [ ] **Stap 5: Commit**

```bash
git add src/util.js src/render-tabel.js src/render-vve.js styles.css src/tests.js
git commit -m "Afrondopmerking: vindbaar in de zoekbalk en netjes afgekapt in beeld

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: De AI-context krijgt twee blokken

**Files:**
- Modify: `src/dossier-chat.js:60-68`, `src/ai.js:50-52`
- Test: `src/tests.js`

**Interfaces:**
- Consumes: `logPaginaSoort`, `logZin`
- Produces: geen nieuwe exports

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── AI-context: twee blokken met een eigen budget ──
  // Vandaag pakt de chat `logboek.slice(0,15)`: bij een VvE met veel afrondingen ziet het model
  // geen enkele notitie. Het probleem is niet dat er te véél in zit, maar dat de willekeurige
  // greep de belangrijke regels eruit duwt.
  (() => {
    const veel=[];
    for(let i=0;i<20;i++) veel.push({timestamp:'2026-09-0'+(i%9+1)+'T10:00:00Z', code:'311129',
      actie:'Afgerond', veld:'', oudeWaarde:'Afgerond op 0'+(i%9+1)+'-09-2026', nieuweWaarde:'',
      gebruiker:'info@vvebeheercollectief.nl'});
    veel.push({timestamp:'2026-08-01T10:00:00Z', code:'311129', actie:'Opmerking', veld:'',
      oudeWaarde:'', nieuweWaarde:'Bestuur wil eerst de MJOP zien', gebruiker:'info@vvebeheercollectief.nl'});
    const t=dossierLogTekst(veel);
    truthy('AI-context: de ene notitie overleeft twintig afrondingen', t.includes('MJOP'));
    truthy('AI-context: er is een tweede blok met overige handelingen', t.includes('Overige handelingen'));
  })();
  (() => {
    const alleenAuto=[{timestamp:'2026-09-01T10:00:00Z', code:'311129', actie:'Weggelegd',
      veld:'opvolgdatum', oudeWaarde:'', nieuweWaarde:'15-09-2026', gebruiker:'info@vvebeheercollectief.nl'}];
    const t=dossierLogTekst(alleenAuto);
    truthy('AI-context: automatische regels blijven zichtbaar voor het model', t.includes('Overige handelingen'));
    truthy('AI-context: de weggelegd-datum staat erin', t.includes('15-09-2026'));
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: `ReferenceError: dossierLogTekst is not defined`.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/dossier-chat.js`, een nieuwe geëxporteerde pure functie, en gebruik hem in `dossierContextTekst`:

```js
// Het logboekdeel van de dossier-context, als TWEE blokken met een eigen budget.
//
// WAAROM TWEE. De oude vorm nam `logboek.slice(0,15)` — vijftien regels vanaf de nieuwste. Bij
// een VvE met veel bulk-afrondingen zijn dat vijftien informatieloze regels en ziet het model
// geen enkele notitie. Het schermfilter is een SCHERMfilter: de assistent heeft geen last van
// ruis zoals een mens, hij heeft last van een te kleine greep. Met een eigen budget per blok
// kan het ene het andere niet meer verdringen, en ziet het model méér dan vandaag (tot 26
// regels in plaats van 15) met de inhoudelijke informatie vooraan.
const AI_LOG_INHOUD = 14, AI_LOG_OVERIG = 12;
export function dossierLogTekst(logboek, kap){
  const kort = kap || (s => _kapLog(s, 160));
  const alles = logboek || [];
  const inhoud = alles.filter(r => logPaginaSoort(r)).slice(0, AI_LOG_INHOUD);
  const overig = alles.filter(r => !logPaginaSoort(r)).slice(0, AI_LOG_OVERIG);
  const L = [];
  if(inhoud.length){
    L.push('Notities, contactmomenten en afrondingen (nieuwste eerst):');
    inhoud.forEach(r=>{
      const wie = displayName(r.gebruiker) || r.gebruiker || '?';
      const wat = r.actie === 'Contact'
        ? `${r.veld || 'Contact'} met ${r.oudeWaarde || '?'}: ${zonderOpmaak(r.nieuweWaarde)}`
        : r.actie === 'Afgerond'
          ? `Afgerond: ${zonderOpmaak(afrondOpmerking(r))}`
          : `${r.actie}${r.nieuweWaarde ? ': ' + zonderOpmaak(r.nieuweWaarde) : ''}`;
      L.push(`- ${fmtLogTs(r.timestamp)} ${_kapLog(`(${wie}) ${wat}`)}`);
    });
  }
  if(overig.length){
    L.push('Overige handelingen (nieuwste eerst, verkort):');
    // `logZin` levert HTML voor het scherm; hier is alleen de tekst nodig.
    overig.forEach(r=>L.push(`- ${fmtLogTs(r.timestamp)} ${kort(zonderOpmaak(logZinPlat(r)))}`));
  }
  return L.join('\n');
}
```

Voeg in `src/render-overig.js` een platte variant toe naast `logZin`:

```js
// Dezelfde zin als logZin, maar als PLATTE TEKST. logZin bouwt HTML (chips, <b>, kleuren) en
// die hoort niet in een AI-prompt: het model leest dan opmaak in plaats van inhoud.
export function logZinPlat(r){
  return logZin(r, {zonderCode:true}).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
}
```

In `dossierContextTekst` (r.60-68): laat `if(o.logboek.length)` op de **ongefilterde** lijst staan en vervang de body door `L.push(dossierLogTekst(o.logboek))`.

In `src/ai.js:50-52`: laat `laatste` op de ongefilterde lijst berekend worden (zodat de leegtoets op r.52 niet verandert), maar sorteer inhoudelijke regels naar voren:

```js
  // Leegtoets op :52 blijft op de ONgefilterde lijst: zou hij op een gefilterde lijst staan, dan
  // geeft aiVveContext null bij een VvE met alleen automatische regels en verdwijnt het complete
  // 'Live context'-kader — inclusief behandelaar en open taken die er wél waren.
  const _alleLog=(D.logboek||[]).filter(r=>String(r.code||'').toLowerCase()===c);
  const _geordend=[..._alleLog.filter(r=>logPaginaSoort(r)), ..._alleLog.filter(r=>!logPaginaSoort(r))];
  const laatste=_geordend.slice(0,6)
    .map(r=>`${fmtLogTs(r.timestamp)} — ${displayName(r.gebruiker)}: ${r.actie}${r.nieuweWaarde?' ('+zonderOpmaak(r.nieuweWaarde)+')':''}`);
  if(!naam && !behs.size && !open.length && !_alleLog.length) return null;
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```

- [ ] **Stap 5: Commit**

```bash
git add src/dossier-chat.js src/ai.js src/render-overig.js src/tests.js
git commit -m "AI-context: twee blokken met eigen budget, zodat notities niet meer verdrongen worden

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Offerte-kolommen, koppen en de korte datum

**Files:**
- Modify: `src/config.js:131-134` en `:148-151`, `src/render-tabel.js:105-115` (`renderThead`-title), `:255-264` (`deadlineCel`), `:387` (datumcel)
- Test: `src/tests.js:2295`, `:2313-2325`, `:6116-6118`

**Interfaces:**
- Produces: `SECS['OFFERTE-TRAJECTEN'].breedtes = ['130px', 19, '130px', 13, 11, '148px', 28, '120px']`

- [ ] **Stap 1: Pas de toetsen aan en schrijf de nieuwe**

```js
  // ── Offerte-kolommen ──
  eq('offerte-breedtes: acht elementen', SECS['OFFERTE-TRAJECTEN'].breedtes.length, 8);
  eq('offerte-breedtes: gewichtsom 71',
     SECS['OFFERTE-TRAJECTEN'].breedtes.filter(w=>typeof w==='number').reduce((a,b)=>a+b,0), 71);
  eq('offerte-koppen', SECS['OFFERTE-TRAJECTEN'].cols,
     ['VvE Code','VvE','Aangevraagd','Offertes','Wie','Deadline','Opmerkingen']);
  eq('subsidie-koppen: Behandelaar → Wie', SECS['SUBSIDIE-TRAJECTEN'].cols,
     ['VvE Code','VvE','Subsidie','Fase','Wie','Deadline']);
  // Alle vijf tabbladen dezelfde kop — daar vroeg de gebruiker expliciet om.
  eq('alle tabbladen gebruiken "Wie"',
     SKEYS.filter(s=>SECS[s].cols.includes('Behandelaar')).length, 0);
  // Kolombreedtes bij drie vensterbreedtes. `kolBreedtes` verdeelt de gewichten over wat er ná
  // de px-kolommen overblijft, dus dit is de enige plek waar de echte pixels vastliggen.
  (() => {
    const b=SECS['OFFERTE-TRAJECTEN'].breedtes;
    const bij=(t)=>kolBreedtes(b,t).map(w=>String(w).endsWith('%')?Math.round(parseFloat(w)/100*t):parseFloat(w));
    const w1440=bij(1440);
    eq('offerte @1440: Opmerkingen ~360px', Math.abs(w1440[6]-360)<=2, true);
    eq('offerte @1440: Wie ~141px', Math.abs(w1440[4]-141)<=2, true);
    const w1150=bij(1150);
    truthy('offerte @1150: Opmerkingen ruimer dan de 124 van nu', w1150[6]>200);
    const w1920=bij(1920);
    truthy('offerte @1920: de offertecel groeit mee (klikzone)', w1920[3]>180);
  })();
  // Korte datum ALLEEN op dit tabblad.
  truthy('offerte-deadline gebruikt de korte datum',
     deadlineCel({deadline:'16 september 2026', datumAangevraagd:'14 juli 2026'},'OFFERTE-TRAJECTEN').includes('16 sep'));
  eq('oppakken-deadline houdt de volle datum',
     deadlineCel({deadline:'16 september 2026'},'OPPAKKEN').includes('16 september 2026'), true);
```

Vervang de harde fixture-datum op tests.js:2295 (`'22 september 2026'`) door een datum die relatief aan `T` berekend wordt (`plus(20)`), met een regel commentaar: een harde datum in de toekomst maakt dit blok vacuüm groen zodra hij verstreken is.

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```
Verwacht: de kop- en breedte-asserts rood, plus tests.js:6116-6118.

- [ ] **Stap 3: Schrijf de implementatie**

In `src/config.js:131-134`:

```js
  'OFFERTE-TRAJECTEN':{label:'Offerte-trajecten',css:'--sec:var(--pu);--sec-l:var(--pu-l);--sec-b:var(--pu-b)',color:'#6855C9',
    cols:['VvE Code','VvE','Aangevraagd','Offertes','Wie','Deadline','Opmerkingen'],
    // GEWICHTEN, geen vaste px, voor 'Offertes' en 'Wie'. Een vaste breedte groeit niet mee, en
    // de klikzone van de aannemers-uitklapper is precies wat er ná de teller en het balkje
    // overblijft: bij een vaste 150px zakt die op een venster van 1920 van ~221 naar ~33px —
    // exact de fout die v11.3 heeft gerepareerd.
    // 'Aangevraagd' en 'Deadline' mogen wél vast: die tonen sinds v12.8 de KORTE datum.
                   breedtes:['130px',19,'130px',13,11,'148px',28,'120px'],
    keys:['code','naam','datumAangevraagd','offertes','behandelaar','deadline','opmerkingen'],
    kopUitleg:{'Offertes':'Ontvangen van aangevraagd'}},
```

In `src/config.js:148-151`: `cols` van `SUBSIDIE-TRAJECTEN` krijgt `'Wie'` in plaats van `'Behandelaar'`.

In `renderThead` (r.105-115): geef een niet-sorteerbare kop een `title` uit `SECS[sec].kopUitleg` als die er is. Voeg `kopUitleg` toe aan de parameters van `renderThead` (of lees hem uit `SECS[state.activeNtd]`, mits dat de enige aanroeper met breedtes is — dat is zo).

In `deadlineCel` (r.255-264), de offerte-tak: vervang `esc(r.deadline)` door `esc(kortDatum(r.deadline))`.

In `rowNtd`, case `OFFERTE-TRAJECTEN` (r.387): vervang `${esc(r.datumAangevraagd||'')}` door `${esc(kortDatum(r.datumAangevraagd||''))}`.

- [ ] **Stap 4: Draai en zie ze slagen, en meet in de browser**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
python3 tools/toetsen.py --breed 1150 --hoog 800
python3 tools/toetsen.py --breed 1920 --hoog 1080
```
Alle drie 0 FAIL. De 148px van de deadline is berekend in `var(--font-mono)`, en die stapel verschilt per besturingssysteem — daarom deze drie metingen en niet één.

- [ ] **Stap 5: Commit**

```bash
git add src/config.js src/render-tabel.js src/tests.js
git commit -m "Offerte-tab: ruimte naar Opmerkingen, korte datums en 'Wie' op alle tabbladen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: De aannemers-cel — label eruit, klikzone over de hele cel

**Files:**
- Modify: `src/render-offerte.js:12-33`, `src/render-tabel.js:388` (de celopbouw), `styles.css:513-515` en `:1218-1224`, `src/main.js:175`
- Test: `src/tests.js`

**Interfaces:**
- Produces: `offerteAannSamenvatting(r)` zonder zichtbaar label, mét `aria-label` en `title`

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── Aannemers-cel zonder label ──
  (() => {
    const leeg={code:'311129', offertes:'0/3', _aannemers:[]};
    const vol ={code:'301065', offertes:'1/2', _aannemers:[{naam:'Klusbouw',binnen:true},{naam:'HGR',binnen:false}]};
    const hLeeg=offerteAannSamenvatting(leeg), hVol=offerteAannSamenvatting(vol);
    eq('aannemers-cel: geen zichtbaar label meer', hLeeg.includes('of-aann-lbl'), false);
    truthy('aannemers-cel: de volle zin blijft in aria-label', hLeeg.includes('aria-label="Aannemers toevoegen'));
    truthy('aannemers-cel: gevuld zegt hoeveel er binnen zijn', hVol.includes('1 van 2 binnen'));
    truthy('aannemers-cel: title voor de muis', hVol.includes('title='));
    truthy('aannemers-cel: nog steeds een knop', hVol.includes('role="button"'));
    truthy('aannemers-cel: de teller zit ÍN de knop (klikzone = hele cel)',
      hVol.indexOf('prog-wrap') > hVol.indexOf('of-aann-tog'));
    // Een traject zonder teller én zonder aannemers mag geen kale 12px-pijl worden.
    truthy('aannemers-cel: plaatshouder bij een lege teller',
      offerteAannSamenvatting({code:'X', offertes:'', _aannemers:[]}).includes('of-aann-leeg'));
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```

- [ ] **Stap 3: Schrijf de implementatie**

Herbouw `offerteAannSamenvatting` in `src/render-offerte.js` zodat de knop de héle celinhoud omvat:

```js
// De klikbare cel van een offerte-traject: chevron + teller + balkje, alles ÍN de knop.
//
// Het zichtbare label ('Aannemers toevoegen' / 'Aannemers · 1 van 2 binnen') is er in v12.8 uit
// op verzoek van de gebruiker: bij een gevulde lijst zei het letterlijk hetzelfde als de teller
// ernaast. De volle zin blijft in `aria-label` en `title`.
//
// LET OP — de klikzone. Alleen de tekst weghalen zou een knop van een paar pixels overhouden:
// `.of-aann-tbl-tog` is `flex:1` en dus precies wat er ná de teller overblijft. Daarom omvat de
// knop nu de hele celinhoud. Dat is niet alleen geen achteruitgang maar een verbetering op
// v11.3, die de klikzone van 46% naar 100% van de RESTruimte bracht; nu is het 100% van de cel.
function offerteAannSamenvatting(r){
  const lijst=r._aannemers||[];
  const sl=aannSleutel(r);
  const open=state.offerteAannOpen.has(sl);
  const zin=lijst.length
    ? `Aannemers · ${lijst.filter(a=>a.binnen).length} van ${lijst.length} binnen`
    : 'Aannemers toevoegen';
  const uitleg=`${zin} — klik om de lijst te ${open?'sluiten':'openen'}`;
  // offProg('') geeft een lege string terug: een traject zonder aannemerslijst én zonder waarde
  // in kolom D zou dan uit één chevron van 12px bestaan. Vandaar de plaatshouder.
  const teller=offProg(r.offertes)||'<span class="of-aann-leeg">–</span>';
  return `<span class="of-aann-tog" role="button" tabindex="0" aria-expanded="${open}"
     data-action="offerte-aann-open" data-aann="${esc(sl)}"
     aria-label="${esc(uitleg)}" title="${esc(zin)}">${open?ico('chevronOnder',12):ico('chevronRechts',12)}${teller}</span>`;
}
```

In `src/render-tabel.js:388`, vereenvoudig de cel:

```js
        <td class="cell-of"><div class="of-aann-tbl-tog">${offerteAannSamenvatting(r)}</div></td>
```

In `styles.css`:

```css
    #ntd-tbl-wrap td.cell-of .of-aann-tbl-tog{display:block;min-width:0;margin-top:0}
    .of-aann-tog{display:flex;align-items:center;gap:9px;width:100%;min-width:0;padding:6px 0;cursor:pointer;color:var(--ac)}
    .of-aann-tog>svg{flex:none}
    .of-aann-leeg{color:var(--fnt);font-weight:600}
    /* De focusring op de TD en niet op de knop: `.of-aann-tbl-tog` heeft overflow:hidden, en dat
       knipt zowel een outline als een box-shadow af — de eerste opzet met een box-shadow op de
       knop loste dus niets op. */
    #ntd-tbl-wrap td.cell-of:has(.of-aann-tog:focus-visible){outline:2px solid var(--ac);outline-offset:-2px;border-radius:6px}
    #ntd-tbl-wrap td.cell-of:hover{background:var(--row-hover)}
```

Verwijder de nu dode regels `.of-aann-lbl` en `.of-aann-tog:hover .of-aann-lbl`.

`src/main.js:175` blijft ongewijzigd: `.of-aann-tbl-tog` staat al in de uitzonderingslijst van de rij-uitklapper en omvat nu de hele inhoud — een klik op het balkje opent daarmee niet langer per ongeluk de rij.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```

- [ ] **Stap 5: Commit**

```bash
git add src/render-offerte.js src/render-tabel.js src/main.js styles.css src/tests.js
git commit -m "Offerte-cel: label weg, de hele cel wordt de knop

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `groepeerPerVve` — de pure functie

**Files:**
- Modify: `src/render-lijsten.js` (nieuwe geëxporteerde functie)
- Test: `src/tests.js`

**Interfaces:**
- Produces: `groepeerPerVve(rows) → { rijen: Array, koppen: Map<number, {code, naam, aantal, teLaat}> }` — `koppen` is gesleuteld op de INDEX in `rijen`, niet op een rijsleutel

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── groepeerPerVve ──
  const _g = (code,naam,dl)=>({code,naam,deadline:dl||'',_sec:'OPPAKKEN'});
  (() => {
    // Eén taak blijft staan waar hij stond; alleen VvE's met twee of meer worden bij elkaar
    // gehaald, en de groep gaat naar de plek van zijn URGENTSTE lid. Er wordt dus alleen naar
    // voren gehaald, nooit naar achteren geduwd — een restbak 'Losse taken' onderaan zou een
    // enkele te late taak onder álle groepen duwen.
    const in_=[_g('A','VvE A'), _g('B','VvE B'), _g('A','VvE A'), _g('C','VvE C'), _g('B','VvE B')];
    const {rijen,koppen}=groepeerPerVve(in_);
    eq('groepeer: evenveel rijen', rijen.length, 5);
    eq('groepeer: A-groep staat vooraan', rijen.slice(0,2).map(r=>r.code), ['A','A']);
    eq('groepeer: de losse C blijft tussen de groepen staan', rijen[2].code, 'B');
    eq('groepeer: twee koppen', koppen.size, 2);
    eq('groepeer: kop op index 0', koppen.get(0).code, 'A');
    eq('groepeer: kop telt de zichtbare taken', koppen.get(0).aantal, 2);
    eq('groepeer: geen kop voor een VvE met één taak', [...koppen.values()].some(k=>k.code==='C'), false);
  })();
  (() => {
    // Groeperen op de GETRIMDE, kleingeschreven code. Een spatie of hoofdletterverschil in
    // kolom A zou anders één VvE in twee groepen splitsen die allebei dezelfde zichtbare code
    // tonen met verschillende aantallen.
    const {koppen}=groepeerPerVve([_g(' 311129 ','VvE X'), _g('311129','VvE X'), _g('B','VvE B')]);
    eq('groepeer: getrimde code vormt één groep', koppen.size, 1);
    eq('groepeer: de groep telt er twee', [...koppen.values()][0].aantal, 2);
  })();
  (() => {
    // INDEX-gesleuteld, niet op rijSleutel: twee rijen met hetzelfde taaknummer in één lijst
    // bestaan echt (checkNummers meldt ze aan de gebruiker), en met een Map op sleutel zou de
    // tweede de eerste overschrijven en een kop stil wegvallen.
    const a={...(_g('A','VvE A')), taakId:'T1'}, b={...(_g('A','VvE A')), taakId:'T1'};
    const c={...(_g('B','VvE B')), taakId:'T1'}, d={...(_g('B','VvE B')), taakId:'T1'};
    const {koppen}=groepeerPerVve([a,b,c,d]);
    eq('groepeer: dubbele taaknummers leveren nog steeds twee koppen', koppen.size, 2);
  })();
  (() => {
    const zonder=[{code:'A',naam:'VvE A',_sec:'OPPAKKEN'},{code:'A',naam:'VvE A',_sec:'OPPAKKEN'},
                  {code:'B',naam:'VvE B',_sec:'OPPAKKEN'},{code:'B',naam:'VvE B',_sec:'OPPAKKEN'}];
    eq('groepeer: rijen zonder taakId én zonder _row vallen niet samen',
       groepeerPerVve(zonder).koppen.size, 2);
  })();
  (() => {
    // De rijen blijven exact dezelfde objecten (permutatie): bulk leest state._ntdZichtbaar.
    const x=_g('A','VvE A'), y=_g('A','VvE A'), z=_g('B','VvE B');
    const {rijen}=groepeerPerVve([x,z,y]);
    eq('groepeer: permutatie, geen kopieën', rijen.every(r=>[x,y,z].includes(r)), true);
    eq('groepeer: niets kwijt', rijen.length, 3);
  })();
  eq('groepeer: lege lijst', groepeerPerVve([]).rijen.length, 0);
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```

- [ ] **Stap 3: Schrijf de implementatie**

In `src/render-lijsten.js`:

```js
// Zet taken van dezelfde VvE bij elkaar, zonder de volgorde van filterNtd op zijn kop te zetten.
//
// DE REGEL: een VvE met TWEE OF MEER zichtbare taken vormt een groep, en die groep komt op de
// plek van zijn URGENTSTE lid te staan. Een VvE met één zichtbare taak blijft precies staan waar
// hij stond. Er wordt dus alleen naar voren gehaald, nooit naar achteren geduwd.
//
// WAAROM GEEN RESTBAK. De eerste opzet zette alle VvE's met één taak in een blok 'Losse taken'
// onderaan. Daarmee zakt een enkele taak die te laat is onder álle groepen, bij PG=25 desnoods
// naar pagina 2 — en dat breekt precies de urgentiebelofte waar deze lijst op gebouwd is.
//
// `koppen` is gesleuteld op de INDEX in `rijen` en niet op `rijSleutel(r)`. Dat is geen smaak:
// `rijSleutel` botst zodra twee rijen in dezelfde lijst hetzelfde taaknummer dragen (een geval
// dat `checkNummers` aan de gebruiker meldt) en geeft 'Rundefined' voor elke rij zonder taakId
// én zonder _row. Met een Map op sleutel zou de kop van een groep stil wegvallen en zou één taak
// onder de kop van een ándere VvE komen te staan.
//
// De code wordt getrimd en kleingeschreven vergeleken — zoals crud.js, dubbelcheck.js,
// render-alv.js, palette.js en vve-zoekveld.js dat allemaal al doen. Zonder dat splitst een
// spatie in kolom A één VvE in twee groepen met dezelfde zichtbare code.
export function groepeerPerVve(rows){
  const lijst = rows || [];
  const sleutel = r => String((r && r.code) || '').trim().toLowerCase();
  const tel = new Map();
  lijst.forEach(r => tel.set(sleutel(r), (tel.get(sleutel(r)) || 0) + 1));

  const rijen = [], koppen = new Map();
  const gedaan = new Set();
  lijst.forEach(r => {
    const s = sleutel(r);
    if (gedaan.has(s)) return;                      // deze groep is al geplaatst
    if ((tel.get(s) || 0) < 2) { rijen.push(r); return; }   // losse taak: blijft staan
    gedaan.add(s);
    const leden = lijst.filter(x => sleutel(x) === s);
    koppen.set(rijen.length, {
      code: (r.code || '').trim(),
      naam: r.naam || '',
      aantal: leden.length,
      teLaat: leden.filter(x => teLaatVoorTelling(x, x._sec)).length,
    });
    leden.forEach(x => rijen.push(x));
  });
  return { rijen, koppen };
}
```

Let op: de lege sleutel (`''`, een rij zonder code) telt als één groep zodra er twee zulke rijen zijn. Dat is gewenst — twee rijen zonder VvE-code horen visueel ook bij elkaar — maar de kop toont dan een lege code. Voeg daarom in de `koppen.set` een terugval toe: `code: (r.code||'').trim() || 'Zonder code'`.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```

- [ ] **Stap 5: Commit**

```bash
git add src/render-lijsten.js src/tests.js
git commit -m "Groeperen per VvE: de pure functie

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: De groepskop tekenen, binnen de blokken en over paginagrenzen

**Files:**
- Modify: `src/render-tabel.js:118-148` (`renderTbody`), `src/render-lijsten.js:373-395` (`renderNtd`), `styles.css:602`
- Test: `src/tests.js`

**Interfaces:**
- Consumes: `groepeerPerVve`
- Produces: `renderTbody(tbodyId, rows, sec, page, isAf, filtered, perVve)` — zevende parameter, standaard `false`

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── De groepskop in de tabel ──
  (() => {
    const rij=(code,naam)=>({code,naam,actiepunt:'x',deadline:'',behandelaar:'Jer',prioriteit:'',
                             opmerkingen:'',inBehandeling:'FALSE',_sec:'OPPAKKEN',_row:0});
    const tb=document.getElementById('ntd-tbody');
    renderTbody('ntd-tbody',[rij('A','VvE A'),rij('A','VvE A'),rij('B','VvE B')],'OPPAKKEN',1,false,false,true);
    const koppen=tb.querySelectorAll('tr.grp-vve');
    eq('groepskop: één kop voor de VvE met twee taken', koppen.length, 1);
    truthy('groepskop: toont "2 taken hier"', koppen[0].textContent.includes('2 taken hier'));
    // Het aantal staat in de ZICHTBARE tekst en niet alleen in een title: op een telefoon is er
    // geen hover, met het toetsenbord is title onbereikbaar, en sommige schermlezers lezen title
    // IN PLAATS VAN de celtekst.
    eq('groepskop: geen tabstop erbij', koppen[0].querySelector('[tabindex]'), null);
    eq('groepskop: geen data-row (niet te verwarren met een taakrij)',
       koppen[0].hasAttribute('data-row'), false);
    truthy('groepskop: rowheader voor een schermlezer',
       koppen[0].querySelector('td').getAttribute('role')==='rowheader');
    // display:flex op een <td> haalt hem uit de tabelopmaak — dat is in dit bestand al een keer
    // teruggedraaid met uitleg. De flex hoort op een wikkel BINNEN de cel.
    truthy('groepskop: de flex zit op een wikkel, niet op de td',
       !!koppen[0].querySelector('td > .grp-in'));
    const cs=koppen[0].querySelector('td').getAttribute('colspan');
    eq('groepskop: colspan telt alle kolommen', Number(cs), SECS['OPPAKKEN'].cols.length+1);
  })();
  (() => {
    // In de selecteerstand schuift er een kolom vóór; de colspan moet meetellen.
    const was=state.bulkMode; state.bulkMode=true;
    const rij=(code)=>({code,naam:'VvE '+code,actiepunt:'x',deadline:'',behandelaar:'',prioriteit:'',
                        opmerkingen:'',inBehandeling:'FALSE',_sec:'OPPAKKEN',_row:0});
    renderTbody('ntd-tbody',[rij('A'),rij('A')],'OPPAKKEN',1,false,false,true);
    const td=document.querySelector('#ntd-tbody tr.grp-vve td');
    eq('groepskop: colspan in de selecteerstand', Number(td.getAttribute('colspan')),
       SECS['OPPAKKEN'].cols.length+2);
    state.bulkMode=was;
  })();
  (() => {
    // Groeperen gebeurt BINNEN de drie blokken: een weggelegde taak mag nooit tussen de actieve
    // komen te staan.
    const a={code:'A',naam:'VvE A',actiepunt:'x',deadline:'',behandelaar:'',prioriteit:'',
             opmerkingen:'',inBehandeling:'FALSE',_sec:'OPPAKKEN',_row:0};
    const b={...a, inBehandeling:'TRUE'};
    renderTbody('ntd-tbody',[a,{...a},b,{...b}],'OPPAKKEN',1,false,false,true);
    const html=document.getElementById('ntd-tbody').innerHTML;
    truthy('groepskop: het blok "In behandeling" staat er nog',
       html.includes('In behandeling'));
    truthy('groepskop: de VvE-kop komt vóór het blok In behandeling',
       html.indexOf('grp-vve') < html.indexOf('In behandeling'));
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```

- [ ] **Stap 3: Schrijf de implementatie**

Vervang `renderTbody` in `src/render-tabel.js:118-148`. De groepering gebeurt **binnen** elk van de drie blokken, ná het snijden van de pagina zodat de kop van een groep die over een paginagrens valt op de volgende pagina herhaald wordt:

```js
function renderTbody(tbodyId,rows,sec,page,isAf,filtered,perVve){
  const p=Math.min(Math.max(1,page),Math.max(1,Math.ceil(rows.length/PG)));
  const sl=rows.slice((p-1)*PG,p*PG);
  const el=document.getElementById(tbodyId);
  const leegCols=isAf?7:(SECS[sec].cols.length+1+(state.bulkMode?1:0));
  if(!sl.length){el.innerHTML=`<tr><td colspan="${leegCols}">${emptyRow(leegCols,true,filtered)}</td></tr>`;return}
  if(isAf){el.innerHTML=sl.map(r=>rowAf(r,sec)).join('');return}
  const grpOf = r => opvolgStatus(r).weggelegd ? 2 : (r.inBehandeling==='TRUE' ? 1 : 0);
  const main=sl.filter(r=>grpOf(r)===0);
  const ib=sl.filter(r=>grpOf(r)===1);
  const wg=sl.filter(r=>grpOf(r)===2);
  const ibAll=rows.filter(r=>grpOf(r)===1).length, wgAll=rows.filter(r=>grpOf(r)===2).length;
  const cols=SECS[sec].cols.length+1+(state.bulkMode?1:0);
  // Groeperen BINNEN elk blok. Over de blokken heen zou een weggelegde taak tussen de actieve
  // komen te staan; de drie blokken zijn de bovenliggende indeling en blijven dat.
  //
  // En ná het snijden van de pagina: een groep kan over een paginagrens vallen, en dan hoort de
  // kop boven aan de volgende pagina opnieuw te staan. Dat de aantallen op zo'n vervolgkop over
  // de HELE groep gaan en niet over het zichtbare deel is met opzet — anders zegt de tweede kop
  // '1 taak hier' voor een groep van vier.
  const blok = (lijst) => {
    if(!perVve) return lijst.map(r=>rowNtd(r,sec)).join('');
    const {rijen,koppen}=groepeerPerVve(lijst);
    return rijen.map((r,i)=>{
      const k=koppen.get(i);
      return (k?vveGroepKop(k,cols):'')+rowNtd(r,sec);
    }).join('');
  };
  let html=blok(main);
  if(ib.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('chevronRechts',12)} In behandeling (${ibAll})</td></tr>`;
    html+=blok(ib);
  }
  if(wg.length){
    html+=`<tr><td colspan="${cols}" class="grp-kop">${ico('pauze',12)} Weggelegd (${wgAll}) — komt terug op de opvolgdatum</td></tr>`;
    html+=blok(wg);
  }
  el.innerHTML=html;
}

// De kopregel boven de taken van één VvE.
//
// Geen tabindex en geen role="button": de kop is niet klikbaar, en tien koppen met een tabstop
// ertussen maken de lijst met het toetsenbord onbruikbaar — te meer omdat de tbody elke acht
// seconden hertekend wordt zonder focusherstel. `role="rowheader"` kost niets en geeft een
// schermlezer wél het verband met de rijen eronder.
//
// De flex staat op de wikkel en NIET op de <td>: display:flex op een td haalt hem uit de
// tabelopmaak, de browser wikkelt er een anonieme cel omheen, de colspan telt niet meer mee en de
// kopband klapt terug naar de breedte van kolom 1. Die fout staat elders in dit bestand al
// beschreven.
//
// 'taken hier' en niet 'taken': het getal gaat over de ZICHTBARE lijst. Staat er een filter aan,
// dan is het aantal kleiner dan wat de VvE werkelijk open heeft staan.
function vveGroepKop(k, cols){
  // De te-laat-pil vervalt als het statusfilter 'te laat' aanstaat: dan is élke zichtbare rij te
  // laat en zou er twee keer hetzelfde getal op de kop staan.
  const pil = (k.teLaat>0 && state.ntdStatus!=='telaat')
    ? `<span class="grp-w">${k.teLaat} te laat</span>` : '';
  return `<tr class="grp-kop grp-vve"><td colspan="${cols}" role="rowheader"><div class="grp-in">`
       + `<span class="grp-cd">${esc(k.code)}</span>`
       + `<span class="grp-nm">${esc(k.naam)}</span>`
       + `<span class="grp-ct">${k.aantal} taken hier</span>${pil}`
       + `</div></td></tr>`;
}
```

In `src/render-lijsten.js:391`, geef de stand door: `renderTbody('ntd-tbody',zichtbaar,state.activeNtd,pgs.ntd,false,erIsGefilterd(filters),perVveActief())`.

In `styles.css`, naast `.grp-kop` (r.602):

```css
    /* De groepskoppen volgen de dichtheidsknop. `.grp-kop` stond op vaste padding en luisterde
       niet naar --row-py/--row-px; bij tien groepen kost dat in de compacte stand ~300px die de
       compacte gebruiker juist niet wilde. */
    .grp-kop{padding:var(--row-py,9px) var(--row-px,26px)}
    /* Border-top en géén cursor:pointer: `.bdl-paneel` gebruikt dezelfde --group-bg en ís
       uitklapbaar. Zonder onderscheid nodigt deze kop uit tot een klik die niets doet. */
    .grp-vve td{border-top:1px solid var(--bor)}
    .grp-in{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .grp-cd{font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--ac)}
    .grp-nm{font-size:12.5px;font-weight:700;color:var(--txt);text-transform:none;letter-spacing:0}
    .grp-ct{font-size:11px;font-weight:600;color:var(--mut);text-transform:none;letter-spacing:0}
    .grp-w{font-size:10.5px;font-weight:700;color:var(--sig-crit);background:var(--rd-l);border:1px solid var(--rd-b);padding:1px 6px;border-radius:999px;text-transform:none;letter-spacing:0}
```

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
```

- [ ] **Stap 5: Commit**

```bash
git add src/render-tabel.js src/render-lijsten.js styles.css src/tests.js
git commit -m "Groeperen per VvE: de kopregel, binnen de blokken

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: De schakelaar 'Per VvE'

**Files:**
- Modify: `index.html:166-171` (filterbalk), `src/state.js:159-160`, `src/main.js` (localStorage + bedrading), `src/actions.js`, `src/render-lijsten.js`
- Test: `src/tests.js`

**Interfaces:**
- Produces: `state.ntdPerVve` (boolean), `perVveActief()` in `render-lijsten.js` — waar als de stand aan staat **en** er niet op een kolomkop gesorteerd wordt

- [ ] **Stap 1: Schrijf de falende toetsen**

```js
  // ── De schakelaar ──
  truthy('schakelaar Per VvE staat in de filterbalk', !!document.getElementById('pervve-btn'));
  eq('schakelaar heeft aria-pressed',
     document.getElementById('pervve-btn').hasAttribute('aria-pressed'), true);
  (() => {
    const wasP=state.ntdPerVve, wasS=state.ntdSort;
    state.ntdPerVve=true; state.ntdSort=null;
    truthy('perVveActief: aan als de schakelaar aanstaat', perVveActief());
    // Kolomkop-sortering WINT. Anders belooft aria-sort="ascending" een volgorde die de
    // groepering breekt, en sorteerNtd legt expliciet vast dat een taak zonder deadline altijd
    // onderaan hoort.
    state.ntdSort={key:'deadline',asc:true};
    eq('perVveActief: uit zodra er op een kolomkop gesorteerd wordt', perVveActief(), false);
    state.ntdSort=null; state.ntdPerVve=false;
    eq('perVveActief: uit als de schakelaar uitstaat', perVveActief(), false);
    state.ntdPerVve=wasP; state.ntdSort=wasS;
  })();
  (() => {
    // Groeperen blijft aan tijdens zoeken/filteren — anders dan de bundelstapel, want een groep
    // zegt iets over de ZICHTBARE lijst en dat blijft kloppen.
    const wasP=state.ntdPerVve; state.ntdPerVve=true;
    const wasQ=document.getElementById('s-ntd').value;
    document.getElementById('s-ntd').value='x';
    truthy('perVveActief: blijft aan tijdens zoeken', perVveActief());
    document.getElementById('s-ntd').value=wasQ; state.ntdPerVve=wasP;
  })();
```

- [ ] **Stap 2: Draai en zie ze falen**

```bash
python3 tools/toetsen.py
```

- [ ] **Stap 3: Schrijf de implementatie**

In `index.html`, in de filterbalk vóór de knop `#bulk-btn`:

```html
            <button class="btn btn-sec btn-sm" id="pervve-btn" data-action="pervve-toggle"
                    aria-pressed="false" title="Taken van dezelfde VvE bij elkaar zetten">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V8l6-4 6 4v12" fill="currentColor" fill-opacity="0.18"/><path d="M4 20h16M9 20v-4h3v4"/></svg>
              Per VvE
            </button>
```

In `src/state.js`, naast `ntdSort`/`ntdStatus`:

```js
  // App-breed en niet per tabblad: 'Per VvE' is een manier van kijken, geen eigenschap van één
  // lijst. Bewaard in localStorage, zelfde patroon als de dichtheidsknop.
  ntdPerVve:false,
```

In `src/main.js`, bij het opstarten naast de dichtheidsstand:

```js
  try{ state.ntdPerVve = localStorage.getItem('ntdPerVve')==='1'; }catch(_){}
  zetPerVveKnop();
```

met:

```js
function zetPerVveKnop(){
  const b=document.getElementById('pervve-btn'); if(!b) return;
  b.setAttribute('aria-pressed', state.ntdPerVve?'true':'false');
  b.classList.toggle('on', state.ntdPerVve);
}
```

In `src/actions.js`:

```js
  'pervve-toggle': () => {
    state.ntdPerVve = !state.ntdPerVve;
    try{ localStorage.setItem('ntdPerVve', state.ntdPerVve?'1':'0'); }catch(_){}
    zetPerVveKnop();
    renderNtd();
  },
```

In `src/render-lijsten.js`:

```js
// Groeperen per VvE is aan als de schakelaar aanstaat ÉN er niet op een kolomkop gesorteerd
// wordt. Sortering wint: `aria-sort="ascending"` op de kop belooft anders een volgorde die de
// groepering breekt, en `sorteerNtd` legt expliciet vast dat een taak zonder deadline altijd
// onderaan hoort. Zoeken en filteren zetten hem NIET uit — anders dan de bundelstapel, want de
// kop zegt 'N taken hier' en dat blijft binnen een gefilterde lijst gewoon kloppen.
export function perVveActief(){
  return !!state.ntdPerVve && !(state.ntdSort && state.ntdSort.key);
}
```

Toon in de knop dat sortering hem uitzet: geef hem `.gedempt` als `state.ntdPerVve && !perVveActief()`, met `title="Staat uit zolang er op een kolomkop gesorteerd wordt"`.

- [ ] **Stap 4: Draai en zie ze slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js && python3 tools/toetsen.py
python3 tools/toetsen.py --breed 1150 --hoog 800
```

- [ ] **Stap 5: Commit**

```bash
git add index.html src/state.js src/main.js src/actions.js src/render-lijsten.js src/tests.js
git commit -m "Schakelaar 'Per VvE' in de filterbalk

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Versie ophogen en de eindronde

**Files:**
- Modify: `src/config.js:8`, `sw.js:25`, `sw.js:32`

- [ ] **Stap 1: Hoog alle drie de getallen op**

`src/config.js:8` → `export const APP_VERSION = '12.8';`
`sw.js:25` → `const CACHE_VERSION = 'cd-v155';`
`sw.js:32` → `const APP_VERSION = '12.8';`

Alle drie. tests.js:685-688 vergelijkt `sw.js` en `config.js` alléén met elkaar — allebei vergeten ophogen is groen, en dan blijft de service worker byte-identiek en draaien ingelogde sessies de oude modules en de oude `styles.css` door.

- [ ] **Stap 2: Draai de volle ronde op drie breedtes**

```bash
osascript -l JavaScript tools/syntaxcheck.js
python3 tools/toetsen.py --breed 1150 --hoog 800
python3 tools/toetsen.py --breed 1440 --hoog 900
python3 tools/toetsen.py --breed 1920 --hoog 1080
```
Alle drie 0 FAIL.

- [ ] **Stap 3: Commit**

```bash
git add src/config.js sw.js
git commit -m "Versie 12.8 / cd-v155

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Stap 4: Naar staging**

```bash
git checkout staging && git merge feat/vier-updates-2026-09 && git push origin staging
```

- [ ] **Stap 5: Ingelogd doortesten op de testomgeving**

Op `collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`, met de test-Sheet:
- een taak afronden zonder opmerking (moet weigeren met een zichtbare melding), daarna mét;
- undo van die afronding — staat er een `Teruggezet`-regel in de tijdlijn?
- bulk drie taken afronden met één gedeelde opmerking; kijk in de Sheet of kolom J bij alle drie gevuld is;
- de drie dossierstanden;
- de schakelaar 'Per VvE' met en zonder filter, en met kolomkop-sortering aan;
- het aannemerspaneel openen door érgens in de offertecel te klikken;
- beide thema's, en de drie dichtheidsstanden.

- [ ] **Stap 6: Naar productie**

```bash
git checkout main && git merge staging && git push origin main
```

- [ ] **Stap 7: Meten op de productie-URL**

```bash
python3 tools/toetsen.py --url https://vvebeheercollectief.github.io/Collectief-Dashboard/
```
GitHub Pages cachet modules tien minuten; loopt de suite op oude code, wacht dan even en meet opnieuw.

---

## Zelfcontrole van dit plan

**Dekking van de spec.** §1.1 → Task 2 (allowlist, `LOG_VERBORGEN` ongemoeid). §1.2 → Task 2. §1.3 → Task 1 + 2 + 3 (bewerkstand-guard). §1.4 → Task 5. §1.5 → Task 2 (`.log-note-plat`). §1.6 → Task 3. §1.7 → Task 4. §1.8 → Task 9. §2.1 → Task 6. §2.2 → Task 6 (geen `disabled`). §2.3 → Task 6 (klik-naast). §2.4 → Task 5. §2.5 → Task 7. §2.6 → Task 8. §2.7 → geen code. §3.1-3.3 → Task 10. §3.4 → Task 11. §4.2-4.3 → Task 12. §4.4-4.6 → Task 13. §4.7-4.8 → Task 14. §5 → per taak. §6 → Task 15.

**Namen die over taken heen lopen.** `afrondOpmerking`, `logBewerkbaar` (Task 1) → gebruikt in Task 2, 4, 9. `afrondLogRegel` (Task 5) → Task 7. `afrondInvoerOk`, `AFROND_SNELKEUZES` (Task 6) → Task 7. `groepeerPerVve` (Task 12) → Task 13. `perVveActief` (Task 14) → Task 13 leest hem via `renderNtd`; Task 13 en 14 horen daarom achter elkaar te draaien en samen naar staging.

**Wat dit plan bewust niet doet.** Geen bewerkweg op kolom J van 'Afgerond' (een typo in de verplichte opmerking is niet te herstellen — los vervolgpunt, staat in §7 van de spec). Geen variant C. Geen wijziging aan de Apps Script.
