/****************************************************************
 *  Collectief Dashboard — Push Notifications via OneSignal     *
 *  ----------------------------------------------------------- *
 *  Triggers:                                                   *
 *   - onEdit:   nieuwe taak / toewijzing / ALV-status          *
 *   - hourly:   deadline-checks (op basis van voorkeur uren)   *
 *   - 08:30:    dagelijkse samenvatting per behandelaar        *
 *                                                              *
 *  Eénmalige setup:                                            *
 *   1. Vul je OneSignal REST API key in via Script Properties: *
 *      Extensions → Apps Script → ⚙ Project Settings →         *
 *      Script Properties → Add: ONESIGNAL_REST_API_KEY = ...   *
 *   2. Run: setupNotificationTriggers()  (van de menubalk)     *
 *                                                              *
 *  VEILIG NAAST BESTAANDE CODE:                                *
 *   - Alle functienamen hebben prefix om conflicten te         *
 *     voorkomen (bv. cd_onEditChange ipv onEdit)               *
 *   - Trigger-setup raakt ALLEEN onze eigen triggers aan       *
 ****************************************************************/

const ONESIGNAL_APP_ID = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
const NTD_SHEET   = 'Nog Te Doen';
const ALVO_SHEET  = "ALV's overzicht";

const APP_URL = 'https://vvebeheercollectief.github.io/Collectief-Dashboard/';
const ICON_URL = APP_URL + 'icon-192.png';

// Hoeveel uur tolerantie bij deadline-check (script draait elk uur)
const DEADLINE_TOLERANCE_HOURS = 1;

// ════════════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════════════
const CD_TRIGGER_FUNCS = ['cd_onEditChange', 'cd_checkDeadlines', 'cd_dailySummary'];

function setupNotificationTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => CD_TRIGGER_FUNCS.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.newTrigger('cd_onEditChange').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('cd_checkDeadlines').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('cd_dailySummary').timeBased().atHour(8).nearMinute(30).everyDays(1).create();

  SpreadsheetApp.getUi().alert('✓ Notificatie-triggers ingesteld!\n\n• cd_onEditChange (nieuwe taken / wijzigingen)\n• cd_checkDeadlines (elk uur)\n• cd_dailySummary (dagelijks 08:30)\n\nJe bestaande triggers zijn ongemoeid gebleven.');
}

function removeNotificationTriggers() {
  const before = ScriptApp.getProjectTriggers().length;
  ScriptApp.getProjectTriggers()
    .filter(t => CD_TRIGGER_FUNCS.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  const after = ScriptApp.getProjectTriggers().length;
  SpreadsheetApp.getUi().alert('Verwijderd: ' + (before - after) + ' notificatie-triggers.');
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 1: onEdit — nieuwe taak / toewijzing / ALV update
// ════════════════════════════════════════════════════════════
function cd_onEditChange(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const row = e.range.getRow();

  try {
    if (name === NTD_SHEET) {
      cd_handleNtdEdit(sheet, row, e);
    } else if (name === ALVO_SHEET) {
      cd_handleAlvoEdit(sheet, row, e);
    }
  } catch (err) {
    Logger.log('onEditChange error: ' + err);
  }
}

function cd_handleNtdEdit(sheet, row, e) {
  const sec = cd_findSection(sheet, row);
  if (!sec) return;

  const rowData = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const code = (rowData[0] || '').toString().trim();
  const naam = (rowData[1] || '').toString().trim();
  if (!code) return;

  const behandelaarColMap = {
    'OPPAKKEN': 5,
    'VERGADERVERZOEKEN': 5,
    'OFFERTE-TRAJECTEN': 5,
    'LOD': 5,
  };
  const beh = (rowData[behandelaarColMap[sec] - 1] || '').toString().trim();

  const isNew = !e.oldValue && code;
  const colChanged = e.range.getColumn();

  if (isNew && colChanged === 1) {
    cd_schrijfLogboek(code, sec, 'Aangemaakt (sheet)', '', '', '', beh);
    cd_notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + sec.toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL
    });
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          title: '➕ Toegewezen aan jou',
          body: code + (naam ? ' · ' + naam : ''),
          url: APP_URL
        });
      });
    }
  } else if (colChanged === behandelaarColMap[sec] && beh && e.oldValue !== beh) {
    cd_splitBehandelaar(beh).forEach(name => {
      cd_notifyByExternalId(name, 'n_assigned', '1', {
        title: '➕ Toegewezen aan jou',
        body: code + (naam ? ' · ' + naam : ''),
        url: APP_URL
      });
    });
  }
}

