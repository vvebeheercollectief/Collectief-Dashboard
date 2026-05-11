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
 *   2. Run: setupTriggers()  (van de menubalk)                 *
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
function setupTriggers() {
  // Verwijder bestaande triggers (idempotent)
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Bij elke wijziging in de spreadsheet
  ScriptApp.newTrigger('onEditChange').forSpreadsheet(ss).onEdit().create();

  // Elk uur: deadline-checks
  ScriptApp.newTrigger('checkDeadlines').timeBased().everyHours(1).create();

  // Dagelijks om 08:30: samenvattingen
  ScriptApp.newTrigger('dailySummary').timeBased().atHour(8).nearMinute(30).everyDays(1).create();

  SpreadsheetApp.getUi().alert('✓ Triggers ingesteld!\n\n• onEdit (nieuwe taken / wijzigingen)\n• Elk uur (deadline-checks)\n• Dagelijks 08:30 (samenvatting)');
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 1: onEdit — nieuwe taak / toewijzing / ALV update
// ════════════════════════════════════════════════════════════
function onEditChange(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const row = e.range.getRow();

  try {
    if (name === NTD_SHEET) {
      handleNtdEdit(sheet, row, e);
    } else if (name === ALVO_SHEET) {
      handleAlvoEdit(sheet, row, e);
    }
  } catch (err) {
    Logger.log('onEditChange error: ' + err);
  }
}

function handleNtdEdit(sheet, row, e) {
  // Vind de huidige sectie (OPPAKKEN/VERGADERVERZOEKEN/etc.) door omhoog te zoeken
  const sec = findSection(sheet, row);
  if (!sec) return;

  const rowData = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const code = (rowData[0] || '').toString().trim();
  const naam = (rowData[1] || '').toString().trim();
  if (!code) return;

  // Vind de "behandelaar" kolom — verschilt per sectie
  const behandelaarColMap = {
    'OPPAKKEN': 5,            // E
    'VERGADERVERZOEKEN': 5,
    'OFFERTE-TRAJECTEN': 5,
    'LOD': 5,
  };
  const beh = (rowData[behandelaarColMap[sec] - 1] || '').toString().trim();

  // Onderscheid: nieuwe taak (oldValue leeg, hele rij ingevuld) vs wijziging op behandelaar-kolom
  const isNew = !e.oldValue && code; // ruwe detectie
  const colChanged = e.range.getColumn();

  if (isNew && colChanged === 1) {
    // Heel nieuwe taak (eerste kolom ingevuld)
    notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + sec.toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL
    });
    if (beh) {
      // Ook gericht naar de behandelaar(s)
      splitBehandelaar(beh).forEach(name => {
        notifyByExternalId(name, 'n_assigned', '1', {
          title: '➕ Toegewezen aan jou',
          body: code + (naam ? ' · ' + naam : ''),
          url: APP_URL
        });
      });
    }
  } else if (colChanged === behandelaarColMap[sec] && beh && e.oldValue !== beh) {
    // Behandelaar veranderd → notify nieuwe behandelaar(s)
    splitBehandelaar(beh).forEach(name => {
      notifyByExternalId(name, 'n_assigned', '1', {
        title: '➕ Toegewezen aan jou',
        body: code + (naam ? ' · ' + naam : ''),
        url: APP_URL
      });
    });
  }
}

