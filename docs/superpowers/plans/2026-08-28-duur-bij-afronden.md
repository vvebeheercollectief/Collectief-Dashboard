# Duur bij afronden — implementatieplan

> **Voor agentische werkers:** VERPLICHTE SUB-SKILL: gebruik `superpowers:subagent-driven-development`
> (aanbevolen) of `superpowers:executing-plans` om dit plan taak voor taak uit te voeren.
> Stappen gebruiken checkbox-syntax (`- [ ]`) zodat je kunt afvinken.

**Doel:** bij het afronden van een taak één klik vragen hoe lang die duurde, en die duur in
minuten wegschrijven naar kolom M van het tabblad 'Afgerond'.

**Aanpak:** vijf knoppen als derde veld in het bestaande venster "Taak afhandelen"
(`#complete-bg`). Het venster is de enige bron van waarheid — er komt geen aparte state naast.
De duur reist mee in de `values`-array die `afrondWaarden` toch al bouwt, dus er is één
schrijfactie en geen terugkomen op een al ingevoegde rij. Twee pure hulpfuncties
(`duurUitCel` / `duurNaarCel`) zijn de enige plek waar de regel "leeg ≠ 0" staat.

**Techniek:** ES-modules zonder bundler, geen build-stap. Zelftest in `src/tests.js`, draait in
de browser via `?test=1`. Geen Node beschikbaar — syntaxcontrole via `osascript`.

**Ontwerp:** `docs/superpowers/specs/2026-08-28-duur-bij-afronden-design.md`

---

## Wat je moet weten voordat je begint

**De kolomindeling van 'Afgerond'** (vastgelegd in `afrondWaarden`, crud.js r.1117):

```
index  0..7   → A..H   sectievelden (per sectie anders, zie SECS.keys)
index  8      → I      afronddatum
index  9      → J      toelichting
index 10      → K      subcategorie
index 11      → L      herhaalId          ← cd_hr_verwerkAfrondingen (Opvolging.gs) leest afData[i][11], NIET verplaatsen
index 12      → M      LEEG               ← hier komt de duur
index 13..15  → N,O,P  leeg
index 16..18  → Q,R,S  taakId, bundelId, bundelVolg
```

De array is **19 lang** en moet 19 blijven. `src/structuurcheck.js` r.27 en een toets rond
`src/tests.js` r.2571 leggen dat vast.

**Valkuil — L en M betekenen iets anders per tabblad.** In `parseSections` (data.js r.~966)
staat:

```js
entry.herhaalId = isArchief ? _f4v(row[11]) : _f4v(row[12]); // L in 'Afgerond', M in 'Nog Te Doen'
```

In **'Nog Te Doen'** is kolom M het herhaalId. Alleen in **'Afgerond'** is M vrij. De duur mag
dus uitsluitend gelezen worden als `isArchief` waar is. Lees je hem altijd, dan gaat elk
herhaal-ID in de takenlijst als "duur" tellen.

**`bulkAfronden` hoeft niet aangepast.** Die roept `afrondWaarden(r, r._sec, vandaag, '')` aan
(bulk.js r.308). De nieuwe vijfde parameter is dan `undefined` en dat levert een lege cel — precies
wat het ontwerp wil (§1.4: bulk krijgt de vraag niet).

**Testen draaien:**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Dit parseert alle .js- en .gs-bestanden in ongeveer een seconde. **Draai dit vóór elke
testronde.** Een syntaxfout ín `tests.js` zorgt er namelijk voor dat er nul toetsen draaien —
niet één rode, gewoon niets — en dat is niet te onderscheiden van "nog bezig".

Daarna de zelftest in de browser: open `index.html?test=1` en lees `window._testResult`. Het
browserpaneel-tabblad moet **zichtbaar** zijn; op de achtergrond duurt een ronde tien minuten in
plaats van een minuut.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Wat er verandert |
|---|---|---|
| `src/util.js` | pure hulpfuncties | **nieuw:** `duurUitCel`, `duurNaarCel` — de enige plek waar "leeg ≠ 0" staat |
| `src/crud.js` | schrijven/afronden | `afrondWaarden` krijgt `duurMin`; **nieuw:** `kiesDuur`, `gekozenDuur`, `wisDuurKeuze` |
| `src/data.js` | lezen/parsen | `parseSections` leest `entry.duurMin` uit kolom M, alléén in het archief |
| `index.html` | opmaak van het venster | derde `.fld` in `#complete-bg` met vijf knoppen |
| `styles.css` | opmaak | `.duur-keuze`, `.duur-knop`, `.fld-opt` |
| `src/main.js` | aansluiten | één klik-listener op het knoppenrooster |
| `src/tests.js` | zelftest | acht nieuwe toetsen |

