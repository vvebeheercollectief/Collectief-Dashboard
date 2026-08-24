# Signaal-kolom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle urgentiemeldingen die nu verspreid over de takenrij staan bundelen in één "Signaal"-kolom op Oppakken, Vergaderverzoeken en LOD, zodat er per rij nog maar één plek is waar staat wat er aan de hand is.

**Architecture:** Eén pure functie `signaalDelen(r, sec)` weegt de bestaande signaalbronnen (`berekenPrioriteit`, `opvolgStatus`, `bepaalStil`) tot een geordende lijst; `signaalCel()` tekent daar één `<td>` van met de zwaarste melding groot en de tweede klein erachter. De bestaande klassenamen (`s-telaat`, `pill-opvolg`, `pill-stil`, `pill-snooze`) blijven staan als betekenisdragers maar verliezen binnen de cel hun eigen opmaak — zo blijven negen bestaande toetsen geldig en is er één bron voor "welke klasse hoort bij welk signaal".

**Tech Stack:** Vanilla ES-modules, geen build. Toetsen draaien in de browser via `?test=1` (`src/tests.js`, resultaat in `window._testResult`). Syntaxcontrole via `node tools/syntaxcheck.js`.

**Spec:** `docs/superpowers/specs/2026-08-24-signaal-kolom-design.md`

---

## Vooraf: hoe je draait en toetst

Start de lokale server (geen cache, anders zie je je eigen wijziging niet):

```bash
python3 ~/.claude/nocache-server.py 8123 ~/collectief-dashboard
```

Syntaxcontrole vóór elke testronde — parseert alle 53 bestanden in een seconde:

```bash
node tools/syntaxcheck.js
```

Toetsen draaien: open `http://localhost:8123/index.html?test=1`, wacht tot
`window._testResult` gevuld is (vorm: `"2228 OK, 0 FAIL"`). Rode regels staan in
`window._testFails`.

**Meetlessen die in dit project al eens een halve dag hebben gekost:**
- Zet CSS-overgangen uit vóór een kleur- of doorzichtigheidsmeting; `getComputedStyle` levert
  anders een waarde van halverwege de animatie.
- Een pixel-assert zónder expliciete vensterbreedte meet het venster van de testrunner.
- `:focus` matcht niet in een venster zonder focus.
- Het browserpaneel-tabblad moet zichtbaar zijn; op de achtergrond duurt een ronde 10+ minuten
  in plaats van 60 seconden.

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Wat er verandert |
|---|---|---|
| `src/config.js` | `SECS` (kolommen + sleutels per sectie) | `VELD_LABELS` erbij; `cols` van drie secties krijgt `Signaal` en `Behandelaar`→`Wie` |
| `src/util.js` | pure helpers | `stilDrempel()` vervangt `STIL_DREMPEL_DAGEN`; `korteNaam()` + `persBadges(v, kort)`; `subBadge(v, sec)` |
| `src/verplaats.js` | verplaats-dialoog | `_veldLabel` leest `VELD_LABELS` i.p.v. `cols[i]` |
| `src/render-tabel.js` | tabelrijen | `signaalDelen()` + `signaalCel()`; drie `case`-blokken in `rowNtd` |
| `src/render-bundel.js` | bundelpaneel | de twee ontbrekende signalen (vandaag/stil) erbij |
| `styles.css` | opmaak | `.cell-sig` + `.sig*`; klasse-neutralisatie; `.stapel-h` bij hover; `.pers-kort` |
| `src/tests.js` | zelftest | nieuwe toetsen; één fixture ophogen |

---

## Task 1: `_veldLabel` losmaken van de kolomindex

`_veldLabel` (`src/verplaats.js:55-60`) koppelt `SECS[sec].cols` en `SECS[sec].keys` op index.
Dat is nú al fout — bij Oppakken is `keys[5]` = `prioriteit` en `cols[5]` = `'Opmerkingen'`, dus de
verplaats-dialoog zegt vandaag "Opmerkingen: Hoog". Zodra er een `Signaal`-kop bijkomt schuift
alles nog een plek op. Deze taak moet dus vóór de kolom-invoeging.

**Files:**
- Modify: `src/config.js` (na het `SECS`-blok, rond regel 76)
- Modify: `src/verplaats.js:52-60`
- Test: `src/tests.js` (bij het bestaande verplaats-blok, rond regel 10805)

- [ ] **Step 1: Schrijf de falende toets**

Voeg toe in `src/tests.js`, direct vóór de bestaande regel
`eq('verplaatsen: velden die de nieuwe categorie niet kent worden benoemd, niet stil gewist', ...)`:

```javascript
    // _veldLabel mag niet op kolomINDEX werken: `cols` en `keys` lopen niet gelijk op
    // (Oppakken heeft 6 koppen en 8 sleutels) en er komt een kop bij die geen veld heeft.
    eq('veldlabel: prioriteit heet Prioriteit, niet Opmerkingen',
       _veldLabel('OPPAKKEN', 'prioriteit'), 'Prioriteit');
    eq('veldlabel: LOD-status blijft Status',
       _veldLabel('LOD', 'status'), 'Status');
    eq('veldlabel: een onbekend veld valt terug op de sleutel zelf',
       _veldLabel('OPPAKKEN', 'ditbestaatniet'), 'ditbestaatniet');
    // Driftbewaking: elke kop in `cols` die een veld beschrijft moet ook in VELD_LABELS staan.
    // 'Signaal' hoort bij geen enkel veld en is daarom de enige uitzondering.
    eq('veldlabel: geen enkele kolomkop is uit VELD_LABELS weggelopen',
       Object.keys(SECS).flatMap(s =>
         SECS[s].cols.filter(c => c !== 'Signaal' &&
           !Object.values(VELD_LABELS[s] || {}).includes(c)).map(c => `${s}:${c}`)),
       []);
```

Breid de bestaande import-regel van `verplaats.js` in `src/tests.js` uit met `_veldLabel`:

```javascript
import { verplaatsTaak, verplaatsWaarden, verlorenVelden, verplaatsVraagTekst, _veldLabel } from "./verplaats.js";
```

En de import van `config.js` in `src/tests.js` met `VELD_LABELS` (zoek de regel die `SECS` importeert en voeg `VELD_LABELS` toe).

- [ ] **Step 2: Draai de toets en zie hem falen**

Open `http://localhost:8123/index.html?test=1`.
Verwacht: `FAIL: veldlabel: prioriteit heet Prioriteit, niet Opmerkingen → verwacht "Prioriteit", kreeg "Opmerkingen"` — plus een ReferenceError op `VELD_LABELS` tot stap 3 klaar is.

- [ ] **Step 3: Voeg `VELD_LABELS` toe aan `src/config.js`**

Direct ná het `SECS`-blok en vóór `export const SKEYS = Object.keys(SECS);`:

