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

# FASE 4 — Vast taaknummer

**Doel:** de rij-POSITIE is niet langer de identiteit van een taak.

**Voorwaarden — beide afgevinkt op 2026-07-29:**
- Fase 1 is live én de herstel-oefening (Taak 1.4) is gedaan ✅
- Taak 0.2 is afgerond en vastgelegd in `apps-script/README.md` ✅

### Wat Taak 0.2 heeft opgeleverd, en waarom dat deze fase stuurt

De trigger-inventarisatie was de voorwaarde omdat hij bepaalt of er rijen buiten het dashboard
om verschuiven. De uitkomst is scherper dan verwacht en verdeelt alle mutaties in twee soorten:

| Soort | Wat er beweegt | Wie doet dat |
|---|---|---|
| **Rij-dimensie** | de hele rij schuift; alles wat eraan hangt schuift mee | `insertDimension`/`deleteDimension` (dashboard, `src/crud.js:132` e.v.), `insertRowBefore`/`deleteRow` (`verplaatsAfgerond`, `cd_createTaskRow`), handmatig rij invoegen/verwijderen |
| **Waarden binnen een bereik** | de celwaarden verspringen, de rij blijft fysiek staan | `sorteerOfferteTrajecten` (`apps-script/Code.gs:207/222/237/252`), handmatig sorteren, handmatig knippen/plakken |

Op de eerste soort is elk merkteken bestand. Op de tweede soort in beginsel géén van beide —
en dát is de hele mechanismekeuze. Er is precies **één** plek in het hele systeem waar waarden
los van hun rij bewegen: `sorteerOfferteTrajecten`, die per sectieblok sorteert met
`getRange(start, 1, rijen, 9)` — **negen kolommen, A t/m I**, terwijl de rijen tot en met P
gevuld zijn. Die trigger staat op PROD geïnstalleerd. Hij ligt in de praktijk stil (Sheets-API-
writes vuren geen `onEdit`), maar wordt wakker zodra iemand met de hand in `Nog Te Doen` typt.

*Dit is geen nieuw risico dat fase 4 introduceert.* Kolom K t/m P raken vandaag al los van hun
taak bij elke handmatige bewerking — `apps-script/README.md` waarschuwt daar al voor. Fase 4
maakt die bestaande scheur alleen zichtbaar, en biedt de kans hem te dichten.

### Wat het onderzoek heeft vastgesteld — en wat bewust ongemeten bleef

Gemeten in de code en in de officiële Sheets-documentatie:

- **PROD `Nog Te Doen` is exact 16 kolommen breed** (gemeten 2026-07-28, vastgelegd in
  `src/structuurcheck.js:19-21`). Kolom Q past er nu **niet** in. **De TEST-Sheet is 17 kolommen
  breed en heeft in Q al overal `FALSE` staan** (geërfde selectievakje-validatie). TEST is op dit
  punt dus géén getrouwe afspiegeling van PROD — reken daarop bij de proef.
- **De leesweg haalt hele tabbladen op**, zonder kolombegrenzing (`src/api.js:18-31`, `POLL_TABS`
  bevat kale tabbladnamen). Een kolom Q komt dus gratis mee in elke poll; DeveloperMetadata komt
  níét mee en kost een tweede verzoek (7,5 → 15 leesverzoeken/minuut, ruim binnen het quotum van 60).
- **DeveloperMetadata schuift gedocumenteerd mee** bij invoegen en verdwijnt mee bij verwijderen
  (developerMetadata-reference: *"…it will remain associated at those locations as they move
  around"*).
- **Sorteren en knippen/plakken zijn NIET gedocumenteerd.** Het woord *sort* komt nul keer voor in
  de developerMetadata-reference. Precies de twee scenario's die er hier toe doen, zijn de twee
  die Google niet beschrijft.
- **`makeCopy` en metadata: geen enkele bron gevonden.** Dat is een open risico voor de back-up
  uit fase 1 — kopiëren de nummers niet mee, dan is herstel uit back-up een herstel zónder
  identiteit.
- **`values.batchUpdateByDataFilter` laat je schrijven zonder de rij-index te kennen.** Dat is de
  eigenlijke winst van mechanisme (b): op die paden wordt `assertRowMatch` overbodig in plaats van
  breder. Let op: waarden landen vanaf kolom A, dus één kolom schrijven kan alleen met de
  `null`-truc (*"Null values will be skipped"*).

Daarom blijft Taak 4.1 staan en kan hij niet door documentatie-onderzoek worden vervangen.
Formuleer hem als **meten omdat het ongedocumenteerd is**, niet als "even controleren".

---

### Taak 4.1: Proefopstelling — welk merkteken blijft bij zijn taak?

**Files:**
- Create: `docs/superpowers/proeven/2026-07-29-fase4-rij-identiteit.md` *(uitkomst)*

De proef draait op een **wegwerp-tabblad** in de TEST-Sheet, niet op `Nog Te Doen`. Elke meting
begint met een vers tabblad, zodat de metingen elkaar niet kunnen vervuilen. `Nog Te Doen`,
`Afgerond` en alle andere tabbladen blijven onaangeraakt.

De meetmatrix — twee mechanismen tegen zes bewerkingen plus twee erfenisvragen:

| | Bewerking | Waarom die |
|---|---|---|
| O1 | `insertDimension` bóven de rij, `inheritFromBefore:true` | wat het dashboard doet bij een nieuwe taak (`src/crud.js:132`) |
| O2 | `deleteDimension` bóven de rij | afronden en verwijderen |
| O3 | `sortRange` over **A:I** | exact wat `sorteerOfferteTrajecten` doet |
| O4 | `sortRange` over **A:Q** | de mogelijke reparatie: sorteerbereik verbreden |
| O5 | `cutPaste` van een hele rij | de handmatige val die Taak 0.4 moest opruimen |
| O6 | bestandskopie via Drive | de back-up uit fase 1 — overleeft identiteit een herstel? |
| H1 | erft een ingevoegde rij de **Q-waarde** van de rij erboven? | zo ja → twee taken met hetzelfde nummer |
| H2 | erft een ingevoegde rij de **metadata** van de rij erboven? | idem |

- [ ] **Stap 1: Proefscript draaien op het staging-dashboard**

Open het **staging**-dashboard (dat draait op `SID_TEST`), log in, en plak onderstaand script in
de console. Het gebruikt het OAuth-token dat de app al heeft — geen nieuwe scope, geen nieuw
Apps Script-project.

```js
// ══ PROEF FASE 4 — welk merkteken blijft bij zijn taak? ══
// Draaien in de console van het STAGING-dashboard (ingelogd) → werkt op SID_TEST.
// Raakt geen enkel bestaand tabblad aan: alles gebeurt op een wegwerp-tabblad.
const { state } = await import('./src/state.js');
const { SID }   = await import('./src/config.js');
const TAB = 'PROEF-fase4', SLEUTEL = 'proef_tid', RIJEN = 8;

const H = () => ({ Authorization: 'Bearer ' + state.oauthToken, 'Content-Type': 'application/json' });
const api = async (pad, body) => {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}${pad}`,
    body ? { method:'POST', headers:H(), body:JSON.stringify(body) } : { headers:H(), cache:'no-store' });
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(pad + ' → ' + (j.error?.message || r.status));
  return j;
};
const bu = reqs => api(':batchUpdate', { requests: reqs });

let SH = null;
// Verse grondtoestand: tabblad weggooien en opnieuw opbouwen. Zo start elke meting gegarandeerd
// schoon — óók qua metadata, want die verdwijnt mee met het tabblad.
async function grondtoestand(){
  const meta = await api('?fields=sheets.properties.sheetId,sheets.properties.title');
  const oud = (meta.sheets||[]).find(s => s.properties.title === TAB);
  if (oud) await bu([{ deleteSheet: { sheetId: oud.properties.sheetId } }]);
  const gem = await bu([{ addSheet: { properties: { title: TAB, gridProperties: { rowCount: 40, columnCount: 20 } } } }]);
  SH = gem.replies[0].addSheet.properties.sheetId;

  const waarden = [];
  for (let i = 1; i <= RIJEN; i++) {
    const rij = new Array(17).fill('');
    rij[0]  = 'V' + i;        // A — staat voor de VvE-code (wat de guard vandaag leest)
    rij[2]  = 'taak-' + i;    // C — de tekst waarop gesorteerd wordt
    rij[16] = 'Q' + i;        // Q — kandidaat (a): verborgen kolom
    waarden.push(rij);
  }
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/values/`
            + encodeURIComponent(`${TAB}!A1:Q${RIJEN}`) + '?valueInputOption=RAW',
    { method:'PUT', headers:H(), body:JSON.stringify({ values: waarden }) });

  // kandidaat (b): DeveloperMetadata op de RIJ-dimensie. DOCUMENT-zichtbaarheid, want Apps Script
  // draait in een ánder Cloud-project dan het dashboard en moet er straks ook bij kunnen.
  await bu(Array.from({ length: RIJEN }, (_, i) => ({
    createDeveloperMetadata: { developerMetadata: {
      metadataKey: SLEUTEL, metadataValue: 'M' + (i + 1), visibility: 'DOCUMENT',
      location: { dimensionRange: { sheetId: SH, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } },
    }},
  })));
}

// Meting: hoort elk merkteken nog bij zijn éigen taak? Rij 'V3' hoort Q3 en M3 te dragen.
async function meet(naam){
  const v  = (await api('/values/' + encodeURIComponent(`${TAB}!A1:Q40`))).values || [];
  const md = (await api('/developerMetadata:search',
               { dataFilters: [{ developerMetadataLookup: { metadataKey: SLEUTEL } }] })
             ).matchedDeveloperMetadata || [];
  const perRij = {};
  md.forEach(m => { const s = m.developerMetadata?.location?.dimensionRange?.startIndex;
                    if (s != null) perRij[s] = m.developerMetadata.metadataValue; });

  let qGoed = 0, mGoed = 0, n = 0; const regels = [];
  v.forEach((r, i) => {
    const a = (r[0] || '').trim();
    if (!/^V\d+$/.test(a)) return;
    n++;
    const nr = a.slice(1), q = (r[16] || '').trim(), m = perRij[i] || '';
    if (q === 'Q' + nr) qGoed++;
    if (m === 'M' + nr) mGoed++;
    regels.push(`rij ${String(i+1).padStart(2)}: ${a} ${(r[2]||'').padEnd(8)}`
              + ` Q=${(q||'—').padEnd(3)}${q === 'Q'+nr ? '✓' : '✗'}`
              + `  meta=${(m||'—').padEnd(3)}${m === 'M'+nr ? '✓' : '✗'}`);
  });
  console.log(`\n══ ${naam} ══  kolom Q: ${qGoed}/${n} correct · metadata: ${mGoed}/${n} correct`);
  regels.forEach(x => console.log('   ' + x));
  return { meting: naam, rijen: n, kolomQ: `${qGoed}/${n}`, metadata: `${mGoed}/${n}` };
}

const uit = [];
await grondtoestand();                       uit.push(await meet('O0 · grondtoestand'));

await grondtoestand();
await bu([{ insertDimension: { range: { sheetId: SH, dimension:'ROWS', startIndex: 3, endIndex: 4 }, inheritFromBefore: true } }]);
uit.push(await meet('O1 · rij invoegen boven rij 4 (+H1/H2: erft de nieuwe rij iets?)'));

await grondtoestand();
await bu([{ deleteDimension: { range: { sheetId: SH, dimension:'ROWS', startIndex: 2, endIndex: 3 } } }]);
uit.push(await meet('O2 · rij 3 verwijderen'));

await grondtoestand();
await bu([{ sortRange: { range: { sheetId: SH, startRowIndex: 0, endRowIndex: RIJEN, startColumnIndex: 0, endColumnIndex: 9 },
                         sortSpecs: [{ dimensionIndex: 2, sortOrder: 'DESCENDING' }] } }]);
uit.push(await meet('O3 · sorteren over A:I — precies wat sorteerOfferteTrajecten doet'));

await grondtoestand();
await bu([{ sortRange: { range: { sheetId: SH, startRowIndex: 0, endRowIndex: RIJEN, startColumnIndex: 0, endColumnIndex: 17 },
                         sortSpecs: [{ dimensionIndex: 2, sortOrder: 'DESCENDING' }] } }]);
uit.push(await meet('O4 · sorteren over A:Q — bereik verbreed'));

await grondtoestand();
await bu([{ cutPaste: { source: { sheetId: SH, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 17 },
                        destination: { sheetId: SH, rowIndex: 20, columnIndex: 0 }, pasteType: 'PASTE_NORMAL' } }]);
uit.push(await meet('O5 · rij 5 knippen en op rij 21 plakken'));

console.table(uit);
console.log('Laat het tabblad "' + TAB + '" staan voor meting O6.');
window._proefFase4 = uit;
```

Noteer de uitvoer van `console.table` letterlijk.

- [ ] **Stap 2: O6 — overleeft het merkteken een back-upkopie?**

Dit kan niet vanuit het dashboard: het token heeft alleen de `spreadsheets`-scope, geen Drive.
Handmatig, precies zoals een echt herstel zou gaan:

1. Open de TEST-Sheet in Drive → **Bestand → Een kopie maken**, naam `PROEF-fase4-kopie`.
2. Neem het id van de kopie over uit de URL (het deel tussen `/d/` en `/edit`).
3. Draai in dezelfde console:

```js
const KOPIE = 'PLAK_HIER_HET_ID_VAN_DE_KOPIE';
const { state: st } = await import('./src/state.js');
const kv = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${KOPIE}/values/`
        + encodeURIComponent('PROEF-fase4!A1:Q40'), { headers:{ Authorization:'Bearer '+st.oauthToken } })).json();
