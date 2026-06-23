# Spraakmemo's per taak — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een teamlid kan vanaf telefoon of PC een korte spraakmemo (max. 2 min) achterlaten op een specifieke taak/item in het Collectief Dashboard, zodat een collega die het werk overneemt de context hoort. Meerdere memo's per item (nieuwste boven), afspelen, terug-inspreken, verwijderen. Push + in-app melding naar de behandelaar (niet de inspreker). Automatisch opruimen na 30 dagen, plus een afrond-vinkje voor directe verwijdering.

**Architecture:** De browser-PWA neemt audio op (`MediaRecorder`), uploadt base64 + OAuth-token naar een nieuw, token-beveiligd Apps Script "memo-loket" (`doPost`). Het loket valideert het token (tokeninfo → `aud`-check → allowlist, spiegelt `api/chat.js`), schrijft het audiobestand in één centrale Drive-map (bedrijfseigendom), legt een metadata-rij vast in de tab "Spraakmemo's" (kolommen A–L) en stuurt een melding naar de behandelaar. De front-end leest de metadata-tab via de bestaande Sheets-API, groepeert per `list|itemId` in `D.memos`, toont een teller-badge + uitklap-memolijst, en speelt af via `getmemo` (base64 → object-URL, sessie-gecachet). Items krijgen lazy een verborgen ID (`IT-…`) in een vaste kolom per lijst. Een dagelijkse tijd-trigger ruimt memo's > 30 dagen op.

**Tech Stack:** Vanilla ES-module front-end (`src/*.js`, geen bundler/npm); in-browser testharness `src/tests.js` (open `index.html?test=1` → `window._testResult`, no-cache python-server uit `~/.claude`); Apps Script ES5 (`.gs`, `var`/`function`); Google Drive + Google Sheets als backend; OneSignal voor push. Werk op branch `feature/spraakmemo`. Commits klein, Nederlandse boodschap, eindigend op `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Bestandsoverzicht

**Nieuw:**
- `apps-script/Spraakmemo.gs` — memo-loket backend: auth (`cd_memoAuth`), Drive-map (`cd_memoFolder`/`cd_memoSetupFolder`), metadata-tab (`cd_memoSheet`), upload/lees/verwijder (`cd_uploadMemo`, `cd_getMemo`, `cd_deleteMemo`, `cd_deleteItemMemos`), melding (`cd_notifyNewMemo`), opruiming (`cd_cleanupMemos`) + trigger-setup.
- `src/spraakmemo.js` — front-end module: identiteit (`genItemId`, `ensureItemId`, `idCellA1`), parsing (`parseMemos`, `memoCount`, `memoBadgeHtml`), mime/payload (`pickMimeType`, `buildUploadPayload`), opname/afspelen/render (`openMemoRecorder`, `playMemo`, `renderMemoList`, `toggleMemoSectie`, `verwijderMemo`, `deleteItemMemos`), afrond-helptekst (`memoAfrondHelp`), pure spiegel `memoIsVerlopen`.

**Gewijzigd:**
- `src/config.js` — nieuwe constanten (`APPS_SCRIPT_URL*`, `MEMO_SHEET`, `MEMO_MAX_SEC`, `MEMO_RETENTIE_DAGEN`, `LIST_ID_COL`, `LIST_SHEET`) + `APP_VERSION` ophogen.
- `src/api.js` — `callMemoLoket(action, payload)`.
- `src/state.js` — `D.memos:{}`.
- `src/data.js` — `loadAll` leest `MEMO_SHEET` (uit config.js), parsers `parseSections` (NTD + Afgerond)/`parseAlvo`/`parseAlfa` lezen `itemId`.
- `src/render-overig.js` — `parseOntw` leest `itemId`; badge op Ontwikkeling.
- `src/render-tabel.js` — badge in NTD-tabel.
- `src/render-vve.js` — badge + memosectie op per-VvE-pagina.
- `src/render-alv.js` — badge op ALV-overzicht/afgerond.
- `src/render-offerte.js` — badge in de offerte-tab DEFAULT-weergave (hero-kaart + focus-/groep-rij; gaat niet via `rowNtd`).
- `src/render-vandaag.js` — badge in de Dagstart-cockpit ("Vandaag", afgeleide weergave, spec §3).
- `src/render-analytics.js` — badge in de Dashboard-tabel "Recent afgerond" (afgeleide weergave, spec §3).
- `src/actions.js` — memo-acties in de delegatie-listener.
- `src/crud.js` — afrond-vinkje + `deleteitemmemos`-aanroep.
- `src/notifications.js` — `memo`-voorkeur, `n_memo` toast-type/icoon/kleur.
- `index.html` — afrond-modal checkbox + notif-modal toggle.
- `apps-script/Notifications.gs` — `doPost` memo-routing (naast ongewijzigde secret-route).
- `apps-script/appsscript.json` — expliciete `oauthScopes` incl. Drive.
- Hoofd-stylesheet — memo-CSS.
- `src/tests.js` — imports + nieuwe testblokken.

**Afhankelijkheids-volgorde (kritiek):** grid-verbreding + tab-aanmaak (TEST+PROD) MOETEN vóór elke ID-schrijfactie staan, anders faalt de `writeRange` (zelfde landmijn als de offerte-uitbreiding). Config + `callMemoLoket` + `D.memos` moeten bestaan vóór de front-end pure-helper-tests, anders breekt de module-import in de harness. Géén enkele taak mag uit `src/spraakmemo.js` importeren of ervan testen vóórdat dat bestand bestaat — daarom wordt het bestand én alle pure-helper-tests (incl. `memoIsVerlopen`) pas vanaf Taak 20 aangemaakt/geïmporteerd; `data.js` (Taak 26) importeert `parseMemos` ook pas ná Taak 20. De `setup`-trigger draait pas ná de `cd_cleanupMemos`-implementatie (Taak 15).

---

## Taak 1: Infra — config-constanten skeleton + falende test

- [ ] Wijzig de config-import-regel in `/Users/servicedesk/collectief-dashboard/src/tests.js` (regel 6, de `from "./config.js"`-regel — niet regel 5, die is de render-overig-import) van:
```js
import { _isStagingHost, APP_VERSION } from "./config.js";
```
naar:
```js
import { _isStagingHost, APP_VERSION, MEMO_SHEET, MEMO_MAX_SEC, MEMO_RETENTIE_DAGEN, LIST_ID_COL, LIST_SHEET } from "./config.js";
```
- [ ] Voeg vlak vóór regel 880 (`const totOk = ...`) toe:
```js
  // ── Spraakmemo-infrastructuur: config-contract ──
  console.log('%c[TESTS] Spraakmemo config', 'background:#4a5b7a;color:white;padding:2px 6px;border-radius:3px');
  eq('memo: MEMO_SHEET',        MEMO_SHEET,        "Spraakmemo's");
  eq('memo: MEMO_MAX_SEC',      MEMO_MAX_SEC,      120);
  eq('memo: MEMO_RETENTIE',     MEMO_RETENTIE_DAGEN, 30);
  eq('memo: LIST_ID_COL.NTD',   LIST_ID_COL.NTD,   16);
  eq('memo: LIST_ID_COL.ALVO',  LIST_ID_COL.ALVO,  6);
  eq('memo: LIST_ID_COL.ALFA',  LIST_ID_COL.ALFA,  3);
  eq('memo: LIST_ID_COL.ONTW',  LIST_ID_COL.ONTW,  6);
  eq('memo: LIST_SHEET.NTD',    LIST_SHEET.NTD,    'Nog Te Doen');
  eq('memo: LIST_SHEET.ALVO',   LIST_SHEET.ALVO,   "ALV's overzicht");
  eq('memo: LIST_SHEET.ALFA',   LIST_SHEET.ALFA,   "ALV's afgerond");
  eq('memo: LIST_SHEET.ONTW',   LIST_SHEET.ONTW,   'Ontwikkeling');
```
- [ ] Start de no-cache python-server (`~/.claude`), open `index.html?test=1`, lees `window._testResult`. **Verwacht: FAIL** (module-load faalt op ontbrekende named exports → suite breekt / `_testResult` leeg of FAIL). Dit bevestigt dat de test echt op de nog-ontbrekende constanten leunt.

## Taak 2: Infra — config-constanten implementeren (groen)

- [ ] Bewerk `/Users/servicedesk/collectief-dashboard/src/config.js`. Voeg direct ná regel 28 (de `PROXY_URL`-regel) toe:
```js

// ── Spraakmemo-loket (Apps Script web-app) ────────────────────────────
// Token-beveiligd endpoint dat audio in Drive opslaat + metadata bijwerkt.
// Vul de exec-URL's in NÁ de web-app-deploy (clasp/CI), per omgeving.
export const APPS_SCRIPT_URL_PROD = '<<WEB-APP EXEC-URL NA DEPLOY INVULLEN>>';
export const APPS_SCRIPT_URL_TEST = '<<TEST WEB-APP EXEC-URL>>';
export const APPS_SCRIPT_URL = IS_STAGING ? APPS_SCRIPT_URL_TEST : APPS_SCRIPT_URL_PROD;

// ── Spraakmemo-constanten ─────────────────────────────────────────────
export const MEMO_SHEET = "Spraakmemo's";   // metadata-tab (A..L)
export const MEMO_MAX_SEC = 120;             // max opnameduur per memo (s)
export const MEMO_RETENTIE_DAGEN = 30;       // auto-opruimen na N dagen
// Per werk-lijst: het tabblad én de 0-based kolomindex van het verborgen item-ID.
// Sleutels: 'NTD','ALVO','ALFA','ONTW'. Grid moet deze kolom bevatten (zie infra-taken).
export const LIST_SHEET  = { NTD:'Nog Te Doen', ALVO:"ALV's overzicht", ALFA:"ALV's afgerond", ONTW:'Ontwikkeling' };
export const LIST_ID_COL = { NTD:16, ALVO:6, ALFA:3, ONTW:6 };
```
> De `<<…>>`-plaatshouders zijn een gedocumenteerde deploy-stap (zie Deploy-sectie, stap 4: web-app exec-URL's invullen), geen code-placeholder; de overige constanten zijn volledig en testbaar.
- [ ] Herlaad `index.html?test=1` (hard-refresh i.v.m. SW/cache). **Verwacht: PASS** — de 11 `memo:`-asserts in OK, FAIL terug op baseline.

## Taak 3: Infra — commit config-constanten

- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/config.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: config-constanten (loket-URL, MEMO_*, LIST_ID_COL/LIST_SHEET) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] Verificatie: `git -C … log --oneline -1` toont de commit; `git -C … branch --show-current` toont `feature/spraakmemo`.

> **Opmerking:** een ander deel beschrijft dezelfde `config.js`-constanten (data-agent). Dit is bewust één keer uitgevoerd in Taak 2; de data-agent-versie is hier gededupliceerd.

## Taak 4: Sheets — TEST-Sheet grid verbreden (ID-kolommen)

> De ID-schrijfactie faalt als het grid de kolom niet heeft (zelfde landmijn als de offerte-uitbreiding, spec §6/§12). Daarom eerst verbreden.

- [ ] Meet met de Sheets-MCP `google_sheets-get-spreadsheet-info` op TEST-Sheet `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4` (`SID_TEST`, config.js regel 24) per tab de `gridProperties.columnCount`.
- [ ] Verbreed waar nodig met `google_sheets-insert-dimension` (`COLUMNS`) of `batchUpdate` `appendDimension`:
```json
{ "requests": [
  { "appendDimension": { "sheetId": "<NTD_sheetId>",  "dimension": "COLUMNS", "length": "<17 - huidigeNTD>" } },
  { "appendDimension": { "sheetId": "<ALVO_sheetId>", "dimension": "COLUMNS", "length": "<7  - huidigeALVO>" } },
  { "appendDimension": { "sheetId": "<ALFA_sheetId>", "dimension": "COLUMNS", "length": "<4  - huidigeALFA>" } },
  { "appendDimension": { "sheetId": "<ONTW_sheetId>", "dimension": "COLUMNS", "length": "<7  - huidigeONTW>" } }
]}
```
(Laat een request weg als de tab al breed genoeg is; `length` moet > 0 zijn.)
- [ ] Verificatie: `get-spreadsheet-info` opnieuw → `columnCount`: Nog Te Doen ≥ 17, ALV's overzicht ≥ 7, ALV's afgerond ≥ 4, Ontwikkeling ≥ 7. Noteer per tab het gemeten getal.

## Taak 5: Sheets — PROD-Sheet grid verbreden (ID-kolommen)

- [ ] Herhaal Taak 4 op PROD-Sheet `1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw` (`SID_PROD`, config.js regel 23). Zelfde doel-breedtes. Bepaal sheetId's en `length` opnieuw via `get-spreadsheet-info`.
> Let op: ALV's overzicht heeft checkbox-kolommen C/D/E waarop `onEdit`/`verplaatsALV` reageert + stat-rijen onderaan; kolommen rechts toevoegen (richting G) raakt die triggers niet (spec §6).
- [ ] Verificatie: `get-spreadsheet-info` op PROD bevestigt Nog Te Doen ≥ 17, ALV's overzicht ≥ 7, ALV's afgerond ≥ 4, Ontwikkeling ≥ 7.

## Taak 6: Sheets — TEST-Sheet tab "Spraakmemo's" aanmaken (A..L)

- [ ] Maak in TEST-Sheet `1-6Q36CrwB0szX2DS2eLjPwfiY-jAw8lK9JOPDSlljm4` een tabblad met titel exact `Spraakmemo's` (typografische rechte apostrof) via `google_sheets-add-worksheet`.
- [ ] Zet kopregel A1:L1 (`google_sheets-update-row`) exact, in deze volgorde:
```
Timestamp | MemoID | Lijst | VvECode | Sectie | ItemID | Snapshot | Door | DriveFileID | DuurSec | Mime | Status
```
- [ ] Bevries de kopregel: `batchUpdate` `updateSheetProperties` met `gridProperties.frozenRowCount = 1`, fields `gridProperties.frozenRowCount`.
- [ ] Verificatie: `google_sheets-get-values-in-range` op `'Spraakmemo''s'!A1:L1` (apostrof verdubbeld) geeft exact de 12 koppen in bovenstaande volgorde.

## Taak 7: Sheets — PROD-Sheet tab "Spraakmemo's" aanmaken (A..L)

- [ ] Herhaal Taak 6 op PROD-Sheet `1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`: tab `Spraakmemo's`, kopregel A1:L1 = `Timestamp | MemoID | Lijst | VvECode | Sectie | ItemID | Snapshot | Door | DriveFileID | DuurSec | Mime | Status`, frozen rows = 1.
- [ ] Verificatie: `get-values-in-range` op `'Spraakmemo''s'!A1:L1` in PROD geeft exact dezelfde 12 koppen.

