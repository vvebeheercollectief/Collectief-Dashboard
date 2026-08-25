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
  'SUBSIDIE-TRAJECTEN': { trap1: 21, trap2: 42 },
};
const HR_SHEET = 'Herhaalregels';
const CD_OPV_SKEYS = ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN'];

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
//
// LET OP — SYNC met `bouwStilIndex`/`bepaalStil` in src/render-tabel.js. Die twee beantwoorden
// dezelfde vraag ('wanneer is er voor het laatst iets aan deze taak gedaan?') en moeten hetzelfde
// antwoord geven, anders escaleert de backend over een taak waar het scherm geen enkel signaal bij
// toont. Dat liep op twee punten uiteen en is hier gelijkgetrokken:
//
//  1. EEN LOGREGEL ZONDER SECTIE telt voor ÉLKE sectie van die VvE. `addContactLog` (het
//     contactmoment op de VvE-dossierpagina) schrijft kolom C leeg — dat is juist het bewijs dát
//     er iets gebeurd is. Met een sleutel 'code|SECTIE' matchte zo'n regel nooit: je belde 's
//     ochtends met het bestuur, het scherm haalde het stil-signaal meteen weg, en de volgende
//     ochtend ging er alsnog een TEAMBREDE escalatiemelding uit over diezelfde taak.
//     Daarom een tweede kaart op alleen de code; `cd_laatsteActiviteit` neemt de nieuwste van de
//     twee.
//  2. 'Bewerkt'-regels tellen niet mee, net als in de frontend (LOG_VERBORGEN in
//     src/render-overig.js). Ze worden sinds v6.3 niet meer geschreven, maar oude staan er nog.
// Welke acties tellen als 'werk aan een taak' wanneer de logregel GEEN sectie draagt.
// LET OP — SYNC met SECTIELOOS_TELT in src/render-tabel.js.
var CD_SECTIELOOS_TELT = ['Contact', 'Opmerking'];

// Het aantal KALENDERDAGEN tussen twee momenten. LET OP — SYNC met _verschilInKalenderdagen in
// src/util.js: die rondt AF (Math.round) op twee kale datums, terwijl hier eerder Math.floor op
// een tijdverschil stond. Dat scheelt precies één dag zodra er een zomertijdgrens tussen zit, en
// dan zegt het scherm 'stil 7 dagen' terwijl de motor er 6 telt (of andersom) — met een mail die
// een dag te vroeg of te laat komt.
function cd_dagenSinds(laatst, today) {
  var a = new Date(laatst.getFullYear(), laatst.getMonth(), laatst.getDate());
  var b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function cd_laatsteActiviteitMap() {
  const map = { _perSectie: {}, _perCode: {} };
  const sheet = SpreadsheetApp.getActive().getSheetByName('Logboek');
  if (!sheet) return map;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const gebruiker = (rows[i][7] || '').toString().trim().toLowerCase();
    if (gebruiker === 'systeem') continue;
    const actie = (rows[i][3] || '').toString().trim();
    if (actie === 'Bewerkt') continue;
    const ts = new Date(rows[i][0]);
    if (isNaN(ts)) continue;
    const code = (rows[i][1] || '').toString().trim();
    if (!code) continue;
    const sectie = (rows[i][2] || '').toString().trim().toUpperCase();
    if (sectie) {
      const key = code + '|' + sectie;
      if (!map._perSectie[key] || ts > map._perSectie[key]) map._perSectie[key] = ts;
    } else if (CD_SECTIELOOS_TELT.indexOf(actie) !== -1) {
      // Alleen regels die aantoonbaar over WERK aan een taak gaan. Een sectieloze regel telt voor
      // élke taak van die VvE, dus dit vangnet moet smal zijn: een kenmerkwijziging op de
      // dossierpagina ('Kenmerk', kolom C leeg) zou anders in z'n eentje de escalatie stilzetten
      // voor alle lopende trajecten van die VvE — inclusief het wissen van een al gezet
      // escalatiestempel. Contact en Opmerking zijn wél bewijs dat er iets gedaan is.
      // LET OP — SYNC met SECTIELOOS_TELT in src/render-tabel.js.
      if (!map._perCode[code] || ts > map._perCode[code]) map._perCode[code] = ts;
    }
  }
  return map;
}

