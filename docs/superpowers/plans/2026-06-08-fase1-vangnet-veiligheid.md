# Fase 1 — Vangnet & veiligheid — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het webhook-secret volledig uit de publieke frontend verwijderen door meldingen via een Sheet-wachtrij + Apps Script-trigger te laten lopen, het secret roteren naar server-only, en het `?test=1`-testnet uitbreiden — zonder dat meldingen voor het team stoppen met werken.

**Architecture:** De frontend schrijft een meldings-intentie als rij naar een nieuwe tab `Notif-wachtrij` (via het bestaande OAuth-`appendRange`). Een installeerbare `onChange`-trigger (plus een 5-minuten veegbeurt als vangnet) leest onverwerkte rijen en draait dezelfde meldingslogica die nu in `doPost` zit — geëxtraheerd naar een herbruikbare functie `cd_processNotifEvent(data)`. `doPost` blijft bestaan voor de toekomstige mail-intake, maar wordt afgeschermd met een geroteerd, server-only secret.

**Tech Stack:** Vanilla JS (`index.html`), Google Sheets REST API (OAuth bearer), Google Apps Script (`apps-script/Notifications.gs`), OneSignal push.

**Verificatie-aanpak:** Deze codebase heeft (nog) geen unit-test-runner — die komt in Fase 2. Verificatie gebeurt via (a) de in-browser `?test=1`-asserts voor pure functies, en (b) handmatige end-to-end checks met **self-targeted** meldingen (nooit het hele team pingen tijdens een test). Apps Script wordt handmatig in de editor "Afgerond script" geplakt (geen clasp); de repo-map `apps-script/` is de back-up-mirror en moet gelijk blijven.

---

## File Structure

| Bestand | Verantwoordelijkheid | Wijziging |
|---|---|---|
| `index.html` | Frontend; `?test=1`-asserts, `fireNotifEvent`, `sendTestNotif`, webhook-constanten | Modify |
| `apps-script/Notifications.gs` | Backend: `doPost`, triggers, meldingslogica, secret-setup | Modify (mirror) |
| Live "Afgerond script" editor | Draaiende Apps Script (web app + triggers) | Handmatig plakken + redeploy |
| Google Sheet, tab `Notif-wachtrij` | Meldings-wachtrij (Timestamp, Event, Payload, Verwerkt) | Aanmaken via helper |

**Volgorde (uit de spec):** testnet eerst (laag risico) → backend → frontend → secret roteren → opruimen. Backend vóór frontend, zodat de wachter klaarstaat als de frontend gaat enqueuen.

---

## Task 1: Testnet uitbreiden (`?test=1`)

Pure functies vastleggen als regressievangnet vóór Fase 2. We breiden het bestaande
`?test=1`-blok uit met asserts voor `_parseAnyDate`, `displayName` en `logZin`. De
inline sorteervergelijker en andere DOM-gekoppelde functies komen pas in Fase 2 aan bod
(als ze tot losse functies worden geëxtraheerd) — bewuste scope-keuze.

**Files:**
- Modify: `index.html` (testblok rond regel 4005-4042)

- [ ] **Step 1: Voeg een mini-assert-helper toe bovenaan het testblok**

In `index.html`, direct ná de regel `if (location.search.includes('test=1')) {` en de
bestaande `console.log('%c[TESTS] Auto-prioriteit'...)`-regel, voeg toe:

```javascript
  // ── mini-assert helper (Fase 1 testnet) ──
  let _tOk = 0, _tFail = 0;
  const eq = (label, got, exp) => {
    const g = JSON.stringify(got), e = JSON.stringify(exp);
    if (g === e) { _tOk++; }
    else { _tFail++; console.error(`FAIL: ${label} → verwacht ${e}, kreeg ${g}`); }
  };
  const truthy = (label, got) => { if (got) { _tOk++; } else { _tFail++; console.error(`FAIL: ${label} → verwacht waar, kreeg ${JSON.stringify(got)}`); } };
```

- [ ] **Step 2: Voeg asserts toe voor `_parseAnyDate`**

Direct ná de bestaande prioriteit-`cases.forEach(...)`-lus (vóór de afsluitende
`console.log('%c[TESTS] ...')`), voeg toe:

```javascript
  // ── _parseAnyDate ──
  eq('ISO yyyy-mm-dd',  _parseAnyDate('2026-05-21'),  {y:2026,m:5,d:21});
  eq('dd-mm-yyyy',      _parseAnyDate('21-05-2026'),  {y:2026,m:5,d:21});
  eq('dd/mm/yyyy',      _parseAnyDate('21/05/2026'),  {y:2026,m:5,d:21});
  eq('NL long "21 mei 2026"', _parseAnyDate('21 mei 2026'), {y:2026,m:5,d:21});
  eq('NL afk "3 jan. 2025"',  _parseAnyDate('3 jan. 2025'),  {y:2025,m:1,d:3});
  eq('NL "1 sept 2026"',      _parseAnyDate('1 sept 2026'),  {y:2026,m:9,d:1});
  eq('2-cijfer jaar "21 mei \'26"', _parseAnyDate("21 mei '26"), {y:2026,m:5,d:21});
  eq('leeg → null',     _parseAnyDate(''),            null);
  eq('onzin → null',    _parseAnyDate('geen datum'),  null);
```

> Let op: controleer bij FAIL of `_MAANDEN` de sleutels `sept`/`jan` bevat. Pas de
> verwachte waarde NIET aan om een bug te verbergen — een FAIL betekent dat de huidige
> code dat formaat niet aankan; noteer dat dan als bevinding.

- [ ] **Step 3: Voeg asserts toe voor `displayName` en `logZin`**

Direct ná de `_parseAnyDate`-asserts:

```javascript
  // ── displayName ── (EMAIL_NAMES-lookup, anders ruwe invoer terug)
  eq('displayName leeg', displayName(''), '');
  truthy('displayName onbekend e-mail geeft input terug', displayName('xyz@example.com') === 'xyz@example.com');

  // ── logZin ── (natuurlijke zin per logboek-actie; bevat juiste werkwoord)
  truthy('logZin Afgerond bevat "rondde"',  logZin({actie:'Afgerond', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('rondde'));
  truthy('logZin Verwijderd bevat "verwijderde"', logZin({actie:'Verwijderd', code:'TEST01', gebruiker:'info@vvebeheercollectief.nl'}).includes('verwijderde'));
```

- [ ] **Step 4: Tel de nieuwe asserts mee in de eindregel**

Vervang de bestaande slotregel van het testblok:

```javascript
  console.log(`%c[TESTS] ${ok} OK, ${fail} FAIL`, fail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
```

door:

```javascript
  const totOk = ok + _tOk, totFail = fail + _tFail;
  console.log(`%c[TESTS] ${totOk} OK, ${totFail} FAIL`, totFail ? 'background:#dc2626;color:white;padding:2px 6px' : 'background:#16a34a;color:white;padding:2px 6px');
```

- [ ] **Step 5: Draai de tests**

