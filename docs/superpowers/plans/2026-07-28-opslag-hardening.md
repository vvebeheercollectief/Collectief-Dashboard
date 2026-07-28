# Opslag-hardening — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De opslaglaag van het dashboard zo maken dat een fout altijd herstelbaar is, dat een bevestiging op het scherm altijd waar is, en dat de leeslast niet met de historie meegroeit.

**Architecture:** Zes fases, elk zelfstandig uit te rollen, in de volgorde vangnet → schrijfzekerheid → bewaking → verbouwing. De back-up komt in een **apart** Apps Script-project (`apps-script-backup/`, buiten de clasp-CI) zodat het gebonden project geen Drive-scope hoeft te krijgen. De schrijfzekerheid komt van één omhulsel in `src/data.js` dat álle schrijfwegen zichtbaar maakt, plus het omdraaien van de niet-atomaire undo-paden. De structuurbewaking is een nieuwe, puur waarnemende module `src/structuurcheck.js`.

**Tech Stack:** Statische ES-modules zonder bundler, Google Sheets API v4 via OAuth-token, Apps Script (clasp-CI voor `apps-script/`, handmatig voor `apps-script-backup/`), zelftest-harnas in `src/tests.js` via `?test=1`.

**Spec:** `docs/superpowers/specs/2026-07-28-opslag-hardening-design.md`

**Tak:** `feature/opslag-hardening` (bestaat al, vanaf `main`, met de spec erin). NIET op `staging` werken — die tak is divergent met geparkeerd spraakmemo-werk.

---

## Werkwijze per taak

**Tests draaien.** Server starten vanuit de repo-root:

```bash
cd /Users/servicedesk/collectief-dashboard && python3 -m http.server 8899
```

Daarna `http://localhost:8899/index.html?test=1` openen en de console lezen. `window._testResult` bevat `"N OK, M FAIL"`. Zonder inloggen draaien de tests gewoon — ze werken op verzonnen data.

**Belangrijk:** de service worker kan oude modules serveren. Bij twijfel hard verversen (Cmd+Shift+R) of in DevTools → Application → Service Workers op "Unregister".

**Vergelijk nooit met een geteld getal.** De suite groeit; het aantal asserts is geen constante. Vergelijk `window._testResult` met de waarde die je in Taak 0.1 hebt vastgelegd, en eis: **FAIL blijft 0, OK gaat alleen omhoog.**

**Bij elke frontend-wijziging, zonder uitzondering:**
- `APP_VERSION` in `src/config.js` ophogen (nu `'9.2'`)
- `CACHE_VERSION` in `sw.js` bumpen (nu `'cd-v87'`)
- elke **nieuwe** module toevoegen aan `APP_SHELL` in `sw.js` (die lijst somt alle modules met de hand op)

**Uitrol:** `feature/opslag-hardening` → `staging` → testen op de Vercel-testlink → `main` (= GitHub Pages productie).

---

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid | Fase |
|---|---|---|
| `apps-script-backup/Backup.gs` *(nieuw)* | Dagelijkse Drive-kopie, retentie, hartslag. Los project, buiten de CI | 1 |
| `apps-script-backup/README.md` *(nieuw)* | Wat het project doet, hoe je het installeert, welke scopes het vraagt | 1 |
| `src/data.js` | `metWriteMarkering`, `schrijfActieLoopt`, `setSaving`, guard in `setSynced`, `backgroundWrite` | 2 |
| `src/state.js` | `_writeStart` erbij | 2 |
| `src/notifications.js` | `showToast`-opties, atomaire `undoComplete`/`undoDelete` | 2 |
| `src/main.js` | `beforeunload`-listener, aanroep structuurcheck | 2, 3 |
| `src/crud.js`, `src/bulk.js`, `src/snooze.js`, `src/render-herhaal.js`, `src/alv-reset.js`, `src/render-alv.js`, `src/kenmerken.js` | `logEvent` awaiten, undo-paden onder de teller | 2 |
| `src/api.js` | `_veiligeRij` op de `batchUpdate`-route | 2 |
| `src/structuurcheck.js` *(nieuw)* | Pure controles op sectiestructuur en rasterbreedte. Geen DOM, geen netwerk | 3 |
| `src/tests.js` | Asserts bij elke taak | 2, 3 |

---

# FASE 0 — Nulmeting en opruiming

Geen code, geen deploy. Dit legt de onbekenden vast waar fase 1 en 4 op leunen.

### Taak 0.1: Nulmeting vastleggen

**Files:** geen (uitkomst noteren in de takenlijst van de sessie)

- [ ] **Stap 1: Testsuite-basislijn vastleggen**

Server starten, `http://localhost:8899/index.html?test=1` openen, in de console:

```js
window._testResult
```

Noteer de exacte uitkomst (bv. `"641 OK, 0 FAIL"`). Dit is de referentie voor élke latere taak.

- [ ] **Stap 2: Werkelijke poll-omvang meten**

Op het **live** dashboard (ingelogd), ná de eerste geslaagde poll, in de console:

```js
(await import('/Collectief-Dashboard/src/state.js')).state._lastDHash?.length
```

Op localhost is het pad `/src/state.js`. Noteer het getal.

*Waarom zo:* `state` zit in modulescope, er staat niets op `window`. Een kale `state._lastDHash` geeft een ReferenceError. En `_lastDHash` is `null` tot de eerste poll met gewijzigde data binnen is.

- [ ] **Stap 3: Commit de nulmeting**

```bash
git commit --allow-empty -m "Nulmeting fase 0: testsuite en poll-omvang vastgelegd"
```

### Taak 0.2: Trigger-inventarisatie

**Files:**
- Modify: `apps-script/README.md`

- [ ] **Stap 1: Triggers uitlezen in de Apps Script-editor**

Open het PROD-script via de Sheet → Extensies → Apps Script → Triggers (klokje links). Noteer per trigger: **functienaam, type, en het account waaronder hij draait** (kolom "Eigenaar"/"Owner").

Let specifiek op of deze bestaan, want de repo bevat er géén installer voor:
`verplaatsAfgerond`, `verplaatsALV`, `sorteerOfferteTrajecten`.

- [ ] **Stap 2: Uitkomst vastleggen**

Voeg onderaan `apps-script/README.md` toe:

```markdown
## Werkelijk geïnstalleerde triggers (gecontroleerd 2026-07-28)

| Functie | Type | Draait als |
|---|---|---|
| ... | ... | ... |

De legacy onEdit-triggers (`verplaatsAfgerond`, `verplaatsALV`, `sorteerOfferteTrajecten`)
staan in geen enkele setup-functie. Hierboven staat of ze daadwerkelijk draaien.
Dit bepaalt of er rijen buiten het dashboard om verschuiven (zie fase 4 van
docs/superpowers/plans/2026-07-28-opslag-hardening.md).
```

- [ ] **Stap 3: Commit**

```bash
git add apps-script/README.md
git commit -m "Apps Script: werkelijk geïnstalleerde triggers vastgelegd"
```

### Taak 0.3: Drive-rechten opschonen

**Files:** geen (uitkomst in de takenlijst)

- [ ] **Stap 1: Delingen nalopen**

Open de PROD-Sheet → Delen. Noteer élke persoon en élke link met bewerkrechten.

- [ ] **Stap 2: Opschonen**

Trek in met de gebruiker door: wie hoort er bewerkrechten te houden. Zet de rest op
Kijker of verwijder ze. Zet "Iedereen met de link" uit als die aan staat.

- [ ] **Stap 3: Uitkomst terugkoppelen**

Meld aan de gebruiker wie er nu bewerkrechten heeft. Geen commit nodig — dit staat niet in code.

### Taak 0.4: De drie Sheet-afwijkingen herstellen