```javascript
// De kolomkop zoals de gebruiker hem ziet, per VELDNAAM in plaats van per kolompositie.
//
// WAAROM NIET OP INDEX. `cols` en `keys` liepen nooit echt gelijk op: Oppakken heeft zes koppen
// en acht sleutels, dus `cols[keys.indexOf('prioriteit')]` gaf 'Opmerkingen' en de
// verplaats-dialoog zei "Opmerkingen: Hoog". Sinds er een kop 'Signaal' bij is die bij géén veld
// hoort, zou elke sleutel erna nog een plek opschuiven. Deze afbeelding is expliciet en kan niet
// stil verkeerd gaan; de toets 'geen enkele kolomkop is uit VELD_LABELS weggelopen' bewaakt drift.
export const VELD_LABELS = {
  'OPPAKKEN': {
    code:'VvE Code', naam:'VvE', actiepunt:'Actiepunt', deadline:'Deadline',
    behandelaar:'Wie', prioriteit:'Prioriteit', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'VERGADERVERZOEKEN': {
    code:'VvE Code', naam:'VvE', periode:'Periode', agendapunten:'Agendapunten',
    behandelaar:'Wie', deadline:'Deadline uitschr.', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'OFFERTE-TRAJECTEN': {
    code:'VvE Code', naam:'VvE', datumAangevraagd:'Datum aangevr.',
    offertes:'Ontvangen/Aangevr.', behandelaar:'Behandelaar', deadline:'Deadline',
    opmerkingen:'Opmerkingen',
  },
  'LOD': {
    code:'VvE Code', naam:'VvE', actiepunt:'Actiepunt', status:'Status',
    behandelaar:'Wie', deadline:'Deadline LOD', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
  'SUBSIDIE-TRAJECTEN': {
    code:'VvE Code', naam:'VvE', subsidie:'Subsidie', subsidieFase:'Fase',
    behandelaar:'Behandelaar', deadline:'Deadline', opmerkingen:'Opmerkingen',
    inBehandeling:'In behandeling',
  },
};
```

- [ ] **Step 4: Laat `_veldLabel` die afbeelding gebruiken**

Vervang in `src/verplaats.js` de functie op regel 52-60 door:

```javascript
// De kolomkop zoals de gebruiker hem in de tabel ziet, zodat de vraag niet met interne veldnamen
// spreekt. Uit VELD_LABELS (config.js) en nadrukkelijk NIET uit `cols` op index: die twee lopen
// niet gelijk op, en sinds er een kop 'Signaal' bij is die bij geen veld hoort al helemaal niet.
// Kent VELD_LABELS het veld niet, dan valt hij terug op de sleutel zelf.
function _veldLabel(sec, sleutel){
  const kaart = VELD_LABELS[sec];
  return (kaart && kaart[sleutel]) ? kaart[sleutel] : sleutel;
}
```

Breid de import bovenin `src/verplaats.js` uit met `VELD_LABELS` (dezelfde regel die `SECS` en `OMSCHRIJVING_SLEUTEL` uit `./config.js` haalt).

- [ ] **Step 5: Draai de toetsen en zie ze slagen**

Draai eerst `node tools/syntaxcheck.js` (verwacht: geen fouten), dan `?test=1`.
Verwacht: de vier nieuwe regels groen, en `src/tests.js:10811-10815` (`'Status: Wacht op gemeente'`) nog steeds groen.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/verplaats.js src/tests.js && git commit -m "veldlabel: uit een expliciete afbeelding i.p.v. de kolomindex"
```

---

## Task 2: Stil-drempel per sectie

`STIL_DREMPEL_DAGEN` is één vast getal (4) voor alle secties (`src/util.js:81`). Op LOD betekent
dat "stil 5d" op een dossier waar de gemeente 90 dagen geeft.

**Files:**
- Modify: `src/util.js:81` (weg) en na `STIL_ESCALATIE_REGELS` (regel 133-140)
- Modify: `src/util.js:556` (exportblok)
- Modify: `src/render-tabel.js:5` (import) en `:114`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

Voeg toe in `src/tests.js`, direct ná het blok met `stil-label: weg bij offerte, blijft bij LOD` (rond regel 842):

```javascript
  // De drempel loopt gelijk met trap 1 van de herinneringsmail, zodat het scherm en de mail
  // niet los van elkaar iets anders beweren.
  eq('stil-drempel: per sectie gelijk aan trap 1 van de escalatiemail',
     ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN'].map(stilDrempel),
     [7, 14, 21, 30, 21]);
  eq('stil-drempel: een onbekende sectie valt terug op 7', stilDrempel('BESTAAT-NIET'), 7);
```

Breid de `util.js`-import in `src/tests.js` uit met `stilDrempel`.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `ReferenceError: stilDrempel is not defined` (de suite meldt dat als een rode regel).

- [ ] **Step 3: Vervang de vaste drempel**

Verwijder regel 81 uit `src/util.js`:

```javascript
const STIL_DREMPEL_DAGEN = 4;
```

Voeg direct ná het `STIL_ESCALATIE_REGELS`-blok (na regel 140) toe:

```javascript
// Vanaf hoeveel stille dagen het signaal aangaat, per sectie. Bewust dezelfde getallen als trap 1
// van STIL_ESCALATIE_REGELS hierboven: de gebruiker krijgt op dag N een herinneringsmail, dus het
// scherm hoort niet op dag 4 al iets anders te roepen. Eén vast getal (4) was op LOD vals alarm:
// daar geeft de gemeente 90 dagen en komt de mail pas op dag 30.
function stilDrempel(sec){
  const reg = STIL_ESCALATIE_REGELS[sec];
  return (reg && Number.isFinite(reg.trap1)) ? reg.trap1 : 7;
}
```

Vervang in het exportblok (`src/util.js:556`) `STIL_DREMPEL_DAGEN` door `stilDrempel`.

- [ ] **Step 4: Laat `bepaalStil` de drempel per sectie gebruiken**

In `src/render-tabel.js`, vervang op regel 5 `STIL_DREMPEL_DAGEN` door `stilDrempel` in de import-lijst.

Vervang regel 114:

```javascript
  return dagen >= STIL_DREMPEL_DAGEN ? dagen : null;
```

door:

```javascript
  return dagen >= stilDrempel(sec) ? dagen : null;
```

- [ ] **Step 5: Hoog de bestaande fixture op**

`src/tests.js:827` gebruikt 30 dagen en noemt dat "ruim over elke stil-drempel". Met LOD op 30
is dat precies de grens. Vervang:

```javascript
      const oud=new Date(Date.now()-30*864e5).toISOString(); // ruim over elke stil-drempel
```

door:

```javascript
      const oud=new Date(Date.now()-45*864e5).toISOString(); // ruim over elke stil-drempel (LOD staat op 30)
```

- [ ] **Step 6: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`.
Verwacht: beide nieuwe regels groen, `stil-label: weg bij offerte, blijft bij LOD` nog steeds groen.

- [ ] **Step 7: Commit**

```bash
git add src/util.js src/render-tabel.js src/tests.js && git commit -m "stil-drempel per sectie, gelijk aan trap 1 van de escalatiemail"
```

---

## Task 3: De rangorde-motor `signaalDelen`

Pure functie, geen DOM. Weegt de bestaande bronnen tot een geordende lijst.

**Files:**
- Modify: `src/render-tabel.js` (na `bepaalStil`, rond regel 116)
- Modify: `src/render-tabel.js:318` (exportblok)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

Voeg toe in `src/tests.js`, ná de toetsen uit Task 2:

```javascript
  // ── Signaal-rangorde ──
  (() => {
    const vLog = D.logboek;
    const vandaag = _vandaagAmsterdam();
    const dat = n => { const d = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() + n);
                       return `${d.getDate()}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };
    const iso = n => new Date(Date.now() + n*864e5).toISOString();
    try{
      D.logboek = [{ code:'SIG-1', sectie:'OPPAKKEN', timestamp: iso(-20) }];
      _zetStilIndex(bouwStilIndex(D.logboek, 'OPPAKKEN'));

      const soorten = r => signaalDelen(r, 'OPPAKKEN').map(d => d.soort);

      // 1. Niets aan de hand → lege lijst.
      eq('signaal: geen deadline en geen opvolgdatum geeft niets',
         soorten({ code:'SIG-0', deadline:'', opvolgdatum:'', inBehandeling:'' }), []);

      // 2. Te laat wint van alles.
      eq('signaal: te laat staat vooraan',
         soorten({ code:'SIG-1', deadline:dat(-45), opvolgdatum:dat(0), inBehandeling:'TRUE' }),
         ['telaat','vandaag','stil']);

      // 3. Bijna te laat telt alleen als hij NIET te laat is.
      eq('signaal: bijna te laat bij een deadline binnen zeven dagen',
         soorten({ code:'SIG-0', deadline:dat(3), opvolgdatum:'', inBehandeling:'' }), ['bijna']);
      eq('signaal: bij te laat komt bijna-te-laat er niet ook nog bij',
         soorten({ code:'SIG-0', deadline:dat(-1), opvolgdatum:'', inBehandeling:'' }), ['telaat']);
      eq('signaal: een deadline over dertig dagen geeft niets',
         soorten({ code:'SIG-0', deadline:dat(30), opvolgdatum:'', inBehandeling:'' }), []);

      // 4. Weggelegd sluit vandaag én stil uit (bestaand gedrag van opvolgStatus/bepaalStil).
      eq('signaal: weggelegd sluit vandaag en stil uit',
         soorten({ code:'SIG-1', deadline:dat(-2), opvolgdatum:dat(9), inBehandeling:'TRUE' }),
         ['telaat','weggelegd']);

      // 5. Stil kan alleen als de taak is opgepakt.
      eq('signaal: stil vereist in behandeling',
         soorten({ code:'SIG-1', deadline:'', opvolgdatum:'', inBehandeling:'' }), []);

      // 6. Op offerte en subsidie bestaat stil niet, ook niet via deze motor.
      eq('signaal: offerte krijgt nooit een stil-signaal',
         signaalDelen({ code:'SIG-1', deadline:'', opvolgdatum:'', inBehandeling:'TRUE' },
                      'OFFERTE-TRAJECTEN').map(d => d.soort), []);

      // 7. De tekst van de zwaarste melding is de tekst die de gebruiker leest.
      eq('signaal: de te-laat-tekst noemt het aantal dagen',
         signaalDelen({ code:'SIG-0', deadline:dat(-12), opvolgdatum:'', inBehandeling:'' },
                      'OPPAKKEN')[0].tekst, 'Te laat (12d)');
    } finally { _zetStilIndex(null); D.logboek = vLog; }
  })();
```

Breid de `render-lijsten.js`-import in `src/tests.js` uit met `signaalDelen`.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `ReferenceError: signaalDelen is not defined`.

- [ ] **Step 3: Schrijf de motor**

Voeg toe in `src/render-tabel.js`, direct ná `bepaalStil` (na regel 115) en vóór `deadlineCel`:

```javascript
// Vanaf hoeveel dagen vóór de deadline 'bijna te laat' aangaat. Bewust één vast getal voor alle
// secties, net als de amberkleur die deadlineCel hiervoor gebruikte: de sectiedrempels
// (PRIO_REGELS) gaan over hoe lang iets mág liggen, niet over hoe dichtbij een afgesproken datum is.
const BIJNA_TE_LAAT_DAGEN = 7;

// De signalen van één rij, van zwaar naar licht. PUUR: leest alleen `r` en bestaande helpers,
// raakt geen DOM en geen state. De cel toont er hoogstens twee; deze functie geeft ze allemaal,
// zodat de derde nog in de title kan.
//
// Waarom deze volgorde: 'te laat' is de enige die zegt dat er een afspraak al gebroken is.
// 'vandaag opvolgen' is een afspraak met jezelf voor vandaag. 'bijna te laat' kijkt vooruit.
// 'stil' en 'weggelegd' zeggen alleen iets over de geschiedenis van de taak.
//
// Drie tegelijk kán (te laat + vandaag + stil). Weggelegd sluit vandaag uit (opvolgStatus,
// util.js:185-186) en stil uit (bepaalStil, hierboven), dus met weggelegd blijven het er twee.
//
// `cls` draagt de OUDE klassenaam mee. Die staat er niet voor de opmaak — binnen `.cell-sig`
// zijn ze in styles.css leeggemaakt — maar omdat negen bestaande toetsen op die namen zoeken en
// omdat er zo één plek is waar staat welke klasse bij welk signaal hoort.
function signaalDelen(r, sec){
  const uit = [];
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  const ov = opvolgStatus(r);
  if (teLaat)
    uit.push({ soort:'telaat', kleur:'crit', cls:'s-telaat',
               tekst:`Te laat (${Math.abs(dagenTot)}d)` });
  if (ov.vandaag)
    uit.push({ soort:'vandaag', kleur:'warn', cls:'pill-opvolg', tekst:'Vandaag opvolgen' });
  if (!teLaat && dagenTot !== null && dagenTot <= BIJNA_TE_LAAT_DAGEN)
    uit.push({ soort:'bijna', kleur:'warn-dof', cls:'s-soon',
               tekst: dagenTot === 0 ? 'Deadline vandaag' : `Nog ${dagenTot}d` });
  const stil = GEEN_STIL_PILL.includes(sec) ? null : bepaalStil(r, sec);
  if (stil !== null)
    uit.push({ soort:'stil', kleur:'dof', cls:'pill-stil', tekst:`${stil}d stil` });
  if (ov.weggelegd)
    uit.push({ soort:'weggelegd', kleur:'dof', cls:'pill-snooze',
               tekst:`Terug ${kortDatum(r.opvolgdatum)}` });
  return uit;
}
```

Voeg `signaalDelen` toe aan het exportblok op `src/render-tabel.js:318`, en aan de re-export in
`src/render-lijsten.js:11` (de regel die `bepaalStil, bouwStilIndex, _zetStilIndex, deadlineCel, rowNtd, rowAf` uit `./render-tabel.js` haalt) én aan het exportblok van `src/render-lijsten.js`.

- [ ] **Step 4: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`. Verwacht: alle acht nieuwe regels groen.

- [ ] **Step 5: Commit**

```bash
git add src/render-tabel.js src/render-lijsten.js src/tests.js && git commit -m "signaalDelen: één rangorde voor alle urgentiemeldingen van een rij"
```

---

## Task 4: De Signaal-kolom in de tabel

Dit is de kern. Kolom toevoegen, cel tekenen, deadline-kolom neutraal — **in één commit**, want los
van elkaar staat de melding op twee plekken of nergens.

**Files:**
- Modify: `src/config.js` (`SECS.OPPAKKEN.cols`, `SECS.VERGADERVERZOEKEN.cols`, `SECS.LOD.cols`)
- Modify: `src/render-tabel.js` (`signaalCel` erbij; `deadlineCel`; drie `case`-blokken in `rowNtd`)
- Modify: `styles.css`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

Voeg toe in `src/tests.js`, ná het signaal-rangorde-blok uit Task 3:

```javascript
  // ── Signaal-kolom in de tabel ──
  (() => {
    const vA = state.activeNtd, vOpp = D.ntd['OPPAKKEN'], vLog = D.logboek, vPg = pgs.ntd;
    const vandaag = _vandaagAmsterdam();
    const dat = n => { const d = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() + n);
                       return `${d.getDate()}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };
    try{
      D.logboek = [{ code:'SIGT-1', sectie:'OPPAKKEN', timestamp:new Date(Date.now()-20*864e5).toISOString() }];
      D.ntd['OPPAKKEN'] = [
        { code:'SIGT-1', naam:'VvE Signaal Een', actiepunt:'x', deadline:dat(-45),
          opvolgdatum:dat(0), behandelaar:'Jer', opmerkingen:'', inBehandeling:'TRUE',
          _sec:'OPPAKKEN', _row:9701 },
        { code:'SIGT-2', naam:'VvE Signaal Twee', actiepunt:'y', deadline:dat(30),
          opvolgdatum:'', behandelaar:'Cihad', opmerkingen:'', inBehandeling:'',
          _sec:'OPPAKKEN', _row:9702 },
      ];
      pgs.ntd = 1; setNtd('OPPAKKEN');

      const rij1 = document.querySelector('#ntd-tbody tr[data-row="9701"]');
      const rij2 = document.querySelector('#ntd-tbody tr[data-row="9702"]');
      const sig1 = rij1 && rij1.querySelector('.cell-sig');

      truthy('signaalkolom: de rij wordt getekend', !!rij1 && !!rij2);
      truthy('signaalkolom: er is een signaal-cel', !!sig1);
      eq('signaalkolom: de zwaarste melding staat groot',
         sig1 ? (sig1.querySelector('.sig-hoofd')||{}).textContent : null, 'Te laat (45d)');
      eq('signaalkolom: de tweede melding staat klein erachter',
         sig1 ? (sig1.querySelector('.sig-bij')||{}).textContent : null, 'Vandaag opvolgen');
      truthy('signaalkolom: de derde melding staat in de title',
             !!sig1 && sig1.getAttribute('title').includes('20d stil'));
      eq('signaalkolom: de cel is een snelkoppeling naar wegleggen',
         sig1 ? sig1.dataset.action : null, 'taak-wegleggen');
      eq('signaalkolom: het rid van de cel wijst naar dezelfde taak als de rij',
         sig1 ? sig1.dataset.rid : null, rij1 ? rij1.dataset.rid : undefined);
      eq('signaalkolom: een rustige rij heeft een lege signaal-cel',
         rij2 ? rij2.querySelector('.cell-sig').textContent.trim() : null, '');

      // Elke rij zet precies één ingang in _rowCache; signaalCel mag er geen tweede bij pushen.
      eq('signaalkolom: één rid per rij, niet twee',
         Number(rij2.dataset.rid) - Number(rij1.dataset.rid), 1);

      // Koppen en cellen moeten gelijk lopen, ook in bulkmodus.
      eq('signaalkolom: evenveel koppen als cellen',
         [document.querySelectorAll('#ntd-thead th').length,
          rij1.querySelectorAll('td').length], [8, 8]);
      eq('signaalkolom: Signaal staat op de derde plek',
         [...document.querySelectorAll('#ntd-thead th')]
           .map(t => t.textContent.trim().replace(/[▲▼]$/, ''))[2], 'Signaal');

      // De deadline-kolom is neutraal geworden: geen 'Te laat' meer, alleen een datum.
      const dlCel = rij1.querySelectorAll('td')[4];
      truthy('signaalkolom: de deadline-kolom noemt geen "Te laat" meer',
             !!dlCel && !dlCel.textContent.includes('Te laat'));
      eq('signaalkolom: de deadline-kolom is nog wel een datum',
         !!dlCel && dlCel.textContent.trim() === dat(-45), true);

      // Het rode waas over te late rijen blijft: op een telefoon is dat het enige teken.
      truthy('signaalkolom: het rode waas over te late rijen blijft staan',
             rij1.classList.contains('row-telaat'));

      // De oude klassenamen blijven bestaan als betekenisdrager.
      truthy('signaalkolom: de oude klassenamen staan nog in de cel',
             !!sig1.querySelector('.s-telaat') && !!sig1.querySelector('.pill-opvolg'));

      // Offerte en subsidie blijven zoals ze waren.
      setNtd('SUBSIDIE-TRAJECTEN');
      eq('signaalkolom: subsidie houdt zes koppen en krijgt er géén',
         [...document.querySelectorAll('#ntd-thead th')].length, 7);
    } finally {
      if (vOpp === undefined) delete D.ntd['OPPAKKEN']; else D.ntd['OPPAKKEN'] = vOpp;
      D.logboek = vLog; state.activeNtd = vA; pgs.ntd = vPg; setNtd(vA);
    }
  })();
```

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `FAIL: signaalkolom: er is een signaal-cel → verwacht waar, kreeg false`, plus de
kop/cel-telling op `[7, 7]` in plaats van `[8, 8]`.

- [ ] **Step 3: Voeg de kolom toe aan de drie secties**

In `src/config.js`, vervang de drie `cols`-regels:

```javascript
    cols:['VvE Code','VvE','Signaal','Actiepunt','Deadline','Wie','Opmerkingen'],
```
(OPPAKKEN — was `['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Opmerkingen']`)

```javascript
    cols:['VvE Code','VvE','Signaal','Periode','Agendapunten','Wie','Deadline uitschr.','Opmerkingen'],
```
(VERGADERVERZOEKEN — was zonder `Signaal` en met `Behandelaar`)

```javascript
    cols:['VvE Code','VvE','Signaal','Actiepunt','Status','Wie','Deadline LOD','Opmerkingen'],