Start de preview en open `http://localhost:8080/index.html?test=1`. Open de console.
Verwacht: `[TESTS] N OK, 0 FAIL` (N ≥ 28). Bij een FAIL: noteer welke functie het
betreft. Een echte bug los je in een aparte stap op; verander nooit de verwachte waarde
om groen te krijgen.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "test: ?test=1 testnet uitgebreid (_parseAnyDate, displayName, logZin)"
```

---

## Task 2: Backend — `doPost` refactoren naar `cd_processNotifEvent` (gedrag identiek)

Pure refactor: de event-afhandeling uit `doPost` halen naar een herbruikbare functie,
zodat zowel `doPost` (n8n/mail-intake) als de wachtrij-wachter (Task 3) dezelfde logica
gebruiken. Nog geen gedragswijziging.

**Files:**
- Modify: `apps-script/Notifications.gs` (mirror) + plak in live editor

- [ ] **Step 1: Voeg `cd_processNotifEvent(data)` toe**

In `apps-script/Notifications.gs`, vlak vóór `function doPost(e) {` (regel 378), voeg toe:

```javascript
// Verwerkt één meldings-event. Aangeroepen vanuit doPost (n8n/mail-intake) én vanuit
// de Notif-wachtrij-wachter (cd_drainNotifQueue). Retourneert een resultaat-object.
function cd_processNotifEvent(data) {
  const ev = data.event;
  const code = (data.code || '').toString();
  const naam = (data.naam || '').toString();
  const beh  = (data.behandelaar || '').toString();
  const sec  = (data.sec || '').toString();
  const actor = (data.actor || '').toString();
  const categorie = (data.categorie || '').toString();
  const actiepunt = (data.actiepunt || '').toString();
  const deadline  = (data.deadline || '').toString();

  if (ev === 'newtask') {
    cd_notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + sec.toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL, dedupKey: 'new-' + code + '-' + Date.now()
    });
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        if (name && name !== actor) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '➕ Toegewezen aan jou',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'assign-' + code + '-' + name + '-' + Date.now()
          });
        }
      });
    }
  } else if (ev === 'assigned') {
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        if (name && name !== actor) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '➕ Toegewezen aan jou',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'reassign-' + code + '-' + name + '-' + Date.now()
          });
        }
      });
    }
  } else if (ev === 'completed') {
    // Niet pushen, alleen loggen
  } else if (ev === 'alv_update') {
    cd_notifyByTag('n_alv', '1', {
      title: data.title || '🏢 ALV-status verandert',
      body: code + (naam ? ' · ' + naam : ''),
      url: APP_URL, dedupKey: 'alv-' + code + '-' + Date.now()
    });
  } else if (ev === 'logboek') {
    cd_schrijfLogboek(code, sec, data.actie, data.veld, data.oudeWaarde, data.nieuweWaarde, actor);
  } else if (ev === 'test') {
    const who   = (data.who   || '').toString();
    const title = (data.title || '🔔 Test melding').toString();
    const body  = (data.body  || 'Notificaties werken correct!').toString();
    cd_schrijfMelding('test', title, body, who || 'allen');
  } else if (ev === 'create_task') {
    const rij = cd_withLock(function(){ return cd_createTaskRow(categorie, code, naam, actiepunt, beh, deadline); });
    cd_notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + (categorie || '').toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL, dedupKey: 'mailnew-' + code + '-' + Date.now()
    });
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        if (name && name !== actor) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '➕ Toegewezen aan jou',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'mailassign-' + code + '-' + name + '-' + Date.now()
          });
        }
      });
    }
    cd_schrijfLogboek(code, categorie, 'Aangemaakt via mail-intake', '', '', actiepunt, actor || 'mail-intake');
    return { ok: true, event: ev, rij: rij };
  } else if (ev === 'ping') {
    return { pong: true };
  }
  return { ok: true, event: ev };
}
```

- [ ] **Step 2: Vervang de body van `doPost` zodat hij `cd_processNotifEvent` aanroept**

Vervang de hele functie `doPost` (regel 378-471) door:

```javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('CD_WEBHOOK_SECRET');
    // FAIL CLOSED: ontbreekt het server-secret of klopt het niet, dan weigeren we.
    if (!secret || data.secret !== secret) {
      return ContentService.createTextOutput(JSON.stringify({error:'forbidden'})).setMimeType(ContentService.MimeType.JSON);
    }
    const result = cd_processNotifEvent(data);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}
```

- [ ] **Step 3: Plak in de live editor + redeploy de web app**

Open de Apps Script-editor ("Afgerond script"). Vervang `Notifications.gs` door de
nieuwe inhoud. **Opslaan.** Omdat `doPost` een web-app is: **Deploy → Beheer
implementaties → Bewerk → Nieuwe versie → Implementeren.**

- [ ] **Step 4: Verifieer dat de webhook nog werkt (ping)**

Voer in de editor uit (Run) een tijdelijke functie of test via de webhook met een
`ping`-event. Verwacht antwoord `{"pong":true}` bij geldig secret, en `{"error":"forbidden"}`
zonder/with fout secret. (Het bestaande `cd_testPushToJer()` mag óók gedraaid worden om
te bevestigen dat de push-keten ongemoeid is — pingt alleen Jer.)

- [ ] **Step 5: Commit (mirror)**

```bash
git add apps-script/Notifications.gs
git commit -m "refactor(apps-script): doPost-event-logica naar cd_processNotifEvent"
```

---

## Task 3: Backend — Notif-wachtrij + `onChange`-wachter + veegbeurt

**Files:**
- Modify: `apps-script/Notifications.gs` (mirror) + plak in live editor + draai setup-functies

- [ ] **Step 1: Voeg de wachtrij-constante toe**

In `apps-script/Notifications.gs`, bij de top-level constanten (rond regel 21-26, ná
`const ALVO_SHEET = "ALV's overzicht";`), voeg toe:

```javascript
const NOTIF_QUEUE_SHEET = 'Notif-wachtrij';
const NOTIF_QUEUE_MAX = 200; // verwerkte rijen die we bewaren
```

- [ ] **Step 2: Voeg de setup-helper voor de wachtrij-tab toe**

Voeg ergens onderaan `Notifications.gs` toe:

```javascript
function cd_setupNotifQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOTIF_QUEUE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTIF_QUEUE_SHEET);
    sheet.appendRow(['Timestamp', 'Event', 'Payload', 'Verwerkt']);
    sheet.setFrozenRows(1);
  }
  SpreadsheetApp.getUi().alert('✓ Tab "' + NOTIF_QUEUE_SHEET + '" staat klaar.');
}
```

- [ ] **Step 3: Voeg de wachter + veegbeurt + drain-functie toe**

Voeg onderaan `Notifications.gs` toe:

```javascript
// onChange vuurt — anders dan onEdit — óók bij wijzigingen via de Sheets-API.
function cd_onNotifQueueChange(e) { cd_drainNotifQueue(); }