**Files:** geen (handmatig in de Sheet, via de Chrome-UI — de Sheets-MCP is in dit project alleen-lezen)

> **Vooraf met de gebruiker afstemmen:** na stap 3 verschijnen twee taken die nu onzichtbaar zijn, inclusief hun deadlines, te-laat-status en deadline-notificaties. Dat is de bedoeling, maar het mag geen verrassing zijn.

- [ ] **Stap 1: Handmatige kopie maken**

Bestand → Een kopie maken. Naam: `VOOR OPSCHONING 2026-07-28`. Dit is het vangnet zolang fase 1 nog niet draait.

- [ ] **Stap 2: Afwijkingen bevestigen**

Open het tabblad `Nog Te Doen` en controleer met eigen ogen:
- regel 46 = sectiekop `OFFERTE-TRAJECTEN`
- regel 47 = een datarij (VvE 311198) op de plek waar de kolomkoprij hoort
- regel 48 = de kolomkoprij (`VvE Code`, `VvE`, …)
- regel 52 = leeg, midden in de sectie

Wijkt dit af, **stop** en meld het — de rest van deze taak gaat uit van dit beeld.

- [ ] **Stap 3: Verdwaalde datarij onder de kolomkoprij zetten**

Knip regel 47 en plak hem als nieuwe regel direct **onder** de kolomkoprij. Herhaal voor de tweede verdwaalde regel (rond regel 29).

- [ ] **Stap 4: Lege regel verwijderen**

Verwijder de lege regel 52 (rechtsklik → Rij verwijderen — niet alleen de inhoud wissen).

*Waarom dit ertoe doet:* `cd_createTaskRow` zoekt zijn invoegpositie vanaf kop+2 tot de eerste lege cel in kolom A. Zolang die lege regel er staat, belanden nieuwe taken uit de herhaalmotor en de mail-intake middenin de lijst.

- [ ] **Stap 5: Controleren in het dashboard**

Herlaad het dashboard. Verwacht: de twee taken staan nu in hun sectie, de sectietellingen kloppen, geen taak is verdwenen.

---

# FASE 1 — Back-up en herstel

### Taak 1.1: Back-upmap aanmaken

**Files:** geen

- [ ] **Stap 1: Map maken**

Maak in Drive een map `Dashboard back-ups`, **buiten** de map waar de PROD-Sheet staat.

- [ ] **Stap 2: Map-id noteren**

Open de map; het id staat in de URL na `/folders/`. Noteer het — je hebt het nodig in Taak 1.2.

### Taak 1.2: Back-upscript schrijven

**Files:**
- Create: `apps-script-backup/Backup.gs`
- Create: `apps-script-backup/README.md`

Deze map valt **buiten** de clasp-CI: die triggert alleen op `apps-script/**` en pusht alleen `rootDir: apps-script`. De code staat dus wel in versiebeheer maar rolt niet automatisch uit — precies de bedoeling.

- [ ] **Stap 1: Backup.gs schrijven**

```javascript
// ══════════════════════════════════════
//  BACKUP — dagelijkse kopie van de PROD-Sheet naar een aparte Drive-map
// ══════════════════════════════════════
// LOS project, bewust NIET gebonden aan de spreadsheet en bewust NIET in apps-script/.
// Reden: een DriveApp-scope in het gebonden project is een scope-uitbreiding en dwingt
// herautorisatie af; tot dat gebeurt vallen cd_checkDeadlines, cd_dailySummary,
// cd_sweepNotifQueue en cd_opvolgingMotor stil. Een back-upmaatregel die het dagelijkse
// werk kan platleggen is erger dan het gat dat hij dicht.
//
// Dit script raakt de PROD-Sheet NOOIT aan — het leest hem alleen via makeCopy.
// Er wordt bewust geen tabblad in de PROD-Sheet geschreven: dat zou via de onChange-
// trigger cd_onNotifQueueChange elke nacht cd_drainNotifQueue wakker maken.

const BK_BRON_ID = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw'; // PROD-Sheet
const BK_MAP_ID  = 'VUL_HIER_HET_MAP_ID_IN';                       // uit Taak 1.1
const BK_PREFIX  = 'BACKUP Collectief Dashboard ';
const BK_STAART  = ' — NIET BEWERKEN';
const BK_DAGEN   = 14;  // aantal dagelijkse kopieën dat bewaard blijft
const BK_MAANDEN = 12;  // aantal maandelijkse kopieën dat bewaard blijft
const BK_PROP    = 'bk_laatste_geslaagd';  // ISO-datum van de laatste geslaagde kopie
const BK_MAX_OUD = 2;   // na hoeveel dagen zonder geslaagde kopie er alarm is

// Naam van de kopie van een gegeven dag. Puur → los testbaar.
function bk_naam(d) {
  return BK_PREFIX + Utilities.formatDate(d, 'Europe/Amsterdam', 'yyyy-MM-dd') + BK_STAART;
}

// Haalt de datum uit een back-upnaam. null bij een naam die niet EXACT past, zodat het
// opruimen nooit een vreemd bestand in de map kan raken. Puur → los testbaar.
function bk_datumUitNaam(naam) {
  const m = /^BACKUP Collectief Dashboard (\d{4}-\d{2}-\d{2}) — NIET BEWERKEN$/.exec(naam);
  return m ? m[1] : null;
}

// Welke back-updatums blijven bewaard: de laatste BK_DAGEN dagelijkse, plus per maand de
// OUDSTE kopie van de laatste BK_MAANDEN maanden.
// Bewust 'oudste per maand' en niet 'die van de 1e': een overgeslagen trigger-run zou
// anders een maand definitief zonder maandback-up laten. Puur → los testbaar.
function bk_teBewaren(datums) {
  const op = datums.slice().sort();          // ISO-datums sorteren lexicaal correct
  const houd = {};
  op.slice(-BK_DAGEN).forEach(function (d) { houd[d] = true; });
  const perMaand = {};
  op.forEach(function (d) {
    const maand = d.slice(0, 7);
    if (!perMaand[maand]) perMaand[maand] = d;   // eerste = oudste, want oplopend gesorteerd
  });
  Object.keys(perMaand).sort().slice(-BK_MAANDEN).forEach(function (m) { houd[perMaand[m]] = true; });
  return houd;
}

// Ruimt op binnen ÉÉN map, alleen bestanden waarvan de naam exact past, en alleen met
// setTrashed — nooit hard verwijderen. De prullenbak geeft nog 30 dagen genadetijd.
function bk_ruimOp(map) {
  const gevonden = [], datums = [];
  const it = map.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const d = bk_datumUitNaam(f.getName());
    if (!d) continue;                        // vreemd bestand → met rust laten
    gevonden.push({ file: f, datum: d });
    datums.push(d);
  }
  const houd = bk_teBewaren(datums);
  let weg = 0;
  gevonden.forEach(function (g) {
    if (!houd[g.datum]) { g.file.setTrashed(true); weg++; }
  });
  return weg;
}

// Dagelijkse trigger. BEWUST niet in een try/catch: een doorgegooide fout levert Google's
// eigen storingsmail aan de eigenaar op, en dat is hier het alarm. Het cd_safeRun-idioom
// uit het gebonden project slokt fouten op naar Logger.log — dat is precies wat je bij een
// back-up NIET wilt.
function bk_dagelijks() {
  const map = DriveApp.getFolderById(BK_MAP_ID);
  const nu = new Date();
  DriveApp.getFileById(BK_BRON_ID).makeCopy(bk_naam(nu), map);
  const weg = bk_ruimOp(map);
  PropertiesService.getScriptProperties()
    .setProperty(BK_PROP, Utilities.formatDate(nu, 'Europe/Amsterdam', 'yyyy-MM-dd'));
  Logger.log('Back-up gemaakt: ' + bk_naam(nu) + ' — ' + weg + ' oude kopie(ën) naar de prullenbak');
}

// Hartslag: gooit een fout als er te lang geen geslaagde kopie is geweest. Ook dit is
// bewust een throw — 'geen bericht is goed nieuws' is geen bewaking.
function bk_controleer() {
  const laatst = PropertiesService.getScriptProperties().getProperty(BK_PROP);
  if (!laatst) throw new Error('Back-up: er is nog nooit een geslaagde kopie gemaakt.');
  const dagen = Math.floor((Date.now() - new Date(laatst + 'T00:00:00Z').getTime()) / 86400000);
  if (dagen > BK_MAX_OUD) {
    throw new Error('Back-up: laatste geslaagde kopie is ' + dagen + ' dagen oud (' + laatst + ').');
  }
  Logger.log('Back-up in orde — laatste geslaagde kopie: ' + laatst);
}

// Installeert beide triggers. Verwijdert eerst alleen de EIGEN triggers, zodat een
// tweede aanroep geen dubbele oplevert. Logger.log i.p.v. een UI-alert: in een los
// (niet-gebonden) project bestaat SpreadsheetApp.getUi() niet.
function bk_installeerTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'bk_dagelijks' || f === 'bk_controleer') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('bk_dagelijks').timeBased().atHour(2).nearMinute(15).everyDays(1).create();
  ScriptApp.newTrigger('bk_controleer').timeBased().atHour(8).nearMinute(0).everyDays(1).create();
  Logger.log('Triggers geïnstalleerd: bk_dagelijks (02:15), bk_controleer (08:00)');
}

// Handmatige zelftest van de pure functies. Draai deze vóór bk_installeerTriggers.
function bk_test() {
  const d = new Date(2026, 6, 28);
  Logger.log('naam:           ' + bk_naam(d));                         // ...2026-07-28 — NIET BEWERKEN
  Logger.log('datum terug:    ' + bk_datumUitNaam(bk_naam(d)));        // 2026-07-28
  Logger.log('vreemde naam:   ' + bk_datumUitNaam('Kopie van iets'));  // null
  Logger.log('bijna-naam:     ' + bk_datumUitNaam(BK_PREFIX + '2026-07-28'));  // null (staart mist)
  // 20 opeenvolgende dagen: 14 blijven als dagelijkse, plus de oudste van die maand.
  const reeks = [];
  for (let i = 1; i <= 20; i++) reeks.push('2026-07-' + ('0' + i).slice(-2));
  const houd = Object.keys(bk_teBewaren(reeks)).sort();
  Logger.log('bewaard (21):   ' + JSON.stringify(houd));  // 2026-07-01 + 07-07 t/m 07-20
}
```

