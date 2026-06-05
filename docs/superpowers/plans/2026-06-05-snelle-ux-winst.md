# Snelle UX-winst — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het dashboard prettiger en sneller laten voelen via een per-collega instelbare rijdichtheid en optimistische ("voelt direct") updates bij Afronden, Opslaan en Toevoegen.

**Architecture:** Alles in `index.html`. Dichtheid stuurt bestaande tabel-CSS aan via CSS-variabelen op `<html data-density>`, onthouden in `localStorage` (zelfde patroon als dark mode via `applyTheme`). "Voelt direct" draait de volgorde om: lokale data `D` muteren + `renderAll()` eerst, Sheets-schrijfactie op de achtergrond, met terugrol bij fout. Een `pendingWrites`-teller pauzeert de 8s-poll tijdens een write.

**Tech Stack:** Vanilla JS/CSS in één `index.html`, Google Sheets REST API, geen buildstap. Verificatie handmatig in de browser (statische server `python3 -m http.server 8080`, preview op `localhost:8080`). Spec: `docs/superpowers/specs/2026-06-05-snelle-ux-winst-design.md`.

---

## File Structure

- **Modify:** `index.html` — enige codebestand. Raakvlakken:
  - CSS: tabel-cel-regels (`td`, `.cell-*`) rond regel ~153 → koppelen aan dichtheid-variabelen; nieuw `[data-density]`-blok.
  - HTML: topbar rond regel ~470-477 (naast `#theme-btn`) → dichtheid-knop.
  - JS: `applyTheme` (~1233) als sjabloon voor `applyDensity`; DOM-ready herstel (~1112/1199); poll (`setInterval`, ~1182); `doCompleteTask` (~2553); `submitTask` (~2611); helpers `showToast`/`showUndoToast` (~3165/3207).
- **Reference (niet wijzigen):** `mockup-ux-snelheid.html`.

---

## Task 1: Dichtheid — CSS-variabelen + zachtere lijnen

**Files:**
- Modify: `index.html` (CSS-blok rond regel ~146-157)

- [ ] **Step 1: Koppel tabel-cellen aan dichtheid-variabelen + voeg dichtheid-blok toe**

Vervang in het `/* Table */`-blok de vaste `td`-padding door variabelen en voeg onder het blok de standen toe. Pas `td` aan:

```css
    td{padding:var(--row-py,9px) var(--row-px,13px);vertical-align:middle;font-size:var(--row-fs,13px);line-height:var(--row-lh,1.4)}
```

Voeg direct na de `.cell-sm{...}`-regel toe:

```css
    /* Dichtheid (per collega, onthouden in localStorage) */
    html[data-density="compact"]{--row-py:5px;--row-px:13px;--row-fs:12.5px;--row-lh:1.3}
    html[data-density="standaard"]{--row-py:9px;--row-px:13px;--row-fs:13px;--row-lh:1.4}
    html[data-density="ruim"]{--row-py:14px;--row-px:16px;--row-fs:14px;--row-lh:1.6}
    /* Zachtere scheidingslijnen voor iedereen */
    tbody tr{border-bottom-color:color-mix(in srgb,var(--bor) 60%,transparent)}
```

- [ ] **Step 2: Verifieer in de browser dat het niets breekt**

Start server (`python3 -m http.server 8080` in projectmap) en open `localhost:8080`. Log in, ga naar Nog Te Doen. Zonder `data-density` gezet vallen de cellen terug op de defaults (9px/13px) — de tabel ziet er identiek uit, lijnen iets zachter.
Expected: lijst rendert normaal, geen layout-breuk.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ux): tabel-dichtheid via CSS-variabelen + zachtere lijnen"
```

---

## Task 2: Dichtheid — knop, `applyDensity`, en herstel bij laden

**Files:**
- Modify: `index.html` (topbar ~470-477; nieuwe functie bij `applyTheme` ~1233; init ~1112)

- [ ] **Step 1: Voeg de dichtheid-knop toe in de topbar, naast het thema-knopje**

Zoek `#theme-btn` (rond regel 474). Voeg er direct vóór (of na) een knop bij die door de drie standen roteert:

```html
      <button id="density-btn" class="icon-btn" title="Weergave: dichtheid">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
```

(Gebruik dezelfde wrapper/`class` als `#theme-btn` heeft, zodat de styling klopt — kopieer de class van het bestaande thema-knopje.)

- [ ] **Step 2: Voeg `applyDensity` toe naast `applyTheme`**

Direct ná de `applyTheme`-functie (rond regel 1242):

