# Bundel-zichtbaarheid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overal waar het dashboard naar een ándere taak verwijst, één volledige regel tonen
(`Vergaderverzoek · 381005 VvE Oudemansstraat 123/125/127 — sept/okt`) in plaats van alleen de
kale omschrijving, en de bundel zichtbaar maken in de gefilterde lijst én op de VvE-dossierpagina.

**Architecture:** Twee nieuwe pure functies vormen de enige bron: `bundelVerwijzing(r, index)` in
`src/bundel.js` beantwoordt "zit deze rij in een bundel, en als wat?", `taakVerwijzing(r)` in
`src/util.js` maakt de zin. Vier weergaveplekken (plat merkje, dossierrij, 'Hoort bij'-veld,
sleep-melding) lezen die twee. Geen datamodel-wijziging, geen Sheet-migratie.

**Tech Stack:** Vanilla ES-modules, geen build-stap, geen Node. Testsuite = `src/tests.js`, draait
in de browser via `?test=1` en schrijft `window._testResult` (`"N OK, M FAIL"`).

**Spec:** `docs/superpowers/specs/2026-08-19-bundel-zichtbaarheid-design.md`
**Branch:** `feature/bundel-zichtbaarheid` (al aangemaakt, spec staat erop)

---

## Hoe je in dit project test

Er is geen `npm test`. De suite draait in de browser:

1. `preview_start` met `{name: "dashboard"}` — start `~/.claude/nocache-server.py` op een vrije
   poort en opent de Browser-pane.
2. `navigate` naar `<preview-url>/index.html?test=1`.
3. `javascript_tool`: `window._testResult` → `"1875 OK, 0 FAIL"`. Is hij nog `undefined`, wacht
   dan even en lees opnieuw; `main.js` laadt `tests.js` lazy.
4. Individuele FAILs staan als `console.error` in `read_console_messages`.

**Valkuil (kost anders een ronde):** een eerder geregistreerde service worker kan oude modules
serveren. Bij een onverklaarbare uitslag één keer opschonen in `javascript_tool`:

```js
(await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
(await caches.keys()).forEach(k => caches.delete(k));
```
daarna opnieuw navigeren.

**Valkuil 2 (0×0-tab):** de e2e-metingen in tests.js meten echte DOM. In een tab die nooit
getoond is geweest is `innerWidth` 0 en vallen ~21 metingen om met onzin-uitkomsten. Er staat een
wachtpost bovenaan dat blok die dat benoemt. Zorg dat de tab één keer zichtbaar is geweest
(één `computer{action:"screenshot"}` volstaat).

**Baseline vóór dit werk: 1875 OK, 0 FAIL.** Noteer na elke taak het nieuwe aantal.

---

### Task 1: `taakVerwijzing` — de zin zelf

**Files:**
- Modify: `src/util.js` (bij `taakTitel`, rond regel 360-392, en de `export {}`-lijst onderaan)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

Zoek in `src/tests.js` het blok dat met `const t = (taakId, bundelId, volg, sec) => ({...})`
begint (rond regel 4472) en zet dit blok er direct vóór, als eigen IIFE:

```js
  // ── taakVerwijzing: de volledige verwijzing naar één taak ───────────────────────────────
  // Eén zin die overal gebruikt wordt waar naar een ÁNDERE taak verwezen wordt. Los toetsbaar,
  // want alles wat hem gebruikt (het 'Hoort bij'-veld, het platte merkje, de dossierregel, de
  // sleep-melding) is opmaak eromheen.
  (() => {
    const v = (over) => taakVerwijzing({ _sec:'VERGADERVERZOEKEN', code:'381005',
      naam:'VvE Oudemansstraat 123/125/127', periode:'sept/okt', ...over });

    eq('verwijzing: soort, VvE en omschrijving in één regel', v({}),
       'Vergaderverzoek · 381005 VvE Oudemansstraat 123/125/127 — sept/okt');
    // De soort staat in ENKELVOUD. SECS[...].label is meervoud omdat het tabbladen benoemt;
    // "Vergaderverzoeken · 381005" leest fout zodra het over één taak gaat.
    truthy('verwijzing: de soort staat in enkelvoud',
       !v({}).includes('Vergaderverzoeken'));
    // taakTitel valt terug op het SECTIELABEL als een taak geen enkele omschrijving heeft.
    // Ongefilterd zou de regel dan "Vergaderverzoek · 381005 … — Vergaderverzoeken" worden:
    // de soort twee keer, één keer fout vervoegd. Die terugval hoort hier weggelaten te worden.
    eq('verwijzing: geen omschrijving → geen losse streep en geen dubbele soort',
       v({ periode:'' }), 'Vergaderverzoek · 381005 VvE Oudemansstraat 123/125/127');
    eq('verwijzing: zonder VvE-naam blijft de code over',
       v({ naam:'' }), 'Vergaderverzoek · 381005 — sept/okt');
    eq('verwijzing: zonder code en naam blijft soort en omschrijving over',
       v({ code:'', naam:'' }), 'Vergaderverzoek — sept/okt');
    // Elke sectie een eigen enkelvoud; 'Oppakken' is geen zelfstandig naamwoord.
    eq('verwijzing: elke sectie heeft een eigen enkelvoud',
       ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN']
         .map(s => taakVerwijzing({ _sec:s, code:'1', naam:'', actiepunt:'x', opmerkingen:'x',
                                    status:'x', subsidie:'x' }).split(' · ')[0]),
       ['Taak','Vergaderverzoek','Offerte-traject','LOD','Subsidie-traject']);
    // Een onbekende sectie mag geen lege soort geven — dan begint de regel met ' · '.
    truthy('verwijzing: onbekende sectie begint niet met een scheidingsteken',
       !taakVerwijzing({ _sec:'ONZIN', code:'1', naam:'X' }).startsWith(' ·'));
    eq('verwijzing: geen taak is geen fout', taakVerwijzing(null), '');
    // De opslagvorm van opgemaakte velden is platte tekst met **vet**; die sterretjes horen
    // niet in een verwijzing. taakTitel haalt ze al weg — dit pint vast dat de laag eromheen
    // dat niet ongedaan maakt.
    eq('verwijzing: opmaak-sterretjes blijven eruit',
       taakVerwijzing({ _sec:'OPPAKKEN', code:'1', naam:'', actiepunt:'**Bellen** met bestuur' }),
       'Taak · 1 — Bellen met bestuur');
  })();
```