- [ ] **Stap 2: README schrijven**

```markdown
# apps-script-backup

Los Apps Script-project dat elke nacht een complete kopie van de PRODUCTIE-Sheet in een
aparte Drive-map zet.

**Rolt NIET automatisch uit.** De GitHub Action `apps-script-deploy.yml` triggert alleen op
`apps-script/**` en pusht alleen `rootDir: apps-script`. Deze map staat hier voor
versiebeheer; installeren gaat handmatig.

## Waarom een apart project

Het gebonden project (`apps-script/`) vraagt vandaag geen Drive-scope: er komt nergens
`DriveApp` of `openById` in voor, en `appsscript.json` heeft geen expliciete `oauthScopes`.
`DriveApp` daar toevoegen is dus een scope-uitbreiding → herautorisatie → en tot dát gebeurt
vallen `cd_checkDeadlines`, `cd_dailySummary`, `cd_sweepNotifQueue` en `cd_opvolgingMotor`
stil. Daarom staat de back-up buiten dat project.

## Scopes die dit project vraagt

- Drive (`makeCopy`, `setTrashed`, mappen lezen)
- Script-triggers
- Script Properties

## Installeren

1. script.google.com → Nieuw project → naam `Collectief Dashboard — Back-up`
2. Inhoud van `Backup.gs` plakken
3. `BK_MAP_ID` invullen met het id van de back-upmap
4. `bk_test` draaien en de log controleren
5. `bk_dagelijks` één keer handmatig draaien (autoriseren) en controleren dat er een kopie in de map staat
6. `bk_installeerTriggers` draaien

## Alarm

`bk_dagelijks` en `bk_controleer` vangen hun fouten bewust NIET af. Een mislukking levert
Google's eigen storingsmail aan de eigenaar op. Dat is het alarm — er is geen stil
Logger.log-vangnet zoals in het gebonden project.
```

- [ ] **Stap 3: Commit**

```bash
git add apps-script-backup/
git commit -m "Back-up: los Apps Script-project voor dagelijkse Drive-kopie met retentie"
```

### Taak 1.3: Back-upproject installeren en beproeven

**Files:** geen (handmatig in script.google.com)

- [ ] **Stap 1: Project aanmaken en code plakken**

Volg `apps-script-backup/README.md` stap 1-3. Vul `BK_MAP_ID` in met het id uit Taak 1.1.

- [ ] **Stap 2: `bk_test` draaien**

Verwacht in de log:
```
naam:           BACKUP Collectief Dashboard 2026-07-28 — NIET BEWERKEN
datum terug:    2026-07-28
vreemde naam:   null
bijna-naam:     null
bewaard (21):   ["2026-07-01","2026-07-07",...,"2026-07-20"]
```
Krijg je iets anders bij `vreemde naam` of `bijna-naam` dan `null`, **stop** — dan kan het opruimen vreemde bestanden raken.

- [ ] **Stap 3: `bk_dagelijks` handmatig draaien**

Autoriseer wanneer Google erom vraagt. Controleer daarna in de Drive-map dat er precies één
bestand staat met de naam van vandaag.

- [ ] **Stap 4: Nog een keer draaien en de retentie controleren**

Draai `bk_dagelijks` nog eens. Verwacht: **geen** tweede bestand van dezelfde dag met een
andere naam, en niets in de prullenbak — bij 2 kopieën is er nog niets om op te ruimen.

- [ ] **Stap 5: Triggers installeren**

Draai `bk_installeerTriggers`. Controleer in het klokje-menu dat er precies twee triggers staan.

### Taak 1.4: Herstel-oefening

**Files:** geen

> Stem het moment af met de gebruiker: deze oefening verandert tijdelijk de staging-omgeving.

- [ ] **Stap 1: Back-upkopie openen**

Open de nieuwste kopie uit de back-upmap. Controleer met eigen ogen: alle tabbladen aanwezig, vinkjes intact, kolombreedtes intact.

- [ ] **Stap 2: Staging tijdelijk laten wijzen naar de kopie**

Noteer eerst de huidige `SID_TEST` uit `src/config.js`. Vervang hem door het id van de back-upkopie, commit naar `staging`, en wacht tot de Vercel-testlink is bijgewerkt.

- [ ] **Stap 3: Controleren dat het dashboard werkt op de kopie**

Open de testlink, log in, en controleer: taken zichtbaar, ALV-overzicht gevuld, logboek gevuld. Dit is het bewijs dat een kopie een werkend dashboard oplevert.

- [ ] **Stap 4: Terugdraaien**

Zet `SID_TEST` terug op de oorspronkelijke waarde, commit naar `staging`, controleer dat de testlink weer op de test-Sheet draait.

- [ ] **Stap 5: Draaiboek schrijven**

Schrijf een herstel-draaiboek in gewone taal en zet het **in de back-upmap in Drive**, niet in de repo — de repo is openbaar en het draaiboek noemt script-id's en de overnameprocedure.

Inhoud: hoe je de nieuwste kopie herkent, hoe je hem hernoemt en op de plek van het origineel zet, welke twee waarden in `src/config.js` moeten wijzigen, en wie je belt als het misgaat.

### Taak 1.5: Tweede herstelweg — wekelijkse export

**Files:**
- Modify: `apps-script-backup/Backup.gs`

> **Beslispunt vooraf (openstaand punt 2 van de spec):** waar landt de export? Leg de
> gebruiker twee opties voor — (a) een tweede Drive-map van een ander account, (b) een
> e-mailbijlage naar `info@vvebeheercollectief.nl` zodat het bestand in de mailbox belandt.
> Optie (b) vraagt de extra scope `MailApp`. Bouw pas na die keuze.

De dagelijkse kopie beschermt tegen "bestand kapot of rijen weg". Deze export beschermt tegen
"Drive of account kwijt" — een tweede, onafhankelijke weg.

- [ ] **Stap 1: Exportfunctie toevoegen**

```javascript
// Wekelijkse XLSX-export als tweede, onafhankelijke herstelweg. Bewust een ANDER formaat en
// een ANDERE plek dan de dagelijkse kopie: die twee moeten niet aan dezelfde storing kunnen
// bezwijken. Ook hier geen try/catch — een mislukking hoort een storingsmail op te leveren.
function bk_wekelijkseExport() {
  const url = 'https://docs.google.com/spreadsheets/d/' + BK_BRON_ID + '/export?format=xlsx';
  const blob = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  }).getBlob().setName(bk_naam(new Date()).replace(BK_STAART, '') + '.xlsx');
  bk_exportAfleveren(blob);   // zie stap 2 — vorm hangt af van het beslispunt hierboven
  Logger.log('Export gemaakt: ' + blob.getName());
}
```

- [ ] **Stap 2: Aflevering invullen volgens de gekozen optie**

Optie (a), tweede Drive-map:

```javascript
const BK_EXPORT_MAP_ID = 'VUL_IN';
function bk_exportAfleveren(blob) {
  DriveApp.getFolderById(BK_EXPORT_MAP_ID).createFile(blob);
}
```

Optie (b), e-mail:

```javascript
function bk_exportAfleveren(blob) {
  MailApp.sendEmail({
    to: 'info@vvebeheercollectief.nl',
    subject: 'Wekelijkse back-up dashboard — ' + blob.getName(),
    body: 'Bijgevoegd de wekelijkse export van de dashboard-Sheet. Bewaren; niet openen om te bewerken.',
    attachments: [blob],
  });
}
```

- [ ] **Stap 3: Trigger toevoegen**

Breid `bk_installeerTriggers` uit:

```javascript
    if (f === 'bk_dagelijks' || f === 'bk_controleer' || f === 'bk_wekelijkseExport') ScriptApp.deleteTrigger(t);
```

en onderaan die functie:

```javascript
  ScriptApp.newTrigger('bk_wekelijkseExport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
```

- [ ] **Stap 4: Handmatig draaien en controleren**

Draai `bk_wekelijkseExport`, autoriseer de nieuwe scope, en controleer dat het bestand op de
gekozen plek staat en in Excel opent.

- [ ] **Stap 5: Commit**

```bash
git add apps-script-backup/
git commit -m "Back-up: wekelijkse XLSX-export als tweede herstelweg"
```

---

# FASE 2 — Eerlijke opslagstatus en veilig ongedaan maken

### Taak 2.1: `_writeStart` in de state

**Files:**
- Modify: `src/state.js`

- [ ] **Stap 1: Veld toevoegen**

In `src/state.js`, in het blok "schrijf-pijplijn", direct ná `_writeChain`:

```js
  _writeStart: null,       // tijdstip waarop de LOPENDE write echt begon (null = niets onderweg).
                           // Bewust niet gezet bij het in de wachtrij zetten: de wachtrij is serieel,
                           // dus een wachtende bulk-write zou anders meteen als 'vastgelopen' gelden.
```

- [ ] **Stap 2: Commit**

```bash
git add src/state.js
git commit -m "State: _writeStart voor de sluit-waarschuwing"
```

### Taak 2.2: `schrijfActieLoopt` — pure regel voor de sluit-waarschuwing

**Files:**
- Modify: `src/data.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende test**

In `src/tests.js`, bij de imports uit `./data.js` erbij: `schrijfActieLoopt`. Voeg daarna een testblok toe (na het bestaande `parseSections`-blok):

```js
  // ── schrijfActieLoopt: waarschuwen bij sluiten zolang er écht iets loopt. ──
  (()=>{
    const pendOud=state.pendingWrites, startOud=state._writeStart;
    try{
      state.pendingWrites=0; state._writeStart=null;
      eq('sluit: niets onderweg → geen waarschuwing', schrijfActieLoopt(1000), false);
      state.pendingWrites=1; state._writeStart=null;
      eq('sluit: in de wachtrij, nog niet begonnen → wél waarschuwen', schrijfActieLoopt(1000), true);
      state.pendingWrites=1; state._writeStart=1000;
      eq('sluit: net begonnen → waarschuwen', schrijfActieLoopt(1500), true);
      eq('sluit: 29s bezig → waarschuwen', schrijfActieLoopt(30000), true);
      eq('sluit: >30s bezig → vastgelopen, niet blokkeren', schrijfActieLoopt(32000), false);
    } finally { state.pendingWrites=pendOud; state._writeStart=startOud; }
  })();
```

- [ ] **Stap 2: Test draaien, moet falen**

Open `http://localhost:8899/index.html?test=1`. Verwacht: een importfout in de console (`schrijfActieLoopt` bestaat niet).

- [ ] **Stap 3: Implementeren**

In `src/data.js`, direct ná `backgroundWrite`:

```js
// Loopt er een schrijfactie die het sluiten van het tabblad zou moeten tegenhouden?
// Puur (nu meegegeven i.p.v. Date.now()) zodat de regel los testbaar is.
// De bovengrens vangt een vastgelopen write af: anders zou het tabblad nooit meer zonder
// waarschuwing te sluiten zijn. Hij telt vanaf het ECHTE begin van de write — een write die
// nog in de seriële wachtrij staat heeft _writeStart null en waarschuwt dus altijd.
const WRITE_VAST_MS = 30000;
function schrijfActieLoopt(nu){
  if(state.pendingWrites<=0) return false;
  if(state._writeStart && (nu - state._writeStart) > WRITE_VAST_MS) return false;
  return true;
}
```

Voeg `schrijfActieLoopt` toe aan de `export {...}` onderaan `src/data.js`.

- [ ] **Stap 4: Test draaien, moet slagen**

`window._testResult`: FAIL blijft 0, OK is met 5 gestegen ten opzichte van Taak 0.1.

- [ ] **Stap 5: Commit**

```bash
git add src/data.js src/tests.js
git commit -m "Schrijfzekerheid: pure regel schrijfActieLoopt + tests"
```

### Taak 2.3: Statusbalk vertelt de waarheid

**Files:**
- Modify: `src/data.js`

- [ ] **Stap 1: `setSaving` toevoegen en `setSynced` guarden**

In `src/data.js`, vervang de statusregels (nu regel 52-54):

```js
function setSyncing(){dot('loading');document.getElementById('sync-lbl').textContent='Laden…'}
function setSaving(){dot('loading');document.getElementById('sync-lbl').textContent='Opslaan…'}
// Guard: zolang er een schrijfactie loopt mag NIETS 'Live · HH:MM' over de 'Opslaan…'-stand
// heen zetten. Zonder deze regel liegt de balk opnieuw zodra iemand midden in een schrijfactie
// op Vernieuwen klikt (data.js keert dan vroegtijdig terug en riep setSynced aan).
function setSynced(){
  if(state.pendingWrites>0) return;
  dot('');
  document.getElementById('sync-lbl').textContent='Live · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  clearLoadError();
}
function setSyncErr(){dot('err');document.getElementById('sync-lbl').textContent='Fout'}
```

- [ ] **Stap 2: `backgroundWrite` laat de balk meelopen**

Vervang `backgroundWrite` in `src/data.js` door:

```js
function backgroundWrite(writeFn, rollback, foutTitel){
  state.pendingWrites++;
  setSaving();
  state._writeChain=state._writeChain.then(async()=>{
    state._writeStart=Date.now();   // pas hier begint deze write écht (de wachtrij is serieel)
    try{
      await _withRetry(writeFn);
    }catch(e){
      try{ rollback(); renderAll(); }catch(_){}
      const msg=(e.message||'').toLowerCase();
      if(e&&e.rowMismatch){
        showToast(foutTitel,'De lijst was net gewijzigd — opnieuw geladen, probeer nog eens.','var(--rd)');
      }else if(msg.includes('authentication')||msg.includes('unauthenticated')||msg.includes('unauthorized')){
        state.oauthToken=null;state.oauthExpiry=0;
        showToast(foutTitel,'Sessie verlopen — wijziging teruggezet. Probeer opnieuw.','var(--rd)');
      }else{
        showToast(foutTitel,'Niet opgeslagen — wijziging teruggezet.','var(--rd)');
      }
      console.error(foutTitel,e);
    }finally{
      state._writeStart=null;
      state.pendingWrites--;
      if(state.pendingWrites===0){ loadAll(true); } // stille resync van rij-indexen; zet ook de balk weer op Live
    }
  });
  return state._writeChain;
}
```

- [ ] **Stap 3: `setSaving` exporteren**

Voeg `setSaving` toe aan de `export {...}` onderaan `src/data.js`.

- [ ] **Stap 4: Tests draaien**

FAIL blijft 0. De bestaande `toggleAlvoFlag`-tests asserteren de `pendingWrites`-overgangen en moeten ongewijzigd slagen.

- [ ] **Stap 5: Commit**

```bash
git add src/data.js
git commit -m "Statusbalk: 'Opslaan…' tijdens schrijven, en Live kan er niet meer overheen"
```

### Taak 2.4: `metWriteMarkering` — de paden buiten `backgroundWrite` erbij

**Files:**
- Modify: `src/data.js`
- Modify: `src/notifications.js`, `src/bulk.js`, `src/render-overig.js`, `src/alv-reset.js`

- [ ] **Stap 1: Het omhulsel schrijven**

In `src/data.js`, direct ná `schrijfActieLoopt`:

```js
// Markeert een schrijfweg die NIET via backgroundWrite loopt als 'lopend'. Zonder dit zijn
// de gevaarlijkste paden (undo's, ALV-reset, Ontwikkeling) onzichtbaar voor de statusbalk,
// de sluit-waarschuwing én de poll-rem — en is een 'eerlijke' status alleen een
// geloofwaardiger onwaarheid.
// Fouten gaan ONGEMOEID door naar de aanroeper: die paden hebben hun eigen foutafhandeling.
async function metWriteMarkering(fn){
  state.pendingWrites++;
  setSaving();
  const eerder=state._writeStart;
  state._writeStart=Date.now();
  try{ return await fn(); }
  finally{
    state._writeStart=eerder;
    state.pendingWrites--;
    if(state.pendingWrites===0) setSynced();
  }
}
```

Voeg `metWriteMarkering` toe aan de `export {...}`.

- [ ] **Stap 2: De acht paden omhullen**

Per bestand: importeer `metWriteMarkering` uit `./data.js` en wikkel de body van het
`try`-blok erin. Bijvoorbeeld in `src/notifications.js` bij `undoComplete`:

```js
  state._undoInFlight = true; // pauzeer de 8s-poll; deze undo doet z'n eigen loadAll
  try {
    await metWriteMarkering(async () => {
      await state._writeChain;
      // ... bestaande body ongewijzigd ...
    });
  } catch(e) { alert('Undo fout: ' + e.message); }
  finally { state._undoInFlight = false; }
```

Doe hetzelfde bij: `undoDelete` (`src/notifications.js`), `bulkUndoAfronden` en
`bulkUndoVerwijderen` (`src/bulk.js`), `undoDeleteLog` en `undoOntwDelete` en
`submitOntwItem` (`src/render-overig.js`), en `doeReset` (`src/alv-reset.js`).

- [ ] **Stap 3: Handmatig controleren**

Open het dashboard lokaal. Rond een taak af en klik meteen op Ongedaan maken. Verwacht:
de statusbalk springt op `Opslaan…` en pas daarna terug op `Live · HH:MM`.

- [ ] **Stap 4: Tests draaien**

FAIL blijft 0. Let op de bestaande `doeReset`-tests: die asserteren het aantal
`batchUpdate`-verzoeken, niet de teller, en moeten ongewijzigd slagen.

- [ ] **Stap 5: Commit**

```bash
git add src/data.js src/notifications.js src/bulk.js src/render-overig.js src/alv-reset.js
git commit -m "Schrijfzekerheid: undo-, reset- en Ontwikkeling-paden onder de schrijfteller"
```

### Taak 2.5: Sluit-waarschuwing

**Files:**
- Modify: `src/main.js`

- [ ] **Stap 1: Listener toevoegen**

In `src/main.js`, bij de andere listeners (vóór het `setInterval`-blok van de poll), en met
`schrijfActieLoopt` erbij in de import uit `./data.js`:

```js
  // Waarschuw bij het sluiten zolang er een schrijfactie loopt. De browser toont zijn eigen,
  // niet-aanpasbare tekst; werkt op de desktop en op telefoon/PWA vrijwel niet.
  window.addEventListener('beforeunload', (e) => {
    if(!schrijfActieLoopt(Date.now())) return;
    e.preventDefault();
    e.returnValue = '';   // vereist door oudere browsers
  });
```

- [ ] **Stap 2: Handmatig controleren**

Open het dashboard, zet in DevTools → Network de snelheid op "Slow 3G", sla een taak op en
probeer het tabblad direct te sluiten. Verwacht: de browser vraagt om bevestiging.

- [ ] **Stap 3: Controleren dat hij níet onterecht afgaat**

Wacht tot de balk weer op `Live · HH:MM` staat en sluit het tabblad. Verwacht: geen vraag.

- [ ] **Stap 4: Commit**

```bash
git add src/main.js
git commit -m "Sluit-waarschuwing zolang er een schrijfactie loopt"
```

### Taak 2.6: Toast-opties — bevestiging die niet wordt ingeslikt

**Files:**
- Modify: `src/notifications.js`

- [ ] **Stap 1: `showToast` uitbreiden**

In `src/notifications.js`, vervang de kop van `showToast`:

```js
// opts: { geenDedup:true }        → sla de 15s-ontdubbeling over. Nodig voor opslagbevestigingen:
//                                   twee keer dezelfde taak opslaan binnen 15 s zou anders de
//                                   TWEEDE bevestiging inslikken, wat als 'mislukt' leest.
//       { geenSysteemmelding:true } → geen OS-notificatie als het venster niet in focus is.
//                                   Anders krijgt de gebruiker bij élke opslag met het venster
//                                   op de achtergrond een systeemmelding — precies het scenario
//                                   waarvoor de eerlijke status bedoeld is.
function showToast(title, msg, color, icoNaam, opts) {
  const o = opts || {};
  if (!o.geenDedup) {
    const key = title + '|' + msg;
    if (_shownToasts.has(key)) return;
    _shownToasts.add(key);
    setTimeout(() => _shownToasts.delete(key), TOAST_DEDUP_MS);
  }
```

En bij de systeemmelding verderop in dezelfde functie:

```js
  if (!o.geenSysteemmelding && 'Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
```

- [ ] **Stap 2: Tests draaien**

FAIL blijft 0 — alle bestaande aanroepen geven geen `opts` mee en gedragen zich exact als voorheen.

- [ ] **Stap 3: Commit**

```bash
git add src/notifications.js
git commit -m "Toast: opties om ontdubbeling en systeemmelding over te slaan"
```

### Taak 2.7: Bevestiging pas ná het opslaan

**Files:**
- Modify: `src/crud.js`, `src/snooze.js`, `src/render-herhaal.js`

Patroon om te kopiëren: `addTaskNote` (`src/render-overig.js`) schrijft eerst, controleert de
returnwaarde en toont pas daarna.

> **Alleen de kále bevestigingen verhuizen.** De undo-toasts blijven staan waar ze staan — die
> moeten meteen verschijnen, want de gebruiker moet erop kunnen klikken.

- [ ] **Stap 1: In `src/crud.js` de opslag-toast verplaatsen**

Bij `submitTask`: haal de `showToast('Opgeslagen', …)`-aanroep weg van vóór de write en zet
hem in de `writeFn`, ná de `writeRange`:

```js
        async ()=>{
          await assertRowMatch(doelRow._row, oudeWaarden.code);
          await writeRange(`'Nog Te Doen'!A${doelRow._row}:${endCol}${doelRow._row}`,values);
          showToast('Opgeslagen', code, 'var(--gn)', 'vink', {geenDedup:true, geenSysteemmelding:true});
        },
```

Doe hetzelfde voor `'Taak toegevoegd'` in dezelfde functie.

- [ ] **Stap 2: Idem in `src/snooze.js` en `src/render-herhaal.js`**

Verplaats daar de kale bevestigings-toasts op dezelfde manier naar ná de write, met dezelfde
`{geenDedup:true, geenSysteemmelding:true}`.

- [ ] **Stap 3: Handmatig controleren**

Zet Network op "Slow 3G", bewerk een taak en sla op. Verwacht: de rij verandert meteen
(optimistisch), de balk zegt `Opslaan…`, en de groene bevestiging komt pás als de balk terug
op `Live` springt. Sla dezelfde taak twee keer snel achter elkaar op: **twee** bevestigingen.

- [ ] **Stap 4: Tests draaien**

FAIL blijft 0.

- [ ] **Stap 5: Commit**

```bash
git add src/crud.js src/snooze.js src/render-herhaal.js
git commit -m "Bevestiging pas na het opslaan, niet ervoor"
```

### Taak 2.8: Ongedaan maken wordt onbreekbaar

**Files:**
- Modify: `src/notifications.js`

Vandaag verwijdert `undoComplete` éérst de regel uit `Afgerond` en zet hem dán terug in
`Nog Te Doen`. Valt de verbinding daartussen weg, dan staat de taak in **geen van beide**
lijsten. Omgekeerd is een dubbele regel het ergste dat kan gebeuren — zichtbaar en
herstelbaar.

- [ ] **Stap 1: Volgorde omdraaien in `undoComplete`**

Vervang in `src/notifications.js` het blok binnen `undoComplete` dat begint bij `const doelAf`
door:

```js
    const doelAf = afData.find(x => x.code === undoData.code) || null;
    // EERST terugzetten, DAN pas weghalen. Breekt de verbinding ertussen, dan staat de taak
    // dubbel (zichtbaar, herstelbaar) in plaats van nergens (onzichtbaar, verloren).
    const insertRow = getInsertRow(sec);
    await insertAndWriteRow('Nog Te Doen', insertRow, ntdValues);
    if (doelAf) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.oauthToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: afId, dimension: 'ROWS', startIndex: doelAf._row - 1, endIndex: doelAf._row } } }] })
      });
    }
```

Verwijder de oude, nu dubbele `const insertRow` / `insertAndWriteRow`-regels die daaronder stonden.

- [ ] **Stap 2: `bulkUndoAfronden` op dezelfde manier omdraaien**

In `src/bulk.js`: zet de her-invoeg-lus vóór de `deleteDimension` op `Afgerond`.

- [ ] **Stap 3: Handmatig controleren**

Rond een taak af, klik Ongedaan maken. Verwacht: taak terug in `Nog Te Doen`, weg uit
`Afgerond`, één logregel `Teruggezet`.

- [ ] **Stap 4: Onderbreking simuleren**

Zet in DevTools → Network op "Offline" direct nadat de her-invoeging is gelukt (zichtbaar in
het Network-paneel) en klik Ongedaan maken. Verwacht: foutmelding, en de taak staat **dubbel**
— niet weg. Ruim de dubbele daarna handmatig op.

- [ ] **Stap 5: Commit**

```bash
git add src/notifications.js src/bulk.js
git commit -m "Ongedaan maken: eerst terugzetten, dan weghalen (nooit meer uit beide lijsten weg)"
```

### Taak 2.9: `logEvent` afwachten

**Files:**
- Modify: `src/crud.js`, `src/bulk.js`, `src/snooze.js`, `src/render-herhaal.js`, `src/render-alv.js`, `src/kenmerken.js`, `src/notifications.js`, `src/alv-reset.js`

Zolang `logEvent` niet wordt afgewacht, valt de teller naar 0 en start de resync terwijl de
logboek-append nog loopt. "Klaar" komt dan structureel te vroeg en een logregel kan stil wegvallen.

- [ ] **Stap 1: Alle niet-ge-awaite aanroepen zoeken**

```bash
grep -rn "  logEvent(\|^ *logEvent(" src/*.js | grep -v await | grep -v tests.js
```

Verwacht 15 treffers, verdeeld over: `alv-reset.js`, `bulk.js`, `crud.js` (4×),
`kenmerken.js`, `notifications.js` (2×), `render-herhaal.js` (4×), `render-alv.js`, `snooze.js`.

- [ ] **Stap 2: Per treffer `await` ervoor zetten**

Controleer per plek dat de omliggende functie `async` is (dat is overal het geval binnen een
`writeFn`). Voorbeeld in `src/crud.js`:

```js
        await logEvent(r.code, sec, 'Afgerond', 'status', 'Nog Te Doen', 'Afgerond op ' + today + (comment ? ' — ' + comment : ''));
```

- [ ] **Stap 3: Grep opnieuw draaien**

```bash
grep -rn "  logEvent(\|^ *logEvent(" src/*.js | grep -v await | grep -v tests.js
```

Verwacht: geen treffers.

- [ ] **Stap 4: Tests draaien**

FAIL blijft 0. Handmatig: rond een taak af en controleer dat de logregel op de Logboek-pagina
verschijnt.

- [ ] **Stap 5: Commit**

```bash
git add src/
git commit -m "Logboek: logEvent overal afwachten zodat 'klaar' niet te vroeg komt"
```

### Taak 2.10: Formule-rem op de laatste schrijfweg

**Files:**
- Modify: `src/bulk.js`

`veiligeCel` zit alleen in `writeRange`/`appendRange`. De `values:batchUpdate`-route in
`src/bulk.js` gebruikt óók `USER_ENTERED` maar loopt erlangs.

- [ ] **Stap 1: `_veiligeRij` toepassen**

In `src/bulk.js`, bij de `values:batchUpdate`-aanroep (rond regel 289), en met `_veiligeRij`
erbij in de import uit `./api.js`: wikkel elke `values`-rij in `_veiligeRij(...)`.

- [ ] **Stap 2: Test toevoegen**

In `src/tests.js`, bij het bestaande `veiligeCel`-blok:

```js
      eq('bulk-batchUpdate: formule wordt tekst', _veiligeRij(['=SOM(A1:A9)','gewoon']), ["'=SOM(A1:A9)",'gewoon']);
```

- [ ] **Stap 3: Tests draaien**

FAIL blijft 0, OK +1.

- [ ] **Stap 4: Commit**

```bash
git add src/bulk.js src/tests.js
git commit -m "Formule-rem ook op de bulk-batchUpdate-route"
```

### Taak 2.11: Fase 2 uitrollen

- [ ] **Stap 1: Versies ophogen**

`src/config.js`: `APP_VERSION = '9.3'`. `sw.js`: `CACHE_VERSION = 'cd-v88'`.

- [ ] **Stap 2: Volledige testronde**

`?test=1` lokaal. FAIL = 0.

- [ ] **Stap 3: Naar staging**

```bash
git add src/config.js sw.js
git commit -m "Versie 9.3 / cd-v88: eerlijke opslagstatus en onbreekbaar ongedaan maken"
git push -u origin feature/opslag-hardening
git checkout staging && git merge feature/opslag-hardening && git push
```

- [ ] **Stap 4: Op staging testen**

Open de Vercel-testlink met `?test=1`, controleer `window._testResult`. Daarna handmatig:
opslaan, ongedaan maken, sluit-waarschuwing.

- [ ] **Stap 5: Naar productie**

```bash
git checkout main && git merge staging && git push
```

Controleer daarna op de echte Pages-URL dat het versienummer 9.3 toont.

---

# FASE 3 — Structuurbewaking

### Taak 3.1: Pure structuurcontroles

**Files:**
- Create: `src/structuurcheck.js`
- Test: `src/tests.js`

- [ ] **Stap 1: Schrijf de falende tests**

In `src/tests.js`, met `import { checkSecties, checkRaster, RASTER_MIN } from "./structuurcheck.js";` erbij:

```js
  // ── structuurcheck: waarnemend, mag nooit vals alarm geven op gezonde data. ──
  (()=>{
    const gezond=[['OPPAKKEN'],['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen'],
                  ['311198','VvE A','iets','','Jer','','']];
    eq('structuur: gezonde sectie → geen bevindingen', checkSecties(gezond).length, 0);

    const verdwaald=[['OPPAKKEN'],['311198','VvE A','iets','','Jer','',''],
                     ['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen']];
    eq('structuur: datarij op de kolomkoprij → 1 bevinding', checkSecties(verdwaald).length, 1);
    eq('structuur: bevinding noemt het regelnummer', checkSecties(verdwaald)[0].regel, 2);

    eq('structuur: leeg blad is GEEN bevinding', checkSecties([]).length, 0);

    eq('structuur: raster breed genoeg', checkRaster('Afgerond', 26), null);
    eq('structuur: raster te smal', checkRaster('Afgerond', 8).nodig, 12);
    eq('structuur: onbekend tabblad → geen oordeel', checkRaster('Iets anders', 1), null);
  })();
```

- [ ] **Stap 2: Test draaien, moet falen**

Verwacht: importfout, `structuurcheck.js` bestaat niet.

- [ ] **Stap 3: Implementeren**

Maak `src/structuurcheck.js`:

```js
// ══════════════════════════════════════
//  STRUCTUURCHECK — waarnemend, nooit blokkerend
// ══════════════════════════════════════
// Doel: structurele beschadiging van de opslag vroeg zien in plaats van pas als het
// dashboard "raar doet". Deze module schrijft NIETS en raakt geen enkele schrijfweg —
// hij kan per definitie geen taak of vinkje kwijtmaken.
//
// Bewust NIET gecontroleerd:
//  - Sectie-VOLGORDE. 'Afgerond' zet OPPAKKEN, VERGADERVERZOEKEN, LOD, OFFERTE-TRAJECTEN
//    terwijl SKEYS OFFERTE-TRAJECTEN vóór LOD zet. Volgorde meenemen zou vanaf dag één
//    vals alarm geven op een verschil dat bewust bestaat.
//  - "Leeg tabblad". fetchSheets geeft [] terug voor een leeg ÉN voor een ontbrekend
//    tabblad, en vier tabbladen worden met .catch(()=>[]) afgevangen. Leeg is dus geen
//    bewijs van schade.
import { SKEYS, SECS } from "./config.js";

// Minimale rasterbreedte per tabblad, afgeleid uit de breedste schrijfactie op elk blad.
// Bij elke wijziging: eerst de callsite opzoeken, dan dit getal aanpassen.
const RASTER_MIN = {
  'Nog Te Doen':      16,  // kolom P (offerte-aannemers)
  'Afgerond':         12,  // A:L — NIET 16
  'Herhaalregels':    12,  // A:L
  'Kenmerken':         6,  // A:F
  'Ontwikkeling':      6,  // A:F
  'Logboek':           8,  // A:H
  'Notif-wachtrij':    4,  // A:D
  "ALV's overzicht":   7,  // t/m Klaargezet (G)
  "ALV's afgerond":    3,
};

// Is deze rij een sectiekop? Zelfde herkenning als parseSections: kolom A bevat een
// sectienaam en de rest van de rij is leeg.
const isSectieKop = (r) => SKEYS.includes(((r&&r[0])||'').trim().toUpperCase())
                        && !((r&&r[1])||'').trim();

// Is deze rij de kolomkoprij? Herkend aan de vaste eerste cel.
const isKolomKop = (r) => ((r&&r[0])||'').trim().toLowerCase()==='vve code';

// Controleert de sectiestructuur van een 'Nog Te Doen'/'Afgerond'-achtig blad.
// Geeft een lijst bevindingen terug: [{regel, sectie, tekst}]. Lege lijst = in orde.
// Regelnummers zijn 1-gebaseerd, zoals in de Sheet.
function checkSecties(rows){
  const uit=[];
  if(!rows || !rows.length) return uit;   // leeg is geen bewijs van schade
  for(let i=0;i<rows.length;i++){
    if(!isSectieKop(rows[i])) continue;
    const sectie=((rows[i][0])||'').trim().toUpperCase();
    const volgende=rows[i+1];
    if(!volgende) continue;               // sectiekop onderaan het blad: niets te zeggen
    if(!isKolomKop(volgende)){
      uit.push({
        regel: i+2,                       // +1 voor 0-index, +1 omdat we de rij ná de kop bekijken
        sectie,
        tekst: `Regel ${i+2} staat op de plek van de kolomkoppen van ${SECS[sectie]?.label||sectie}. `
             + `Deze regel is daardoor onzichtbaar in het dashboard.`,
      });
    }
  }
  return uit;
}

// Is dit tabblad breed genoeg om naar te schrijven? null = in orde of onbekend tabblad.
// Een onbekend tabblad krijgt bewust GEEN oordeel: reset-archieven en back-uptabbladen
// horen hier niet in.
function checkRaster(tabblad, kolommen){
  const nodig=RASTER_MIN[tabblad];
  if(!nodig) return null;
  if(kolommen>=nodig) return null;
  return { tabblad, nodig, gevonden: kolommen,
           tekst: `Tabblad '${tabblad}' is ${kolommen} kolommen breed, er zijn er ${nodig} nodig. `
                + `Schrijfacties naar de laatste kolommen mislukken zonder melding.` };
}

export { checkSecties, checkRaster, RASTER_MIN, isSectieKop, isKolomKop };
```

- [ ] **Stap 4: Test draaien, moet slagen**

FAIL blijft 0, OK +7.

- [ ] **Stap 5: Module in de app-shell**

Voeg `'./src/structuurcheck.js',` toe aan `APP_SHELL` in `sw.js`, bij de andere modules.

- [ ] **Stap 6: Commit**

```bash
git add src/structuurcheck.js src/tests.js sw.js
git commit -m "Structuurcheck: pure controles op sectiestructuur en rasterbreedte"
```

### Taak 3.2: Meekijken zonder te tonen

**Files:**
- Modify: `src/data.js`

Eerst een periode alleen naar de console. Pas een zichtbare melding zodra het aantal
bevindingen op gezonde data aantoonbaar nul is — anders leert de gebruiker hem negeren.

- [ ] **Stap 1: Aanroep in `loadAll`**

In `src/data.js`, in `loadAll`, direct ná `D.af=afP.data;`:

```js
    // Fase 3, trap 1: alleen meekijken. Zodra dit een tijd lang stil blijft op gezonde data
    // gaat de banner aan (trap 2). Nooit blokkerend — dit mag het laden niet beïnvloeden.
    try{
      const bev=[...checkSecties(ntdR), ...checkSecties(afR)];
      if(bev.length) console.warn('[structuurcheck]', bev);
    }catch(e){ console.warn('[structuurcheck] overgeslagen:', e.message); }
```

Met `import { checkSecties } from "./structuurcheck.js";` bovenaan.

- [ ] **Stap 2: Handmatig controleren op live data**

Open het dashboard, kijk in de console. **Verwacht na fase 0: geen enkele bevinding.** Staat
er wél iets, dan is fase 0 taak 0.4 niet volledig afgerond — dat eerst uitzoeken.

- [ ] **Stap 3: Tests draaien**

FAIL blijft 0.

- [ ] **Stap 4: Commit**

```bash
git add src/data.js
git commit -m "Structuurcheck: meekijken in de console (trap 1)"
```

### Taak 3.3: Fase 3 uitrollen en observeren

- [ ] **Stap 1: Versies ophogen**

`APP_VERSION = '9.4'`, `CACHE_VERSION = 'cd-v89'`.

- [ ] **Stap 2: Uitrollen via staging naar main**

Zelfde route als Taak 2.11.

- [ ] **Stap 3: Twee weken observeren**

Vraag de gebruiker of er in de console iets verschijnt. **Pas daarna** de banner aanzetten
(aparte, latere taak — die staat bewust niet in dit plan, omdat de drempel afhangt van wat
deze observatie oplevert).

---

# FASE 4 — Vast taaknummer *(bewust grover)*

> **Deze fase wordt uitgeschreven zodra fase 0 en 1 live zijn.** De trigger-inventarisatie uit
> Taak 0.2 bepaalt of er rijen buiten het dashboard om verschuiven, en de proef hieronder
> bepaalt het mechanisme. Stappen op papier zetten vóór die twee uitkomsten bekend zijn, zou
> precies het soort aanname zijn dat dit traject probeert uit te bannen.

**Voorwaarden voordat deze fase begint:**
- Fase 1 is live én de herstel-oefening (Taak 1.4) is gedaan
- Taak 0.2 is afgerond en in `apps-script/README.md` vastgelegd

**Taak 4.1 — Proefopstelling (1 dag, op de TEST-Sheet).** Twee mechanismen naast elkaar:
een verborgen kolom Q, en DeveloperMetadata op de rij-dimensie. Meten: overleeft het nummer
een `insertDimension`, een `deleteDimension`, een handmatige sortering, en een handmatig
geplakte rij? Uitkomst aan de gebruiker voorleggen vóór er iets gebouwd wordt.

**Taak 4.2 — Tussenmaatregel: bredere guard.** `assertRowsMatch` vergelijkt nu alleen kolom A.
Verbreden naar de bestaande serialisatie `serializeNtdUndo`/`_ntdValues` (A..P — dezelfde die
`_herankerRij` al gebruikt en die al getest is), met normalisatie van: ontbrekende cellen → `''`
(`values.get` kapt afsluitende lege cellen én lege rijen af), `'TRUE'`/`'FALSE'`-erfenis, en
datumkolommen via `_parseAnyDate` in plaats van tekstueel (het dashboard schrijft `17-06-2026`,
`values.get` geeft `17 juni 2026` terug). **18 callsites in 9 bestanden** — elke aanroeper
bouwt zijn eigen `{row, code}`-object, dus elke callsite moet mee.

*Eerlijk over de grens:* een vingerafdruk-guard die matcht, schrijft. Bij écht identieke regels
doet hij dat fout, stil. Dit is een tussenmaatregel, geen eindstation.

**Taak 4.3 — Het gekozen mechanisme invoeren**, met migratie op de TEST-Sheet vóór PROD.

---

# FASE 5 — Leeslast en offline *(bewust grover)*

> **Wordt uitgeschreven na fase 4.** Gelaagd ophalen verlengt het TOCTOU-venster op de trage
> tabbladen van 8 naar 60 seconden; dat is pas verantwoord zodra de identiteit van een regel
> vaststaat.

**Taak 5.1 — Gelaagd ophalen.**
Snelle groep (8 s): `Nog Te Doen`, `ALV's overzicht`, **`Afgerond`**. Afgerond hoort er
nadrukkelijk bij — het is het enige tabblad met een positionele `deleteDimension` zónder
rij-guard, en met ~224 gevulde regels kost het niets.
Trage groep (60 s): `ALV's afgerond`, `Ontwikkeling`, `Logboek`, `Herhaalregels`, `Kenmerken`.
Uitpakken **op naam, niet op index**; een overgeslagen tabblad **behoudt** zijn vorige data.
Let op de bestaande test-stub die een hardgecodeerde array van acht `valueRanges` teruggeeft.

**Taak 5.2 — Incrementeel staart-lezen van het Logboek.** Volledig bij start, daarna alleen
nieuwe regels. Ontdubbeling tegen de optimistische regels met `_row: 0` is een ontwerpeis,
geen testpunt achteraf.

**Taak 5.3 — Zichtbare offline-toestand.** Blokkeren vóór de optimistische mutatie.
Signaal: `navigator.onLine === false` plus een **eigen** netwerkteller die na elke geslaagde
read op 0 gaat — uitdrukkelijk **niet** `state._syncFails`, die telt ook mislukte inlogpogingen,
401/403 en quota-fouten en zou het dashboard in een quotum-incident op slot zetten.
Inventarisatie via `grep -rn "writeRange\|appendRange\|batchUpdate" src/*.js`, niet via
`ensureToken` — drie schrijfwegen hebben die guard helemaal niet. Twee plekken muteren vóór
de guard en moeten omgedraaid (`src/offerte-aannemers.js`, `src/kenmerken.js`).

**Taak 5.4 — Leescache (pas na de meting uit Taak 0.1).** Sleutel gekoppeld aan `APP_VERSION`
én aan het e-mailadres; `logout()` wist hem. `ntdSecInfo`/`afSecInfo` moeten mee (zonder die
twee valt de invoegpositie terug op regel 2 en belandt een nieuwe taak bovenaan `Nog Te Doen`
in plaats van in zijn sectie). De logboeklijst niet hersorteren of ontdubbelen: `_row` houdt
bewust de ruwe Sheet-index.

---

## Zelfcontrole van dit plan

- **Spec-dekking:** fase 0 → taken 0.1-0.4; fase 1 → 1.1-1.5; fase 2 → 2.1-2.11; fase 3 →
  3.1-3.3; fase 4 en 5 → bewust grof, met de voorwaarden expliciet. De "bewust niet"-tabel uit
  de spec leidt tot geen taken, zoals bedoeld.
- **Bewust buiten dit plan:** de dagelijkse Apps Script-structuurcontrole — de spec stelt die
  expliciet uit tot ná fase 3, omdat de melding zonder frontend-wijziging bij niemand aankomt.
  En de zichtbare structuurbanner (trap 2 van fase 3): de drempel daarvoor hangt af van wat de
  observatie in Taak 3.3 oplevert.
- **Twee beslispunten die de gebruiker moet beantwoorden vóór de betreffende taak:** de
  bestemming van de wekelijkse export (Taak 1.5) en het mechanisme voor het taaknummer
  (Taak 4.1).
- **Naamconsistentie:** `metWriteMarkering`, `schrijfActieLoopt`, `setSaving`, `_writeStart`,
  `checkSecties`, `checkRaster`, `RASTER_MIN` — overal identiek gebruikt.