```
(LOD — idem)

`OFFERTE-TRAJECTEN` en `SUBSIDIE-TRAJECTEN` blijven ongewijzigd, inclusief hun kop `Behandelaar`.

- [ ] **Step 4: Schrijf `signaalCel`**

Voeg toe in `src/render-tabel.js`, direct ná `signaalDelen` en vóór `deadlineCel`:

```javascript
// Eén cel met de zwaarste melding groot en de tweede klein en gedempt erachter. Een derde
// melding past niet en staat alleen in de title — dat is een bewuste keuze: liever één ding dat
// opvalt dan drie die elkaar verdringen (dat was precies het probleem dat deze kolom oplost).
//
// `rid` komt van de aanroeper en wordt hier NIET opnieuw gemaakt: rowNtd zet één rid per rij die
// gedeeld wordt met de knoppen, het bulk-vinkje en de fase-bolletjes. Een tweede push naar
// state._rowCache zou de indexOf in crud.js (:668, :740) laten verspringen.
//
// De hele cel draagt data-action="taak-wegleggen". Vandaag heeft 'Te laat' als enige signaal géén
// actie, waardoor juist de rijen die het hardst een opvolgdatum nodig hebben die snelweg missen.
// Zonder data-action zou de cel bovendien de rij-uitklapper van main.js:155 aanspreken.
function signaalCel(r, sec, rid){
  const delen = signaalDelen(r, sec);
  if(!delen.length) return `<td class="cell-sig"></td>`;
  const eerste = delen[0];
  const tweede = delen[1];
  const titel = delen.map(d => d.tekst).join(' · ');
  const bij = tweede ? `<span class="sig-bij ${tweede.cls}">${esc(tweede.tekst)}</span>` : '';
  return `<td class="cell-sig" data-action="taak-wegleggen" data-rid="${rid}" title="${esc(titel)}">`
       + `<span class="sig sig-${eerste.kleur}">`
       + `<span class="sig-dot" aria-hidden="true"></span>`
       + `<span class="sig-hoofd ${eerste.cls}">${esc(eerste.tekst)}</span>`
       + `${bij}</span></td>`;
}
```

- [ ] **Step 5: Maak de deadline-kolom neutraal**

Vervang `deadlineCel` in `src/render-tabel.js` (regel 117-125) door:

```javascript
// De deadline-kolom is een DATUM, meer niet. 'Te laat' en 'bijna te laat' zijn naar de
// signaal-kolom verhuisd; ze hier óók tonen zou de melding weer op twee plekken zetten.
// Alleen op de secties zónder signaal-kolom (offerte, subsidie) blijft de oude kleuring staan,
// want daar is de deadline-kolom de enige plek waar urgentie kan staan.
function deadlineCel(r, sec){
  if (HEEFT_SIGNAAL_KOLOM.includes(sec)){
    return r.deadline
      ? `<td><span class="s-normal">${esc(r.deadline)}</span></td>`
      : `<td class="cell-sm"><span class="warn-geen-deadline geen-dl-dof">Geen deadline</span></td>`;
  }
  if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen deadline</span></td>`;
  const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
  if (teLaat) return `<td><span class="s-telaat">Te laat (${Math.abs(dagenTot)}d)</span></td>`;
  const soon = dagenTot !== null && dagenTot <= 7;
  return `<td><span class="${soon ? 's-soon' : 's-normal'}">${esc(r.deadline)}</span></td>`;
}
```

Voeg de constante toe direct naast `GEEN_STIL_PILL` (`src/render-tabel.js:17`):

```javascript
// De secties met een eigen Signaal-kolom. Offerte en subsidie staan er bewust niet bij: daar kan
// 'stil' per ontwerp niet voorkomen en zou de kolom vrijwel elke rij leeg blijven.
const HEEFT_SIGNAAL_KOLOM = ['OPPAKKEN', 'VERGADERVERZOEKEN', 'LOD'];
```

- [ ] **Step 6: Zet de cel in de drie `case`-blokken van `rowNtd`**

In `src/render-tabel.js`, `case'OPPAKKEN'` — vervang het blok door:

```javascript
    case'OPPAKKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt)}">${esc(r.actiepunt)}</span></td>
        ${deadlineCel(r, 'OPPAKKEN')}
        <td>${persBadges(r.behandelaar, true)}</td>
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
```

`case'VERGADERVERZOEKEN'`:

```javascript
    case'VERGADERVERZOEKEN':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td><span class="badge" style="background:var(--am-l);color:var(--am)">${esc(r.periode||r.agendapunten||'')}</span></td>
        <td class="cell-txt"><span class="ct" title="${esc(r.agendapunten||r.actiepunt||'')}">${esc(r.agendapunten||r.actiepunt||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'VERGADERVERZOEKEN')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
```

`case'LOD'`:

```javascript
    case'LOD':
      cells=`<td>${bdlGreep}${bdlChev}${vveCodeSpan(r.code, css)}</td>
        <td class="cell-name"><span class="ct" title="${esc(r.naam)}">${esc(r.naam)}</span>${subBadge(r.subcategorie, sec)}${bdlNaam}</td>
        ${signaalCel(r, sec, rid)}
        <td class="cell-txt"><span class="ct" title="${esc(r.actiepunt||'')}">${esc(r.actiepunt||'')}</span></td>
        <td class="cell-txt" style="font-style:italic"><span class="ct" title="${esc(r.status||'')}">${esc(r.status||'')}</span></td>
        <td>${persBadges(r.behandelaar, true)}</td>
        ${deadlineCel(r, 'LOD')}
        <td class="cell-note"><span class="ct" title="${esc(r.opmerkingen||'')}">${esc(r.opmerkingen||'')}</span></td>
        <td>${editBtn}</td>`;
      break;
```

Let op: `extraPills` is uit deze drie blokken verdwenen (die inhoud zit nu in `signaalCel`). Bij
`case'OFFERTE-TRAJECTEN'` en `case'SUBSIDIE-TRAJECTEN'` blijft `${extraPills}` staan — die secties
veranderen niet. Laat de berekening van `extraPills` (regel 148-158) dus gewoon staan.

`subBadge(…, sec)` en `persBadges(…, true)` bestaan nog niet — die komen in Task 6 en 7. Zet nu
alvast de aanroepen neer en voeg in Task 6/7 de tweede parameter toe; tot dan negeert JavaScript
het extra argument en verandert er niets aan het gedrag.

- [ ] **Step 7: Voeg de opmaak toe**

In `styles.css`, direct ná de `.pill-snooze`-regel (rond regel 341):

```css
    /* ── Signaal-kolom (v10.32) ─────────────────────────────────────────────
       Eén cel per rij met de zwaarste melding. De kleur zit op de wikkel `.sig-*`, zodat
       bolletje en tekst niet los van elkaar kunnen gaan lopen. */
    .cell-sig{white-space:nowrap;cursor:pointer;vertical-align:middle}
    .sig{display:inline-flex;align-items:baseline;gap:7px}
    .sig-dot{width:7px;height:7px;border-radius:50%;flex:none;align-self:center}
    .sig-hoofd{font-size:12px;font-weight:600}
    .sig-bij{font-size:11px;font-weight:500;color:var(--fnt)}
    /* --prio (baksteen) en niet --rd: op de LOD-tab is --rd óók de tabkleur, en dan valt een
       rood bolletje juist niet meer op. */
    .sig-crit{color:var(--prio)}      .sig-crit .sig-dot{background:var(--prio)}
    .sig-warn{color:var(--am)}        .sig-warn .sig-dot{background:var(--am)}
    .sig-warn-dof{color:var(--mut)}   .sig-warn-dof .sig-dot{background:var(--am-b)}
    .sig-dof{color:var(--mut)}        .sig-dof .sig-dot{background:var(--bor-input)}
    /* Binnen de signaal-cel dragen de oude klassenamen alleen nog BETEKENIS, geen opmaak: negen
       toetsen zoeken op die namen, en zo staat op één plek welke klasse bij welk signaal hoort.
       Zonder deze regel zouden ze hier als pil mét vlak terugkomen — precies wat we weghalen. */
    .cell-sig .pill-stil,.cell-sig .pill-opvolg,.cell-sig .pill-snooze,
    .cell-sig .s-telaat,.cell-sig .s-soon{
      background:none;color:inherit;padding:0;margin:0;border-radius:0;
      font-size:inherit;font-weight:inherit;font-family:inherit;
    }
    /* tr.snooze-row td{opacity:.55} dempt élke cel; het signaal is juist de reden dat de rij daar
       staat en moet leesbaar blijven. Hogere specificiteit, dus deze wint. */
    tr.snooze-row .cell-sig{opacity:1}
    /* 'Geen deadline' is geen urgentie meer nu die in de signaal-kolom staat: grijs i.p.v. amber. */
    .warn-geen-deadline.geen-dl-dof{color:var(--fnt)}
```

En breid de bestaande `tr.expanded`-regel op `styles.css:291` uit met `.cell-sig`:

```css
    tr.expanded .cell-name,tr.expanded .cell-txt,tr.expanded .cell-note,tr.expanded .cell-sig{white-space:normal}
```

- [ ] **Step 8: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`.
Verwacht: alle nieuwe regels groen, en `src/tests.js:839` (`stil-label: weg bij offerte, blijft bij LOD`) nog steeds groen omdat `pill-stil` nu in de signaal-cel staat.

- [ ] **Step 9: Kijk er zelf naar**

Open `http://localhost:8123/index.html` (zonder `?test=1`), en controleer met de browser-tools:
- Op Oppakken staat een kolom "Signaal" op de derde plek.
- Een te late rij toont `● Te laat (Nd)` met een bakstenen bolletje, en heeft nog steeds het rode waas.
- De deadline-kolom is zwart/grijs, niet rood.
- Klikken op de signaal-cel opent het wegleg-venster.

- [ ] **Step 10: Commit**

```bash
git add src/config.js src/render-tabel.js styles.css src/tests.js && git commit -m "signaal-kolom op Oppakken, Vergaderverzoeken en LOD; deadline-kolom neutraal"
```

---

## Task 5: Het bundelpaneel zegt hetzelfde als de rij erboven

Het paneel (`src/render-bundel.js`) toont wél 'Te laat', 'Geen deadline', 'weggelegd' en
'In behandeling', maar níét 'vandaag opvolgen' en 'stil'. Een subtaak die vandaag opgevolgd moet
worden ziet er in het paneel dus precies zo uit als een die kan wachten, terwijl de rij twee
regels hoger het wél zegt.

De bestaande `dlTekst`, `snoozePil` en `ibPil` blijven **letterlijk ongewijzigd** — vier toetsen
(`src/tests.js:4964, 4966, 4970, 4980, 4982, 4985`) hangen daaraan.

**Files:**
- Modify: `src/render-bundel.js` (rond regel 125-148)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

Zoek in `src/tests.js` het bundelpaneel-blok met de helper `regelVan` (rond regel 4960) en voeg
daar binnen dezelfde `(() => { … })()` toe, ná de bestaande `pill-snooze`-toetsen:

```javascript
      // Het paneel hoort hetzelfde te zeggen als de rij erboven. 'Vandaag opvolgen' en 'stil'
      // ontbraken; een subtaak die vandaag moet, stond er precies zo bij als een die kan wachten.
      truthy('bundelpaneel: een subtaak die vandaag opgevolgd moet worden zegt dat ook',
             !!regelVan(vandaagHost,'Tvandaag').querySelector('.pill-opvolg'));
      truthy('bundelpaneel: een rustige subtaak krijgt géén opvolg-melding',
             !regelVan(vandaagHost,'Tb').querySelector('.pill-opvolg'));
```

Bouw de bijbehorende fixture naar het model van de bestaande `wgHost`/`laatHost` in datzelfde
blok — één bundel met een subtaak `Tvandaag` waarvan `opvolgdatum` op vandaag staat, en een
subtaak `Tb` zonder opvolgdatum. Gebruik `_rijNaarCellen` voor de fixture-rijen, net als de
bestaande hosts: met de hand geschreven celrijen liepen eerder uit de pas met de echte kolommen.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `FAIL: bundelpaneel: een subtaak die vandaag opgevolgd moet worden zegt dat ook → verwacht waar, kreeg false`.

- [ ] **Step 3: Voeg de twee ontbrekende signalen toe**

In `src/render-bundel.js`, direct ná de regel die `snoozePil` bepaalt (na regel 127) en vóór het
`prio`-blok:

```javascript
  // 'Vandaag opvolgen' en 'stil' ontbraken hier terwijl de tabelrij ze wél toont. Uit dezelfde
  // bron als de rij (signaalDelen), zodat 'vandaag' en 'stil' hier en daar hetzelfde betekenen.
  // De deadline en 'weggelegd' worden hieronder al door dlTekst en snoozePil getekend; die twee
  // slaan we hier over om ze niet dubbel te zetten.
  const paneelSignalen = signaalDelen(r, r._sec)
    .filter(d => d.soort === 'vandaag' || d.soort === 'stil')
    .map(d => `<span class="${d.cls}" title="${esc(d.tekst)}">${esc(d.tekst)}</span>`)
    .join('');
```

En zet `paneelSignalen` in de terugkeerwaarde, direct ná `ibPil + snoozePil`:

```javascript
       + ibPil + snoozePil + paneelSignalen
```

Voeg `signaalDelen` toe aan de import van `./render-tabel.js` bovenin `src/render-bundel.js`.
Bestaat die import daar nog niet, maak hem dan aan — let op dat `render-tabel.js` zelf al uit
`render-bundel.js` importeert; ES-modules kunnen dat aan zolang `signaalDelen` pas bij het
renderen wordt aangeroepen en niet tijdens het laden.

- [ ] **Step 4: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`.
Verwacht: beide nieuwe regels groen, en `src/tests.js:4964-4985` alle zes nog groen.

- [ ] **Step 5: Commit**

```bash
git add src/render-bundel.js src/tests.js && git commit -m "bundelpaneel toont 'vandaag opvolgen' en 'stil', net als de rij erboven"
```

---

## Task 6: `subBadge` kent zijn eigen tabblad

`subBadge` (`src/util.js:424`) toont de subcategorie ook als die gelijk is aan het tabblad waar je
op staat — "Oppakken" in de Oppakken-tab. Er staan **nul toetsen** op deze functie, dus een fout
hier is volledig stil.

**Files:**
- Modify: `src/util.js:424`
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

Voeg toe in `src/tests.js`, bij de andere util-toetsen:

```javascript
  // ── subBadge: geen label dat herhaalt waar je al bent ──
  eq('subbadge: gelijk aan het eigen tabblad → weg',
     subBadge('Oppakken', 'OPPAKKEN'), '');
  eq('subbadge: ook met andere hoofdletters en spaties → weg',
     subBadge('  oppakken ', 'OPPAKKEN'), '');
  truthy('subbadge: een afwijkende subcategorie blijft staan',
     subBadge('Offerte-trajecten', 'OPPAKKEN').includes('Offerte-trajecten'));
  eq('subbadge: leeg blijft leeg', subBadge('', 'OPPAKKEN'), '');
  truthy('subbadge: zonder sectie gedraagt hij zich als vanouds',
     subBadge('Oppakken').includes('Oppakken'));
```

Breid de `util.js`-import in `src/tests.js` uit met `subBadge`.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `FAIL: subbadge: gelijk aan het eigen tabblad → weg → verwacht "", kreeg "<span class=\"badge\"…"`.

- [ ] **Step 3: Voeg de tweede parameter toe**

Vervang `src/util.js:424` door:

```javascript
// De subcategorie achter de VvE-naam. Is die gelijk aan het tabblad waar je al staat ("Oppakken"
// in de Oppakken-tab), dan zegt hij niets nieuws en gaat hij weg — dat is precies de ruis waar
// deze rij te veel van had. Genormaliseerd vergelijken (trim + kleine letters), net als
// renderNtdCrossList (render-lijsten.js:357, 363), anders laat één hoofdletter hem terugkomen.
// `sec` is optioneel: zonder sectie gedraagt hij zich als vanouds.
function subBadge(v, sec){
  const t = String(v == null ? '' : v).trim();
  if(!t) return '';
  const eigen = (sec && SECS[sec] && SECS[sec].label) ? String(SECS[sec].label).trim().toLowerCase() : '';
  if(eigen && t.toLowerCase() === eigen) return '';
  return `<span class="badge" style="background:var(--sur2);color:var(--mut);font-size:10px;margin-left:4px">${esc(t)}</span>`;
}
```

- [ ] **Step 4: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`. Verwacht: alle vijf nieuwe regels groen.

- [ ] **Step 5: Commit**

```bash
git add src/util.js src/tests.js && git commit -m "subBadge laat een label weg dat het eigen tabblad herhaalt"
```

---

## Task 7: Behandelaars korter, maar nooit dubbelzinnig

**Let op — dit wijkt af van wat er in het ontwerp stond.** Daar staat "rondjes met twee letters
(`Ci`, `Ch`)". Dat kan niet: **Cihad** en **Cihan** verschillen pas bij de vijfde letter (C-i-h-a-d
tegen C-i-h-a-n), dus twee letters geeft voor allebei `Ci`. Elke afkorting korter dan vijf letters
is voor deze twee namen een raadsel in plaats van een naam.

