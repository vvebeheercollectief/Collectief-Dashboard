# Takenbundel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subtaken kunnen stapelen op een bestaande taak, met een sleepbare volgorde, zonder dat er een tweede soort taak ontstaat.

**Architecture:** Elk lid van een bundel draagt hetzelfde `bundelId` in verborgen kolom R van "Nog Te Doen" en een `bundelVolg` in kolom S; de hoofdtaak draagt zijn eigen taaknummer als `bundelId` en volgnummer `0`. De bundel wordt bij het tekenen afgeleid uit die kolommen (`bouwBundelIndex`), nooit uit een aparte bron. Pure logica komt in `src/bundel.js`, schrijfwegen in `src/bundel-acties.js`, HTML in `src/render-bundel.js`.

**Tech Stack:** Vanilla ES-modules (geen bundler), Google Sheets API v4, bestaande helpers `backgroundWrite` / `assertRowMatch` / `assertRowsMatch` / `showUndoToast` / `_veiligeRij`. Tests in `src/tests.js`, te draaien met `?test=1`.

**Spec:** `docs/superpowers/specs/2026-08-14-takenbundel-design.md`

**Over de testaantallen:** elke taak noemt een verwacht totaal, oplopend vanaf de nulmeting
`1124 OK, 0 FAIL`. Draai de tests vóór Taak 1 en noteer het werkelijke getal; wijkt dat af (bv.
omdat het losse Herhaal-ID-werk hieronder eerder landt), tel dan het verschil overal bij op. Wat
telt is dat het aantal per taak met precies het genoemde aantal asserts stijgt **en dat FAIL nul
blijft**.

---

## Coördinatie vooraf

Er loopt een aparte sessie voor "Fix kolomverschuiving Herhaal-ID in Afgerond" die óók
`parseSections` in `src/data.js` aanraakt. **Taak 3 van dit plan raakt dezelfde functie.**
Controleer vóór Taak 3 of dat werk al op `staging`/`main` staat; zo ja, rebase eerst. Zo nee,
ga gewoon door — de conflicten zijn klein en tekstueel (naburige regels), maar los ze bewust op
en draai daarna de volledige testronde.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---|---|
| `src/bundel.js` | **Nieuw.** Pure logica: index bouwen, zichtbare kop bepalen, hernummeren, koppel-guards. Geen DOM, geen netwerk — volledig los testbaar |
| `src/bundel-acties.js` | **Nieuw.** Schrijfwegen: koppelen, ontkoppelen, herordenen. Plus de sleep-afhandeling (pointer-events) |
| `src/render-bundel.js` | **Nieuw.** HTML: stapel-randjes, telpill, bundelpaneel, ⛓-merkje |
| `src/structuurcheck.js` | `RASTER_MIN` ophogen naar 19 voor beide tabbladen |
| `src/data.js` | `parseSections`: kolom R en S lezen |
| `src/crud.js` | `serializeNtdUndo` + `doCompleteTask`: bundelvelden meedragen |
| `src/bulk.js` | Bulk-afronden: bundelvelden meedragen |
| `src/render-lijsten.js` | `renderNtd`: platte-weergaveregel + absorptie van subtaken |
| `src/render-tabel.js` | `rowNtd`: stapel-uiterlijk en paneel invoegen |
| `src/render-vve.js` | Slepen op de VvE-dossierpagina |
| `src/actions.js` | Nieuwe `data-action`-namen aanhaken |
| `src/state.js` | `bundelOpen` Set |
| `styles.css` | Stapel-, paneel- en sleepstijlen |
| `src/tests.js` | Tests bij elke taak |

---

## FASE A — Opslag

### Taak 1: Raster verbreden (handmatig, gaat aan alles vooraf)

**Files:**
- Handmatig in Google Sheets (TEST en PROD)
- Modify: `src/structuurcheck.js:24-34`

⚠️ **Deze taak moet volledig af en geverifieerd zijn vóór Taak 2.** "Nog Te Doen" is nu precies
17 kolommen breed. Schrijven naar kolom R of S mislukt **zonder foutmelding** zolang het raster
niet breder is.

> **Stand 2026-08-14 — deze volgorde is in de praktijk omgedraaid.** Taak 2 t/m 4 zijn gebouwd
> vóór deze taak, dus de schrijfcode (19 kolommen) staat er al terwijl "Nog Te Doen" nog 17 breed
> is. Bij de naloop op Taak 4 is daarom **stap 6 naar voren gehaald en uitgevoerd**: `RASTER_MIN`
> staat op 19/19 en de bijbehorende tests zijn bijgewerkt. Anders zou de enige bewaking op
> "schrijven buiten het raster mislukt stil" precies daar zwijgen waar hij nodig is.
> **Wat hier nog open staat: stap 1 t/m 5** — de handmatige verbreding van "Nog Te Doen" op TEST
> en PROD. Zolang die niet gedraaid is, verliezen bundelvelden hun waarde bij het wegschrijven.
> Stap 7 is inmiddels `1156 OK, 0 FAIL` in plaats van `1124` (Taak 2 t/m 4 plus 12 asserts uit de
> naloop); tel dat verschil op bij de verwachte totalen verderop in dit plan.

- [ ] **Stap 1: Meet de huidige breedte van beide Sheets**

Draai dit met de Google Sheets MCP (alleen lezen) voor beide spreadsheets:
- TEST: `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4`
- PROD: `1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`

Vraag om `sheets.properties.gridProperties.columnCount` voor de tabbladen "Nog Te Doen" en
"Afgerond".

Verwacht op PROD (gemeten 2026-08-14): `Nog Te Doen` = 17, `Afgerond` = 26.

- [ ] **Stap 2: Verbreed "Nog Te Doen" naar 19 kolommen op TEST**

Dit gaat **via de Chrome-UI**, niet via de MCP — de Sheets-MCP is in dit project alleen voor
lezen (zie het projectgeheugen). Open het TEST-tabblad "Nog Te Doen", klik op de kop van de
laatste kolom (Q), rechtermuisknop → "2 kolommen rechts invoegen".

- [ ] **Stap 3: Zet kopteksten in R1 en S1 op TEST**

Zet in R1 `BundelId` en in S1 `BundelVolg`. Dit is puur voor mensen die de Sheet openen; de code
leest op kolomindex, niet op koptekst.

⚠️ **Let op de geërfde kolomeigenschappen:** nieuwe kolommen rechts van H erven de TRUE/FALSE-
gegevensvalidatie. Dat is bekend en al afgevangen — `leegBijErfenis` in `src/util.js` behandelt
een geërfde `TRUE`/`FALSE` als leeg. Verwijder de validatie op R en S alsnog handmatig
(Gegevens → Gegevensvalidatie → Alles verwijderen voor het bereik R:S), zodat er geen
vinkvakjes in beeld staan.

- [ ] **Stap 4: Verifieer TEST**

Meet opnieuw met de MCP. Verwacht: `Nog Te Doen` = 19.

- [ ] **Stap 5: Herhaal stap 2 t/m 4 op PROD**

Zelfde handeling op de productie-Sheet. Verifieer opnieuw met de MCP. Verwacht: 19.

- [x] **Stap 6: Verhoog RASTER_MIN** — GEDAAN bij de naloop op Taak 4 (zie kader hierboven). De
toelichting in de code wijkt bewust af van het onderstaande blok: die benoemt dat het getal de
schrijfcode volgt en dat "Nog Te Doen" tot stap 2 t/m 5 terecht als te smal gemeld wordt.

In `src/structuurcheck.js`, vervang de twee regels in `RASTER_MIN`:

```js
const RASTER_MIN = {
  'Nog Te Doen':      19,  // kolom S (bundelVolg) — verbreed op TEST én PROD 2026-08-14
  'Afgerond':         19,  // A:S — taakId/bundelId/bundelVolg op Q/R/S (raster is 26 breed)
  'Herhaalregels':    12,  // A:L
  'Kenmerken':         6,  // A:F
  'Ontwikkeling':      6,  // A:F
  'Logboek':           8,  // A:H
  'Notif-wachtrij':    4,  // A:D
  "ALV's overzicht":   7,  // t/m Klaargezet (G)
  "ALV's afgerond":    3,
};
```

Werk ook de toelichting erboven bij: voeg onder de bestaande regel over 2026-07-29 toe:

```js
// Op 2026-08-14 verbreed naar 19 voor de Takenbundel (R=bundelId, S=bundelVolg), op TEST én
// PROD. 'Afgerond' ging mee naar 19 omdat het afronden nu Q/R/S meeschrijft; dat blad was al
// 26 kolommen breed, dus daar was geen verbreding nodig.
```

- [ ] **Stap 7: Draai de tests**

Open `index.html?test=1` in de browser (via de no-cache pythonserver in `~/.claude`).
Verwacht: het bestaande aantal, `1124 OK, 0 FAIL` — deze stap voegt nog geen tests toe maar mag
er ook geen breken.

- [ ] **Stap 8: Commit**

```bash
git add src/structuurcheck.js && git commit -m "Takenbundel: raster verbreed naar 19 kolommen (TEST en PROD)"
```

---

### Taak 2: parseSections leest de bundelkolommen

**Files:**
- Modify: `src/data.js:664-672`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

Voeg vlak vóór de slotregels van `src/tests.js` toe (vóór `const totOk = ok + _tOk;`):

```js
  console.log('%c[TESTS] Takenbundel', 'background:#B45309;color:white;padding:2px 6px;border-radius:3px');
  (() => {
    // 19 kolommen: A..H sectievelden, I datum, J opmerking, K sub, L opvolg, M herhaal,
    // N esc, O fase, P aannemers, Q taakId, R bundelId, S bundelVolg.
    const rij = (code, taakId, bundelId, volg) => {
      const r = new Array(19).fill('');
      r[0] = code; r[1] = 'Testflat 1'; r[2] = 'Iets doen';
      r[16] = taakId; r[17] = bundelId; r[18] = volg;
      return r;
    };
    const rows = [
      ['OPPAKKEN','','','','','','',''],
      ['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen','In behandeling'],
      rij('311212','Tkop','Tkop','0'),
      rij('311212','Tsub','Tkop','10'),
      rij('311204','Tlos','',''),
    ];
    const { data } = parseSections(rows);
    const opp = data.OPPAKKEN;
    eq('bundel: drie rijen geparset', opp.length, 3);
    eq('bundel: kop draagt eigen nummer', [opp[0].bundelId, opp[0].bundelVolg], ['Tkop','0']);
    eq('bundel: subtaak wijst naar de kop', [opp[1].bundelId, opp[1].bundelVolg], ['Tkop','10']);
    eq('bundel: losse taak heeft niets', [opp[2].bundelId, opp[2].bundelVolg], ['','']);
    // Geërfde TRUE/FALSE in R/S telt als leeg (leegBijErfenis), net als bij de andere kolommen.
    const geerfd = rij('311300','Tx','TRUE','FALSE');
    const { data: d2 } = parseSections([rows[0], rows[1], geerfd]);
    eq('bundel: geërfde TRUE/FALSE telt als leeg',
       [d2.OPPAKKEN[0].bundelId, d2.OPPAKKEN[0].bundelVolg], ['','']);
  })();
```

- [ ] **Stap 2: Draai de test en zie hem falen**

Open `index.html?test=1`. Verwacht drie FAIL-regels: `bundel: kop draagt eigen nummer`,
`bundel: subtaak wijst naar de kop` en `bundel: geërfde TRUE/FALSE telt als leeg` — die geven
`[undefined,undefined]` omdat de velden nog niet bestaan.

- [ ] **Stap 3: Voeg de twee regels toe aan parseSections**

In `src/data.js`, direct ná de regel met `entry.taakId`:

```js
    entry.taakId     =_f4v(row[16]);  // Q — vast taaknummer (fase 4). Leeg = nog niet genummerd:
                                      // rijen van vóór de backfill en rijen die een oude client
                                      // aanmaakte. De guard valt dan terug op de vingerafdruk.
    entry.bundelId   =_f4v(row[17]);  // R — Takenbundel: élk lid draagt hetzelfde nummer, ook de
                                      // hoofdtaak (die draagt zijn eigen taakId). Leeg = geen bundel.
    entry.bundelVolg =_f4v(row[18]);  // S — volgorde binnen de bundel: '0' = hoofdtaak, dan 10/20/30.
```

Deze twee regels gelden voor **beide** tabbladen: `parseSections` leest "Nog Te Doen" én
"Afgerond" met dezelfde vaste kolomposities. Dat is precies waarom de bundelkolommen in
"Afgerond" op dezelfde indexen staan.

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Open `index.html?test=1`. Verwacht: `1129 OK, 0 FAIL` (5 nieuwe asserts).

- [ ] **Stap 5: Commit**

```bash
git add src/data.js src/tests.js && git commit -m "Takenbundel: parseSections leest bundelId (R) en bundelVolg (S)"
```

---

### Taak 3: Undo draagt de bundelvelden mee

**Files:**
- Modify: `src/crud.js:160-167`
- Test: `src/tests.js`

Zonder deze taak verliest een teruggezette taak zijn bundel. `serializeNtdUndo` draagt al
kolom A t/m Q; hij moet tot S.

- [ ] **Stap 1: Schrijf de falende test**

Voeg toe binnen het Takenbundel-testblok uit Taak 2:

```js
  (() => {
    const taak = { _sec:'OPPAKKEN', code:'311212', naam:'Testflat 1', actiepunt:'Iets doen',
                   deadline:'', behandelaar:'Jer', prioriteit:'', opmerkingen:'', inBehandeling:'',
                   subcategorie:'', opvolgdatum:'', herhaalId:'', fase:'', aannemers:'',
                   taakId:'Tkop', bundelId:'Tkop', bundelVolg:'0' };
    const v = serializeNtdUndo(taak);
    eq('undo: 19 velden lang', v.length, 19);
    eq('undo: taakId op index 16', v[16], 'Tkop');
    eq('undo: bundelId op index 17', v[17], 'Tkop');
    eq('undo: bundelVolg op index 18', v[18], '0');
    eq('undo: herhaalId blijft op index 12', v[12], '');
  })();
```

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `undo: 19 velden lang → verwacht 19, kreeg 17` plus twee undefined-fails.