function handleAlvoEdit(sheet, row, e) {
  if (row < 3) return;
  const rowData = sheet.getRange(row, 1, 1, 6).getValues()[0];
  const code = (rowData[0] || '').toString().trim();
  const naam = (rowData[1] || '').toString().trim();
  if (!code) return;

  const col = e.range.getColumn();
  const newVal = (e.value || '').toString().toUpperCase();
  const oldVal = (e.oldValue || '').toString().toUpperCase();
  if (newVal === oldVal) return;

  // Kolom C=Uitnodiging, D=Notulen, E=Begroting
  let label = null;
  if (col === 3 && newVal === 'TRUE') label = '📬 Uitnodiging verstuurd';
  else if (col === 4 && newVal === 'TRUE') label = '✅ Notulen verstuurd';
  else if (col === 5 && newVal === 'TRUE') label = '💰 Begroting doorgezet';
  if (!label) return;

  notifyByTag('n_alv', '1', {
    title: label,
    body: code + (naam ? ' · ' + naam : ''),
    url: APP_URL
  });
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 2: hourly deadline check
// ════════════════════════════════════════════════════════════
function checkDeadlines() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  let curSec = null;
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

  // Kolomindex voor deadline per sectie (0-indexed in de rijdata)
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

    const dl = parseDate(dlVal);
    if (!dl) continue;

    const hoursUntil = (dl.getTime() - now.getTime()) / 3600000;
    if (hoursUntil < 0) continue; // al verlopen
    if (hoursUntil > 72) continue; // verder dan 2 dagen, niet relevant

    // Targets per uur-voorkeur (filter via OneSignal tags)
    [1, 4, 8, 24, 48].forEach(h => {
      if (Math.abs(hoursUntil - h) <= DEADLINE_TOLERANCE_HOURS) {
        const body = code + (naam ? ' · ' + naam : '') + ' — over ' + Math.round(hoursUntil) + ' uur';
        // Stuur naar iedereen met deadline_h = h EN n_deadline = 1 EN behandelaar matched
        if (beh) {
          splitBehandelaar(beh).forEach(name => {
            sendNotification({
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
function dailySummary() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let curSec = null;
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  const BEH_COL = { 'OPPAKKEN': 4, 'VERGADERVERZOEKEN': 4, 'OFFERTE-TRAJECTEN': 4, 'LOD': 4 };

  const perPerson = {}; // { 'Jer': { OPPAKKEN: 3, LOD: 1, ... } }
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

    const beh = (data[i][BEH_COL[curSec]] || '').toString().trim();
    if (!beh) continue;
    splitBehandelaar(beh).forEach(name => {
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

    notifyByExternalId(name, 'n_daily', '1', {
      title: '☀️ Goedemorgen — ' + total + ' open ' + (total===1?'taak':'taken'),
      body: parts.join(' · '),
      url: APP_URL
    });
  });
}

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════
function findSection(sheet, row) {
  const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
  const colA = sheet.getRange(1, 1, row, 1).getValues();
  for (let i = row - 1; i >= 0; i--) {
    const v = (colA[i][0] || '').toString().trim().toUpperCase();
    if (SKEYS.indexOf(v) !== -1) return v;
  }
  return null;
}

function splitBehandelaar(s) {
  return (s || '').split(/[,\/]/).map(p => p.trim()).filter(Boolean);
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = v.toString().trim();
  // dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// ════════════════════════════════════════════════════════════
//  ONESIGNAL API
// ════════════════════════════════════════════════════════════
function getApiKey() {
  const k = PropertiesService.getScriptProperties().getProperty('ONESIGNAL_REST_API_KEY');
  if (!k) throw new Error('ONESIGNAL_REST_API_KEY ontbreekt in Script Properties.');
  return k;
}

function notifyByTag(tagKey, tagValue, opts) {
  return sendNotification({
    filters: [{ field: 'tag', key: tagKey, relation: '=', value: tagValue }],
    title: opts.title, body: opts.body, url: opts.url, dedupKey: opts.dedupKey
  });
}

function notifyByExternalId(extId, tagKey, tagValue, opts) {
  // External ID + tag-filter: stuur naar Jer EN met deze voorkeur aan
  return sendNotification({
    filters: [
      { field: 'tag', key: 'behandelaar', relation: '=', value: extId },
      { operator: 'AND' },
      { field: 'tag', key: tagKey, relation: '=', value: tagValue }
    ],
    title: opts.title, body: opts.body, url: opts.url, dedupKey: opts.dedupKey
  });
}

function sendNotification(p) {
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
      headers: { 'Authorization': 'Key ' + getApiKey() },
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
//  TEST FUNCTIES — kun je los runnen vanuit Apps Script editor
// ════════════════════════════════════════════════════════════
function testPushToAll() {
  return sendNotification({
    filters: [{ field: 'tag', key: 'n_newtask', relation: 'exists' }],
    title: '🧪 Test vanuit Apps Script',
    body: 'Als je dit ziet, dan werkt het einde-tot-einde!',
    dedupKey: 'test-' + Date.now()
  });
}

function testPushToJer() {
  return notifyByExternalId('Jer', 'n_newtask', '1', {
    title: '🧪 Test naar Jer',
    body: 'Alleen Jer ontvangt deze melding.',
    dedupKey: 'test-jer-' + Date.now()
  });
}
