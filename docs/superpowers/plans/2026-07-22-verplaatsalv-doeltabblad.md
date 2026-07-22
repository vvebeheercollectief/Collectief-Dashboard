# verplaatsALV: doeltabblad op naam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De onEdit-trigger `verplaatsALV` schrijft afgeronde ALV's naar het tabblad met
de náám "ALV's afgerond" in plaats van blind naar het laatste tabblad, vuurt alleen nog
op het tabblad "ALV's overzicht", en logt zichtbaar in het Logboek als het doeltabblad
ontbreekt.

**Architecture:** Twee kleine wijzigingen in de Apps Script-backend (constante in
`Notifications.gs`, herschreven doelbepaling + guard in `Code.gs`) en twee
commentaar-correcties in de frontend die naar de oude bug verwijzen. Geen
gedragswijziging in de frontend, geen versiebump.

**Tech Stack:** Google Apps Script (V8), vanilla JS-frontend, GitHub Action
`apps-script-deploy.yml` (clasp) — `workflow_dispatch` op een niet-main-tak deployt naar
het TEST-script; merge naar `main` deployt naar PROD.

**Testaanpak:** Er is geen lokale testharness voor `.gs`-bestanden in dit project — de
Apps Script-kant wordt geverifieerd via de TEST-deploy plus handmatige scenario's in de
TEST-spreadsheet (stap 6). De frontend-wijzigingen zijn puur commentaar; daarvoor draait
de bestaande zelftest (`?test=1`) als regressiecheck. Strikte TDD is hier dus niet van
toepassing; de bestaande frontendtest op de archiefpositie (tests.js ±1034) blijft
ongewijzigd groen.

**Spec:** `docs/superpowers/specs/2026-07-22-verplaatsalv-doeltabblad-design.md`

---

### Task 1: Constante `ALFA_SHEET` toevoegen

**Files:**
- Modify: `apps-script/Notifications.gs:27-29`

Alle `.gs`-bestanden delen één globale scope; constanten staan maar op één plek
(zie `apps-script/README.md`). `ALVO_SHEET` staat er al; `ALFA_SHEET` komt ernaast.

- [ ] **Step 1: Voeg de constante toe**

Huidige regels (`apps-script/Notifications.gs:27-29`):

```js
const NTD_SHEET   = 'Nog Te Doen';
const ALVO_SHEET  = "ALV's overzicht";
const NOTIF_QUEUE_SHEET = 'Notif-wachtrij';
```

Wordt:

```js
const NTD_SHEET   = 'Nog Te Doen';
const ALVO_SHEET  = "ALV's overzicht";
const ALFA_SHEET  = "ALV's afgerond"; // doeltabblad van verplaatsALV (Code.gs)
const NOTIF_QUEUE_SHEET = 'Notif-wachtrij';
```

Let op: rechte apostrof in `"ALV's afgerond"`, exact zoals `lees("ALV's afgerond")` in
`src/data.js:86` — dat is de canonieke tabbladnaam.

- [ ] **Step 2: Controleer op dubbele declaratie**

Run: `grep -rn "ALFA_SHEET" apps-script/`
Expected: precies één `const ALFA_SHEET`-regel (in `Notifications.gs`).

(Commit volgt samen met Task 2 — de constante alleen is geen werkende eenheid.)

---

### Task 2: `verplaatsALV` herschrijven

**Files:**
- Modify: `apps-script/Code.gs:107-140`

- [ ] **Step 1: Vervang de functie**

Huidige functie (`apps-script/Code.gs:107-140`):

```js
function verplaatsALV(e) {
 cd_lockedRun('verplaatsALV', () => {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  var sheetName = sheet.getName();
  if (sheetName === "Nog Te Doen" || sheetName === "Afgerond") return;

  if (range.getColumn() !== 4) return;

  if (range.getValue() !== true) return;

  var row = range.getRow();
  if (row <= 1) return;

  var vveCode = sheet.getRange(row, 1).getValue();
  var vveNaam = sheet.getRange(row, 2).getValue();

  if (vveCode === "" && vveNaam === "") return;

  var datumAfgerond = new Date();
  var newRow = [vveCode, vveNaam, datumAfgerond];

  var allSheets = e.source.getSheets();
  var targetSheet = allSheets[allSheets.length - 1];

  var lastRow = targetSheet.getLastRow();
  if (lastRow === 0) {
    targetSheet.appendRow(["VvE-code", "VvE-naam", "Datum afgerond"]);
    lastRow = 1;
  }
  targetSheet.getRange(lastRow + 1, 1, 1, 3).setValues([newRow]);
 });
}
```

Wordt:

```js
function verplaatsALV(e) {
 cd_lockedRun('verplaatsALV', () => {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // Allowlist: alléén het ALV-overzicht zelf. Reset-archieven en backup-tabbladen
  // hebben óók checkboxes in kolom D en mogen deze trigger niet raken.
  if (sheet.getName().trim().toLowerCase() !== ALVO_SHEET.toLowerCase()) return;

  if (range.getColumn() !== 4) return;

  if (range.getValue() !== true) return;

  var row = range.getRow();
  if (row <= 1) return;

  var vveCode = sheet.getRange(row, 1).getValue();
  var vveNaam = sheet.getRange(row, 2).getValue();

  if (vveCode === "" && vveNaam === "") return;

  // Doeltabblad op naam — nooit "het laatste tabblad": de tabbladvolgorde is niet
  // stabiel (reset-archieven, logboek-backups). Hoofdletterongevoelig + trim, in de
  // stijl van _isAlvoTab in src/alv-reset.js.
  var alleTabs = e.source.getSheets();
  var targetSheet = null;
  for (var t = 0; t < alleTabs.length; t++) {
    if (alleTabs[t].getName().trim().toLowerCase() === ALFA_SHEET.toLowerCase()) {
      targetSheet = alleTabs[t];
      break;
    }
  }
  if (!targetSheet) {
    // Niets schrijven, niets aanmaken (een hernoemd tabblad zou anders een tweede,
    // concurrerende lijst krijgen). Vinkje blijft staan; zichtbaar melden in Logboek.
    Logger.log("verplaatsALV: tabblad '" + ALFA_SHEET + "' niet gevonden — ALV van " + vveCode + " niet gearchiveerd");
    cd_schrijfLogboek(vveCode, 'ALVS', 'Fout', 'Notulen', '',
      "Tabblad '" + ALFA_SHEET + "' niet gevonden — ALV niet gearchiveerd", 'systeem');
    return;
  }

  var datumAfgerond = new Date();
  var newRow = [vveCode, vveNaam, datumAfgerond];

  var lastRow = targetSheet.getLastRow();
  if (lastRow === 0) {
    targetSheet.appendRow(["VvE-code", "VvE-naam", "Datum afgerond"]);
    lastRow = 1;
  }
  targetSheet.getRange(lastRow + 1, 1, 1, 3).setValues([newRow]);
 });
}
```

Toelichting op wat er verandert en wat niet:
- De oude blocklist-guard (`"Nog Te Doen"`/`"Afgerond"`) vervalt; de allowlist dekt die
  gevallen automatisch af.
- `cd_schrijfLogboek(code, sectie, actie, veld, oudeWaarde, nieuweWaarde, gebruiker)`
  bestaat al in `apps-script/Extra functies.gs:28` en vangt zijn eigen fouten af
  (try/catch), dus een kapot Logboek kan deze trigger niet laten crashen. Sectie `ALVS`
  is dezelfde code die het dashboard voor ALV-gebeurtenissen gebruikt
  (`src/render-alv.js:129`).
- Rijvorm, kop-regel-aanmaak bij leeg tabblad, kolom-4/rij-1/lege-rij-checks en de
  `cd_lockedRun`-omhulling blijven exact gelijk.

- [ ] **Step 2: Syntaxcontrole**

Run: `node --check` kan geen `.gs` aan met globale Apps Script-functies? Jawel — het is
gewone JS-syntax. Controleer beide bestanden:

```bash
node --check apps-script/Code.gs 2>&1 || true
```

Expected: geen syntaxfout over déze functie. NB: `node --check` faalt op `.gs` alleen
als het bestand elders al niet-Node-parsebare syntax bevat; in dat geval als terugval
alleen de gewijzigde functie in een tijdelijk `.js`-bestand plakken (met een lege
`function cd_lockedRun(l,f){f()}`-stub erboven) en dát checken.

- [ ] **Step 3: Grep-controle dat de oude constructie weg is**

Run: `grep -n "allSheets\[allSheets.length - 1\]" apps-script/Code.gs`
Expected: geen treffers.

- [ ] **Step 4: Commit backend**

```bash
git add apps-script/Notifications.gs apps-script/Code.gs
git commit -m "Apps Script: verplaatsALV schrijft naar 'ALV's afgerond' op naam, niet naar het laatste tabblad"
```

---

### Task 3: Commentaar-hygiëne frontend

**Files:**
- Modify: `src/alv-reset.js:106-108`
- Modify: `src/tests.js:1034`

Beide plekken voeren de oude bug op als reden voor de archiefpositie. Het archief blijft
direct na het overzicht (prettiger navigeren), maar de motivering wordt eerlijk.

- [ ] **Step 1: alv-reset.js**

Huidig (`src/alv-reset.js:106-108`):

```js
    // Archiveren. Het archief komt DIRECT NA 'ALV's overzicht', nooit achteraan:
    // de oude verplaatsALV-trigger schrijft afgeronde ALV's naar het láátste tabblad,
    // dus een archief achteraan zou die stil opslokken.
```

Wordt:

```js
    // Archiveren. Het archief komt DIRECT NA 'ALV's overzicht' — dat navigeert
    // prettiger dan achteraan. (Historisch ook noodzaak: verplaatsALV schreef naar het
    // láátste tabblad; sinds die op naam zoekt is de positie alleen nog voorkeur.)
```

- [ ] **Step 2: tests.js**

Huidig (`src/tests.js:1034-1035`):

```js
      eq('reset: archief direct ná het overzicht (niet achteraan, anders slokt verplaatsALV het op)',
         gezond.archief[0].body.requests[0].duplicateSheet.insertSheetIndex, 1);
```

Wordt:

```js
      eq('reset: archief direct ná het overzicht (niet achteraan)',
         gezond.archief[0].body.requests[0].duplicateSheet.insertSheetIndex, 1);
```

De assert zelf (insertSheetIndex 1) blijft identiek.

- [ ] **Step 3: Commit frontend-commentaar**

```bash
git add src/alv-reset.js src/tests.js
git commit -m "Commentaar: archiefpositie is voorkeur, geen workaround meer voor verplaatsALV"
```

---

### Task 4: Frontend-zelftest draaien (regressiecheck)

**Files:** geen wijzigingen — alleen verificatie.

- [ ] **Step 1: Statische server starten en testsuite draaien**

De suite draait in de browser: laad de app met `?test=1`; het resultaat komt in
`window._testResult` (formaat `"<N> OK, <M> FAIL"`, zie `src/tests.js:1278`) en in de
console als `[TESTS] … OK, … FAIL`.

Start een statische server op de worktree-root (bijv. `npx serve -l 4173 .` via
`.claude/launch.json`), open `http://localhost:4173/?test=1` in de Browser-pane en lees
`window._testResult` uit.

Expected: `0 FAIL`. Bij falen: eerst controleren of de fout ook op `main` optreedt
(commentaarwijzigingen kúnnen geen assert breken behalve tests.js zelf — de enige
plausibele breuk is een typfout in de aangepaste `eq(...)`-regel).

---

### Task 5: Deploy naar TEST-script

**Files:** geen — CI/deploy.

- [ ] **Step 1: Branch pushen**

```bash
git push -u origin claude/optimistic-williams-072a5c
```

- [ ] **Step 2: Workflow handmatig starten op deze tak**

`workflow_dispatch` op een niet-main-tak kiest het TEST-script
(`.github/workflows/apps-script-deploy.yml:28-34`):

```bash
gh workflow run apps-script-deploy.yml --ref claude/optimistic-williams-072a5c
```

- [ ] **Step 3: Run volgen tot succes**

```bash
gh run list --workflow=apps-script-deploy.yml --limit 1
gh run watch <run-id> --exit-status
```

Expected: job "deploy" groen, stap "Push code naar TEST" geslaagd.

---

### Task 6: Handmatige scenario's in de TEST-spreadsheet

Apps Script-onEdit vuurt níet op API-writes — deze scenario's moeten dus als échte
Sheet-UI-edits gebeuren (door de gebruiker, of door Claude via de browser als de
gebruiker dat wil). Scenario's:

- [ ] **Step 1:** Notulen-vinkje (kolom D) aanzetten in "ALV's overzicht" → rij
  `[code, naam, datum]` verschijnt onderaan "ALV's afgerond", ongeacht tabbladvolgorde.
- [ ] **Step 2:** Vinkje in kolom D van een archief-/backup-tabblad → er gebeurt niets.
- [ ] **Step 3:** "ALV's afgerond" tijdelijk hernoemen (bijv. naar "ALV's afgerond X"),
  vinkje zetten in het overzicht → waarschuwingsregel in Logboek-sheet
  ("Tabblad 'ALV's afgerond' niet gevonden — ALV niet gearchiveerd"), vinkje blijft
  staan, nergens een rij bijgeschreven. Daarna tabblad terug hernoemen.
- [ ] **Step 4:** Vinkje in kolom D op rij 1 → er gebeurt niets.
- [ ] **Step 5:** Testrommel opruimen (testrij uit "ALV's afgerond", vinkjes terugzetten,
  Logboek-testregel mag blijven staan als spoor).

---

### Task 7: Naar PROD

- [ ] **Step 1:** Na groen licht op Task 6: merge naar `main` (fast-forward of PR,
  volgens voorkeur gebruiker — zie superpowers:finishing-a-development-branch).
- [ ] **Step 2:** GitHub Action deployt automatisch naar PROD (push naar `main` raakt
  `apps-script/**`). Run controleren:

```bash
gh run list --workflow=apps-script-deploy.yml --limit 1
```

Expected: "Push code naar PRODUCTIE" groen.

- [ ] **Step 3:** In PROD hoeft niets hersteld te worden: gecontroleerd op 2026-07-22,
  er staan geen zwerfrijen in het backup-tabblad.