Daarom: de **kortste afkorting die binnen het team uniek is**. Dat levert `J` voor Jer en `G` voor
Gabos (echte winst), en voor Cihad/Cihan de volle naam (geen winst, maar ook geen verwarring).
Wie later een collega toevoegt wiens naam wél te verkorten is, krijgt dat automatisch.

De rondjes komen **alleen in de takentabel**; het VvE-dossier, de Afgerond-lijst, Analytics en de
Ontwikkeling-pagina houden de volle naam.

**Files:**
- Modify: `src/util.js` (bij `splitBehandelaar`/`persBadges`, rond regel 260-275)
- Modify: `src/util.js` (exportblok, regel 556)
- Modify: `styles.css` (na `.pers`, regel 357)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

```javascript
  // ── korteNaam: alleen afkorten als het ondubbelzinnig blijft ──
  eq('kortenaam: Jer kan naar één letter', korteNaam('Jer', ['Jer','Cihad','Gabos','Cihan']), 'J');
  eq('kortenaam: Gabos ook', korteNaam('Gabos', ['Jer','Cihad','Gabos','Cihan']), 'G');
  // Cihad en Cihan verschillen pas bij de vijfde letter; korter is geen naam maar een raadsel.
  eq('kortenaam: Cihad blijft voluit', korteNaam('Cihad', ['Jer','Cihad','Gabos','Cihan']), 'Cihad');
  eq('kortenaam: Cihan blijft voluit', korteNaam('Cihan', ['Jer','Cihad','Gabos','Cihan']), 'Cihan');
  eq('kortenaam: in je eentje mag één letter', korteNaam('Cihad', ['Cihad']), 'C');
  eq('kortenaam: een naam buiten het team wordt niet ingekort',
     korteNaam('Stagiair', ['Jer','Cihad']), 'S');
  eq('kortenaam: leeg blijft leeg', korteNaam('', ['Jer']), '');
  // De tabel kort af, de rest van het dashboard niet.
  truthy('behandelaar: de tabel toont de korte vorm',
         persBadges('Jer', true).includes('>J<'));
  truthy('behandelaar: buiten de tabel blijft de volle naam staan',
         persBadges('Jer').includes('>Jer<'));
  truthy('behandelaar: twee namen blijven twee chips',
         persBadges('Cihad, Jer', true).match(/class="pers/g).length === 2);
```