// De laatste activiteit voor één taak: de nieuwste van 'regel mét deze sectie' en 'regel zonder
// sectie bij deze VvE'. Eén ingang, zodat de escalatie en de dagbriefing niet uiteen kunnen lopen.
function cd_laatsteActiviteit(map, code, sectie) {
  const a = map && map._perSectie ? map._perSectie[code + '|' + sectie] : null;
  const b = map && map._perCode ? map._perCode[code] : null;
  if (a && b) return a > b ? a : b;
  return a || b || null;
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
        // `type` los van de TAG. De tag bepaalt WIE de push krijgt (dat blijft de bestaande
        // schakelaar), het type bepaalt hoe de regel in het tabblad 'Meldingen' terechtkomt — en
        // dáár filtert de in-app lijst op (TYPE_NAAR_PREFS in src/notifications.js). Met het kale
        // 'n_assigned' verdween deze melding óók uit de lijst zodra iemand 'Taak aan mij
        // toegewezen' uitzette, terwijl het over iets heel anders gaat. Een onbekend type wordt
        // door die filter niet weggegooid, dus in-app komt hij nu altijd aan.
        cd_notifyByExternalId(name, 'n_assigned', '1', {
          type: 'n_herhaal',
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
    // VERS CONTROLEREN VÓÓR het herplannen, niet erna. `afData` is één momentopname van vóór de
    // lus, en het dashboard schrijft buiten deze lock om in 'Afgerond' (een undo van een afronding
    // verwijdert daar een rij). Stond de controle pas ná het try-blok, dan was de volgende deadline
    // van de herhaalregel al herplant op de afrond-datum van een ándere rij — precies de fout die
    // niet meer te zien is. Op het taaknummer (kolom Q) én de afrond-datum (kolom I): het
    // Herhaal-ID zelf is geen identiteit, dat delen alle afrondingen van dezelfde regel.
    const versRij = af.getRange(i + 1, 1, 1, 17).getValues()[0];
    if (cd_f4val(versRij[11]) !== herhaalId
        || (versRij[16] || '').toString().trim() !== (afData[i][16] || '').toString().trim()
        || (versRij[8] || '').toString().trim() !== (afData[i][8] || '').toString().trim()) {
      Logger.log('cd_hr_verwerkAfrondingen: rij ' + (i + 1) + ' is verschoven — overgeslagen');
      continue;
    }
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
          type: 'n_opvolg',      // eigen type — zie de toelichting bij 'n_herhaal' hierboven
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
      const laatst = cd_laatsteActiviteit(stilMap, code, curSec);
      if (!laatst) continue; // geen activiteit-data → niet escaleren (zelfde keuze als bepaalStil)
      const dagen = cd_dagenSinds(laatst, today);
      const esc = cd_f4val(data[i][13]);            // N = Esc-stempel
      // Zelfde verse controle als bij cd_hr_verwerkAfrondingen: `data` is een momentopname van
      // vóór de lus en er zitten pushmeldingen (0,5-2 s per stuk) tussen. Staat er op rij i+1
      // inmiddels een andere taak, dan zou het escalatiestempel in kolom N bij de verkeerde taak
      // landen — en die taak slaat dan de rest van zijn escalaties over.
      // Op IDENTITEIT en niet alleen op de VvE-code: één VvE heeft vaak meerdere taken in dezelfde
      // sectie (daar bestaat het vaste taaknummer in kolom Q juist voor), en dan laat een
      // vergelijking op kolom A een verschoven buurrij gewoon door.
      const vers = sheet.getRange(i + 1, 1, 1, 17).getValues()[0];
      const versNr = (vers[16] || '').toString().trim();
      const oudNr = (data[i][16] || '').toString().trim();
      if ((vers[0] || '').toString().trim() !== code || versNr !== oudNr) {
        Logger.log('cd_escaleerStilleDossiers: rij ' + (i + 1) + ' is verschoven — overgeslagen');
        continue;
      }
      const cel = sheet.getRange(i + 1, 14);
      if (dagen < regels.trap1) { if (esc) cel.setValue(''); continue; } // activiteit hervat → reset
      if (dagen >= regels.trap2 && esc.indexOf('T2') === -1) {
        cel.setValue((esc ? esc + '|' : '') + 'T2:' + cd_ddmmyyyy(today));
        // Trap-2 = teambrede escalatie: behandelaar én alle collega's via de
        // team-tag n_newtask (zelfde audience als een nieuwe taak).
        cd_notifyByTag('n_newtask', '1', {
          type: 'n_escalatie',   // eigen type: de ZWAARSTE melding die het systeem kent mag niet
                                 // meeliften op de schakelaar 'Nieuwe taak toegevoegd'
          title: '⚠️ Stil dossier — escalatie',
          body: code + (naam ? ' · ' + naam : '') + ' — ' + dagen + ' dagen geen activiteit (' + (beh || 'geen behandelaar') + ')',
          url: APP_URL, dedupKey: 'esc2-' + code + '-' + cd_ddmmyyyy(today)
        });
      } else if (dagen >= regels.trap1 && esc.indexOf('T1') === -1) {
        cel.setValue('T1:' + cd_ddmmyyyy(today));
        cd_splitBehandelaar(beh).forEach(function (name) {
          cd_notifyByExternalId(name, 'n_assigned', '1', {
            type: 'n_escalatie',
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

// Handmatige tests vanuit de editor: draait de motor / digest direct.
function cd_testMotor() { cd_opvolgingMotor(); }
function cd_testDigest() { cd_dailySummary(); }