## Taak 8: Apps Script — nieuw bestand Spraakmemo.gs met auth-kern (cd_memoAuth)

> Maak `/Users/servicedesk/collectief-dashboard/apps-script/Spraakmemo.gs` aan. Dit bestand wordt in latere taken aangevuld met folder/sheet/upload/get/delete/notify/cleanup. Begin met de header, gedeelde `var`-constanten en de auth-functie (spiegelt `api/chat.js` regels 48-53).

- [ ] Maak het bestand met deze inhoud:
```javascript
/****************************************************************
 *  Collectief Dashboard — Spraakmemo-loket                     *
 *  ----------------------------------------------------------- *
 *  Token-beveiligd web-app-loket voor spraakmemo's per taak.   *
 *  Spiegelt de auth van api/chat.js: tokeninfo → aud-check →   *
 *  allowlist. Staat NAAST de bestaande CD_WEBHOOK_SECRET-route *
 *  (mail-intake) in Notifications.gs, die ongewijzigd blijft.  *
 *                                                              *
 *  Eénmalige setup (in deze volgorde, in de editor draaien):   *
 *   1. cd_memoSetupFolder()      → Drive-map + property         *
 *   2. cd_memoSheet()            → metadata-tab (lazy)          *
 *   3. cd_setupMemoCleanup()     → dagelijkse opruim-trigger    *
 *      (PAS draaien NADAT cd_cleanupMemos bestaat)              *
 ****************************************************************/

// Dezelfde Google OAuth-client als api/chat.js EXPECTED_AUD en src/config.js clientId.
// Env-var bestaat hier niet (Apps Script); de id staat als vaste constante, gelijk aan de
// fallback in api/chat.js regel 20.
var CD_MEMO_EXPECTED_AUD = '560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com';

// Bewuste kopie van allowed-emails.js: Apps Script kan die ES-module niet importeren.
// Houd 1-op-1 gelijk bij personeelswissel (zie ook src/config.js en api/chat.js).
var CD_MEMO_ALLOWED_EMAILS = [
  'info@vvebeheercollectief.nl',
  'djiowchico@gmail.com',
  'gabrielateterycz1616@gmail.com',
  'giocan175@gmail.com'
];

// E-mail → teamnaam, gelijk aan EMAIL_NAMES in src/config.js. Voor de "Door"-kolom/melding.
var CD_EMAIL_NAMES = {
  'info@vvebeheercollectief.nl': 'Jer',
  'djiowchico@gmail.com': 'Cihad',
  'gabrielateterycz1616@gmail.com': 'Gabos',
  'giocan175@gmail.com': 'Cihan'
};

var MEMO_SHEET = "Spraakmemo's";
var MEMO_MAX_SEC = 120;
var MEMO_RETENTIE_DAGEN = 30;

// Geldige lijst-sleutels (kolom C in de metadata-tab). Spiegelt LIST_SHEET in src/config.js.
var CD_MEMO_LIJSTEN = { NTD: 1, ALVO: 1, ALFA: 1, ONTW: 1 };

// Auth: valideer het meegestuurde Google OAuth access-token. Eén tokeninfo-call levert aud
// (audience-check tegen onze client → blokkeert confused-deputy) én email; HTTP 400 = verlopen/
// ongeldig. Geeft {ok:true,email} of {ok:false}.
function cd_memoAuth(token) {
  if (!token) return { ok: false };
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return { ok: false };
    var info = JSON.parse(resp.getContentText());
    if (info.aud !== CD_MEMO_EXPECTED_AUD) return { ok: false };
    var email = (info.email || '').toString().trim().toLowerCase();
    if (!email || CD_MEMO_ALLOWED_EMAILS.indexOf(email) === -1) return { ok: false };
    return { ok: true, email: email };
  } catch (e) {
    Logger.log('cd_memoAuth fout: ' + e);
    return { ok: false };
  }
}
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: nieuw bestand met token-auth (cd_memoAuth)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (Apps Script-editor):** plak de inhoud in een nieuw script-bestand `Spraakmemo.gs` van het TEST-project. Voeg tijdelijk toe en draai:
```javascript
function test_cd_memoAuth() {
  Logger.log('leeg → ' + JSON.stringify(cd_memoAuth('')));            // verwacht {"ok":false}
  Logger.log('rommel → ' + JSON.stringify(cd_memoAuth('xyz')));        // verwacht {"ok":false}
  Logger.log('geldig → ' + JSON.stringify(cd_memoAuth('<GELDIG_TOKEN>'))); // verwacht {"ok":true,"email":"..."}
}
```
(Vervang `<GELDIG_TOKEN>` door `state.oauthToken` uit de browser-console.) **Verwacht:** eerste twee regels `{"ok":false}`; derde `{"ok":true,"email":"info@vvebeheercollectief.nl"}`. Verwijder de testfunctie daarna.

## Taak 9: Apps Script — cd_memoFolder + cd_memoSheet + cd_memoSetupFolder

- [ ] Voeg in `apps-script/Spraakmemo.gs` ná `cd_memoAuth` toe:
```javascript
// Centrale Drive-map (bedrijfseigendom) voor de audio-bestanden. Map-ID in Script Properties.
function cd_memoFolder() {
  var id = PropertiesService.getScriptProperties().getProperty('CD_MEMO_FOLDER_ID');
  if (!id) throw new Error('CD_MEMO_FOLDER_ID ontbreekt — draai eerst cd_memoSetupFolder().');
  return DriveApp.getFolderById(id);
}

// Metadata-tab "Spraakmemo's". Lazy aangemaakt met de A..L-kop (spec §7).
function cd_memoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MEMO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MEMO_SHEET);
    sheet.appendRow(['Timestamp','MemoID','Lijst','VvECode','Sectie','ItemID','Snapshot','Door','DriveFileID','DuurSec','Mime','Status']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// EENMALIG: maak de centrale Drive-map "Spraakmemo's" en leg het ID vast.
// Idempotent: hergebruikt de map als de property al gezet is.
function cd_memoSetupFolder() {
  var props = PropertiesService.getScriptProperties();
  var bestaand = props.getProperty('CD_MEMO_FOLDER_ID');
  if (bestaand) {
    try {
      var f = DriveApp.getFolderById(bestaand);
      Logger.log('Map bestaat al: ' + f.getName() + ' (' + bestaand + ')');
      return bestaand;
    } catch (e) {
      Logger.log('Opgeslagen map-ID werkt niet meer (' + e + ') — nieuwe map aanmaken.');
    }
  }
  var map = DriveApp.createFolder("Spraakmemo's");
  props.setProperty('CD_MEMO_FOLDER_ID', map.getId());
  Logger.log('Drive-map "Spraakmemo\'s" aangemaakt — ID = ' + map.getId());
  return map.getId();
}
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_memoFolder + cd_memoSheet + cd_memoSetupFolder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (TEST-project):** draai `cd_memoSetupFolder()` in de editor. **Verwacht log:** `Drive-map "Spraakmemo's" aangemaakt — ID = <id>`. Controleer in Drive (bedrijfsaccount) dat de map bestaat en eigendom is van info@vvebeheercollectief.nl. Project Settings → Script Properties: `CD_MEMO_FOLDER_ID` ingevuld. Draai nogmaals → log `Map bestaat al: …` (idempotent). Draai `cd_memoSheet()` één keer:
```javascript
function test_cd_memoFolderSheet() {
  Logger.log('map → ' + cd_memoFolder().getName());     // verwacht: Spraakmemo's
  Logger.log('tab → ' + cd_memoSheet().getName());      // verwacht: Spraakmemo's
  Logger.log('kop → ' + cd_memoSheet().getRange(1,1,1,12).getValues()[0].join(','));
}
```
**Verwacht:** `map → Spraakmemo's`, `tab → Spraakmemo's`, kop = `Timestamp,MemoID,Lijst,VvECode,Sectie,ItemID,Snapshot,Door,DriveFileID,DuurSec,Mime,Status`. Verwijder de testfunctie. Herhaal `cd_memoSetupFolder()` in het PROD-project (eigen `CD_MEMO_FOLDER_ID`).

## Taak 10: Apps Script — cd_uploadMemo (base64 → Drive + metadata-rij + memoId)

- [ ] Voeg in `apps-script/Spraakmemo.gs` ná `cd_memoSheet` toe:
```javascript
// memoId volgens gedeeld contract: "M-" + base36-tijd + "-" + 4 random base36.
function cd_genMemoId() {
  var r = '';
  for (var i = 0; i < 4; i++) r += Math.floor(Math.random() * 36).toString(36);
  return 'M-' + (new Date().getTime()).toString(36) + '-' + r;
}

// Alleen de mime-types die MediaRecorder in de browser levert (webm/opus desktop, mp4/aac iOS).
var CD_MEMO_MIME_OK = { 'audio/webm': '.webm', 'audio/mp4': '.m4a' };
// base64 is ~4/3 van de bytes; 120s audio blijft ruim onder ~8 MB. Harde bovengrens als misbruikrem.
var CD_MEMO_MAX_B64 = 12 * 1024 * 1024;

// Upload: valideer invoer → Drive-bestand → metadata-rij → melding. Retourneert {ok,memoId,fileId,timestamp}.
function cd_uploadMemo(data) {
  var list = (data.list || '').toString().trim();
  if (!CD_MEMO_LIJSTEN[list]) throw new Error('Onbekende lijst: ' + list);

  var mime = (data.mime || '').toString();
  var ext = CD_MEMO_MIME_OK[mime];
  if (!ext) throw new Error('Onbekend mime-type: ' + mime);

  var b64 = (data.audioB64 || '').toString();
  if (!b64) throw new Error('Geen audio ontvangen.');
  if (b64.length > CD_MEMO_MAX_B64) throw new Error('Audio te groot.');

  var durationSec = Math.round(Number(data.durationSec) || 0);
  if (durationSec < 0) durationSec = 0;
  if (durationSec > MEMO_MAX_SEC) durationSec = MEMO_MAX_SEC;

  var code     = (data.code || '').toString().trim();
  var sectie   = (data.sectie || '').toString().trim();
  var itemId   = (data.itemId || '').toString().trim();
  var snapshot = (data.snapshot || '').toString();
  var door     = (data._door || '').toString().trim();   // ingevuld door doPost uit de auth-email

  var res = cd_withLock(function () {
    var memoId = cd_genMemoId();
    var ts = new Date().toISOString();

    // base64 → Blob → Drive-bestand in de centrale map.
    var bytes = Utilities.base64Decode(b64);
    var blob = Utilities.newBlob(bytes, mime, memoId + ext);
    var file = cd_memoFolder().createFile(blob);
    var fileId = file.getId();

    // Metadata-rij A..L (Status leeg = actief). cd_safeCell (Notifications.gs) neutraliseert
    // formule-prefixen in van-buiten-komende tekst (snapshot/code/door).
    cd_memoSheet().appendRow([
      ts, memoId, list, cd_safeCell(code), cd_safeCell(sectie),
      itemId, cd_safeCell(snapshot), cd_safeCell(door), fileId, durationSec, mime, ''
    ]);

    // Push naar de behandelaar(s) van het item; niet naar de inspreker (actor=door).
    try { cd_notifyNewMemo(code, snapshot, cd_memoBehandelaar(list, code, itemId), sectie, door, snapshot); }
    catch (e) { Logger.log('cd_notifyNewMemo fout (memo wél opgeslagen): ' + e); }

    return { ok: true, memoId: memoId, fileId: fileId, timestamp: ts };
  });
  // cd_withLock geeft undefined terug als de lock niet binnen 10s verkregen wordt
  // (Notifications.gs:48). Dan zou doPost JSON.stringify(undefined) → 'null' versturen
  // en de front-end vaag falen; vang het hier af met een nette fout.
  if (!res) return { ok: false, error: 'Loket bezig, probeer opnieuw.' };
  return res;
}
```
> `cd_notifyNewMemo` + behandelaar-lookup `cd_memoBehandelaar(list, code, itemId)` worden in Taak 13/14 geleverd. Gebruikte bestaande helpers: `cd_withLock` (Notifications.gs:45), `cd_safeCell` (Notifications.gs:620).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_uploadMemo (base64 naar Drive + metadata-rij + memoId)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (TEST-project, ná Taak 13/14):** draai:
```javascript
function test_cd_uploadMemo() {
  var fake = Utilities.base64Encode('dummy-audio-bytes');
  var r = cd_uploadMemo({ list:'NTD', code:'VVE-TEST', sectie:'OPPAKKEN', itemId:'IT-test-aaaa',
    snapshot:'Test memo upload', durationSec:7, mime:'audio/webm', audioB64:fake, _door:'Jer' });
  Logger.log(JSON.stringify(r));
}
```
**Verwacht:** `{"ok":true,"memoId":"M-...","fileId":"...","timestamp":"...Z"}`; Drive-bestand `M-….webm` in de map; tab-rij met `Status` leeg, `Lijst=NTD`, `DuurSec=7`, `Mime=audio/webm`. Negatieve check: `mime:'audio/ogg'` → fout `Onbekend mime-type: audio/ogg`, geen bestand/rij. Ruim testbestand+rij+functie op.

## Taak 11: Apps Script — cd_getMemo (Drive-blob → base64)

- [ ] Voeg in `apps-script/Spraakmemo.gs` ná `cd_uploadMemo` toe:
```javascript
// Lees één memo terug als base64 (op aanvraag, voor afspelen). Read-only.
function cd_getMemo(data) {
  var memoId = (data.memoId || '').toString().trim();
  if (!memoId) throw new Error('Geen memoId.');

  var sheet = cd_memoSheet();
  var last = sheet.getLastRow();
  if (last < 2) throw new Error('Memo niet gevonden: ' + memoId);
  var rows = sheet.getRange(2, 1, last - 1, 12).getValues(); // A..L

  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString() !== memoId) continue;        // kol B = MemoID
    if ((rows[i][11] || '').toString() === 'VERWIJDERD') break;    // kol L = Status
    var fileId = (rows[i][8] || '').toString();                    // kol I = DriveFileID
    var mime   = (rows[i][10] || '').toString();                   // kol K = Mime
    var blob = DriveApp.getFileById(fileId).getBlob();
    return { ok: true, mime: mime || blob.getContentType(), audioB64: Utilities.base64Encode(blob.getBytes()) };
  }
  throw new Error('Memo niet gevonden: ' + memoId);
}
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_getMemo (Drive-blob naar base64)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie:** maak eerst een upload-testmemo, noteer `memoId`. Draai:
```javascript
function test_cd_getMemo() {
  var r = cd_getMemo({ memoId: '<MEMO_ID_UIT_UPLOAD>' });
  Logger.log('ok=' + r.ok + ' mime=' + r.mime + ' b64len=' + (r.audioB64 || '').length);
  Logger.log('decode → ' + Utilities.newBlob(Utilities.base64Decode(r.audioB64)).getDataAsString());
}
```
**Verwacht:** `ok=true mime=audio/webm b64len=...`; `decode → dummy-audio-bytes`. Onbekend memoId → fout `Memo niet gevonden: …`. Ruim de testmemo op.

## Taak 12: Apps Script — cd_deleteMemo + cd_deleteItemMemos + cd_trashDriveFile

- [ ] Voeg in `apps-script/Spraakmemo.gs` toe:
```javascript
// ── Eén memo verwijderen (verwijderknop in de UI) ──────────────
// data = { memoId }. Trasht het Drive-bestand en markeert de metadata-rij 'VERWIJDERD'.
// Idempotent: onbekend/al-verwijderd memoId → {ok:true} zonder fout.
function cd_deleteMemo(data) {
  var memoId = (data && data.memoId || '').toString().trim();
  if (!memoId) return { ok: false, error: 'memoId ontbreekt' };

  var sheet = cd_memoSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true };                 // lege tab

  var rows = sheet.getRange(2, 1, last - 1, 12).getValues(); // A..L
  for (var i = 0; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().trim() !== memoId) continue; // kol B = MemoID
    var fileId = (rows[i][8] || '').toString().trim();             // kol I = DriveFileID
    cd_trashDriveFile(fileId);
    sheet.getRange(i + 2, 12).setValue('VERWIJDERD');             // kol L = Status
    return { ok: true };
  }
  return { ok: true }; // niet gevonden = al weg
}