const km = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${KOPIE}/developerMetadata:search`,
  { method:'POST', headers:{ Authorization:'Bearer '+st.oauthToken, 'Content-Type':'application/json' },
    body: JSON.stringify({ dataFilters:[{ developerMetadataLookup:{ metadataKey:'proef_tid' } }] }) })).json();
console.log('kolom Q in de kopie :', (kv.values||[]).filter(r=>/^V\d+$/.test((r[0]||'').trim())).map(r=>r[16]||'—').join(' '));
console.log('metadata in de kopie:', (km.matchedDeveloperMetadata||[]).length, 'records gevonden');
```

Verwacht bij kolom Q: `Q1 Q2 … Q8`. Bij metadata is de uitkomst **onbekend** — dat is exact wat
deze meting moet uitwijzen. Nul records betekent: een herstel uit back-up levert taken zónder
nummer op, en dat weegt zwaar mee in de keuze.

- [ ] **Stap 3: Opruimen**

```js
const { state: s2 } = await import('./src/state.js');
const { SID: S } = await import('./src/config.js');
const m = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${S}?fields=sheets.properties`,
  { headers:{ Authorization:'Bearer '+s2.oauthToken } })).json();
const t = m.sheets.find(x=>x.properties.title==='PROEF-fase4');
if(t) await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${S}:batchUpdate`, { method:'POST',
  headers:{ Authorization:'Bearer '+s2.oauthToken, 'Content-Type':'application/json' },
  body: JSON.stringify({ requests:[{ deleteSheet:{ sheetId: t.properties.sheetId } }] }) });
console.log('wegwerp-tabblad opgeruimd');
```

Gooi daarna ook `PROEF-fase4-kopie` in Drive weg.

- [ ] **Stap 4: Uitkomst vastleggen**

Schrijf `docs/superpowers/proeven/2026-07-29-fase4-rij-identiteit.md` met: de meetmatrix met de
échte uitkomsten, wat er anders liep dan verwacht, en een aanbeveling in twee alinea's. Geen
conclusie die verder gaat dan de meting.

- [ ] **Stap 5: Keuze voorleggen aan de gebruiker — STOP hier**

Leg de uitkomst voor met deze drie vragen, in gewone taal:

1. **Welk merkteken?** Kolom Q (zichtbaar in de Sheet, met de hand te repareren, komt gratis mee
   in elke poll) of onzichtbare metadata (schuift automatisch mee, maar niemand kan hem zien of
   herstellen, en er is geen ervaring mee in dit project)?
2. **Mag `sorteerOfferteTrajecten` worden aangepast of uitgezet?** Als hij blijft zoals hij is,
   raakt élk merkteken los bij een handmatige bewerking. Het bereik verbreden van 9 naar 17
   kolommen repareert en passant de bestaande J–P-bug.
3. **Mag het raster van PROD `Nog Te Doen` van 16 naar 17 kolommen?** Alleen nodig bij kolom Q.

**Bouw niets voordat deze drie beantwoord zijn.** Taak 4.3 heeft twee uitgeschreven varianten;
welke er gebouwd wordt, hangt hieraan.

- [ ] **Stap 6: Commit**

```bash
git add docs/superpowers/proeven/2026-07-29-fase4-rij-identiteit.md
git commit -m "Fase 4: proefopstelling rij-identiteit gemeten op de TEST-Sheet"
```

---

### Taak 4.2: Tussenmaatregel — de guard kijkt naar de hele taak, niet alleen naar de VvE

**Files:**
- Modify: `src/api.js`, `src/data.js`, `src/util.js`
- Modify (callsites): `src/crud.js`, `src/bulk.js`, `src/snooze.js`, `src/offerte-aannemers.js`, `src/notifications.js`
- Test: `src/tests.js`

Deze taak staat **los van de keuze uit 4.1** en mag meteen. Hij is het vangnet zolang er nog geen
vast nummer is.

Vandaag leest `assertRowsMatch` (`src/api.js:130-137`) uitsluitend **kolom A**. Daarmee bewijst de
guard alleen *"deze rij hoort nog bij dezelfde VvE"* — niet *"dit is nog dezelfde taak"*. Voor een
VvE met drie openstaande taken vangt hij dus niets. Dat is precies het meest waarschijnlijke
schadegeval, want rijen verschuiven binnen een sectie.

> **Correctie op de eerdere planregel.** Er stond dat `serializeNtdUndo`/`_ntdValues` hergebruikt
> kan worden voor alle 18 callsites. Dat klopt niet, om twee redenen die het onderzoek heeft
> vastgesteld:
> 1. `serializeNtdUndo` (`src/crud.js:117-122`) werkt via `SECS[r._sec].keys` en dekt daarmee
>    **alleen `Nog Te Doen`** — 8 van de 18 callsites. De andere **10** zitten op Herhaalregels (3),
>    Ontwikkeling (2), Logboek (2), Kenmerken (1) en ALV's overzicht (2).
> 2. `serializeNtdUndo` is géén getrouwe afbeelding van de rij: hij zet **I, J en N hardgecodeerd
>    leeg**. Kolom **N** bevat echte escalatiedata die het dashboard nooit schrijft maar de
>    Apps-Script-motor élke ochtend om ±06:30 stempelt. Een guard die N meeneemt, zou stil álle
>    schrijfacties blokkeren op precies de taken die het langst stilliggen.
>
> Daarom bouwt deze taak een **eigen, smalle vingerafdruk** in plaats van de undo-serialisatie te
> hergebruiken. Ook `_ntdValues` is geen aparte functie maar een alias van `serializeNtdUndo`
> (`src/bulk.js:65`) — één ding, niet twee.

**De regel: alleen kolommen die het dashboard zelf bezit en die stabiel zijn.**

Uitgesloten, met reden:
- **N** (escalatie) — alleen door Apps Script geschreven, wijzigt dagelijks
- **F bij OPPAKKEN** (prioriteit) — `cd_recalcPrioriteiten` herschrijft die elke ochtend
- **L** (opvolgdatum) — door de opvolgmotor geschreven
- **I, J** — selectievakje respectievelijk ongebruikt; dragen `TRUE`/`FALSE`-erfenis
- **O, P** — worden buiten de gewone bewerkweg om geschreven en voegen niets toe aan de identiteit

Wat overblijft is klein en scherp: **de sleutel + de tekst waaraan een mens de taak herkent + de
deadline**. Twee taken van dezelfde VvE verschillen daar vrijwel altijd in.

- [ ] **Stap 1: `_f4v` uit `parseSections` lichten en delen**

`_f4v` (de `TRUE`/`FALSE`-erfenisfilter) is nu een lokale `const` binnen `parseSections`
(`src/data.js:242`) en niet herbruikbaar. Parse en guard moeten gegarandeerd dezelfde regel
hanteren, anders lopen ze uiteen.

In `src/util.js`, bij de andere kleine helpers:

```js
// Selectievakje-erfenis: rijen in 'Nog Te Doen' erven de TRUE/FALSE-validatie van kolom H t/m Q.
// Zo'n geërfde waarde is géén inhoud en telt als leeg. Bewust NIET op kolom H toepassen: daar is
// 'TRUE' de betekenisvolle waarde 'in behandeling'.
export const leegBijErfenis = v => {
  const s = ((v ?? '') + '').trim();
  return (s.toUpperCase() === 'TRUE' || s.toUpperCase() === 'FALSE') ? '' : s;
};
```

In `src/data.js`: `leegBijErfenis` erbij in de import uit `./util.js`, en in `parseSections` de
lokale `const _f4v = …` (regel 242) vervangen door `const _f4v = leegBijErfenis;`.

- [ ] **Stap 2: Schrijf de falende tests voor de vingerafdruk**