Breid de `util.js`-import in `src/tests.js` uit met `korteNaam`.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `ReferenceError: korteNaam is not defined`.

- [ ] **Step 3: Schrijf `korteNaam` en breid `persBadges` uit**

Voeg toe in `src/util.js`, direct ná `splitBehandelaar` (na regel 275):

```javascript
// De kortste afkorting van een naam die binnen het team niet met een andere naam te verwarren is.
//
// WAAROM DIT ZO OMSLACHTIG MOET. Eén letter lag voor de hand, maar Cihad en Cihan zouden dan
// allebei 'C' worden — en de vier kleurklassen (.pers-jer, .pers-cihad, …) hebben tegenwoordig
// allemaal dezelfde kleur, dus er is niets om op terug te vallen. Deze functie kort af zolang het
// ondubbelzinnig blijft en houdt de naam anders voluit. Voor Jer en Gabos levert dat 'J' en 'G';
// voor Cihad en Cihan (die pas bij de vijfde letter uit elkaar lopen) de volle naam. Komt er een
// collega bij, dan verschuift dat vanzelf mee.
function korteNaam(naam, team){
  const n = String(naam || '').trim();
  if(!n) return '';
  const anderen = ((team && team.length) ? team : TEAM)
    .map(t => String(t || '').trim())
    .filter(t => t && t.toLowerCase() !== n.toLowerCase());
  for(let len = 1; len < n.length; len++){
    const kort = n.slice(0, len);
    if(!anderen.some(t => t.toLowerCase().startsWith(kort.toLowerCase()))) return kort;
  }
  return n;
}
```

Vervang `persBadges` (`src/util.js:268-275`) door:

```javascript
// `kort` alleen aanzetten waar breedte echt knelt: de takentabel. Het VvE-dossier, de
// Afgerond-lijst, Analytics en de Ontwikkeling-pagina houden de volle naam — daar is ruimte
// genoeg en leest een afkorting alleen maar als een raadsel.
function persBadges(v, kort){
  if(!v)return'<span style="color:var(--fnt);font-size:12px">–</span>';
  const colors={'jer':'pers-jer','cihad':'pers-cihad','gabos':'pers-gabos'};
  return splitBehandelaar(v).map(n=>{
    const cls=colors[n.toLowerCase()]||'pers-default';
    const tekst = kort ? korteNaam(n) : n;
    const rond = kort && tekst.length === 1 ? ' pers-rond' : '';
    const titel = kort && tekst !== n ? ` title="${esc(n)}"` : '';
    return`<span class="pers ${cls}${rond}"${titel}>${esc(tekst)}</span>`;
  }).join('');
}
```

Voeg `korteNaam` toe aan het exportblok op `src/util.js:556`, en `TEAM` aan de import van
`./config.js` op `src/util.js:4`.

- [ ] **Step 4: Voeg de opmaak voor het rondje toe**

In `styles.css`, direct ná de `.pers`-regel (regel 357):

```css
    /* Eén letter wordt een rondje; een naam die niet in te korten viel blijft een gewone chip.
       Vaste maten, want een rondje met tekstbreedte is een ei. */
    .pers.pers-rond{width:21px;height:21px;padding:0;border-radius:50%;justify-content:center;font-size:10.5px;font-weight:700}
```

- [ ] **Step 5: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`. Verwacht: alle tien nieuwe regels groen, en
`persBadges`-toetsen die al bestonden ook nog groen (die roepen `persBadges(v)` zonder tweede
argument aan en krijgen dus de volle naam).

- [ ] **Step 6: Commit**

```bash
git add src/util.js styles.css src/tests.js && git commit -m "behandelaars korter in de tabel, maar nooit dubbelzinnig"
```

---

## Task 8: Sleep-handvat pas bij aanwijzen — behalve op een aanraakscherm

**Files:**
- Modify: `styles.css` (na `.stapel-h:active`, regel 1584)
- Test: `src/tests.js`

- [ ] **Step 1: Schrijf de falende toets**

```javascript
  // ── Sleep-handvat verschijnt bij aanwijzen ──
  (() => {
    const st = document.createElement('style');
    st.textContent = '*{transition:none !important}';  // anders meet je halverwege de overgang
    document.head.appendChild(st);
    try{
      const greep = document.querySelector('#ntd-tbody .stapel-h');
      truthy('handvat: er staat een sleep-handvat in de tabel', !!greep);
      if(greep) eq('handvat: onzichtbaar zolang je de rij niet aanwijst',
                   getComputedStyle(greep).opacity, '0');
      // Op een aanraakscherm bestaat hover niet; daar mag hij niet onbereikbaar worden.
      truthy('handvat: er is een uitzondering voor aanraakschermen',
             [...document.styleSheets].some(s => { try{
               return [...s.cssRules].some(r => r.conditionText === '(hover:none)'
                 && r.cssText.includes('stapel-h')); }catch(e){ return false; } }));
    } finally { st.remove(); }
  })();
