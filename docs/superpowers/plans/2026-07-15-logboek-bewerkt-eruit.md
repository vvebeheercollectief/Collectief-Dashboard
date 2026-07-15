# Logboek: 'Bewerkt' eruit + mail-opmaak behouden — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 'Bewerkt' verdwijnt uit het logboek (nieuw én bestaand, 395 regels), en een geplakte mail behoudt overal zijn regeleinden.

**Architecture:** Drie kleine, losstaande ingrepen in de frontend plus één eenmalige backend-opschoning. Kern is `parseLogboek` in `src/render-overig.js`: door 'Bewerkt' daar bij het inlezen te laten vallen, verdwijnt het in één klap uit álle weergaves (VvE-dossier, taak-popup, Logboek-pagina), uit de stil-berekening (`bepaalStil`/`dagenStil`) én uit de AI-chat-context — en het blijft weg, ook als er ooit nog een losse regel via de webhook binnenkomt. Punt 3 is een eenregelige klassewissel: de taak-popup gaat dezelfde `.log-note` gebruiken die het dossier al gebruikt.

**Tech Stack:** Statische PWA, geen bundler, geen Node op deze machine. ES-modules in `src/`, `styles.css`, `sw.js`. Backend = Google Apps Script (`apps-script/`), deployt via CI. Tests: `src/tests.js`, draaien in de browser via `?test=1`.

**Spec:** `docs/superpowers/specs/2026-07-15-logboek-bewerkt-eruit-design.md`
**Tak:** `feat/logboek-bewerkt-eruit` (vertakt van `main`)

---

## Achtergrondfeiten (geverifieerd, niet aannemen)

- 'Bewerkt' = **395** van **1177** logregels op PROD; na opschoning blijven er **782** over.
- De 395 rijen vormen **254** aaneengesloten blokken (grootste blok: 9 rijen).
- Er bestaat **geen enkele** rij `'Herhaalregel bewerkt'`, maar die actie wórdt geschreven
  (`render-herhaal.js:96`) — exact-match is dus verplicht, met test.
- Het stil-effect is nagerekend: **0** taken krijgen een nieuwe stille-taken-pill.
- `cd_withLock` bestaat in `apps-script/Notifications.gs:45`.
- Testhelpers in `src/tests.js`: `eq(label, got, exp)` (JSON-vergelijk) en `truthy(label, got)`.

---

## Task 1: `parseLogboek` filtert 'Bewerkt' — met correcte `_row`

De valkuil: de huidige functie doet `.filter(...).map((r,i)=>({_row:i+2,…}))`. De index komt
ná het filteren, dus een filter dat rijen laat vallen zou élk `_row` laten opschuiven — en
`_row` is precies wat het Logboek-scherm gebruikt om de juiste regel te bewerken/verwijderen.
Daarom: `_row` uit de **ruwe** index, filter **ná** de `map`.

**Files:**
- Modify: `src/render-overig.js:168-181`
- Test: `src/tests.js` (import op regel 5, testblok bij de `logPaginaSoort`-tests rond regel 135)

- [ ] **Step 1: Zet `parseLogboek` in de test-import**

In `src/tests.js` regel 5, voeg `parseLogboek` toe:

```js
import { logZin, logPaginaSoort, parseLogboek, _shiftRows, logEditWrite } from "./render-overig.js";
```

- [ ] **Step 2: Schrijf de falende tests**

In `src/tests.js`, direct ná de bestaande `logPaginaSoort`-tests (na de regel
`eq('logPaginaSoort Bewerkt → ruis (null)', logPaginaSoort('Bewerkt'), null);`) invoegen:

```js
  // ── parseLogboek ── ('Bewerkt' was 1 op de 3 logregels en is pure ruis: elke taak-opslag
  //    schreef er één. Sinds v6.3 loggen we ze niet meer én filteren we ze bij het inlezen weg.
  //    _row moet het ECHTE Sheet-rijnummer blijven — daar hangt bewerken/verwijderen aan.)
  const _lbRows = [
    ['Timestamp','VvE Code','Sectie','Actie','Veld','Oude Waarde','Nieuwe Waarde','Gebruiker'],
    ['2026-07-01T10:00:00.000Z','381158','OPPAKKEN','Opmerking','','','Gebeld met Zuiderwijk','Cihad'],
    ['2026-07-01T10:05:00.000Z','381158','OPPAKKEN','Bewerkt','','','','Cihad'],
    ['2026-07-01T10:10:00.000Z','381158','OPPAKKEN','Herhaalregel bewerkt','','','maandelijks','Cihad'],
    ['2026-07-01T10:15:00.000Z','381158','OPPAKKEN','Afgerond','status','Nog Te Doen','Afgerond op 1 juli','Jer'],
  ];
  const _lb = parseLogboek(_lbRows);
  eq('parseLogboek laat Bewerkt vallen', _lb.filter(r => r.actie === 'Bewerkt').length, 0);
  eq('parseLogboek houdt "Herhaalregel bewerkt" (exact-match)', _lb.filter(r => r.actie === 'Herhaalregel bewerkt').length, 1);
  eq('parseLogboek houdt de overige regels', _lb.length, 3);
  eq('parseLogboek _row Opmerking = 2', _lb.find(r => r.actie === 'Opmerking')._row, 2);
  eq('parseLogboek _row Herhaalregel = 4 (schuift niet op door de gefilterde Bewerkt)', _lb.find(r => r.actie === 'Herhaalregel bewerkt')._row, 4);
  eq('parseLogboek _row Afgerond = 5 (schuift niet op)', _lb.find(r => r.actie === 'Afgerond')._row, 5);
  eq('parseLogboek nieuwste eerst', _lb[0].actie, 'Afgerond');
  // Lege rij tussendoor mag _row evenmin laten opschuiven
  const _lbGap = parseLogboek([
    ['Timestamp','VvE Code','Sectie','Actie','Veld','Oude Waarde','Nieuwe Waarde','Gebruiker'],
    ['2026-07-01T10:00:00.000Z','381158','OPPAKKEN','Opmerking','','','eerste','Cihad'],
    [],
    ['2026-07-01T10:20:00.000Z','381158','OPPAKKEN','Opmerking','','','tweede','Cihad'],
  ]);
  eq('parseLogboek negeert lege rij', _lbGap.length, 2);
  eq('parseLogboek _row na lege rij = 4', _lbGap.find(r => r.nieuweWaarde === 'tweede')._row, 4);
  eq('parseLogboek _row vóór lege rij = 2', _lbGap.find(r => r.nieuweWaarde === 'eerste')._row, 2);
  // De stil-berekening leunt hierna op écht werk (de notitie) i.p.v. op een taak-opslag.
  // Dit is wat vooraf gemeten is: 'Opmerking' en 'Bewerkt' staan vrijwel altijd op dezelfde
  // dag, dus het wegvallen van 'Bewerkt' verschuift de stil-dagen niet.
  const _stilLogT = new Date(2026, 6, 15); // 15 juli 2026
  const _stilLogB = parseLogboek([
    ['Timestamp','VvE Code','Sectie','Actie','Veld','Oude Waarde','Nieuwe Waarde','Gebruiker'],
    ['2026-07-10T09:00:00','381158','OPPAKKEN','Opmerking','','','Gebeld met Zuiderwijk','Cihad'],
    ['2026-07-10T09:01:00','381158','OPPAKKEN','Bewerkt','','','','Cihad'],
  ]);
  eq('stil: rekent vanaf de notitie, Bewerkt is weggefilterd',
     dagenStil({code:'381158', inBehandeling:'TRUE', deadline:''}, 'OPPAKKEN', _stilLogB, _stilLogT), 5);
```

`dagenStil` staat al in de imports (`src/tests.js:18`). De 10e juli → 15 juli = 5 dagen;
`dagenStil` geeft positieve dagen-geleden terug (`_verschilInKalenderdagen(vandaag, laatst)`).

- [ ] **Step 3: Draai de tests en controleer dat ze falen**

Start de preview-server (poort 8123, `Cache-Control: no-store`):

```
preview_start name=dashboard
```

Navigeer naar `http://localhost:8123/index.html?test=1` en lees `window._testResult`
(formaat: `"N OK, M FAIL"`).

> **Meet eerst de baseline** op een schone `main` en noteer het getal — ga niet uit van een
> getal uit een eerdere sessie. Ná deze taak moeten er precies **11** tests bij zijn en moet
> `FAIL` nul zijn.

Verwacht nu: **FAIL** op `parseLogboek laat Bewerkt vallen` (kreeg 1, verwacht 0), op
`parseLogboek houdt de overige regels` (kreeg 4, verwacht 3) en op de `_row`-tests.

> **Cache-valkuil** (kostte eerder een ronde): ook met `no-store` kan een eerder
> geregistreerde service worker oude modules serveren. Eenmalig opschonen in de console:
> `navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))` en
> `caches.keys().then(ks=>ks.forEach(k=>caches.delete(k)))`, daarna verse navigatie.