function cd_handleAlvoEdit(sheet, row, e) {
  if (row < 3) return;
  const rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
  const code = (rowData[0] || '').toString().trim();
  const naam = (rowData[1] || '').toString().trim();
  if (!code) return;

  const col = e.range.getColumn();
  const newVal = (e.value || '').toString().toUpperCase();
  const oldVal = (e.oldValue || '').toString().toUpperCase();
  if (newVal === oldVal) return;

  let label = null;
  if (col === 3 && newVal === 'TRUE') label = '📬 Uitnodiging verstuurd';
  else if (col === 4 && newVal === 'TRUE') label = '✅ Notulen verstuurd';
  else if (col === 5 && newVal === 'TRUE') label = '💰 Begroting doorgezet';
  if (!label) return;

  cd_notifyByTag('n_alv', '1', {
    title: label,
    body: code + (naam ? ' · ' + naam : ''),
    url: APP_URL
  });
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 2: hourly deadline check
// ════════════════════════════════════════════════════════════
function cd_checkDeadlines() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  let curSec = null;
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

  const DEADLINE_COL = { 'OPPAKKEN': 3, 'VERGADERVERZOEKEN': 5, 'OFFERTE-TRAJECTEN': 5, 'LOD': 5 };
  const BEH_COL      = { 'OPPAKKEN': 4, 'VERGADERVERZOEKEN': 4, 'OFFERTE-TRAJECTEN': 4, 'LOD': 4 };

  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec) continue;
    if (!data[i][0]) continue;
    if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

    const code = (data[i][0] || '').toString().trim();
    const naam = (data[i][1] || '').toString().trim();
    const beh  = (data[i][BEH_COL[curSec]] || '').toString().trim();
    const dlVal = data[i][DEADLINE_COL[curSec]];
    if (!code || !dlVal) continue;

    const dl = cd_parseDate(dlVal);
    if (!dl) continue;

    const hoursUntil = (dl.getTime() - now.getTime()) / 3600000;
    if (hoursUntil < 0) continue;
    if (hoursUntil > 72) continue;

    [1, 4, 8, 24, 48].forEach(h => {
      if (Math.abs(hoursUntil - h) <= DEADLINE_TOLERANCE_HOURS) {
        const body = code + (naam ? ' · ' + naam : '') + ' — over ' + Math.round(hoursUntil) + ' uur';
        if (beh) {
          cd_splitBehandelaar(beh).forEach(name => {
            cd_sendNotification({
              filters: [
                { field: 'tag', key: 'behandelaar', relation: '=', value: name },
                { operator: 'AND' },
                { field: 'tag', key: 'n_deadline', relation: '=', value: '1' },
                { operator: 'AND' },
                { field: 'tag', key: 'deadline_h', relation: '=', value: String(h) },
              ],
              title: '⏰ Deadline nadert',
              body: body,
              url: APP_URL,
              dedupKey: 'dl-' + code + '-' + h
            });
          });
        }
      }
    });
  }
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 3: daily summary om 08:30
// ════════════════════════════════════════════════════════════
function cd_dailySummary() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let curSec = null;
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  const BEH_COL = { 'OPPAKKEN': 4, 'VERGADERVERZOEKEN': 4, 'OFFERTE-TRAJECTEN': 4, 'LOD': 4 };

  const perPerson = {};
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

    const beh = (data[i][BEH_COL[curSec]] || '').toString().trim();
    if (!beh) continue;
    cd_splitBehandelaar(beh).forEach(name => {
      if (!perPerson[name]) perPerson[name] = {};
      perPerson[name][curSec] = (perPerson[name][curSec] || 0) + 1;
    });
  }

  Object.keys(perPerson).forEach(name => {
    const tots = perPerson[name];
    const total = Object.values(tots).reduce((a,b) => a+b, 0);
    const parts = [];
    if (tots['OPPAKKEN']) parts.push(tots['OPPAKKEN'] + ' oppakken');
    if (tots['VERGADERVERZOEKEN']) parts.push(tots['VERGADERVERZOEKEN'] + ' vergaderverzoek' + (tots['VERGADERVERZOEKEN']>1?'en':''));
    if (tots['OFFERTE-TRAJECTEN']) parts.push(tots['OFFERTE-TRAJECTEN'] + ' offerte-traject' + (tots['OFFERTE-TRAJECTEN']>1?'en':''));
    if (tots['LOD']) parts.push(tots['LOD'] + ' LOD');

    cd_notifyByExternalId(name, 'n_daily', '1', {
      title: '☀️ Goedemorgen — ' + total + ' open ' + (total===1?'taak':'taken'),
      body: parts.join(' · '),
      url: APP_URL
    });
  });
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function cd_findSection(sheet, row) {
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  const colA = sheet.getRange(1, 1, row, 1).getValues();
  for (let i = row - 1; i >= 0; i--) {
    const v = (colA[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(v) !== -1) return v;
  }
  return null;
}

function cd_splitBehandelaar(s) {
  return (s || '').split(/[,\/]/).map(p => p.trim()).filter(Boolean);
}

function cd_parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = v.toString().trim();
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// ════════════════════════════════════════════════════════════
//  ONESIGNAL API
// ════════════════════════════════════════════════════════════
function cd_getApiKey() {
  const k = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_REST_API_KEY');
  if (!k) throw new Error('ONESIGNAL_REST_API_KEY ontbreekt in Script Properties.');
  return k;
}

function cd_notifyByTag(tagKey, tagValue, opts) {
  cd_schrijfMelding(opts.type || tagKey, opts.title, opts.body, 'allen');
  return cd_sendNotification({
    filters: [{ field: 'tag', key: tagKey, relation: '=', value: tagValue }],
    title: opts.title, body: opts.body, url: opts.url, dedupKey: opts.dedupKey
  });
}

function cd_notifyByExternalId(extId, tagKey, tagValue, opts) {
  cd_schrijfMelding(opts.type || tagKey, opts.title, opts.body, extId);
  return cd_sendNotification({
    filters: [
      { field: 'tag', key: 'behandelaar', relation: '=', value: extId },
      { operator: 'AND' },
      { field: 'tag', key: tagKey, relation: '=', value: tagValue }
    ],
    title: opts.title, body: opts.body, url: opts.url, dedupKey: opts.dedupKey
  });
}

function cd_sendNotification(p) {
  const payload = {
    app_id: ONESIGNAL_APP_ID,
    filters: p.filters,
    headings: { en: p.title, nl: p.title },
    contents: { en: p.body, nl: p.body },
    chrome_web_icon: ICON_URL,
    chrome_web_badge: ICON_URL,
    url: p.url || APP_URL,
  };
  if (p.dedupKey) payload.web_push_topic = p.dedupKey;

  try {
    const resp = UrlFetchApp.fetch('https://api.onesignal.com/notifications', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Key ' + cd_getApiKey() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = resp.getResponseCode();
    if (code >= 300) Logger.log('OneSignal error ' + code + ': ' + resp.getContentText());
    return JSON.parse(resp.getContentText());
  } catch(e) {
    Logger.log('OneSignal call faalde: ' + e);
  }
}

// ════════════════════════════════════════════════════════════
//  WEBHOOK — wordt aangeroepen vanuit het dashboard
//  (omdat API-edits geen onEdit-trigger vuren in Apps Script)
// ════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('CD_WEBHOOK_SECRET');
    if (secret && data.secret !== secret) {
      return ContentService.createTextOutput(JSON.stringify({error:'forbidden'})).setMimeType(ContentService.MimeType.JSON);
    }
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
      const rij = cd_createTaskRow(categorie, code, naam, actiepunt, beh, deadline);
      // zelfde melding als bij een normale nieuwe taak
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
      return ContentService.createTextOutput(JSON.stringify({ ok: true, event: ev, rij: rij }))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (ev === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({pong: true})).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ok:true,event:ev})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Collectief Dashboard webhook. Use POST.').setMimeType(ContentService.MimeType.TEXT);
}