Voeg `taakVerwijzing` toe aan de bestaande import uit `./util.js` bovenaan `src/tests.js`
(regel 4): zet het achter `taakTitel`.

- [ ] **Step 2: Draai de suite en controleer dat hij faalt**

Run: preview → `/index.html?test=1` → lees `window._testResult`.
Expected: FAIL-regels in de console met `taakVerwijzing is not defined` (of het aantal FAIL
springt van 0 naar ≥9).

- [ ] **Step 3: Schrijf de implementatie**

In `src/util.js`, direct ná de bestaande functie `taakTitel` (die blijft ongewijzigd):

```js
// De soort taak in ENKELVOUD. `SECS[...].label` is meervoud omdat het tabbladen benoemt, en
// "Vergaderverzoeken · 381005" leest fout zodra het over één taak gaat. 'Oppakken' is bovendien
// geen zelfstandig naamwoord — een rij uit dat tabblad is gewoon een taak.
// Terugval op het meervoud, zodat een sectie die hier ooit vergeten wordt een leesbare soort
// houdt in plaats van een regel die met ' · ' begint.
const SOORT_ENKELVOUD = {
  OPPAKKEN:'Taak', VERGADERVERZOEKEN:'Vergaderverzoek', 'OFFERTE-TRAJECTEN':'Offerte-traject',
  LOD:'LOD', 'SUBSIDIE-TRAJECTEN':'Subsidie-traject',
};

// De volledige verwijzing naar ÉÉN taak: soort · VvE — omschrijving.
//
// Bestaat naast `taakTitel` en niet in plaats daarvan. `taakTitel` beantwoordt "hoe heet deze
// taak" en wordt gebruikt op plekken waar de soort en de VvE al in beeld staan (de tabelrij, het
// bundelpaneel, de dossierrij). Deze functie beantwoordt "welke taak is dit, voor iemand die er
// niet naar kijkt" — en dat is precies de vraag zodra er naar een ándere taak verwezen wordt.
//
// Waarom de VvE erbij hoort: `magKoppelen` staat koppelen OVER VvE'S HEEN toe. De hoofdtaak van
// een bundel kan dus een heel andere VvE betreffen dan de rij waar je naar kijkt, en dan is de
// code het enige wat dat verraadt.
function taakVerwijzing(r, sec){
  if(!r) return '';
  sec = sec || r._sec || '';
  const soort = SOORT_ENKELVOUD[sec] || (SECS[sec] && SECS[sec].label) || '';
  const vve = [String(r.code ?? '').trim(), String(r.naam ?? '').trim()].filter(Boolean).join(' ');
  // `taakTitel` valt bij een taak zónder enige omschrijving terug op het sectielabel. Hier zou
  // dat de soort een tweede keer neerzetten, in het meervoud: "Vergaderverzoek · 381005 — 
  // Vergaderverzoeken". Die terugval hoort in een verwijzing dus weg te vallen.
  const label = (SECS[sec] || {}).label || '';
  const oms = taakTitel(r, sec);
  const echteOms = (oms && oms !== label) ? oms : '';
  // filter(Boolean) op beide niveaus: nooit een losse ' · ' en nooit een losse ' — '.
  return [[soort, vve].filter(Boolean).join(' · '), echteOms].filter(Boolean).join(' — ');
}
```

En in de `export { … }` onderaan `src/util.js`: zet `taakVerwijzing` naast `taakTitel` op de
eerste regel:

```js
export {
  taakTitel, taakVerwijzing, kortDatum,
```

- [ ] **Step 4: Draai de suite en controleer dat hij slaagt**

Run: herlaad `/index.html?test=1`, lees `window._testResult`.
Expected: `1885 OK, 0 FAIL` (10 asserts erbij; het exacte getal mag afwijken als je een assert
hebt samengevoegd — 0 FAIL is de eis).

- [ ] **Step 5: Mutatietoets**