- [ ] **Step 4: Herschrijf `parseLogboek`**

In `src/render-overig.js`, vervang regels 168-181 (de hele functie) door:

```js
// 'Bewerkt' is ruis: elke taak-opslag schreef er één (395 van de 1177 regels). Sinds v6.3
// schrijven we ze niet meer; dit filter houdt de bestaande regels — en alles wat nog via de
// webhook binnen kan komen — uit álle weergaves én uit de activiteitsberekening van
// bepaalStil/dagenStil.
const LOG_VERBORGEN = new Set(['Bewerkt']);

function parseLogboek(rows){
  if(!rows||rows.length<2) return [];
  // _row komt uit de RUWE index: het filter hieronder mag het Sheet-rijnummer niet laten
  // opschuiven, want daar hangt bewerken/verwijderen op de Logboek-pagina aan.
  return rows.slice(1).map((r,i)=>{
    const c=j=>((r&&r[j])||'').trim();
    return {
      _row:i+2,
      timestamp:c(0), code:c(1), sectie:c(2), actie:c(3),
      veld:c(4), oudeWaarde:c(5), nieuweWaarde:c(6), gebruiker:c(7)
    };
  }).filter(o=>o.timestamp&&!LOG_VERBORGEN.has(o.actie)).reverse();
}
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

Herlaad `http://localhost:8123/index.html?test=1`, lees `window._testResult`.
Verwacht: **0 FAIL**, en het totaal is exact **11** hoger dan de baseline uit Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/render-overig.js src/tests.js
git commit -m "Logboek: 'Bewerkt' wegfilteren bij het inlezen

Eén plek, en daarmee weg uit dossier, taak-popup, Logboek-pagina, de
stil-berekening én de AI-chat-context. _row komt nu uit de ruwe index
zodat het filter het Sheet-rijnummer niet laat opschuiven — daar hangt
bewerken/verwijderen aan. Exact-match, dus 'Herhaalregel bewerkt' blijft."
```

---

## Task 2: Stop met 'Bewerkt' loggen

**Files:**
- Modify: `src/crud.js:362`

- [ ] **Step 1: Verwijder de logregel**

In `src/crud.js`, binnen de `backgroundWrite`-callback van de bewerk-tak, verwijder deze regel:

```js
          logEvent(code,sec,'Bewerkt','','','');