// Drive-bestand veilig naar prullenbak; ontbrekend/al-getrasht bestand mag niet klappen.
function cd_trashDriveFile(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); }
  catch (e) { Logger.log('cd_trashDriveFile (' + fileId + ') fout: ' + e); }
}

// ── Alle memo's van één item verwijderen (afrond-vinkje "direct verwijderen") ──
// data = { list, itemId }. Trasht alle Drive-bestanden en markeert de rijen 'VERWIJDERD'.
// Retourneert het aantal verwijderde (nog actieve) memo's.
function cd_deleteItemMemos(data) {
  var list   = (data && data.list   || '').toString().trim();
  var itemId = (data && data.itemId || '').toString().trim();
  if (!list || !itemId) return { ok: false, error: 'list/itemId ontbreekt' };

  var sheet = cd_memoSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, removed: 0 };

  var rows = sheet.getRange(2, 1, last - 1, 12).getValues(); // A..L
  var removed = 0;
  for (var i = 0; i < rows.length; i++) {
    var rList   = (rows[i][2] || '').toString().trim(); // kol C = Lijst
    var rItemId = (rows[i][5] || '').toString().trim(); // kol F = ItemID
    var status  = (rows[i][11] || '').toString().trim(); // kol L = Status
    if (rList !== list || rItemId !== itemId) continue;
    if (status === 'VERWIJDERD') continue;              // al weg → niet dubbel tellen
    cd_trashDriveFile((rows[i][8] || '').toString().trim()); // kol I = DriveFileID
    sheet.getRange(i + 2, 12).setValue('VERWIJDERD');
    removed++;
  }
  return { ok: true, removed: removed };
}
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_deleteMemo + cd_deleteItemMemos (Drive trash + rij VERWIJDERD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (TEST-project):** met ≥1 actieve memo-rij draai `cd_deleteMemo({memoId:<eerste rij kol B>})` → `{"ok":true}`, kol L = `VERWIJDERD`, Drive-bestand in prullenbak; tweede keer ook `{"ok":true}`. Met ≥2 memo's van één item: `cd_deleteItemMemos({list,itemId})` → `{"ok":true,"removed":N}`, tweede keer `removed:0`.

## Taak 13: Apps Script — cd_memoBehandelaar (item-lookup)

> `cd_uploadMemo` roept `cd_memoBehandelaar(list, code, itemId)` aan om de behandelaar(s) van het item op te zoeken in de werk-sheet. Lever deze helper in `Spraakmemo.gs`.

- [ ] Voeg toe (lees de behandelaar uit de juiste werk-tab; val terug op lege string zodat alleen in-app melding volgt):
```javascript
// Zoek de behandelaar(s) van een item op in de werk-sheet, voor de memo-melding.
// Match op verborgen ItemID in de ID-kolom per lijst; val terug op VvE-code.
// Retourneert de ruwe behandelaar-string (cd_splitBehandelaar splitst hem later).
function cd_memoBehandelaar(list, code, itemId) {
  // 0-based ID-kolom + behandelaar-kolom per lijst. Bij NTD staat de behandelaar in kol E (4).
  var CFG = {
    NTD:  { sheet: 'Nog Te Doen',      idCol: 16, behCol: 4 },
    ALVO: { sheet: "ALV's overzicht",  idCol: 6,  behCol: -1 },
    ALFA: { sheet: "ALV's afgerond",   idCol: 3,  behCol: -1 },
    ONTW: { sheet: 'Ontwikkeling',     idCol: 6,  behCol: 3 }
  };
  var cfg = CFG[list];
  if (!cfg || cfg.behCol < 0) return '';
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(cfg.sheet);
    if (!sh) return '';
    var vals = sh.getDataRange().getValues();
    for (var i = 0; i < vals.length; i++) {
      var rid = (vals[i][cfg.idCol] || '').toString().trim();
      if (itemId && rid === itemId) return (vals[i][cfg.behCol] || '').toString().trim();
    }
  } catch (e) { Logger.log('cd_memoBehandelaar fout: ' + e); }
  return '';
}
```
> Controleer in de live werk-sheet of de behandelaar-kolom voor NTD/ONTW klopt (NTD: kol E/4 conform parser; ONTW: kol D/3 "Door"). Pas `behCol` aan als de bron afwijkt. ALVO/ALFA hebben geen behandelaar-kolom → lege string (alleen in-app melding voor 'allen').
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_memoBehandelaar (item-behandelaar-lookup voor melding)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie:** met een NTD-rij die een ItemID + behandelaar heeft: `Logger.log(cd_memoBehandelaar('NTD','VVE-X','IT-...'))` → de behandelaar-naam. Onbekend itemId → lege string.

## Taak 14: Apps Script — cd_notifyNewMemo (push behandelaar, niet inspreker)

- [ ] Voeg in `apps-script/Spraakmemo.gs` toe (hergebruikt `cd_splitBehandelaar` Notifications.gs:337, `cd_notifyByExternalId` :394, `cd_schrijfMelding` Extra functies.gs:10, `APP_URL` :32):
```javascript
// ════════════════════════════════════════════════════════════
//  SPRAAKMEMO — nieuw-memo-melding (push behandelaar, NIET inspreker)
//  Hergebruikt cd_splitBehandelaar / cd_notifyByExternalId (Notifications.gs)
//  en cd_schrijfMelding (Extra functies.gs).
// ════════════════════════════════════════════════════════════
// code = VvE-code, naam = VvE-naam/snapshot, beh = behandelaar(s) v/h item, sec = sectie (NTD),
// actor = wie het memo insprak (ontvangt zelf GEEN push/toast), snapshot = taaktekst.
function cd_notifyNewMemo(code, naam, beh, sec, actor, snapshot) {
  var titel = 'Nieuw spraakmemo';
  var korteTekst = (snapshot || '').toString().slice(0, 80);
  var body = (code || '') + (naam ? ' · ' + naam : '')
           + (korteTekst ? ' — ' + korteTekst : '')
           + (actor ? ' (van ' + actor + ')' : '');

  var ontvangers = cd_splitBehandelaar(beh).filter(function (name) {
    return name && name !== actor;   // niet terugmelden aan de inspreker zelf
  });

  if (ontvangers.length) {
    ontvangers.forEach(function (name) {
      // cd_notifyByExternalId schrijft zelf de in-app Meldingen-rij voor deze persoon
      // (type 'n_memo' i.p.v. de tagKey, zodat de toast-pref-mapping klopt).
      cd_notifyByExternalId(name, 'n_memo', '1', {
        type: 'n_memo',
        title: titel,
        body: body,
        url: APP_URL,
        dedupKey: 'memo-' + (code || '') + '-' + name + '-' + (new Date().getTime())
      });
    });
  } else {
    // Geen (andere) behandelaar dan de inspreker: tóch een in-app toast voor 'allen',
    // zodat een memo nooit ongezien blijft. Geen push (niemand om gericht te pingen).
    cd_schrijfMelding('n_memo', titel, body, 'allen');
  }
  return { ok: true, ontvangers: ontvangers };
}
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_notifyNewMemo — push behandelaar, niet inspreker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (TEST-project):**
```javascript
function test_cd_notifyNewMemo() {
  Logger.log(JSON.stringify(cd_notifyNewMemo('VVE-0142','VvE Testlaan','Jer','OPPAKKEN','Cihad','Lekkage kelder onderzoeken')));
}
function test_cd_notifyNewMemo_zelfde_actor() {
  Logger.log(JSON.stringify(cd_notifyNewMemo('VVE-0142','VvE Testlaan','Jer','OPPAKKEN','Jer','tekst')));
}
```
**Verwacht:** eerste logt `{"ok":true,"ontvangers":["Jer"]}` + één `Meldingen`-rij type `n_memo`, "Voor" = `Jer`. Tweede logt `{"ok":true,"ontvangers":[]}` + `Meldingen`-rij "Voor" = `allen` (inspreker krijgt geen gerichte rij). Verwijder de testfuncties.

## Taak 15: Apps Script — cd_cleanupMemos + trigger (30-dagen-opruiming)

> De 30-dagen-rekenregel van `cd_cleanupMemos` wordt in de front-end gespiegeld als pure helper
> `memoIsVerlopen` (zie Taak 20, `src/spraakmemo.js`) en daar in de harness getest. Deze `.gs` is
> ZELFSTANDIG: hij hangt NIET van de front-end af, maar gebruikt exact dezelfde formule
> `(nu - t) > dagen * 86400000`. Houd beide 1-op-1 gelijk bij wijziging.

- [ ] Voeg in `apps-script/Spraakmemo.gs` de cleanup + trigger toe (gewikkeld in `cd_lockedRun` Notifications.gs:55):
```javascript
// ── Dagelijkse opruiming: metadata-rijen ouder dan MEMO_RETENTIE_DAGEN ──
// Trasht het Drive-bestand én verwijdert de rij. Grens-rekenregel identiek aan de
// in de front-end gespiegelde en geteste pure helper memoIsVerlopen (src/spraakmemo.js,
// Taak 20): (nu - t) > dagen * 86400000. Deze .gs hangt NIET van de front-end af.
function cd_cleanupMemos() {
  cd_lockedRun('cd_cleanupMemos', function () {
    var sheet = cd_memoSheet();
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last < 2) return;

    var rows = sheet.getRange(2, 1, last - 1, 12).getValues(); // A..L
    var nu = new Date().getTime();
    var grensMs = MEMO_RETENTIE_DAGEN * 86400000;
    var teVerwijderen = []; // 1-based rijnummers

    for (var i = 0; i < rows.length; i++) {
      var t = Date.parse((rows[i][0] || '').toString()); // kol A = Timestamp (ISO)
      if (isNaN(t)) continue;                            // onleesbare datum → laten staan
      if ((nu - t) > grensMs) {
        cd_trashDriveFile((rows[i][8] || '').toString().trim()); // kol I = DriveFileID
        teVerwijderen.push(i + 2);                       // rijnummer in de sheet
      }
    }
    // Van onder naar boven verwijderen zodat de overige rij-indexen niet verschuiven.
    for (var j = teVerwijderen.length - 1; j >= 0; j--) {
      sheet.deleteRow(teVerwijderen[j]);
    }
    Logger.log('cd_cleanupMemos: ' + teVerwijderen.length + ' verlopen memo-rijen opgeruimd.');
  });
}