Haal tijdelijk `const echteOms = (oms && oms !== label) ? oms : '';` weg en gebruik `oms`
rechtstreeks. Draai de suite.
Expected: precies de assert "geen omschrijving → geen losse streep en geen dubbele soort" valt om.
Zet de regel daarna terug en draai opnieuw: 0 FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/util.js src/tests.js && git commit -m "Bundel: taakVerwijzing — soort, VvE en omschrijving in één regel"
```

---

### Task 2: `bundelVerwijzing` — de bundelstand van een rij

**Files:**
- Modify: `src/bundel.js` (nieuwe export; `bundelStand` verhuist hierheen)
- Modify: `src/render-bundel.js` (regel 19-24: `bundelStand` komt nu uit `bundel.js`)
- Modify: `src/tests.js` (importregel 35, plus nieuw testblok)
- Test: `src/tests.js`

`bundelStand` staat vandaag in `render-bundel.js`, maar is pure logica over lidmaatschap — geen
HTML. `bundelVerwijzing` heeft hem nodig, en `bundel.js` mag niet uit een render-module importeren
(dat draait de afhankelijkheid om). Daarom verhuist hij mee.

- [ ] **Step 1: Schrijf de falende test**

Voeg in `src/tests.js` toe, direct ná het IIFE van Task 1:

```js
  // ── bundelVerwijzing: zit deze rij in een bundel, en als wat? ────────────────────────────
  // Eén antwoord voor vier weergaveplekken. Bouwt volledig op bundelVan → zichtbareKop →
  // zelfdeTaak, zodat "wie is de kop" één bron houdt.
  (() => {
    const t = (taakId, bundelId, volg, sec, over) => ({ taakId, bundelId, bundelVolg:volg,
      _sec:sec, code:'381005', naam:'VvE Oudemansstraat', periode:'sept/okt', deadline:'', ...over });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop  = t('Tkop','Tkop','0','VERGADERVERZOEKEN');
    const sub  = t('Tsub','Tkop','10','OFFERTE-TRAJECTEN', { opmerkingen:'Agenderen' });
    const los  = t('Tlos','','','OPPAKKEN');
    const ix   = bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop],
                                   'OFFERTE-TRAJECTEN':[sub], OPPAKKEN:[los] }, leeg);

    eq('bundelverwijzing: de kop meldt zich als kop, met de telling',
       bundelVerwijzing(kop, ix), { rol:'kop', klaar:0, totaal:1 });
    eq('bundelverwijzing: een stap wijst naar de rij van zijn kop',
       (bundelVerwijzing(sub, ix) || {}).rol, 'sub');
    eq('bundelverwijzing: … en die kop is de echte rij, niet een kopie',
       (bundelVerwijzing(sub, ix) || {}).kopRij.taakId, 'Tkop');
    eq('bundelverwijzing: een losse taak zit in geen enkele bundel',
       bundelVerwijzing(los, ix), null);
    // Eén lid is geen bundel (isBundel eist er twee): een kop die zijn laatste stap kwijt is
    // HOUDT zijn bundelnummer, en zou anders eeuwig een label blijven dragen.
    eq('bundelverwijzing: een bundel van één lid telt niet',
       bundelVerwijzing(kop, bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop] }, leeg)), null);
    // Kop afgerond → de kop schuift door. De stap is dan zélf de kop en moet dat ook melden;
    // dit is de gewone stand ná het eerste vinkje, geen randgeval.
    const ixDoor = bouwBundelIndex({ ...leeg, 'OFFERTE-TRAJECTEN':[sub] },
                                   { ...leeg, VERGADERVERZOEKEN:[kop] });
    eq('bundelverwijzing: is de kop afgerond, dan meldt de doorgeschoven kop zich als kop',
       bundelVerwijzing(sub, ixDoor), { rol:'kop', klaar:1, totaal:1 });
    // Alles afgerond → geen zichtbare kop → niets te melden.
    eq('bundelverwijzing: alles afgerond geeft niets',
       bundelVerwijzing(sub, bouwBundelIndex(leeg, { ...leeg, VERGADERVERZOEKEN:[kop],
                                                     'OFFERTE-TRAJECTEN':[sub] })), null);
    // Momentopname-voorwaarde, zelfde als bij wordtGeabsorbeerd: `r` kan uit een oudere
    // leesronde komen dan de index. Op objectidentiteit zou zo'n kop zichzelf als 'stap' zien
    // en naar zichzelf gaan verwijzen.
    eq('bundelverwijzing: een kop uit een andere momentopname is nog steeds de kop',
       (bundelVerwijzing({ ...kop }, ix) || {}).rol, 'kop');
    eq('bundelverwijzing: geen index is geen fout', bundelVerwijzing(kop, null), null);
    eq('bundelverwijzing: geen rij is geen fout', bundelVerwijzing(null, ix), null);
  })();