In `src/tests.js`, met `vingerafdruk, _normCel` erbij in de import uit `./api.js` en
`leegBijErfenis` erbij in die uit `./util.js`:

```js
  // ── Vingerafdruk-guard: 'zelfde taak', niet alleen 'zelfde VvE'. ──
  (()=>{
    // _normCel maakt de twee kanten vergelijkbaar: het dashboard houdt '17-06-2026' in het
    // geheugen terwijl values.get '17 juni 2026' teruggeeft (de datumformaat-les).
    eq('normcel: ontbrekende cel → lege tekst', _normCel(undefined), '');
    eq('normcel: spaties eraf', _normCel('  hoi  '), 'hoi');
    eq('normcel: geërfde FALSE telt als leeg', leegBijErfenis('FALSE'), '');
    eq('normcel: twee schrijfwijzen van dezelfde datum zijn gelijk',
       _normCel('17-06-2026', true), _normCel('17 juni 2026', true));
    eq('normcel: onherkenbare datum valt terug op de tekst', _normCel('sept/okt', true), 'sept/okt');

    const taakA = {_sec:'OPPAKKEN', code:'311198', naam:'VvE A', actiepunt:'dak nakijken', deadline:'17-06-2026'};
    const taakB = {_sec:'OPPAKKEN', code:'311198', naam:'VvE A', actiepunt:'brief sturen',  deadline:'17-06-2026'};

    eq('vingerafdruk: rij ongewijzigd → gelijk',
       vingerafdruk('Nog Te Doen', taakA),
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17 juni 2026','Jer','Hoog','']));
    truthy('vingerafdruk: ándere taak van DEZELFDE VvE → ongelijk',
       vingerafdruk('Nog Te Doen', taakB) !==
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17 juni 2026','Jer','Hoog','']));
    eq('vingerafdruk: afgekapte staartcellen maken niet uit',
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026']),
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026','','','']));
    truthy('vingerafdruk: dagelijks gestempelde escalatie in N verandert niets',
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026','Jer','Hoog','','TRUE','','','','','','T1:28-07-2026'])
       === vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026','Jer','Hoog','']));
    truthy('vingerafdruk: gewijzigde prioriteit in F verandert niets',
       vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026','Jer','Laag',''])
       === vingerafdruk('Nog Te Doen', ['311198','VvE A','dak nakijken','17-06-2026','Jer','Hoog','']));
    eq('vingerafdruk: onbekend tabblad valt terug op kolom A',
       vingerafdruk('Iets anders', ['ABC','rest','doet','niet','mee']), 'ABC');

    // _rowMismatch werkt nu op vingerafdrukken i.p.v. op kale kolom-A-waarden
    eq('rij-guard: vingerafdruk klopt → null',
       _rowMismatch([['V1','n','t']], 5, [{row:5, fp:'V1\x1fn\x1ft'}], 'Nog Te Doen', r=>r.join('\x1f')), null);
  })();
```

- [ ] **Stap 3: Tests draaien — moeten falen**

Open `http://localhost:8899/index.html?test=1`. Verwacht: een importfout — `vingerafdruk` en
`_normCel` bestaan niet.

- [ ] **Stap 4: De vingerafdruk implementeren**

In `src/api.js`, direct vóór `_rowMismatch`, met `_parseAnyDate` en `leegBijErfenis` erbij in de
import uit `./util.js` en `SECS` uit `./config.js`:

```js
// ── Vingerafdruk van een rij ────────────────────────────────────────────────
// De guard vergeleek alleen kolom A: dat bewijst 'zelfde VvE', niet 'zelfde taak'. Voor een VvE
// met drie openstaande taken ving hij dus niets — en juist dát is het waarschijnlijke schadegeval.
//
// Alleen kolommen die het DASHBOARD bezit en die STABIEL zijn doen mee. Bewust buitengesloten:
//   N  escalatie      — alleen door Apps Script geschreven, wordt élke ochtend ±06:30 gestempeld
//   F  prioriteit     — cd_recalcPrioriteiten herschrijft die dagelijks (alleen OPPAKKEN)
//   L  opvolgdatum    — door de opvolgmotor geschreven
//   I,J               — selectievakje / ongebruikt; dragen TRUE/FALSE-erfenis
//   O,P               — buiten de bewerkweg om geschreven; voegen niets toe aan de identiteit
// Namen zijn er niet bij: dezelfde VvE-code betekent per definitie dezelfde naam.
const FP_KOLOMMEN = {
  'Nog Te Doen':      { tekst: [0, 2], datum: null },  // datumkolom hangt van de sectie af — zie hieronder
  'Afgerond':         { tekst: [0, 2], datum: [8]  },  // A=code, C=actiepunt, I=datum afgerond
  'Herhaalregels':    { tekst: [0, 1], datum: null },  // A=ID, B=omschrijving
  'Ontwikkeling':     { tekst: [0, 1], datum: null },  // A=titel, B=omschrijving
  'Logboek':          { tekst: [0, 1], datum: null },  // A=timestamp, B=VvE-code
  'Kenmerken':        { tekst: [0, 1], datum: null },  // A=VvE-code, B=kenmerk
  "ALV's overzicht":  { tekst: [0, 1], datum: null },  // A=VvE-code, B=naam
};
// Welke kolom de deadline is, verschilt per sectie van 'Nog Te Doen':
// OPPAKKEN D(3) · VERGADERVERZOEKEN F(5) · OFFERTE-TRAJECTEN C(2)+F(5) · LOD F(5).
const NTD_DATUM = { OPPAKKEN: [3], VERGADERVERZOEKEN: [5], 'OFFERTE-TRAJECTEN': [2, 5], LOD: [5] };

// Eén cel vergelijkbaar maken. isDatum=true → vergelijk op de GEPARSEERDE datum, nooit op de
// tekst: het dashboard houdt '17-06-2026' in het geheugen terwijl values.get (FORMATTED_VALUE)
// '17 juni 2026' teruggeeft. Onherkenbaar als datum → val terug op de tekst ('sept/okt').
function _normCel(v, isDatum){
  const s = leegBijErfenis(v);
  if(!isDatum || !s) return s;
  const d = _parseAnyDate(s);
  return d ? `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}` : s;
}

// Vingerafdruk van één rij. `bron` is óf een rij-OBJECT uit het geheugen óf een ruwe cel-array
// zoals values.get hem teruggeeft. Beide kanten door dezelfde functie halen is de hele truc —
// anders lopen normalisatie en trim onvermijdelijk uiteen.
// Onbekend tabblad → val terug op kolom A, zodat een nieuw tabblad nooit stil de guard uitzet.
function vingerafdruk(sheetName, bron){
  const spec = FP_KOLOMMEN[sheetName];
  const rij = Array.isArray(bron) ? bron : _rijNaarCellen(sheetName, bron);
  if(!spec) return _normCel(rij[0]);
  const sec = Array.isArray(bron) ? null : bron._sec;
  const datumKol = spec.datum || (sheetName === 'Nog Te Doen' ? (NTD_DATUM[sec] || []) : []);
  const idx = spec.tekst.concat(datumKol).sort((a,b)=>a-b);
  return idx.map(i => _normCel(rij[i], datumKol.includes(i))).join('\x1f');
}

// Een rij-object → cel-array, zodat een object en een verse lezing door dezelfde weg gaan.
function _rijNaarCellen(sheetName, r){
  if(sheetName !== 'Nog Te Doen'){
    // Buiten NTD staat de sleutel altijd op A en het tweede veld op B; welke velden dat zijn,
    // verschilt per tabblad — vandaar de expliciete kaart.
    const K = { 'Herhaalregels':['id','omschrijving'], 'Ontwikkeling':['titel','omschrijving'],
                'Logboek':['timestamp','code'], 'Kenmerken':['code','kenmerk'],
                'Afgerond':['code','actiepunt'], "ALV's overzicht":['code','naam'] }[sheetName] || [];
    const uit = []; K.forEach((k,i)=>{ uit[i] = r[k] ?? ''; });
    if(sheetName === 'Afgerond') uit[8] = r.datum ?? '';
    return uit;
  }
  const keys = (SECS[r._sec] || {}).keys || [];
  const uit = keys.map(k => r[k] ?? '');
  while(uit.length < 8) uit.push('');
  return uit;
}
```

> **Let op de asymmetrie bij `Nog Te Doen`.** Een rij-OBJECT kent zijn sectie (`r._sec`) en neemt
> de deadlinekolom dus mee; een RUWE rij uit `values.get` kent hem niet — de sectie staat in een
> kopregel erbóven. Voor een ruwe rij doet de deadline daarom niet mee. Dat maakt de vingerafdruk
> aan die kant **smaller, nooit breder**: hij kan daardoor iets missen, maar nooit vals alarm
> geven. Bij `assertRowsMatch` hieronder worden **beide** kanten via de ruwe weg gebouwd, zodat ze
> gegarandeerd vergelijkbaar zijn.

Vervang `_rowMismatch` en `_a1ColA` door de brede vorm:

```js
// Pure (testbaar): gegeven de teruggelezen rijen (vanaf minRow) en de verwachte {row, fp}-checks
// → geef de eerste afwijking terug, of null als alles klopt. `maak` maakt van een ruwe rij een
// vingerafdruk; die wordt meegegeven zodat deze functie puur blijft.
function _rowMismatch(vals, minRow, checks, sheetName, maak){
  for(const c of checks){
    const ruw = vals[c.row - minRow] || [];
    const got = maak ? maak(ruw) : ((ruw[0] || '').toString().trim());
    if(got !== c.fp) return { row: c.row, expected: c.fp, got };
  }
  return null;
}
// Bouwt de A1-range over de vingerafdruk-kolommen. Escapet apostrofs in de tabbladnaam
// (bv. "ALV's overzicht" → 'ALV''s overzicht'!A..). Altijd t/m I: dat dekt elke kolom die in
// FP_KOLOMMEN voorkomt, en het houdt het op ÉÉN aaneengesloten range = één leesverzoek.
function _a1Bereik(sheetName, minR, maxR){
  return `'${(sheetName||'').replace(/'/g,"''")}'!A${minR}:I${maxR}`;
}
```

En `assertRowsMatch`:

```js
// Leest de vingerafdruk-kolommen van de doelrij(en) terug en gooit een ROW_MISMATCH-fout als een
// rij niet meer dezelfde TAAK bevat. Eén GET dekt het hele rijbereik.
// Let op: deze guard zit binnen de writeFn en dus binnen _withRetry — bij een 429/5xx wordt hij
// tot drie keer uitgevoerd. Dat is bewust: een herkansing na een storing moet opnieuw controleren.
async function assertRowsMatch(checks, sheetName='Nog Te Doen'){
  checks=(checks||[]).filter(c=>c&&c.row);
  if(!checks.length) return;
  const rows=checks.map(c=>c.row), minR=Math.min(...rows), maxR=Math.max(...rows);
  const vals=await fetchSheet(_a1Bereik(sheetName, minR, maxR));
  const mm=_rowMismatch(vals, minR, checks, sheetName, ruw=>vingerafdruk(sheetName, ruw));
  if(mm){ const err=new Error('De lijst was net gewijzigd — opnieuw geladen.'); err.rowMismatch=true; err.detail=mm; throw err; }
}
// Achterwaarts compatibel: (row, code) blijft werken, maar een rij-OBJECT geeft de volle
// vingerafdruk. Zo kan elke callsite apart mee, zonder big-bang. Het object wordt via
// _rijNaarCellen naar de RUWE vorm gebracht, zodat beide kanten identiek genormaliseerd worden.
const assertRowMatch=(row, bronOfCode, sheetName)=>assertRowsMatch(
  [{ row, fp: (bronOfCode && typeof bronOfCode === 'object')
       ? vingerafdruk(sheetName||'Nog Te Doen', _rijNaarCellen(sheetName||'Nog Te Doen', bronOfCode))
       : ((bronOfCode||'')+'').trim() }], sheetName);