- [ ] **Stap 3: Breid serializeNtdUndo uit**

In `src/crud.js`, vervang de regels met `v.push(r.taakId||'')` en het commentaar erna:

```js
  v.push(r.taakId||'');   // Q — het vaste taaknummer moet de undo overleven, anders krijgt de
                          // teruggezette taak een nieuwe identiteit en is de oude een wees.
  v.push(r.bundelId||''); // R — om dezelfde reden: zonder dit valt de taak na een undo uit zijn bundel.
  v.push(r.bundelVolg||''); // S
```

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Verwacht: `1134 OK, 0 FAIL`.

`insertAndWriteRow` hoeft niet aangepast: die berekent de eindkolom als
`String.fromCharCode(64+Math.max(values.length,9))`, wat bij 19 waarden `S` oplevert.

- [ ] **Stap 5: Commit**

```bash
git add src/crud.js src/tests.js && git commit -m "Takenbundel: undo draagt bundelId en bundelVolg mee"
```

---

### Taak 4: Afronden schrijft taakId, bundelId en bundelVolg naar Afgerond

**Files:**
- Modify: `src/crud.js:349-350` (`doCompleteTask`)
- Modify: `src/bulk.js:116`
- Test: `src/tests.js`

Een afgeronde taak heeft nu geen enkele identiteit meer. Dit is de kern van "afgevinkte subtaken
blijven in de bundel staan".

- [ ] **Stap 1: Schrijf de falende test**

`doCompleteTask` is niet los aan te roepen zonder DOM en netwerk. Trek de opbouw daarom uit in
een pure helper en test die. Voeg toe binnen het Takenbundel-testblok:

```js
  (() => {
    const taak = { code:'311212', naam:'Testflat 1', actiepunt:'Iets doen', deadline:'3-10-2026',
                   behandelaar:'Jer', prioriteit:'Hoog', opmerkingen:'', inBehandeling:'',
                   subcategorie:'Dak', herhaalId:'H7',
                   taakId:'Tsub', bundelId:'Tkop', bundelVolg:'10' };
    const v = afrondWaarden(taak, 'OPPAKKEN', '2026-08-14', 'Klaar');
    eq('afrond: 19 velden lang', v.length, 19);
    eq('afrond: afronddatum op index 8', v[8], '2026-08-14');
    eq('afrond: toelichting op index 9', v[9], 'Klaar');
    eq('afrond: subcategorie op index 10', v[10], 'Dak');
    eq('afrond: herhaalId blijft op index 11', v[11], 'H7');   // L — Opvolging.gs leest deze
    eq('afrond: M t/m P blijven leeg', [v[12],v[13],v[14],v[15]], ['','','','']);
    eq('afrond: taakId op index 16', v[16], 'Tsub');
    eq('afrond: bundelId op index 17', v[17], 'Tkop');
    eq('afrond: bundelVolg op index 18', v[18], '10');
    // Vergaderverzoeken heeft andere velden op A..H; de staart moet identiek liggen.
    const vv = afrondWaarden({ code:'311212', naam:'X', periode:'Q4 2026', agendapunten:'',
                               behandelaar:'Jer', deadline:'', opmerkingen:'', inBehandeling:'',
                               subcategorie:'', herhaalId:'', taakId:'Tk', bundelId:'Tk', bundelVolg:'0' },
                             'VERGADERVERZOEKEN', '2026-08-14', '');
    eq('afrond: staart ligt gelijk voor elke sectie', [vv.length, vv[16], vv[17], vv[18]], [19,'Tk','Tk','0']);
  })();
```

Voeg `afrondWaarden` toe aan de import uit `./crud.js` bovenin `src/tests.js`.

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `ReferenceError: afrondWaarden is not defined` in de console, en de testronde stopt.

- [ ] **Stap 3: Trek de opbouw uit in een pure functie**

In `src/crud.js`, vlak boven `async function doCompleteTask(){`:

```js
// Rijwaarden voor een afgeronde taak. Puur, dus los testbaar — en één bron voor zowel de
// modal-flow (doCompleteTask) als bulk-afronden, zodat die twee niet uiteen kunnen lopen.
// Vaste kolomposities: A..H sectievelden, I afronddatum, J toelichting, K subcategorie,
// L herhaalId (Opvolging.gs:119 leest afData[i][11] — NIET verplaatsen), M..P leeg,
// Q taakId, R bundelId, S bundelVolg. Q/R/S liggen op dezelfde index als in 'Nog Te Doen',
// omdat parseSections beide tabbladen met dezelfde vaste posities leest.
export function afrondWaarden(r, sec, datum, toelichting){
  let kop;
  switch(sec){
    case'OPPAKKEN':
      kop=[r.code,r.naam,r.actiepunt||'',r.deadline||'',r.behandelaar||'',r.prioriteit||'',r.opmerkingen||'',r.inBehandeling||''];break;
    case'VERGADERVERZOEKEN':
      kop=[r.code,r.naam,r.periode||'',r.agendapunten||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||''];break;
    case'OFFERTE-TRAJECTEN':
      kop=[r.code,r.naam,r.datumAangevraagd||'',r.offertes||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',''];break;
    case'SUBSIDIE-TRAJECTEN':
      kop=[r.code,r.naam,r.subsidie||'',r.subsidieFase||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||''];break;
    case'LOD':
      kop=[r.code,r.naam,r.actiepunt||'',r.status||'',r.behandelaar||'',r.deadline||'',r.opmerkingen||'',r.inBehandeling||''];break;
    default: throw new Error('Onbekende sectie: '+sec);
  }
  return kop.concat([
    datum, toelichting, r.subcategorie||'',   // I, J, K
    r.herhaalId||'',                          // L
    '', '', '', '',                           // M, N, O, P
    r.taakId||'', r.bundelId||'', r.bundelVolg||'',  // Q, R, S
  ]);
}
```

Voeg `afrondWaarden` toe aan de export-lijst onderaan `src/crud.js` (regel ~559).

- [ ] **Stap 4: Laat doCompleteTask de nieuwe functie gebruiken**

Vervang in `doCompleteTask` het hele `switch(sec){…}`-blok plus de regel
`values.push(r.herhaalId||'');` door:

```js
    const values = afrondWaarden(r, sec, today, comment);
```

- [ ] **Stap 5: Laat bulk-afronden dezelfde functie gebruiken**

In `src/bulk.js`, zoek de plek waar de afrondwaarden worden opgebouwd (rond regel 116, herkenbaar
aan `values.push(r.herhaalId||''); // L in 'Afgerond': Herhaal-ID (Fase 4-motor)`). Vervang die
opbouw door een aanroep van `afrondWaarden(r, sec, datum, toelichting)` met dezelfde argumenten
die daar al beschikbaar zijn, en importeer `afrondWaarden` uit `./crud.js` bij de bestaande
import op regel 10.

⚠️ Controleer hier expliciet dat de bulk-flow dezelfde afronddatum-notatie doorgeeft als
`doCompleteTask` (`dd-mm-jjjj` omgezet naar `jjjj-mm-dd`). Wijkt dat af, laat het dan zoals het
was — deze taak mag de datumnotatie niet veranderen.

- [ ] **Stap 6: Draai de tests en zie ze slagen**

Verwacht: `1144 OK, 0 FAIL`.

- [ ] **Stap 7: Commit**

```bash
git add src/crud.js src/bulk.js src/tests.js && git commit -m "Takenbundel: afronden schrijft taakId/bundelId/bundelVolg naar Afgerond"
```

---

## FASE B — Bundel-logica (puur)

### Taak 5: src/bundel.js — index, zichtbare kop, leden

**Files:**
- Create: `src/bundel.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg, sec) => ({ taakId, bundelId, bundelVolg:volg, _sec:sec, code:'311212' });
    const ntd = {
      VERGADERVERZOEKEN: [ t('Tkop','Tkop','0','VERGADERVERZOEKEN') ],
      'OFFERTE-TRAJECTEN': [ t('Ta','Tkop','20','OFFERTE-TRAJECTEN') ],
      OPPAKKEN: [ t('Tb','Tkop','10','OPPAKKEN'), t('Tlos','','','OPPAKKEN') ],
      LOD: [], 'SUBSIDIE-TRAJECTEN': [],
    };
    const af = { OPPAKKEN: [], VERGADERVERZOEKEN: [], 'OFFERTE-TRAJECTEN': [], LOD: [], 'SUBSIDIE-TRAJECTEN': [] };
    const ix = bouwBundelIndex(ntd, af);
    eq('index: één bundel gevonden', ix.size, 1);
    eq('index: leden op volgnummer gesorteerd',
       (ix.get('Tkop')||[]).map(m => m.r.taakId), ['Tkop','Tb','Ta']);
    eq('index: losse taak zit in geen bundel', ix.has(''), false);
    eq('kop: hoofdtaak is de zichtbare kop', zichtbareKop(ix.get('Tkop')).r.taakId, 'Tkop');
    eq('bundel: telt als bundel bij 2+ leden', isBundel(ix.get('Tkop')), true);

    // Hoofdtaak afgerond → kop schuift door naar het eerstvolgende openstaande lid.
    const ntd2 = { ...ntd, VERGADERVERZOEKEN: [] };
    const af2 = { ...af, VERGADERVERZOEKEN: [ t('Tkop','Tkop','0','VERGADERVERZOEKEN') ] };
    const ix2 = bouwBundelIndex(ntd2, af2);
    eq('kop: schuift door na afronden hoofdtaak', zichtbareKop(ix2.get('Tkop')).r.taakId, 'Tb');
    eq('kop: afgerond lid blijft in de bundel', (ix2.get('Tkop')||[]).length, 3);
    eq('kop: afgerond lid is als afgerond gemarkeerd', ix2.get('Tkop')[0].af, true);

    // Alles afgerond → geen zichtbare kop meer.
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const alAf = { ...leeg, OPPAKKEN:[ t('Tb','Tkop','10','OPPAKKEN') ] };
    const ix3 = bouwBundelIndex(leeg, alAf);
    eq('kop: geen kop als alles afgerond is', zichtbareKop(ix3.get('Tkop')), null);

    // Eén lid over is geen bundel meer.
    const solo = { ...leeg, OPPAKKEN:[ t('Tb','Tkop','10','OPPAKKEN') ] };
    eq('bundel: één lid is geen bundel', isBundel(bouwBundelIndex(solo, leeg).get('Tkop')), false);

    // Rijen zonder taakId mogen de index niet laten omvallen.
    const raar = { ...leeg, OPPAKKEN:[ { bundelId:'Tkop', bundelVolg:'', _sec:'OPPAKKEN', code:'1' } ] };
    eq('index: lid zonder volgnummer valt achteraan',
       bouwBundelIndex(raar, leeg).get('Tkop').length, 1);
  })();
```

Voeg bovenin `src/tests.js` toe:
`import { bouwBundelIndex, zichtbareKop, isBundel, bundelVan, hernummerLeden, volgendeVolg, magKoppelen } from "./bundel.js";`

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: de module bestaat niet — de app laadt niet en de console toont een import-fout.

- [ ] **Stap 3: Maak src/bundel.js**

```js
// ══════════════════════════════════════
//  BUNDEL — pure logica voor de Takenbundel
// ══════════════════════════════════════
// Kernregel: élk lid van een bundel draagt hetzelfde `bundelId` (kolom R), óók de hoofdtaak —
// die draagt zijn eigen taaknummer, met volgnummer 0. Een bundel is dus "alle taken met hetzelfde
// nummer", en dat blijft waar of een lid nu open staat, afgerond is of verwijderd wordt.
//
// Deze module schrijft niets, raakt de DOM niet en doet geen netwerkverkeer — hij kan per
// definitie geen taak kwijtmaken en is volledig los testbaar.
import { SKEYS } from "./config.js";

// Volgnummer als getal. Ontbrekend of onleesbaar → achteraan, nooit een crash: een handmatig
// leeggemaakte cel in de Sheet mag de bundel niet laten omvallen.
const volgVan = r => {
  const n = parseInt(r && r.bundelVolg, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

// Alle bundels uit de huidige gegevens. Geeft Map<bundelId, Array<{r, af}>>, per bundel
// gesorteerd op volgnummer. `af` = dit lid komt uit 'Afgerond'.
// Leden uit 'Afgerond' tellen volwaardig mee: zonder hen zou een bundel leeglopen zodra er
// iets wordt afgevinkt, en zou de kop niet kunnen doorschuiven.
export function bouwBundelIndex(ntd, af){
  const m = new Map();
  const voegToe = (r, isAf) => {
    const id = ((r && r.bundelId) || '').trim();
    if (!id) return;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push({ r, af: isAf });
  };
  SKEYS.forEach(s => ((ntd && ntd[s]) || []).forEach(r => voegToe(r, false)));
  SKEYS.forEach(s => ((af  && af[s])  || []).forEach(r => voegToe(r, true)));
  // Tiebreak op taaknummer, zodat de volgorde bij gelijke volgnummers voorspelbaar is
  // (en de tests niet op sorteertoeval leunen).
  m.forEach(leden => leden.sort((a, b) =>
    (volgVan(a.r) - volgVan(b.r)) || String(a.r.taakId||'').localeCompare(String(b.r.taakId||''))));
  return m;
}

// De zichtbare kop: het nog openstaande lid met het laagste volgnummer. null = alles afgerond.
// Deze ene regel dekt ook 'hoofdtaak afgerond' en 'hoofdtaak verwijderd' af.
export function zichtbareKop(leden){
  return (leden || []).find(m => !m.af) || null;
}

// Eén lid is geen bundel — dan tekenen we gewoon een normale taakrij.
export function isBundel(leden){ return !!leden && leden.length >= 2; }

// De bundel waar deze taak in zit, of null.
export function bundelVan(index, r){
  const id = ((r && r.bundelId) || '').trim();
  if (!id) return null;
  const leden = index.get(id);
  return isBundel(leden) ? leden : null;
}

// Volgnummers opnieuw uitdelen als 10, 20, 30 … in de gegeven volgorde.
// Geeft [{r, volg}] terug voor precies de leden die daadwerkelijk veranderen, zodat de
// schrijfactie zo klein mogelijk blijft.
export function hernummerLeden(leden){
  const uit = [];
  (leden || []).forEach((m, i) => {
    const nieuw = String((i + 1) * 10);
    if (String(m.r.bundelVolg || '') !== nieuw) uit.push({ r: m.r, volg: nieuw });
  });
  return uit;
}

// Volgnummer voor een lid dat achteraan wordt toegevoegd: hoogste + 10, met gaten van tien
// zodat er later tussen geschoven kan worden zonder alles te hernummeren.
export function volgendeVolg(leden){
  let max = 0;
  (leden || []).forEach(m => { const v = volgVan(m.r); if (v !== Number.MAX_SAFE_INTEGER && v > max) max = v; });
  return String(max + 10);
}
```

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Verwacht: `1155 OK, 0 FAIL`.