// ════════════════════════════════════════════════════════════
//  TAAK AANMAKEN via webhook (mail-intake motor)
//  Kolommen "Nog Te Doen" (1-geteld): A=code B=naam C=actiepunt
//  D=deadline E=behandelaar F=prioriteit. Data start op kop+2.
// ════════════════════════════════════════════════════════════
const CD_NTD_SECTIES = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

function cd_createTaskRow(categorie, code, naam, actiepunt, behandelaar, deadline) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NTD_SHEET); // 'Nog Te Doen'
  if (!sheet) throw new Error('Sheet "' + NTD_SHEET + '" niet gevonden');

  const sectie = (categorie || 'OPPAKKEN').toString().trim().toUpperCase();
  if (CD_NTD_SECTIES.indexOf(sectie) === -1) throw new Error('Onbekende categorie: ' + categorie);

  // 1) vind de sectie-kop in kolom A
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  let headerRow = -1;
  for (let i = 0; i < colA.length; i++) {
    if ((colA[i][0] || '').toString().trim().toUpperCase() === sectie) { headerRow = i + 1; break; }
  }
  if (headerRow === -1) throw new Error('Sectie-kop niet gevonden: ' + sectie);

  // 2) insert-positie: vanaf kop+2 tot eerste lege rij of volgende sectie-kop
  let insertRow = headerRow + 2;
  while (insertRow <= lastRow) {
    const v = (sheet.getRange(insertRow, 1).getValue() || '').toString().trim().toUpperCase();
    if (CD_NTD_SECTIES.indexOf(v) !== -1) break;          // volgende sectie
    if (sheet.getRange(insertRow, 1).getValue() === '') break; // lege rij
    insertRow++;
  }

  // 3) rij invoegen (erft opmaak/checkbox-validatie van de rij erboven)
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 5).setValues([[
    code || '', naam || '', actiepunt || '', deadline || '', behandelaar || ''
  ]]);
  return insertRow;
}

