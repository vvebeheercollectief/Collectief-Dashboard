# Offerte-stappen — implementatieplan (v12.5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offerte-trajecten als stappenroute: de aannemerslijst vervangt de tellers in het aanmaak-/bewerkscherm, de deadline wordt na "aangevraagd" een opvolgdatum, en elk traject krijgt automatisch de subtaak "Offertes voorleggen aan eigenaren".

**Architectuur:** Alles binnen het bestaande stramien — kolom P blijft de aannemerslijst, kolom F draagt na aanvraag de opvolgdatum, de bundel-kolommen R/S dragen de subtaak. Twee nieuwe kleine modules (`modal-aannemers.js`, `offerte-stappen.js`) plus een eenmalige migratieroutine; verder gerichte wijzigingen in bestaande bestanden. Ontwerp: `docs/superpowers/specs/2026-09-01-offerte-stappen-design.md`.

**Tech stack:** Vanilla ES-modules, Google Sheets API (bestaande schrijfwegen: `backgroundWrite`/`serieleWrite` + `assertRowMatch`), zelftest via `?test=1`.

**Testen draaien (elk "Run de zelftest"-blok hieronder):**
```bash
python3 ~/.claude/nocache-server.py 8000
```
Open in de Browser-pane `http://localhost:8000/?test=1`, wacht tot de suite klaar is (voortgang in `window._testVoortgang`), lees `window._testResult` en `window._testFails` via javascript_tool. Verwacht: 0 fails.

**Werkbranch:** `ontwerp/offerte-stappen` (bevat al de spec; committen per taak).

---

## Overzicht bestanden

| Bestand | Wat |
|---|---|
| `src/util.js` | `reconcileOffertes` (lijst wint), nieuw: `offerteAangevraagd`, `teLaatVoorTelling`; `adjOff` weg |
| `src/modal-aannemers.js` | **nieuw** — werkkopie-editor van de aannemerslijst in de modal |
| `src/offerte-stappen.js` | **nieuw** — `voorlegValues` + `maakVoorlegSubtaken` (auto-subtaak) |
| `src/migratie-offerte.js` | **nieuw** — eenmalige omzetting, `window.migreerOfferteStappen()` |
| `index.html` | `#fg-off`: stepperblok → `#m-aann`; label `#m-dl-o-label` |
| `styles.css` | `#m-aann`-regels, `.dl-2.opvolg`, `.pill-opvolg`, `.of-aann-opvolg` |
| `src/crud.js` | fillModalFields/clearModal/nietOpgeslagenVelden/submitTask/toevoegWaarden, `zetOffLabel` + `offerteAanvraagGewijzigd` |
| `src/offerte-aannemers.js` | nieuw: `schrijfAannemers` (P-write vanuit modal), `opgevolgd` (+2 wk) |
| `src/render-offerte.js` | paneel: knop "Opgevolgd · +2 wk" |
| `src/render-tabel.js` | `deadlineCel` opvolg-vorm; rij-klasse via `teLaatVoorTelling` |
| `src/render-lijsten.js` | telling + statusfilter via `teLaatVoorTelling` |
| `src/render-vve.js`, `src/palette.js`, `src/render-bundel.js` | zelfde helper op de weergave-plekken |
| `src/actions.js` | acties `maann-*`, `offerte-opgevolgd`; `'off'` weg; input-delegatie `m-daang` |
| `src/state.js` | `_offAangevraagdBijOpen` |
| `src/main.js` | `window.migreerOfferteStappen` |
| `src/tests.js` | nieuwe toetsen + drie bestaande blokken herschreven |
| `src/config.js`, `sw.js` | versie 12.5 / cd-v152 (laatste taak) |

**Twee vaste valkuilen (gelden voor élke taak):**
- `r.offertes` is ná `_verrijkOfferteRij` niet kolom D; de rauwe waarde is `r._offertesManual` (crud.js:716).
- Elke schrijfweg: `blokkeerOffline` → `ensureToken` → optimistisch + render → `backgroundWrite` met `assertRowMatch` en rollback; ankers ín de writeFn; idempotentie-vlag bij insert/delete.

---

### Taak 1: Teller-afleiding — de lijst wint volledig

**Files:**
- Modify: `src/util.js:566-576` (reconcileOffertes)
- Test: `src/tests.js:989-1001`

- [ ] **Stap 1.1: pas de toetsen aan naar het nieuwe gedrag** — vervang in `src/tests.js` het blok regel 989-1001 (kop "offerte: reconcileOffertes — handmatige D-waarde is ondergrens…") door:

```js
  // ── offerte: reconcileOffertes — de aannemerslijst wint volledig (v12.5). Kolom D telt
  //    alleen nog voor rijen ZONDER lijst (van vóór de aannemerslijst).
  eq('reconcile lege lijst → handmatig blijft', reconcileOffertes('2/4', []), '2/4');
  eq('reconcile lege lijst + leeg handmatig → leeg', reconcileOffertes('', []), '');
  eq('reconcile lijst zonder handmatig',
     reconcileOffertes('', [{naam:'a',binnen:true},{naam:'b',binnen:false}]), '1/2');
  eq('reconcile lijst overschrijft handmatig omhoog',
     reconcileOffertes('0/3', [{naam:'a',binnen:true},{naam:'b',binnen:false},{naam:'c',binnen:false}]), '1/3');
  eq('reconcile lijst overschrijft handmatig omlaag (vinkje weg telt weer mee)',
     reconcileOffertes('1/3', [{naam:'De Lange',binnen:false},{naam:'Zegwaard',binnen:false},{naam:'Rioolservice West',binnen:false}]), '0/3');
  eq('reconcile korte lijst wint van hoge handmatige',
     reconcileOffertes('1/5', [{naam:'a',binnen:true},{naam:'b',binnen:false}]), '1/2');
```

- [ ] **Stap 1.2: run de zelftest** — verwacht: precies de twee gewijzigde reconcile-toetsen falen ("omlaag" en "korte lijst wint"), de rest groen.

- [ ] **Stap 1.3: implementeer** — vervang in `src/util.js` de functie `reconcileOffertes` (en werk het commentaarblok erboven bij):

```js
// Effectieve "X/N": staat er een aannemerslijst (kolom P), dan telt alléén de lijst —
// X = aantal binnen, N = lijstlengte. Zonder lijst blijft de handmatige kolom-D-waarde staan
// (rijen van vóór de aannemerslijst). Tot v12.5 was D een ONDERGRENS (Math.max per kant);
// sinds de lijst in het bewerkscherm staat is die dubbele boekhouding weg — een vinkje
// weghalen moet de teller ook weer omlaag brengen.
function reconcileOffertes(manual, lijst){
  if(!lijst||!lijst.length) return manual||'';
  return `${lijst.filter(a=>a.binnen).length}/${lijst.length}`;
}
```

- [ ] **Stap 1.4: run de zelftest** — verwacht: 0 fails. LET OP: `afrondWaarden` (crud.js:1160) en `_verrijkOfferteRij` blijven ongewijzigd en werken automatisch mee; als daar toetsen op omvallen eerst kijken of de verwachting nog bij de spec past.

- [ ] **Stap 1.5: commit**

```bash
git add src/util.js src/tests.js
git commit -m "Offerte-stappen 1/8: aannemerslijst wint volledig van kolom D"
```

---

### Taak 2: Aannemerslijst in het aanmaak-/bewerkscherm

**Files:**
- Create: `src/modal-aannemers.js`
- Modify: `index.html:589-609`, `styles.css` (bij de `.of-aann-*`-regels, ±r.1246), `src/crud.js` (fillModalFields, clearModal, nietOpgeslagenVelden, submitTask, toevoegWaarden), `src/actions.js`, `src/offerte-aannemers.js`
- Test: `src/tests.js` (blokken 2279, 7520, 11645, 13936, 426)