```

Voeg `vingerafdruk`, `_normCel`, `_rijNaarCellen` en `_a1Bereik` toe aan de `export {...}` onderaan
`src/api.js`, en haal `_a1ColA` daar weg.

- [ ] **Stap 5: Tests draaien — moeten slagen**

`window._testResult`: FAIL blijft 0, OK is met 12 gestegen ten opzichte van de basislijn van
**726 OK, 0 FAIL** (gemeten op deze tak, 2026-07-29).

Let op de bestaande `_a1ColA`-tests: die verwijzen naar een functie die niet meer bestaat. Pas ze
aan naar `_a1Bereik` en verwacht `A..I` in plaats van `A..A`.

- [ ] **Stap 6: De acht `Nog Te Doen`-callsites het rij-object laten meegeven**

Per callsite: geef het rij-object mee in plaats van alleen de code. De acht plekken:

```js
// src/crud.js:190   (verwijderen)   → await assertRowMatch(oudeRow, r);
// src/crud.js:339   (afronden)      → await assertRowMatch(r._row, r);
// src/crud.js:412   (bewerken)      → await assertRowMatch(doelRow._row, oudeWaarden);
// src/snooze.js:61                  → await assertRowMatch(r._row, r);
// src/offerte-aannemers.js:26       → await assertRowMatch(r._row, r);
// src/bulk.js:130                   → await assertRowsMatch(items.map(it=>({row:it.origRow, fp:vingerafdruk('Nog Te Doen', _rijNaarCellen('Nog Te Doen', it.r))})));
// src/bulk.js:227                   → idem
// src/bulk.js:286                   → await assertRowsMatch(items.map(it=>({row:it.r._row, fp:vingerafdruk('Nog Te Doen', _rijNaarCellen('Nog Te Doen', it.r))})));
```

In `src/bulk.js` `vingerafdruk` en `_rijNaarCellen` erbij in de import uit `./api.js`.

> **Bewust nu níét meegenomen:** de tien callsites buiten `Nog Te Doen` (Herhaalregels,
> Ontwikkeling, Logboek, Kenmerken, ALV's overzicht). Ze blijven op de kolom-A-vorm draaien, die
> achterwaarts compatibel is gehouden. Reden: op die tabbladen is de sleutel in kolom A al veel
> beter onderscheidend (een timestamp, een herhaal-ID, een titel), dus de winst is klein en het
> risico op vals alarm relatief groot. Wie ze later wil meenemen, hoeft alleen het rij-object mee
> te geven — `FP_KOLOMMEN` kent ze al.

- [ ] **Stap 7: `Afgerond` krijgt eindelijk een guard**

`Afgerond` is het énige tabblad met een positionele `deleteDimension` **zonder enige guard** —
`src/bulk.js:199` en `src/notifications.js:181`, allebei op de undo-weg. Dat is precies de
gevaarlijkste weg, want daar wordt een regel weggehaald op grond van een onthouden rijnummer.

Voeg vóór beide `deleteDimension`-aanroepen toe (met `assertRowMatch`/`assertRowsMatch` en
`vingerafdruk`/`_rijNaarCellen` in de import uit `./api.js`):

```js
      await assertRowMatch(doelAf._row, doelAf, 'Afgerond'); // rij nog dezelfde afronding vóór verwijderen
```

en in `src/bulk.js:199` de meervoudsvorm over de te verwijderen rijen.

- [ ] **Stap 8: Handmatig controleren dat hij niet vals afgaat**

Draai het dashboard lokaal en doe achter elkaar: taak bewerken, afronden, ongedaan maken,
snoozen, bulk-afronden, aannemer aanvinken. Verwacht: geen enkele
`De lijst was net gewijzigd`-melding.

Doe daarna één ronde ná 07:00 op staging, zodat de escalatiemotor van ±06:30 zijn stempel in
kolom N heeft gezet. Verwacht: nog steeds geen melding — dat is de test op de N-landmijn.

- [ ] **Stap 9: Bewust afgaan**

Open de TEST-Sheet, verander met de hand de tekst van een openstaande taak, en sla die taak
binnen 8 seconden op in het dashboard. Verwacht: `De lijst was net gewijzigd — opnieuw geladen.`
en de wijziging teruggedraaid. Met de oude kolom-A-guard gebeurde dit **niet**.

- [ ] **Stap 10: Commit**

```bash
git add src/api.js src/util.js src/data.js src/crud.js src/bulk.js src/snooze.js src/offerte-aannemers.js src/notifications.js src/tests.js
git commit -m "Guard: vingerafdruk over de hele taak i.p.v. alleen de VvE-code, en Afgerond krijgt er ook een"
```

- [ ] **Stap 11: Uitrollen**

`src/config.js`: `APP_VERSION = '9.6'`. `sw.js`: `CACHE_VERSION = 'cd-v91'`.

```bash
git add src/config.js sw.js
git commit -m "Versie 9.6 / cd-v91: guard kijkt naar de hele taak"
git push -u origin feature/opslag-hardening
git checkout staging && git merge feature/opslag-hardening && git push
```

Testen op de Vercel-testlink met `?test=1`, daarna handmatig stap 8 en 9 herhalen. Dan:

```bash
git checkout main && git merge staging && git push
```

*Eerlijk over de grens:* een vingerafdruk-guard die matcht, schrijft. Bij écht identieke regels —
zelfde VvE, zelfde tekst, zelfde deadline — doet hij dat fout, en stil. Alleen een uniek nummer
sluit dat helemaal. Dit is een tussenmaatregel, geen eindstation.

---

### Taak 4.3: Het gekozen mechanisme invoeren

> **Beslispunt.** Welke variant je uitvoert, hangt volledig aan de drie vragen uit Taak 4.1
> stap 5. Beide varianten staan hieronder uitgeschreven; voer er **één** uit.

Wat de varianten delen:

- Het nummer is **onveranderlijk** en wordt nooit hergebruikt. Vorm: `T` + een oplopend getal
  (`T1041`). Kort, want bij variant B telt elk teken tegen het metadata-budget van 30.000 tekens
  per tabblad (±2.700 rijen — ruim, maar het is een plafond).
- De teller staat in **`Ontwikkeling`** — geen nieuw tabblad, en dat blad wordt al gelezen.
  Sleutel `_taakteller`, waarde het laatst uitgegeven getal.
- **Backfill vóór gebruik.** Elke bestaande rij krijgt eerst een nummer; pas daarna gaat de code
  er iets mee doen. Volgorde: TEST volledig, één week meekijken, dan PROD.
- **De guard uit 4.2 blijft staan.** Het nummer vervangt hem niet, het maakt hem exact: eerst
  nummer zoeken, gevonden → schrijf daar; niet gevonden → weiger. De vingerafdruk blijft het
  vangnet voor rijen die nog geen nummer hebben.

#### Variant A — verborgen kolom Q

Voer deze uit als de proef laat zien dat de metadata een sortering of een plakactie **niet**
overleeft, of als de gebruiker een merkteken wil dat je met eigen ogen kunt zien en repareren.

- [ ] **Stap A1: Rasters verbreden — eerst, anders mislukken de writes stil**

`Nog Te Doen` staat op PROD op **exact 16 kolommen**. Een write naar Q buiten het raster mislukt
**zonder foutmelding** — de val die in het offerte-opvolgsysteem al eens is opgelopen. Verbreed
op TEST én PROD naar 17 (rechtsklik op de kolomkop → rechts een kolom invoegen).

Verwijder daarna de selectievakje-validatie uit kolom Q (Gegevens → Gegevensvalidatie →
verwijderen voor `Q:Q`); op de TEST-Sheet staat daar nu overal een geërfde `FALSE`.

In `src/structuurcheck.js`: `'Nog Te Doen': 17,` en het comment bijwerken.

- [ ] **Stap A2: `sorteerOfferteTrajecten` verbreden van 9 naar 17 kolommen**

`apps-script/Code.gs` regels 207, 222, 237 en 252: vervang `, 9)` door `, 17)` in elke
`getRange(...).sort(...)`. Dit is de voorwaarde voor variant A — zonder deze wijziging raakt Q los
bij de eerste handmatige bewerking.

En passant repareert dit de bestaande J–P-bug. Haal daarna de waarschuwing onderaan
`apps-script/README.md` (sectie "Waarschuwing bij handmatig werk in `Nog Te Doen`") weg en
vervang hem door één regel die vastlegt dat het sorteerbereik nu de volle breedte dekt.

- [ ] **Stap A3: Lezen, schrijven en uitdelen**

In `src/data.js`, in `parseSections`, direct ná `entry.aannemers`:

```js
    entry.taakId = _f4v(row[16]);   // Q — vast taaknummer (leeg bij nog niet genummerde rijen)
```

In `src/crud.js`, in `serializeNtdUndo`, het nummer meenemen zodat een undo het niet kwijtraakt:

```js
  v.push(r.taakId || '');   // Q — het nummer moet de undo overleven
```

En in `insertAndWriteRow` de `endCol`-berekening (`src/crud.js:135`) laten meegroeien tot Q.

- [ ] **Stap A4: Backfill**

Draai het backfill-script (zie stap C1 hieronder) met `MODUS = 'kolomQ'`.

- [ ] **Stap A5: De guard op het nummer laten werken**

In `src/api.js`: als de rij een `taakId` heeft, is de vingerafdruk het nummer alleen. Voeg
bovenin `vingerafdruk` toe:

```js
  // Heeft de rij een vast nummer, dan ís dat de identiteit — de rest doet er niet meer toe.
  if(Array.isArray(bron) && bron[16]) return 'T:' + leegBijErfenis(bron[16]);
