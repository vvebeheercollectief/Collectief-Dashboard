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

// App-id komt uit Script Properties (prod-project: prod-app, test-project: test-app).
// Fallback = prod-app-id, zodat productie blijft werken zonder extra property.
function cd_oneSignalAppId(){
  return PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_ID')
      || 'c0e1301b-2cee-4646-8fab-99698e10e78c';
}
const NTD_SHEET   = 'Nog Te Doen';
const ALVO_SHEET  = "ALV's overzicht";
const NOTIF_QUEUE_SHEET = 'Notif-wachtrij';
const NOTIF_QUEUE_MAX = 200; // verwerkte rijen die we bewaren

const APP_URL = 'https://vvebeheercollectief.github.io/Collectief-Dashboard/';
const ICON_URL = APP_URL + 'icon-192.png';

// Hoeveel uur tolerantie bij deadline-check (script draait elk uur)
const DEADLINE_TOLERANCE_HOURS = 1;

// ════════════════════════════════════════════════════════════
//  CONCURRENCY + FOUTAFHANDELING HELPERS
// ════════════════════════════════════════════════════════════
// Serialiseert Apps Script-mutaties (webhook / onEdit / triggers) zodat gelijktijdige
// uitvoeringen elkaars rij-invoegingen niet verstoren. LET OP: lockt alléén Apps Script
// onderling — niet tegen directe Sheets-API-schrijfacties vanuit het dashboard.
// Vangt fouten NIET op (laat ze door, bv. voor doPost die {error} moet teruggeven).
function cd_withLock(fn) {
  const lock = LockService.getDocumentLock();
  try {
    if (!lock.tryLock(10000)) { Logger.log('cd_withLock: lock niet verkregen — overgeslagen'); return; }
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
// Lock + foutopvang: voor mutaties waarbij een fout niet de uitvoering mag laten klappen.
function cd_lockedRun(label, fn) {
  const lock = LockService.getDocumentLock();
  try {
    if (!lock.tryLock(10000)) { Logger.log(label + ': lock niet verkregen — overgeslagen'); return; }
    return fn();
  } catch (e) {
    Logger.log(label + ' fout: ' + e);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
// Alleen foutopvang: voor read-only triggers, zodat één foute rij niet de hele run sloopt.
function cd_safeRun(label, fn) {
  try { return fn(); } catch (e) { Logger.log(label + ' fout: ' + e); }
}

// ════════════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════════════
const CD_TRIGGER_FUNCS = ['cd_onEditChange', 'cd_checkDeadlines', 'cd_dailySummary', 'cd_onNotifQueueChange', 'cd_sweepNotifQueue'];

function setupNotificationTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => CD_TRIGGER_FUNCS.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.newTrigger('cd_onEditChange').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('cd_checkDeadlines').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('cd_dailySummary').timeBased().atHour(8).nearMinute(30).everyDays(1).create();
  ScriptApp.newTrigger('cd_onNotifQueueChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('cd_sweepNotifQueue').timeBased().everyMinutes(5).create();

  SpreadsheetApp.getUi().alert('✓ Notificatie-triggers ingesteld!\n\n• cd_onEditChange (nieuwe taken / wijzigingen)\n• cd_checkDeadlines (elk uur)\n• cd_dailySummary (dagelijks 08:30)\n• cd_onNotifQueueChange (Notif-wachtrij, direct)\n• cd_sweepNotifQueue (Notif-wachtrij, elke 5 min)\n\nJe bestaande triggers zijn ongemoeid gebleven.');
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
  // e.value bestaat alléén bij een single-cell edit. Bij plakken/fill is e.value undefined;
  // val dan terug op de werkelijke celwaarde uit rowData zodat de ALV-melding tóch afgaat.
  const newVal = (e.value !== undefined ? e.value : rowData[col - 1]).toString().toUpperCase();
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
  cd_safeRun('cd_checkDeadlines', () => {
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
      if (!curSec || !data[i][0]) continue;
      if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

      try {
        const code = (data[i][0] || '').toString().trim();
        const naam = (data[i][1] || '').toString().trim();
        const beh  = (data[i][BEH_COL[curSec]] || '').toString().trim();
        const dlVal = data[i][DEADLINE_COL[curSec]];
        if (!code || !dlVal) continue;

        const dl = cd_parseDate(dlVal);
        if (!dl) continue;

        const hoursUntil = (dl.getTime() - now.getTime()) / 3600000;
        if (hoursUntil < 0 || hoursUntil > 72) continue;

        [1, 4, 8, 24, 48].forEach(h => {
          if (Math.abs(hoursUntil - h) <= DEADLINE_TOLERANCE_HOURS && beh) {
            const body = code + (naam ? ' · ' + naam : '') + ' — over ' + Math.round(hoursUntil) + ' uur';
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
        });
      } catch (rowErr) { Logger.log('cd_checkDeadlines rij ' + (i + 1) + ' fout: ' + rowErr); }
    }
  });
}

// ════════════════════════════════════════════════════════════
//  TRIGGER 3: daily summary om 08:30
// ════════════════════════════════════════════════════════════
function cd_dailySummary() {
  cd_safeRun('cd_dailySummary', () => {
    const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    let curSec = null;
    const SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];
    const BEH_COL = { 'OPPAKKEN': 4, 'VERGADERVERZOEKEN': 4, 'OFFERTE-TRAJECTEN': 4, 'LOD': 4 };
    const DEADLINE_COL = { 'OPPAKKEN': 3, 'VERGADERVERZOEKEN': 5, 'OFFERTE-TRAJECTEN': 5, 'LOD': 5 };
    const today = new Date(); today.setHours(0,0,0,0);
    const stilMap = cd_laatsteActiviteitMap(); // Opvolging.gs (Fase 4)

    const perPerson = {};
    for (let i = 0; i < data.length; i++) {
      const first = (data[i][0] || '').toString().trim().toUpperCase();
      if (SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
      if (!curSec || !data[i][0]) continue;
      if ((data[i][0] + '').trim() === 'VvE Code' || (data[i][0] + '').trim() === 'VvE-Code') continue;

      const code = (data[i][0] || '').toString().trim();
      const beh = (data[i][BEH_COL[curSec]] || '').toString().trim();
      if (!beh) continue;
      const opvolg = cd_parseDate(data[i][11]);   // L = Opvolgdatum (Fase 4)
      const weggelegd = !!(opvolg && opvolg.getTime() > today.getTime());
      const dl = cd_parseDate(data[i][DEADLINE_COL[curSec]]);
      const ib = ((data[i][7] || '') + '').toString().toUpperCase() === 'TRUE';
      const sec = curSec;
      cd_splitBehandelaar(beh).forEach(name => {
        if (!perPerson[name]) perPerson[name] = { secs:{}, telaat:0, opvolgen:0, stil:0 };
        const p = perPerson[name];
        p.secs[sec] = (p.secs[sec] || 0) + 1;
        if (!weggelegd && dl && dl.getTime() < today.getTime()) p.telaat++;
        if (opvolg && opvolg.getTime() <= today.getTime()) p.opvolgen++;
        const regels = CD_STIL_ESCALATIE_REGELS[sec];
        if (!weggelegd && regels && (ib || sec === 'OFFERTE-TRAJECTEN')) {
          const laatst = stilMap[code + '|' + sec];
          if (laatst) {
            const dagen = Math.floor((today.getTime() - new Date(laatst.getFullYear(), laatst.getMonth(), laatst.getDate()).getTime()) / 86400000);
            if (dagen >= regels.trap1) p.stil++;
          }
        }
      });
    }

    Object.keys(perPerson).forEach(name => {
      try {
        const p = perPerson[name];
        const total = Object.values(p.secs).reduce((a,b) => a+b, 0);
        const parts = [];
        if (p.telaat)   parts.push('⚠ ' + p.telaat + ' te laat');
        if (p.opvolgen) parts.push('🔔 ' + p.opvolgen + ' opvolgen');
        if (p.stil)     parts.push('🔕 ' + p.stil + ' stil');
        if (p.secs['OPPAKKEN']) parts.push(p.secs['OPPAKKEN'] + ' oppakken');
        if (p.secs['VERGADERVERZOEKEN']) parts.push(p.secs['VERGADERVERZOEKEN'] + ' vergaderverzoek' + (p.secs['VERGADERVERZOEKEN']>1?'en':''));
        if (p.secs['OFFERTE-TRAJECTEN']) parts.push(p.secs['OFFERTE-TRAJECTEN'] + ' offerte-traject' + (p.secs['OFFERTE-TRAJECTEN']>1?'en':''));
        if (p.secs['LOD']) parts.push(p.secs['LOD'] + ' LOD');

        cd_notifyByExternalId(name, 'n_daily', '1', {
          title: '☀️ Goedemorgen — ' + total + ' open ' + (total===1?'taak':'taken'),
          body: parts.join(' · '),
          url: APP_URL
        });
      } catch (e) { Logger.log('cd_dailySummary persoon ' + name + ' fout: ' + e); }
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

// Maandnamen-tabel — gelijk aan _MAANDEN in src/util.js. Google Sheets geeft
// datums vaak terug als Nederlandse long-date ("21 mei 2026"); zonder dit werd
// zo'n deadline stil overgeslagen in cd_checkDeadlines / cd_dailySummary.
var CD_MAANDEN = { jan:1,feb:2,mrt:3,maa:3,apr:4,mei:5,jun:6,jul:7,aug:8,sep:9,sept:9,okt:10,nov:11,dec:12,
  januari:1,februari:2,maart:3,april:4,juni:6,juli:7,augustus:8,september:9,oktober:10,november:11,december:12 };

function cd_parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = v.toString().trim();
  // dd-mm-yyyy / dd/mm/yyyy
  let m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  // "21 mei 2026" / "3 jan. 2025" / "21 mei '26"
  m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?\s+'?(\d{2,4})$/);
  if (m) { const mn = CD_MAANDEN[m[2].toLowerCase()]; if (mn) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, mn - 1, +m[1]); } }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Handmatig draaibaar in de editor: controleert de maandnaam-parsing.
function test_cd_parseDate() {
  const cases = [
    ['21 mei 2026',  2026, 4, 21],
    ['3 jan. 2025',  2025, 0, 3],
    ['1 december 2026', 2026, 11, 1],
    ['01-06-2026',   2026, 5, 1],
    ['2026-06-21',   2026, 5, 21],
  ];
  cases.forEach(function (t) {
    const d = cd_parseDate(t[0]);
    const ok = d && d.getFullYear() === t[1] && d.getMonth() === t[2] && d.getDate() === t[3];
    Logger.log((ok ? 'OK   ' : 'FAIL ') + t[0] + ' → ' + (d ? d.toDateString() : 'null'));
  });
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
    app_id: cd_oneSignalAppId(),
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
//  MELDINGEN — kernlogica, hergebruikt door de webhook (doPost)
//  én door de Notif-wachtrij-wachter (cd_drainNotifQueue).
//  Retourneert een resultaat-object (doPost serialiseert het).
// ════════════════════════════════════════════════════════════
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
  // Stabiele dedup-sleutel: de wachtrij-wachter zet data._uid op de rij-timestamp. Daardoor
  // krijgt dezélfde wachtrij-rij bij herverwerking (onChange + 5-min sweep) hetzelfde
  // web_push_topic en collapset de dubbele push; verschillende rijen blijven los. Voorheen
  // maakte Date.now() élke verwerking uniek → dedup deed niets.
  const uid = (data._uid || Date.now());

  if (ev === 'newtask') {
    cd_notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + sec.toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL, dedupKey: 'new-' + code + '-' + uid
    });
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        if (name && name !== actor) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '➕ Toegewezen aan jou',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'assign-' + code + '-' + name + '-' + uid
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
            url: APP_URL, dedupKey: 'reassign-' + code + '-' + name + '-' + uid
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
      url: APP_URL, dedupKey: 'alv-' + code + '-' + uid
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
    // zelfde melding als bij een normale nieuwe taak
    cd_notifyByTag('n_newtask', '1', {
      title: '📋 Nieuwe taak — ' + (categorie || '').toLowerCase(),
      body: code + (naam ? ' · ' + naam : '') + (beh ? ' → ' + beh : ''),
      url: APP_URL, dedupKey: 'mailnew-' + code + '-' + uid
    });
    if (beh) {
      cd_splitBehandelaar(beh).forEach(name => {
        if (name && name !== actor) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '➕ Toegewezen aan jou',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'mailassign-' + code + '-' + name + '-' + uid
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

// ════════════════════════════════════════════════════════════
//  WEBHOOK — server-to-server endpoint (mail-intake).
//  De frontend gaat via de Notif-wachtrij i.p.v. dit endpoint.
// ════════════════════════════════════════════════════════════
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

function doGet(e) {
  return ContentService.createTextOutput('Collectief Dashboard webhook. Use POST.').setMimeType(ContentService.MimeType.TEXT);
}

// ════════════════════════════════════════════════════════════
//  NOTIF-WACHTRIJ — de frontend enqueuet hier (via OAuth-append);
//  een onChange-trigger + 5-min veegbeurt sturen de push.
// ════════════════════════════════════════════════════════════
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

// onChange vuurt — anders dan onEdit — óók bij wijzigingen via de Sheets-API.
function cd_onNotifQueueChange(e) { cd_drainNotifQueue(); }

// Vangnet: pakt rijen op die een gemiste onChange anders zou laten liggen.
function cd_sweepNotifQueue() { cd_drainNotifQueue(); }

// Alleen push-only events mogen via de (semi-vertrouwde, OAuth-append) Notif-wachtrij. Privileged
// schrijf-events — create_task (maakt een echte taak aan) en logboek (schrijft logregels) — moeten
// uitsluitend via doPost mét geldig CD_WEBHOOK_SECRET. Voorheen verwerkte de wachtrij élk event
// blind: wie naar de Sheet kon schrijven kon zo de privileged backend aansturen (confused deputy).
const CD_QUEUE_ALLOWED = { newtask: 1, assigned: 1, alv_update: 1, test: 1, completed: 1, ping: 1 };

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
      if (!data || !CD_QUEUE_ALLOWED[data.event]) {
        sheet.getRange(i + 2, 4).setValue('GEWEIGERD: ' + (data && data.event)); // niet-toegestaan via wachtrij
        continue;
      }
      data._uid = rows[i][0]; // rij-timestamp → stabiele dedup-sleutel (zie cd_processNotifEvent)
      try {
        cd_processNotifEvent(data);
        sheet.getRange(i + 2, 4).setValue(new Date().toISOString());
      } catch (err) {
        sheet.getRange(i + 2, 4).setValue('FOUT: ' + err);
      }
    }
    const now = sheet.getLastRow();
    if (now > NOTIF_QUEUE_MAX + 1) sheet.deleteRows(2, now - NOTIF_QUEUE_MAX - 1);
  });
}

// ════════════════════════════════════════════════════════════
//  TAAK AANMAKEN via webhook (mail-intake motor)
//  Kolommen "Nog Te Doen" (1-geteld): A=code B=naam C=actiepunt
//  D=deadline E=behandelaar F=prioriteit. Data start op kop+2.
// ════════════════════════════════════════════════════════════
const CD_NTD_SECTIES = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

// Formule-injectie-rem: waarden uit een onvertrouwde bron (mail-intake) die met = + - @ (of een
// stuur-teken) beginnen, zou Sheets als formule uitvoeren. Een apostrof-prefix forceert platte tekst.
function cd_safeCell(s) {
  s = (s == null ? '' : s).toString();
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function cd_createTaskRow(categorie, code, naam, actiepunt, behandelaar, deadline, herhaalId) {
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
  //    Kolommen: A=code B=naam C=actiepunt E=behandelaar (alle secties).
  //    Deadline verschilt per sectie: OPPAKKEN→D(4), overige→F(6) — zie
  //    DEADLINE_COL in cd_checkDeadlines.
  sheet.insertRowBefore(insertRow);
  sheet.getRange(insertRow, 1, 1, 3).setValues([[cd_safeCell(code), cd_safeCell(naam), cd_safeCell(actiepunt)]]);
  sheet.getRange(insertRow, 5).setValue(cd_safeCell(behandelaar)); // E = behandelaar
  const deadlineCol = (sectie === 'OPPAKKEN') ? 4 : 6;      // D voor Oppakken, F voor rest
  if (deadline) sheet.getRange(insertRow, deadlineCol).setValue(cd_safeCell(deadline));
  if (herhaalId) sheet.getRange(insertRow, 13).setValue(herhaalId);  // M = Herhaal-ID (Fase 4)
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
  // VEILIGHEID: het ECHTE secret staat ALLEEN in de live Apps Script-editor en in de
  // Script Property CD_WEBHOOK_SECRET. Het mag NOOIT in dit (openbaar gevolgde) back-up-
  // bestand of in index.html staan. Hieronder staat bewust een PLAATSHOUDER.
  // Roteren = in de LIVE editor de echte waarde invullen en deze functie 1x draaien.
  // (Geroteerd 2026-06-08: het oude secret was gelekt via git-history + publieke index.html.)
  var nieuwSecret = 'ZET-DE-ECHTE-WAARDE-ALLEEN-IN-DE-LIVE-EDITOR';
  var oudGelekt   = '0038352e880dab9ee033277cbb19ef68f3ca5378077ee09d';

  // Vangnet: voorkomt dat deze plaatshouder per ongeluk als echt secret wordt ingesteld.
  if (nieuwSecret.indexOf('ZET-DE-ECHTE') === 0) {
    throw new Error('Vul eerst het echte secret in (in de LIVE editor), niet de plaatshouder uit de back-up.');
  }

  PropertiesService.getScriptProperties().setProperty('CD_WEBHOOK_SECRET', nieuwSecret);

  var opgeslagen = PropertiesService.getScriptProperties().getProperty('CD_WEBHOOK_SECRET');
  if (opgeslagen === nieuwSecret && nieuwSecret !== oudGelekt) {
    Logger.log('✅ Gelukt — het secret is geroteerd (' + opgeslagen.length + ' tekens).');
    Logger.log('   Het oude, gelekte wachtwoord werkt vanaf nu NIET meer.');
  } else {
    Logger.log('❌ Er ging iets mis — het secret is niet correct ingesteld.');
  }
}
