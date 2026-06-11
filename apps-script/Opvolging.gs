// ===== FASE 4 — OPVOLGING & HERHALING (dagelijkse motor ±06:30) =====
// Spec: docs/superpowers/specs/2026-06-11-fase4-opvolging-herhaling-design.md
// Kolommen 'Nog Te Doen' (1-geteld): L=12 Opvolgdatum, M=13 Herhaal-ID, N=14 Esc-stempel.
// Hergebruikt: cd_parseDate, cd_splitBehandelaar, cd_notifyByExternalId, cd_createTaskRow
// (Notifications.gs), cd_schrijfLogboek (Extra functies.gs), cd_safeRun/cd_lockedRun.

// LET OP — SYNC: gelijk houden aan STIL_ESCALATIE_REGELS in src/util.js
const CD_STIL_ESCALATIE_REGELS = {
  'OPPAKKEN':          { trap1:  7, trap2: 14 },
  'VERGADERVERZOEKEN': { trap1: 14, trap2: 21 },
  'OFFERTE-TRAJECTEN': { trap1: 21, trap2: 35 },
  'LOD':               { trap1: 30, trap2: 60 },
};
const HR_SHEET = 'Herhaalregels';
const CD_OPV_SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'];

function cd_opvolgingMotor() {
  cd_lockedRun('cd_opvolgingMotor', function () {
    cd_safeRun('cd_hr_zetTakenKlaar',       cd_hr_zetTakenKlaar);
    cd_safeRun('cd_hr_verwerkAfrondingen',  cd_hr_verwerkAfrondingen);
    cd_safeRun('cd_opvolgWakker',           cd_opvolgWakker);
    cd_safeRun('cd_escaleerStilleDossiers', cd_escaleerStilleDossiers);
  });
}

function cd_ddmmyyyy(d) {
  return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
}

// Checkbox-erfenis in kolommen L/M/N (rijen erven TRUE/FALSE-validatie) telt als leeg.
function cd_f4val(v) {
  if (v === true || v === false) return '';
  v = (v || '').toString().trim();
  return (v.toUpperCase() === 'FALSE' || v.toUpperCase() === 'TRUE') ? '' : v;
}

// LET OP — SYNC: zelfde logica als volgendeDeadline() in src/util.js (incl. maandgrens-clamp)
const CD_HERHAAL_MAANDEN = { maand: 1, kwartaal: 3, halfjaar: 6, jaar: 12 };
function cd_volgendeDeadlineStr(huidig, type, intervalMnd) {
  const d = new Date(huidig.getFullYear(), huidig.getMonth(), huidig.getDate());
  if (type === 'week') { d.setDate(d.getDate() + 7); }
  else {
    const mnd = (type === 'na-afronden') ? (parseInt(intervalMnd) || 0) : CD_HERHAAL_MAANDEN[type];
    if (!mnd) return '';
    const dag = d.getDate();
    d.setMonth(d.getMonth() + mnd);
    if (d.getDate() !== dag) d.setDate(0); // maandgrens: 31 jan +1m → 28/29 feb
  }
  return cd_ddmmyyyy(d);
}

// Laatste menselijke logboek-activiteit per taak (key: code|SECTIE). 'systeem' telt niet mee.
function cd_laatsteActiviteitMap() {
  const map = {};
  const sheet = SpreadsheetApp.getActive().getSheetByName('Logboek');
  if (!sheet) return map;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const gebruiker = (rows[i][7] || '').toString().trim().toLowerCase();
    if (gebruiker === 'systeem') continue;
    const ts = new Date(rows[i][0]);
    if (isNaN(ts)) continue;
    const key = (rows[i][1] || '').toString().trim() + '|' + (rows[i][2] || '').toString().trim().toUpperCase();
    if (!map[key] || ts > map[key]) map[key] = ts;
  }
  return map;
}