```

en breid `_a1Bereik` uit van `A..I` naar `A..Q` voor `Nog Te Doen`.

#### Variant B — DeveloperMetadata op de rij-dimensie

Voer deze uit als de proef laat zien dat metadata sorteren én plakken **wél** overleeft, én dat
hij een bestandskopie overleeft (O6).

- [ ] **Stap B1: Uitdelen bij het aanmaken, in één atomische aanroep**

Vervang `insertAndWriteRow` (`src/crud.js:124-150`) door één `batchUpdate` met drie requests in
deze volgorde: `insertDimension`, `updateCells`, `createDeveloperMetadata`. Google garandeert dat
een batchUpdate atomisch is (*"the updates in the request will be applied together atomically"*),
dus vervalt meteen de ghost-rij-opruiming die er nu onder staat.

Let op: binnen `batchUpdate` bestaat `valueInputOption=USER_ENTERED` niet; gebruik
`updateCells` met `userEnteredValue` per cel, en houd `veiligeCel` uit `src/api.js` ervoor.

- [ ] **Stap B2: Lezen — één extra verzoek per poll**

In `src/api.js` erbij:

```js
// Nummer → rij-index, in één verzoek voor het hele bestand. Kost +1 leesverzoek per poll
// (7,5 → 15 per minuut; het quotum is 60 per gebruiker per minuut).
async function fetchTaakNummers(){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SID}/developerMetadata:search`,{
    method:'POST', cache:'no-store',
    headers:{ Authorization:`Bearer ${state.oauthToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ dataFilters:[{ developerMetadataLookup:{ metadataKey:'tid' } }] })
  });
  if(!r.ok) throw new Error('Taaknummers ophalen mislukt');
  const uit = {};
  ((await r.json()).matchedDeveloperMetadata||[]).forEach(m=>{
    const d=m.developerMetadata, loc=d.location?.dimensionRange;
    if(loc) (uit[loc.sheetId] = uit[loc.sheetId] || {})[loc.startIndex + 1] = d.metadataValue;
  });
  return uit;
}
```

- [ ] **Stap B3: Schrijven zonder rijnummer**

Op de paden waar het nummer bekend is, vervalt `assertRowMatch`: schrijf via
`values:batchUpdateByDataFilter` met een `developerMetadataLookup`-filter. **Cruciaal detail:** de
waarden landen vanaf **kolom A**, en een `DataFilter` kan niet tegelijk op metadata én op een
kolombereik filteren. Eén kolom schrijven kan alleen door de voorliggende posities op `null` te
zetten — *"Null values will be skipped"*:

```js
// Alleen kolom L schrijven van de rij met dit nummer, zonder de rij-index te kennen.
body: JSON.stringify({ valueInputOption:'USER_ENTERED', data:[{
  dataFilter:{ developerMetadataLookup:{ metadataKey:'tid', metadataValue: taakId } },
  majorDimension:'ROWS',
  values:[[null,null,null,null,null,null,null,null,null,null,null, waarde]],
}]})
```

- [ ] **Stap B4: Backfill**

Draai het backfill-script met `MODUS = 'metadata'`.

#### Gemeenschappelijk

- [ ] **Stap C1: Backfill-script**

Draai op de **TEST-Sheet** eerst, controleer, en pas daarna op PROD. Het script deelt aan élke
nog niet genummerde datarij in `Nog Te Doen` een nummer uit, in blokken van 100 (er is geen
gedocumenteerd maximum aantal requests per `batchUpdate`, dus niet gokken dat "het wel past").
Het script is **idempotent**: rijen die al een nummer hebben, slaat het over.

Schrijf het script bij het uitvoeren uit op basis van de gekozen variant; het bestaat uit: rijen
lezen → rijen zonder nummer selecteren → teller ophalen uit `Ontwikkeling` → per blok van 100 een
`batchUpdate` → teller wegschrijven → opnieuw lezen en verifiëren dat elk nummer precies één keer
voorkomt.

- [ ] **Stap C2: Uniciteitscontrole in de structuurcheck**

In `src/structuurcheck.js` erbij, met een test in `src/tests.js`:

```js
// Twee taken met hetzelfde nummer is de ergste storing die dit mechanisme kan krijgen: de guard
// schrijft dan mét overtuiging naar de verkeerde rij. Puur, dus los testbaar.
function checkNummers(rijen){
  const gezien={}, uit=[];
  rijen.forEach(r=>{
    if(!r.taakId) return;
    if(gezien[r.taakId]) uit.push({ nummer:r.taakId, regels:[gezien[r.taakId], r._row],
      tekst:`Taaknummer ${r.taakId} staat op twee regels (${gezien[r.taakId]} en ${r._row}).` });
    else gezien[r.taakId]=r._row;
  });
  return uit;
}
```

Hang hem aan dezelfde console-melding als trap 1 van fase 3 (`src/data.js`, ná `D.ntd=ntdP.data`).

- [ ] **Stap C3: Uitrollen**

`APP_VERSION = '9.7'`, `CACHE_VERSION = 'cd-v92'`. Route als altijd:
`feature/opslag-hardening` → `staging` → testlink → `main`.

Na de uitrol: **één week meekijken** met `checkNummers` in de console vóór er een schrijfweg op
het nummer gaat leunen. Zelfde trapsgewijze aanpak als fase 3.

---

# FASE 5 — Leeslast en offline

**Doel:** de leeslast ontkoppelen van de historie, en offline eerlijk maken.

**Voorwaarde — afgevinkt op 2026-07-29:** fase 4 is live (v9.7/cd-v92). Gelaagd ophalen verlengt
het venster waarin het dashboard met verouderde gegevens werkt van 8 naar 60 seconden op de trage
tabbladen; dat is alleen verantwoord nu de identiteit van een regel vaststaat.

> **Rol niets uit voordat fase 4 een dag in echt gebruik is geweest.** Bouwen mag meteen; live
> zetten stapelt anders een tweede verandering op schrijfwegen die nog niemand met de hand heeft
> beproefd. Gaat er later iets mis, dan is niet meer te zeggen wélke van de twee het deed.

### Wat het onderzoek heeft vastgesteld (2026-07-29)

Gemeten in de code, met adversariële controle:

- **De koppeling tabblad → variabele is positioneel, op TWEE plekken:** `src/data.js:159`
  (batchGet) én `src/data.js:164-171` (terugval). Beide moeten mee; alleen de eerste omzetten
  laat een stille tijdbom achter in de terugvaltak.
- **De terugvaltak is niet uniform.** `Nog Te Doen`, `Afgerond`, `ALV's overzicht` en
  `ALV's afgerond` hebben géén `.catch`, de andere vier wél. **`ALV's afgerond` zit in de trage
  groep maar mist die catch** — wordt de trage groep een eigen ronde, dan laat één ontbrekend
  tabblad de hele trage ronde vallen. Een kale `namen.map(n=>lees(n).catch(()=>[]))` is dus
  **geen** gedragsneutrale refactor.
- **Het poll-slot kent geen groepen.** `_loadAgain` is één boolean die N onderdrukte aanroepen
  tot één herhaling samenvouwt. Met twee ritmes kan een onderdrukte trage ronde als snelle ronde
  terugkomen, waarna de trage tabbladen willekeurig lang blijven staan.
- **De 8s-timer heeft acht remmen** (`src/main.js:275-289`) die tikken laten vallen zónder te
  tellen. "Elke zevende tik" werkt daarom niet als 60s-ritme; er moet een tijdstempel aan te pas
  komen.
- **Er is een tweede poll:** `Meldingen`, elke 10 s, buiten `POLL_TABS`
  (`src/notifications.js:233,282`). Die haalt het hele tabblad op en kost 6 leesverzoeken per
  minuut naast de 7,5 van `loadAll`.
- **`_row` van een logregel is bewust de RUWE Sheet-index** (`parseLogboek`,
  `src/render-overig.js:181-193`) en drie schrijfwegen leunen erop. Staart-lezen vanaf rij N
  levert zonder correctie `i+2` in plaats van `N+i`.
- **De rij-guard op `Logboek` vergelijkt alleen kolom A (de timestamp)**, en het commentaar op
  `src/render-overig.js:456-458` stelt vast dat bulk-acties meerdere logregels met **exact
  dezelfde milliseconde** schrijven. Bij een venster van 60 s weegt dat zwaarder dan bij 8 s.
- **`ensureToken()` geeft offline gewoon `true`** — een geldig token in het geheugen vraagt geen
  netwerk. Het is dus géén offline-poort, en uitbreiden helpt niet.
- **`_isTransient` herkent geen netwerkfout.** Dat is meteen het discriminerende kenmerk: een
  `fetch` die rejectet heeft **geen** `.status`; een API-fout heeft er wél een.
- **`localStorage` bevat vandaag alleen voorkeuren** (thema, dichtheid, …), nul data. `logout()`
  raakt localStorage nergens aan.
- **De twee `valueRanges`-stubs met acht elementen staan in het `doeReset`-testblok**
  (`src/tests.js:1501-1502` en `1559-1560`), niet in de quotum-test. Ze zetten het ALV-overzicht
  op **index 2**. Volgt de snelle groep de volgorde uit dit plan (NTD, ALV's overzicht,
  Afgerond), dan is index 2 ineens `Afgerond` en vallen die tests om.

---

### Taak 5.1: Gelaagd ophalen

**Files:**
- Modify: `src/data.js`, `src/main.js`, `src/state.js`
- Test: `src/tests.js`

Snelle groep (elke 8 s): `Nog Te Doen`, `Afgerond`, `ALV's overzicht`.
Trage groep (elke 60 s): `ALV's afgerond`, `Ontwikkeling`, `Logboek`, `Herhaalregels`, `Kenmerken`.

> **Let op de volgorde.** De snelle groep houdt de POLL_TABS-volgorde (`Nog Te Doen`, `Afgerond`,
> `ALV's overzicht`) — niet de volgorde waarin de spec ze noemt. Dat scheelt de twee bestaande
> test-stubs, die het ALV-overzicht op index 2 verwachten. Ze worden hieronder alsnog
> naam-gestuurd gemaakt, maar er is geen reden om ze onnodig te breken.

`Afgerond` hoort bij de snelle groep: het is het tabblad waar de undo-weg een positionele
`deleteDimension` doet, en met ~224 regels kost het vrijwel niets.

- [ ] **Stap 1: Schrijf de falende tests**

In `src/tests.js`, met `SNELLE_TABS, TRAGE_TABS, _magTraag` erbij in de import uit `./data.js`:

```js
  // ── Gelaagd ophalen: welke tabbladen in welke groep, en wanneer de trage groep meemoet ──
  (()=>{
    eq('gelaagd: snelle groep is precies drie tabbladen', SNELLE_TABS.length, 3);
    eq('gelaagd: Afgerond zit in de SNELLE groep (positionele delete zonder rij-guard)',
       SNELLE_TABS.includes('Afgerond'), true);
    eq('gelaagd: Logboek zit in de TRAGE groep', TRAGE_TABS.includes('Logboek'), true);
    eq('gelaagd: geen tabblad zit in beide groepen',
       SNELLE_TABS.filter(t=>TRAGE_TABS.includes(t)).length, 0);
    eq('gelaagd: samen dekken ze alle acht tabbladen', SNELLE_TABS.length+TRAGE_TABS.length, 8);
    // De timer laat tikken vallen (acht remmen), dus 'elke zevende tik' zou het ritme laten
    // wegdrijven. Daarom een tijdstempel: 60 s is een bovengrens, geen telling.
    eq('gelaagd: nog nooit traag geladen → trage groep moet mee', _magTraag(0, 1000), true);
    eq('gelaagd: 59 s geleden → trage groep hoeft niet', _magTraag(1000, 60000), false);
    eq('gelaagd: precies 60 s geleden → trage groep moet mee', _magTraag(1000, 61000), true);
  })();
```

- [ ] **Stap 2: Test draaien, moet falen**

Open `http://localhost:8899/index.html?test=1`. Verwacht een importfout — `SNELLE_TABS` bestaat niet.

- [ ] **Stap 3: De groepen en de ritme-regel**

In `src/data.js`, vervang `POLL_TABS` door:

```js
// De acht tabbladen, verdeeld naar hoe vaak ze écht veranderen.
// SNEL (elke 8 s): waar de gebruiker op kijkt en waar geschreven wordt. 'Afgerond' hoort hier
// nadrukkelijk bij — het is het tabblad waar de undo-weg een positionele deleteDimension doet,
// en met ~224 regels kost het niets.
// TRAAG (elke 60 s): tabbladen die zelden wijzigen. Het Logboek is hier de grote winst: dat
// groeit onbeperkt en werd tot nu toe élke 8 seconden volledig opnieuw ingelezen.
// De volgorde van de snelle groep is bewust die van de oude POLL_TABS.
const SNELLE_TABS=["Nog Te Doen","Afgerond","ALV's overzicht"];
const TRAGE_TABS =["ALV's afgerond","Ontwikkeling","Logboek","Herhaalregels","Kenmerken"];
const TRAAG_MS   = 60000;

// Tabbladen die in de terugvaltak GEEN .catch krijgen: zonder deze vier kan het dashboard niet
// zinnig renderen, dus daar is falen beter dan stilzwijgend een lege lijst. De andere vier zijn
// optioneel (ze bestaan niet op elke kopie van de Sheet) en worden wél afgevangen.
// LET OP: "ALV's afgerond" is verplicht én zit in de TRAGE groep — die combinatie is de reden
// dat de terugvaltak per tabblad moet weten of hij mag falen, en niet uniform mag worden.
const VERPLICHTE_TABS=new Set(["Nog Te Doen","Afgerond","ALV's overzicht","ALV's afgerond"]);

// Moet de trage groep deze ronde mee? Puur (tijden meegegeven) zodat de regel los testbaar is.
// Bewust een TIJDSTEMPEL en geen tikteller: de 8s-timer heeft acht remmen die een tik laten
// vallen zonder te tellen, dus 'elke zevende tik' zou onvoorspelbaar wegdrijven.
function _magTraag(laatsteTraagMs, nu){ return !laatsteTraagMs || (nu-laatsteTraagMs)>=TRAAG_MS; }
```

In `src/state.js`, bij de andere poll-velden:

```js
  _laatsteTraagMs: 0,      // wanneer de trage tabbladen voor het laatst zijn gelezen (0 = nooit)
  _loadAgainTraag: false,  // was de ONDERDRUKTE ronde er één met de trage groep erbij?
                           // Zonder dit zou een uitgestelde trage ronde als snelle terugkomen
                           // en bleven de trage tabbladen willekeurig lang staan.
```

- [ ] **Stap 4: `fetchSheets` op naam laten teruggeven**

In `src/api.js`, vervang de returnregel van `fetchSheets`:

```js
  // Op NAAM teruggeven, niet op positie. Zolang de aanroeper op index uitpakte, verschoof élke
  // variabele zodra de gevraagde lijst korter werd — precies wat gelaagd ophalen doet.
  const uit={};
  names.forEach((n,i)=>{ uit[n]=(vr[i]&&vr[i].values)||[]; });
  return uit;
```

En pas de bestaande `fetchSheets`-test aan: die verwacht nu een array.

- [ ] **Stap 5: `loadAll` gelaagd maken**

In `src/data.js`, vervang regel 154-172 (het ophalen) door:

```js
    // Welke tabbladen deze ronde? De trage groep ligt er alleen bij als hij aan de beurt is.
    const traagMee=_magTraag(state._laatsteTraagMs, Date.now());
    const namen=traagMee ? SNELLE_TABS.concat(TRAGE_TABS) : SNELLE_TABS;
    let R;
    try{
      R=await _withRetry(()=>fetchSheets(namen));
    }catch(e){
      // Terugval op losse reads. batchGet faalt in z'n geheel als één tabblad ontbreekt; de oude
      // weg levert de optionele tabbladen dan alsnog los aan (duurder, maar werkt).
      // Per tabblad beslissen of hij mag falen — een uniforme .catch zou een ontbrekend
      // 'Nog Te Doen' in stilte als lege lijst doorlaten en het dashboard leegvegen.
      console.warn('batchGet mislukt, terugval op losse reads:', e.message);
      R={};
      await Promise.all(namen.map(async n=>{
        R[n]=VERPLICHTE_TABS.has(n) ? await lees(n) : await lees(n).catch(()=>[]);
      }));
    }
    if(traagMee) state._laatsteTraagMs=Date.now();
```

En vervang het uitpakken (regel 177-191) door een vorm die een overgeslagen tabblad **overslaat**
in plaats van leegmaakt:

```js
    // Alleen toekennen wat deze ronde ook echt gelezen is. Een overgeslagen tabblad BEHOUDT zijn
    // vorige waarde — zou hij hier door parseX(undefined) gaan, dan zou elke snelle ronde het
    // logboek, de herhaalregels en de kenmerken leegvegen.
    const zetAls=(naam,fn)=>{ if(R[naam]!==undefined) fn(R[naam]); };
    zetAls('Nog Te Doen', r=>{ const p=parseSections(r); D.ntd=p.data; D.ntdSecInfo=p.secInfo; });
    zetAls('Afgerond',    r=>{ const p=parseSections(r); D.af=p.data; D.afSecInfo=p.secInfo;
                               SKEYS.forEach(s=>{if(D.af[s])D.af[s].sort((a,b)=>parseDt(b.datum)-parseDt(a.datum))}); });
    try{
      const bev=[...checkSecties(R['Nog Te Doen']||[]), ...checkSecties(R['Afgerond']||[]),
                 ...checkNummers(Object.values(D.ntd||{}).flat())];
      if(bev.length) console.warn('[structuurcheck]', bev);
    }catch(e){ console.warn('[structuurcheck] overgeslagen:', e.message); }
    zetAls("ALV's overzicht", r=>{ D.alvo=parseAlvo(r); });
    zetAls("ALV's afgerond", r=>{ D.alfa=parseAlfa(r); });
    zetAls('Ontwikkeling',   r=>{ D.ontw=parseOntw(r); });
    zetAls('Logboek',        r=>{ D.logboek=parseLogboek(r); });
    zetAls('Herhaalregels',  r=>{ D.herhaal=parseHerhaal(r); });
    zetAls('Kenmerken',      r=>{ D.kenmerken=parseKenmerken(r); });
```

- [ ] **Stap 6: Het slot laten onthouden wélke groep werd onderdrukt**

Regel 135 en 213 in `src/data.js`:

```js
  if(state._loadInFlight){
    state._loadAgain=true;
    if(!silent) state._loadAgainLoud=true;
    // Onthoud óók of de onderdrukte ronde de trage groep nodig had. Zonder dit komt een
    // uitgestelde trage ronde terug als snelle en blijven de trage tabbladen staan tot de
    // volgende hele minuut — of langer, want _magTraag kijkt naar de laatste GESLAAGDE ronde.
    if(_magTraag(state._laatsteTraagMs, Date.now())) state._loadAgainTraag=true;
    return;
  }
```

```js
    state._loadInFlight=false;
    if(state._loadAgain){
      const loud=state._loadAgainLoud, traag=state._loadAgainTraag;
      state._loadAgain=false; state._loadAgainLoud=false; state._loadAgainTraag=false;
      if(traag) state._laatsteTraagMs=0;   // dwing de trage groep af in de herhaalronde
      loadAll(!loud);
    }
```

- [ ] **Stap 7: De twee test-stubs naam-gestuurd maken**

`src/tests.js:1501-1502` en `1559-1560` geven een vaste array van acht `valueRanges` terug met
het ALV-overzicht op index 2. Vervang beide door een stub die de gevraagde namen uit de URL leest:

```js
        // Naam-gestuurd i.p.v. op index: gelaagd ophalen vraagt niet altijd dezelfde lijst,
        // en een index-stub is dan groen om de verkeerde reden.
        if(u.includes('values:batchGet')){
          const namen=[...u.matchAll(/ranges=([^&]+)/g)].map(m=>decodeURIComponent(m[1]));
          return new Response(JSON.stringify({ valueRanges: namen.map(n=>
            n==="ALV's overzicht" ? {values:blad} : {}) }),{status:200});
        }
```

(idem in het tweede blok, met `rijen(['V0','V1','V2'])` in plaats van `blad`.)

- [ ] **Stap 8: De trage groep meenemen in de 60s-regel van de timer**

De timer in `src/main.js` hoeft **niet** te wijzigen: `loadAll` beslist zelf of de trage groep
meemoet. Controleer wel dat de acht remmen ongemoeid blijven — die zijn er allemaal om een reden.

- [ ] **Stap 9: Tests draaien**

FAIL blijft 0, OK stijgt met 8. Controleer daarna handmatig in de console:

```js
(await import('/src/state.js')).state._laatsteTraagMs
```

Dat getal hoort hooguit één keer per minuut te veranderen.

- [ ] **Stap 10: Commit**

```bash
git add src/data.js src/api.js src/main.js src/state.js src/tests.js
git commit -m "Gelaagd ophalen: snelle groep elke 8s, trage groep elke minuut"
```

---

### Taak 5.2: Incrementeel staart-lezen van het Logboek

**Files:**
- Modify: `src/render-overig.js`, `src/data.js`, `src/state.js`
- Test: `src/tests.js`