---

## Taak 1: `duurUitCel` en `duurNaarCel` in util.js

**Bestanden:**
- Wijzigen: `src/util.js` (onderaan, bij de andere pure celhulpjes)
- Toets: `src/tests.js`

- [ ] **Stap 1: schrijf de falende toetsen**

Zoek in `src/tests.js` het blok dat begint met `const taak = { code:'311212', naam:'Testflat 1'`
(rond r.5885). Zet hier **direct bóven** een nieuw blok:

```js
  (() => {
    // Kolom M van 'Afgerond'. De hele reden dat dit een eigen functie is: leeg en 0 mogen niet
    // op één hoop. 'Niet gemeten' telt nergens in mee; 0 zou als meting meedoen en elk
    // gemiddelde omlaag trekken met taken die niemand heeft ingevuld.
    eq('duur: getal blijft getal', duurUitCel('30'), 30);
    eq('duur: spaties eromheen', duurUitCel('  60  '), 60);
    eq('duur: komma telt als punt', duurUitCel('7,5'), 8);
    eq('duur: lege cel is null', duurUitCel(''), null);
    eq('duur: undefined is null', duurUitCel(undefined), null);
    eq('duur: tekst is null', duurUitCel('ongeveer een uur'), null);
    eq('duur: nul is null en NIET 0', duurUitCel('0'), null);
    eq('duur: negatief is null', duurUitCel('-15'), null);
    eq('duur: het getal 0 is ook null', duurUitCel(0), null);
    // Andere kant op — wat er in de cel belandt.
    eq('duur naar cel: 30 wordt "30"', duurNaarCel(30), '30');
    eq('duur naar cel: niets wordt lege string', duurNaarCel(null), '');
    eq('duur naar cel: tekst wordt lege string', duurNaarCel('nvt'), '');
    eq('duur naar cel: 0 wordt lege string', duurNaarCel(0), '');
  })();
```

Voeg `duurUitCel, duurNaarCel` toe aan de bestaande import uit `./util.js` bovenin `tests.js`
(regel 5, die begint met `import { taakTitel, taakVerwijzing, nieuwTaakId, …`).

- [ ] **Stap 2: draai de syntaxcheck en de toets, en zie hem falen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Verwacht: alle bestanden OK. Open daarna `index.html?test=1`.
Verwacht: rode regels bij `duur: …` — `duurUitCel is not defined`.

- [ ] **Stap 3: schrijf de implementatie**

Voeg onderaan `src/util.js` toe:

```js
// ── Duur van een afgeronde taak (kolom M van 'Afgerond') ─────────────────────────────────────
// Leeg en 0 zijn hier NIET hetzelfde, en dat is de hele reden dat dit een functie is en geen
// `Number(x)||0` op de plek van gebruik. Leeg betekent 'niemand heeft het ingevuld' en moet
// overal buiten de telling vallen; 0 zou als échte meting meedoen en elk gemiddelde omlaag
// trekken met taken die alleen maar zijn overgeslagen. Alles wat geen positief getal is —
// lege cel, tekst, 0, negatief — wordt daarom null.
// De Sheet kan een Nederlands decimaalteken teruggeven, vandaar de komma-vervanging.
export function duurUitCel(v){
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Dezelfde regel, de andere kant op: wat er in de cel terechtkomt. Bewust via `duurUitCel`,
// zodat lezen en schrijven niet uit elkaar kunnen lopen.
export function duurNaarCel(v){
  const n = duurUitCel(v);
  return n === null ? '' : String(n);
}
```