function test_createTask() {
  const rij = cd_createTaskRow('OPPAKKEN', 'TESTVVE', 'VvE Testlaan 1', 'TEST — taak via script', 'Cihad', '2026-06-12');
  Logger.log('Testtaak ingevoegd op rij ' + rij + ' (handmatig verwijderen na controle)');
}

// ════════════════════════════════════════════════════════════
//  TEST FUNCTIES
// ════════════════════════════════════════════════════════════
function cd_testPushToAll() {
  return cd_sendNotification({
    filters: [{ field: 'tag', key: 'n_newtask', relation: 'exists' }],
    title: '🧪 Test vanuit Apps Script',
    body: 'Als je dit ziet, dan werkt het einde-tot-einde!',
    dedupKey: 'test-' + Date.now()
  });
}

function cd_testPushToJer() {
  return cd_notifyByExternalId('Jer', 'n_newtask', '1', {
    title: '🧪 Test naar Jer',
    body: 'Alleen Jer ontvangt deze melding.',
    dedupKey: 'test-jer-' + Date.now()
  });
}
function setupWebhookSecret() {
  PropertiesService.getScriptProperties().setProperty('CD_WEBHOOK_SECRET', '8e0642cbd3f44f44a4711d1ec5bae0a78d17e902b29a0ef7');
}