- [ ] **Stap 2.1: nieuwe module `src/modal-aannemers.js`** — volledige inhoud:

```js
// ══════════════════════════════════════
//  MODAL-AANNEMERS — de aannemerslijst in het aanmaak-/bewerkscherm (v12.5)
//  Werkkopie-principe: het scherm muteert alleen deze kopie; pas bij Opslaan schrijft
//  submitTask hem weg (nieuwe rij: kolom P in de A..S-write; bewerken: aparte P-write via
//  schrijfAannemers in offerte-aannemers.js). Annuleren gooit de kopie weg (clearModal).
//  Bewust géén hernoemen hier: dat kan in het tabelpaneel, en de modal blijft zo een lijst
//  die je in één oogopslag leest.
// ══════════════════════════════════════
import { esc, parseAannemers, serializeAannemers } from "./util.js";

let _lijst = [];   // werkkopie: [{naam, binnen}]

// Vul de werkkopie uit de rauwe kolom-P-cel en teken de lijst. '' = leeg beginnen.
function zetModalAannemers(cel){
  _lijst = parseAannemers(cel);
  _renderModalAann();
}
// De werkkopie terug als kolom-P-celtekst (voor Opslaan en voor de wijzigings-check).
function modalAannemersCel(){ return serializeAannemers(_lijst); }

function _renderModalAann(){
  const host = document.getElementById('m-aann');
  if(!host) return;
  const rijen = _lijst.map((a,i)=>`<div class="of-aann-rij">
      <span class="m-aann-naam" title="${esc(a.naam)}">${esc(a.naam)}</span>
      <button type="button" class="of-aann-st ${a.binnen?'in':''}" data-action="maann-binnen" data-idx="${i}">${a.binnen?'✓ binnen':'nog niet'}</button>
      <button type="button" class="of-aann-x" data-action="maann-weg" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">×</button>
    </div>`).join('');
  const teller = _lijst.length
    ? `<div class="m-aann-teller">${_lijst.filter(a=>a.binnen).length} van ${_lijst.length} binnen</div>` : '';
  host.innerHTML = `${rijen}
    <div class="of-aann-add">
      <input class="of-aann-input" id="m-aann-input" placeholder="Aannemer toevoegen…" autocomplete="off" aria-label="Aannemer toevoegen">
      <button type="button" class="of-aann-toevoeg" data-action="maann-add">+ Toevoegen</button>
    </div>${teller}`;
}

// Mutaties — puur lokaal, geen schrijfactie. Zelfde wasstraat als offerte-aannemers.js:
// '|' en regelovergangen zijn de scheidingstekens van kolom P en mogen geen naam in.
function modalAannemerAdd(naam){
  naam = ((naam||'')+'').replace(/[|\n]/g,' ').trim();
  if(!naam) return;
  if(_lijst.some(a=>a.naam.toLowerCase()===naam.toLowerCase())) return; // dubbel: niets doen
  _lijst.push({naam, binnen:false});
  _renderModalAann();
  // Focus terug in het (net herbouwde) invoerveld: meerdere namen achter elkaar intypen.
  const inp=document.getElementById('m-aann-input'); if(inp) inp.focus();
}
function modalAannemerBinnen(idx){ if(_lijst[idx]){ _lijst[idx].binnen=!_lijst[idx].binnen; _renderModalAann(); } }
function modalAannemerWeg(idx){ if(_lijst[idx]){ _lijst.splice(idx,1); _renderModalAann(); } }

export { zetModalAannemers, modalAannemersCel, modalAannemerAdd, modalAannemerBinnen, modalAannemerWeg };
```

- [ ] **Stap 2.2: `index.html`** — vervang in `#fg-off` de tweede `fld-row` (regels 589-609: het blok met label "Offertes ontvangen / aangevraagd" mét de deadline ernaast) door:

```html
        <div class="fld">
          <label>Aangevraagd bij</label>
          <div id="m-aann"></div>
        </div>
        <div class="fld"><label id="m-dl-o-label">Deadline</label><input type="date" id="m-dl-o" aria-describedby="dl-hint-o"/><small class="dl-hint" id="dl-hint-o"></small></div>
```

- [ ] **Stap 2.3: `styles.css`** — direct ná de bestaande `.of-aann-dicht:hover`-regel (±r.1255) toevoegen (lees eerst de bestaande `.of-aann-rij`-regel en neem gap/uitlijning over als die afwijkt):

```css
    /* Aannemerslijst in het bewerkscherm (v12.5): zelfde onderdelen als het tabelpaneel,
       alleen de naam is hier stilstaande tekst — hernoemen kan in het paneel. */
    #m-aann{border:1px solid var(--bor);border-radius:8px;background:var(--sur)}
    #m-aann .of-aann-rij{display:flex;align-items:center;gap:8px;padding:6px 12px}
    #m-aann .of-aann-rij+.of-aann-rij{border-top:1px solid var(--bor)}
    #m-aann .m-aann-naam{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #m-aann .m-aann-teller{padding:6px 12px;font-size:12px;color:var(--mut);border-top:1px solid var(--bor)}
```

- [ ] **Stap 2.4: `src/crud.js`** — zes wijzigingen:

1. Import toevoegen: `import { zetModalAannemers, modalAannemersCel } from "./modal-aannemers.js";` en `schrijfAannemers` toevoegen aan de import uit `./offerte-aannemers.js` — die import bestaat nog niet in crud.js; voeg toe: `import { koppelTaak } from "./bundel-acties.js";` staat er al, zet eronder: `import { schrijfAannemers } from "./offerte-aannemers.js";`
2. `fillModalFields` case `'OFFERTE-TRAJECTEN'` (r.379-393) — vervang het hele case-blok door:

```js
    case'OFFERTE-TRAJECTEN':
      zetDatumVeld('m-daang',r.datumAangevraagd);setv('m-beh-o',r.behandelaar);
      // De aannemerslijst (kolom P) ís sinds v12.5 de teller. Het scherm werkt op een
      // werkkopie; submitTask schrijft hem bij Opslaan weg (zie modal-aannemers.js).
      zetModalAannemers(r.aannemers||'');
      // Kolom D (de oude X/N-teller) heeft geen invoerveld meer. Alles wat erin staat is dus
      // per definitie 'niet te tonen' en gaat via het onvertaalbaar-mechanisme ONGEWIJZIGD
      // terug de Sheet in — rijen van vóór de aannemerslijst houden zo hun oude getal.
      // `_offertesManual` vóór `offertes`: dat eerste IS kolom D (zie _verrijkOfferteRij).
      onthoudOnvertaalbaar('m-off', ((r._offertesManual!==undefined?r._offertesManual:r.offertes)||''), '');
      zetDatumVeld('m-dl-o',r.deadline);setv('m-opm-o',r.opmerkingen);setv('m-sub-off',r.subcategorie);break;
```

3. `clearModal` (r.534) — vervang `['m-off-recv','m-off-total'].forEach(...)` door `zetModalAannemers('');`
4. `nietOpgeslagenVelden` (r.353-358) — vervang het offerte-blok door:

```js
  //  · De aannemerslijst: werkkopie in modal-aannemers.js, geen gewoon invoerveld.
  if(r._sec==='OFFERTE-TRAJECTEN' && document.getElementById('m-aann')){
    if(modalAannemersCel()!==(r.aannemers||'')) uit.push('Aangevraagd bij');
  }
```

5. `submitTask`:
   - case `'OFFERTE-TRAJECTEN'` (r.1378-1382) vervangen door:

```js
      case'OFFERTE-TRAJECTEN':
        // Kolom D wordt niet meer bewerkt: het onvertaalbaar-mechanisme geeft de bestaande
        // waarde ongewijzigd door (nieuwe taak: leeg — de aannemerslijst ís de teller).
        values=[code,naam,uitVeld('m-daang',toDutchDate(gv('m-daang'))),uitVeld('m-off',''),gv('m-beh-o'),uitVeld('m-dl-o',toDutchDate(gv('m-dl-o'))),gv('m-opm-o'),'','','',sub];break;
```

   - Bewerk-tak: direct onder `const hbDoel=state._hbDoel;` (r.1443) toevoegen:

```js
      // De aannemerslijst NU uitlezen, om dezelfde reden als hbDoel: clearModal wist de werkkopie.
      const aannCel = sec==='OFFERTE-TRAJECTEN' ? modalAannemersCel() : null;
```

   en direct onder `if(hbDoel) koppelTaak(doelRow, hbDoel);` (r.1501):

```js
      // De aannemerslijst is net als de bundelkoppeling een APARTE schrijfweg (kolom P): de
      // hoofd-write blijft strikt A..K. Zelfde plek in de wachtrij, om dezelfde reden.
      if(aannCel!==null && aannCel!==(oudeWaarden.aannemers||'')) schrijfAannemers(doelRow, aannCel);
```

   - Toevoeg-tak: direct onder `nieuw.bundelVolg= bdl ? bdl.volg     : '';` (r.1525):

```js
      // De aannemerslijst gaat bij een nieuwe taak mee in de rij zelf (kolom P) — één
      // atomaire A..S-write, geen tweede actie.
      nieuw.aannemers = sec==='OFFERTE-TRAJECTEN' ? modalAannemersCel() : '';
```

   - In `extra.forEach` (r.1627), onder `extraRij.bundelId = ''; extraRij.bundelVolg = '';`:

```js
        extraRij.aannemers = nieuw.aannemers;   // zelfde aanvraag, zelfde aannemers per VvE
```

6. `toevoegWaarden` (r.745-750) — vervangen door (commentaar erboven laten staan, wel de L..P-zin bijwerken):

```js
export function toevoegWaarden(values, r){
  return values.concat([
    '', '', '', '', r.aannemers||'',                         // L..O leeg, P = aannemerslijst
    r.taakId||'', r.bundelId||'', nulVeilig(r.bundelVolg),   // Q, R, S
  ]);
}
```

- [ ] **Stap 2.5: `src/actions.js`** — vier wijzigingen:

1. Import: vervang `import { adjOff } from './util.js';` door `import { modalAannemerAdd, modalAannemerBinnen, modalAannemerWeg } from './modal-aannemers.js';`
2. In `ACTIONS`: verwijder de regel `'off': (el) => adjOff(...)` en voeg toe:

```js
  'maann-binnen':          (el) => modalAannemerBinnen(+el.dataset.idx),
  'maann-weg':             (el) => modalAannemerWeg(+el.dataset.idx),
  'maann-add':             ()   => { const inp=document.getElementById('m-aann-input'); if(!inp) return; const v=inp.value; inp.value=''; modalAannemerAdd(v); },
```

3. In de keydown-delegatie, VÓÓR de bestaande `of-aann-input`-tak (r.244) — het modal-veld deelt die opmaakklasse maar heeft geen `data-aann`:

```js
    // Aannemer toevoegen in het BEWERKSCHERM: Enter in het modal-invoerveld (werkkopie).
    if (e.target && e.target.id === 'm-aann-input' && e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value; e.target.value = '';
      modalAannemerAdd(v);
      return;
    }
```

4. `src/util.js`: verwijder `adjOff` (functie r.514-518 en uit de export-lijst r.857).

- [ ] **Stap 2.6: `src/offerte-aannemers.js`** — nieuwe export `schrijfAannemers`, onder `verwijderAannemer`:

```js
// Vanuit het BEWERKSCHERM: de complete werkkopie in één keer wegschrijven (kolom P). Zelfde
// schrijfweg als de paneel-mutaties (_bewaar), zodat guard en rollback niet uit elkaar lopen.
// Komt in de seriële wachtrij ná de A..K-write van submitTask — zelfde plek als koppelTaak.
function schrijfAannemers(r, nieuweCel){
  if(blokkeerOffline()) return;
  const vorige=r.aannemers;
  r.aannemers=nieuweCel;
  _bewaar(r, vorige);
}
```

en voeg `schrijfAannemers` toe aan het export-blok onderaan.

- [ ] **Stap 2.7: toetsen bijwerken** in `src/tests.js`:

1. r.426 `VERWACHTE_ACTIES`: verwijder `'off'` en voeg (op de plaats waar de offerte-acties staan) `'maann-binnen','maann-weg','maann-add'` toe.
2. r.2278-2282 (setv-0-toets op `m-off-recv`) vervangen door:

```js
  truthy('setv: 0 blijft "0"', (()=>{
    const el=document.createElement('input'); el.id='tst-setv-nul'; document.body.appendChild(el);
    setv('tst-setv-nul',0); const got=el.value; el.remove();
    return got==='0';
  })());
```

3. Blok r.11648-11670 ("Offerte-teller in het bewerkscherm") vervangen door (imports `modalAannemersCel`, `modalAannemerBinnen` toevoegen aan de tests-imports):

```js
  (() => {
    console.log('%c[TESTS] Offerte-aannemers in het bewerkscherm', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
    const editOud = state.editRowData;
    try {
      const r = { code:'311212', naam:'X', datumAangevraagd:'1 aug 2026', offertes:'0/3',
                  behandelaar:'Jer', deadline:'', opmerkingen:'',
                  aannemers:'Jansen|1\nPietersen|1\nDe Vries|0', _row:9, _sec:'OFFERTE-TRAJECTEN' };
      _verrijkOfferteRij(r);
      eq('offerte: de lijst ís de teller, kolom D blijft apart bewaard',
         [r._offertesManual, r.offertes], ['0/3', '2/3']);
      openModal(true, r);
      eq('offerte: het bewerkscherm laadt de aannemerslijst als werkkopie',
         modalAannemersCel(), 'Jansen|1\nPietersen|1\nDe Vries|0');
      modalAannemerBinnen(2);
      eq('offerte: vinkje in het scherm muteert alleen de werkkopie',
         [modalAannemersCel().split('\n')[2], r.aannemers.split('\n')[2]], ['De Vries|1', 'De Vries|0']);
      closeModal();
    } finally { state.editRowData = editOud; closeModal(); clearModal(); }
  })();
```

4. Blok r.13929-13943 (verplaats-waarschuwing offerte-teller): vervang de offerte-helft door (import `zetModalAannemers` in tests):

```js
    const off={_sec:'OFFERTE-TRAJECTEN',code:'311001',naam:'V',datumAangevraagd:'',behandelaar:'',
               deadline:'',opmerkingen:'',subcategorie:'',aannemers:'MoTec|1'};
    ['m-daang','m-beh-o','m-dl-o','m-opm-o','m-sub-off'].forEach(id=>zet(id,''));
    zetModalAannemers('MoTec|1');
    eq('verplaats: gelijke aannemerslijst → geen waarschuwing', nietOpgeslagenVelden(off), []);
    zetModalAannemers('MoTec|1\nVan der Herp|0');
    truthy('verplaats: gewijzigde aannemerslijst wordt genoemd',
           nietOpgeslagenVelden(off).some(l=>/Aangevraagd bij/.test(l)));
    zetModalAannemers('');
```

5. Nieuwe toets bij de bestaande `toevoegWaarden`-toetsen (±r.7520):

```js
    eq('toevoegWaarden: aannemerslijst landt op kolom P (index 15)',
       toevoegWaarden(velden(), { taakId:'T7', aannemers:'MoTec|1\nVan der Herp|0' })[15],
       'MoTec|1\nVan der Herp|0');
    eq('toevoegWaarden: zonder aannemers blijft P leeg',
       toevoegWaarden(velden(), { taakId:'T7' })[15], '');
```