// Eénmalig draaien (van de editor) om de dagelijkse opruim-trigger te zetten.
// Verwijdert eerst een eventuele bestaande cd_cleanupMemos-trigger (idempotent).
// PAS draaien NADAT cd_cleanupMemos bestaat.
function cd_setupMemoCleanup() {
  ScriptApp.getProjectTriggers()
    .filter(function (tr) { return tr.getHandlerFunction() === 'cd_cleanupMemos'; })
    .forEach(function (tr) { ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('cd_cleanupMemos').timeBased().atHour(3).nearMinute(30).everyDays(1).create();
  Logger.log('Dagelijkse trigger cd_cleanupMemos ingesteld (~03:30).');
}
```
> Trigger om 03:30 — na de bestaande 06:00 auto-prioriteit en 08:30 daily-summary, geen overlap. `cd_setupMemoCleanup()` pas draaien nadat `cd_cleanupMemos` bestaat (anders uitvoeringsfout bij vuren).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Spraakmemo.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: cd_cleanupMemos 30-dagen-opruiming + trigger-setup (cd_setupMemoCleanup)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (TEST-project):** zet een testrij met Timestamp >30 dagen terug (bv. `2026-05-01T09:00:00.000Z`) + geldige DriveFileID in kol I, draai `cd_cleanupMemos()`. **Verwacht log:** `cd_cleanupMemos: 1 verlopen memo-rijen opgeruimd.`, rij weg, bestand in prullenbak; rij binnen 30 dagen blijft staan. Draai `cd_setupMemoCleanup()` → log + precies één `cd_cleanupMemos`-trigger (Time-driven, 3–4am, daily); tweede keer geen duplicaat. Bestaande triggers ongewijzigd. Verwijder testrij/functie.

## Taak 16: Apps Script — doPost memo-routing in Notifications.gs

- [ ] Bewerk `/Users/servicedesk/collectief-dashboard/apps-script/Notifications.gs` `doPost(e)` (regels 530-547). Vervang door:
```javascript
function doPost(e) {
  try {
    // Body defensief parsen: een ongeldige JSON-body van een anonieme caller mag geen rauwe
    // parse-fout terugkrijgen en geen werk vóór auth uitlokken.
    let data = null;
    try { data = JSON.parse(e && e.postData && e.postData.contents); } catch (_) { data = null; }

    // ── NIEUW: token-geauthenticeerd spraakmemo-loket (staat NAAST de secret-route hieronder).
    // Web-app-auth: Apps Script geeft request-headers niet door, dus het OAuth access-token komt
    // in de body. cd_memoAuth (Spraakmemo.gs) doet tokeninfo → aud-check → allowlist; pas daarna
    // de Drive-/metadata-actie. _door = teamnaam uit de geverifieerde e-mail (niet uit de body).
    var MEMO_ACTIONS = { uploadmemo: 1, getmemo: 1, deletememo: 1, deleteitemmemos: 1 };
    if (data && MEMO_ACTIONS[data.action]) {
      var auth = cd_memoAuth(data.token);
      if (!auth.ok) {
        return ContentService.createTextOutput(JSON.stringify({error:'forbidden'})).setMimeType(ContentService.MimeType.JSON);
      }
      data._door = (CD_EMAIL_NAMES[auth.email] || auth.email);
      var memoResult;
      if (data.action === 'uploadmemo')           memoResult = cd_uploadMemo(data);
      else if (data.action === 'getmemo')         memoResult = cd_getMemo(data);
      else if (data.action === 'deletememo')      memoResult = cd_deleteMemo(data);
      else if (data.action === 'deleteitemmemos') memoResult = cd_deleteItemMemos(data);
      return ContentService.createTextOutput(JSON.stringify(memoResult)).setMimeType(ContentService.MimeType.JSON);
    }

    // ── BESTAAND: server-to-server webhook (mail-intake) via gedeeld secret — ONGEWIJZIGD.
    const secret = PropertiesService.getScriptProperties().getProperty('CD_WEBHOOK_SECRET');
    // FAIL CLOSED: geen/ongeldige body, of ontbrekend/fout server-secret → generiek weigeren.
    if (!secret || !data || data.secret !== secret) {
      return ContentService.createTextOutput(JSON.stringify({error:'forbidden'})).setMimeType(ContentService.MimeType.JSON);
    }
    const result = cd_processNotifEvent(data);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost fout: ' + err);                      // echte fout alleen server-side, niet naar de caller lekken
    return ContentService.createTextOutput(JSON.stringify({error:'serverfout'})).setMimeType(ContentService.MimeType.JSON);
  }
}
```
> `CD_EMAIL_NAMES` is in Taak 8 in `Spraakmemo.gs` gedefinieerd (Apps Script deelt globale scope).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/Notifications.gs
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: doPost token-geauthenticeerde memo-routing naast secret-route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie (end-to-end, ná deploy Taak 17 + Deploy-sectie):** zie Taak 31 stap-voor-stap. Kern: `getmemo` met `token:'rommel'` → `{error:"forbidden"}`; `uploadmemo` met echt `state.oauthToken` → `{ok:true,memoId,fileId,timestamp}` + Drive-bestand + tab-rij `Door=Jer`; secret-route (mail-intake) ongewijzigd.

## Taak 17: Apps Script — Drive-scope in manifest borgen + autorisatie

- [ ] Bewerk `/Users/servicedesk/collectief-dashboard/apps-script/appsscript.json`. Voeg een `oauthScopes`-array toe ná `"runtimeVersion": "V8",`:
```json
{
  "timeZone": "Europe/Brussels",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```
> Controleer in de live editor (Project Settings → manifest) welke scopes nu automatisch worden afgeleid; neem exact díe over plus `…/auth/drive`. Pas de array aan als de bestaande set afwijkt (bv. volledige `…/auth/spreadsheets`). Voeg geen ongebruikte scope toe.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add apps-script/appsscript.json
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo-loket: Drive-scope expliciet in manifest borgen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie:** draai `test_cd_uploadMemo` één keer → autorisatie-dialoog ("Bekijk en beheer Google Drive-bestanden") → toestaan. (Her)deploy de web-app; upload/getmemo werken zonder `ScriptError: … not authorized`.

## Taak 18: Front-end — callMemoLoket(action, payload) in api.js

- [ ] Wijzig de import (regel 2) in `/Users/servicedesk/collectief-dashboard/src/api.js`:
```js
import { SID, SKEYS, PROXY_URL, APPS_SCRIPT_URL } from "./config.js";
```
- [ ] Voeg ná regel 72 (`}` van `askChat`) toe:
```js
// ── Spraakmemo-loket ───────────────────────────────────────────────────
// POST naar het token-beveiligde Apps Script web-app-endpoint. Het OAuth-token
// gaat mee in de body (Apps Script geeft request-headers niet door). _withRetry
// vangt transient fouten (429/5xx/netwerk-blip) net als de Sheets-schrijfacties.
// Acties + payload (zie contract §Loket-API):
//   'uploadmemo'      {list,code,sectie,itemId,snapshot,durationSec,mime,audioB64} -> {ok,memoId,fileId,timestamp}
//   'getmemo'         {memoId}            -> {ok,mime,audioB64}
//   'deletememo'      {memoId}            -> {ok}
//   'deleteitemmemos' {list,itemId}       -> {ok,removed}
async function callMemoLoket(action, payload){
  if(!state.oauthToken) throw new Error('Niet ingelogd');
  return _withRetry(async ()=>{
    const r=await fetch(APPS_SCRIPT_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({action,token:state.oauthToken},payload||{})),
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok || data.error){
      const err=new Error(data.error||('Memo-loket fout ('+action+')'));
      err.status=r.status;
      throw err;
    }
    return data;
  });
}
```
- [ ] Wijzig de export-regel zodat `callMemoLoket` mee-geëxporteerd wordt:
```js
export { fetchSheet, writeRange, appendRange, _shiftNtdRows, _isTransient, _withRetry, askChat, callMemoLoket, _rowMismatch, _a1ColA, assertRowsMatch, assertRowMatch };
```
- [ ] **Verificatie:** open `index.html?test=1`; in de console `import('./src/api.js').then(a=>console.log(typeof a.callMemoLoket))` → `function`.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/api.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: callMemoLoket(action,payload) — POST naar token-beveiligd memo-loket met _withRetry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 19: Front-end — D.memos in state.js

- [ ] Wijzig regel 11 in `/Users/servicedesk/collectief-dashboard/src/state.js`:
```js
export const D = {ntd:{},af:{},alvo:[],alfa:[],ontw:[],logboek:[],herhaal:[],kenmerken:[],memos:{},ntdSecInfo:{},afSecInfo:{}};
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/state.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: D.memos op de centrale state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 20: Front-end — spraakmemo.js skeleton: genItemId, ensureItemId, idCellA1, memoIsVerlopen (TDD)

> Maak `/Users/servicedesk/collectief-dashboard/src/spraakmemo.js` aan met de identiteits-helpers en de imports die latere taken nodig hebben. `ensureItemId` is een netwerk-/Sheets-integratiehelper (geen pure unit-test → handmatige verificatie); `genItemId`/`idCellA1` zijn puur en worden getest.

- [ ] Voeg de import toe in `/Users/servicedesk/collectief-dashboard/src/tests.js` bij de andere imports (direct na de `render-vve.js`-import, regel 11), inclusief de namen voor latere taken:
```js
import { genItemId, idCellA1, parseMemos, memoCount, memoBadgeHtml, pickMimeType, buildUploadPayload, memoAfrondHelp, memoIsVerlopen } from "./spraakmemo.js";
```
- [ ] Voeg een Spraakmemo-testblok toe in `src/tests.js`, vóór de slot-`const totOk`:
```js
  // ── Spraakmemo: pure helpers ──
  console.log('%c[TESTS] Spraakmemo', 'background:#4a5b7a;color:white;padding:2px 6px;border-radius:3px');
  (()=>{
    const id=genItemId();
    truthy('genItemId: vorm IT-<t36>-<4>', /^IT-[0-9a-z]+-[0-9a-z]{4}$/.test(id));
    const set=new Set(); for(let i=0;i<200;i++) set.add(genItemId());
    eq('genItemId: 200x uniek', set.size, 200);
    eq("idCellA1: NTD rij 5 → kol Q",       idCellA1('NTD',5),  "'Nog Te Doen'!Q5");
    eq("idCellA1: ALVO rij 3 → kol G + ''",  idCellA1('ALVO',3), "'ALV''s overzicht'!G3");
    eq("idCellA1: ALFA rij 2 → kol D",      idCellA1('ALFA',2), "'ALV''s afgerond'!D2");
    eq("idCellA1: ONTW rij 7 → kol G",      idCellA1('ONTW',7), "'Ontwikkeling'!G7");
  })();
  // — memoIsVerlopen (datumselectie 30-dagen-opruiming, spiegel van cd_cleanupMemos, Taak 15) —
  const _nu = new Date('2026-06-23T12:00:00.000Z').getTime();
  eq('memoIsVerlopen: ISO ouder dan retentie',          memoIsVerlopen('2026-05-10T09:00:00.000Z', 30, _nu), true);
  eq('memoIsVerlopen: ISO binnen retentie',             memoIsVerlopen('2026-06-20T09:00:00.000Z', 30, _nu), false);
  eq('memoIsVerlopen: exact op de grens (30 dagen)',    memoIsVerlopen(new Date(_nu - 30 * 86400000).toISOString(), 30, _nu), false);
  eq('memoIsVerlopen: net over de grens',               memoIsVerlopen(new Date(_nu - 30 * 86400000 - 1000).toISOString(), 30, _nu), true);
  eq('memoIsVerlopen: lege timestamp → niet verlopen',  memoIsVerlopen('', 30, _nu), false);
  eq('memoIsVerlopen: ongeldige timestamp → niet verlopen', memoIsVerlopen('geen-datum', 30, _nu), false);
```
- [ ] Draai `index.html?test=1`. **Verwacht: FAIL** (`./spraakmemo.js` bestaat nog niet; import-fout).
- [ ] Maak `/Users/servicedesk/collectief-dashboard/src/spraakmemo.js` aan:
```js
// ══════════════════════════════════════
//  SPRAAKMEMO — recorder + player + upload + render (per taak)
//  Audio in Drive via het Apps Script "memo-loket"; metadata in D.memos.
// ══════════════════════════════════════
import { esc, displayName } from "./util.js";
import { state, D } from "./state.js";
import { MEMO_MAX_SEC, LIST_ID_COL, LIST_SHEET } from "./config.js";
import { callMemoLoket, writeRange, assertRowMatch } from "./api.js";
import { ensureToken } from "./auth.js";
import { showToast, getCurrentWho } from "./notifications.js";

// ── Identiteit ──────────────────────────────────────────────────────────
// 4 willekeurige base36-tekens (0-9a-z).
function _rand4(){
  let s='';
  for(let i=0;i<4;i++) s+=Math.floor(Math.random()*36).toString(36);
  return s;
}
// Stabiel, kort item-ID: "IT-<base36 tijd>-<4 random>". Bewust andere prefix dan
// een memo-ID ("M-…", server-side) zodat ze nooit verwisseld worden.
function genItemId(){ return 'IT-'+Date.now().toString(36)+'-'+_rand4(); }

// Kolomletter (A, B, … Z, AA…) uit een 0-based index.
function _colLetter(idx){
  let s='';
  for(idx=idx|0; idx>=0; idx=Math.floor(idx/26)-1){ s=String.fromCharCode(65+(idx%26))+s; }
  return s;
}
// A1-range van de verborgen ID-cel van één rij. Escapet apostrofs in de
// tabbladnaam (bv. "ALV's overzicht" → 'ALV''s overzicht'!G3), net als _a1ColA.
function idCellA1(list, row){
  const sheet=(LIST_SHEET[list]||'').replace(/'/g,"''");
  const col=_colLetter(LIST_ID_COL[list]);
  return `'${sheet}'!${col}${row}`;
}

// Kolom-A-sleutel van een item (voor assertRowMatch): ONTW heeft de titel in
// kolom A, de overige lijsten de VvE-code.
function _itemKeyColA(item, list){
  return list==='ONTW' ? (item.titel||'') : (item.code||'');
}

// Zorgt dat een item een stabiel verborgen ID heeft. Lazy: bestaand ID wordt
// hergebruikt; anders genereren, in de ID-cel schrijven (met assertRowMatch-
// bescherming tegen verschoven rijen) en lokaal op het item zetten. Retourneert
// het ID. Gooit door bij schrijffout/rij-mismatch zodat de aanroeper kan stoppen.
async function ensureItemId(item, list){
  if(item && item.itemId) return item.itemId;
  if(!item || !item._row) throw new Error('Item zonder rij — kan geen ID toekennen');
  if(!await ensureToken()) throw new Error('Niet ingelogd');
  const id=genItemId();
  await assertRowMatch(item._row, _itemKeyColA(item, list), LIST_SHEET[list]);
  await writeRange(idCellA1(list, item._row), [id]);
  item.itemId=id;
  return id;
}

// ── Retentie-spiegel ──────────────────────────────────────────────────────
// Spiegel van cd_cleanupMemos-selectie (Apps Script, Taak 15). Pure helper zodat de
// 30-dagen-grens in de browser-harness getest kan worden; de .gs gebruikt exact dezelfde
// rekenregel. tsIso = ISO-string (kol A), dagen = MEMO_RETENTIE_DAGEN, nuMs = referentie-tijd
// (Date.now()). Verlopen = leeftijd STRIKT groter dan de retentie (gelijk op de grens blijft staan).
function memoIsVerlopen(tsIso, dagen, nuMs){
  const t=Date.parse(tsIso);
  if(isNaN(t)) return false;               // lege/onleesbare datum → overslaan (niet weggooien)
  return (nuMs - t) > dagen * 86400000;
}

export { genItemId, idCellA1, ensureItemId, memoIsVerlopen };
```
- [ ] Draai `index.html?test=1`. **Verwacht: PASS** voor genItemId/idCellA1 (mits `parseMemos`/`memoCount`/`memoBadgeHtml`/`pickMimeType`/`buildUploadPayload`/`memoAfrondHelp`/`memoIsVerlopen` als geldige exports bestaan — voeg die in de volgende taken in dezelfde sessie toe vóór je de suite eindbeoordeelt; tot dan faalt de import op die namen).
> **Coördinatie:** de testimport in deze taak verwijst al naar alle pure exports. `memoIsVerlopen` wordt in déze taak (Taak 20) toegevoegd; `parseMemos`/`memoCount`/`memoBadgeHtml`/`pickMimeType`/`buildUploadPayload`/`memoAfrondHelp` volgen in Taak 21-24 — voeg ze toe vóór de groene eindbeoordeling. Werk de export-regel telkens bij i.p.v. te dupliceren.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: nieuw module + genItemId/idCellA1/ensureItemId (identiteit) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
- [ ] **Handmatige verificatie ensureItemId (staging, ná grid-verbreding Taak 4):** met een OPPAKKEN-taak zonder ID:
```js
const it = D.ntd.OPPAKKEN.find(x=>!x.itemId);
import('./src/spraakmemo.js').then(async m=>{ const id=await m.ensureItemId(it,'NTD'); console.log('toegekend:', id, 'lokaal:', it.itemId); });
```
**Verwacht:** een `IT-…`-ID gelijk aan `it.itemId`; kolom Q van die rij bevat dat ID; tweede aanroep geeft hetzelfde ID zonder schrijven; bij handmatig gewijzigde kolom A → afgevangen rij-mismatch (`err.rowMismatch===true`), geen foutieve schrijfactie.

## Taak 21: Front-end — parseMemos + memoCount (TDD)

- [ ] Voeg een testblok toe in `src/tests.js` (Spraakmemo-blok):
```js
  (()=>{
    const rows=[
      ['Timestamp','MemoID','Lijst','VvECode','Sectie','ItemID','Snapshot','Door','DriveFileID','DuurSec','Mime','Status'],
      ['2026-06-20T09:00:00.000Z','M-1','NTD','CH1','OPPAKKEN','IT-a','Lekkage','Jer','file-1','7','audio/webm',''],
      ['2026-06-22T09:00:00.000Z','M-2','NTD','CH1','OPPAKKEN','IT-a','Lekkage','Cihad','file-2','5','audio/webm',''],
      ['2026-06-21T09:00:00.000Z','M-3','NTD','CH1','OPPAKKEN','IT-a','Lekkage','Jer','file-3','9','audio/webm','VERWIJDERD'],
      ['2026-06-19T09:00:00.000Z','M-4','ALVO','CH9','','IT-b','ALV plannen','Gabos','file-4','3','audio/mp4',''],
    ];
    const m=parseMemos(rows);
    eq('parseMemos: 2 sleutels', Object.keys(m).length, 2);
    eq('parseMemos: actieve NTD|IT-a (VERWIJDERD weg) → 2', (m['NTD|IT-a']||[]).length, 2);
    eq('parseMemos: nieuwste eerst (M-2)', m['NTD|IT-a'][0].memoId, 'M-2');
    eq('parseMemos: velden gemapt', [m['NTD|IT-a'][0].duur, m['NTD|IT-a'][0].mime].join('|'), '5|audio/webm');
    eq('parseMemos: _row offset (M-2 op rij 3)', m['NTD|IT-a'][0]._row, 3);
    eq('parseMemos: ALVO-tak', m['ALVO|IT-b'][0].door, 'Gabos');
    const oud=D.memos; D.memos=m;
    eq('memoCount: NTD|IT-a → 2', memoCount('NTD','IT-a'), 2);
    eq('memoCount: onbekend item → 0', memoCount('NTD','IT-zzz'), 0);
    eq('memoCount: leeg itemId → 0', memoCount('NTD',''), 0);
    D.memos=oud;
  })();
```
- [ ] Draai → **FAIL** (`parseMemos is not defined`).
- [ ] Voeg in `src/spraakmemo.js` toe:
```js
// ── Metadata-parsing ────────────────────────────────────────────────────
// Leest tab "Spraakmemo's" (kol A..L). Slaat de koprij over, negeert
// VERWIJDERD-rijen en rijen zonder list/itemId, en groepeert per `${list}|${itemId}`
// met de nieuwste memo eerst. Retourneert een object (sleutel → array memo-objs).
function parseMemos(rows){
  const out={};
  if(!rows||rows.length<2) return out;
  for(let i=1;i<rows.length;i++){
    const r=rows[i]||[];
    const status=((r[11]||'')+'').trim().toUpperCase();
    if(status==='VERWIJDERD') continue;
    const itemId=((r[5]||'')+'').trim();
    const list=((r[2]||'')+'').trim();
    if(!itemId || !list) continue;
    const memo={
      memoId:((r[1]||'')+'').trim(), list, code:((r[3]||'')+'').trim(),
      sectie:((r[4]||'')+'').trim(), itemId, snapshot:((r[6]||'')+'').trim(),
      door:((r[7]||'')+'').trim(), fileId:((r[8]||'')+'').trim(),
      duur:parseInt(r[9],10)||0, mime:((r[10]||'')+'').trim(),
      ts:((r[0]||'')+'').trim(), _row:i+1,
    };
    const key=list+'|'+itemId;
    (out[key]||(out[key]=[])).push(memo);
  }
  Object.keys(out).forEach(k=>{ out[k].sort((a,b)=>(b.ts||'').localeCompare(a.ts||'')); });
  return out;
}

// Aantal actieve memo's op een item (0 bij onbekend/leeg).
function memoCount(list, itemId){
  if(!itemId) return 0;
  return ((D.memos||{})[(list||'')+'|'+itemId]||[]).length;
}
```
- [ ] Werk de export-regel bij: `export { genItemId, idCellA1, ensureItemId, parseMemos, memoCount };`
- [ ] Draai → **PASS**.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: parseMemos (groepeer list|itemId, nieuwste eerst, VERWIJDERD weg) + memoCount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 22: Front-end — pickMimeType + memoBadgeHtml (TDD)

- [ ] Voeg een testblok toe in `src/tests.js`:
```js
  (()=>{
    const orig=window.MediaRecorder;
    window.MediaRecorder={ isTypeSupported:(t)=>t==='audio/webm;codecs=opus' };
    eq('pickMimeType: webm/opus', pickMimeType(), 'audio/webm;codecs=opus');
    window.MediaRecorder={ isTypeSupported:(t)=>t==='audio/webm' };
    eq('pickMimeType: audio/webm', pickMimeType(), 'audio/webm');
    window.MediaRecorder={ isTypeSupported:(t)=>t==='audio/mp4' };
    eq('pickMimeType: iOS mp4', pickMimeType(), 'audio/mp4');
    window.MediaRecorder={ isTypeSupported:()=>false };
    eq('pickMimeType: niets → leeg', pickMimeType(), '');
    window.MediaRecorder=orig;
    const oud=D.memos;
    D.memos={'NTD|IT-x':[{memoId:'M-1'},{memoId:'M-2'},{memoId:'M-3'}]};
    const h=memoBadgeHtml('NTD','IT-x');
    truthy('memoBadge: bevat aantal 3', /\b3\b/.test(h));
    truthy('memoBadge: bevat <svg', h.indexOf('<svg')>-1);
    truthy('memoBadge: <button>', h.indexOf('<button')>-1);
    truthy('memoBadge: data-action memo-open', h.indexOf('data-action="memo-open"')>-1);
    eq('memoBadge: leeg item → ""', memoBadgeHtml('NTD','IT-leeg'), '');
    eq('memoBadge: leeg itemId → ""', memoBadgeHtml('NTD',''), '');
    D.memos=oud;
  })();
```
- [ ] Draai → **FAIL**.
- [ ] Voeg in `src/spraakmemo.js` toe:
```js
// Kies een door MediaRecorder ondersteund audio-mime. iOS Safari heeft geen webm → mp4/aac.
// De gekozen MIME wordt mee-opgeslagen (kol K) zodat afspelen het juiste type gebruikt.
function pickMimeType(){
  const MR=window.MediaRecorder;
  if(!MR||typeof MR.isTypeSupported!=='function') return '';
  const kandidaten=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4'];
  for(const t of kandidaten){ if(MR.isTypeSupported(t)) return t; }
  return '';
}

// Mic-icoon (inline SVG, DASH_ICONS-stijl) — gedeeld door badge en knoppen.
const MIC_SVG='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M5.5 11a6.5 6.5 0 0013 0"/><path d="M12 17.5V21M8.5 21h7"/></svg>';

// Teller-badge op een item met memo's. Echte <button> met aria-label; klik → memo-open.
function memoBadgeHtml(list, itemId){
  const n=memoCount(list, itemId);
  if(!n) return '';
  return `<button type="button" class="memo-badge" data-action="memo-open" data-list="${esc(list)}" data-itemid="${esc(itemId)}" title="${n} spraakmemo${n===1?'':"'s"}" aria-label="${n} spraakmemo${n===1?'':"'s"} — open">${MIC_SVG}<span class="memo-badge-n">${n}</span></button>`;
}
```
- [ ] Werk de export-regel bij: voeg `pickMimeType, memoBadgeHtml, MIC_SVG` toe.
- [ ] Draai → **PASS**.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: pickMimeType (webm→mp4) + memoBadgeHtml (mic-teller, inline SVG, var(--ac))

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 23: Front-end — buildUploadPayload (TDD)

- [ ] Voeg een testblok toe in `src/tests.js`:
```js
  (()=>{
    const item = { code:'VVE-0142', itemId:'IT-lt3x9-a4f2', actiepunt:'Lekkage kelder onderzoeken' };
    const p = buildUploadPayload(item, 'NTD', 'OPPAKKEN', 7.6, 'audio/webm', 'QUJD');
    eq('payload: list', p.list, 'NTD');
    eq('payload: code', p.code, 'VVE-0142');
    eq('payload: sectie', p.sectie, 'OPPAKKEN');
    eq('payload: itemId', p.itemId, 'IT-lt3x9-a4f2');
    eq('payload: snapshot uit actiepunt', p.snapshot, 'Lekkage kelder onderzoeken');
    eq('payload: durationSec afgerond', p.durationSec, 8);
    eq('payload: mime', p.mime, 'audio/webm');
    eq('payload: audioB64', p.audioB64, 'QUJD');
    eq('payload: precies 8 sleutels', Object.keys(p).sort().join(','), 'audioB64,code,durationSec,itemId,list,mime,sectie,snapshot');
    eq('payload: snapshot fallback periode', buildUploadPayload({code:'VVE-9',periode:'Q3 2026'},'NTD','VERGADERVERZOEKEN',3,'','x').snapshot, 'Q3 2026');
    eq('payload: snapshot fallback code', buildUploadPayload({code:'VVE-9'},'NTD','OPPAKKEN',3,'','x').snapshot, 'VVE-9');
  })();
```
- [ ] Draai → **FAIL**.
- [ ] Voeg in `src/spraakmemo.js` toe:
```js
// Bouwt de exacte upload-payload voor callMemoLoket('uploadmemo', …). Eén bron zodat de
// sleutels nooit uiteenlopen met het Apps Script-loket. durationSec → hele seconden (kol J).
// snapshot = leesbare itemtekst als vangnet (actiepunt → periode → code), conform §7-kol G.
function buildUploadPayload(item, list, sectie, durationSec, mime, audioB64){
  const snapshot = (item.actiepunt || item.periode || item.code || '').toString();
  return {
    list,
    code: (item.code || '').toString(),
    sectie: sectie || '',
    itemId: (item.itemId || '').toString(),
    snapshot,
    durationSec: Math.round(durationSec || 0),
    mime: mime || '',
    audioB64: audioB64 || '',
  };
}
```
- [ ] Werk de export-regel bij: voeg `buildUploadPayload` toe.
- [ ] Draai → **PASS**.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: buildUploadPayload (vaste upload-sleutels) + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 24: Front-end — memoAfrondHelp (TDD)

- [ ] Voeg een testblok toe in `src/tests.js`:
```js
  eq('memo-help: uitgevinkt → 30 dagen-tekst',
    memoAfrondHelp(false), 'Memo\u2019s blijven nog 30 dagen bewaard en worden daarna automatisch verwijderd.');
  eq('memo-help: aangevinkt → direct-weg-tekst',
    memoAfrondHelp(true), 'Memo\u2019s van deze taak worden direct verwijderd.');
```
- [ ] Draai → **FAIL**.
- [ ] Voeg in `src/spraakmemo.js` toe:
```js
// Wisselende helptekst onder het afrond-vinkje "Spraakmemo's direct verwijderen".
// uit = nog 30 dagen bewaren (de cleanup-trigger ruimt later op), aan = nu meteen weg.
export function memoAfrondHelp(checked){
  return checked
    ? 'Memo\u2019s van deze taak worden direct verwijderd.'
    : 'Memo\u2019s blijven nog 30 dagen bewaard en worden daarna automatisch verwijderd.';
}
```
- [ ] Draai → **PASS** (alle Spraakmemo pure-helper-asserts groen, 0 nieuwe FAIL).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: afrond-vinkje helptekst (memoAfrondHelp) + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 25: Front-end — parsers lezen verborgen item-ID (NTD/ALVO/ALFA/ONTW) + TDD

> Vier parsers lezen `itemId` uit de vaste 0-based ID-kolom (NTD 16, ALVO 6, ALFA 3, ONTW 6). `_f4v` (data.js regel 154) filtert checkbox-erfenis (TRUE/FALSE) weg.

- [ ] Voeg `parseOntw` toe aan de bestaande `render-overig.js`-import (regel 5) in `src/tests.js`:
```js
import { logZin, logPaginaSoort, parseOntw } from "./render-overig.js";
```
- [ ] Voeg na de bestaande `parseAlfa`-test (in het DATALAAG-PARSERS-blok) toe:
```js
  (()=>{
    const ntdRows=[
      ['OPPAKKEN'],
      ['VvE Code','VvE','Actiepunt','Deadline','Behandelaar','Prioriteit','Opmerkingen'],
      ['CH1','VvE 1','Lekkage','30 jun 2026','Jer','Hoog','', '','','','','','','','','','IT-abc-1234'],
      ['CH2','VvE 2','Dak','29 jun 2026','Cihad','Midden','', '','','','','','','','','',''],
    ];
    const ntd=parseSections(ntdRows).data.OPPAKKEN;
    eq('parseSections: itemId uit kol Q', ntd[0].itemId, 'IT-abc-1234');
    eq('parseSections: lege ID-kolom → ""', ntd[1].itemId, '');
    const ntdFalse=parseSections([['OPPAKKEN'],['VvE Code'],['CH3','VvE 3','x','30 jun 2026','Jer','Hoog','', '','','','','','','','','','FALSE']]).data.OPPAKKEN;
    eq('parseSections: FALSE-erfenis → ""', ntdFalse[0].itemId, '');
    const av=parseAlvo([['k'],['s'],['CH1','VvE 1','TRUE','FALSE','TRUE','opm','IT-alvo-1']]);
    eq('parseAlvo: itemId uit kol G', av[0].itemId, 'IT-alvo-1');
    const af=parseAlfa([['Code','Naam','Datum','ItemID'],['CH1','VvE 1','2026-05-01','IT-alfa-1']]);
    eq('parseAlfa: itemId uit kol D', af[0].itemId, 'IT-alfa-1');
    eq('parseAlfa: _row offset (eerste = rij 2)', af[0]._row, 2);
    const on=parseOntw([['Titel','Cat','Inhoud','Door','Datum','Status','ItemID'],['Idee','Ideeën','x','Jer','1-6-2026','Open','IT-ontw-1']]);
    eq('parseOntw: itemId uit kol G', on[0].itemId, 'IT-ontw-1');
  })();
```
- [ ] Draai → **FAIL** (`itemId` undefined).
- [ ] `parseSections` (`src/data.js`): voeg ná regel 160 (`entry.aannemers =_f4v(row[15]); // P …`) toe:
```js
    entry.itemId     =_f4v(row[16]);  // Q — verborgen item-ID (spraakmemo, lazy toegekend)
```
- [ ] `parseAlvo` (`src/data.js` regel 207): wijzig de teruggegeven object-literal:
```js
    return{code,naam:(r[1]||'').trim(),uitnodiging:uitn,notulen:notu,begroting:begr,opmerkingen:(r[5]||'').trim(),status,itemId:(r[6]||'').trim(),_row:i+3};
```
- [ ] `parseAlfa` (`src/data.js` regels 212-214): wijzig naar:
```js
  return rows.slice(1).map((r,i)=>({
    code:(r[0]||'').trim(),naam:(r[1]||'').trim(),datum:(r[2]||'').trim(),itemId:(r[3]||'').trim(),_row:i+2
  })).filter(r=>r.code);
```
(`_row:i+2` toegevoegd — nodig voor `ensureItemId`/`assertRowMatch`.)
- [ ] `parseOntw` (`src/render-overig.js` regel 26): wijzig de `return{…}`:
```js
    return{titel,categorie:(r[1]||'').trim(),inhoud:(r[2]||'').trim(),door:(r[3]||'').trim(),datum:(r[4]||'').trim(),status:(r[5]||'').trim()||'Open',itemId:(r[6]||'').trim(),_row:i+2};
```
- [ ] Draai → **PASS**.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/data.js src/render-overig.js src/tests.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: parsers lezen verborgen item-ID (NTD Q / ALVO+ONTW G / ALFA D) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 26: Front-end — loadAll leest "Spraakmemo's" → D.memos + render-hash

- [ ] Voeg in `src/data.js` ná regel 12 toe:
```js
import { parseMemos } from "./spraakmemo.js";
import { MEMO_SHEET } from "./config.js";
```
> Als `src/data.js` al een import uit `./config.js` heeft, voeg `MEMO_SHEET` toe aan die bestaande import-regel i.p.v. een dubbele import te maken.
- [ ] Breid de `Promise.all` uit (regels 83-90); gebruik de gedeelde `MEMO_SHEET`-constante i.p.v. de tabnaam hard te coderen:
```js
    const[ntdR,afR,alvoR,alfaR,ontwR,logR,hhR,kmkR,memoR]=await Promise.all([
      lees("Nog Te Doen"),lees("Afgerond"),
      lees("ALV's overzicht"),lees("ALV's afgerond"),
      lees("Ontwikkeling").catch(()=>[]),
      lees("Logboek").catch(()=>[]),
      lees("Herhaalregels").catch(()=>[]),
      lees("Kenmerken").catch(()=>[]),
      lees(MEMO_SHEET).catch(()=>[]),
    ]);
```
- [ ] Voeg ná regel 103 (`D.kenmerken=parseKenmerken(kmkR);`) toe:
```js
    D.memos=parseMemos(memoR);
```
- [ ] Neem `D.memos` op in de render-hash (regel 105):
```js
    const hash=JSON.stringify([D.ntd,D.af,D.alvo,D.alfa,D.ontw,D.logboek,D.herhaal,D.kenmerken,D.memos]);
```
- [ ] **Verificatie:** open `index.html?test=1`, log in, één laadronde. Console: `import('./src/state.js').then(s=>console.log(typeof s.D.memos, Object.keys(s.D.memos).length))` → `object 0` bij lege tab; pagina laadt zonder 'Fout'.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/data.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: loadAll leest "Spraakmemo's" → D.memos via parseMemos + in render-hash

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 27: Front-end — openMemoRecorder + playMemo + renderMemoList + toggle/verwijder/deleteItemMemos

> DOM/`getUserMedia`/`MediaRecorder` zijn niet in de harness te draaien → handmatige verificatie. Voeg alle render/opname/afspeel-functies in `src/spraakmemo.js` toe.

- [ ] Voeg toe (opname + upload, optimistisch):
```js
// Blob → base64 (zonder data:-prefix), voor de upload-payload.
function _blobNaarB64(blob){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error('Kon audio niet lezen'));
    fr.onload=()=>{ const s=(''+fr.result); const i=s.indexOf(','); resolve(i>=0?s.slice(i+1):s); };
    fr.readAsDataURL(blob);
  });
}

// Opname-paneel bij een item: mic-knop + lopende teller + stoppen&versturen.
// Stopt automatisch op MEMO_MAX_SEC. Op stop → upload via het memo-loket.
async function openMemoRecorder(item, list, anchorEl){
  document.querySelector('.memo-recorder')?.remove();
  let stream;
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ showToast('Microfoon geblokkeerd','Geef toestemming voor de microfoon en probeer opnieuw.','var(--rd)'); return; }
  const mime=pickMimeType();
  let rec;
  try{ rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); }
  catch(e){ rec=new MediaRecorder(stream); }
  const brokken=[];
  rec.ondataavailable=e=>{ if(e.data&&e.data.size) brokken.push(e.data); };

  const paneel=document.createElement('div');
  paneel.className='memo-recorder';
  paneel.innerHTML=`
    <span class="memo-rec-dot" aria-hidden="true"></span>
    <span class="memo-rec-tijd" role="timer" aria-live="polite">0:00</span>
    <div class="memo-rec-golf"><span></span><span></span><span></span><span></span><span></span></div>
    <button type="button" class="btn btn-pri btn-sm memo-rec-stop">Stoppen &amp; versturen</button>
    <button type="button" class="btn btn-sec btn-sm memo-rec-annuleer" aria-label="Opname annuleren">Annuleren</button>`;
  (anchorEl&&anchorEl.parentNode?anchorEl.parentNode:document.body).insertBefore(paneel, anchorEl?anchorEl.nextSibling:null);

  const tijdEl=paneel.querySelector('.memo-rec-tijd');
  const start=Date.now();
  let duurSec=0, klaar=false;
  const tik=setInterval(()=>{
    duurSec=Math.floor((Date.now()-start)/1000);
    tijdEl.textContent=Math.floor(duurSec/60)+':'+String(duurSec%60).padStart(2,'0');
    if(duurSec>=MEMO_MAX_SEC) stop();
  },250);

  function opruimen(){ clearInterval(tik); stream.getTracks().forEach(t=>t.stop()); paneel.remove(); }

  async function verstuur(blob){
    const itemId=await ensureItemId(item, list);
    const durationSec=Math.max(1, Math.min(MEMO_MAX_SEC, duurSec||1));
    const recMime=(rec.mimeType||mime||blob.type||'audio/webm');
    let audioB64;
    try{ audioB64=await _blobNaarB64(blob); }
    catch(e){ showToast('Opname mislukt', e.message, 'var(--rd)'); return; }
    const who=getCurrentWho()||'?';
    const snapshot=item.actiepunt||item.periode||item.titel||item.code||'';
    const optim={ memoId:'M-pending-'+Date.now().toString(36), list, code:item.code||'',
      sectie:item._sec||'', itemId, snapshot, door:who, fileId:'', duur:durationSec,
      mime:recMime, ts:new Date().toISOString(), _row:0, _pending:true };
    D.memos=D.memos||{};
    (D.memos[list+'|'+itemId]=D.memos[list+'|'+itemId]||[]).unshift(optim);
    _herrenderMemoUI(list, itemId);
    try{
      const res=await callMemoLoket('uploadmemo', buildUploadPayload(
        Object.assign({}, item, {itemId}), list, item._sec||'', durationSec, recMime, audioB64));
      optim.memoId=res.memoId||optim.memoId; optim.fileId=res.fileId||optim.fileId;
      optim.ts=res.timestamp||optim.ts; optim._pending=false;
      showToast('Memo verstuurd', (item.code||'')+' · '+durationSec+'s', 'var(--ac)');
    }catch(e){
      const arr=D.memos[list+'|'+itemId]||[];
      const i=arr.indexOf(optim); if(i>-1) arr.splice(i,1);
      showToast('Niet verzonden', 'Probeer opnieuw — '+(e.message||''), 'var(--rd)');
    }
    _herrenderMemoUI(list, itemId);
  }

  function stop(){
    if(klaar) return; klaar=true;
    rec.onstop=async ()=>{
      const blob=new Blob(brokken,{type:(rec.mimeType||mime||'audio/webm')});
      opruimen();
      if(blob.size) await verstuur(blob);
    };
    try{ rec.stop(); }catch(e){ opruimen(); }
  }

  paneel.querySelector('.memo-rec-stop').onclick=stop;
  paneel.querySelector('.memo-rec-annuleer').onclick=()=>{ klaar=true; try{rec.stop();}catch(e){} opruimen(); };
  rec.start();
}

// Hertekent de open memo-lijst-container van dit item (indien zichtbaar) na een mutatie.
function _herrenderMemoUI(list, itemId){
  document.querySelectorAll(`.memo-sectie[data-list="${list}"][data-itemid="${itemId}"]`).forEach(c=>{
    renderMemoList(c, c._memoItem||{itemId, code:c.dataset.code, _sec:c.dataset.sec}, list);
  });
}
```
- [ ] Voeg toe (afspelen met sessie-cache):
```js
const _memoUrlCache=new Map();
let _huidigeAudio=null, _huidigeBtn=null;

function _b64NaarBlob(b64, mime){
  const bin=atob(b64), len=bin.length, bytes=new Uint8Array(len);
  for(let i=0;i<len;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime||'audio/webm'});
}
const MEMO_PLAY_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const MEMO_PAUSE_SVG='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
function _zetSpeelIcoon(btnEl, spelend){
  btnEl.classList.toggle('memo-speelt', spelend);
  btnEl.setAttribute('aria-label', spelend?'Pauzeer':'Speel af');
  btnEl.innerHTML=spelend?MEMO_PAUSE_SVG:MEMO_PLAY_SVG;
}

// Speelt/pauzeert een memo. Eerste keer: getmemo → Blob → object-URL (gecachet).
async function playMemo(memoId, btnEl){
  if(_huidigeAudio && _huidigeBtn && _huidigeBtn!==btnEl){ _huidigeAudio.pause(); _zetSpeelIcoon(_huidigeBtn,false); }
  if(btnEl._audio && !btnEl._audio.paused){ btnEl._audio.pause(); _zetSpeelIcoon(btnEl,false); return; }
  if(btnEl._audio && btnEl._audio.paused && btnEl._audio.currentTime>0){
    btnEl._audio.play(); _zetSpeelIcoon(btnEl,true); _huidigeAudio=btnEl._audio; _huidigeBtn=btnEl; return;
  }
  const oudHtml=btnEl.innerHTML;
  btnEl.disabled=true; btnEl.innerHTML='…';
  try{
    let url=_memoUrlCache.get(memoId);
    if(!url){
      const res=await callMemoLoket('getmemo',{memoId});
      url=URL.createObjectURL(_b64NaarBlob(res.audioB64, res.mime));
      _memoUrlCache.set(memoId, url);
    }
    const audio=new Audio(url);
    btnEl._audio=audio;
    const bar=btnEl.closest('.memo-item')?.querySelector('.memo-prog-fill');
    audio.ontimeupdate=()=>{ if(bar&&audio.duration) bar.style.width=(audio.currentTime/audio.duration*100)+'%'; };
    audio.onended=()=>{ _zetSpeelIcoon(btnEl,false); if(bar) bar.style.width='0%'; };
    btnEl.disabled=false; btnEl.innerHTML=oudHtml;
    audio.play(); _zetSpeelIcoon(btnEl,true);
    _huidigeAudio=audio; _huidigeBtn=btnEl;
  }catch(e){
    btnEl.disabled=false; btnEl.innerHTML=oudHtml;
    showToast('Afspelen mislukt', e.message||'Loket onbereikbaar', 'var(--rd)');
  }
}
```
- [ ] Voeg toe (lijst-render + sectie open/dicht + verwijderen + item-opruiming):
```js
const _MEMO_AVKLEUR={Jer:'var(--ac)',Cihad:'var(--pu)',Gabos:'var(--pk)',Cihan:'var(--am)'};
function _memoDatum(iso){
  const d=new Date(iso);
  if(isNaN(d)) return '';
  return d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
}
function _duurLbl(sec){ return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'); }

// Rendert de memo-lijst (nieuwste boven) + "Memo inspreken" in `container`.
function renderMemoList(container, item, list){
  if(!container) return;
  const itemId=item.itemId||'';
  container._memoItem=item;
  container.classList.add('memo-sectie');
  container.dataset.list=list; container.dataset.itemid=itemId;
  container.dataset.code=item.code||''; container.dataset.sec=item._sec||'';
  const memos=itemId?((D.memos||{})[list+'|'+itemId]||[]):[];
  const rij=m=>{
    const naam=esc(displayName(m.door)||m.door||'?');
    const init=(naam||'?').charAt(0).toUpperCase();
    const kleur=_MEMO_AVKLEUR[displayName(m.door)]||'var(--nv)';
    const pend=m._pending?' memo-item-pending':'';
    const delBtn=m._pending?'' :`<button type="button" class="memo-del" data-action="memo-verwijderen" data-memoid="${esc(m.memoId)}" data-list="${esc(list)}" data-itemid="${esc(itemId)}" title="Verwijderen" aria-label="Memo verwijderen"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg></button>`;
    return `<div class="memo-item${pend}" data-memoid="${esc(m.memoId)}">
      <span class="memo-av" style="background:${kleur}">${esc(init)}</span>
      <div class="memo-mid">
        <div class="memo-meta"><b>${naam}</b> <span class="memo-dt">${esc(_memoDatum(m.ts))}</span></div>
        <div class="memo-speler">
          <button type="button" class="memo-play" data-action="memo-afspelen" data-memoid="${esc(m.memoId)}" aria-label="Speel af"${m._pending?' disabled':''}>${MEMO_PLAY_SVG}</button>
          <div class="memo-prog"><div class="memo-prog-fill"></div></div>
          <span class="memo-duur">${esc(_duurLbl(m.duur||0))}</span>
        </div>
      </div>
      ${delBtn}
    </div>`;
  };
  const lijst=memos.length?memos.map(rij).join(''):'<div class="memo-leeg">Nog geen spraakmemo\'s op deze taak.</div>';
  container.innerHTML=`
    <div class="memo-lijst">${lijst}</div>
    <button type="button" class="btn btn-sec btn-sm memo-inspreken" data-action="memo-inspreken" data-list="${esc(list)}" data-itemid="${esc(itemId)}">${MIC_SVG} Memo inspreken</button>`;
}

// Klik op de badge: open/sluit een memo-sectie net ná de itemrij/-knop.
function toggleMemoSectie(list, itemId, anchorEl){
  const bestaand=document.querySelector(`.memo-sectie[data-list="${list}"][data-itemid="${itemId}"]`);
  if(bestaand){ bestaand.closest('.memo-tr')?.remove(); if(bestaand.parentNode) bestaand.remove(); return; }
  let item=null;
  const tr=anchorEl.closest('tr[data-row]');
  if(tr){ item=(state._rowCache||[]).find(r=>r&&r.itemId===itemId)||null; }
  if(!item) item={ itemId, code:anchorEl.dataset.code||'', _sec:anchorEl.dataset.sec||'' };
  const sectie=document.createElement('div');
  if(tr){
    const nieuweTr=document.createElement('tr');
    nieuweTr.className='memo-tr';
    const td=document.createElement('td');
    td.colSpan=tr.children.length; td.appendChild(sectie);
    nieuweTr.appendChild(td);
    tr.parentNode.insertBefore(nieuweTr, tr.nextSibling);
  } else {
    anchorEl.parentNode.insertBefore(sectie, anchorEl.nextSibling);
  }
  renderMemoList(sectie, item, list);
}

// Verwijder één memo (verwijderknop in de lijst). Optimistisch + server.
async function verwijderMemo(memoId, list, itemId){
  if(!confirm('Deze spraakmemo verwijderen?')) return;
  const arr=(D.memos||{})[list+'|'+itemId]||[];
  const i=arr.findIndex(m=>m.memoId===memoId);
  const verwijderd=i>-1?arr.splice(i,1)[0]:null;
  _memoUrlCache.delete(memoId);
  _herrenderMemoUI(list, itemId);
  try{ await callMemoLoket('deletememo',{memoId}); showToast('Memo verwijderd','', 'var(--ac)'); }
  catch(e){ if(verwijderd){ arr.splice(Math.min(i,arr.length),0,verwijderd); _herrenderMemoUI(list, itemId); } showToast('Verwijderen mislukt', e.message||'', 'var(--rd)'); }
}

// Verwijder alle memo's van één item (afrond-vink "direct verwijderen"). Aangeroepen door crud.js.
async function deleteItemMemos(list, itemId){
  if(!itemId) return;
  try{ await callMemoLoket('deleteitemmemos',{list, itemId}); }
  catch(e){ showToast('Memo-opruiming mislukt', e.message||'', 'var(--rd)'); }
  if(D.memos) delete D.memos[list+'|'+itemId];
}
```
- [ ] Werk de export-regel bij naar:
```js
export { genItemId, idCellA1, ensureItemId, parseMemos, memoCount, pickMimeType, memoBadgeHtml, MIC_SVG, buildUploadPayload, memoAfrondHelp, memoIsVerlopen, openMemoRecorder, playMemo, renderMemoList, toggleMemoSectie, verwijderMemo, deleteItemMemos, _herrenderMemoUI };
```
- [ ] **Verificatie:** `index.html?test=1` → `window._testResult` nog steeds `0 FAIL` (module-load mag niet breken).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/spraakmemo.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: opname-paneel, afspelen (sessie-cache), memo-lijst, sectie open/dicht, verwijderen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 28: Front-end — memo-acties in actions.js

- [ ] Voeg de import toe ná de bestaande `render-vve`-import (regel 21) in `src/actions.js`:
```js
import { openMemoRecorder, playMemo, toggleMemoSectie, verwijderMemo } from './spraakmemo.js';
```
- [ ] Voeg na de imports de helper toe:
```js
// Het item-object hangt aan de memo-sectie-container (gezet door renderMemoList).
function _memoItemUitEl(el){
  const sec=el.closest('.memo-sectie');
  if(sec&&sec._memoItem) return sec._memoItem;
  return { itemId:el.dataset.itemid, code:'', _sec:'' };
}
```
- [ ] Voeg in het `ACTIONS`-object (na de chat-acties, regel 83) toe:
```js
  'memo-open':        (el) => toggleMemoSectie(el.dataset.list, el.dataset.itemid, el),
  'memo-inspreken':   (el) => { const it=_memoItemUitEl(el); if(it) openMemoRecorder(it, el.dataset.list, el); },
  'memo-afspelen':    (el) => playMemo(el.dataset.memoid, el),
  'memo-verwijderen': (el) => verwijderMemo(el.dataset.memoid, el.dataset.list, el.dataset.itemid),
```
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/actions.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: memo-acties koppelen aan de delegatie-listener

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 29: Front-end — badges integreren in alle lijst-renders

- [ ] **render-tabel.js (NTD):** import na regel 10 `import { memoBadgeHtml } from "./spraakmemo.js";`. In `rowNtd(r,sec)` regel 125 wijzig `const extraPills = stilPill + opvolgPill;` naar:
```js
  const memoBadge = memoBadgeHtml('NTD', r.itemId);
  const extraPills = stilPill + opvolgPill + memoBadge;
```
- [ ] **render-vve.js:** import na regel 13. In `taakRij(r,weg)` regel 160 wijzig `<td>${persBadges(r.behandelaar)}</td>` naar:
```js
      <td>${persBadges(r.behandelaar)}${memoBadgeHtml('NTD', r.itemId)}</td>
```
> De rij-`<tr>` heeft `data-action="taak-bewerken"`; de badge is een eigen `<button data-action="memo-open">` → `closest('[data-action]')` pakt de badge, niet de rij. Verifieer dit gedrag in Taak 31.
- [ ] **render-overig.js (Ontwikkeling):** import na regel 12. In `renderOntw` regel 60 wijzig `<td class="cell-name">${esc(r.titel)}</td>` naar:
```js
      <td class="cell-name">${esc(r.titel)}${memoBadgeHtml('ONTW', r.itemId)}</td>
```
- [ ] **render-alv.js (ALVO/ALFA):** import bovenaan. Voeg `${memoBadgeHtml('ALVO', r.itemId)}` in de naam-cel van `renderAlvo` en `${memoBadgeHtml('ALFA', r.itemId)}` in `renderAlfa` (naast de VvE-naam, zoals bij NTD/Ontwikkeling).
- [ ] **render-offerte.js (Offerte-trajecten DEFAULT-weergave):** de offerte-tab gaat NIET door `rowNtd`, dus de NTD-tabel-badge bereikt 'm niet — de badge moet apart in het Vandaag-/hero-/groep-traject. Offerte-rijen leven in `D.ntd['OFFERTE-TRAJECTEN']` en dragen dus de NTD-`itemId` (parser kol Q, Taak 25). Voeg import bovenaan toe: `import { memoBadgeHtml } from "./spraakmemo.js";`. Plaats de badge (list `'NTD'`):
  - In `offerteHeroKaart(r, daarna, nuLen)`: in de `.of-hero-line` ná de code, dus
    `<div class="of-hero-line">${reden}<span class="of-hero-code">${esc(r.code)}</span>${memoBadgeHtml('NTD', r.itemId)}</div>`.
  - In `offerteFocusRij(r, soort)`: in de `.of-mid` ná de `.of-ctx`/aannemers-samenvatting, dus
    `<div class="of-mid"><div class="of-naam">${esc(r.naam||'')}</div><div class="of-ctx">${ctx}</div>${offerteAannSamenvatting(r)}${memoBadgeHtml('NTD', r.itemId)}</div>`.
  > Lees `src/render-offerte.js` om de exacte regels te bevestigen (`offerteHeroKaart` ~r.18-44, `offerteFocusRij` ~r.133-155); plaats de badge zonder de bestaande knop-/actie-structuur te verstoren.
- [ ] **render-vandaag.js (Dagstart-cockpit, afgeleide weergave — spec §3):** de items komen uit `D.ntd[sec]` (via `alleTaken()`), dus `r` draagt de NTD-`itemId`. Voeg import bovenaan toe: `import { memoBadgeHtml } from './spraakmemo.js';`. In `rowHtml(item)` plaats de badge (list `'NTD'`) in de `.vd-top`-regel ná `.vd-reden`, dus
  `<div class="vd-top"><span class="vd-actie">${esc(titel)}</span><span class="vd-reden">${esc(u.reden)}</span>${memoBadgeHtml('NTD', r.itemId)}</div>`.
  > De rij-`<div>` heeft `data-action="vve-open"`; de badge is een eigen `<button data-action="memo-open">` → `closest('[data-action]')` pakt de badge, niet de rij (verifieer in Taak 31). Bevestig dat `r` hier het ruwe NTD-item is (het wordt al in `_rowCache` gepusht), zodat `r.itemId` bestaat.
- [ ] **render-analytics.js (Dashboard "Recent afgerond" — afgeleide weergave, spec §3):** de tabel rendert `D.af`-items (zelfde `parseSections`-parser → dragen `itemId` uit kol Q) verrijkt met `_sec`. Voeg import bovenaan toe: `import { memoBadgeHtml } from "./spraakmemo.js";`. In `buildDash` plaats de badge (list `'NTD'`) in de naam-cel van de recent-afgerond-rij, dus
  `<td class="cell-name">${esc(r.naam)}${memoBadgeHtml('NTD', r.itemId)}</td>`.
  > Afgeronde taken met aangevinkt "direct verwijderen" hebben geen actieve memo's meer → `memoCount` 0 → `''` (geen badge), wat correct is; alleen taken waarvan memo's nog niet zijn opgeruimd tonen de badge.
- [ ] **Verificatie:** `index.html?test=1` → `0 FAIL`. Laad ingelogd zonder memo's: alle lijsten renderen normaal, géén badges, geen console-fouten (`memoBadgeHtml('NTD', undefined)` → `0` → `''`).
- [ ] **Handmatige verificatie (staging, met ≥1 memo op een NTD-taak):** badge zichtbaar in (a) de offerte-tab Vandaag-/hero-kaart én groep-/focusrij, (b) de Dagstart-cockpit ("Vandaag") bij de betreffende taak, (c) de Dashboard-tabel "Recent afgerond" als de afgeronde taak nog niet-opgeruimde memo's heeft. In alle drie opent klikken op de badge de memo-sectie, niet de onderliggende rij-actie.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/render-tabel.js src/render-vve.js src/render-overig.js src/render-alv.js src/render-offerte.js src/render-vandaag.js src/render-analytics.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: mic-badge in NTD-tabel, per-VvE, Ontwikkeling, ALV, offerte-tab, Vandaag en Recent-afgerond

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 30: Front-end — afrond-vinkje + notif-voorkeur + CSS

- [ ] **index.html afrond-modal:** vervang de `complete-bg` body (regels 610-613) door:
```html
    <div class="modal-body">
      <div class="fld"><label>Afgerond op</label><input type="date" id="complete-date"/></div>
      <div class="fld"><label>Opmerking</label><textarea id="complete-comment" rows="3" placeholder="Optioneel — wat is er gedaan?"></textarea></div>
      <div class="toggle-row" id="afrond-del-memo-row" style="display:none;margin-top:6px">
        <button type="button" class="tog" role="switch" aria-checked="false" id="afrond-del-memo" aria-label="Spraakmemo's van deze taak direct verwijderen"></button>
        <span>Spraakmemo&rsquo;s van deze taak direct verwijderen</span>
      </div>
      <p id="afrond-del-memo-help" style="display:none;font-size:12px;color:var(--mut);margin:4px 0 0 46px;line-height:1.5"></p>
    </div>
```
- [ ] **index.html notif-modal:** ná de `daily`-toggle (regel 789) toevoegen:
```html
      <div class="toggle-row"><button type="button" class="tog" role="switch" aria-checked="false" id="tog-notif-memo" data-action="notif-toggle"></button><span>Nieuwe spraakmemo op mijn taak</span></div>
```
- [ ] **crud.js imports:** ná regel 12 toevoegen:
```js
import { callMemoLoket } from "./api.js";
import { memoCount, memoAfrondHelp } from "./spraakmemo.js";
```
- [ ] **crud.js completeTask** (regel 222-223): vervang door:
```js
  document.getElementById('complete-title').textContent=`Taak afhandelen — ${r.actiepunt||r.periode||r.code||''}`;
  // Spraakmemo-vinkje: alléén tonen als deze taak memo's heeft (NTD-lijst, op itemId).
  const _delMemo=document.getElementById('afrond-del-memo');
  const _delMemoRow=document.getElementById('afrond-del-memo-row');
  const _delMemoHelp=document.getElementById('afrond-del-memo-help');
  const _heeftMemos=r.itemId && memoCount('NTD',r.itemId)>0;
  if(_delMemo){ _delMemo.classList.remove('on'); _delMemo.setAttribute('aria-checked','false'); }
  if(_delMemoRow) _delMemoRow.style.display=_heeftMemos?'':'none';
  if(_delMemoHelp){ _delMemoHelp.style.display=_heeftMemos?'':'none'; _delMemoHelp.textContent=memoAfrondHelp(false); }
  document.getElementById('complete-bg').classList.add('open');
```
- [ ] **crud.js toggle-binding:** ná `closeCompleteModal` (regel 300) toevoegen:
```js
// Afrond-modal memo-toggle: schakelt 'on' + wisselt de helptekst (30 dagen ↔ direct weg).
function bindAfrondMemoToggle(){
  const t=document.getElementById('afrond-del-memo');
  if(!t || t._memoBound) return;
  t._memoBound=true;
  t.addEventListener('click',()=>{
    const on=!t.classList.contains('on');
    t.classList.toggle('on',on); t.setAttribute('aria-checked',on?'true':'false');
    const h=document.getElementById('afrond-del-memo-help');
    if(h) h.textContent=memoAfrondHelp(on);
  });
}
bindAfrondMemoToggle();
```
- [ ] **crud.js doCompleteTask:** ná `const r=state._rowCache[idx];` (regel 228) toevoegen:
```js
  const _delMemos=document.getElementById('afrond-del-memo')?.classList.contains('on')===true;
```
en in het `backgroundWrite`-succespad ná de `logEvent(...)`-regel (regel 290):
```js
        // Bij aangevinkt vinkje: ná de geslaagde afronding de spraakmemo's van dit item wissen.
        // Faalt dit, dan ruimt de 30-dagen-trigger ze later alsnog op → geen harde fout tonen.
        if(_delMemos && r.itemId){
          try{ await callMemoLoket('deleteitemmemos',{list:'NTD',itemId:r.itemId}); }
          catch(e){ console.warn('deleteitemmemos faalde (cleanup-trigger ruimt later op):',e); }
        }
```
- [ ] **notifications.js getNotifPrefs** (regel 197-199): voeg ná de `daily`-regel toe `memo: localStorage.getItem('notif_memo') !== 'false',`.
- [ ] **notifications.js openNotifModal** (regel 270): wijzig de toggle-laad-array naar `['newtask','assigned','deadline','alv','daily','memo']`.
- [ ] **notifications.js saveNotifPrefs prefs** (regel 314-320): voeg `memo: document.getElementById('tog-notif-memo').classList.contains('on'),` toe.
- [ ] **notifications.js saveNotifPrefs addTags** (regel 326-333): voeg `n_memo: prefs.memo ? '1' : '0',` toe (ná `n_daily`).
> **Let op (Aandachtspunt c):** de `n_memo`-tag komt pas op de OneSignal-subscription nadat een gebruiker `saveNotifPrefs` één keer doorloopt (voorkeuren openen + opslaan). Bestaande gebruikers krijgen tot die eenmalige opslag de memo-melding alléén in-app (geen push). Neem dit als losse na-deploy-actie op in de Deploy-sectie (stap 7).
- [ ] **notifications.js subscribeNotifs** (regel 369): wijzig de default-init-loop naar `['newtask','assigned','deadline','alv','daily','memo']`.
- [ ] **notifications.js pollNotifsForToast typeToPrefs** (regel 214): voeg `n_memo:'memo'` toe.
- [ ] **notifications.js TOAST_ICONS** (regel 46-53): voeg ná `n_daily:` toe:
```js
  n_memo:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" fill-opacity="0.18"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6"/></svg>',
```
- [ ] **notifications.js TOAST_COLORS** (regel 54): voeg `n_memo:'var(--ac)',` toe.
- [ ] **CSS (hoofd-stylesheet):** voeg het memo-blok toe:
```css
/* ── Spraakmemo ── */
.memo-badge{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;border:1px solid var(--ac);background:var(--ac-l);color:var(--ac);border-radius:11px;font-size:11px;font-weight:700;cursor:pointer;vertical-align:middle}
.memo-badge:hover{background:var(--ac);color:#fff}
.memo-badge svg{flex:none}
.memo-tr>td{background:var(--sur2);padding:0}
.memo-sectie{padding:12px 14px}
.memo-lijst{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.memo-item{display:flex;align-items:flex-start;gap:10px}
.memo-item-pending{opacity:.6}
.memo-av{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700}
.memo-mid{flex:1;min-width:0}
.memo-meta{font-size:12.5px}
.memo-dt{color:var(--mut);font-size:11.5px;margin-left:4px}
.memo-speler{display:flex;align-items:center;gap:8px;margin-top:4px}
.memo-play{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid var(--ac);background:var(--ac-l);color:var(--ac);display:flex;align-items:center;justify-content:center;cursor:pointer}
.memo-play.memo-speelt{background:var(--ac);color:#fff}
.memo-prog{flex:1;height:5px;border-radius:3px;background:var(--sur);overflow:hidden}
.memo-prog-fill{height:100%;width:0;background:var(--ac);transition:width .1s linear}
.memo-duur{flex:none;color:var(--mut);font-size:11.5px;font-variant-numeric:tabular-nums}
.memo-del{flex:none;border:none;background:none;color:var(--mut);cursor:pointer;padding:2px}
.memo-del:hover{color:var(--rd)}
.memo-leeg{color:var(--mut);font-size:12.5px;padding:2px 0 8px}
.memo-inspreken{display:inline-flex;align-items:center;gap:6px}
.memo-recorder{display:flex;align-items:center;gap:10px;padding:8px 12px;margin:6px 0;background:var(--ac-l);border:1px solid var(--ac);border-radius:8px}
.memo-rec-dot{width:10px;height:10px;border-radius:50%;background:var(--rd);animation:memoPuls 1s infinite}
@keyframes memoPuls{0%,100%{opacity:1}50%{opacity:.3}}
.memo-rec-tijd{font-variant-numeric:tabular-nums;font-weight:700;color:var(--ac)}
.memo-rec-golf{display:flex;gap:2px;align-items:center;flex:1}
.memo-rec-golf span{width:3px;height:10px;background:var(--ac);border-radius:2px;animation:memoGolf .9s infinite ease-in-out}
.memo-rec-golf span:nth-child(2){animation-delay:.1s}
.memo-rec-golf span:nth-child(3){animation-delay:.2s}
.memo-rec-golf span:nth-child(4){animation-delay:.3s}
.memo-rec-golf span:nth-child(5){animation-delay:.4s}
@keyframes memoGolf{0%,100%{height:8px}50%{height:18px}}
@media (prefers-reduced-motion:reduce){.memo-rec-dot,.memo-rec-golf span{animation:none}}
```
- [ ] **Verificatie:** `index.html?test=1` → `0 FAIL`; notif-modal toont "Nieuwe spraakmemo op mijn taak", stand blijft na sluiten/heropenen (`localStorage.getItem('notif_memo')`).
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/crud.js src/notifications.js index.html
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: afrond-vinkje (deleteitemmemos) + n_memo voorkeur/toast + opmaak

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

## Taak 31: APP_VERSION ophogen + regressie

- [ ] Wijzig `/Users/servicedesk/collectief-dashboard/src/config.js` regel 8: `export const APP_VERSION = '6.0';` → `export const APP_VERSION = '6.1';`
- [ ] Start de no-cache python-server, open `index.html?test=1`, lees `window._testResult`. **Verwacht:** `<N> OK, 0 FAIL` met N = baseline (345) + nieuwe memo-asserts (≈ +17 unit + parser/idCellA1/genItemId/parseMemos/memoCount/memoBadgeHtml-blokken). Géén FAIL.
- [ ] Laad ingelogd op staging zonder memo's: alle lijsten renderen normaal, geen badges, geen console-fouten.
- [ ] Bij FAIL: lees de `FAIL:`-console-regel, herstel via systematic-debugging, herhaal. Niet de test aanpassen.
- [ ] Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/config.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Versie 6.1: spraakmemo's per taak (opname/afspelen, melding, afrond-vinkje)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Aandachtspunten

Beknopte rationale + valkuilen die over taken heen spelen (geen extra code, wel bij uitvoering meenemen):

- **a) `appsscript.json` oauthScopes — niet raden (Taak 17).** Neem in de live Apps Script-editor (Project Settings → manifest) exact de auto-afgeleide scopes over en voeg UITSLUITEND `https://www.googleapis.com/auth/drive` toe. De scope-set in het codeblok van Taak 17 is een richtlijn; als de afgeleide set afwijkt (bv. volledige `…/auth/spreadsheets` i.p.v. `…spreadsheets.currentonly`), volg de afgeleide set. Voeg geen ongebruikte scope toe.
- **b) Circulaire imports rond `spraakmemo.js`.** `spraakmemo.js` ↔ `api.js`/`notifications.js`/`crud.js`/`data.js` vormen een import-cykel. Houd ALLE cross-module-aanroepen binnen functies (ES-modules hebben live bindings → runtime-resolutie); roep niets op module-top-level aan behalve DOM-binding (zoals `bindAfrondMemoToggle()` in Taak 30). Bevestig bij de groene eindbeoordeling dat de module-load in de harness niet breekt (0 FAIL).
- **c) `n_memo` OneSignal-tag — eenmalige opslag nodig.** Bestaande gebruikers moeten hun notif-voorkeuren één keer opslaan (`saveNotifPrefs` → `addTags`) zodat de `n_memo`-tag op hun subscription komt. Tot dan komt de memo-melding alléén in-app (Meldingen-rij/toast), niet als push. Meld dit in de afrond-/notif-taak (Taak 30) én in de Deploy-sectie.
- **d) §8-afwijking: melding via `cd_notifyNewMemo`, niet via `cd_processNotifEvent`.** De memo-melding loopt bewust via een directe `cd_notifyNewMemo`-aanroep in `cd_uploadMemo` (Taak 10), niet via een `newmemo`-tak in `cd_processNotifEvent`. De spec §14-testverwachting wordt daarmee: handmatige verificatie van `cd_notifyNewMemo` (zie Apps Script-verificatie hieronder), niet een `cd_processNotifEvent`-route.
- **e) §6 stat-/totaalrijen krijgen geen ID (Taak 20 `ensureItemId`).** `ensureItemId` mag nooit een ID schrijven op een ALV-stat-/totaalrij (geen geldige code). Dit wordt geborgd doordat de parsers (`parseAlvo` etc.) zulke rijen wegfilteren op het code-filter (`.filter(r=>r.code)`), zodat een stat-/totaalrij nooit als item met `_row` bij `ensureItemId` belandt. Verifieer expliciet: aanroep met een item zonder geldige code → geen schrijfactie.
- **f) §9 memo-sectie als eigen `.memo-tr` (Taak 27).** De memo-sectie wordt bewust als een eigen, los ingevoegde rij (`.memo-tr`) onder de itemrij getoond — NIET via het bestaande `state.expandedRows`-uitklapmechanisme — zodat de bestaande uitklap-logica ongemoeid blijft. Gevolg: een open memo-sectie zit niet in de render-state en overleeft een tabel-re-render niet automatisch. Voeg een handmatige verificatie toe dat een open memo-sectie correct verdwijnt (of bewust opnieuw moet worden geopend) bij een tabel-re-render (`loadAll`/hash-wijziging), zonder verweesde DOM of dubbele secties.