```

Het blok eromheen blijft ongewijzigd — met name de `Behandelaar gewijzigd`-log erboven:

```js
          await assertRowMatch(doelRow._row, oudeWaarden.code); // bescherming: rij nog dezelfde VvE vóór overschrijven
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'')){
            fireNotifEvent('assigned',{sec,code,naam,behandelaar:newBeh});
            logEvent(code,sec,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
          }
```

- [ ] **Step 2: Controleer dat er geen schrijver overblijft**

```bash
grep -rn "'Bewerkt'" src/ apps-script/ | grep -v tests.js
```

Verwacht: alleen nog de weergave-plekken in `src/render-overig.js` (regels ~195, ~238, ~281)
en de `LOG_VERBORGEN`-set. **Geen enkele** `logEvent(...,'Bewerkt',...)` meer.

- [ ] **Step 3: Draai de tests**

Herlaad `http://localhost:8123/index.html?test=1`. Verwacht: **0 FAIL** (ongewijzigd t.o.v. Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/crud.js
git commit -m "Logboek: stop met 'Bewerkt' loggen bij taak-opslag"
```

---

## Task 3: Dode 'Bewerkt'-weergavecode opruimen

Na Task 1 kan een 'Bewerkt'-regel de render nooit meer bereiken. Deze drie plekken zijn
daarmee dood.

**Files:**
- Modify: `src/render-overig.js:195` (`actieBadge`), `:238` (`logZin`), `:281` (oud→nieuw-regel)

- [ ] **Step 1: Haal de badge weg**

In `actieBadge`, verwijder deze regel uit `map`:

```js
    'Bewerkt':['--sec:var(--ac);--sec-l:var(--ac-l)','✎'],
```

- [ ] **Step 2: Haal de zin weg**

In `logZin`, verwijder deze `case`:

```js
    case'Bewerkt':             return A('bewerkte','var(--ac)')+chip+(r.veld?` <span style="color:var(--mut)">— ${esc(r.veld)}</span>`:'');
```

- [ ] **Step 3: Haal 'Bewerkt' uit de oud→nieuw-regel**

In `logItemHtml`, regel 281 — let op: `'Behandelaar gewijzigd'` en `'Kenmerk'` blijven staan:

```js
  if((r.actie==='Behandelaar gewijzigd'||r.actie==='Kenmerk') && r.veld && (r.oudeWaarde||r.nieuweWaarde)){
```

- [ ] **Step 4: Draai de tests**

Herlaad `http://localhost:8123/index.html?test=1`. Verwacht: **0 FAIL**.

De bestaande test `logPaginaSoort Bewerkt → ruis (null)` blijft slagen: `logPaginaSoort`
heeft geen `'Bewerkt'`-tak en valt terug op `null`.

- [ ] **Step 5: Commit**

```bash
git add src/render-overig.js
git commit -m "Logboek: dode 'Bewerkt'-weergavecode opruimen"
```

---

## Task 4: Mail-opmaak — regeleinden terug in de taak-popup

Dezelfde notitie leest in het VvE-dossier keurig met witregels (`.log-note` heeft
`white-space:pre-wrap`) maar wordt in de taak-popup één bonk (`.hist-change` heeft dat niet —
die klasse is bedoeld voor korte "veld: oud → nieuw"-regeltjes: 11px en grijs).

**Files:**
- Modify: `src/render-overig.js:505`

- [ ] **Step 1: Laat de notitie `.log-note` gebruiken**

In `renderTaskHistory`, regel 505. Vóór:

```js
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="hist-change">${esc(r.nieuweWaarde)}</div>`:''}
```

Ná:

```js
        ${r.actie==='Opmerking'&&r.nieuweWaarde?`<div class="log-note">${esc(r.nieuweWaarde)}</div>`:''}
```

Regel 504 (`${r.veld?`<div class="hist-change">${esc(r.veld)}: …`) **blijft** `.hist-change` —
daar is klein en grijs juist goed.

Geen CSS-wijziging nodig: `.log-note` (`styles.css:503`) heeft al precies wat nodig is —
`font-size:13px; color:var(--txt); line-height:1.55; white-space:pre-wrap; word-break:break-word`.

- [ ] **Step 2: Verifieer visueel in de preview**

De app zit achter een login-gate en module-internals staan niet op `window`; bereik ze via
dynamische import van dezelfde URL. In de console van de preview:

```js
const ro = await import('/src/render-overig.js');
const st = await import('/src/state.js');
st.D.logboek = [{
  _row: 2, timestamp: new Date().toISOString(), code: '381158', sectie: 'OPPAKKEN',
  actie: 'Opmerking', veld: '', oudeWaarde: '',
  nieuweWaarde: 'Terugkoppeling gegeven aan Zuiderwijk:\n\nNaar aanleiding van uw vraag tijdens de vergadering hebben wij navraag gedaan bij de gemeente.\n\nDe subsidie bedraagt maximaal € 12.500,- per appartement.',
  gebruiker: 'djiowchico@gmail.com'
}];
document.getElementById('fg-history').style.display = '';
ro.renderTaskHistory('381158', 'OPPAKKEN');
document.querySelector('#hist-body .log-note').outerHTML;
```

Verwacht: `class="log-note"`, en `getComputedStyle(document.querySelector('#hist-body .log-note')).whiteSpace`
geeft `"pre-wrap"`. De twee witregels blijven zichtbaar in plaats van tot één bonk te plakken.

- [ ] **Step 3: Draai de tests**

Herlaad `http://localhost:8123/index.html?test=1`. Verwacht: **0 FAIL**.

- [ ] **Step 4: Commit**

```bash
git add src/render-overig.js
git commit -m "Logboek: geplakte mail behoudt regeleinden in de taak-popup

De taak-popup gebruikte .hist-change (bedoeld voor korte oud→nieuw-
regeltjes, zonder pre-wrap) waardoor een geplakte mail één bonk werd.
Nu dezelfde .log-note als het dossier al gebruikt."
```

---

## Task 5: Versie ophogen

Zichtbare `APP_VERSION` gaat omhoog bij elke wijziging; `CACHE_VERSION` zorgt dat clients de
nieuwe modules pakken in plaats van de gecachete.

**Files:**
- Modify: `src/config.js:8`, `sw.js:4`

- [ ] **Step 1: `APP_VERSION` 6.2 → 6.3**

In `src/config.js` regel 8:

```js
export const APP_VERSION = '6.3';
```

- [ ] **Step 2: `CACHE_VERSION` cd-v57 → cd-v58**

In `sw.js` regel 4:

```js
const CACHE_VERSION = 'cd-v58';
```

- [ ] **Step 3: Draai de tests**

Herlaad `http://localhost:8123/index.html?test=1`. Verwacht: **0 FAIL** — de bestaande test
`versie: APP_VERSION heeft formaat X.Y` (`src/tests.js:638`) blijft slagen op `'6.3'`.

- [ ] **Step 4: Commit**

```bash
git add src/config.js sw.js
git commit -m "Versie 6.3 / cd-v58"
```

---

## Task 6: Eenmalige opschoning van de 395 bestaande regels

Backend-functie die je één keer draait. Server-side, onder slot, met backup vooraf. Deze
functie is bewust géén trigger en draait nergens automatisch — de handmatige "Run" ís het
bevestigingsmoment voor een onomkeerbare verwijdering.

**Files:**
- Modify: `apps-script/Extra functies.gs` (toevoegen ná `cd_schrijfLogboek`)

- [ ] **Step 1: Voeg de opschoonfunctie toe**

Onderaan de Logboek-sectie van `apps-script/Extra functies.gs`:

```js
// ── EENMALIG: 'Bewerkt'-regels opruimen (v6.3, 2026-07-15) ──────────────────
// Achtergrond: elke taak-opslag schreef een 'Bewerkt'-regel — 395 van de 1177 logregels,
// pure overzichtsvervuiling. De frontend logt ze sinds v6.3 niet meer en filtert ze bij het
// inlezen weg; deze functie ruimt de bestaande regels op.
//
// HANDMATIG DRAAIEN vanuit de Apps Script-editor. Geen trigger: de Run-klik is bewust het
// bevestigingsmoment, want verwijderen is onomkeerbaar (op het backup-tabblad na).
// Verwacht resultaat op PROD: 395 verwijderd, 782 over.
function cd_opschonenBewerkt() {
  return cd_withLock(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Logboek');
    if (!sheet) throw new Error("Tabblad 'Logboek' niet gevonden");

    const laatste = sheet.getLastRow();
    if (laatste < 2) { Logger.log('Logboek is leeg — niets te doen'); return; }

    // 1. Backup vóórdat we ook maar iets aanraken.
    const stempel = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd-HHmm');
    const backupNaam = 'Logboek backup ' + stempel;
    sheet.copyTo(ss).setName(backupNaam);
    Logger.log('Backup gemaakt: ' + backupNaam);

    // 2. Rijnummers van exact 'Bewerkt' verzamelen (kolom D = actie).
    //    Exact-match: 'Herhaalregel bewerkt' is een échte actie en moet blijven.
    const acties = sheet.getRange(2, 4, laatste - 1, 1).getValues();
    const teVerwijderen = [];
    for (let i = 0; i < acties.length; i++) {
      if (String(acties[i][0]).trim() === 'Bewerkt') teVerwijderen.push(i + 2);
    }
    Logger.log('Gevonden: ' + teVerwijderen.length + " regels 'Bewerkt' van " + (laatste - 1) + ' datarijen');
    if (!teVerwijderen.length) return { verwijderd: 0, over: laatste - 1, backup: backupNaam };

    // 3. Aaneengesloten blokken samenvoegen (395 rijen = 254 blokken) en van ONDER naar BOVEN
    //    verwijderen — andersom schuiven de rijnummers onder je weg.
    const blokken = [];
    for (let i = 0; i < teVerwijderen.length; i++) {
      const rij = teVerwijderen[i];
      const laatstBlok = blokken[blokken.length - 1];
      if (laatstBlok && rij === laatstBlok.start + laatstBlok.aantal) laatstBlok.aantal++;
      else blokken.push({ start: rij, aantal: 1 });
    }
    for (let i = blokken.length - 1; i >= 0; i--) {
      sheet.deleteRows(blokken[i].start, blokken[i].aantal);
    }

    const over = sheet.getLastRow() - 1;
    const res = { verwijderd: teVerwijderen.length, over: over, backup: backupNaam };
    Logger.log('Klaar: ' + JSON.stringify(res));
    return res;
  });
}
```

- [ ] **Step 2: Commit (nog niet draaien)**

```bash
git add "apps-script/Extra functies.gs"
git commit -m "Apps Script: eenmalige opschoonfunctie voor 'Bewerkt'-logregels

Handmatig te draaien vanuit de editor. Backup-tab vooraf, exact-match op
'Bewerkt' zodat 'Herhaalregel bewerkt' blijft, blok-gewijs van onder naar
boven, onder cd_withLock zodat het geen race geeft met een werkende collega."
```

> **Draaien gebeurt in Task 7, ná akkoord van de gebruiker en ná de code-uitrol.** De
> volgorde is bewust: de frontend filtert 'Bewerkt' dan al weg, dus het eindresultaat is
> zichtbaar en terug te draaien vóórdat er iets onomkeerbaar weg is.

---

## Task 7: Uitrol en verificatie

**Volgorde is bewust:** eerst code (omkeerbaar), dan pas de opschoning (onomkeerbaar).

- [ ] **Step 1: Testen op staging/TEST**

```bash
git checkout staging
git merge feat/logboek-bewerkt-eruit
```

> **Let op:** `staging` bevat de geparkeerde spraakmemo en is divergent van `main`. Nooit
> kaal `staging` → `main` mergen. Conflicten additief oplossen.

```bash
git push origin staging
git checkout feat/logboek-bewerkt-eruit
```

Wacht op de Vercel-branchdeploy en verifieer op
`collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`:
- `/sw.js` bevat `cd-v58`;
- een taak met notities openen → geen enkele "bewerkte"-regel meer in de popup;
- een VvE-pagina openen → geen "bewerkte"-regel in het dossier;
- een mail met witregels plakken → blijft leesbaar in beide weergaves.

- [ ] **Step 2: Akkoord vragen aan de gebruiker**

Laat het resultaat op staging zien. **Wacht op akkoord** vóór stap 3.

- [ ] **Step 3: Naar productie**

```bash
git checkout main
git merge --ff-only feat/logboek-bewerkt-eruit
git push origin main
```

`--ff-only` is de bewaking: als dit niet fast-forwardt is `main` verder gelopen — dán
stoppen en eerst diffen, niet mergen.

Verifieer daarna op `https://vvebeheercollectief.github.io/Collectief-Dashboard/` (let op:
de bare root 404't, deze URL is de echte productie):
- de versiebalk toont **6.3**;
- `/sw.js` bevat `cd-v58`.

De push naar `main` zet ook `cd_opschonenBewerkt` automatisch in het PROD-script (CI via clasp).

- [ ] **Step 4: De opschoning draaien**

**Alleen na expliciet akkoord van de gebruiker.** In de PROD-Sheet:
Extensies → Apps Script → functie `cd_opschonenBewerkt` selecteren → Run.

Lees het uitvoeringslogboek. Verwacht:

```
Backup gemaakt: Logboek backup 2026-07-15-HHmm
Gevonden: 395 regels 'Bewerkt' van 1177 datarijen
Klaar: {"verwijderd":395,"over":782,"backup":"Logboek backup 2026-07-15-HHmm"}
```

- [ ] **Step 5: Verifieer de opschoning op de Sheet**

Controleer in het 'Logboek'-tabblad:
- laatste rij is **783** (782 datarijen + koprij);
- geen enkele cel in kolom D is nog `Bewerkt`;
- het tabblad `Logboek backup 2026-07-15-HHmm` bestaat en heeft 1178 rijen;
- een steekproef op 'Herhaalregel bewerkt' — die actie mag niet gesneuveld zijn (er waren er
  0, dus de verwachting is 0; het gaat om de bevestiging dat exact-match werkte, wat de
  telling 395 al aantoont).

Herlaad het dashboard en controleer dat het logboek nog laadt en dat bewerken/verwijderen van
een logregel nog de júiste regel raakt (`_row`-regressie: open de Logboek-pagina, bewerk een
notitie, en controleer dat die notitie verandert en niet zijn buurman).

- [ ] **Step 6: Geheugen bijwerken**

Werk `project_logboek_opschoning.md` bij (of maak een nieuw projectbestand) met: 'Bewerkt'
volledig weg (nieuw + 395 retroactief, backup-tab), punt 2 bewust niet gedaan met de meting
erbij, en de `.hist-change`/`.log-note`-vondst. Voeg de regel toe aan `MEMORY.md`.

---

## Bewust niet in dit plan

- **Rich text** (vet, bullets, links) — gebruiker koos expliciet alleen regeleinden.
- **VvE-logs laten meetellen als "aangeraakt"** — voorgelegd, bewust afgewezen; gemeten
  effect is nul.
- **De TEST-Sheet opschonen** — het leesfilter uit Task 1 dekt dat af.
- **Notities clampen** bij lange mails — strijdig met de vaste voorkeur dat rijen meerekken.
- **De lege-sectie-kwestie** (82 regels met lege sectie) — blijft zoals hij is.