6. `grep -n "m-off" src/tests.js` — er mag daarna géén verwijzing meer over zijn behalve `'m-off'` als onvertaalbaar-sleutel; resterende treffers stuk voor stuk langslopen en op dezelfde manier ombouwen.

- [ ] **Stap 2.8: run de zelftest** — 0 fails. Controleer daarnaast met de hand (lokale server, niet ingelogd is genoeg voor de weergave): open het toevoegscherm op het Offerte-tabblad → blok "Aangevraagd bij" met invoerveld zichtbaar, geen steppers.

- [ ] **Stap 2.9: commit**

```bash
git add src/modal-aannemers.js index.html styles.css src/crud.js src/actions.js src/offerte-aannemers.js src/util.js src/tests.js
git commit -m "Offerte-stappen 2/8: aannemerslijst in het aanmaak-/bewerkscherm i.p.v. tellers"
```

---

### Taak 3: "Opvolgen" in de deadline-cel + niet meer "te laat" na aanvraag

**Files:**
- Modify: `src/util.js` (na `opvolgStatus`, r.228), `src/render-tabel.js:251-261` en `:404`, `src/render-lijsten.js:32/400/472`, `src/render-vve.js:43/339/446`, `src/palette.js:118`, `src/render-bundel.js:152`, `styles.css` (na `.dl-2.bijna`, r.491)
- Test: `src/tests.js` (nieuw blok)

- [ ] **Stap 3.1: schrijf de toetsen** (nieuw blok in tests.js, bij de andere offerte-toetsen ±r.1001; imports `offerteAangevraagd`, `teLaatVoorTelling` toevoegen; `deadlineCel` is al geïmporteerd):

```js
  // ── offerte: na 'aangevraagd' is kolom F een opvolgdatum, geen deadline (v12.5) ──
  console.log('%c[TESTS] Offerte-opvolgdatum', 'background:#0D7377;color:white;padding:2px 6px;border-radius:3px');
  const T3 = new Date(2026, 8, 1); // 1 sep 2026
  eq('offerteAangevraagd: leeg', offerteAangevraagd({datumAangevraagd:''}), false);
  eq('offerteAangevraagd: vrije tekst telt niet', offerteAangevraagd({datumAangevraagd:'z.s.m.'}), false);
  eq('offerteAangevraagd: datum telt', offerteAangevraagd({datumAangevraagd:'20 mei 2026'}), true);
  eq('teLaatVoorTelling: aangevraagd offerte-traject telt nooit als te laat',
     teLaatVoorTelling({datumAangevraagd:'20 mei 2026', deadline:'19 juni 2026'},'OFFERTE-TRAJECTEN',T3), false);
  eq('teLaatVoorTelling: niet-aangevraagd traject wél',
     teLaatVoorTelling({datumAangevraagd:'', deadline:'19 juni 2026'},'OFFERTE-TRAJECTEN',T3), true);
  eq('teLaatVoorTelling: andere secties ongemoeid',
     teLaatVoorTelling({deadline:'19 juni 2026'},'OPPAKKEN',T3), true);
  truthy('deadlineCel: aangevraagd → opvolgen (toekomst, rustig)',
     deadlineCel({datumAangevraagd:'20 mei 2026', deadline:'15 september 2099'},'OFFERTE-TRAJECTEN').includes('opvolgen · nog'));
  truthy('deadlineCel: aangevraagd + verstreken → amber opvolgen, nooit rood te laat', (()=>{
     const h=deadlineCel({datumAangevraagd:'20 mei 2026', deadline:'19 juni 2020'},'OFFERTE-TRAJECTEN');
     return h.includes('opvolgen') && h.includes('bijna') && !h.includes('te laat'); })());
  truthy('deadlineCel: niet-aangevraagd traject houdt de gewone te-laat-vorm',
     deadlineCel({datumAangevraagd:'', deadline:'19 juni 2020'},'OFFERTE-TRAJECTEN').includes('te laat'));
```

- [ ] **Stap 3.2: run** — verwacht: de nieuwe toetsen falen (helpers bestaan nog niet → suite-crash bij import is ook "falen"; dan eerst stap 3.3).

- [ ] **Stap 3.3: helpers in `src/util.js`** — direct ná `opvolgStatus` (r.228):

```js
// Is dit offerte-traject al aangevraagd? Bepaald door 'Datum aangevraagd' (kolom C): gevuld en
// als datum leesbaar. Vanaf dat moment is kolom F geen aanvraag-deadline meer maar een
// OPVOLGDATUM (zie deadlineCel in render-tabel.js) en telt de rij niet meer als 'te laat'.
function offerteAangevraagd(r){
  return !!_parseAnyDate((((r && r.datumAangevraagd) || '') + ''));
}
// 'Te laat' zoals de TELLING en de rode markering hem hanteren: een aangevraagd
// offerte-traject is nooit 'te laat' — zijn verstreken datum betekent 'opvolgen' en dat
// signaal draagt de deadline-cel zelf (amber). Eén helper, zodat de kop-pil, het
// statusfilter, de rij-klasse, het dossier en Ctrl+K dezelfde uitzondering hanteren.
// De SORTERING blijft bewust op de rauwe teLaat: een traject dat op opvolgen wacht hoort
// net zo goed bovenaan.
function teLaatVoorTelling(r, sec, vandaag){
  if (sec === 'OFFERTE-TRAJECTEN' && offerteAangevraagd(r)) return false;
  return berekenPrioriteit(r.deadline, sec, vandaag).teLaat;
}
```

Beide toevoegen aan de export-lijst van util.js.

- [ ] **Stap 3.4: `deadlineCel`** (`src/render-tabel.js:251`) — voeg bovenin de functie de nieuwe vorm toe (bestaande code blijft er ongewijzigd onder):

```js
function deadlineCel(r, sec){
  // Aangevraagd offerte-traject: kolom F is dan een OPVOLGDATUM (ontwerp 2026-09-01). Altijd
  // tweeregelig — het woord 'opvolgen' is precies wat deze cel van een deadline onderscheidt.
  // Verstreken of vandaag = amber ('check of ze binnen zijn'), nooit rood 'te laat'.
  if (sec === 'OFFERTE-TRAJECTEN' && offerteAangevraagd(r)){
    if (!r.deadline) return `<td class="cell-sm"><span class="warn-geen-deadline">Geen opvolgdatum</span></td>`;
    const { teLaat, dagenTot } = berekenPrioriteit(r.deadline, sec);
    const kleur = (teLaat || dagenTot === 0) ? 'bijna' : 'opvolg';
    const bij = teLaat ? `opvolgen · ${Math.abs(dagenTot)}d over`
              : dagenTot === 0 ? 'opvolgen · vandaag'
              : dagenTot === null ? 'opvolgen'
              : `opvolgen · nog ${dagenTot}d`;
    return `<td><span class="dl-2 ${kleur}"><span class="dl-dat">${esc(r.deadline)}</span><span class="dl-bij">${esc(bij)}</span></span></td>`;
  }
  ...bestaande drie vormen ongewijzigd...
}
```

Import `offerteAangevraagd` en `teLaatVoorTelling` in render-tabel.js. En op r.404 de rij-klasse:

```js
  const rowPrio  = berekenPrioriteit(r.deadline, sec).prioriteit;
  const rowTeLaat = teLaatVoorTelling(r, sec);
```

- [ ] **Stap 3.5: `styles.css`** — direct na `.dl-2.bijna ...` (r.491):

```css
    .dl-2.opvolg .dl-dat{color:var(--txt)}
    .dl-2.opvolg .dl-bij{color:var(--mut)}
```