Het Logboek is de grootste post in de leeslast en groeit onbeperkt. Na taak 5.1 wordt het nog
maar één keer per minuut gelezen; hier gaat het van "de hele geschiedenis" naar "alleen wat
erbij kwam".

> **Twee harde ontwerpeisen.** (1) `_row` blijft de **ruwe** Sheet-index — daar hangen bewerken
> en verwijderen van logregels aan. (2) De optimistische regels met `_row: 0` moeten ontdubbeld
> worden tegen de teruggelezen echte regels; vandaag lost een volledige herlezing dat vanzelf op.

- [ ] **Stap 1: Schrijf de falende tests**

```js
  // ── Logboek incrementeel: offset, volgorde en ontdubbeling ──
  (()=>{
    const kop=['Timestamp','Code','Sectie','Actie','Veld','Oud','Nieuw','Wie'];
    const r=(ts,code,actie)=>[ts,code,'OPPAKKEN',actie,'','','','jer'];
    // Volledige lezing: rij 1 is de kop, de eerste datarij is Sheet-rij 2.
    const vol=parseLogboek([kop, r('2026-07-01T10:00:00Z','A','Aangemaakt'),
                                 r('2026-07-02T10:00:00Z','B','Afgerond')]);
    eq('logboek: volledige lezing → nieuwste eerst', vol[0].code, 'B');
    eq('logboek: volledige lezing → _row is de ruwe Sheet-rij', vol[0]._row, 3);

    // Staartlezing vanaf Sheet-rij 3: geen koprij, en _row moet bij 3 beginnen.
    const staart=parseLogboek([r('2026-07-02T10:00:00Z','B','Afgerond')], 3);
    eq('logboek: staartlezing → _row telt door vanaf de startrij', staart[0]._row, 3);
    eq('logboek: staartlezing behandelt de eerste rij NIET als koprij', staart.length, 1);

    // Ontdubbeling: een optimistische regel (_row 0) verdwijnt zodra de echte binnenkomt.
    const opt={_row:0, timestamp:'2026-07-02T10:00:00.500Z', code:'B', sectie:'', actie:'Opmerking',
               veld:'', oudeWaarde:'', nieuweWaarde:'gebeld', gebruiker:'jer'};
    const echt={_row:9, timestamp:'2026-07-02T10:00:02.100Z', code:'B', sectie:'', actie:'Opmerking',
                veld:'', oudeWaarde:'', nieuweWaarde:'gebeld', gebruiker:'jer'};
    eq('logboek: optimistische regel wijkt voor de echte', _ontdubbelLog([echt], [opt]).length, 1);
    eq('logboek: en de ECHTE blijft over (met zijn Sheet-rij)', _ontdubbelLog([echt], [opt])[0]._row, 9);
    eq('logboek: een ándere regel blijft gewoon staan',
       _ontdubbelLog([echt], [{...opt, nieuweWaarde:'iets anders'}]).length, 2);
    eq('logboek: zonder optimistische regels verandert er niets', _ontdubbelLog([echt], []).length, 1);
  })();
```

- [ ] **Stap 2: Test draaien, moet falen**

- [ ] **Stap 3: `parseLogboek` een startrij geven**

In `src/render-overig.js`:

```js
// startRij = het Sheet-rijnummer van rows[0]. Weggelaten → 1, dus de klassieke vorm waarin
// rows[0] de koprij is en de eerste datarij Sheet-rij 2 is.
// Bij een staartlezing ('Logboek'!A400:H) is rows[0] géén koprij en telt _row door vanaf 400.
// _row MOET de ruwe Sheet-index blijven: bewerken en verwijderen van logregels schrijven op dat
// nummer, en de filter+reverse hieronder mag daar niets aan veranderen.
function parseLogboek(rows, startRij){
  if(!rows||!rows.length) return [];
  const start=startRij||1;
  const data=start===1 ? rows.slice(1) : rows;
  const eersteRij=start===1 ? 2 : start;
  return data.map((r,i)=>{
    const c=j=>((r&&r[j])||'').trim();
    return {
      _row:eersteRij+i,
      timestamp:c(0), code:c(1), sectie:c(2), actie:c(3),
      veld:c(4), oudeWaarde:c(5), nieuweWaarde:c(6), gebruiker:c(7)
    };
  }).filter(o=>o.timestamp&&!LOG_VERBORGEN.has(o.actie)).reverse();
}
```

- [ ] **Stap 4: De ontdubbeling**

Ook in `src/render-overig.js`:

```js
// Haalt de optimistische regels (_row 0) weg die inmiddels écht in de Sheet staan.
// NIET op timestamp vergelijken: bij twee van de drie optimistische paden (addTaskNote en
// saveKenmerken) is de lokale tijd een andere dan die de append in de Sheet zet — minstens de
// duur van het netwerkverkeer ertussen. De inhoud is wél gelijk, dus daarop matchen we.
// Puur, dus los testbaar.
const _logSleutel=o=>[o.code,o.sectie,o.actie,o.veld,o.nieuweWaarde,o.gebruiker].join('\x1f');
function _ontdubbelLog(echteRegels, optimistisch){
  const gezien=new Set((echteRegels||[]).map(_logSleutel));
  return (echteRegels||[]).concat((optimistisch||[]).filter(o=>!gezien.has(_logSleutel(o))));
}
```

- [ ] **Stap 5: Staart-lezen in `loadAll`**

In `src/state.js`: `_logHoogwater: 0,   // hoogste gelezen Sheet-rij van het Logboek (0 = nog niets)`

In `src/data.js`, bij het samenstellen van de namenlijst:

```js
    // Logboek: de eerste keer volledig, daarna alleen de staart. De hoogwaterstand is het
    // laatst gelezen Sheet-rijnummer; +1 is de eerste die we nog niet hebben.
    const logNaam = state._logHoogwater
      ? `'Logboek'!A${state._logHoogwater+1}:H`
      : 'Logboek';
```

en bij het toekennen:

```js
    zetAls(logNaam, r=>{
      const start = state._logHoogwater ? state._logHoogwater+1 : 1;
      const nieuwe = parseLogboek(r, start);
      const bestaand = state._logHoogwater ? D.logboek.filter(x=>x._row>0) : [];
      // Nieuwe staartregels vooraan (parseLogboek keert al om), daarna wat we al hadden, en pas
      // dán de nog niet bevestigde optimistische regels — die horen bovenaan te blijven staan
      // tot hun echte tegenhanger binnen is.
      D.logboek=_ontdubbelLog(nieuwe.concat(bestaand), D.logboek.filter(x=>x._row===0));
      // Hoogwaterstand pas NU opschuiven: gebeurt dat bij het lezen, dan gaan regels definitief
      // verloren zodra de pendingWrites-tak hierboven de ronde alsnog weggooit.
      const hoogste=Math.max(state._logHoogwater, ...nieuwe.map(x=>x._row), 0);
      if(hoogste) state._logHoogwater=hoogste;
    });
```

> **Bewust niet opgelost:** een logregel die een ánder wist of bewerkt, ziet deze weg niet — de
> staart kent alleen nieuwe rijen. Dat is aanvaardbaar omdat het Logboek een werkspoor is en geen
> auditspoor (zo staat het ook in de spec), en omdat de Logboek-pagina een eigen Vernieuwen-knop
> heeft die `state._logHoogwater=0` kan zetten voor een volledige herlezing. Bouw die reset in
> dezelfde stap.

- [ ] **Stap 6: Tests draaien en handmatig controleren**

FAIL blijft 0. Handmatig: voeg op de VvE-pagina een contactnotitie toe. Verwacht: de regel
verschijnt meteen (optimistisch) en **verdubbelt niet** zodra de volgende trage ronde binnenkomt.

- [ ] **Stap 7: Commit**

```bash
git add src/render-overig.js src/data.js src/state.js src/tests.js
git commit -m "Logboek: alleen nieuwe regels ophalen in plaats van de hele geschiedenis"
```

---

### Taak 5.3: Zichtbare offline-toestand

**Files:**
- Modify: `src/api.js`, `src/state.js`, `src/data.js`, `styles.css`
- Modify (callsites): `src/offerte-aannemers.js`, `src/kenmerken.js`, `src/render-herhaal.js`, `src/bulk.js`
- Test: `src/tests.js`

Vandaag doet het dashboard alsof een wijziging is opgeslagen terwijl er niets is vertrokken; pas
bij de mislukte write wordt het teruggedraaid. Offline moet **vóór** de optimistische mutatie
blokkeren.

- [ ] **Stap 1: Het signaal — falende tests eerst**

```js
  // ── Offline-signaal: alleen echte netwerkfouten tellen mee ──
  (()=>{
    eq('offline: browser zegt offline → offline', _isOffline(false, 0), true);
    eq('offline: browser online en geen netwerkfouten → online', _isOffline(true, 0), false);
    eq('offline: één netwerkfout is nog geen oordeel', _isOffline(true, 1), false);
    eq('offline: twee netwerkfouten op rij → offline', _isOffline(true, 2), true);
    // Het onderscheid netwerk vs. API: een fetch die rejectet heeft GEEN .status.
    eq('offline: fout zonder status telt als netwerkfout', _isNetwerkFout(new Error('Failed to fetch')), true);
    eq('offline: 401 telt NIET als netwerkfout', _isNetwerkFout(Object.assign(new Error('x'),{status:401})), false);
    eq('offline: 429 quotum telt NIET als netwerkfout', _isNetwerkFout(Object.assign(new Error('x'),{status:429})), false);
    eq('offline: 500 telt NIET als netwerkfout', _isNetwerkFout(Object.assign(new Error('x'),{status:500})), false);
  })();
```

- [ ] **Stap 2: Implementeren in `src/api.js`**

```js
// ── Offline-signaal ────────────────────────────────────────────────────────
// Uitdrukkelijk NIET state._syncFails: die telt óók mislukte inlogpogingen (data.js:145),
// 401/403 en quota-fouten mee. In een quotum-incident zou het dashboard zichzelf dan op slot
// zetten op precies het moment dat het zich aan het herstellen is.
//
// Het onderscheid is scherp te maken: een fetch die rejectet (geen netwerk, DNS, CORS-blokkade)
// gooit een TypeError ZONDER .status; elk antwoord van Google — ook 401, 429 en 500 — heeft er
// wél een. Alleen het eerste is bewijs dat de verbinding weg is.
const _isNetwerkFout = e => !!e && e.status===undefined;

// Twee op rij, zodat één hapering in de tunnel of de lift het dashboard niet meteen op slot zet.
function _isOffline(browserOnline, netwerkFouten){
  if(!browserOnline) return true;
  return (netwerkFouten||0) >= 2;
}
// De live toestand. Geen blijvende state.offline-vlag: die zou door de bestaande tests niet
// worden teruggezet en zou blijven hangen na een geslaagde ronde.
const isOffline = () => _isOffline(navigator.onLine, state._netwerkFouten||0);
```