- [ ] **Stap 4: draai de toets en zie hem slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`. Verwacht: dertien groene `duur: …`-regels, nul rood.

- [ ] **Stap 5: leg vast**

```bash
git add src/util.js src/tests.js
git commit -m "Duur in minuten: leeg en nul zijn niet hetzelfde"
```

---

## Taak 2: `afrondWaarden` schrijft kolom M

**Bestanden:**
- Wijzigen: `src/crud.js` r.1117 (`afrondWaarden`)
- Toets: `src/tests.js` (het bestaande `afrond:`-blok rond r.5885)

- [ ] **Stap 1: schrijf de falende toetsen**

Zoek in `src/tests.js` deze regel in het bestaande `afrond:`-blok:

```js
    eq('afrond: M t/m P blijven leeg', [v[12],v[13],v[14],v[15]], ['','','','']);
```

Vervang hem door:

```js
    eq('afrond: zonder duur blijft M t/m P leeg', [v[12],v[13],v[14],v[15]], ['','','','']);
```

en zet **direct onder** het blok waar die regel in staat (dus na de `})();` van dat blok) een
nieuw blok:

```js
  (() => {
    const taak = { code:'311212', naam:'Testflat 1', actiepunt:'Iets doen',
                   taakId:'Tsub', bundelId:'Tkop', bundelVolg:'10' };
    const met = afrondWaarden(taak, 'OPPAKKEN', '2026-08-14', 'Klaar', 30);
    eq('afrond+duur: 30 op index 12 (kolom M)', met[12], '30');
    eq('afrond+duur: N t/m P blijven leeg', [met[13],met[14],met[15]], ['','','']);
    eq('afrond+duur: rij blijft 19 lang', met.length, 19);
    // Q/R/S mogen NIET opschuiven — Opvolging.gs en parseSections lezen op vaste index.
    eq('afrond+duur: Q/R/S liggen nog op 16/17/18',
       [met[16],met[17],met[18]], ['Tsub','Tkop','10']);
    // Overslaan is de standaard: vier argumenten (zoals bulkAfronden doet) laat M leeg.
    const zonder = afrondWaarden(taak, 'OPPAKKEN', '2026-08-14', '');
    eq('afrond+duur: vier argumenten laat M leeg', zonder[12], '');
    // 0 is geen meting maar een overgeslagen taak.
    const nul = afrondWaarden(taak, 'OPPAKKEN', '2026-08-14', '', 0);
    eq('afrond+duur: 0 wordt een lege cel', nul[12], '');
  })();
```

- [ ] **Stap 2: draai de toets en zie hem falen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`.
Verwacht: `afrond+duur: 30 op index 12 (kolom M)` faalt — gekregen `''`, verwacht `'30'`.

- [ ] **Stap 3: schrijf de implementatie**

In `src/crud.js`, voeg `duurNaarCel` toe aan de bestaande import uit `./util.js`.

Wijzig de signatuur op r.1117:

```js
export function afrondWaarden(r, sec, datum, toelichting, duurMin){
```

En de `return` onderaan diezelfde functie — vervang:

```js
  return v.concat([
    datum, toelichting, r.subcategorie||'',   // I, J, K
    r.herhaalId||'',                          // L
    '', '', '', '',                           // M, N, O, P
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),  // Q, R, S
  ]);
```

door:

```js
  return v.concat([
    datum, toelichting, r.subcategorie||'',   // I, J, K
    r.herhaalId||'',                          // L
    // M — hoe lang de taak kostte, in minuten. Leeg als er niets is aangeklikt: overslaan mag,
    // en een lege cel telt nergens in mee. `bulkAfronden` roept deze functie met vier argumenten
    // aan en laat M dus altijd leeg — bulk is opruimwerk en hoort niet in de meting.
    duurNaarCel(duurMin), '', '', '',         // M, N, O, P
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),  // Q, R, S
  ]);
```

Werk ook de blokcommentaar bóven de functie bij: de regel
`// L herhaalId (…), M..P leeg, Q taakId, …` wordt
`// L herhaalId (…), M duur in minuten, N..P leeg, Q taakId, …`.