// ── 1. Herhaalregels: taken klaarzetten zodra (deadline − dagenVooraf) is bereikt ──
function cd_hr_zetTakenKlaar() {
  const ss = SpreadsheetApp.getActive();
  const hr = ss.getSheetByName(HR_SHEET);
  if (!hr) return;
  const rows = hr.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 1; i < rows.length; i++) {
    try {
      const id = (rows[i][0] || '').toString().trim();
      const status = (rows[i][10] || '').toString().trim().toUpperCase();
      if (!id || status !== 'ACTIEF') continue;
      const dl = cd_parseDate(rows[i][9]);            // J = VolgendeDeadline
      if (!dl) continue;                              // na-afronden zonder datum: wacht
      const dagenVooraf = parseInt(rows[i][8]) || 14; // I
      const zichtbaar = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate() - dagenVooraf);
      if (today.getTime() < zichtbaar.getTime()) continue;
      const sectie = (rows[i][2] || 'OPPAKKEN').toString().trim().toUpperCase();
      const code = (rows[i][3] || '').toString().trim();
      const naam = (rows[i][4] || '').toString().trim();
      const beh  = (rows[i][5] || '').toString().trim();
      const oms  = (rows[i][1] || '').toString().trim();
      const type = (rows[i][6] || '').toString().trim().toLowerCase();
      const dlStr = cd_ddmmyyyy(new Date(dl.getFullYear(), dl.getMonth(), dl.getDate()));
      cd_createTaskRow(sectie, code, naam, oms, beh, dlStr, id);
      const nieuwVolgende = (type === 'na-afronden') ? '' : cd_volgendeDeadlineStr(dl, type, rows[i][7]);
      hr.getRange(i + 1, 10).setValue(nieuwVolgende);                            // J doorschuiven
      hr.getRange(i + 1, 12).setValue(new Date().toISOString() + ' → ' + dlStr); // L = LaatstKlaargezet
      cd_schrijfLogboek(code, sectie, 'Terugkerende taak klaargezet', '', '', oms, 'systeem');
      cd_splitBehandelaar(beh).forEach(function (name) {
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          title: '🔁 Terugkerende taak klaargezet',
          body: code + (naam ? ' · ' + naam : '') + ' — ' + oms,
          url: APP_URL, dedupKey: 'hr-' + id + '-' + dlStr
        });
      });
    } catch (e) { Logger.log('cd_hr_zetTakenKlaar rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── 2. Afgeronde terugkerende taken: 'na afronden'-regels opnieuw inplannen ──
function cd_hr_verwerkAfrondingen() {
  const ss = SpreadsheetApp.getActive();
  const af = ss.getSheetByName('Afgerond');
  const hr = ss.getSheetByName(HR_SHEET);
  if (!af || !hr) return;
  const afData = af.getDataRange().getValues();
  const hrData = hr.getDataRange().getValues();
  for (let i = 0; i < afData.length; i++) {
    const herhaalId = cd_f4val(afData[i][11]);   // L in 'Afgerond'
    if (!herhaalId) continue;
    try {
      for (let j = 1; j < hrData.length; j++) {
        if ((hrData[j][0] || '').toString().trim() !== herhaalId) continue;
        const type = (hrData[j][6] || '').toString().trim().toLowerCase();
        const status = (hrData[j][10] || '').toString().trim().toUpperCase();
        if (type === 'na-afronden' && status === 'ACTIEF') {
          const afgerondOp = cd_parseDate(afData[i][8]) || new Date(); // I = afgerond op
          hr.getRange(j + 1, 10).setValue(cd_volgendeDeadlineStr(afgerondOp, 'na-afronden', hrData[j][7]));
        }
        break;
      }
    } catch (e) { Logger.log('cd_hr_verwerkAfrondingen rij ' + (i + 1) + ' fout: ' + e); }
    af.getRange(i + 1, 12).setValue(''); // markeer verwerkt — voorkomt dubbele verwerking
  }
}

// ── 3. Wakker geworden weggelegde taken: één push op de opvolgdag zelf ──
function cd_opvolgWakker() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let curSec = null;
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if (['VvE Code', 'VvE-Code'].indexOf((data[i][0] + '').trim()) !== -1) continue;
    try {
      const opvolg = cd_parseDate(data[i][11]);   // L = Opvolgdatum
      if (!opvolg) continue;
      const d = new Date(opvolg.getFullYear(), opvolg.getMonth(), opvolg.getDate());
      if (d.getTime() !== today.getTime()) continue; // alleen de dag zelf; digest dekt de rest
      const code = (data[i][0] || '').toString().trim();
      const naam = (data[i][1] || '').toString().trim();
      const beh  = (data[i][4] || '').toString().trim(); // E = behandelaar
      cd_splitBehandelaar(beh).forEach(function (name) {
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          title: '🔔 Opvolgen vandaag',
          body: code + (naam ? ' · ' + naam : ''),
          url: APP_URL, dedupKey: 'opvolg-' + code + '-' + cd_ddmmyyyy(today)
        });
      });
    } catch (e) { Logger.log('cd_opvolgWakker rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── 4. Stille dossiers: twee-traps escalatie met stempel in kolom N ──
// Scope = zelfde als de 'Stil'-pil: in behandeling; OFFERTE-TRAJECTEN (geen
// in-behandeling-veld) telt als geheel mee. Weggelegde taken slaan we over.
function cd_escaleerStilleDossiers() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(NTD_SHEET);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stilMap = cd_laatsteActiviteitMap();
  let curSec = null;
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) !== -1) { curSec = first; continue; }
    if (!curSec || !data[i][0]) continue;
    if (['VvE Code', 'VvE-Code'].indexOf((data[i][0] + '').trim()) !== -1) continue;
    try {
      const regels = CD_STIL_ESCALATIE_REGELS[curSec];
      if (!regels) continue;
      const code = (data[i][0] || '').toString().trim();
      const naam = (data[i][1] || '').toString().trim();
      const beh  = (data[i][4] || '').toString().trim();
      const ib   = ((data[i][7] || '') + '').toString().toUpperCase() === 'TRUE';
      if (!ib && curSec !== 'OFFERTE-TRAJECTEN') continue;
      const opvolg = cd_parseDate(data[i][11]);
      if (opvolg && opvolg.getTime() > today.getTime()) continue; // weggelegd = bewust geparkeerd
      const laatst = stilMap[code + '|' + curSec];
      if (!laatst) continue; // geen activiteit-data → niet escaleren (zelfde keuze als bepaalStil)
      const dagen = Math.floor((today.getTime() - new Date(laatst.getFullYear(), laatst.getMonth(), laatst.getDate()).getTime()) / 86400000);
      const esc = cd_f4val(data[i][13]);            // N = Esc-stempel
      const cel = sheet.getRange(i + 1, 14);
      if (dagen < regels.trap1) { if (esc) cel.setValue(''); continue; } // activiteit hervat → reset
      if (dagen >= regels.trap2 && esc.indexOf('T2') === -1) {
        cel.setValue((esc ? esc + '|' : '') + 'T2:' + cd_ddmmyyyy(today));
        cd_notifyByExternalId('Jer', 'n_assigned', '1', {
          title: '⚠️ Stil dossier — escalatie',
          body: code + (naam ? ' · ' + naam : '') + ' — ' + dagen + ' dagen geen activiteit (' + (beh || 'geen behandelaar') + ')',
          url: APP_URL, dedupKey: 'esc2-' + code + '-' + cd_ddmmyyyy(today)
        });
      } else if (dagen >= regels.trap1 && esc.indexOf('T1') === -1) {
        cel.setValue('T1:' + cd_ddmmyyyy(today));
        cd_splitBehandelaar(beh).forEach(function (name) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            title: '🔕 Stil dossier — ' + dagen + ' dagen geen activiteit',
            body: code + (naam ? ' · ' + naam : ''),
            url: APP_URL, dedupKey: 'esc1-' + code + '-' + cd_ddmmyyyy(today)
          });
        });
      }
    } catch (e) { Logger.log('cd_escaleerStilleDossiers rij ' + (i + 1) + ' fout: ' + e); }
  }
}