Wikkel in `fetchSheet`, `fetchSheets`, `writeRange` en `appendRange` de `fetch`-aanroep zelf:

```js
  let r;
  try{ r=await fetch(url, opts); }
  catch(e){ state._netwerkFouten=(state._netwerkFouten||0)+1; throw e; }
  state._netwerkFouten=0;   // er kwám een antwoord — ook een 4xx bewijst dat er netwerk is
```

Repareer in dezelfde stap twee kleine dingen die dit onderscheid anders ondermijnen:
`writeRange` en `appendRange` doen `await r.json()` in het foutpad zónder `.catch`, en
`appendRange` zet geen `err.status`. Beide toevoegen.

In `src/state.js`: `_netwerkFouten: 0,   // opeenvolgende ECHTE netwerkfouten (fetch-reject zonder status)`

- [ ] **Stap 3: De vier plekken die vóór de guard muteren**

Het plan noemde er twee; het zijn er **vier**. Zet in elk de offline-check bovenaan, vóór de
mutatie:

```js
// src/offerte-aannemers.js — in addAannemer, toggleAannemerBinnen én verwijderAannemer
//   (alle drie muteren r.aannemers en renderen vóór _bewaar):
if(isOffline()){ showToast('Geen verbinding','Wijzigen kan niet zonder internet.','var(--rd)'); return; }

// src/kenmerken.js — vóór regel 54 (state.kenmerkenEdit=false), anders is de invoer weg
// src/render-herhaal.js — toggleHerhaalStatus, vóór `r.status=nieuw`
// src/bulk.js — de undo-callback van bulkVeld, vóór de items.forEach
```

- [ ] **Stap 4: De overige schrijfwegen**

Zet de check op de plek van de bestaande `ensureToken`-regel. **`ensureToken` is zelf géén
offline-poort:** met een geldig token in het geheugen doet hij geen netwerkverkeer en geeft hij
gewoon `true`.

Inventariseer met `grep -rn "writeRange\|appendRange\|batchUpdate" src/*.js` — 33 aanroepen in 13
bestanden, waarvan 15 rauwe `:batchUpdate`-fetches die `api.js` omzeilen. `api.js` is dus geen
choke point.

- [ ] **Stap 5: Vangnet in `backgroundWrite`**

```js
    // Laatste lijn. De aanroeper hoort al geblokkeerd te hebben (het contract van
    // backgroundWrite is dat de UI al optimistisch gemuteerd is), maar een gemiste callsite mag
    // niet stil doorlopen. Dit levert gratis de bestaande rollback + foutmelding op.
    if(isOffline()) throw Object.assign(new Error('Geen verbinding'), {offline:true});
```

- [ ] **Stap 6: Bewust NIET blokkeren: `logEvent`, `queueNotif` en `sendTestNotif`**

Die drie zijn fire-and-forget en falen vandaag al stil. Een offline-blokkade zou een logregel
definitief laten verdwijnen zonder dat iemand het ziet — erger dan de huidige situatie. Leg dat
vast in een comment bij `logEvent`.

- [ ] **Stap 7: De zichtbare toestand**

Hergebruik het bestaande banner-patroon (`showLoadError`, `role="alert"`, idempotente guard) en
de statusbalk. Twee vallen uit eerder werk:

- **De `[hidden]`-cascade:** krijgt de banner een eigen `display`-regel, dan moet er een eigen
  `[hidden]{display:none}` bij — anders staat hij permanent in beeld.
- **De focus-ring:** een strook met een eigen `overflow`-regel knipt de focusring van de knoppen
  eronder weg; geef 4px opvulling aan de klemmende zijden.

En let op: **een `disabled` knop valt uit de focus-trap van `modal-a11y.js`.** Wordt élke knop in
een modal offline gedempt, dan houdt die modal geen focusdoel over. Laat Annuleren/Sluiten dus
altijd actief.

- [ ] **Stap 8: Handmatig controleren**

DevTools → Network → Offline. Verwacht: de knoppen dempen, een taak opslaan geeft een melding en
**verandert de rij niet**. Terug online: alles werkt weer zonder herladen.

- [ ] **Stap 9: Commit**

```bash
git add src/
git commit -m "Offline: schrijven blokkeren vóór de optimistische wijziging, met eigen netwerkteller"
```

---

### Taak 5.4: Leescache

**Files:**
- Modify: `src/data.js`, `src/auth.js`, `src/state.js`
- Test: `src/tests.js`

Comfort bij het openen, geen offline-vermogen: inloggen is bij een koude start altijd
netwerkafhankelijk.

- [ ] **Stap 1: De sleutel**

```js
// Sleutel aan APP_VERSION én aan het e-mailadres. localStorage is origin-gebonden, niet
// gebruiker-gebonden: zonder het adres ziet collega B bij het openen eerst de stand van
// collega A. De versie erin zodat een gewijzigd dataformaat nooit een oude cache leest.
const _cacheSleutel = email => `cd_cache_${APP_VERSION}_${email||'onbekend'}`;
```

- [ ] **Stap 2: Wat erin moet**

**Alle tien velden van `D`**, inclusief `ntdSecInfo` en `afSecInfo`. Zonder die twee valt
`getInsertRow` terug op regel 2 (`src/crud.js:109`) en belandt een nieuwe taak bovenaan
`Nog Te Doen` in plaats van in zijn sectie.

De logboeklijst gaat er **ongewijzigd** in: niet hersorteren, niet comprimeren, niet ontdubbelen.
`_row` houdt bewust de ruwe Sheet-index.

- [ ] **Stap 3: Wanneer schrijven**

Pas ná het toekennen van alle velden — dus ná het `zetAls`-blok, en **niet** in de
`pendingWrites>0`-tak, want daar wordt de verse data juist als niet-leidend verworpen.

Omvang: de gemeten poll-omvang is 563.675 tekens; localStorage geeft ~5 MB per origin en JS-tekens
zijn 2 bytes. Dat is ~1,1 MB — het past, maar controleer het en vang `QuotaExceededError` af met
een stille `removeItem`.

- [ ] **Stap 4: `logout()` moet hem wissen**

`logout()` raakt localStorage vandaag **nergens** aan. Voeg het wissen toe — anders blijft de
stand van de vorige gebruiker op een gedeelde computer staan.

- [ ] **Stap 5: Tests, handmatige controle en commit**

Test de sleutelopbouw en dat `logout()` wist. Handmatig: laad, log uit, controleer dat de sleutel
weg is.

```bash
git add src/
git commit -m "Leescache: dashboard toont meteen de laatste stand bij openen"
```

---

### Taak 5.5: Fase 5 uitrollen

- [ ] **Stap 1: Versies** — `APP_VERSION = '10.1'`, `CACHE_VERSION = 'cd-v96'`.
- [ ] **Stap 2: Volledige testronde** lokaal, FAIL = 0.
- [ ] **Stap 3: Naar staging**, daarna een **ingelogde** ronde: taak opslaan, afronden, ongedaan
      maken, notitie toevoegen, en offline zetten in DevTools.
- [ ] **Stap 4: Meten of het gewerkt heeft.** Na één minuut ingelogd:

```js
(await import('/src/state.js')).state._lastDHash?.length
```

Vergelijk met de nulmeting van **563.675** tekens uit Taak 0.1.

- [ ] **Stap 5: Naar productie**, controleer het versienummer op de Pages-URL.

---

### Bewust buiten fase 5

| Wat | Waarom niet |
|---|---|
| Een offline-schrijfwachtrij | Wijzigingen die later "vanzelf" wegschrijven zijn onvoorspelbaar; blokkeren is eerlijker |
| Service worker naar cache-first | Eerder door de gebruiker afgewezen; niet opnieuw voorstellen |
| De `Meldingen`-poll van 10 s meenemen | Goedkoopste resterende winst (6 van de 13,5 leesverzoeken per minuut), maar hij raakt de meldingenweg en verdient een eigen ronde |
| `logEvent`/`queueNotif` offline blokkeren | Zou een logregel definitief laten verdwijnen zonder dat iemand het ziet |
| Logregels die een ánder wist of bewerkt terugzien in de staart | De staart kent alleen nieuwe rijen; de Vernieuwen-knop zet de hoogwaterstand terug |

---

## Zelfcontrole van dit plan

- **Spec-dekking:** fase 0 → taken 0.1-0.4; fase 1 → 1.1-1.5; fase 2 → 2.1-2.11; fase 3 →
  3.1-3.3; fase 4 → 4.1-4.3 (uitgeschreven op 2026-07-29, nadat 0.2 en fase 1 af waren);
  fase 5 → 5.1-5.5 (uitgeschreven op 2026-07-29, nadat fase 4 live was). De "bewust niet"-tabel
  uit de spec leidt tot geen taken, zoals bedoeld.
- **Correcties op de spec bij het uitschrijven van fase 5:** de spec noemt **twee** plekken die
  vóór de guard muteren; het zijn er **vier** (`offerte-aannemers.js` met drie aanroepers,
  `kenmerken.js`, `toggleHerhaalStatus`, de undo-callback van `bulkVeld`). De spec noemt **één**
  test-stub met acht `valueRanges`; het zijn er **twee**, en ze staan in het `doeReset`-blok, niet
  in de quotum-test. En `ensureToken()` is géén offline-poort: met een geldig token in het
  geheugen geeft hij offline gewoon `true`.
- **Correctie op de spec, vastgesteld bij het uitschrijven van fase 4:** de spec stelt dat de
  tussenmaatregel de bestaande serialisatie `serializeNtdUndo` kan hergebruiken. Dat dekt maar
  8 van de 18 callsites (de functie kent alleen `Nog Te Doen`) en neemt kolom N mee, die de
  Apps-Script-escalatiemotor elke ochtend stempelt. Taak 4.2 bouwt daarom een eigen, smallere
  vingerafdruk. Zie het kader in Taak 4.2.
- **Bewust buiten dit plan:** de dagelijkse Apps Script-structuurcontrole — de spec stelt die
  expliciet uit tot ná fase 3, omdat de melding zonder frontend-wijziging bij niemand aankomt.
  En de zichtbare structuurbanner (trap 2 van fase 3): de drempel daarvoor hangt af van wat de
  observatie in Taak 3.3 oplevert.
- **Twee beslispunten die de gebruiker moet beantwoorden vóór de betreffende taak:** de
  bestemming van de wekelijkse export (Taak 1.5) en het mechanisme voor het taaknummer
  (Taak 4.1).
- **Naamconsistentie:** `metWriteMarkering`, `schrijfActieLoopt`, `setSaving`, `_writeStart`,
  `checkSecties`, `checkRaster`, `RASTER_MIN` — overal identiek gebruikt.
