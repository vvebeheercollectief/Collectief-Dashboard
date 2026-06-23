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