- [ ] **Stap 3.6: tellingen en filters** — telkens `teLaatVoorTelling` importeren:
  - `src/render-lijsten.js:32` → `if(teLaatVoorTelling(r,s)) telaat++;`
  - `src/render-lijsten.js:400` → `if(state.ntdStatus==='telaat' && !teLaatVoorTelling(r,s)) return;`
  - `src/render-lijsten.js:472` → `if(status==='telaat' && !teLaatVoorTelling(r, sec)) return false;`
  - Sortering (r.492) en `sorteerNtd` NIET aanpassen (zie helper-commentaar).
  - `src/render-vve.js:43` → `const teLaat=open.filter(r=>teLaatVoorTelling(r,r._sec,vandaag)).length;` (r.36, de sortering, laten staan). r.339: lees eerst de context; vervang de `p.teLaat`-pil door:

```js
        ? `${esc(r.deadline)}${teLaatVoorTelling(r,r._sec)?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}${(r._sec==='OFFERTE-TRAJECTEN'&&offerteAangevraagd(r)&&p.teLaat)?` <span class="pill-opvolg">Opvolgen</span>`:''}`
```

  - `src/palette.js:117-118` — vervang de `pill`-const door (+ imports `teLaatVoorTelling`, `offerteAangevraagd` uit util):

```js
      const laat=teLaatVoorTelling(r,r._sec);
      const opv=r._sec==='OFFERTE-TRAJECTEN' && offerteAangevraagd(r) && p.teLaat;
      const pill=laat?`<span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`
               : opv ?`<span class="pill-opvolg">Opvolgen (${Math.abs(p.dagenTot)}d)</span>`
               : esc(r.deadline||'');
```

  - `src/render-bundel.js:149-152` — vervang de `dlTekst`-const door (+ import `offerteAangevraagd`; het commentaarblok erboven laten staan):

```js
  const _opvolg = r._sec==='OFFERTE-TRAJECTEN' && offerteAangevraagd(r);
  const dlTekst = !r.deadline
    ? `<span class="warn-geen-deadline geen-dl-dof">Geen deadline</span>`
    : (prio.teLaat && _opvolg) ? `<span class="pill-opvolg">Opvolgen (${Math.abs(prio.dagenTot)}d)</span>`
    : prio.teLaat ? `<span class="s-telaat">Te laat (${Math.abs(prio.dagenTot)}d)</span>`
    : esc(kortDatum(r.deadline));
```

  - `styles.css`: direct onder `[data-theme=dark] .pill-telaat{…}` (r.559) de amber-kloon:

```css
    .pill-opvolg{display:inline-block;background:var(--am);color:#fff;font-size:11px;font-weight:600;padding:2px 7px;border-radius:6px;margin-left:6px;letter-spacing:.02em}
    [data-theme=dark] .pill-opvolg{color:#15181d}
```

- [ ] **Stap 3.7: run de zelftest** — 0 fails. Handcontrole op de lokale server: Offerte-tab → rijen met datum aangevraagd tonen "opvolgen · …", de rode "te laat"-pil bovenin telt ze niet meer mee.

- [ ] **Stap 3.8: commit**

```bash
git add src/util.js src/render-tabel.js src/render-lijsten.js src/render-vve.js src/palette.js src/render-bundel.js styles.css src/tests.js
git commit -m "Offerte-stappen 3/8: na aanvraag toont de deadline-cel 'opvolgen' en telt de rij niet meer als te laat"
```

---

### Taak 4: Modal — datum aangevraagd zet het opvolgdatum-voorstel klaar

**Files:**
- Modify: `src/crud.js` (nieuwe functies + fillModalFields/clearModal), `src/state.js` (bij `_hbDoel`, r.135), `src/actions.js` (input-delegatie)
- Test: `src/tests.js`

- [ ] **Stap 4.1: toetsen** (achter het Taak-3-blok; `offerteAanvraagGewijzigd` en `waardeVan` gebruiken):

```js
  // ── offerte: 'Datum aangevraagd' vult het opvolgdatum-voorstel (+3 weken) ──
  (() => {
    const secOud=state.editSec, vlagOud=state._offAangevraagdBijOpen;
    try{
      state.editSec='OFFERTE-TRAJECTEN'; state._offAangevraagdBijOpen=false;
      const zet=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v;};
      zet('m-daang','2026-09-01'); zet('m-dl-o','');
      offerteAanvraagGewijzigd();
      eq('aanvraag gevuld → opvolgdatum-voorstel = +21 dagen', waardeVan('m-dl-o'), '2026-09-22');
      eq('aanvraag gevuld → label wisselt naar Opvolgdatum',
         document.getElementById('m-dl-o-label').textContent, 'Opvolgdatum');
      zet('m-dl-o','2026-10-01'); state._offAangevraagdBijOpen=true;
      offerteAanvraagGewijzigd();
      eq('al aangevraagd bij openen → bestaande opvolgdatum blijft staan', waardeVan('m-dl-o'), '2026-10-01');
      state._offAangevraagdBijOpen=false; zet('m-daang','');
      offerteAanvraagGewijzigd();
      eq('aanvraag weer leeg → label terug naar Deadline',
         document.getElementById('m-dl-o-label').textContent, 'Deadline');
    } finally { state.editSec=secOud; state._offAangevraagdBijOpen=vlagOud; clearModal(); }
  })();
```

- [ ] **Stap 4.2: run** — nieuwe toetsen falen.

- [ ] **Stap 4.3: implementeer in `src/crud.js`** — onder `zetDeadlineVoorstel` (±r.133):

```js
// ── Offerte: deadline ↔ opvolgdatum in het scherm (v12.5) ──
// Zodra 'Datum aangevraagd' voor het eerst gevuld wordt is de aanvraag uitgezet: het F-veld
// wordt een OPVOLGDATUM — label wisselt en het veld krijgt een voorstel van +3 weken na de
// aanvraagdatum (ontwerpbesluit 2026-09-01; daarna verlengt de paneel-knop telkens +2 weken).
// `state._offAangevraagdBijOpen` onthoudt de stand bij het openen: wie een al-aangevraagd
// traject opent krijgt géén nieuw voorstel over zijn bestaande opvolgdatum heen.
function zetOffLabel(aangevraagd){
  const lbl=document.getElementById('m-dl-o-label');
  if(lbl) lbl.textContent = aangevraagd ? 'Opvolgdatum' : 'Deadline';
}
function offerteAanvraagGewijzigd(){
  if(state.editSec!=='OFFERTE-TRAJECTEN') return;
  const daang=gv('m-daang');
  if(!daang){ zetOffLabel(false); return; }
  zetOffLabel(true);
  if(state._offAangevraagdBijOpen) return;
  const p=_parseAnyDate(toDutchDate(daang));
  if(!p) return;
  const d=new Date(p.y, p.m-1, p.d + 21);
  const veld=document.getElementById('m-dl-o');
  if(veld) veld.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const hint=document.getElementById('dl-hint-o');
  if(hint) hint.textContent='Aanvraag uitgezet — de deadline is nu een opvolgdatum. Voorstel: +3 weken. Aanpassen mag.';
}
```

- Imports crud.js: `_parseAnyDate` en `offerteAangevraagd` toevoegen aan de util-import (r.4).
- `fillModalFields` offerte-case: direct vóór `break;` toevoegen:

```js
      state._offAangevraagdBijOpen = offerteAangevraagd(r);
      zetOffLabel(state._offAangevraagdBijOpen);
```

- `clearModal`: bij de andere vlag-resets (`state._nieuwBundel=null;`-blok) toevoegen:

```js
  state._offAangevraagdBijOpen=false;
  zetOffLabel(false);
```

- Exporteer `offerteAanvraagGewijzigd` (export-blok r.1746+).
- `src/state.js`: naast `_hbDoel` (r.135) een regel `_offAangevraagdBijOpen:false,` (zelfde stijl als de omliggende velden; lees de context even).

- [ ] **Stap 4.4: `src/actions.js`** — in de bestaande document-`input`-listener (r.292-296) toevoegen (+ import `offerteAanvraagGewijzigd` uit crud):