```

Zorg dat dit blok draait terwijl er een NTD-lijst met minstens één rij in beeld staat en de
gestapelde weergave aanstaat (geen zoekterm, geen filter, geen bulkmodus) — anders tekent
`rowNtd` het handvat niet. Zie `bdlGreep` in `src/render-tabel.js:194`.

- [ ] **Step 2: Draai de toets en zie hem falen**

Verwacht: `FAIL: handvat: onzichtbaar zolang je de rij niet aanwijst → verwacht "0", kreeg "1"`.

- [ ] **Step 3: Voeg de opmaak toe**

In `styles.css`, direct ná `.stapel-h:active{cursor:grabbing}` (regel 1584):

```css
/* Het handvat gebruik je zelden maar het staat op élke rij. Het verschijnt daarom pas als je de
   rij aanwijst — slepen werkt precies zoals het werkte, alleen de rustige lijst wint erbij.
   :focus-visible staat er nadrukkelijk bij: wie met het toetsenbord navigeert moet hem zien. */
#ntd-tbody .stapel-h{opacity:0;transition:opacity var(--tr-fast)}
#ntd-tbody tr:hover .stapel-h,
#ntd-tbody .stapel-h:focus-visible{opacity:1}
/* Een aanraakscherm kent geen hover: daar zou het handvat onbereikbaar worden. Halfdoorzichtig
   i.p.v. onzichtbaar, precies zoals `.log-acts` (regel 690) dat al doet. */
@media(hover:none){#ntd-tbody .stapel-h{opacity:.5}}
```

- [ ] **Step 4: Draai de toetsen en zie ze slagen**

`node tools/syntaxcheck.js`, dan `?test=1`. Verwacht: alle drie de nieuwe regels groen.

- [ ] **Step 5: Controleer dat slepen nog werkt**

Open `http://localhost:8123/index.html`, ga naar Oppakken, beweeg de muis over een rij, en sleep
een taak onder een andere. Verwacht: het handvat verschijnt bij het aanwijzen en het slepen werkt
zoals eerst (`src/bundel-acties.js:661` kijkt naar `closest('[data-stapel-grip]')`, en dat
attribuut is niet veranderd).

- [ ] **Step 6: Commit**

```bash
git add styles.css src/tests.js && git commit -m "sleep-handvat pas bij aanwijzen, met uitzondering voor aanraakschermen"
```

---

## Task 9: Afronden — versies, volledige ronde, en naar staging

**Files:**
- Modify: `src/config.js:8` (`APP_VERSION`)
- Modify: `sw.js:25` (`CACHE_VERSION`)

- [ ] **Step 1: Hoog de versies op**

In `src/config.js:8`:

```javascript
export const APP_VERSION = '10.32';
```

In `sw.js:25`:

```javascript
const CACHE_VERSION = 'cd-v127';
```

- [ ] **Step 2: Draai de volledige toetsronde**

```bash
node tools/syntaxcheck.js
```

Open daarna `http://localhost:8123/index.html?test=1` met het browserpaneel-tabblad **zichtbaar**
(op de achtergrond duurt een ronde 10+ minuten in plaats van 60 seconden).
Verwacht: `window._testResult` op de vorm `"NNNN OK, 0 FAIL"`. Bij rode regels: `window._testFails`.

- [ ] **Step 3: Meet op twee schermbreedtes**

Zet het venster op 1440 breed en daarna op 378, en controleer met een screenshot:
- 1440: de Signaal-kolom staat er, de tabel scrollt niet verticaal weg, de tekstkolom is nog leesbaar.
- 378: het rode waas over te late rijen is er nog (dat is op deze breedte het enige urgentieteken).

Geef de vensterbreedte expliciet mee aan elke pixel-assert — zonder dat meet je het venster van
de testrunner.

- [ ] **Step 4: Commit en zet op staging**

```bash
git add src/config.js sw.js && git commit -m "versie 10.32 / cd-v127"
```

Zet daarna op staging (die deployt automatisch naar TEST via de CI-Action):

```bash
git checkout staging && git merge --ff-only ontwerp/signaal-kolom && git push origin staging
```

Gaat de fast-forward niet door, dan is staging verder gelopen: **niet kaal mergen** — eerst diffen
en cherry-picken. Staging heeft eerder een divergente, niet-goedgekeurde tak gedragen.

- [ ] **Step 5: Toets op de echte TEST-URL, ingelogd**

Inloggen kan **alleen** op de staging-URL, niet op localhost (Google geeft anders
`origin_mismatch`). Loop de vijf tabbladen langs en controleer:
- Oppakken, Vergaderverzoeken, LOD: Signaal-kolom, neutrale deadline, korte behandelaars.
- Offerte-trajecten en Subsidie-trajecten: onveranderd, mét pillen in de oude kolom.
- Een bundel open- en dichtklappen; het paneel zegt hetzelfde als de rij erboven.
- Een taak wegleggen via een klik op de signaal-cel.

- [ ] **Step 6: Naar productie**

Pas ná groen licht van de gebruiker:

```bash
git checkout main && git merge --ff-only staging && git push origin main
```

Controleer daarna de echte productie-URL: `https://<gebruiker>.github.io/Collectief-Dashboard/`
(de kale root geeft een 404).

---

## Zelfcontrole op dit plan

**Dekking van de spec.** §1.1 → Task 4 (stap 4-6). §1.2 → Task 3. §1.3 → Task 4 stap 3
(`HEEFT_SIGNAAL_KOLOM`). §1.4 punt 1 → Task 6; punt 2 → Task 7; punt 3 (niet doen) → geen taak,
correct; punt 4 → Task 8. §1.5 → Task 2. §1.6 → Task 4 stap 7 (`.row-telaat` blijft, getoetst in
stap 1). §3.1 → Task 3 + 4. §3.2 → Task 1 + Task 4 stap 3. §3.3 → Task 4 stap 7. §3.4 → Task 5.
§3.5 → Task 6 + 7. §5.1 → Task 1 stap 5 en Task 2 stap 5. §5.2 → Task 4 stap 7 (de
klasse-neutralisatie) en stap 8. §5.3 items 1-12 → verdeeld over Task 2 t/m 8. §5.4 → "Vooraf" en
Task 8 stap 1, Task 9 stap 3.

**Afwijking van de spec, expliciet.** §1.4 punt 2 schrijft "rondjes met twee letters (`Ci`, `Ch`)".
Dat is feitelijk onmogelijk: Cihad en Cihan lopen pas bij de vijfde letter uiteen. Task 7
implementeert in plaats daarvan de kortste ondubbelzinnige afkorting. **Dit moet aan de gebruiker
gemeld worden voordat Task 7 gebouwd wordt** — het is precies het soort verschil dat pas op het
scherm opvalt.

**Namen die over taken heen kloppen.** `signaalDelen(r, sec)` (Task 3) wordt aangeroepen door
`signaalCel(r, sec, rid)` (Task 4) en door `src/render-bundel.js` (Task 5) — zelfde naam, zelfde
handtekening. `stilDrempel(sec)` (Task 2) wordt alleen in `bepaalStil` gebruikt.
`korteNaam(naam, team)` (Task 7) wordt alleen door `persBadges(v, kort)` gebruikt.
`VELD_LABELS` (Task 1) alleen door `_veldLabel(sec, sleutel)`.
`HEEFT_SIGNAAL_KOLOM` (Task 4) door `deadlineCel`; `GEEN_STIL_PILL` (bestaand) door `signaalDelen`.
De twee lijsten zijn bewust apart: "krijgt een signaal-kolom" en "kent het stil-signaal" zijn
vandaag toevallig elkaars tegenpolen, maar dat hoeft niet zo te blijven.