- [ ] **Stap 4: draai de toets en zie hem slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`. Verwacht: alle `afrond+duur:`-regels groen, en de bestaande
`afrond: 19 velden lang` en `structuurcheck`-toetsen nog steeds groen.

- [ ] **Stap 5: leg vast**

```bash
git add src/crud.js src/tests.js
git commit -m "De duur reist mee in de rij die toch al geschreven wordt"
```

---

## Taak 3: `parseSections` leest kolom M terug

**Bestanden:**
- Wijzigen: `src/data.js` r.~966 (in `parseSections`)
- Toets: `src/tests.js`

- [ ] **Stap 1: schrijf de falende toetsen**

Voeg in `src/tests.js` een nieuw blok toe, direct na het blok uit taak 2:

```js
  (() => {
    // Een archiefrij is 19 kolommen breed. Hier bouwen we er twee met de hand, want de test moet
    // de VASTE posities vastleggen en niet meebewegen met een fout in de code.
    const kop = ['OPPAKKEN'];
    const kolomkop = ['VvE-Code','Naam','Actiepunt','Deadline','Behandelaar','Prioriteit',
                      'Opmerkingen','In behandeling','Datum','Toelichting','Sub','Herhaal',
                      'Duur (min)','','','','Taak','Bundel','Volg'];
    const rij = (duur) => ['311212','Testflat','Iets doen','','Jer','','','',
                           '14 aug 2026','Klaar','','', duur, '','','', 'T1','','' ];

    // LET OP twee dingen aan deze aanroep: het tweede argument is de TABBLADNAAM (een tekst,
    // `parseSections` leidt `isArchief` daaruit af), en de functie levert `{data, secInfo}` —
    // dus `.data` en niet direct de secties.
    const uitArchief = (duur) =>
      parseSections([kop, kolomkop, rij(duur)], 'Afgerond').data.OPPAKKEN[0];

    eq('lees duur: 30 uit kolom M', uitArchief('30').duurMin, 30);
    eq('lees duur: lege cel is null', uitArchief('').duurMin, null);
    eq('lees duur: tekst is null', uitArchief('lang').duurMin, null);
    eq('lees duur: 0 is null en niet 0', uitArchief('0').duurMin, null);
    eq('lees duur: negatief is null', uitArchief('-5').duurMin, null);
    // Kolom M mag het herhaalId in L niet opeten.
    eq('lees duur: herhaalId in L blijft heel', uitArchief('30').herhaalId, '');

    // Een legacy-rij van vijf kolommen heeft geen M en levert dus null — geen fout.
    const oud = parseSections([kop, kolomkop,
      ['311212','Testflat','Iets doen','Jer','14 aug 2026']], 'Afgerond').data.OPPAKKEN[0];
    eq('lees duur: legacy-rij van 5 kolommen geeft null', oud.duurMin, null);

    // In 'Nog Te Doen' is kolom M het herhaalId. Daar mag duurMin niet uit gelezen worden,
    // anders telt elk herhaal-ID straks als een duur.
    const ntd = parseSections([kop, kolomkop,
      ['311212','Testflat','Iets doen','','Jer','','','','','','','','H7']],
      'Nog Te Doen').data.OPPAKKEN[0];
    eq('lees duur: buiten het archief altijd null', ntd.duurMin, null);
    eq('lees duur: M blijft daar het herhaalId', ntd.herhaalId, 'H7');
  })();
```

- [ ] **Stap 2: draai de toets en zie hem falen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`.
Verwacht: `lees duur: 30 uit kolom M` faalt — gekregen `undefined`, verwacht `30`.

- [ ] **Stap 3: schrijf de implementatie**

In `src/data.js`, voeg `duurUitCel` toe aan de bestaande import uit `./util.js` (dezelfde regel
waar `leegBijErfenis` vandaan komt).

Zoek in `parseSections` deze twee regels:

```js
    entry.opvolgdatum=isArchief ? '' : _f4v(row[11]);           // L (alleen 'Nog Te Doen')
    entry.herhaalId  =isArchief ? _f4v(row[11]) : _f4v(row[12]); // L in 'Afgerond', M in 'Nog Te Doen'
```

Zet er **direct onder**:

```js
    // M — hoe lang de taak kostte, in minuten. ALLEEN in het archief: in 'Nog Te Doen' is deze
    // kolom het herhaalId (zie de regel hierboven), en dat zou hier anders als duur gaan tellen.
    // Leeg, tekst, 0 en negatief worden allemaal null en niet 0 — zie duurUitCel voor waarom.
    entry.duurMin    =isArchief ? duurUitCel(row[12]) : null;
```

- [ ] **Stap 4: draai de toets en zie hem slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`. Verwacht: alle `lees duur:`-regels groen.

- [ ] **Stap 5: leg vast**

```bash
git add src/data.js src/tests.js
git commit -m "Kolom M teruglezen, maar alleen op het archieftabblad"
```

---

## Taak 4: het knoppenrooster — gedrag zonder opmaak

**Bestanden:**
- Wijzigen: `src/crud.js` (drie nieuwe functies, bij `closeCompleteModal` r.1274)
- Toets: `src/tests.js`

- [ ] **Stap 1: schrijf de falende toetsen**

Voeg in `src/tests.js` toe, na het blok uit taak 3:

```js
  (() => {
    // Het venster ÍS de bron: er is bewust geen aparte state naast, net als bij de datum en de
    // opmerking. Deze toetsen bouwen daarom een echt rooster in de DOM.
    const houder = document.createElement('div');
    houder.innerHTML = [5,15,30,60,120]
      .map(m => `<button type="button" class="duur-knop" data-min="${m}"></button>`).join('');
    const knoppen = [...houder.querySelectorAll('.duur-knop')];
    const stand = () => knoppen.map(b => b.getAttribute('aria-pressed') || '-').join(',');

    eq('duurknop: begint zonder keuze', stand(), '-,-,-,-,-');

    kiesDuur(knoppen[2]);                       // 30m
    eq('duurknop: klik zet er één aan', stand(), '-,-,true,-,-');

    kiesDuur(knoppen[4]);                       // 2u+
    eq('duurknop: tweede keuze vervangt de eerste', stand(), '-,-,-,-,true');

    kiesDuur(knoppen[4]);                       // nogmaals dezelfde
    eq('duurknop: nogmaals klikken trekt de keuze in', stand(), '-,-,-,-,-');

    // gekozenDuur leest uit een meegegeven wortel, zodat de toets niet aan #complete-duur zit.
    kiesDuur(knoppen[3]);                       // 1u
    eq('duurknop: gekozenDuur leest 60', gekozenDuur(houder), 60);
    kiesDuur(knoppen[3]);
    eq('duurknop: niets gekozen levert null', gekozenDuur(houder), null);

    kiesDuur(knoppen[0]);
    wisDuurKeuze(houder);
    eq('duurknop: wissen maakt alles leeg', stand(), '-,-,-,-,-');
  })();
```

Voeg `kiesDuur, gekozenDuur, wisDuurKeuze` toe aan de bestaande import uit `./crud.js` bovenin
`tests.js`.

- [ ] **Stap 2: draai de toets en zie hem falen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`. Verwacht: `kiesDuur is not defined`.

- [ ] **Stap 3: schrijf de implementatie**

In `src/crud.js`, direct **boven** `function closeCompleteModal(){…}` (r.1274):

```js
// ── De duurkeuze in het afrondvenster ────────────────────────────────────────────────────────
// Er is bewust GEEN aparte state voor de gekozen duur. Het venster is de bron, net als bij de
// datum en de opmerking eronder: `doCompleteTask` leest die twee ook rechtstreeks uit de DOM.
// Een schaduwvariabele zou uit de pas kunnen lopen met wat de gebruiker ziet — precies het soort
// fout dat `_rowCache` versus `D` in dit project al eerder heeft opgeleverd.

// Toggle, geen radiogroep: nogmaals klikken op dezelfde knop trekt de keuze weer in. Zonder dat
// kun je een per ongeluk aangeklikte duur niet meer weghalen zonder het venster te sluiten, en
// dan wordt er een verkeerde meting opgeslagen omdat annuleren te veel gedoe is.
export function kiesDuur(knop){
  if(!knop) return;
  const aan = knop.getAttribute('aria-pressed')==='true';
  knop.parentElement.querySelectorAll('.duur-knop').forEach(b=>b.removeAttribute('aria-pressed'));
  if(!aan) knop.setAttribute('aria-pressed','true');
}

// De gekozen duur in minuten, of null als er niets aanstaat. `wortel` is er voor de zelftest;
// in de app leest hij gewoon het echte venster.
export function gekozenDuur(wortel){
  const bron = wortel || document.getElementById('complete-duur');
  const el = bron && bron.querySelector('.duur-knop[aria-pressed="true"]');
  return el ? duurUitCel(el.dataset.min) : null;
}

// Bij het ÓPENEN van het venster wissen, niet bij het sluiten: sluit iemand af met een kruisje
// en opent hij daarna een andere taak, dan zou een bewaarde keuze stil op de verkeerde taak
// belanden.
export function wisDuurKeuze(wortel){
  const bron = wortel || document.getElementById('complete-duur');
  if(bron) bron.querySelectorAll('.duur-knop').forEach(b=>b.removeAttribute('aria-pressed'));
}
```