```js
    if (e.target && e.target.id === 'm-daang') offerteAanvraagGewijzigd();
```

- [ ] **Stap 4.5: run de zelftest** — 0 fails. Handcontrole: toevoegscherm Offerte → datum aangevraagd invullen → deadlineveld springt naar +3 weken, label "Opvolgdatum", hintzin zichtbaar.

- [ ] **Stap 4.6: commit**

```bash
git add src/crud.js src/state.js src/actions.js src/tests.js
git commit -m "Offerte-stappen 4/8: datum aangevraagd zet het opvolgdatum-voorstel (+3 weken) klaar"
```

---

### Taak 5: "Opgevolgd · +2 wk"-knop in het aannemers-paneel

**Files:**
- Modify: `src/render-offerte.js` (paneel), `src/offerte-aannemers.js` (schrijfweg), `src/actions.js`, `styles.css`
- Test: `src/tests.js`

- [ ] **Stap 5.1: toetsen** (bij de bestaande paneel-toetsen; `offerteAannemerPaneel` is al geïmporteerd):

```js
  truthy('paneel: Opgevolgd-knop alleen bij een aangevraagd traject',
     offerteAannemerPaneel({taakId:'T1',datumAangevraagd:'20 mei 2026',_aannemers:[]}).includes('offerte-opgevolgd'));
  truthy('paneel: geen Opgevolgd-knop vóór de aanvraag',
     !offerteAannemerPaneel({taakId:'T1',datumAangevraagd:'',_aannemers:[]}).includes('offerte-opgevolgd'));
```

En in `VERWACHTE_ACTIES` (tests r.426): `'offerte-opgevolgd'` toevoegen.

- [ ] **Stap 5.2: run** — de nieuwe toetsen falen.

- [ ] **Stap 5.3: paneel-knop** — `src/render-offerte.js`, in `offerteAannemerPaneel`: import `offerteAangevraagd` uit util; boven de `return` een const en in de add-regel vóór de Inklappen-knop plaatsen:

```js
  const opvolgKnop = offerteAangevraagd(r)
    ? `<button type="button" class="of-aann-opvolg" data-action="offerte-opgevolgd" data-aann="${sl}" title="Herinnering gestuurd — zet de opvolgdatum 2 weken verder">Opgevolgd · +2 wk</button>`
    : '';
```

en in de template: `…${opvolgKnop}<button type="button" class="of-aann-dicht"…`.

- [ ] **Stap 5.4: schrijfweg** — `src/offerte-aannemers.js`; imports uitbreiden met `showUndoToast` (notifications.js) en `logEvent` (render-overig.js); onder `schrijfAannemers` toevoegen:

```js
// 'Opgevolgd · +2 wk' (paneel): herinnering gestuurd/nagebeld → volgende opvolgdatum in
// kolom F (de deadline-kolom, die bij een aangevraagd traject de opvolgdatum draagt).
// LET OP: de deadline zit in de rij-vingerafdruk, dus de guard krijgt de OUDE waarde mee
// (zelfde vorm als zetSubsidieFase in crud.js). Mét logboekregel en undo.
const OPVOLG_TERMIJN_DAGEN = 14;
function opgevolgd(sleutel){
  _rondNaamwijzigingAf();
  const r=_vindRij(sleutel); if(!r || !r._row) return;
  if(blokkeerOffline()) return;
  const d=new Date(); d.setDate(d.getDate()+OPVOLG_TERMIJN_DAGEN);
  const nieuw=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  _schrijfOpvolg(r, nieuw, r.deadline||'', 'Opgevolgd');
}
async function _schrijfOpvolg(r, nieuw, oud, actie){
  if(!await ensureToken()){
    showToast('Niet opgeslagen','Inloggen mislukt — de opvolgdatum staat nog zoals hij was',
              'var(--rd)',null,{geenDedup:true});
    return;
  }
  r.deadline=nieuw; renderNtd();
  const heenweg={gelukt:false};
  let geschreven=false;
  backgroundWrite(
    async()=>{ if(!geschreven){
        await assertRowMatch(r._row, {...r, deadline:oud});
        await writeRange(`'Nog Te Doen'!F${r._row}`,[nieuw]);
        geschreven=true; heenweg.gelukt=true; }
      await logEvent(r.code,'OFFERTE-TRAJECTEN',actie,'opvolgdatum',oud,nieuw); },
    ()=>{ r.deadline=oud; },
    'Opvolgdatum opslaan'
  );
  if(actie==='Opgevolgd') showUndoToast('Opgevolgd',`${r.code} — opvolgen ${nieuw}`,()=>{
    // Undo pas als de heenweg echt in de Sheet staat (zelfde afspraak als herordenBundel);
    // de terugweg is dezelfde schrijfweg met de waarden omgedraaid.
    if(!heenweg.gelukt) return;
    _schrijfOpvolg(r, oud, nieuw, 'Opvolgdatum teruggezet');
  },'pauze',{sleutel:`opvolg|${r.taakId||r._row}`});
}
```

Exports: `opgevolgd` toevoegen. (`showToast`, `writeRange`, `assertRowMatch`, `backgroundWrite`, `blokkeerOffline`, `ensureToken`, `renderNtd` zijn er al.)

- [ ] **Stap 5.5: actie + stijl** — `src/actions.js`: `'offerte-opgevolgd': (el) => opgevolgd(el.dataset.aann),` + `opgevolgd` aan de offerte-aannemers-import. `styles.css`, onder `.of-aann-dicht:hover`:

```css
    .of-aann-opvolg{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-family:inherit;font-size:12px;font-weight:700;color:var(--pu);background:none;border:1px solid var(--pu);border-radius:7px;padding:0 10px;height:30px;cursor:pointer;white-space:nowrap}
    .of-aann-opvolg:hover{background:var(--pu-l)}
```

- [ ] **Stap 5.6: run de zelftest** — 0 fails. (De schrijfweg zelf wordt in Taak 8 ingelogd doorgetest.)

- [ ] **Stap 5.7: commit**

```bash
git add src/render-offerte.js src/offerte-aannemers.js src/actions.js styles.css src/tests.js
git commit -m "Offerte-stappen 5/8: Opgevolgd-knop zet de opvolgdatum +2 weken, met logboekregel en undo"
```

---

### Taak 6: Automatische subtaak "Offertes voorleggen aan eigenaren"

**Files:**
- Create: `src/offerte-stappen.js`
- Modify: `src/crud.js` (submitTask, toevoeg-tak)
- Test: `src/tests.js`

- [ ] **Stap 6.1: toetsen** (bij de toevoegWaarden-toetsen; imports `voorlegValues`, `VOORLEG_ACTIE` uit `./offerte-stappen.js`):

```js
  // ── offerte: automatische subtaak 'voorleggen aan eigenaren' (v12.5) ──
  eq('voorlegValues volgt het OPPAKKEN-stramien A..K',
     voorlegValues('411006','VvE Herenstraat 9-9a','Cihad'),
     ['411006','VvE Herenstraat 9-9a','Offertes voorleggen aan eigenaren','','Cihad','','','FALSE','','','']);
  eq('voorleg-subtaak draagt de bundel van zijn traject',
     toevoegWaarden(voorlegValues('411006','X',''), {taakId:'T9', bundelId:'Tkop', bundelVolg:'10'}).slice(16),
     ['T9','Tkop','10']);
```

- [ ] **Stap 6.2: run** — faalt (module bestaat niet).

- [ ] **Stap 6.3: nieuwe module `src/offerte-stappen.js`** — volledige inhoud:

```js
// ══════════════════════════════════════
//  OFFERTE-STAPPEN — automatische subtaak 'Offertes voorleggen aan eigenaren' (v12.5)
//  Elk nieuw offerte-traject wordt bundelkop (R = eigen taaknummer, S = '0') en krijgt in
//  OPPAKKEN een gebundelde subtaak. Ontwerp: docs/superpowers/specs/2026-09-01-offerte-stappen-design.md
//  Import-cyclus met crud.js is bewust en onschadelijk: alle over-en-weer-gebruik zit in
//  functie-lichamen, niet op moduleniveau (zelfde situatie als crud ↔ main).
// ══════════════════════════════════════
import { D } from "./state.js";
import { nieuwTaakId } from "./util.js";
import { rijIndex } from "./rij.js";
import { _shiftNtdRows } from "./api.js";
import { backgroundWrite } from "./data.js";
import { getInsertRow, insertAndWriteRows, toevoegWaarden } from "./crud.js";
import { logEvents } from "./render-overig.js";
import { renderNtd } from "./render-lijsten.js";

export const VOORLEG_ACTIE = 'Offertes voorleggen aan eigenaren';

// Kolomwaarden A..K van de subtaak, in het OPPAKKEN-stramien (code, naam, actiepunt, deadline,
// wie, prioriteit, opmerkingen, in behandeling, I, J, subcategorie). Geen deadline: een subtaak
// erft er bewust geen (zelfde regel als herzieAlsSubtaak). Puur, dus los toetsbaar.
export function voorlegValues(code, naam, behandelaar){
  return [code||'', naam||'', VOORLEG_ACTIE, '', behandelaar||'', '', '', 'FALSE', '', '', ''];
}

// Maak voor elk gegeven offerte-traject (al ín D.ntd, mét taakId en bundelId) de subtaak aan in
// OPPAKKEN — optimistisch + één insertAndWriteRows in de seriële wachtrij.
//
// AANROEPVOLGORDE (dwingend): deze functie hoort VÓÓR de insert-write van de trajecten zelf in
// de wachtrij. OPPAKKEN ligt bóven het offerteblok; deze write schuift dat blok in de Sheet
// omlaag, en de trajecten-write erna leest zijn anker vers uit rij-objecten die die verschuiving
// (via _shiftNtdRows hieronder) al dragen. Andersom wees dat anker n rijen te hoog en landde een
// traject pal onder een sectiekop — waar parseSections hem altijd weggooit.
//
// Mislukt deze write, dan blijft er een gewoon traject over: één lid met een bundelnummer is
// géén bundel (isBundel eist ≥2) en rendert als normale rij — onschadelijk.
// `gebruikt` = de taaknummers die deze opslag-actie al heeft uitgedeeld (uniekTaakId-idioom).
export function maakVoorlegSubtaken(trajecten, gebruikt){
  const lijst=(trajecten||[]).filter(t=>t && t.taakId && t.bundelId);
  if(!lijst.length) return;
  const uniek=()=>{ let id=nieuwTaakId(); while(gebruikt.has(id)) id=nieuwTaakId(); gebruikt.add(id); return id; };
  const afterRow=getInsertRow('OPPAKKEN');
  const subs=[], blok=[];
  lijst.forEach((t,i)=>{
    const vals=voorlegValues(t.code, t.naam, t.behandelaar);
    const sub={_sec:'OPPAKKEN', _row:afterRow+1+i, taakId:uniek(), bundelId:t.bundelId, bundelVolg:'10'};
    ['code','naam','actiepunt','deadline','behandelaar','prioriteit','opmerkingen','inBehandeling']
      .forEach((k,j)=>{ sub[k]=vals[j]; });
    sub.subcategorie='';
    subs.push(sub); blok.push(toevoegWaarden(vals, sub));
  });
  _shiftNtdRows(afterRow, +subs.length);
  subs.forEach(s=>{ (D.ntd.OPPAKKEN=D.ntd.OPPAKKEN||[]).push(s); });
  renderNtd();
  // Anker VERS in de writeFn (zelfde vorm en reden als versAnker in submitTask): een rollback
  // eerder in de wachtrij kan alle rijnummers verschoven hebben.
  const versAnker=()=>{
    const a=D.ntd.OPPAKKEN||[];
    const levend=subs.map(s=>{ const i=rijIndex(a,s); return i>-1?a[i]:null; }).filter(Boolean);
    return levend.length ? Math.min(...levend.map(s=>s._row))-1 : afterRow;
  };
  let ingevoegd=false;
  backgroundWrite(
    async()=>{ if(!ingevoegd){ await insertAndWriteRows('Nog Te Doen', versAnker(), blok); ingevoegd=true; }
      await logEvents(subs.map(s=>({code:s.code, sec:'OPPAKKEN', actie:'Aangemaakt', veld:'',
                                    oudeWaarde:'', nieuweWaarde:s.behandelaar||''}))); },
    ()=>{ const a=D.ntd.OPPAKKEN||[]; let weg=0; const anker=versAnker();
          subs.forEach(s=>{ const p=rijIndex(a,s); if(p>-1){ a.splice(p,1); weg++; } });
          if(weg) _shiftNtdRows(anker,-weg); },
    'Subtaak aanmaken mislukt'
  );
}
```

- [ ] **Stap 6.4: `submitTask` (toevoeg-tak)** — drie edits + import `maakVoorlegSubtaken` in crud.js:

1. Onder de `nieuw.bundelVolg`-regel (na de Taak-2-regel voor `nieuw.aannemers`):

```js
      // Een nieuw offerte-traject wordt meteen bundelkop: R = eigen taaknummer, S = '0'.
      // Niet wanneer dit zélf een subtaak is (state._nieuwBundel) — bundels blijven één laag diep.
      const autoVoorleg = sec==='OFFERTE-TRAJECTEN' && !bdl;
      if(autoVoorleg){ nieuw.bundelId=nieuw.taakId; nieuw.bundelVolg='0'; }
```

2. In `extra.forEach`: vervang `extraRij.bundelId = ''; extraRij.bundelVolg = '';` door:

```js
        extraRij.bundelId  = autoVoorleg ? extraRij.taakId : '';   // elk traject zijn eigen bundel
        extraRij.bundelVolg= autoVoorleg ? '0' : '';
```

3. Direct vóór `let ingevoegd=false;` (dus vóór de hoofd-backgroundWrite, ná `const totaal = rijen.length;`):

```js
      // De voorleg-subtaken EERST in de wachtrij — zie maakVoorlegSubtaken over de
      // ankervolgorde (OPPAKKEN ligt boven het offerteblok).
      if(autoVoorleg) maakVoorlegSubtaken(rijen, gebruikteIds);
```

- [ ] **Stap 6.5: run de zelftest** — 0 fails. Let op de bestaande submitTask-/bundel-toetsen: slaat er één rood op de nieuwe R/S-vulling, dan de verwáchting bijwerken naar het nieuwe gedrag (traject = kop), niet de code.

- [ ] **Stap 6.6: commit**

```bash
git add src/offerte-stappen.js src/crud.js src/tests.js
git commit -m "Offerte-stappen 6/8: elk nieuw traject krijgt automatisch de subtaak 'Offertes voorleggen aan eigenaren'"
```

---

### Taak 7: Eenmalige migratieroutine

**Files:**
- Create: `src/migratie-offerte.js`
- Modify: `src/main.js` (window-haak)

- [ ] **Stap 7.1: nieuwe module `src/migratie-offerte.js`** — volledige inhoud (lees vooraf de exacte signatuur van `serieleWrite` in data.js:122 — die krijgt één async taak en geeft de beurt-promise terug):