- [ ] **Stap 5: Commit**

```bash
git add src/bundel.js src/tests.js && git commit -m "Takenbundel: pure bundellogica (index, zichtbare kop, hernummeren)"
```

---

### Taak 6: Koppel-guards (één laag diep)

**Files:**
- Modify: `src/bundel.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg) => ({ taakId, bundelId, bundelVolg:volg, _sec:'OPPAKKEN', code:'311212' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop = t('Tkop','Tkop','0'), sub = t('Tb','Tkop','10'), los = t('Tlos','',''), los2 = t('Tl2','','');
    const ix = bouwBundelIndex({ ...leeg, OPPAKKEN:[kop, sub, los, los2] }, leeg);

    eq('koppel: losse taak onder losse taak mag', magKoppelen(los, los2, ix).mag, true);
    eq('koppel: losse taak onder een subtaak mag (voegt toe aan die bundel)',
       magKoppelen(los, sub, ix).mag, true);
    eq('koppel: doelbundel is die van de subtaak', magKoppelen(los, sub, ix).bundelId, 'Tkop');
    eq('koppel: een kop met subtaken mag niet onder iets anders',
       magKoppelen(kop, los, ix).mag, false);
    eq('koppel: die weigering benoemt de subtaken',
       magKoppelen(kop, los, ix).reden, 'Deze taak heeft zelf subtaken; ontkoppel die eerst.');
    eq('koppel: op zichzelf mag niet', magKoppelen(los, los, ix).mag, false);
    eq('koppel: al in dezelfde bundel is zinloos', magKoppelen(sub, kop, ix).mag, false);
  })();
```

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `magKoppelen is not a function` — de testronde stopt.

- [ ] **Stap 3: Voeg magKoppelen toe aan src/bundel.js**

```js
// Mag `bron` als subtaak onder `doel` komen te hangen?
// Geeft {mag, reden, bundelId} — bundelId is de bundel waar bron in terechtkomt.
//
// Twee dingen liggen hier vast:
//  - Vallen op een lid dat al in een bundel zit voegt je toe aan DIE bundel. Zo kan er geen
//    fout ontstaan door 'op de verkeerde helft' te mikken.
//  - Een taak die zélf al subtaken heeft kan nergens onder. Dat houdt de structuur
//    gegarandeerd één laag diep, en wel bij het koppelen — niet pas bij het tekenen.
export function magKoppelen(bron, doel, index){
  if (!bron || !doel) return { mag:false, reden:'Onbekende taak.', bundelId:null };
  if (bron === doel || (bron.taakId && bron.taakId === doel.taakId))
    return { mag:false, reden:'Een taak kan niet onder zichzelf hangen.', bundelId:null };

  const bronLeden = bundelVan(index, bron);
  // Is bron zelf een kop met leden onder zich? Dan zou koppelen een tweede laag maken.
  if (bronLeden && bronLeden.some(m => m.r !== bron && volgVan(m.r) > volgVan(bron)))
    return { mag:false, reden:'Deze taak heeft zelf subtaken; ontkoppel die eerst.', bundelId:null };

  const doelLeden = bundelVan(index, doel);
  const doelBundel = doelLeden ? ((doel.bundelId||'').trim()) : (doel.bundelId||'').trim();
  const bronBundel = (bron.bundelId||'').trim();
  if (doelBundel && bronBundel && doelBundel === bronBundel)
    return { mag:false, reden:'Deze taak zit al in deze bundel.', bundelId:null };

  // Nieuwe bundel: het doel wordt de hoofdtaak en draagt zijn eigen taaknummer als bundelnummer.
  // Heeft het doel nog geen taaknummer (rij van vóór de backfill), dan kent de schrijfweg er
  // eerst één toe — dat kan hier niet, want deze module is puur.
  return { mag:true, reden:'', bundelId: doelBundel || doel.taakId || null };
}
```

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Verwacht: `1162 OK, 0 FAIL`.

- [ ] **Stap 5: Commit**

```bash
git add src/bundel.js src/tests.js && git commit -m "Takenbundel: koppel-guards houden de structuur één laag diep"
```

---

## FASE C — Weergave

### Taak 7: Platte weergave en absorptie

**Files:**
- Modify: `src/render-lijsten.js:145-175`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg, sec) => ({ taakId, bundelId, bundelVolg:volg, _sec:sec,
                                                  code:'311212', naam:'Testflat', actiepunt:'X', deadline:'' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop = t('Tkop','Tkop','0','OPPAKKEN');
    const subZelfde = t('Tb','Tkop','10','OPPAKKEN');       // zelfde tabblad → wordt geabsorbeerd
    const subAnder  = t('Ta','Tkop','20','OFFERTE-TRAJECTEN'); // ander tabblad → blijft staan
    const ix = bouwBundelIndex({ ...leeg, OPPAKKEN:[kop, subZelfde], 'OFFERTE-TRAJECTEN':[subAnder] }, leeg);

    eq('absorptie: subtaak in hetzelfde tabblad verdwijnt uit de vlakke lijst',
       absorbeer([kop, subZelfde], 'OPPAKKEN', ix).map(r => r.taakId), ['Tkop']);
    eq('absorptie: subtaak in een ander tabblad blijft staan',
       absorbeer([subAnder], 'OFFERTE-TRAJECTEN', ix).map(r => r.taakId), ['Ta']);
    eq('absorptie: zonder bundels verandert er niets',
       absorbeer([kop], 'OPPAKKEN', new Map()).map(r => r.taakId), ['Tkop']);

    eq('plat: standaardlijst is niet plat',
       isPlatteWeergave({ q:'', fCode:'', beh:'', prio:'', status:'', sortKey:null, bulk:false }), false);
    eq('plat: zoeken maakt plat',
       isPlatteWeergave({ q:'dak', fCode:'', beh:'', prio:'', status:'', sortKey:null, bulk:false }), true);
    eq('plat: kolomsortering maakt plat',
       isPlatteWeergave({ q:'', fCode:'', beh:'', prio:'', status:'', sortKey:'deadline', bulk:false }), true);
    eq('plat: bulk-modus maakt plat',
       isPlatteWeergave({ q:'', fCode:'', beh:'', prio:'', status:'', sortKey:null, bulk:true }), true);
    eq('plat: statusfilter maakt plat',
       isPlatteWeergave({ q:'', fCode:'', beh:'', prio:'', status:'telaat', sortKey:null, bulk:false }), true);
  })();
```

Voeg `absorbeer, isPlatteWeergave` toe aan de import uit `./render-lijsten.js` bovenin `src/tests.js`.

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `absorbeer is not a function`.

- [ ] **Stap 3: Voeg beide functies toe aan src/render-lijsten.js**

Plaats ze vlak boven `function renderNtd(){`:

```js
// De gestapelde weergave verschijnt alleen in de ONGEFILTERDE standaardlijst. Zodra er wordt
// gezocht, gefilterd, op een kolomkop gesorteerd of bulk-geselecteerd, tonen we plat.
// Reden: een treffer mag niet verstopt zitten in een dichtgeklapte bundel, een vaste groepering
// is in strijd met een gekozen sortering, en in bulk-modus moet élke taak aanvinkbaar zijn.
// Puur, dus los testbaar.
function isPlatteWeergave({ q, fCode, beh, prio, status, sortKey, bulk }){
  return !!(q || fCode || beh || prio || status || sortKey || bulk);
}

// Haal subtaken uit de vlakke lijst weg wanneer hun zichtbare kop in HETZELFDE tabblad staat —
// die worden dan in het bundelpaneel onder die kop getekend. Staat de kop in een ander tabblad,
// dan blijft de rij gewoon staan (met een ⛓-merkje). Zo wordt elke taak per tabblad precies
// één keer getoond en blijven de tellers kloppen.
function absorbeer(rows, sec, index){
  if (!index || !index.size) return rows;
  return rows.filter(r => {
    const leden = bundelVan(index, r);
    if (!leden) return true;
    const kop = zichtbareKop(leden);
    if (!kop || kop.r === r) return true;          // zelf de kop → blijft staan
    return kop.r._sec !== sec;                     // kop elders → blijft staan; kop hier → absorberen
  });
}
```

Voeg bovenin `src/render-lijsten.js` toe:
`import { bouwBundelIndex, zichtbareKop, isBundel, bundelVan } from "./bundel.js";`

En voeg `absorbeer, isPlatteWeergave` toe aan de export-lijst onderaan het bestand.

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Verwacht: `1170 OK, 0 FAIL`.

- [ ] **Stap 5: Sluit beide functies aan op renderNtd**

In `renderNtd()`, ná het bepalen van `q`, `fCode`, `fBeh`, `fPrio`:

```js
  const plat = isPlatteWeergave({ q, fCode, beh:fBeh, prio:fPrio, status:state.ntdStatus,
                                  sortKey:state.ntdSort.key, bulk:state.bulkMode });
  const bundelIx = plat ? new Map() : bouwBundelIndex(D.ntd, D.af);
  state._bundelIx = bundelIx;   // rowNtd leest deze tijdens dezelfde render (zie render-tabel.js)
```

De tab-tellers blijven op de **ongeabsorbeerde** lijst gebaseerd — een geabsorbeerde subtaak is
niet verdwenen, alleen anders getekend, en moet dus gewoon meetellen. Laat de bestaande
`filterNtd(...).length` in de tab-opbouw staan.

Pas alleen de lijst toe die daadwerkelijk getekend wordt. Zoek de regel waar de gefilterde rijen
naar `renderTbody` gaan en wikkel die in `absorbeer`:

```js
  const zichtbaar = absorbeer(sorteerNtd(filterNtd(D.ntd[state.activeNtd]||[],q,fCode,fBeh,fPrio,state.activeNtd,state.ntdStatus), state.ntdSort), state.activeNtd, bundelIx);
```

en geef `zichtbaar` door aan `renderTbody` en `renderPag` in plaats van de oude variabele.

⚠️ Lees de bestaande regels eerst — de variabelenamen in `renderNtd` kunnen afwijken. Behoud de
bestaande volgorde filteren → sorteren en zet `absorbeer` er als laatste omheen.

- [ ] **Stap 6: Verifieer in de browser**

Start de no-cache pythonserver uit `~/.claude`, open het dashboard en controleer dat de
takentabel er ongewijzigd uitziet (er zijn nog geen bundels in de data, dus absorptie doet niets).
Zoek iets, sorteer op een kolomkop, zet bulk-modus aan: alles moet werken als vóór deze taak.

- [ ] **Stap 7: Commit**

```bash
git add src/render-lijsten.js src/tests.js && git commit -m "Takenbundel: platte weergave bij filters, absorptie van subtaken in hetzelfde tabblad"
```

---

### Taak 8: src/render-bundel.js — stapel, pill en paneel

**Files:**
- Create: `src/render-bundel.js`
- Modify: `styles.css`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg, sec, tekst) => ({ taakId, bundelId, bundelVolg:volg, _sec:sec,
      code:'311212', naam:'Testflat', actiepunt:tekst, deadline:'1-9-2026' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop = t('Tkop','Tkop','0','VERGADERVERZOEKEN','ALV');
    const s1  = t('Tb','Tkop','10','OPPAKKEN','Aannemer bellen');
    const ix  = bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop], OPPAKKEN:[s1] },
                                { ...leeg, 'OFFERTE-TRAJECTEN':[ t('Ta','Tkop','20','OFFERTE-TRAJECTEN','Offertes') ] });
    const leden = ix.get('Tkop');

    eq('pill: telt alles behalve de kop', bundelStand(leden, zichtbareKop(leden)), { klaar:1, totaal:2 });
    const html = bundelPaneelHtml(leden, zichtbareKop(leden), false);
    eq('paneel: twee subtaakregels', (html.match(/class="bdl-sub/g)||[]).length, 2);
    eq('paneel: afgerond lid is doorgestreept', html.includes('bdl-sub af'), true);
    eq('paneel: knop om een subtaak toe te voegen', html.includes('bundel-nieuw'), true);
    eq('paneel: afgerond lid heeft geen actieknoppen',
       (html.split('bdl-sub af')[1]||'').includes('data-action="taak-afronden"'), false);
    eq('merkje: subtaak met kop elders krijgt een merkje',
       bundelMerkje(s1, ix, 'OPPAKKEN').includes('bundel-spring'), true);
    eq('merkje: de kop zelf krijgt geen merkje', bundelMerkje(kop, ix, 'VERGADERVERZOEKEN'), '');
  })();
```

Voeg toe bovenin `src/tests.js`:
`import { bundelStand, bundelPaneelHtml, bundelMerkje, bundelKopExtra } from "./render-bundel.js";`

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: import-fout, module bestaat niet.

- [ ] **Stap 3: Maak src/render-bundel.js**

```js
// ══════════════════════════════════════
//  RENDER-BUNDEL — HTML voor de Takenbundel
// ══════════════════════════════════════
import { esc, taakTitel, kortDatum } from "./util.js";
import { SECS } from "./config.js";
import { zichtbareKop, isBundel, bundelVan } from "./bundel.js";
import { ico } from "./icons.js";
import { state } from "./state.js";

// Stand van de bundel: alles behalve de zichtbare kop zelf — dus precies wat in het paneel staat.
// Zo blijft het getal stabiel terwijl een bundel vordert en de kop doorschuift.
export function bundelStand(leden, kop){
  const rest = (leden||[]).filter(m => m !== kop);
  return { klaar: rest.filter(m => m.af).length, totaal: rest.length };
}

// Extra's op de kop-rij: chevron vóór de VvE-code en de telpill achter de naam.
// De chevron is een EIGEN knop met data-action; de klik op de rij zelf is al bezet
// (main.js klapt daarmee de volledige tekst uit) en die handler negeert [data-action].
export function bundelKopExtra(leden, kop){
  const id = esc((kop.r.bundelId||'').trim());
  const open = state.bundelOpen.has((kop.r.bundelId||'').trim());
  const { klaar, totaal } = bundelStand(leden, kop);
  const lbl = open ? 'Bundel sluiten' : `Bundel openen — ${klaar} van ${totaal} subtaken klaar`;
  return {
    chevron: `<button type="button" class="bdl-chev${open?' open':''}" data-action="bundel-toggle" data-bundel="${id}" aria-expanded="${open}" title="${lbl}" aria-label="${lbl}">${ico('chevronRechts',12)}</button>`,
    pill: `<span class="bdl-pill" title="${klaar} van ${totaal} subtaken klaar">${klaar} van ${totaal} klaar</span>`,
  };
}

// Eén regel in het paneel. Een subtaak is een volwaardige taak: dezelfde drie acties als een
// tabelrij. Afgeronde leden krijgen geen acties, net als in 'Afgerond'.
function subRegel(m, i){
  const r = m.r;
  const kleur = (SECS[r._sec]||{}).color || 'var(--tx3)';
  const label = SECS[r._sec] ? SECS[r._sec].label : r._sec;
  if (m.af){
    return `<div class="bdl-sub af"><span class="bdl-h" aria-hidden="true">⠿</span>`
         + `<span class="bdl-num">${i+1}</span>`
         + `<span class="bdl-dot" style="background:${kleur}"></span>`
         + `<span class="bdl-txt">${esc(taakTitel(r))}</span>`
         + `<span class="bdl-meta">${esc(label)}</span>`
         + `<span class="bdl-klaar" title="Afgerond${r.datum?' '+esc(kortDatum(r.datum)):''}">${ico('vinkCirkel',13)}${r.datum?' '+esc(kortDatum(r.datum)):''}</span></div>`;
  }
  const rid = state._rowCache.length; state._rowCache.push(r);
  return `<div class="bdl-sub" data-taak="${esc(r.taakId||'')}">`
       + `<span class="bdl-h" data-bdl-grip="1" title="Sleep om de volgorde te wijzigen" aria-hidden="true">⠿</span>`
       + `<span class="bdl-num">${i+1}</span>`
       + `<span class="bdl-dot" style="background:${kleur}"></span>`
       + `<button type="button" class="bdl-txt" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken">${esc(taakTitel(r))}</button>`
       + `<span class="bdl-meta">${esc(label)}${r.deadline?' · '+esc(kortDatum(r.deadline)):''}</span>`
       + `<span class="bdl-acts">`
       +   `<button class="act-bw act-ico" data-action="taak-bewerken" data-rid="${rid}" title="Bewerken" aria-label="Bewerken">${ico('potlood',14)}</button>`
       +   `<button class="act-bw act-ico" data-action="taak-wegleggen" data-rid="${rid}" title="Wegleggen / opvolgdatum" aria-label="Wegleggen">${ico('klok',14)}</button>`
       +   `<button class="act-af act-ico" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden">${ico('vink',14)}</button>`
       + `</span></div>`;
}