Voeg `duurUitCel` toe aan de bestaande import uit `./util.js` in `crud.js` (die haalt in taak 2
al `duurNaarCel` op — zet ze samen op één regel).

- [ ] **Stap 4: draai de toets en zie hem slagen**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Open `index.html?test=1`. Verwacht: alle `duurknop:`-regels groen.

- [ ] **Stap 5: leg vast**

```bash
git add src/crud.js src/tests.js
git commit -m "Knoppenrooster als toggle, met het venster als enige bron"
```

---

## Taak 5: het veld in het venster

**Bestanden:**
- Wijzigen: `index.html` r.705-708 (de `.modal-body` van `#complete-bg`)
- Wijzigen: `styles.css` (bij de `.fld`-regels, r.~811-834)

- [ ] **Stap 1: voeg het veld toe aan index.html**

Zoek in `index.html` (r.705):

```html
    <div class="modal-body">
      <div class="fld"><label>Afgerond op</label><input type="date" id="complete-date"/></div>
      <div class="fld"><label>Opmerking</label><textarea id="complete-comment" rows="3" placeholder="Optioneel — wat is er gedaan?"></textarea></div>
    </div>
```

Vervang door:

```html
    <div class="modal-body">
      <div class="fld"><label>Afgerond op</label><input type="date" id="complete-date"/></div>
      <div class="fld"><label>Opmerking</label><textarea id="complete-comment" rows="3" placeholder="Optioneel — wat is er gedaan?"></textarea></div>
      <!-- Duur: bewust GEEN voorgeselecteerde knop. Een voorselectie die meegeschreven wordt
           geeft elke taak een verzonnen half uur, en dan meet je je eigen aanname. -->
      <div class="fld">
        <label id="complete-duur-lbl">Hoe lang duurde dit?<span class="fld-opt">optioneel</span></label>
        <div class="duur-keuze" id="complete-duur" role="group" aria-labelledby="complete-duur-lbl">
          <button type="button" class="duur-knop" data-min="5">5m</button>
          <button type="button" class="duur-knop" data-min="15">15m</button>
          <button type="button" class="duur-knop" data-min="30">30m</button>
          <button type="button" class="duur-knop" data-min="60">1u</button>
          <button type="button" class="duur-knop" data-min="120">2u+</button>
        </div>
      </div>
    </div>
```

- [ ] **Stap 2: voeg de opmaak toe aan styles.css**

Zoek in `styles.css` de regel `.fld textarea{resize:vertical;min-height:68px}` (r.~833) en zet
er **direct onder**:

```css
    .fld-opt{font-weight:600;color:var(--fnt);letter-spacing:0;text-transform:none;margin-left:6px}
    /* Vast raster van vijf. Met flex-wrap viel '2u+' bij 440px vensterbreedte om naar een tweede
       regel; een raster kan dat niet. */
    .duur-keuze{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
    .duur-knop{padding:8px 4px;text-align:center;border:1px solid var(--bor-input);border-radius:var(--rs);
      font-size:12px;font-weight:600;color:var(--mut);background:var(--sur2);cursor:pointer;
      font-variant-numeric:tabular-nums;transition:background var(--tr),border-color var(--tr),color var(--tr)}
    .duur-knop:hover{border-color:var(--ac-b);color:var(--txt);background:var(--sur)}
    /* Groen, net als de Afhandelen-knop eronder: dit venster heeft --sec:var(--gn). */
    .duur-knop[aria-pressed=true]{background:var(--gn);border-color:var(--gn);color:#fff}
```