---

## Zelf-test & acceptatie

**Geautomatiseerd (browser-harness):** start de no-cache python-server uit `~/.claude`, open `index.html?test=1`, lees `window._testResult`. Verwacht `0 FAIL`. Gedekte pure helpers: config-constanten (Taak 1), `genItemId`/`idCellA1`/`memoIsVerlopen` (Taak 20), `parseMemos`/`memoCount` (Taak 21), `pickMimeType`/`memoBadgeHtml` (Taak 22), `buildUploadPayload` (Taak 23), `memoAfrondHelp` (Taak 24), parser-ID-uitlezing (Taak 25).

**Apps Script (handmatige editor-verificatie):** `cd_memoAuth` (leeg/rommel → `{ok:false}`, geldig → `{ok:true,email}`); `cd_memoSetupFolder`/`cd_memoSheet` (map + tab + 12 koppen, idempotent); `cd_uploadMemo` (Drive-bestand + rij + `{ok,memoId,fileId,timestamp}`, mime-allowlist); `cd_getMemo` (base64 terug); `cd_deleteMemo`/`cd_deleteItemMemos` (trash + `VERWIJDERD`, idempotent, `removed`); `cd_memoBehandelaar` (behandelaar-naam uit ID-lookup); `cd_notifyNewMemo` (naar behandelaar, niet actor; `allen`-fallback); `cd_cleanupMemos` (>30 dagen weg) + `cd_setupMemoCleanup` (één trigger).