// Het hele paneel: alle leden behálve de zichtbare kop, op volgnummer.
export function bundelPaneelHtml(leden, kop, plat){
  if (plat) return '';
  const rest = (leden||[]).filter(m => m !== kop);
  const id = esc((kop.r.bundelId||'').trim());
  return `<div class="bdl-paneel" data-bundel="${id}">`
       + rest.map(subRegel).join('')
       + `<div class="bdl-add"><button type="button" class="bdl-addb" data-action="bundel-nieuw" data-bundel="${id}">+ Voeg een subtaak toe</button></div>`
       + `</div>`;
}

// Merkje voor een subtaak die in zijn EIGEN tabblad staat terwijl de kop elders zit.
// Leeg wanneer er geen bundel is, of wanneer deze rij zelf de kop is.
export function bundelMerkje(r, index, sec){
  const leden = bundelVan(index, r);
  if (!leden) return '';
  const kop = zichtbareKop(leden);
  if (!kop || kop.r === r) return '';
  if (kop.r._sec === sec) return '';   // wordt geabsorbeerd, merkje niet nodig
  const titel = `Hoort bij: ${taakTitel(kop.r)} — klik om de bundel te openen`;
  return `<button type="button" class="bdl-merk" data-action="bundel-spring" data-bundel="${esc((r.bundelId||'').trim())}" title="${esc(titel)}" aria-label="${esc(titel)}">⛓</button>`;
}
```

⚠️ Controleer de icoonnamen tegen `src/icons.js` (`ico('chevronRechts')`, `ico('vinkCirkel')`,
`ico('potlood')`, `ico('klok')`, `ico('vink')`). Bestaat een naam niet, gebruik dan de naam die
`rowNtd` in `src/render-tabel.js` voor dezelfde knop gebruikt — die inline-SVG's staan daar
letterlijk in de `editBtn`-string.

- [ ] **Stap 4: Voeg de stijlen toe aan styles.css**

Zet dit onderaan `styles.css`:

```css
/* ── Takenbundel ─────────────────────────────────────────────── */
.bdl-chev{background:none;border:0;padding:2px 5px;margin:-2px 3px -2px -5px;cursor:pointer;
  color:var(--tx3);border-radius:4px;line-height:1;transition:transform .18s}
.bdl-chev:hover{background:var(--bg2);color:var(--tx)}
.bdl-chev.open{transform:rotate(90deg)}
.bdl-pill{background:var(--sec-l,var(--bg2));color:var(--sec,var(--tx2));font-size:11px;
  padding:1px 8px;border-radius:20px;white-space:nowrap;margin-left:8px}
/* De twee 'papierrandjes' die de stapel suggereren. Alleen zichtbaar als de bundel dicht is. */
.bdl-peek td{padding:0!important;border:0!important;height:5px}
.bdl-peek .l{display:block;height:5px;margin:0 5px;background:var(--bg2);
  border:1px solid var(--bd);border-top:0;border-radius:0 0 5px 5px}
.bdl-peek.d2 .l{height:4px;margin:0 11px}
.bdl-paneel{border-left:3px solid var(--sec,var(--bd));background:var(--bg2)}
.bdl-sub{display:flex;align-items:center;gap:9px;padding:7px 10px 7px 22px;
  border-top:1px solid var(--bd);font-size:12.5px;touch-action:none}
.bdl-sub.af{color:var(--tx3)}
.bdl-sub.af .bdl-txt{text-decoration:line-through}
.bdl-sub.sleep{opacity:.55;background:var(--bg);box-shadow:0 6px 18px rgba(0,0,0,.13)}
.bdl-h{cursor:grab;color:var(--tx3);font-size:14px;padding:2px 3px;user-select:none;touch-action:none}
.bdl-h:active{cursor:grabbing}
.bdl-sub.af .bdl-h{cursor:default;opacity:.4}
.bdl-num{color:var(--tx3);width:13px;text-align:right;flex:none;font-size:12px}
.bdl-dot{width:7px;height:7px;border-radius:50%;flex:none}
.bdl-txt{flex:1;min-width:0;text-align:left;background:none;border:0;padding:0;
  color:inherit;font:inherit;cursor:pointer}
.bdl-txt:hover{text-decoration:underline}
.bdl-meta{color:var(--tx2);font-size:11.5px;white-space:nowrap}
.bdl-klaar{color:var(--gr,var(--sec));font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:3px}
.bdl-acts{display:flex;gap:3px;flex:none}
.bdl-add{padding:9px 12px 10px 45px;border-top:1px solid var(--bd)}
.bdl-addb{font-size:12px;color:var(--tx2);border:1px solid var(--bd);border-radius:6px;
  padding:4px 10px;background:none;cursor:pointer}
.bdl-addb:hover{background:var(--bg)}
.bdl-merk{background:var(--sec-l,var(--bg2));color:var(--sec,var(--tx2));font-size:11px;
  padding:1px 7px;border-radius:20px;cursor:pointer;border:0;margin-left:6px}
```

⚠️ Controleer de kleurvariabelen (`--bg`, `--bg2`, `--bd`, `--tx`, `--tx2`, `--tx3`, `--sec`,
`--sec-l`) tegen wat bovenin `styles.css` daadwerkelijk gedefinieerd is; gebruik de bestaande
namen, verzin er geen. Let op de donkere modus.

- [ ] **Stap 5: Draai de tests en zie ze slagen**

Verwacht: `1177 OK, 0 FAIL`.

- [ ] **Stap 6: Commit**

```bash
git add src/render-bundel.js styles.css src/tests.js && git commit -m "Takenbundel: HTML en stijlen voor stapel, telpill, paneel en merkje"
```

---

### Taak 9: De gestapelde rij in de tabel

**Files:**
- Modify: `src/render-tabel.js:113-209` (`rowNtd`)
- Modify: `src/state.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Voeg bundelOpen toe aan state.js**

In `src/state.js`, direct onder `expandedRows`:

```js
  bundelOpen: new Set(),   // bundelId's van opengeklapte bundels. BEWUST op bundelId en niet op
                           // _row: rijnummers schuiven bij elke insert/delete, waardoor een op
                           // rijnummer bewaarde stand na een poll de verkeerde rij openzet.
```

- [ ] **Stap 2: Schrijf de falende test**

```js
  (() => {
    const bewaardNtd = D.ntd, bewaardAf = D.af, bewaardSec = state.activeNtd, bewaardPg = pgs.ntd;
    try {
      const t = (taakId, bundelId, volg, sec) => ({ _row: 10 + (+volg||0)/10, taakId, bundelId,
        bundelVolg:volg, _sec:sec, code:'311212', naam:'Testflat', actiepunt:'Werk', deadline:'' });
      const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
      D.ntd = { ...leeg, OPPAKKEN:[ t('Tkop','Tkop','0','OPPAKKEN'), t('Tb','Tkop','10','OPPAKKEN') ] };
      D.af = { ...leeg };
      state.activeNtd = 'OPPAKKEN'; pgs.ntd = 1; state.bundelOpen = new Set();
      renderNtd();
      const tb = document.getElementById('ntd-tbody');
      eq('rij: één zichtbare taakrij (subtaak geabsorbeerd)',
         tb.querySelectorAll('tr[data-row]').length, 1);
      eq('rij: stapelrandjes bij een dichte bundel', tb.querySelectorAll('.bdl-peek').length, 2);
      eq('rij: telpill aanwezig', tb.querySelectorAll('.bdl-pill').length, 1);
      eq('rij: geen paneel als de bundel dicht is', tb.querySelectorAll('.bdl-paneel').length, 0);

      state.bundelOpen = new Set(['Tkop']);
      renderNtd();
      const tb2 = document.getElementById('ntd-tbody');
      eq('rij: paneel verschijnt bij open bundel', tb2.querySelectorAll('.bdl-paneel').length, 1);
      eq('rij: één subtaakregel in het paneel', tb2.querySelectorAll('.bdl-sub').length, 1);
      eq('rij: stapelrandjes weg bij open bundel', tb2.querySelectorAll('.bdl-peek').length, 0);
    } finally {
      D.ntd = bewaardNtd; D.af = bewaardAf; state.activeNtd = bewaardSec;
      pgs.ntd = bewaardPg; state.bundelOpen = new Set(); renderNtd();
    }
  })();
```

- [ ] **Stap 3: Draai de test en zie hem falen**

Verwacht: `rij: stapelrandjes bij een dichte bundel → verwacht 2, kreeg 0`.

- [ ] **Stap 4: Bouw het in rowNtd**

In `src/render-tabel.js`, bovenin de imports toevoegen:

```js
import { bouwBundelIndex, zichtbareKop, isBundel, bundelVan } from "./bundel.js";
import { bundelKopExtra, bundelPaneelHtml, bundelMerkje } from "./render-bundel.js";
```

Alle vijf de `case`-takken in de `switch(sec)` beginnen met exact dezelfde eerste twee cellen:

```js
      cells=`<td>${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}</td>