```js
// ══════════════════════════════════════
//  MIGRATIE-OFFERTE — eenmalige omzetting bij de livegang van v12.5 (ontwerp 2026-09-01).
//  Handmatig starten vanuit de console, ingelogd en met een verse lijst:
//      await window.migreerOfferteStappen()
//  Idempotent: al-omgezette trajecten worden overgeslagen; twee keer draaien is onschadelijk.
//   A) elk open, al-aangevraagd traject met een VERSTREKEN datum: kolom F → vandaag + 14 dagen
//      (een toekomstige F is al een opvolgdatum en blijft staan);
//   B) elk open traject zonder open 'voorleggen'-subtaak: kop wordt bundel (Q/R/S) + subtaak.
//  Draai hem NIET terwijl er nog schrijfacties lopen (statusbalk moet 'Live' tonen).
// ══════════════════════════════════════
import { D, state } from "./state.js";
import { offerteAangevraagd, berekenPrioriteit, nieuwTaakId } from "./util.js";
import { nulVeilig as _nv } from "./crud.js";
import { bouwBundelIndex } from "./bundel.js";
import { serieleWrite, blokkeerOffline } from "./data.js";
import { ensureToken } from "./auth.js";
import { sheetsFetch } from "./api.js";
import { SID } from "./config.js";
import { maakVoorlegSubtaken, VOORLEG_ACTIE } from "./offerte-stappen.js";
import { renderAll } from "./main.js";

export async function migreerOfferteStappen(){
  if(blokkeerOffline()) return 'offline — niets gedaan';
  if(state.pendingWrites>0) return 'er lopen nog schrijfacties — wacht op Live en probeer opnieuw';
  if(!await ensureToken()) return 'niet ingelogd';
  const rows=(D.ntd['OFFERTE-TRAJECTEN']||[]);

  // A — verstreken deadlines van aangevraagde trajecten worden opvolgdatums.
  const d=new Date(); d.setDate(d.getDate()+14);
  const nieuw=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  const naarOpvolg=rows.filter(r=>offerteAangevraagd(r)
    && berekenPrioriteit(r.deadline,'OFFERTE-TRAJECTEN').teLaat);

  // B — trajecten zonder open 'voorleggen'-subtaak.
  const ix=bouwBundelIndex(D.ntd, D.af);
  const zonderSub=rows.filter(r=>{
    const leden=r.bundelId ? ix.get((String(r.bundelId)).trim()) : null;
    return !(leden||[]).some(l=>!l.af && l.r.actiepunt===VOORLEG_ACTIE);
  });

  const gebruikt=new Set(); Object.values(D.ntd).forEach(a=>(a||[]).forEach(r=>{ if(r.taakId) gebruikt.add(r.taakId); }));
  const data=[];
  zonderSub.forEach(r=>{
    if(!r.taakId){ let id=nieuwTaakId(); while(gebruikt.has(id)) id=nieuwTaakId(); gebruikt.add(id); r.taakId=id; }
    if(!r.bundelId){ r.bundelId=r.taakId; if(!_nv(r.bundelVolg)) r.bundelVolg='0'; }
    data.push({range:`'Nog Te Doen'!Q${r._row}:S${r._row}`, values:[[r.taakId, r.bundelId, _nv(r.bundelVolg)||'0']]});
  });
  naarOpvolg.forEach(r=>{ r.deadline=nieuw; data.push({range:`'Nog Te Doen'!F${r._row}`, values:[[nieuw]]}); });
  renderAll();

  if(data.length){
    await serieleWrite(async()=>{
      const resp=await sheetsFetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values:batchUpdate`,{
        method:'POST',headers:{Authorization:`Bearer ${state.oauthToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({valueInputOption:'USER_ENTERED', data})});
      if(!resp.ok){ const e=await resp.json(); throw new Error(e.error?.message||'Migratie-write mislukt'); }
    });
  }
  maakVoorlegSubtaken(zonderSub, gebruikt);
  return `opvolgdatum → ${nieuw}: ${naarOpvolg.length} trajecten · nieuwe subtaken: ${zonderSub.length}`;
}
```

LET OP: `nulVeilig` (crud.js:705) is nog niet geëxporteerd — zet er in deze taak `export` voor (`export const nulVeilig = …`), anders faalt de import hierboven.

- [ ] **Stap 7.2: window-haak** — in `src/main.js`, bij de andere init (bv. onder de offline/online-listeners r.494):

```js
  // Eenmalige migratie v12.5 (offerte-stappen) — handmatig vanuit de console; zie migratie-offerte.js.
  import('./migratie-offerte.js').then(m=>{ window.migreerOfferteStappen=m.migreerOfferteStappen; });
```

(Lazy import: de module weegt niets mee in de normale start en een import-cyclus met main.js kan zo niet knellen.)

- [ ] **Stap 7.3: run de zelftest** — 0 fails (de routine zelf draait alleen handmatig; hij wordt in Taak 8 op de TEST-Sheet echt gedraaid).

- [ ] **Stap 7.4: commit**

```bash
git add src/migratie-offerte.js src/main.js
git commit -m "Offerte-stappen 7/8: eenmalige migratie (opvolgdatums + subtaken voor bestaande trajecten)"
```

---

### Taak 8: Versie, volledige ronde, livegang en migratie

**Files:**
- Modify: `src/config.js:8` (APP_VERSION `'12.5'`), `sw.js:25` (CACHE_VERSION `'cd-v152'`)

- [ ] **Stap 8.1: versie ophogen** — `APP_VERSION = '12.5'`, `CACHE_VERSION = 'cd-v152'`; commit:

```bash
git add src/config.js sw.js
git commit -m "Offerte-stappen 8/8: versie 12.5 / cd-v152"
```

- [ ] **Stap 8.2: volledige zelftest lokaal** — 0 fails, en het TOTAAL moet ≥ 2715 zijn (er zijn alleen toetsen bijgekomen).

- [ ] **Stap 8.3: naar staging (TEST-omgeving)** — `git checkout staging && git merge ontwerp/offerte-stappen && git push`. Op de TEST-omgeving (staging draait op de TEST-Sheet, zie config.js): ingelogd doortesten — nieuw traject aanmaken (met aannemers) → subtaak verschijnt gebundeld; vinkje in paneel ↔ bewerkscherm loopt gelijk; datum aangevraagd → opvolgdatum-voorstel; Opgevolgd-knop; afronden met open subtaak geeft de bundelwaarschuwing.
- [ ] **Stap 8.4: migratie op TEST** — console: `await window.migreerOfferteStappen()`; uitkomst-tekst controleren tegen het aantal trajecten in de TEST-Sheet; daarna nogmaals draaien → moet `0 · 0` melden (idempotent).
- [ ] **Stap 8.5: livegang** — `git checkout main && git merge staging && git push` (staging en main waren vóór dit traject gelijk op 246505e; alleen fast-forward). Wachten tot Pages de nieuwe versie serveert (versiebalk 12.5), harde refresh.
- [ ] **Stap 8.6: migratie op PROD** — zelfde als 8.4, op de productie-URL, ingelogd. Daarna controleren: geen offerte-rij meer onterecht rood; 31 trajecten hebben hun subtaak; steekproef in de Sheet zelf (kolom F, Q/R/S, en het nieuwe OPPAKKEN-blok).
- [ ] **Stap 8.7: ingelogde doortest op PROD** + memory bijwerken (project-memory + `?test=1` op de prod-URL draaien voor het definitieve toetsenaantal).

---

## Zelf-review checklist (na het schrijven uitgevoerd)

- Spec-dekking: Deel 1 → Taken 1, 2 · Deel 2 → Taken 3, 4, 5 en migratie-A (7) · Deel 3 → Taak 6 en migratie-B (7) · stijl-eis → alle UI hergebruikt bestaande klassen · "wat niet verandert" → geen taak raakt snooze/herhaal/ALV.
- Bekende open eindjes, bewust: exacte tekst "opvolgen · Xd over" mag bij de bouw nog bijgesteld; `.pill-opvolg`-properties worden van `.pill-telaat` gekloond op het moment zelf; Apps Script (Notifications.gs/Opvolging.gs) leest kolom D alleen — in Taak 8 kort verifiëren met `grep -n "\[3\]\|kolom D" apps-script/*.gs`.