// ── Setup (1× per omgeving draaien): tab + kolomkoppen ──
function cd_setupFase4() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hr = ss.getSheetByName(HR_SHEET);
  if (!hr) {
    hr = ss.insertSheet(HR_SHEET);
    hr.appendRow(['ID','Omschrijving','Sectie','VvE-code','VvE','Behandelaar','Type','IntervalMnd','DagenVooraf','VolgendeDeadline','Status','LaatstKlaargezet']);
    hr.setFrozenRows(1);
  }
  const ntd = ss.getSheetByName(NTD_SHEET);
  const data = ntd.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (CD_OPV_SKEYS.indexOf(first) === -1) continue;
    // kopregel kan 1-3 rijen onder de sectie-kop liggen (soms zit er een verdwaalde rij tussen geplakt)
    for (let j = i + 1; j <= Math.min(i + 3, data.length - 1); j++) {
      const v = (data[j][0] || '').toString().trim();
      if (v === 'VvE Code' || v === 'VvE-Code') {
        ntd.getRange(j + 1, 12, 1, 3).setValues([['Opvolgdatum', 'HerhaalID', 'Esc']]);
        break;
      }
    }
  }
  Logger.log('✓ Fase 4-setup klaar: tab "' + HR_SHEET + '" + kolomkoppen L/M/N.');
}

function cd_installeerOpvolgingTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'cd_opvolgingMotor'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cd_opvolgingMotor').timeBased().atHour(6).nearMinute(30).everyDays(1).create();
  Logger.log('✓ Dagelijkse opvolging-motor (±06:30) ingesteld.');
}

// Handmatige test vanuit de editor: draait de motor direct.
function cd_testMotor() { cd_opvolgingMotor(); }