```

Bereken de bundel-onderdelen daarom vóór de `switch` en voeg ze in die twee cellen in — geen
string-replace achteraf, want die zou op de vorm van de gegenereerde HTML leunen.

Voeg toe direct ná `const extraPills = stilPill + opvolgPill;`:

```js
  // ── Takenbundel ──
  // state._bundelIx wordt door renderNtd voor déze render klaargezet en is een lege Map in
  // platte weergave, zodat filters/sortering/bulk gegarandeerd de oude, vlakke tabel opleveren.
  const _ix    = state._bundelIx || null;
  const _leden = _ix ? bundelVan(_ix, r) : null;
  const _kop   = _leden ? zichtbareKop(_leden) : null;
  const _isKop = !!(_kop && _kop.r === r);
  const _extra = _isKop ? bundelKopExtra(_leden, _kop) : { chevron:'', pill:'' };
  const bdlChev = _extra.chevron;
  // Pill op de kop; anders het ⛓-merkje voor een subtaak waarvan de kop in een ander tabblad staat.
  const bdlNaam = _isKop ? _extra.pill : (_ix ? bundelMerkje(r, _ix, sec) : '');
```

Vervang daarna in **alle vijf** de `case`-takken die eerste twee regels door:

```js
      cells=`<td>${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie)}${bdlNaam}</td>
```

Vervang tot slot de slotregel

```js
  return `<tr class="${rowCls}" data-row="${r._row}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}`;
```

door:

```js
  // Dicht: twee 'papierrandjes' onder de rij. Open: het bundelpaneel.
  let bdlNa = '';
  if (_isKop){
    const open = state.bundelOpen.has((r.bundelId||'').trim());
    const kolommen = SECS[sec].cols.length + 1 + (state.bulkMode?1:0);
    bdlNa = open
      ? `<tr class="bdl-tr"><td colspan="${kolommen}">${bundelPaneelHtml(_leden, _kop, false)}</td></tr>`
      : `<tr class="bdl-peek"><td colspan="${kolommen}"><span class="l"></span></td></tr>`
      + `<tr class="bdl-peek d2"><td colspan="${kolommen}"><span class="l"></span></td></tr>`;
  }
  return `<tr class="${rowCls}${_isKop?' bdl-kop':''}" data-row="${r._row}" data-rid="${rid}"${prioAttr}>${bulkCel}${cells}</tr>${aannRow}${bdlNa}`;
```

Let op de toegevoegde `data-rid="${rid}"` op de `<tr>`: die heeft Taak 15 nodig om betrouwbaar
van een gesleepte rij naar het taak-object te komen. Zonder dit zou het stapelen via `_row`
moeten zoeken, en dat is niet uniek.

- [ ] **Stap 5: Draai de tests en zie ze slagen**

Verwacht: `1184 OK, 0 FAIL`.

- [ ] **Stap 6: Bekijk het resultaat in de browser**

Zet handmatig een bundel in de TEST-Sheet (twee rijen in "Nog Te Doen" met hetzelfde bundelnummer
in R, volgnummers 0 en 10), herlaad en controleer: stapelrandjes zichtbaar, chevron werkt nog niet
(dat is Taak 10), telpill klopt.

- [ ] **Stap 7: Commit**

```bash
git add src/render-tabel.js src/state.js src/tests.js && git commit -m "Takenbundel: gestapelde rij met stapelrandjes, telpill en paneel"
```

---

### Taak 10: Open- en dichtklappen

**Files:**
- Modify: `src/actions.js`
- Modify: `src/render-lijsten.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    eq('toggle: bundel-toggle bestaat als actie', typeof ACTIONS['bundel-toggle'], 'function');
    eq('toggle: bundel-spring bestaat als actie', typeof ACTIONS['bundel-spring'], 'function');
    state.bundelOpen = new Set();
    zetBundelOpen('Tkop', true);
    eq('toggle: openzetten onthouden', state.bundelOpen.has('Tkop'), true);
    zetBundelOpen('Tkop', false);
    eq('toggle: dichtzetten onthouden', state.bundelOpen.has('Tkop'), false);
  })();
```

Voeg `zetBundelOpen` toe aan de import uit `./render-lijsten.js`.

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: drie `undefined`-fails plus `zetBundelOpen is not a function`.

- [ ] **Stap 3: Voeg zetBundelOpen toe aan src/render-lijsten.js**

```js
// Open/dicht-stand van een bundel. Bewust op bundelId en niet op rijnummer: rijnummers schuiven
// bij elke insert/delete, dus een op rijnummer bewaarde stand zet na een poll de verkeerde rij
// open. Op bundelId blijft een opengeklapte bundel gewoon openstaan.
export function zetBundelOpen(bundelId, aan){
  const id = (bundelId||'').trim();
  if (!id) return;
  if (aan) state.bundelOpen.add(id); else state.bundelOpen.delete(id);
  renderNtd();
}
```

- [ ] **Stap 4: Haak de acties aan in src/actions.js**

Voeg toe aan de `ACTIONS`-map:

```js
  'bundel-toggle': (el) => {
    const id = el.dataset.bundel;
    zetBundelOpen(id, !state.bundelOpen.has(id));
  },
  'bundel-spring': (el) => {
    // Spring naar het tabblad van de zichtbare kop en klap de bundel open.
    const id = (el.dataset.bundel||'').trim();
    const leden = bouwBundelIndex(D.ntd, D.af).get(id);
    const kop = leden && zichtbareKop(leden);
    if (!kop) return;
    state.bundelOpen.add(id);
    setNtd(kop.r._sec);
  },