**Handmatig end-to-end (staging, ná deploy):**
1. **Opnemen iOS (Safari):** NTD-taak → mic → toestemming → ~7s → "stoppen & versturen". Verwacht toast "Memo verstuurd", badge +1, MIME `audio/mp4` (kol K). Weigeren → nette uitleg, geen crash.
2. **Opnemen Android (Chrome):** zelfde taak → MIME `audio/webm(;codecs=opus)`; tweede memo onder de eerste (nieuwste boven).
3. **Afspelen PC:** beide memo's afspelen (mp4 + webm); tweede klik op dezelfde memo gebruikt sessie-cache (geen tweede `getmemo` in Netwerk-tab).
4. **Melding:** behandelaar = ander teamlid; spreek als jezelf in → push + in-app toast (mic-icoon, leiblauw) bij de behandelaar, niet bij de inspreker. Toggle "Nieuwe spraakmemo op mijn taak" uit → geen in-app toast meer.
5. **Terug-inspreken:** behandelaar spreekt terug → memo bovenaan met juiste naam/tijd; melding niet naar de actor.
6. **Afronden zonder vink:** memo's blijven (Status leeg), geen `deleteitemmemos`-call.
7. **Afronden met vink:** helptekst wisselt naar "direct verwijderd"; één POST `deleteitemmemos` → `{ok:true,removed:N}`; Drive-bestanden in prullenbak, rijen `VERWIJDERD`.
8. **Opruiming:** zet `MEMO_RETENTIE_DAGEN` tijdelijk laag in TEST, draai `cd_cleanupMemos` → oude memo's getrasht + rijen weg; zet terug op 30.
9. **Badge-klik vs rij-actie:** badge op per-VvE-pagina opent de memo-sectie, NIET de bewerk-modal; klik elders op de rij opent wél de bewerk-modal.
10. **Regressie:** secret-route (mail-intake) ongewijzigd; auth weigert fout token → `{error:"forbidden"}`.