- [ ] **Stap 3: controleer in de browser dat de vijf knoppen op één regel staan**

Open `index.html`, rond een taak af tot het venster opent, en meet:

```js
new Set([...document.querySelectorAll('#complete-duur .duur-knop')]
  .map(e => Math.round(e.getBoundingClientRect().top))).size
```

Verwacht: `1`. Meer dan 1 betekent dat de knoppen omvallen.

Controleer ook de hoogte van het venster:

```js
Math.round(document.querySelector('#complete-bg .modal').getBoundingClientRect().height)
```

Verwacht: rond de 400. Het ontwerp rekent op 329 → 400.

- [ ] **Stap 4: leg vast**

```bash
git add index.html styles.css
git commit -m "Vijf knoppen onder de opmerking, zonder voorselectie"
```

---

## Taak 6: aansluiten — klikken, wissen, meeschrijven

**Bestanden:**
- Wijzigen: `src/main.js` r.370-372
- Wijzigen: `src/crud.js` r.~1096 (`completeTaskRow`) en r.1182 (`doCompleteTask`)

- [ ] **Stap 1: sluit de klik aan in main.js**

Voeg `kiesDuur` toe aan de bestaande import uit `./crud.js` in `src/main.js`.

Zoek r.370-372:

```js
  document.getElementById('complete-close').onclick=closeCompleteModal;
  document.getElementById('complete-cancel').onclick=closeCompleteModal;
  document.getElementById('complete-confirm').onclick=doCompleteTask;
```

Zet er **direct onder**:

```js
  // Eén listener op het rooster in plaats van vijf op de knoppen: dan hoeft er niets opnieuw
  // aangesloten te worden als de knoppen ooit veranderen.
  document.getElementById('complete-duur').addEventListener('click', e=>{
    kiesDuur(e.target.closest('.duur-knop'));
  });
```

`kiesDuur` keert stil terug bij `null`, dus een klik naast een knop doet niets.

- [ ] **Stap 2: wis de keuze bij het openen van het venster**

In `src/crud.js`, in `completeTaskRow`, zoek:

```js
  document.getElementById('complete-comment').value='';
```

Zet er **direct onder**:

```js
  // Wissen bij het OPENEN. Sluit iemand af met het kruisje en opent hij daarna een andere taak,
  // dan zou een bewaarde keuze stil op die verkeerde taak belanden.
  wisDuurKeuze();
```

- [ ] **Stap 3: geef de duur mee bij het afronden**

In `src/crud.js`, in `doCompleteTask` (r.1182), vervang:

```js
    const values = afrondWaarden(r, sec, today, comment);
```

door:

```js
    const values = afrondWaarden(r, sec, today, comment, gekozenDuur());
```

- [ ] **Stap 4: test met de hand, ingelogd**

Zonder inloggen kun je niets afronden. Rond op de **staging-URL** een testtaak af (inloggen kan
alléén daar — op localhost geeft Google `origin_mismatch`).

Controleer:
1. Venster opent, geen knop staat aan.
2. Klik `30m` → knop wordt groen. Klik nog eens → weer uit.
3. Kies `1u`, klik **Afhandelen**. De taak verdwijnt uit de lijst.
4. Kijk in de Sheet op het tabblad 'Afgerond': in kolom M van de nieuwe rij staat `60`.
5. Rond een tweede taak af **zonder** iets te kiezen → kolom M blijft leeg.
6. Open het venster opnieuw voor een derde taak: er staat geen knop aan (geen erfenis).
7. Rond twee taken tegelijk af met bulk-afronden → kolom M blijft bij allebei leeg.
   (Dit is toets 8 uit §5 van het ontwerp; de eenheidstoets ervoor staat in taak 2 als
   "afrond+duur: vier argumenten laat M leeg".)