```

Voeg de benodigde imports toe bovenin `src/actions.js`:
`import { zetBundelOpen } from './render-lijsten.js';` (bij de bestaande import uit dat bestand),
`import { bouwBundelIndex, zichtbareKop } from './bundel.js';` en `import { D } from './state.js';`
(`state` wordt daar al geïmporteerd).

⚠️ `setNtd` rendert al; roep `renderNtd()` er niet nog eens achteraan. En `bundel-spring` moet ook
werken wanneer de gebruiker een filter aan heeft staan — zet daarom vóór `setNtd` het zoekveld en
de statusfilter niet leeg (dat zou werk van de gebruiker weggooien), maar laat de bundel gewoon
plat getoond worden. Het merkje blijft dan zichtbaar, wat klopt met de spec.

`bundel-nieuw` komt in Taak 11 en wordt daar getest — hier bewust nog niet, zodat elke taak op
groen eindigt.

- [ ] **Stap 5: Draai de tests en zie ze slagen**

Verwacht: `1188 OK, 0 FAIL`.

- [ ] **Stap 6: Verifieer in de browser**

Klik het chevron op de bundel uit Taak 9: het paneel klapt open en dicht, de stapelrandjes
verdwijnen bij open. Klik op het ⛓-merkje in het andere tabblad: je springt naar het tabblad van
de kop met de bundel open.

- [ ] **Stap 7: Commit**

```bash
git add src/actions.js src/render-lijsten.js src/tests.js && git commit -m "Takenbundel: open- en dichtklappen, springen vanaf het merkje"
```

---

## FASE D — Acties

### Taak 11: Subtaak toevoegen vanuit de bundel

**Files:**
- Modify: `src/actions.js`
- Modify: `src/crud.js` (hergebruik `openModal` / `prefillNieuweTaak`)
- Test: `src/tests.js`

- [ ] **Stap 1: Bekijk de bestaande voorinvul-weg**

Lees `prefillNieuweTaak` in `src/ai.js` — die zet `state.activeNtd`, roept `goTo('ntd')`,
`openModal(false)` aan en vult de velden. Hergebruik die weg; bouw geen tweede.

- [ ] **Stap 2: Schrijf de falende test**

```js
  (() => {
    eq('nieuw: bundel-nieuw bestaat als actie', typeof ACTIONS['bundel-nieuw'], 'function');
    // De nieuwe subtaak moet het bundelnummer van de kop meekrijgen én het volgende volgnummer.
    const t = (taakId, bundelId, volg) => ({ taakId, bundelId, bundelVolg:volg, _sec:'OPPAKKEN', code:'311212' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const ix = bouwBundelIndex({ ...leeg, OPPAKKEN:[ t('Tkop','Tkop','0'), t('Tb','Tkop','10') ] }, leeg);
    eq('nieuw: volgend volgnummer is 20', volgendeVolg(ix.get('Tkop')), '20');
    eq('nieuw: eerste subtaak krijgt 10', volgendeVolg([{ r:t('Tkop','Tkop','0'), af:false }]), '10');
  })();
```

- [ ] **Stap 3: Voeg de actie toe**

In `src/actions.js`:

```js
  'bundel-nieuw': (el) => {
    const id = (el.dataset.bundel||'').trim();
    const leden = bouwBundelIndex(D.ntd, D.af).get(id);
    const kop = leden && zichtbareKop(leden);
    if (!kop) return;
    // Onthoud waar de nieuwe taak bij hoort; submitTask leest dit bij het opslaan (Taak 12).
    state._nieuwBundel = { bundelId: id, volg: volgendeVolg(leden) };
    prefillNieuweTaak('', kop.r.code, kop.r.naam, '');
  },
```

Importeer `volgendeVolg` uit `./bundel.js` en `prefillNieuweTaak` uit `./ai.js`.

Voeg in `src/state.js` toe:

```js
  _nieuwBundel: null,   // {bundelId, volg} voor een taak die vanuit een bundel wordt aangemaakt
```

- [ ] **Stap 4: Laat submitTask het bundelnummer meeschrijven**

In `src/crud.js`, in de toevoeg-tak van `submitTask` (rond regel 492-514), vervang:

```js
      nieuw.taakId=nieuwTaakId();
      const addValues=values.concat(['','','','','',nieuw.taakId]);
```

door:

```js
      nieuw.taakId=nieuwTaakId();
      // Komt de taak uit een bundel ('+ Voeg een subtaak toe'), dan draagt hij meteen het
      // bundelnummer. Zo is er geen tweede schrijfactie nodig en kan er geen half-gekoppelde
      // taak ontstaan als die tweede actie zou mislukken.
      const bdl = state._nieuwBundel;
      nieuw.bundelId  = bdl ? bdl.bundelId : '';
      nieuw.bundelVolg= bdl ? bdl.volg     : '';
      state._nieuwBundel = null;
      const addValues=values.concat(['','','','','',nieuw.taakId,nieuw.bundelId,nieuw.bundelVolg]);
```

⚠️ Wis `state._nieuwBundel` óók in `clearModal()` en in `closeModal()`, anders blijft hij hangen
als de gebruiker het scherm wegklikt en de vólgende losse taak belandt per ongeluk in de bundel.
Voeg in beide functies toe: `state._nieuwBundel = null;`

- [ ] **Stap 5: Draai de tests en zie ze slagen**

Verwacht: `1191 OK, 0 FAIL`.

- [ ] **Stap 6: Verifieer ingelogd op staging**

Open de staging-URL (inloggen kan **alleen** daar — op localhost geeft Google `origin_mismatch`),
klap een bundel open, klik "+ Voeg een subtaak toe", vul een omschrijving in en sla op.
Controleer in de TEST-Sheet dat kolom R en S gevuld zijn.

- [ ] **Stap 7: Commit**

```bash
git add src/actions.js src/crud.js src/state.js src/tests.js && git commit -m "Takenbundel: subtaak toevoegen vanuit de bundel"
```

---

### Taak 12: Koppelen en ontkoppelen (schrijfweg)

**Files:**
- Create: `src/bundel-acties.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

De schrijfweg zelf is niet zonder netwerk te testen; test de **opbouw van de schrijfopdracht**.

```js
  (() => {
    const kop = { _row:12, taakId:'Tkop', bundelId:'',     bundelVolg:'' };
    const sub = { _row:20, taakId:'Tb',   bundelId:'',     bundelVolg:'' };
    const d1 = koppelBereiken(sub, kop, 'Tkop', '10');
    eq('koppel: twee bereiken (kop en subtaak)', d1.length, 2);
    eq('koppel: kop krijgt Q:S op zijn eigen rij', d1[0].range, "'Nog Te Doen'!Q12:S12");
    eq('koppel: kop draagt zijn eigen nummer als bundelnummer', d1[0].values[0], ['Tkop','Tkop','0']);
    eq('koppel: subtaak krijgt Q:S', d1[1].range, "'Nog Te Doen'!Q20:S20");
    eq('koppel: subtaak krijgt volgnummer 10', d1[1].values[0], ['Tb','Tkop','10']);

    // Kop zit al in een bundel → alleen de subtaak wordt geschreven.
    const kop2 = { _row:12, taakId:'Tkop', bundelId:'Tkop', bundelVolg:'0' };
    const d2 = koppelBereiken(sub, kop2, 'Tkop', '20');
    eq('koppel: bestaande bundel schrijft alleen de subtaak', d2.length, 1);
    eq('koppel: en dan op de rij van de subtaak', d2[0].range, "'Nog Te Doen'!Q20:S20");

    // Ontkoppelen wist R en S maar laat het taaknummer staan.
    const d3 = ontkoppelBereiken({ _row:20, taakId:'Tb', bundelId:'Tkop', bundelVolg:'10' });
    eq('ontkoppel: één bereik', d3.length, 1);
    eq('ontkoppel: taaknummer blijft, bundel weg', d3[0].values[0], ['Tb','','']);

    // Herordenen schrijft alleen S, en alleen voor leden die echt veranderen.
    const d4 = herordenBereiken([{ r:{_row:20}, volg:'10' }, { r:{_row:31}, volg:'20' }]);
    eq('herorden: twee bereiken', d4.length, 2);
    eq('herorden: alleen kolom S', d4[0].range, "'Nog Te Doen'!S20");
    eq('herorden: nieuwe volgnummers', [d4[0].values[0][0], d4[1].values[0][0]], ['10','20']);
  })();
```

Voeg toe bovenin `src/tests.js`:
`import { koppelBereiken, ontkoppelBereiken, herordenBereiken } from "./bundel-acties.js";`

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: import-fout, module bestaat niet.

- [ ] **Stap 3: Maak src/bundel-acties.js**

```js
// ══════════════════════════════════════
//  BUNDEL-ACTIES — schrijfwegen voor de Takenbundel
// ══════════════════════════════════════
import { SID } from "./config.js";
import { state, D } from "./state.js";
import { _veiligeRij, assertRowsMatch } from "./api.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { ensureToken } from "./auth.js";
import { showUndoToast } from "./notifications.js";
import { nieuwTaakId } from "./util.js";
import { bouwBundelIndex, bundelVan, volgendeVolg, hernummerLeden, magKoppelen } from "./bundel.js";
import { renderAll } from "./main.js";

// ── Opbouw van de schrijfopdrachten (puur, los testbaar) ──────────────────────
// Alles gaat via values:batchUpdate met meerdere bereiken: één atomaire POST, alles-of-niets.
// Zo kan een halve herordening niet bestaan.

// Q:S op de rij van de kop (alleen als die nog geen bundel had) plus Q:S op de rij van de subtaak.
// Q wordt meegeschreven met de bestaande waarde: dat is onschadelijk en houdt het één bereik
// per rij in plaats van twee.
export function koppelBereiken(sub, kop, bundelId, volg){
  const uit = [];
  if (!(kop.bundelId||'').trim())
    uit.push({ range:`'Nog Te Doen'!Q${kop._row}:S${kop._row}`,
               values:[_veiligeRij([kop.taakId||'', bundelId, '0'])] });
  uit.push({ range:`'Nog Te Doen'!Q${sub._row}:S${sub._row}`,
             values:[_veiligeRij([sub.taakId||'', bundelId, String(volg)])] });
  return uit;
}

// Ontkoppelen wist R en S. Het taaknummer (Q) blijft staan — dat is de identiteit van de taak
// en die mag nooit verdwijnen, anders wordt de rij een wees voor de schrijf-guard.
export function ontkoppelBereiken(r){
  return [{ range:`'Nog Te Doen'!Q${r._row}:S${r._row}`,
            values:[_veiligeRij([r.taakId||'', '', ''])] }];
}

// Herordenen raakt alleen kolom S, en alleen de leden die daadwerkelijk een ander nummer krijgen.
export function herordenBereiken(wijzigingen){
  return (wijzigingen||[]).map(w => ({ range:`'Nog Te Doen'!S${w.r._row}`,
                                       values:[_veiligeRij([String(w.volg)])] }));
}

// ── De schrijfweg zelf ────────────────────────────────────────────────────────
async function schrijfBereiken(data){
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ valueInputOption:'USER_ENTERED', data }),
  });
  if (!resp.ok){
    const e = await resp.json();
    if (resp.status === 401){ state.oauthToken = null; state.oauthExpiry = 0; }
    const err = new Error(e.error?.message || 'Bundel-actie mislukt'); err.status = resp.status; throw err;
  }
}

// Hang `sub` als subtaak onder `doel`.
export async function koppelTaak(sub, doel){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const ix = bouwBundelIndex(D.ntd, D.af);
  const check = magKoppelen(sub, doel, ix);
  if (!check.mag){ alert(check.reden); return; }

  // Kop zonder taaknummer (rij van vóór de backfill): eerst een nummer toekennen, anders is er
  // geen bundelnummer om naar te wijzen.
  if (!(doel.taakId||'').trim()) doel.taakId = nieuwTaakId();
  const bundelId = check.bundelId || doel.taakId;
  const leden = bundelVan(ix, doel);
  const volg = leden ? volgendeVolg(leden) : '10';

  const oudSub = { bundelId: sub.bundelId, bundelVolg: sub.bundelVolg };
  const oudKop = { bundelId: doel.bundelId, bundelVolg: doel.bundelVolg, taakId: doel.taakId };
  const data = koppelBereiken(sub, doel, bundelId, volg);

  // Optimistisch: meteen zichtbaar, daarna pas wegschrijven — zelfde patroon als afronden.
  if (!(doel.bundelId||'').trim()){ doel.bundelId = bundelId; doel.bundelVolg = '0'; }
  sub.bundelId = bundelId; sub.bundelVolg = volg;
  state.bundelOpen.add(bundelId);
  renderAll();

  showUndoToast('Gestapeld', `onder ${doel.naam||doel.code}`, () => ontkoppelTaak(sub), 'plus');
  backgroundWrite(
    async () => {
      // Bescherming: beide rijen moeten nog dezelfde TAAK zijn. Vergelijk met wat er NU in de
      // Sheet hoort te staan — dus met de OUDE waarden, want de rij-objecten zijn hierboven al
      // bijgewerkt (zelfde omkering als in bulkVeld).
      await assertRowsMatch([
        { row: sub._row,  r: { ...sub,  ...oudSub } },
        { row: doel._row, r: { ...doel, ...oudKop } },
      ]);
      await schrijfBereiken(data);
    },
    () => { sub.bundelId = oudSub.bundelId; sub.bundelVolg = oudSub.bundelVolg;
            doel.bundelId = oudKop.bundelId; doel.bundelVolg = oudKop.bundelVolg; },
    'Stapelen mislukt'
  );
}

// Maak van een subtaak weer een losse taak.
export async function ontkoppelTaak(r){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const oud = { bundelId: r.bundelId, bundelVolg: r.bundelVolg };
  const data = ontkoppelBereiken(r);
  r.bundelId = ''; r.bundelVolg = '';
  renderAll();
  backgroundWrite(
    async () => { await assertRowsMatch([{ row: r._row, r: { ...r, ...oud } }]); await schrijfBereiken(data); },
    () => { r.bundelId = oud.bundelId; r.bundelVolg = oud.bundelVolg; },
    'Ontkoppelen mislukt'
  );
}

// Nieuwe volgorde vastleggen na slepen. `nieuweVolgorde` is de lijst leden in de gewenste
// volgorde ({r, af}-objecten uit de index).
export async function herordenBundel(nieuweVolgorde){
  if (blokkeerOffline()) return;
  if (!await ensureToken()){ alert('Inloggen mislukt. Probeer het opnieuw.'); return; }
  const wijzigingen = hernummerLeden(nieuweVolgorde);
  if (!wijzigingen.length) return;
  const oud = wijzigingen.map(w => ({ r: w.r, volg: w.r.bundelVolg }));
  const data = herordenBereiken(wijzigingen);
  wijzigingen.forEach(w => { w.r.bundelVolg = w.volg; });
  renderAll();
  showUndoToast('Volgorde gewijzigd', '', () => {
    oud.forEach(o => { o.r.bundelVolg = o.volg; });
    renderAll();
    backgroundWrite(async () => { await schrijfBereiken(herordenBereiken(oud)); }, () => {}, 'Undo mislukt');
  }, 'sleep');
  backgroundWrite(
    async () => {
      await assertRowsMatch(oud.map(o => ({ row: o.r._row, r: { ...o.r, bundelVolg: o.volg } })));
      await schrijfBereiken(data);
    },
    () => { oud.forEach(o => { o.r.bundelVolg = o.volg; }); },
    'Volgorde opslaan mislukt'
  );
}
```

⚠️ Controleer of `rijVingerafdruk` (die `assertRowsMatch` gebruikt) de kolommen R en S meeneemt.
Doet hij dat **niet**, dan klopt bovenstaande code zonder de `...oud`-omkering ook, en is die
omkering onschadelijk. Doet hij dat **wél**, dan is de omkering noodzakelijk. Zoek dit op in
`src/api.js` en laat een korte notitie in de code achter met wat je hebt gevonden.

⚠️ Controleer of `showUndoToast` een icoonnaam `'sleep'` kent (`src/icons.js`). Zo niet, gebruik
een bestaande naam.

- [ ] **Stap 4: Draai de tests en zie ze slagen**

Verwacht: `1202 OK, 0 FAIL`.

- [ ] **Stap 5: Commit**

```bash
git add src/bundel-acties.js src/tests.js && git commit -m "Takenbundel: schrijfwegen voor koppelen, ontkoppelen en herordenen"
```

---

### Taak 13: "Hoort bij" in het bewerkscherm

**Files:**
- Modify: `index.html` (bewerkmodal)
- Modify: `src/crud.js` (`openModal`, `submitTask`)
- Modify: `src/actions.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Maak het bestaande zoekveld geschikt voor taken**

Het projectgeheugen bevat een uitdrukkelijke les: een kiezer moet via `initVveZoekveld` lopen en
niet met eigen suggestie-code. Maar `initVveZoekveld` is nu vastgeklonken aan `D.alvo` (de
VvE-lijst) — wij moeten een **taak** kunnen kiezen.

Breid de component daarom uit met een eigen bron, **achterwaarts compatibel** zodat de twee
bestaande aanroepers (taakmodal en AI-hulp) ongewijzigd blijven werken. In
`src/vve-zoekveld.js`, vervang de signatuur en de body van `initVveZoekveld`:

```js
// Wired een input + suggestielijst. Standaard op D.alvo (VvE's); geef `bron`, `filter` en
// `itemHtml` mee om er iets anders mee te kiezen — de Takenbundel kiest er een taak mee.
// De standaardwaarden houden de twee bestaande aanroepers exact zoals ze waren.
//   minTekens : pas tonen vanaf N tekens (0 = volledige lijst al bij focus)
//   maxItems  : afkappen op N (null = alles; lijst scrolt via .vve-suggestions)
//   onSelect  : (item) => …   — item is het rauwe object uit `bron`
function initVveZoekveld({input, lijstEl, minTekens=0, maxItems=null, onSelect,
                          bron=null, filter=null, itemHtml=null, sorteer=null}){
  const _bron    = bron    || (() => D.alvo);
  const _filter  = filter  || filterVves;
  const _itemHtml= itemHtml|| sugItemsHtml;
  const _sorteer = sorteer || ((a,b)=>String(a.code).localeCompare(String(b.code)));
  const toon=()=>{
    const q=input.value.trim();
    if(q.length<minTekens){ lijstEl.style.display='none'; return; }
    let m=_filter(q, _bron()).slice().sort(_sorteer);
    if(maxItems) m=m.slice(0,maxItems);
    if(!m.length){ lijstEl.style.display='none'; return; }
    lijstEl.innerHTML=_itemHtml(m);
    lijstEl.style.display='block';
    lijstEl.querySelectorAll('.vve-sug-item').forEach((el,i)=>{
      el.onclick=()=>{ lijstEl.style.display='none'; onSelect(m[i], {code:el.dataset.code, naam:el.dataset.naam}); };
    });
  };
  input.addEventListener('input', toon);
  input.addEventListener('focus', toon);
  input.addEventListener('keydown', e=>{ if(e.key==='Escape') lijstEl.style.display='none'; });
  input.addEventListener('blur', ()=>setTimeout(()=>{ lijstEl.style.display='none'; }, 200));
}
```

⚠️ Let op de tweede parameter van `onSelect`: de bestaande aanroepers krijgen hun
`{code,naam}`-object nu als **tweede** argument, niet als eerste. Zoek beide callsites op
(`src/crud.js` en `src/ai.js`) en pas ze aan naar `(_, v) => …`, óf — beter — laat het eerste
argument het rauwe object zijn en werk de callsites bij zodat ze `v.code` / `v.naam` van het
rauwe `D.alvo`-object lezen. Kies één vorm en leg hem vast met een test.

- [ ] **Stap 1b: Leg de uitbreiding vast met een test**

```js
  (() => {
    // De standaardbron blijft D.alvo; een eigen bron+filter moet daar overheen gaan.
    const taken = [{ code:'311212', naam:'Testflat', actiepunt:'Dak vervangen', taakId:'Ta' },
                   { code:'311204', naam:'Nassauplein', actiepunt:'Offerte', taakId:'Tb' }];
    const gevonden = taakFilter('dak', taken);
    eq('taakkiezer: zoekt op omschrijving', gevonden.map(t => t.taakId), ['Ta']);
    eq('taakkiezer: zoekt ook op VvE-code', taakFilter('311204', taken).map(t => t.taakId), ['Tb']);
    eq('taakkiezer: lege zoekterm geeft alles', taakFilter('', taken).length, 2);
  })();
```

Voeg `taakFilter` toe aan `src/bundel.js` en aan de import in `src/tests.js`:

```js
// Zoekfilter voor de taakkiezer in 'Hoort bij'. Zoekt op VvE-code, VvE-naam en de omschrijving.
export function taakFilter(q, lijst){
  const z = (q||'').trim().toLowerCase();
  const alles = (lijst||[]).filter(Boolean);
  if (!z) return alles;
  return alles.filter(r =>
    String(r.code||'').toLowerCase().includes(z) ||
    String(r.naam||'').toLowerCase().includes(z) ||
    String(r.actiepunt||r.periode||r.subsidie||'').toLowerCase().includes(z));
}
```

- [ ] **Stap 2: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg, sec, tekst) => ({ taakId, bundelId, bundelVolg:volg, _sec:sec,
      code:'311212', naam:'Testflat', actiepunt:tekst, deadline:'' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const ntd = { ...leeg,
      OPPAKKEN:[ t('Ta','','','OPPAKKEN','Losse taak'), t('Tb','Tb','0','OPPAKKEN','Kop met sub') ],
      VERGADERVERZOEKEN:[ t('Tc','Tb','10','VERGADERVERZOEKEN','Subtaak') ] };
    const ix = bouwBundelIndex(ntd, leeg);
    const kandidaten = koppelKandidaten(ntd, ix, ntd.OPPAKKEN[0]);
    eq('hoortbij: de taak zelf staat er niet bij',
       kandidaten.some(k => k.taakId === 'Ta'), false);
    eq('hoortbij: een bestaande kop mag als doel',
       kandidaten.some(k => k.taakId === 'Tb'), true);
    eq('hoortbij: een subtaak mag ook als doel (voegt toe aan die bundel)',
       kandidaten.some(k => k.taakId === 'Tc'), true);
  })();
```

Voeg `koppelKandidaten` toe aan de import uit `./bundel.js`.

- [ ] **Stap 3: Voeg koppelKandidaten toe aan src/bundel.js**

```js
// Taken die als doel kunnen dienen voor 'Hoort bij'. Alles behalve de taak zelf en behalve
// taken die al in dezelfde bundel zitten. Vallen op een subtaak is toegestaan: dat voegt je
// toe aan diezelfde bundel (zie magKoppelen).
export function koppelKandidaten(ntd, index, bron){
  const uit = [];
  SKEYS.forEach(s => ((ntd && ntd[s]) || []).forEach(r => {
    if (magKoppelen(bron, r, index).mag) uit.push(r);
  }));
  return uit;
}
```

- [ ] **Stap 4: Voeg het veld toe aan de bewerkmodal**

Zoek in `index.html` de bewerkmodal (het formulier met de taakvelden) en voeg als laatste veld toe:

```html
<label class="fld" id="fld-hoortbij">
  <span>Hoort bij</span>
  <div class="hoortbij-wrap">
    <input type="text" id="m-hoortbij" autocomplete="off" placeholder="Zoek een taak om onder te hangen…">
    <button type="button" class="hoortbij-x" id="m-hoortbij-x" data-action="bundel-ontkoppel" title="Ontkoppelen" aria-label="Ontkoppelen" hidden>×</button>
    <div class="hoortbij-sug" id="m-hoortbij-sug" role="listbox" hidden></div>
  </div>
</label>
```

- [ ] **Stap 5: Vul en lees het veld in crud.js**

In `openModal(...)`, binnen het blok `if(isEdit&&state.editRowData){` (regel ~44), ná
`renderTaskHistory(...)`:

```js
    // 'Hoort bij': toon de zichtbare kop van de bundel waar deze taak in zit.
    const _hb = document.getElementById('m-hoortbij');
    const _hbx = document.getElementById('m-hoortbij-x');
    if (_hb){
      const _leden = bundelVan(bouwBundelIndex(D.ntd, D.af), state.editRowData);
      const _kop = _leden && zichtbareKop(_leden);
      const _isKop = !!(_kop && _kop.r === state.editRowData);
      _hb.value = (_kop && !_isKop) ? taakTitel(_kop.r) : '';
      _hb.disabled = _isKop;   // een kop hangt zelf nergens onder — zie magKoppelen
      _hb.placeholder = _isKop ? 'Deze taak is de hoofdtaak van een bundel' : 'Zoek een taak om onder te hangen…';
      state._hbDoel = null;    // gekozen doeltaak; wordt gezet door de kiezer
      if (_hbx) _hbx.hidden = !(_kop && !_isKop);
    }
```

De **bewerk-tak van `submitTask` blijft ongemoeid.** Die schrijft `A${row}:${endCol}${row}` met
`endCol = String.fromCharCode(64+Math.max(values.length,9))`; bij 11 waarden is dat `K`. Kolom Q,
R en S worden daar dus niet geraakt — precies zoals het vaste taaknummer er destijds bewust
buiten is gehouden.

Koppelen gebeurt daarom als **losse actie**, ná het opslaan. Voeg in de bewerk-tak, direct ná
`closeModal();clearModal();`, toe:

```js
      // Bundelkoppeling is een aparte schrijfweg (kolom R/S) en loopt bewust NIET mee in de
      // A:K-write hierboven — die zou de bundelkolommen niet raken, maar de twee acties moeten
      // ook los kunnen mislukken zonder elkaar mee te trekken.
      const _hbDoel = state._hbDoel; state._hbDoel = null;
      if (_hbDoel) koppelTaak(doelRow, _hbDoel);
```

Importeer bovenin `src/crud.js`: `koppelTaak` uit `./bundel-acties.js`, en
`bouwBundelIndex, bundelVan, zichtbareKop` uit `./bundel.js`. `taakTitel` komt uit `./util.js`
(voeg toe aan de bestaande import).

- [ ] **Stap 5b: Leg met een test vast dat een gewone bewerking Q/R/S niet raakt**

```js
  (() => {
    // De bewerk-tak schrijft A..K. Met 11 waarden moet de eindkolom K zijn — niet verder,
    // anders veegt een gewone bewerking het taaknummer en de bundel leeg.
    const endCol = n => String.fromCharCode(64 + Math.max(n, 9));
    eq('bewerken: elf waarden schrijven tot en met K', endCol(11), 'K');
  })();
```

- [ ] **Stap 5c: Sluit de kiezer aan**

Voeg `_hbDoel` toe aan `src/state.js`:

```js
  _hbDoel: null,   // in 'Hoort bij' gekozen hoofdtaak; submitTask koppelt hem ná het opslaan
```

En koppel de kiezer aan het veld — dit hoort bij de overige modal-initialisatie in `src/main.js`,
op dezelfde plek waar `initVveZoekveld` nu al voor `#m-code` wordt aangeroepen:

```js
  initVveZoekveld({
    input:   document.getElementById('m-hoortbij'),
    lijstEl: document.getElementById('m-hoortbij-sug'),
    minTekens: 2,
    maxItems: 12,
    // Alleen taken die daadwerkelijk als doel mogen dienen — de guard bepaalt dat, niet de UI.
    bron: () => koppelKandidaten(D.ntd, bouwBundelIndex(D.ntd, D.af), state.editRowData || {}),
    filter: taakFilter,
    itemHtml: m => m.map(r => `<div class="vve-sug-item" data-code="${esc(r.code)}" data-naam="${esc(r.naam||'')}">`
      + `<div class="vve-sug-code">${esc(r.code)}</div>`
      + `<div class="vve-sug-naam">${esc(taakTitel(r))}</div></div>`).join(''),
    sorteer: (a,b) => String(a.code).localeCompare(String(b.code)),
    onSelect: (taak) => {
      state._hbDoel = taak;
      document.getElementById('m-hoortbij').value = taakTitel(taak);
      const x = document.getElementById('m-hoortbij-x'); if (x) x.hidden = false;
    },
  });
```

⚠️ Wist de gebruiker het veld handmatig leeg, dan moet `state._hbDoel` óók leeg: voeg een
`input`-listener toe die `state._hbDoel = null` zet zodra de tekst niet meer overeenkomt met de
gekozen taak. Zonder dat koppelt een leeggemaakt veld alsnog.

`src/main.js` importeert `esc` en `taakTitel` nog niet — voeg ze toe aan een import uit
`./util.js`, en `initVveZoekveld` uit `./vve-zoekveld.js`, `koppelKandidaten` + `taakFilter` uit
`./bundel.js`, `bouwBundelIndex` uit `./bundel.js`.

- [ ] **Stap 6: Voeg de ontkoppel-actie toe aan src/actions.js**

```js
  'bundel-ontkoppel': () => {
    const r = state.editRowData;
    if (!r) return;
    ontkoppelTaak(r);
    const inp = document.getElementById('m-hoortbij');
    if (inp) inp.value = '';
    const x = document.getElementById('m-hoortbij-x');
    if (x) x.hidden = true;
  },
```

- [ ] **Stap 7: Draai de tests en zie ze slagen**

Verwacht: `1209 OK, 0 FAIL` (3 asserts uit stap 1b, 3 uit stap 2, 1 uit stap 5b).

- [ ] **Stap 8: Verifieer ingelogd op staging**

Koppel een bestaande taak via "Hoort bij", controleer kolom R/S in de TEST-Sheet, ontkoppel weer.
Bewerk daarna een gewone taak (naam wijzigen) en controleer dat Q/R/S onaangeroerd blijven.

- [ ] **Stap 9: Commit**

```bash
git add index.html src/crud.js src/actions.js src/bundel.js src/tests.js && git commit -m "Takenbundel: 'Hoort bij' in het bewerkscherm, met ontkoppelen"
```

---

### Taak 14: Slepen om de volgorde te wijzigen

**Files:**
- Modify: `src/bundel-acties.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

De sleepbeweging zelf is niet zinvol te unit-testen; test de **plaatsbepaling**.

```js
  (() => {
    // Waar hoort het gesleepte element terecht te komen, gegeven de muispositie?
    // rects zijn [top, bottom] per zichtbare regel.
    const rects = [[100,130],[130,160],[160,190]];
    eq('sleep: boven de eerste helft → ervóór', sleepDoel(rects, 110), { index:0, ervoor:true });
    eq('sleep: onder de eerste helft → erná',   sleepDoel(rects, 125), { index:0, ervoor:false });
    eq('sleep: middelste regel bovenhelft',      sleepDoel(rects, 140), { index:1, ervoor:true });
    eq('sleep: boven alles → helemaal vooraan',  sleepDoel(rects, 50),  { index:0, ervoor:true });
    eq('sleep: onder alles → helemaal achteraan',sleepDoel(rects, 300), { index:2, ervoor:false });
    eq('sleep: lege lijst geeft null',           sleepDoel([], 120), null);
  })();
```

Voeg `sleepDoel` toe aan de import uit `./bundel-acties.js`.

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `sleepDoel is not a function`.

- [ ] **Stap 3: Voeg sleepDoel toe aan src/bundel-acties.js**

```js
// Waar komt het gesleepte element terecht? Puur, dus los testbaar zonder DOM.
// `rects` = [[top,bottom], …] van de zichtbare regels, `y` = de muis-/vingerpositie.
export function sleepDoel(rects, y){
  if (!rects || !rects.length) return null;
  for (let i = 0; i < rects.length; i++){
    const [top, bot] = rects[i];
    if (y >= top && y <= bot) return { index:i, ervoor: y < top + (bot - top)/2 };
  }
  // Buiten alle regels: boven het eerste blok vooraan, anders achteraan.
  return y < rects[0][0] ? { index:0, ervoor:true } : { index:rects.length-1, ervoor:false };
}
```

- [ ] **Stap 4: Bouw de sleep-afhandeling**

Voeg toe aan `src/bundel-acties.js`:

```js
// Slepen op pointer-events, niet op de HTML5-sleepfunctie: die werkt niet op een touchscreen,
// en dit dashboard wordt ook op de telefoon gebruikt. `touch-action:none` op .bdl-sub en .bdl-h
// (styles.css) voorkomt dat de pagina meescrollt tijdens het slepen.
let _sleep = null;

export function initBundelSlepen(container){
  if (!container || container._bdlSleep) return;
  container._bdlSleep = true;
  container.addEventListener('pointerdown', e => {
    const grip = e.target.closest('[data-bdl-grip]');
    if (!grip) return;
    const rij = grip.closest('.bdl-sub');
    const paneel = rij && rij.closest('.bdl-paneel');
    if (!rij || !paneel) return;
    _sleep = { rij, paneel };
    rij.classList.add('sleep');
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  container.addEventListener('pointermove', e => {
    if (!_sleep) return;
    const anderen = [...
      _sleep.paneel.querySelectorAll('.bdl-sub')].filter(x => x !== _sleep.rij);
    const doel = sleepDoel(anderen.map(x => { const r = x.getBoundingClientRect(); return [r.top, r.bottom]; }), e.clientY);
    if (!doel) return;
    const ref = anderen[doel.index];
    _sleep.paneel.insertBefore(_sleep.rij, doel.ervoor ? ref : ref.nextSibling);
  });
  const stop = () => {
    if (!_sleep) return;
    const { rij, paneel } = _sleep;
    _sleep = null;
    rij.classList.remove('sleep');
    // Nieuwe volgorde uit de DOM aflezen en vastleggen.
    const id = paneel.dataset.bundel;
    const leden = bouwBundelIndex(D.ntd, D.af).get(id) || [];
    const kop = leden.find(m => !m.af);
    const opTaakId = new Map(leden.map(m => [String(m.r.taakId||''), m]));
    const nieuw = [kop].concat(
      [...paneel.querySelectorAll('.bdl-sub')]
        .map(el => opTaakId.get(el.dataset.taak || ''))
        .filter(Boolean)
    ).filter(Boolean);
    herordenBundel(nieuw);
  };
  container.addEventListener('pointerup', stop);
  container.addEventListener('pointercancel', stop);
}
```

⚠️ Afgeronde leden hebben geen `data-taak` (zie `subRegel` in `render-bundel.js`) en vallen door
`.filter(Boolean)` uit de nieuwe volgorde. Dat is fout: ze horen hun plek te houden. Voeg
`data-taak` óók toe aan de afgeronde regel in `src/render-bundel.js`, zodat elk lid meedoet.
Werk de test uit Taak 8 bij zodat hij dat vastlegt.

- [ ] **Stap 5: Roep initBundelSlepen aan**

In `src/main.js`, bij de bestaande listeners op `#ntd-tbody`:

```js
  initBundelSlepen(document.getElementById('ntd-tbody'));
```

- [ ] **Stap 6: Draai de tests en zie ze slagen**

Verwacht: `1215 OK, 0 FAIL`.

- [ ] **Stap 7: Verifieer ingelogd op staging, óók op de telefoon**

Sleep een subtaak omhoog en omlaag. Controleer kolom S in de TEST-Sheet. Test daarna op een
telefoon: het slepen moet werken zonder dat de pagina meescrollt.

- [ ] **Stap 8: Commit**

```bash
git add src/bundel-acties.js src/render-bundel.js src/main.js src/tests.js && git commit -m "Takenbundel: volgorde wijzigen door te slepen (pointer-events, ook op touch)"
```

---

### Taak 15: Slepen om te stapelen

**Files:**
- Modify: `src/bundel-acties.js`
- Modify: `src/render-vve.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg) => ({ taakId, bundelId, bundelVolg:volg, _sec:'OPPAKKEN', code:'311212' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const a = t('Ta','',''), b = t('Tb','','');
    const ix = bouwBundelIndex({ ...leeg, OPPAKKEN:[a,b] }, leeg);
    eq('stapel: los op los is toegestaan', magKoppelen(a, b, ix).mag, true);
    eq('stapel: het doel wordt de hoofdtaak', magKoppelen(a, b, ix).bundelId, 'Tb');
  })();
```

- [ ] **Stap 2: Draai de test**

Deze slaagt al door Taak 6 — dat is de bedoeling: het bevestigt dat de guard klaarstaat voor deze
nieuwe aanroeper. Ga door naar stap 3.

- [ ] **Stap 3: Bouw het stapelen in de takentabel**

Voeg toe aan `src/bundel-acties.js`:

```js
// Rij-op-rij slepen om te stapelen. Alleen in de standaardlijst — in platte weergave (filters,
// sortering, bulk) staat de stapelweergave uit en mag er ook niet gesleept worden.
// Er is hier geen tweede betekenis van slepen: de takentabel kent geen handmatige sortering,
// dus élke drop op een andere rij betekent 'stapelen'.
export function initStapelSlepen(container, rijSelector, taakVanEl){
  if (!container || container._bdlStapel) return;
  container._bdlStapel = true;
  let bron = null;
  container.addEventListener('pointerdown', e => {
    if (state._bundelPlat) return;               // platte weergave: niet slepen
    if (e.target.closest('button,a,input,select,textarea,[data-action],.bdl-paneel')) return;
    const el = e.target.closest(rijSelector);
    if (!el) return;
    bron = { el, r: taakVanEl(el), x:e.clientX, y:e.clientY, actief:false };
  });
  container.addEventListener('pointermove', e => {
    if (!bron) return;
    // Pas na 6px echt slepen, anders wordt elke klik een sleepbeweging.
    if (!bron.actief && Math.abs(e.clientY - bron.y) + Math.abs(e.clientX - bron.x) < 6) return;
    bron.actief = true;
    bron.el.classList.add('sleep');
    const over = document.elementFromPoint(e.clientX, e.clientY);
    container.querySelectorAll('.stapel-doel').forEach(x => x.classList.remove('stapel-doel'));
    const doelEl = over && over.closest(rijSelector);
    if (doelEl && doelEl !== bron.el) doelEl.classList.add('stapel-doel');
  });
  const stop = e => {
    if (!bron) return;
    const { el, r, actief } = bron;
    bron = null;
    el.classList.remove('sleep');
    container.querySelectorAll('.stapel-doel').forEach(x => x.classList.remove('stapel-doel'));
    if (!actief) return;                          // gewone klik, geen sleep
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const doelEl = over && over.closest(rijSelector);
    if (!doelEl || doelEl === el) return;
    const doel = taakVanEl(doelEl);
    if (r && doel) koppelTaak(r, doel);
  };
  container.addEventListener('pointerup', stop);
  container.addEventListener('pointercancel', () => { bron = null; });
}
```

Zet in `renderNtd` naast `state._bundelIx` ook `state._bundelPlat = plat;`.

Voeg de stijl toe aan `styles.css`:

```css
tr.sleep{opacity:.55}
tr.stapel-doel td{background:var(--sec-l,var(--bg2))!important;box-shadow:inset 0 0 0 2px var(--sec,var(--bd))}
.tk.stapel-doel{background:var(--sec-l,var(--bg2));box-shadow:inset 0 0 0 2px var(--sec,var(--bd))}
```

- [ ] **Stap 4: Haak het aan in de takentabel**

In `src/main.js`, bij de bestaande listeners op `#ntd-tbody`:

```js
  initStapelSlepen(document.getElementById('ntd-tbody'), 'tr[data-row]',
    el => state._rowCache[+el.dataset.rid] || null);
```

Dit leunt op de `data-rid` die Taak 9 aan de `<tr>` heeft toegevoegd. Zoeken op `_row` zou hier
niet deugen: `_rowCache` kan dezelfde taak meermaals bevatten (de dossier-DOM van een eerder
bezocht dossier blijft in de pagina staan), en dan levert een `_row`-zoektocht de verkeerde
treffer op — hetzelfde probleem dat `doCompleteTask` al met `.page.active` moet omzeilen.

- [ ] **Stap 5: Haak het aan op de VvE-dossierpagina**

De dossierpagina tekent alles in `#vve-inhoud` (`src/render-vve.js:198`); elke taak is een
`<div class="tk" data-rid="…">` (regel ~240). Voeg aan het eind van `renderVve()` toe:

```js
  initStapelSlepen(document.getElementById('vve-inhoud'), '.tk',
    el => state._rowCache[+el.dataset.rid] || null);
```

⚠️ `renderVve()` vervangt de inhoud van `#vve-inhoud` bij elke render, maar `#vve-inhoud` zélf
blijft bestaan — de listener hangt aan de container en overleeft dus een hertekening. De
`_bdlStapel`-vlag in `initStapelSlepen` voorkomt dat er bij elke render een listener bij komt.

Dit is de plek waar het hoofdvoorbeeld werkt: op de dossierpagina staan alle categorieën van één
VvE bij elkaar, dus je kunt daar een offerte-taak op een vergaderverzoek slepen.

- [ ] **Stap 6: Draai de tests**

Verwacht: `1217 OK, 0 FAIL`.

- [ ] **Stap 7: Verifieer ingelogd op staging**

Sleep in de takentabel een taak op een andere taak van dezelfde categorie → bundel ontstaat,
ongedaan-maken-melding verschijnt en werkt. Sleep op de dossierpagina een offerte-taak op een
vergaderverzoek → bundel over categorieën heen. Probeer een taak mét subtaken te slepen →
melding "Deze taak heeft zelf subtaken; ontkoppel die eerst."

- [ ] **Stap 8: Commit**

```bash
git add src/bundel-acties.js src/render-vve.js src/main.js src/render-lijsten.js styles.css src/tests.js && git commit -m "Takenbundel: stapelen door rij op rij te slepen, in de tabel en op de VvE-pagina"
```

---

### Taak 16: Waarschuwing bij afronden en verwijderen

**Files:**
- Modify: `src/crud.js` (`completeTask`, `deleteTaskRow`)
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

```js
  (() => {
    const t = (taakId, bundelId, volg, sec) => ({ taakId, bundelId, bundelVolg:volg, _sec:sec, code:'311212' });
    const leeg = { OPPAKKEN:[], VERGADERVERZOEKEN:[], 'OFFERTE-TRAJECTEN':[], LOD:[], 'SUBSIDIE-TRAJECTEN':[] };
    const kop = t('Tkop','Tkop','0','VERGADERVERZOEKEN');
    const ix = bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop],
                                 OPPAKKEN:[ t('Tb','Tkop','10','OPPAKKEN'), t('Tc','Tkop','20','OPPAKKEN') ] }, leeg);
    eq('waarschuwing: twee open subtaken', openSubtaken(ix, kop), 2);
    eq('waarschuwing: tekst benoemt het aantal', bundelWaarschuwing(ix, kop),
       'Er staan nog 2 subtaken open — toch afronden?');
    eq('waarschuwing: enkelvoud bij één', bundelWaarschuwing(
       bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop], OPPAKKEN:[ t('Tb','Tkop','10','OPPAKKEN') ] }, leeg), kop),
       'Er staat nog 1 subtaak open — toch afronden?');
    eq('waarschuwing: geen melding zonder open subtaken',
       bundelWaarschuwing(bouwBundelIndex({ ...leeg, VERGADERVERZOEKEN:[kop] }, leeg), kop), '');
  })();
```

Voeg `openSubtaken, bundelWaarschuwing` toe aan de import uit `./bundel.js`.

- [ ] **Stap 2: Draai de test en zie hem falen**

Verwacht: `openSubtaken is not a function`.

- [ ] **Stap 3: Voeg beide toe aan src/bundel.js**

```js
// Aantal nog openstaande leden van de bundel, de gegeven taak zelf niet meegeteld.
export function openSubtaken(index, r){
  const leden = bundelVan(index, r);
  if (!leden) return 0;
  return leden.filter(m => !m.af && m.r !== r).length;
}

// Waarschuwingstekst bij het afronden van een taak met openstaande subtaken. Lege string = niets
// te melden. De bundel valt hierdoor NIET uit elkaar: de kop schuift door naar het eerstvolgende
// openstaande lid (zie zichtbareKop).
export function bundelWaarschuwing(index, r){
  const n = openSubtaken(index, r);
  if (!n) return '';
  return n === 1
    ? 'Er staat nog 1 subtaak open — toch afronden?'
    : `Er staan nog ${n} subtaken open — toch afronden?`;
}
```

- [ ] **Stap 4: Sluit het aan op completeTask**

In `src/crud.js`, in `completeTask(...)` — vóór het openen van de afrond-modal:

```js
  const _w = bundelWaarschuwing(bouwBundelIndex(D.ntd, D.af), r);
  if (_w && !confirm(_w)) return;
```

- [ ] **Stap 5: Sluit het aan op deleteTaskRow**

In `deleteTaskRow(r)`, vóór de mutatie:

```js
  const _n = openSubtaken(bouwBundelIndex(D.ntd, D.af), r);
  if (_n && !confirm(`Deze taak heeft nog ${_n} ${_n===1?'subtaak':'subtaken'}. Die blijven bestaan als bundel. Toch verwijderen?`)) return;
```

Er is bewust **geen cascade**: verwijderen raakt nooit meer dan één taak.

- [ ] **Stap 6: Draai de tests en zie ze slagen**

Verwacht: `1221 OK, 0 FAIL`.

- [ ] **Stap 7: Verifieer ingelogd op staging**

Rond een hoofdtaak af met open subtaken: waarschuwing verschijnt, na bevestigen schuift de kop
door naar de eerste subtaak en staat de bundel in het tabblad van díe taak, met de afgeronde
hoofdtaak afgevinkt bovenin.

- [ ] **Stap 8: Commit**

```bash
git add src/crud.js src/bundel.js src/tests.js && git commit -m "Takenbundel: waarschuwing bij afronden en verwijderen met openstaande subtaken"
```

---

## FASE E — Uitrol

### Taak 17: Versie, volledige testronde en staging

**Files:**
- Modify: `src/config.js:8`
- Modify: `sw.js:25`

- [ ] **Stap 1: Hoog de versienummers op**

`src/config.js`: `export const APP_VERSION = '10.13';`
`sw.js`: `const CACHE_VERSION = 'cd-v108';`

- [ ] **Stap 2: Draai de volledige testronde**

Open `index.html?test=1`. Verwacht: `1221 OK, 0 FAIL`. Bij ook maar één FAIL: eerst oplossen.

- [ ] **Stap 3: Push naar staging**

```bash
git checkout staging && git merge --no-ff feature/takenbundel && git push origin staging
```

- [ ] **Stap 4: Test ingelogd op de Vercel-staging-URL**

`collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`

Inloggen kan **alleen** daar — op localhost geeft Google `origin_mismatch`.

Loop deze lijst af en vink elk punt af:
- [ ] Bundel maken via "+ Voeg een subtaak toe"
- [ ] Bundel maken via "Hoort bij" in het bewerkscherm
- [ ] Bundel maken door rij op rij te slepen in de takentabel
- [ ] Bundel maken door te slepen op de VvE-dossierpagina (over categorieën heen)
- [ ] Volgorde wijzigen door te slepen, op desktop én telefoon
- [ ] Subtaak afronden vanuit het paneel — blijft doorgestreept staan
- [ ] Hoofdtaak afronden met open subtaken — waarschuwing, kop schuift door
- [ ] Hoofdtaak verwijderen — bundel blijft bestaan
- [ ] Ontkoppelen via het kruisje
- [ ] Zoeken, filteren, kolomsortering en bulk-modus → platte weergave, tellers kloppen
- [ ] Ongedaan maken werkt bij elke stapel-actie
- [ ] Offline: stapelen wordt geblokkeerd vóór de mutatie
- [ ] Twee tabbladen open: wijziging in het ene verschijnt in het andere na de poll
- [ ] Donkere modus

- [ ] **Stap 5: Draai de tests op de live staging-URL**

Open de staging-URL met `?test=1` en lees `window._testResult`. Verwacht: `1221 OK, 0 FAIL`.
Dit is een andere controle dan lokaal: hier draait de gepubliceerde code.

- [ ] **Stap 6: Commit en push**

```bash
git add src/config.js sw.js && git commit -m "Takenbundel: versie 10.13 / cd-v108" && git push origin staging
```

---

### Taak 18: Naar productie

- [ ] **Stap 1: Controleer dat main en staging niet uiteenlopen**

```bash
git log --oneline main..staging && git log --oneline staging..main
```

De tweede opdracht hoort **leeg** te zijn. Is dat niet zo, dan is er werk op `main` dat niet op
`staging` staat — kaal mergen is dan verboden (bekende les uit dit project). Eerst uitzoeken.

- [ ] **Stap 2: Fast-forward naar main en push**

```bash
git checkout main && git merge --ff-only staging && git push origin main
```

- [ ] **Stap 3: Verifieer de echte productie**

Open `https://vvebeheercollectief.github.io/Collectief-Dashboard/` — let op: de kale root geeft
404. Controleer: versie 10.13 zichtbaar, géén TESTOMGEVING-balk, en de bundelfunctie werkt op de
echte data.

- [ ] **Stap 4: Draai de tests op productie**

Open de productie-URL met `?test=1`. Verwacht: `1221 OK, 0 FAIL`.

- [ ] **Stap 5: Werk het projectgeheugen bij**

Schrijf een memory-bestand `project_takenbundel.md` met: wat er live staat, de kolomindeling
(R/S in "Nog Te Doen", Q/R/S in "Afgerond"), de zichtbare-kop-regel, de platte-weergaveregel, en
de lessen die tijdens het bouwen zijn opgedaan. Voeg één regel toe aan `MEMORY.md`.