**Acceptatie:** alle bovenstaande verwachte uitkomsten gehaald; `0 FAIL` in de harness; `APP_VERSION` toont `6.1`.

---

## Deploy

Volgorde (spec §15, geheugen "Deploy-pijplijn" + "Staging→main merge-les"), op branch `feature/spraakmemo`:

1. **Sheets/grid/Drive klaarzetten (TEST én PROD):** Taak 4-7 (grid verbreden + tab "Spraakmemo's") + Taak 9-verificatie (Drive-map "Spraakmemo's" onder bedrijfsaccount, map-ID in Script Properties `CD_MEMO_FOLDER_ID`). MOET vóór elke ID-schrijfactie (anders faalt `writeRange`).
2. **Backend (Apps Script):** `apps-script/Spraakmemo.gs` + `Notifications.gs` doPost-routing + `appsscript.json`-scopes via bestaande clasp/CI-deploy. Eénmalig autoriseren (Drive-scope). Draai `cd_setupMemoCleanup()` (pas nadat `cd_cleanupMemos` bestaat). **Web-app exec-URL noteren (TEST + PROD).**
3. **Front-end + api/:** `feature/spraakmemo` naar staging → CI deployt naar TEST.
4. **Web-app-URL in config:** vul `APPS_SCRIPT_URL_TEST` en `APPS_SCRIPT_URL_PROD` in `src/config.js` in. Commit:
```bash
git -C /Users/servicedesk/collectief-dashboard add src/config.js
git -C /Users/servicedesk/collectief-dashboard commit -m "$(cat <<'EOF'
Spraakmemo: web-app exec-URLs (TEST+PROD) in config

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```
5. **Verifiëren op staging:** doorloop het volledige end-to-end testplan op TEST; `index.html?test=1` → `0 FAIL`.
6. **Merge naar main:** NIET kaal staging→main mergen (staging kan divergente, niet-goedgekeurde commits bevatten). Eerst diffen (`git log --oneline main..staging`), dan de spraakmemo-commits gericht cherry-picken naar main (of een schone PR `feature/spraakmemo`→main). CI deployt main→PROD. Verifieer op de echte prod-URL `vvebeheercollectief.github.io/Collectief-Dashboard/` (bare root 404't) dat `APP_VERSION` `6.1` toont en de memo-/afrond-flow live werkt.
7. **`n_memo`-push activeren bij het team (Aandachtspunt c):** push voor nieuwe memo's komt pas binnen nadat elke gebruiker zijn notif-voorkeuren één keer opslaat (`saveNotifPrefs` → `addTags` zet de `n_memo`-tag op de OneSignal-subscription). Vraag Jer/Cihad/Gabos/Cihan na deploy hun meldingsinstellingen één keer te openen en op te slaan. Tot dan verschijnt de memo-melding alléén in-app (Meldingen-rij/toast), niet als push — dat is geen bug.