8. **Ongedaan maken** (§2.4 van het ontwerp). Rond een taak af mét een duur en klik daarna
   "Ongedaan maken" in de melding. Controleer: de taak staat terug in 'Nog Te Doen', de
   archiefrij is weg, en in 'Nog Te Doen' staat in kolom M géén duur maar het herhaalId
   (leeg als de taak er geen had). `serializeNtdUndo` kent kolom M niet en hoeft dat ook
   niet — 'Nog Te Doen' heeft geen duurkolom. Ziet de teruggezette rij er anders uit dan
   vóór het afronden, dan is dit een blokkerende fout: stoppen en melden.

- [ ] **Stap 5: leg vast**

```bash
git add src/main.js src/crud.js
git commit -m "Duurkeuze aangesloten: klikken, wissen bij openen, meeschrijven"
```

---

## Taak 7: volledige testronde

- [ ] **Stap 1: syntaxcheck**

```bash
osascript -l JavaScript tools/syntaxcheck.js
```

Verwacht: alle bestanden OK.

- [ ] **Stap 2: volledige zelftest**

Open `index.html?test=1` met het browserpaneel **zichtbaar** en lees `window._testResult`.

Verwacht: nul rode toetsen, en het totaal is met ~30 gestegen ten opzichte van de 2616 uit
v12.2. Let met name op de bestaande toetsen die de kolomindeling vastleggen:
`afrond: 19 velden lang`, `afrond: herhaalId blijft op index 11`, en de structuurcheck-toetsen
rond r.2571.

- [ ] **Stap 3: meet op twee schermbreedtes**

Controleer het venster op 1440 en 378 pixels breed. De vijf knoppen moeten in allebei op één
regel staan (zie de meting uit taak 5, stap 3).

- [ ] **Stap 4: versienummer ophogen**

In `src/config.js`: `APP_VERSION` van `'12.2'` naar `'12.3'`. Hoog ook de cachesleutel op naar
`cd-v150` (zoek in `sw.js` naar de huidige `cd-v149`).

```bash
git add src/config.js sw.js
git commit -m "v12.3 / cd-v150"
```

---

## Taak 8: uitrol

- [ ] **Stap 1: kopkolom op TEST**

Zet op het TEST-Sheet, tabblad 'Afgerond', op elke sectiekoprij in kolom M de tekst
`Duur (min)`.

**Zoek de rijnummers eerst op.** Neem ze niet over uit eerdere notities: de getallen
2/22/42/81/99 en 2/17/35/67/83 uit het projectgeheugen horen bij 'Nog Te Doen', verschillen per
Sheet, en 'Afgerond' heeft een eigen indeling. Zonder kop breekt er niets — `parseSections`
herkent koprijen op inhoud — maar dan is de kolom in de Sheet naamloos.

Muteer de Sheet via de Chrome-UI, niet via de Sheets-MCP: die schrijft je toelichting mee in de
cel en telt bij een gefilterde lezing de rijen verkeerd.

- [ ] **Stap 2: naar staging**

```bash
git push -u origin ontwerp/duur-bij-afronden
git checkout staging && git merge ontwerp/duur-bij-afronden && git push
```

De GitHub Action zet het Apps Script automatisch naar het TEST-script. Er verandert hier niets
aan de backend, maar de push moet wel groen zijn.

- [ ] **Stap 3: doortesten op de staging-URL**

`collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app` — log in en loop de zeven
punten uit taak 6, stap 4 na. Dit kan niet op localhost (Google geeft daar `origin_mismatch`).

- [ ] **Stap 4: kopkolom op PROD**

Zelfde ingreep op het PROD-Sheet. Dit kan vooruit: een lege kolom M breekt niets in de huidige
productieversie.

- [ ] **Stap 5: naar productie**

```bash
git checkout main && git merge staging && git push
```

GitHub Pages en het PROD-script volgen automatisch. Controleer daarna op
`vvebeheercollectief.github.io/Collectief-Dashboard/` dat de versie op 12.3 staat en rond één
echte taak af met een duur erbij.

- [ ] **Stap 6: zet een herinnering voor over zes weken**

Het ontwerp bouwt bewust géén scherm dat de cijfers toont. Noteer: over zes tot acht weken de
**vulgraad** meten (hoeveel procent van de afgeronde taken heeft een duur). Onder de 50% is het
capaciteitsbeeld niet betrouwbaar en moet de vraag opvallender worden — of vervallen.