```

Pas de importregels in `src/tests.js` aan:
- regel 34 (`from "./bundel.js"`): voeg `bundelVerwijzing` en `bundelStand` toe.
- regel 35 (`from "./render-bundel.js"`): haal `bundelStand` daar wég.

- [ ] **Step 2: Draai de suite en controleer dat hij faalt**

Expected: `bundelVerwijzing is not defined` / een import-fout op `bundelStand`.

- [ ] **Step 3: Verhuis `bundelStand` en schrijf `bundelVerwijzing`**

Knip uit `src/render-bundel.js` het hele blok:

```js
// Stand van de bundel: alles behalve de zichtbare kop zelf — dus precies wat in het paneel staat.
// Zo blijft het getal stabiel terwijl een bundel vordert en de kop doorschuift.
export function bundelStand(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  return { klaar: rest.filter(m => m.af).length, totaal: rest.length };
}
```

Plak het in `src/bundel.js`, direct ná `export function isBundel(...)`, en haal `bundelStand`
weg uit de importregel van `render-bundel.js` — die staat er dan zo:

```js
import { zichtbareKop, bundelVan, wordtGeabsorbeerd, bundelSleutel, zelfdeTaak, bundelStand, bundelVerwijzing } from "./bundel.js";
```

Voeg in `src/bundel.js` toe, direct ná `wordtGeabsorbeerd`:

```js
// Wat is deze rij binnen haar bundel? Eén antwoord voor álle plekken die dat willen tonen: het
// platte bundelmerkje, de dossierrij, het veld 'Hoort bij' en de melding na het slepen.
//
//   null                            → zit in geen bundel (of de bundel is tot één lid gekrompen)
//   { rol:'kop', klaar, totaal }    → is de zichtbare kop; telling zoals de telpill hem toont
//   { rol:'sub', kop }              → is een stap; `kop` is de RIJ van de zichtbare kop
//
// Bewust géén eigen regels: wie de kop is komt uit `zichtbareKop`, wat een bundel is uit
// `bundelVan`/`isBundel`, en de telling uit `bundelStand`. Zou deze functie dat zelf afleiden,
// dan kan het label straks iets anders zeggen dan de stapel eronder laat zien — en dat is een
// stil verschil, precies het soort fout waar deze hele wijziging op reageert.
//
// Voorwaarde aan de aanroeper: GEEN. `r` en `index` hoeven niet uit dezelfde momentopname te
// komen; de vergelijking loopt daarom via `zelfdeTaak` (taaknummer) en niet via objectidentiteit.
export function bundelVerwijzing(r, index){
  const leden = bundelVan(index, r);
  if (!leden) return null;
  const kop = zichtbareKop(leden);
  if (!kop) return null;                       // alles afgerond
  if (zelfdeTaak(kop.r, r)){
    const { klaar, totaal } = bundelStand(leden, kop);
    return { rol:'kop', klaar, totaal };
  }
  return { rol:'sub', kop: kop.r };
}
```

- [ ] **Step 4: Draai de suite en controleer dat hij slaagt**

Expected: `1895 OK, 0 FAIL` (10 asserts erbij). Let op dat de bestaande `bundelStand`-asserts
groen blijven — die toetsen nu de verhuisde functie.

- [ ] **Step 5: Mutatietoets**

Vervang in `bundelVerwijzing` de regel `if (zelfdeTaak(kop.r, r)){` door `if (kop.r === r){`.
Expected: "een kop uit een andere momentopname is nog steeds de kop" valt om.
Zet terug, draai opnieuw: 0 FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/bundel.js src/render-bundel.js src/tests.js && git commit -m "Bundel: bundelVerwijzing als enige bron voor 'waar hoort dit bij'"
```

---

### Task 3: Bewerkscherm, kiezer en sleep-melding

**Files:**
- Modify: `src/crud.js:169` (`zetHoortBij`)
- Modify: `src/main.js:284-318` (de 'Hoort bij'-kiezer)
- Modify: `src/bundel-acties.js:210` (de melding na het slepen)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

In `src/tests.js`, in het blok `// ── 'Hoort bij' in het bewerkscherm: van het veld tot de
geschreven cel ──` (rond regel 6740), staat nu:

```js
      eq('hoortbij: een subtaak toont de hoofdtaak van zijn bundel', veld.value, taakTitel(kop));
```

Vervang die regel door onderstaande drie. De fixture heet daar `kop` en komt uit `opnieuw()`:
`_sec:'OPPAKKEN'`, `code:'311212'`, `naam:'Testflat'`, `actiepunt:'Kop-werk'` — dus de verwachte
waarde is letterlijk `Taak · 311212 Testflat — Kop-werk`.

```js
      // Het veld toont de VOLLEDIGE verwijzing, niet alleen de omschrijving. Er stond eerst
      // letterlijk 'sept/okt': de gebruiker kon daaraan niet zien om welke taak van welke VvE het
      // ging, terwijl `magKoppelen` koppelen over VvE's heen toestaat.
      eq('hoortbij: een subtaak toont de hoofdtaak van zijn bundel', veld.value, taakVerwijzing(kop));
      eq('hoortbij: … met soort, VvE-code en VvE-naam erin', veld.value,
         'Taak · 311212 Testflat — Kop-werk');
      // Een letterlijke tegenproef: de oude, kale titel is nadrukkelijk niet meer wat er staat.
      truthy('hoortbij: … en dus niet alleen de kale omschrijving', veld.value !== taakTitel(kop));
```

Voeg daarna, ná de assert `hoortbij: en biedt een kruisje om te ontkoppelen`, deze toets toe —
die dekt de valkuil uit stap 3:

```js
      // De 'overtypen = keuze los'-luisteraar vergelijkt de veldwaarde met de gekozen taak. Blijft
      // die op `taakTitel` staan terwijl het veld een `taakVerwijzing` toont, dan wijken ze per
      // definitie af en gooit élke toetsaanslag — ook een pijltje — de net gemaakte keuze weg.
      state._hbDoel = kop;
      veld.value = taakVerwijzing(kop);
      veld.dispatchEvent(new Event('input'));
      truthy('hoortbij: een ongewijzigd veld laat de gekozen taak staan', state._hbDoel === kop);
      veld.value = taakVerwijzing(kop) + 'x';
      veld.dispatchEvent(new Event('input'));
      eq('hoortbij: overtypen gooit de keuze wél los', state._hbDoel, null);
```

- [ ] **Step 2: Draai de suite en controleer dat hij faalt**

Expected: de twee nieuwe asserts falen — het veld bevat nog `sept/okt`.

- [ ] **Step 3: Schrijf de implementatie**

`src/crud.js` — `zetHoortBij` leidt de bundelstand vandaag met de hand af (`bundelVan` →
`zichtbareKop` → `zelfdeTaak` → `isKop`), inclusief een eigen commentaarblok dat diezelfde
`zelfdeTaak`-redenering nog eens uitschrijft. Dat is precies de dubbele afleiding die
`bundelVerwijzing` (taak 2) moest wegnemen — laat dit dus óók via die ene bron lopen.

Vervang het blok

```js
  const leden=bundelVan(bouwBundelIndex(D.ntd,D.af), r);
  const kop=leden&&zichtbareKop(leden);
  // …commentaarblok over zelfdeTaak…
  const isKop=!!(kop&&zelfdeTaak(kop.r,r));
  veld.value=(kop&&!isKop)?taakTitel(kop.r):'';
```

door:

```js
  // Eén bron voor 'wat is deze rij binnen haar bundel' (zie bundelVerwijzing in bundel.js). Hier
  // stond diezelfde afleiding met de hand uitgeschreven — twee plekken die hetzelfde antwoord
  // moeten geven, en dat is precies het soort stil verschil waar deze functie voor bestaat.
  const bv=bundelVerwijzing(r, bouwBundelIndex(D.ntd,D.af));
  const isKop=!!bv && bv.rol==='kop';
  // De VOLLEDIGE verwijzing, niet alleen `taakTitel`: koppelen mag over VvE's heen, dus zonder de
  // code kan de gebruiker niet zien wélke taak dit is.
  veld.value=(bv && bv.rol==='sub') ? taakVerwijzing(bv.kopRij) : '';
```

De regels eronder (`veld.disabled=isKop`, de `placeholder` en de zichtbaarheid van het kruisje)
blijven ongewijzigd — alleen de voorwaarde van het kruisje gaat van `kop&&!isKop` naar
`bv && bv.rol==='sub'`.

Zet `taakVerwijzing` in de bestaande import uit `./util.js` bovenaan `crud.js`, en
`bundelVerwijzing` in die uit `./bundel.js`. Raken `zichtbareKop`, `zelfdeTaak` of `bundelVan`
daardoor ongebruikt in dit bestand? Controleer dat met `grep -n` en haal ze dan uit de import.

`src/main.js` — in de `initVveZoekveld`-aanroep voor `hbVeld`:

```js
    onSelect: (taak) => {
      state._hbDoel = taak;              // het rij-OBJECT: een koppeling wijst één rij aan
      hbVeld.value = taakVerwijzing(taak);
      document.getElementById('m-hoortbij-x').style.display = '';
    },
```

en de `input`-luisteraar eronder:

```js
  hbVeld.addEventListener('input', () => {
    if (!state._hbDoel || hbVeld.value === taakVerwijzing(state._hbDoel)) return;
```

**Dit tweede punt is dwingend.** Blijft die vergelijking op `taakTitel` staan, dan wijkt de
veldwaarde er per definitie van af en gooit élke toetsaanslag — ook een pijltje — de net gemaakte
keuze weg. Zet `taakVerwijzing` bij in de import uit `./util.js` (regel 27); `taakTitel` blijft
nodig voor `itemHtml`, dus laat die staan.

De suggestielijst (`itemHtml`) blijft ongewijzigd: twee regels, omschrijving boven,
`code — naam` eronder.

`src/bundel-acties.js` — de melding:

```js
  showUndoToast('Gestapeld', `${taakTitel(sub)} onder ${taakVerwijzing(doel)}`,
```
Zet `taakVerwijzing` bij in de import uit `./util.js` (regel 33).

- [ ] **Step 4: Draai de suite en controleer dat hij slaagt**

Expected: 0 FAIL. Let op bestaande asserts in het `hoortbij:`-blok die op de oude veldwaarde
toetsten — die horen mee te veranderen, niet weggehaald te worden.

- [ ] **Step 5: Handmatig controleren in de preview**

Open de preview zonder `?test=1`, verberg de login-gate
(`document.getElementById('login-gate').style.display='none'`), injecteer een bundel in
`D.ntd` via `await import('/src/state.js')` en open het bewerkscherm van de stap.
Verwacht in het veld: `Vergaderverzoek · 381005 VvE Oudemansstraat 123/125/127 — sept/okt`.
Typ er daarna één letter bij: het kruisje mag blijven staan (er ligt een echte koppeling onder),
maar `state._hbDoel` hoort `null` te worden.

- [ ] **Step 6: Commit**

```bash
git add src/crud.js src/main.js src/bundel-acties.js src/tests.js && git commit -m "Bundel: 'Hoort bij' en de sleep-melding tonen de volledige verwijzing"
```

---

### Task 4: Leesbaar merkje in de platte lijst

**Files:**
- Modify: `src/render-bundel.js` (`bundelMerkje`, regel 185-204)
- Modify: `styles.css` (bij `.bdl-merk`, rond regel 1370)
- Test: `src/tests.js` (bestaande merkje-asserts rond regel 4593-4600 én 4743-4744)

- [ ] **Step 1: Pas de bestaande asserts aan en schrijf de nieuwe**

In `src/tests.js` staat nu:

```js
    eq('merkje: in platte weergave krijgt de kop óók een merkje',
       bundelMerkje(kop, vlak, 'OPPAKKEN').includes('Bundel van 3 taken'), true);
```
(zoek op `Bundel van 3 taken`; de labeltekst hierboven kan iets afwijken). Vervang de verwachte
tekst door de nieuwe telling en voeg de nieuwe asserts eronder toe:

```js
    // Het merkje is in de platte lijst de ENIGE aanwijzing dat er een bundel is (§4.2). Als kaal
    // icoontje met alleen een `title` was dat onvindbaar: de gebruiker zag een pictogram en moest
    // er met de muis op blijven staan om te lezen wát het betekende — en dan stond er nog alleen
    // de kale omschrijving van de hoofdtaak.
    truthy('merkje: de kop toont de telling als leesbare tekst',
       bundelMerkje(kop, vlak, 'OPPAKKEN').includes('Bundel · 0 van 2 klaar'));
    truthy('merkje: een stap noemt de taak waar hij bij hoort, mét soort en VvE',
       bundelMerkje(subAnder, vlak, 'OFFERTE-TRAJECTEN').includes('stap in: Taak · 311212 Testflat'));
    // De tekst staat in het KNOPLICHAAM, niet alleen in de `title`. Een assert die alleen op de
    // hele HTML-string toetst blijft groen terwijl het merkje op het scherm een kaal icoontje
    // blijft — de tekst zit dan immers al in het title-attribuut. Daarom hier op wat er tussen
    // `>` en `</button>` staat.
    const _merkLijf = h => h.slice(h.indexOf('>') + 1, h.lastIndexOf('</button>'));
    truthy('merkje: … en die tekst staat in de knop zelf, niet alleen in de tooltip',
       _merkLijf(bundelMerkje(subAnder, vlak, 'OFFERTE-TRAJECTEN')).includes('stap in: Taak'));
    truthy('merkje: … ook bij de kop',
       _merkLijf(bundelMerkje(kop, vlak, 'OPPAKKEN')).includes('0 van 2 klaar'));
    // De knop blijft dezelfde knop: klikken springt naar de bundel.
    truthy('merkje: het blijft dezelfde spring-knop',
       bundelMerkje(subAnder, vlak, 'OFFERTE-TRAJECTEN').includes('data-action="bundel-spring"'));
    // In de GESTAPELDE lijst houdt de kop zijn telpill en krijgt hij dus geen merkje — anders
    // staat de telling er twee keer.
    eq('merkje: in de gestapelde lijst krijgt de kop nog steeds geen merkje',
       bundelMerkje(kop, gestapeld, 'OPPAKKEN'), '');
```

- [ ] **Step 2: Draai de suite en controleer dat hij faalt**

Expected: de asserts over `Bundel · 0 van 2 klaar` en `stap in:` falen.

- [ ] **Step 3: Schrijf de implementatie**

Vervang in `src/render-bundel.js` de hele functie `bundelMerkje` door:

```js
export function bundelMerkje(r, bw, sec){
  if (!bw || !bw.merk) return '';
  const verw = bundelVerwijzing(r, bw.ix);
  if (!verw) return '';
  // In de gestapelde weergave draagt de kop zijn telpill al en staat een stap uit hetzelfde
  // tabblad al in het paneel. `wordtGeabsorbeerd` is de exacte tegenpool van de absorptie in
  // render-lijsten.js — die twee horen dezelfde rijen aan te wijzen.
  if (bw.stapel){
    if (verw.rol === 'kop') return '';
    if (wordtGeabsorbeerd(r, bw.ix, sec)) return '';
  }
  // De tekst staat in de KNOP, niet alleen in de title. Als kaal icoontje was dit de enige
  // aanwijzing in een gefilterde lijst, en dan nog een die je alleen met de muis kon lezen.
  const label = verw.rol === 'kop'
    ? `Bundel · ${verw.klaar} van ${verw.totaal} klaar`
    : `stap in: ${taakVerwijzing(verw.kopRij)}`;
  const titel = `${label} — klik om de bundel te openen`;
  // Een stap krijgt een eigen klasse: zijn regel is lang en hoort onder de VvE-naam te vallen,
  // terwijl de telling van een kop kort is en ernaast past.
  const cls = verw.rol === 'kop' ? 'bdl-merk' : 'bdl-merk bdl-merk-sub';
  return `<button type="button" class="${cls}" data-action="bundel-spring" data-bundel="${esc(tekst(r.bundelId))}" title="${esc(titel)}" aria-label="${esc(titel)}">${ico('bundel',12)}<span class="bdl-merk-t">${esc(label)}</span></button>`;
}
```

**Let op de naamsbotsing:** bovenin `render-bundel.js` staat `const tekst = bundelSleutel;`. Noem
de labelvariabele dus `label`, niet `tekst` — anders schrijf je de sleutel-normalisatie stil weg.

Importregel aanvullen: `taakVerwijzing` uit `./util.js`, `bundelVerwijzing` uit `./bundel.js`.
`zelfdeTaak` en `bundelVan` blijven nodig voor de rest van de module.

In `styles.css`, direct ná de bestaande `.bdl-merk`-regel:

```css
/* De tekst in het merkje. Kort bij een kop ("Bundel · 0 van 1 klaar"), lang bij een stap — daar
   valt hij daarom op een eigen regel onder de VvE-naam en wordt hij afgekapt. De volledige zin
   blijft in de `title` en de `aria-label` staan. */
.bdl-merk-t{margin-left:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Een stap: geen pil maar een gedempte regel, zodat de VvE-naam de rij blijft dragen. `display:flex`
   maakt de knop blok-niveau en dus een eigen regel — nodig, want `.cell-name` staat op
   `white-space:nowrap`. `max-width:100%` samen met de ellipsis hierboven houdt hem in de kolom. */
.bdl-merk-sub{display:flex;max-width:100%;margin:2px 0 0;padding:0;
  background:none;color:var(--mut);font-size:11px;border-radius:4px}
.bdl-merk-sub:hover{color:var(--txt)}
```

- [ ] **Step 4: Draai de suite en controleer dat hij slaagt**

Expected: 0 FAIL.

- [ ] **Step 5: Visueel controleren**

Preview zonder `?test=1`, login-gate verbergen, een bundel injecteren waarvan kop en stap in
verschillende tabbladen staan, `renderNtd()` draaien met een zoekterm in `#s-ntd`.
Maak een `computer{action:"screenshot"}` (niet `getComputedStyle` — die loopt in de preview één
stap achter). Verwacht: onder de VvE-naam een gedempte regel `stap in: Vergaderverzoek · …`,
en op de kop-rij een pil `Bundel · 0 van 1 klaar`.
Controleer ook dat de rij niet breder wordt dan de kolom.

- [ ] **Step 6: Commit**

```bash
git add src/render-bundel.js styles.css src/tests.js && git commit -m "Bundel: het merkje in de platte lijst wordt leesbare tekst"
```

---

### Task 5: Het VvE-dossier toont de bundel

**Files:**
- Modify: `src/bundel.js` (nieuwe export `opBundelVolg`)
- Modify: `src/render-vve.js` (`renderVve`: index bouwen, `o.open` groeperen, `taakRij` uitbreiden)
- Modify: `styles.css` (bij `.tk-taak`, rond regel 763-768)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende test**

Voeg in `src/tests.js` een nieuw blok toe, ná het `bundelVerwijzing`-blok uit Task 2:

```js
  // ── Dossier: stappen schuiven onder hun kop ─────────────────────────────────────────────
  // De gebruiker sleept in het dossier, dus dit is de plek waar het resultaat het eerst te zien
  // hoort te zijn. Vóór deze wijziging toonde die pagina van de hele bundel niets.
  (() => {
    const t = (taakId, bundelId, volg, sec, over) => ({ taakId, bundelId, bundelVolg:volg,
      _sec:sec, code:'381005', naam:'VvE Oudemansstraat', deadline:'', ...over });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop  = t('Tkop','Tkop','0','VERGADERVERZOEKEN', { periode:'sept/okt' });
    const s2   = t('Ts2','Tkop','20','OFFERTE-TRAJECTEN',  { opmerkingen:'Offertes' });
    const s1   = t('Ts1','Tkop','10','OPPAKKEN',           { actiepunt:'Agenderen' });
    const los  = t('Tlos','','','LOD', { actiepunt:'Losse taak' });
    const ix   = bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop], 'OFFERTE-TRAJECTEN':[s2],
                                   OPPAKKEN:[s1], LOD:[los] }, leeg);

    // Volgorde binnen de bundel komt uit bundelVolg, niet uit de deadline-sortering van de lijst.
    eq('dossier: stappen staan onder hun kop, op bundelvolgorde',
       groepeerBundels([los, kop, s2, s1], ix).map(x => x.r.taakId + ':' + x.diep),
       ['Tlos:0','Tkop:0','Ts1:1','Ts2:1']);
    // Staat de kop NIET in deze lijst (andere VvE, weggelegd, afgerond), dan blijft de stap op
    // zijn eigen plek staan — hij mag niet stil verdwijnen.
    eq('dossier: zonder kop in de lijst blijft de stap gewoon staan',
       groepeerBundels([s1, los], ix).map(x => x.r.taakId + ':' + x.diep), ['Ts1:0','Tlos:0']);
    // Vangnet: geen enkele rij mag uit de lijst vallen, wat de index ook zegt.
    eq('dossier: er verdwijnt nooit een rij',
       groepeerBundels([los, kop, s2, s1], ix).length, 4);
    eq('dossier: zonder bundels verandert er niets',
       groepeerBundels([los], ix).map(x => x.r.taakId + ':' + x.diep), ['Tlos:0']);
  })();
```

Voeg `groepeerBundels` toe aan de import uit `./render-vve.js` (regel 11 van `tests.js`).

- [ ] **Step 2: Draai de suite en controleer dat hij faalt**

Expected: `groepeerBundels is not defined`.

- [ ] **Step 3: Schrijf de implementatie**

In `src/bundel.js`, direct ná `opVolgorde`:

```js
// Dezelfde volgorde, maar over kale rijen in plaats van indexleden. Het dossier groepeert rijen
// die het uit zijn eigen deadline-sortering haalt; die moeten binnen de bundel weer op
// bundelVolg komen te staan, en wel volgens exact dezelfde regel als het paneel in de tabel.
export const opBundelVolg = (a, b) => opVolgorde({ r:a }, { r:b });
```

In `src/render-vve.js`, boven `renderVve`:

```js
// Stappen schuiven onder hun zichtbare kop — maar alleen als die kop óók in déze lijst staat.
// Koppelen mag over VvE's heen, en een kop kan weggelegd of afgerond zijn; in al die gevallen
// staat hij niet in `o.open` en blijft de stap gewoon op zijn eigen plek. De verwijzingsregel
// onder de rij is dan de enige aanwijzing — vandaar dat die er ook staat als er níet ingesprongen
// wordt.
//
// Geeft `{r, diep}` terug in tekenvolgorde. `diep` is 0 of 1: één laag diep, net als de bundel
// zelf.
//
// Harde eis: er verdwijnt nooit een rij. Wat de index ook beweert, elke binnengekomen rij komt
// er weer uit — een taak die stil uit het dossier valt is het ergste wat deze functie kan doen.
function groepeerBundels(rows, index){
  const lijst = rows || [];
  const kinderen = new Map();     // bundelsleutel → [rij, …]
  const romp = [];
  lijst.forEach(r => {
    const v = bundelVerwijzing(r, index);
    if (v && v.rol === 'sub' && lijst.some(x => zelfdeTaak(x, v.kopRij))){
      const k = bundelSleutel(r.bundelId);
      if (!kinderen.has(k)) kinderen.set(k, []);
      kinderen.get(k).push(r);
      return;
    }
    romp.push(r);
  });
  kinderen.forEach(k => k.sort(opBundelVolg));
  const uit = [];
  romp.forEach(r => {
    uit.push({ r, diep:0 });
    const v = bundelVerwijzing(r, index);
    if (v && v.rol === 'kop'){
      const mijn = kinderen.get(bundelSleutel(r.bundelId)) || [];
      mijn.forEach(c => uit.push({ r:c, diep:1 }));
      kinderen.delete(bundelSleutel(r.bundelId));
    }
  });
  // Vangnet: kinderen waarvan de kop tóch niet in de romp bleek te staan. Kan vandaag niet
  // gebeuren (de `some`-toets hierboven eist hem), maar het gevolg zou zijn dat een taak
  // ongemerkt uit het dossier verdwijnt. Liever onderaan dan weg.
  //
  // Staat een taaknummer per ongeluk twee keer in de Sheet (`checkNummers` meldt dat aan de
  // gebruiker), dan matcht `zelfdeTaak` op béíde en springt de stap in onder de eerste. Dat is
  // de veilige kant op — er verdwijnt niets, hij staat hooguit onder de verkeerde tweelinghelft.
  kinderen.forEach(rest => rest.forEach(r => uit.push({ r, diep:0 })));
  return uit;
}
```

Imports aanvullen in `render-vve.js`:
```js
import { bouwBundelIndex, bundelVerwijzing, bundelSleutel, zelfdeTaak, opBundelVolg } from "./bundel.js";
import { taakVerwijzing } from "./util.js";   // bij de bestaande util-import
```
en exporteer `groepeerBundels` in de `export { … }` onderaan het bestand.

In `renderVve`, vlak vóór `const taakRij=`:

```js
  // Eén index per render, gedeeld door de groepering en de labels eronder.
  const bIx = bouwBundelIndex(D.ntd, D.af);
```

Wijzig de signatuur van `taakRij` naar `(r, weg, diep)` en voeg vlak vóór de `return` toe:

```js
    // Wat deze rij binnen haar bundel is. Dezelfde bron als het merkje in de takentabel, dus
    // beide schermen kunnen niet iets anders beweren.
    const bv = bundelVerwijzing(r, bIx);
    const bdlPil = (bv && bv.rol === 'kop')
      ? `<span class="bdl-pill">${bv.klaar} van ${bv.totaal} klaar</span>` : '';
    // De verwijzingsregel staat er ÓÓK als de rij al is ingesprongen: bij inspringen alleen zie je
    // niet wélke taak het is zodra er twee bundels onder elkaar staan, en zonder inspringen (kop
    // bij een andere VvE, weggelegd of afgerond) is dit de enige aanwijzing.
    const stapIn = (bv && bv.rol === 'sub')
      ? `<div class="tk-stapin">${ico('bundel',11)} stap in: ${esc(taakVerwijzing(bv.kopRij))}</div>` : '';
```

en gebruik ze in de HTML:

```js
    return `<div class="tk tk-taak${weg?' snooze-row':''}${diep?' tk-stap':''}" data-action="taak-bewerken" data-rid="${rid}" style="cursor:pointer">
      ${STAPEL_GREEP}
      <span class="nm">${esc(taakTitel(r,sec))}${bdlPil}</span>
      <div class="tk-onder">
        <span class="mt">${esc(meta.label)}${r.behandelaar?' · '+esc(r.behandelaar):''}</span>
        <span class="dl">${dl}</span>
      </div>
      ${stapIn}
      <button class="act-af act-ico tk-af" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></button></div>`;
```

En de aanroep voor de open taken:

```js
        ${groepeerBundels(o.open, bIx).map(x=>taakRij(x.r,false,x.diep)).join('')||`<div class="tk-leeg">Geen open taken ${ico('feest',14).replace('<svg ','<svg style="vertical-align:-2.5px" ')}</div>`}
```

De regel voor **weggelegd** blijft `${o.weggelegd.map(r=>taakRij(r,true)).join('')}` — die groep
wordt niet gehergroepeerd (`diep` is daar `undefined`, dus geen inspringing), maar krijgt via
`stapIn` wél de verwijzingsregel.

In `styles.css`, ná `.tk-taak .mt{…}` (rond regel 768):

```css
/* Een stap springt in onder zijn kop. Streepje links, dezelfde metafoor als de linkerrand van
   `.bdl-paneel` in de takentabel. */
.tk-taak.tk-stap{margin-left:20px;padding-left:10px;border-left:2px solid var(--bor)}
/* Derde grid-rij, uitgelijnd onder de tekst (kolom 2) en niet onder het sleep-handvat. */
.tk-taak .tk-stapin{grid-column:2/-1;grid-row:3;font-size:11px;color:var(--mut);
  min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tk-taak .tk-stapin svg{vertical-align:-1.5px;margin-right:3px}
```

- [ ] **Step 4: Draai de suite en controleer dat hij slaagt**

Expected: 0 FAIL. Let op het bestaande blok 20 van `tests.js`, dat de plek van het sleep-handvat
in `.tk-taak` op de pixel meet — een extra grid-rij mag daar niets aan veranderen.

- [ ] **Step 5: Visueel controleren**

Preview, login-gate verbergen, een bundel voor één VvE injecteren, `goTo('vve')` +
`renderVve()`. Screenshot maken.
Verwacht: de kop met een pil `0 van 1 klaar`, daaronder ingesprongen de stap met een streepje
links en daaronder de gedempte regel `stap in: Vergaderverzoek · …`.
Test ook het geval "kop bij een andere VvE": de stap staat dan gewoon in de lijst, zonder
inspringing, mét de regel.

- [ ] **Step 6: Mutatietoets**

Haal in `groepeerBundels` de regel
`kinderen.forEach(rest => rest.forEach(r => uit.push({ r, diep:0 })));` weg en voeg tijdelijk een
kind toe waarvan de kop niet in de lijst staat door de `lijst.some(...)`-toets te schrappen.
Expected: "er verdwijnt nooit een rij" valt om. Zet beide terug.

- [ ] **Step 7: Commit**

```bash
git add src/bundel.js src/render-vve.js styles.css src/tests.js && git commit -m "Bundel: het VvE-dossier toont de stapel en de verwijzing"
```

---

### Task 6: Versie ophogen en de hele suite ingelogd draaien

**Files:**
- Modify: `src/config.js:8` (`APP_VERSION`)
- Modify: `sw.js` (cachenaam `cd-v117` → `cd-v118`)

- [ ] **Step 1: Versienummers ophogen**

```js
export const APP_VERSION = '10.23';
```
en in `sw.js` de cachenaam naar `cd-v118`. Zoek beide met:

```bash
grep -rn "10\.22\|cd-v117" src/config.js sw.js
```

- [ ] **Step 2: Controleer of `APP_SHELL` nog klopt**

Er is geen nieuwe module bijgekomen, dus `APP_SHELL` in `sw.js` hoeft niet te wijzigen. De
wachtpost in `tests.js` die de modulegraaf vanaf `main.js` met `APP_SHELL` vergelijkt bevestigt
dat — als die groen blijft, klopt het.

- [ ] **Step 3: Volledige suite draaien op de uitgeleverde code**

Run: preview → `/index.html?test=1` → `window._testResult`.
Expected: `~1905 OK, 0 FAIL`.

- [ ] **Step 4: Suite ingelogd draaien op staging**

Lokaal groen zegt niets over de ingelogde stand (`blokkeerOffline` weigert te schrijven zolang
`state._uitCache` aanstaat). Push naar `staging`, wacht op de Vercel-branchdeploy en draai daar:

```js
await import('./src/auth.js').then(m => m.doOAuth(false));
```
daarna `fetchUserEmail()` en herladen met `?test=1`. Dit recept werkt zonder popup en zonder
nieuwe toestemming (zie de Takenbundel-notities).
Expected: 0 FAIL, óók ingelogd.

- [ ] **Step 5: Commit**

```bash
git add src/config.js sw.js && git commit -m "Versie 10.23 / cd-v118"
```

---

### Task 7: Uitrol

- [ ] **Step 1: Naar staging**

```bash
git push origin feature/bundel-zichtbaarheid && git push origin feature/bundel-zichtbaarheid:staging
```

- [ ] **Step 2: Op TEST controleren met een echte bundel**

Ingelogd op de staging-URL (niet op localhost — dat geeft `origin_mismatch`). Stapel een taak,
zoek daarna op de VvE-naam en controleer dat de regel er staat. Open het dossier van die VvE.

- [ ] **Step 3: Naar productie**

```bash
git checkout main && git merge --ff-only feature/bundel-zichtbaarheid && git push origin main
```

- [ ] **Step 4: Nameten op de productie-URL zelf**

`https://vve-beheer-collectief.github.io/Collectief-Dashboard/?test=1` (de kale root 404't).
Expected: 0 FAIL, en `APP_VERSION` toont 10.23.

- [ ] **Step 5: Geheugen bijwerken**

Werk `project_takenbundel.md` bij met de nieuwe stand, of leg een eigen memory aan voor deze
vervolgstap, met een verwijzing over en weer.