```javascript
const DENSITIES=['standaard','compact','ruim'];
function applyDensity(d){
  if(!DENSITIES.includes(d)) d='standaard';
  document.documentElement.dataset.density=d;
  localStorage.setItem('density',d);
}
function cycleDensity(){
  const cur=document.documentElement.dataset.density||'standaard';
  const next=DENSITIES[(DENSITIES.indexOf(cur)+1)%DENSITIES.length];
  applyDensity(next);
  showToast('Weergave: '+next.charAt(0).toUpperCase()+next.slice(1),'',null);
}
```

- [ ] **Step 3: Koppel de knop en herstel de keuze bij laden**

Bij de init waar het thema hersteld wordt (regel ~1112 `if(localStorage.getItem('theme')==='dark')...`), voeg toe:

```javascript
  applyDensity(localStorage.getItem('density')||'standaard');
```

En bij de knop-koppeling (regel ~1129, naast `theme-btn.onclick`):

```javascript
  document.getElementById('density-btn').onclick=cycleDensity;
```

- [ ] **Step 4: Verifieer in de browser**

Herlaad. Klik op de dichtheid-knop → lijst wisselt Standaard→Compact→Ruim→Standaard, met een korte toast. Herlaad de pagina → laatst gekozen stand blijft staan. Controleer ook tab Afgerond en pagina Logboek (zelfde tabel-CSS).
Expected: dichtheid wisselt overal mee, keuze overleeft een herlaad.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ux): dichtheid-knop in topbar + onthouden per collega"
```

---

## Task 3: "Voelt direct" — poll-guard en gedeelde terugrol-helper

**Files:**
- Modify: `index.html` (poll `setInterval` ~1182; nieuwe helpers bij de API-sectie ~1247)

- [ ] **Step 1: Voeg een `pendingWrites`-teller toe en laat de poll 'm respecteren**

Boven de poll-`setInterval` (regel ~1181) een teller declareren:

```javascript
let pendingWrites=0;
```

In de poll-callback (regel ~1182), als extra guard direct na de bestaande guards:

```javascript
    if(pendingWrites>0) return;
```

- [ ] **Step 2: Voeg een achtergrond-write-helper toe**

Bij de API-sectie (na `appendRange`, rond regel 1270):

```javascript
// Voert een Sheets-schrijfactie op de achtergrond uit. De UI is al optimistisch
// bijgewerkt door de aanroeper. Bij fout draait `rollback` de lokale wijziging terug.
async function backgroundWrite(writeFn, rollback, foutTitel){
  pendingWrites++;
  try{
    await writeFn();
  }catch(e){
    rollback();
    renderAll();
    const msg=(e.message||'').toLowerCase();
    if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
      oauthToken=null;oauthExpiry=0;
      showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','#dc2626');
    }else{
      showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','#dc2626');
    }
  }finally{
    pendingWrites--;
    if(pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen
  }
}
```

- [ ] **Step 3: Verifieer dat niets breekt**

Herlaad de pagina. Het dashboard moet normaal laden en pollen (geen JS-fouten in de console). `backgroundWrite` wordt nog nergens aangeroepen — alleen gedefinieerd.
Expected: geen console-fouten; live-sync blijft werken.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ux): pendingWrites-guard + backgroundWrite-helper"
```

---

## Task 4: Afronden voelt direct

**Files:**
- Modify: `index.html` (`doCompleteTask` ~2553-2604)

- [ ] **Step 1: Maak `doCompleteTask` optimistisch**

In `doCompleteTask`: bereken `values`/`afAfterRow` zoals nu, maar verwijder de rij eerst lokaal en teken opnieuw, sluit de modal en toon de bestaande undo-toast; doe de batchUpdate via `backgroundWrite`. Vervang het blok vanaf `const resp=await fetch(...)` t/m `showUndoToast(...)` door:

```javascript
    const batchBody={requests:[
      {insertDimension:{range:{sheetId:afSheetId,dimension:'ROWS',startIndex:afAfterRow,endIndex:afAfterRow+1},inheritFromBefore:true}},
      {updateCells:{range:{sheetId:afSheetId,startRowIndex:afAfterRow,endRowIndex:afAfterRow+1,startColumnIndex:0,endColumnIndex:values.length},
        rows:[{values:values.map(v=>({userEnteredValue:{stringValue:String(v)}}))}],fields:'userEnteredValue'}},
      {deleteDimension:{range:{sheetId:ntdSheetId,dimension:'ROWS',startIndex:r._row-1,endIndex:r._row}}}
    ]};
    // undo-data vóór de mutatie vastleggen
    const ntdKeys=SECS[sec].keys;
    const ntdValues=ntdKeys.map(k=>r[k]||''); ntdValues.push(r.subcategorie||'');
    const undoData={sec,code:r.code,ntdValues,ntdRow:r._row};
    // 1) optimistisch verwijderen uit de lokale lijst + opnieuw tekenen
    const arr=D.ntd[sec]||[];
    const pos=arr.indexOf(r);
    if(pos>-1) arr.splice(pos,1);
    renderAll();
    closeCompleteModal();
    showUndoToast('✅ Taak afgerond',`${r.code} — ${r.actiepunt||r.naam||''}`,()=>undoComplete(undoData));
    // 2) op de achtergrond wegschrijven; bij fout terugzetten
    backgroundWrite(
      async ()=>{
        const resp=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`,{
          method:'POST',headers:{Authorization:`Bearer ${oauthToken}`,'Content-Type':'application/json'},
          body:JSON.stringify(batchBody)});
        if(!resp.ok){const e=await resp.json();if(resp.status===401){oauthToken=null;oauthExpiry=0}throw new Error(e.error?.message||'Fout bij afhandelen taak')}
        logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
      },
      ()=>{ if((D.ntd[sec]||[]).indexOf(r)===-1){ (D.ntd[sec]=D.ntd[sec]||[]).splice(Math.min(pos,(D.ntd[sec]||[]).length),0,r); } },
      'Afronden mislukt'
    );
```

Verwijder de oude `await loadAll();` en de losse `showUndoToast(...)` die hieronder stonden (die zijn nu hierboven verwerkt). Laat de `catch(e)` van de buitenste `try` staan voor de synchronische voorbereiding.

- [ ] **Step 2: Verifieer in de browser**

Rond een taak af. Verwacht: modal sluit direct, taak is meteen weg uit de lijst, "Ongedaan"-toast verschijnt — zonder merkbare wachttijd. Controleer in Google Sheets dat de rij van "Nog Te Doen" naar "Afgerond" is verplaatst. Klik daarna een keer op "Ongedaan" bij een nieuwe afronding → taak komt terug.
Expected: directe UI-reactie, Sheet correct bijgewerkt, undo werkt.

- [ ] **Step 3: Foutpad testen**

Zet wifi/internet uit, rond een taak af. Verwacht: taak verdwijnt heel even, komt dan terug met een rode "Afronden mislukt"-toast. Zet internet weer aan.
Expected: geen verlies, taak teruggezet, duidelijke melding.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ux): afronden voelt direct (optimistisch + terugrol)"
```

---

## Task 5: Opslaan & Toevoegen voelen direct

**Files:**
- Modify: `index.html` (`submitTask` ~2611-2700)

- [ ] **Step 1: Maak het bewerken-pad optimistisch**

In `submitTask`, in de tak `if(editMode&&editRowData?._row){ ... }` (regel ~2642): werk de lokale rij meteen bij, teken opnieuw, sluit de modal, en schrijf op de achtergrond. Vervang de `await writeRange(...)` + bijbehorende `logEvent/fireNotifEvent` + de latere `await loadAll()` door:

```javascript
      const sec2=sec, oudeWaarden={...editRowData}, doelRow=editRowData;
      // lokale rij muteren volgens de net-samengestelde `values` (kolomvolgorde = SECS[sec].keys + subcategorie)
      const keys=SECS[sec].keys;
      keys.forEach((k,i)=>{ doelRow[k]=values[i]; });
      doelRow.subcategorie=values[values.length-1];
      const newBeh=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):gv('m-beh-l'));
      renderAll();
      closeModal();clearModal();
      showToast('💾 Opgeslagen',`${code} — ${naam||''}`,null);
      backgroundWrite(
        async ()=>{
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          if(newBeh && newBeh!==(oudeWaarden.behandelaar||'')){
            fireNotifEvent('assigned',{sec:sec2,code,naam,behandelaar:newBeh});
            logEvent(code,sec2,'Behandelaar gewijzigd','behandelaar',oudeWaarden.behandelaar,newBeh);
          }
          logEvent(code,sec2,'Bewerkt','','','');
        },
        ()=>{ keys.forEach(k=>{ doelRow[k]=oudeWaarden[k]; }); doelRow.subcategorie=oudeWaarden.subcategorie; },
        'Opslaan mislukt'
      );
      return;
```

(Plaats deze `return;` zo dat het oude vervolg — `closeModal();clearModal();await loadAll();` onderaan — voor het bewerken-pad niet meer wordt bereikt.)

- [ ] **Step 2: Maak het toevoegen-pad optimistisch**

In de `else`-tak (nieuwe taak, regel ~2650): voeg de rij meteen lokaal toe met een tijdelijk `_row`, teken opnieuw, sluit de modal, schrijf op de achtergrond; de stille resync in `backgroundWrite` vult straks het echte `_row`. Vervang het `else`-blok + de latere `await loadAll()` door:

```javascript
      const sec3=sec;
      const afterRow=getInsertRow(sec3);
      const newBeh2=(sec==='OPPAKKEN'?gv('m-beh'):sec==='VERGADERVERZOEKEN'?gv('m-beh-v'):sec==='OFFERTE-TRAJECTEN'?gv('m-beh-o'):gv('m-beh-l'));
      // optimistische rij opbouwen uit `values` (zelfde kolomvolgorde)
      const keys2=SECS[sec3].keys, nieuw={_sec:sec3,_row:afterRow+1};
      keys2.forEach((k,i)=>{ nieuw[k]=values[i]; });
      nieuw.subcategorie=values[values.length-1];
      (D.ntd[sec3]=D.ntd[sec3]||[]).push(nieuw);
      renderAll();
      closeModal();clearModal();
      showToast('➕ Taak toegevoegd',`${code} — ${naam||''}`,null);
      backgroundWrite(
        async ()=>{
          await insertAndWriteRow('Nog Te Doen',afterRow,values);
          fireNotifEvent('newtask',{sec:sec3,code,naam,behandelaar:newBeh2});
          logEvent(code,sec3,'Aangemaakt','','',newBeh2||'');
        },
        ()=>{ const a=D.ntd[sec3]||[]; const p=a.indexOf(nieuw); if(p>-1)a.splice(p,1); },
        'Toevoegen mislukt'
      );
      return;
```

- [ ] **Step 3: Verifieer bewerken in de browser**

Bewerk een bestaande taak (bv. actiepunt of behandelaar). Verwacht: modal sluit direct, wijziging meteen zichtbaar in de lijst, korte "Opgeslagen"-toast. Controleer de Sheet.
Expected: directe UI-reactie, Sheet bijgewerkt.

- [ ] **Step 4: Verifieer toevoegen in de browser**

Voeg een nieuwe taak toe in elke sectie-soort waar je makkelijk bij kunt (minimaal OPPAKKEN). Verwacht: verschijnt meteen op de juiste plek/sortering met "Taak toegevoegd"-toast. Wacht ~2s (stille resync), klik dan op de bewerk- én afrond-knop van die nieuwe rij → beide werken (bewijst dat `_row` correct is geresynct).
Expected: directe weergave; na resync werken de rij-acties op de nieuwe taak.

- [ ] **Step 5: Foutpad testen (toevoegen)**

Internet uit, voeg een taak toe → verschijnt even, verdwijnt weer met rode "Toevoegen mislukt"-toast.
Expected: geen spook-rij blijft staan.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ux): opslaan & toevoegen voelen direct (optimistisch + terugrol)"
```

---

## Task 6: Volledige testronde + deploy

**Files:** geen wijziging (tenzij een test iets blootlegt)

- [ ] **Step 1: Doorloop het volledige testplan uit de spec**

Spec-sectie "Testplan", stappen 1-6: dichtheid (alle tabs + herlaad + tweede browser), afronden, opslaan, toevoegen, foutpad, en de race-test (twee acties snel achter elkaar → beide landen correct, geen flikkering).
Expected: alle stappen groen.

- [ ] **Step 2: Draai de bestaande prioriteit-unittests als regressiecheck**

Open `localhost:8080/?test=1` en bekijk de console (17 asserts moeten slagen — de auto-prioriteit is niet geraakt, maar dit bevestigt dat de render-/berekenpaden intact zijn).
Expected: alle asserts PASS.

- [ ] **Step 3: Push naar main (deploy via Vercel)**

```bash
git push origin main
```

Vercel deployt automatisch `index.html`. Controleer na de deploy de live URL.
Expected: live dashboard toont dichtheid-knop en directe updates.

---

## Self-Review (uitgevoerd bij het schrijven)

- **Spec-dekking:** Deel 1 dichtheid → Tasks 1-2; zachtere lijnen → Task 1. Deel 2 infrastructuur → Task 3; afronden → Task 4; opslaan+toevoegen → Task 5. Testplan → Task 6. Alle spec-secties gedekt.
- **Geen placeholders:** alle code-stappen bevatten echte code; verificatie is browser-gebaseerd (geen pytest in deze codebase).
- **Naam-consistentie:** `applyDensity`/`cycleDensity`/`DENSITIES`, `pendingWrites`/`backgroundWrite`, `submitTask`/`doCompleteTask`, `showToast(title,msg,color)`/`showUndoToast(title,msg,undoFn)` — consistent gebruikt over alle tasks.
- **Aanname om bij uitvoering te checken:** kolomvolgorde in `submitTask`'s `values` komt overeen met `SECS[sec].keys` + subcategorie als laatste. Bij Task 5 vóór de wijziging verifiëren tegen de `case`-blokken (regel ~2624-2638) en `SECS`-definitie (regel ~1059-1068); afwijking → mapping aanpassen.