// Vangnet: pakt rijen op die een gemiste onChange anders zou laten liggen.
function cd_sweepNotifQueue() { cd_drainNotifQueue(); }

function cd_drainNotifQueue() {
  cd_lockedRun('cd_drainNotifQueue', function() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOTIF_QUEUE_SHEET);
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 2) return;
    const rows = sheet.getRange(2, 1, last - 1, 4).getValues(); // A:D
    for (let i = 0; i < rows.length; i++) {
      const payload = rows[i][2], verwerkt = rows[i][3];
      if (verwerkt) continue; // al gedaan (of door de andere trigger)
      let data;
      try { data = JSON.parse(payload); }
      catch (err) { sheet.getRange(i + 2, 4).setValue('FOUT: ' + err); continue; }
      try {
        cd_processNotifEvent(data);
        sheet.getRange(i + 2, 4).setValue(new Date().toISOString());
      } catch (err) {
        sheet.getRange(i + 2, 4).setValue('FOUT: ' + err);
      }
    }
    // opschonen: oudste rijen cappen
    const now = sheet.getLastRow();
    if (now > NOTIF_QUEUE_MAX + 1) sheet.deleteRows(2, now - NOTIF_QUEUE_MAX - 1);
  });
}
```

> Geen lus: het terugschrijven van de `Verwerkt`-kolom vuurt opnieuw `onChange`, maar de
> volgende drain vindt geen lege `Verwerkt` meer en stopt. `cd_lockedRun` voorkomt dat
> de veegbeurt en `onChange` tegelijk dezelfde rij verwerken.

- [ ] **Step 4: Registreer de nieuwe triggers**

Werk `CD_TRIGGER_FUNCS` (regel 67) bij:

```javascript
const CD_TRIGGER_FUNCS = ['cd_onEditChange', 'cd_checkDeadlines', 'cd_dailySummary', 'cd_onNotifQueueChange', 'cd_sweepNotifQueue'];
```

Voeg in `setupNotificationTriggers` (na de bestaande `ScriptApp.newTrigger(...)`-regels,
vóór de `SpreadsheetApp.getUi().alert(...)`) toe:

```javascript
  ScriptApp.newTrigger('cd_onNotifQueueChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('cd_sweepNotifQueue').timeBased().everyMinutes(5).create();
```

- [ ] **Step 5: Plak in live editor + draai de setup-functies**

Plak `Notifications.gs` in de editor. **Opslaan.** Draai éénmalig in de editor:
`cd_setupNotifQueue` (maakt de tab) en daarna `setupNotificationTriggers` (herregistreert
alle triggers, inclusief de twee nieuwe). Keur de autorisatie-prompt goed indien gevraagd.

- [ ] **Step 6: Spike — valideer dat `onChange` vuurt bij een API-append (KRITIEK)**

Dit is het belangrijkste risico uit de spec. Test handmatig:
1. Zet in de tab `Notif-wachtrij` via de Google Sheets-UI één rij neer met in kolom B
   `test`, kolom C exact: `{"event":"test","who":"info@vvebeheercollectief.nl","title":"Wachter-test","body":"onChange werkt"}`,
   kolom A een tijdstempel, kolom D leeg.
2. Verwacht: binnen seconden verschijnt er een rij in de `Meldingen`-tab (geschreven door
   `cd_processNotifEvent` → `cd_schrijfMelding`), en kolom D van de wachtrij-rij wordt een
   tijdstempel.
3. **Belangrijke variant:** herhaal de append **via de Sheets-API** (niet de UI) — bv.
   een tijdelijke `cd_apiAppendTest()` die met `UrlFetchApp`/Sheets-API een rij toevoegt,
   óf wacht tot Task 4 en bevestig het daar. Als `onChange` NIET vuurt bij API-append maar
   de 5-min veegbeurt de rij wél oppakt: dat is acceptabel (melding ~max 5 min later);
   noteer de bevinding. Vuurt geen van beide: STOP en herzie (zie Open punten in de spec).

- [ ] **Step 7: Commit (mirror)**

```bash
git add apps-script/Notifications.gs
git commit -m "feat(apps-script): Notif-wachtrij + onChange-wachter + 5-min veegbeurt"
```

---

## Task 4: Frontend — meldingen via de wachtrij i.p.v. de webhook

**Files:**
- Modify: `index.html` — `fireNotifEvent` (3637-3664) en `sendTestNotif` (3969-3977)

- [ ] **Step 1: Zet `fireNotifEvent` om naar `appendRange`**

In `index.html`, vervang in `fireNotifEvent` het hele blok vanaf `if (!NOTIF_WEBHOOK_URL) return;`
t/m de bijbehorende `catch`-regel (regels 3655-3663) door:

```javascript
  try {
    const data = Object.assign({}, payload, { event, actor: who });
    await appendRange("Notif-wachtrij!A:D", [new Date().toISOString(), event, JSON.stringify(data), '']);
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
```

De lokale toast-logica erboven (regels 3645-3653) blijft ongewijzigd.

- [ ] **Step 2: Zet `sendTestNotif` om naar `appendRange`**

Vervang `sendTestNotif` (regels 3969-3977) door:

```javascript
function sendTestNotif(who, title, body) {
  showToast(title || '🧪 Test melding', body || 'Notificaties werken correct!', 'var(--ac)');
  try {
    appendRange("Notif-wachtrij!A:D", [new Date().toISOString(), 'test', JSON.stringify({ event:'test', who, title, body }), '']).catch(() => {});
  } catch (e) { console.warn('Notif-wachtrij faalde:', e); }
}
```

- [ ] **Step 3: Deploy de frontend**

```bash
git add index.html
git commit -m "feat(notif): frontend enqueuet meldingen in Notif-wachtrij (geen secret meer in de POST)"
```

Push naar `main` (deployt index.html via Vercel) **alleen als de gebruiker dat wil** —
volgens afspraak houden we deze sessie lokaal tenzij anders gevraagd. Voor de test kan de
lokale preview gebruikt worden, mits ingelogd (OAuth) tegen de echte Sheet.

- [ ] **Step 4: End-to-end self-test**

Log in op het dashboard (lokale preview of live na push). Stel je notificatie-"wie ben ik"
in op jezelf. Maak een **testtaak** aan die aan **jezelf** is toegewezen (niet aan een
collega — zo ping je niemand anders).
Verwacht:
1. Direct een lokale in-app toast ("📋 Nieuwe taak …").
2. Binnen seconden een nieuwe rij in `Notif-wachtrij` met kolom D ingevuld (verwerkt).
3. Een nieuwe rij in `Meldingen`.
4. Een OneSignal-push als je het tabblad/venster niet in focus hebt.
Verwijder daarna de testtaak.

- [ ] **Step 5: Bevestig dat de webhook-POST weg is uit het meldingenpad**

Run: `grep -n "NOTIF_WEBHOOK_URL" index.html`
Verwacht: alleen nog de constante-definitie (regel ~1159) en GEEN `fetch(NOTIF_WEBHOOK_URL`
meer. (De constante zelf verwijderen we in Task 6.)

---

## Task 5: Secret roteren naar server-only

Nu de frontend het secret niet meer meestuurt, maken we het ooit-gelekte secret dood en
zetten we een nieuw, server-only secret.

**Files:**
- Modify: `apps-script/Notifications.gs` — `setupWebhookSecret` (regel 546-551) + live editor

- [ ] **Step 1: Genereer een nieuw secret**

```bash
openssl rand -hex 24
```

Gebruik exact deze output als nieuw secret in de volgende stap (niet hergebruiken uit dit
plan — vers genereren).

- [ ] **Step 2: Werk `setupWebhookSecret` bij**

In `apps-script/Notifications.gs`, vervang in `setupWebhookSecret` de
`setProperty('CD_WEBHOOK_SECRET', '…')`-waarde door het nieuw gegenereerde secret, en
werk de datum-comment bij. Het secret komt **nergens** in `index.html`.

- [ ] **Step 3: Plak in live editor, draai, en redeploy**

Plak `Notifications.gs`. **Opslaan.** Draai `setupWebhookSecret()` in de editor (schrijft
de Script Property). **Deploy → Beheer implementaties → Nieuwe versie → Implementeren.**

- [ ] **Step 4: Verifieer dat het oude secret dood is**

POST met het OUDE secret naar de webhook → verwacht `{"error":"forbidden"}`.
POST met het NIEUWE secret + `{"event":"ping"}` → verwacht `{"pong":true}`.

- [ ] **Step 5: Commit (mirror)**

```bash
git add apps-script/Notifications.gs
git commit -m "chore(apps-script): webhook-secret geroteerd naar server-only (frontend gebruikt het niet meer)"
```

---

## Task 6: Frontend opschonen — secret-constanten verwijderen

**Files:**
- Modify: `index.html` — regels 1159-1160

- [ ] **Step 1: Verwijder de webhook-constanten**

Verwijder uit `index.html` de regels:

```javascript
const NOTIF_WEBHOOK_URL    = 'https://script.google.com/macros/s/.../exec';
const NOTIF_WEBHOOK_SECRET = '...'; // geroteerd 2026-06-08 ...
```

(Beide constanten worden nergens meer gebruikt na Task 4.)

- [ ] **Step 2: Grep-verificatie — niets verwijst er nog naar**

Run:
```bash
grep -n "NOTIF_WEBHOOK_URL\|NOTIF_WEBHOOK_SECRET" index.html
```
Verwacht: **geen** resultaten. Als er nog een verwijzing is, is een aanroeper gemist —
zoek die op en migreer hem (zie Task 4) vóór je verder gaat.

- [ ] **Step 3: Draai de tests opnieuw**

Open `…/index.html?test=1`. Verwacht: `[TESTS] N OK, 0 FAIL` (ongewijzigd t.o.v. Task 1).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "chore(notif): webhook-URL en gelekt secret uit publieke index.html verwijderd"
```

- [ ] **Step 5: Acceptatiecriteria afvinken (uit de spec)**

- [ ] `grep` op secret/`fetch(NOTIF_WEBHOOK_URL` in `index.html` = leeg.
- [ ] Nieuwe taak/toewijzing → in-app toast bij open clients én OneSignal-push bij gesloten app.
- [ ] Oud secret wordt geweigerd; `doPost` weigert zonder geldig (nieuw) secret.
- [ ] `?test=1` rapporteert 0 failures.

---

## Self-Review (uitgevoerd tegen de spec)

**Spec-dekking:**
- Spec §4.1 (frontend ontkoppelen) → Task 4 + Task 6. ✓
- Spec §4.2 (backend wachter + refactor + triggers + veegbeurt) → Task 2 (refactor) + Task 3 (wachter/triggers). ✓
- Spec §4.3 (secret roteren server-only) → Task 5. ✓
- Spec §4.4 (testnet) → Task 1. ✓
- Spec §5 (uitrolvolgorde) → taakvolgorde 1→6 volgt de spec (testnet, backend, frontend, secret, opruimen). ✓
- Spec §6 risico "onChange betrouwbaarheid" → Task 3 Step 6 (spike) + veegbeurt-fallback. ✓
- Spec §6 risico "dubbele push" → `Verwerkt`-vlag + `cd_lockedRun` + bestaande `dedupKey` (Task 3 Step 3). ✓
- Spec §6 risico "hele team pingen" → self-targeted test (Task 3 Step 6, Task 4 Step 4). ✓
- Spec §6 risico "web app niet geredeployed" → expliciete redeploy-stappen (Task 2 Step 3, Task 5 Step 3). ✓
- Spec §7 acceptatiecriteria → Task 6 Step 5. ✓

**Scope-afwijking (bewust):** de inline sorteervergelijker uit de spec-testlijst is niet
opgenomen in Task 1 — die is nu DOM-/closure-gekoppeld (regel 1725) en wordt pas in Fase 2
geëxtraheerd en getest. `_parseAnyDate`, `displayName` en `logZin` dekken de pure functies
die nú makkelijk te isoleren zijn.

**Type/naam-consistentie:** `cd_processNotifEvent(data)` verwacht een object met
`event/code/naam/behandelaar/sec/actor/...`. De frontend schrijft exact dat object als
JSON in kolom C (Task 4 Step 1). De wachter doet `JSON.parse(kolom C)` en geeft het door
(Task 3 Step 3). Wachtrij-kolommen `A:D = Timestamp, Event, Payload, Verwerkt` consistent
in helper (Task 3 Step 2), wachter (Step 3) en frontend (Task 4). ✓

**Placeholder-scan:** geen TBD/TODO. Het nieuwe secret in Task 5 wordt vers gegenereerd
via een exact commando (geen verzonnen waarde) — bewust, want een secret hoort niet in een
plan te staan.
