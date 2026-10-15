// ════════════════════════════════════════════════════════════
//  EXTRA FUNCTIES — Logboek + In-app meldingen
//  Voeg NIETS toe dat al in Notifications.gs staat!
// ════════════════════════════════════════════════════════════

const MELDING_SHEET = 'Meldingen';
const MELDING_MAX   = 200;

// ── In-app meldingen (schrijft naar 'Meldingen' sheet) ─────
function cd_schrijfMelding(type, titel, inhoud, voor) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(MELDING_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(MELDING_SHEET);
      sheet.appendRow(['Timestamp','Type','Titel','Inhoud','Voor']);
      sheet.setFrozenRows(1);
    }
    // cd_safeCell (uit Notifications.gs, zelfde project): prefix '=','+','-','@' met apostrof zodat
    // een via mail-intake aangeleverde tekst geen formule wordt als de Sheet in Excel/Sheets-desktop opent.
    sheet.appendRow([new Date().toISOString(), cd_safeCell(type || 'algemeen'), cd_safeCell(titel || ''), cd_safeCell(inhoud || ''), cd_safeCell(voor || 'allen')]);
    // Snoeien onder een SCRIPT-lock, en bewust niet onder de document-lock. Zonder lock berekenden
    // twee gelijktijdige runs allebei hetzelfde aantal te verwijderen rijen en verwijderden ze dat
    // allebei — samen twee keer zoveel, en de oudste meldingen zijn dan weg zonder spoor.
    // Waarom een script-lock: deze functie wordt óók aangeroepen vanuit code die de document-lock
    // al vasthoudt (cd_lockedRun). Die nog eens nemen zou tien seconden staan wachten op zichzelf.
    // Een script-lock is een ander slot en kan daar niet mee botsen; niets neemt hem in de andere
    // volgorde. Krijgen we hem niet binnen twee seconden, dan snoeit de volgende melding wel —
    // beter een tabblad dat even te lang is dan een melding die twee seconden blijft hangen.
    const snoeiSlot = LockService.getScriptLock();
    if (snoeiSlot.tryLock(2000)) {
      try {
        const last = sheet.getLastRow();   // vers lezen BINNEN het slot; buiten het slot is dit verouderd
        if (last > MELDING_MAX + 1) sheet.deleteRows(2, last - MELDING_MAX - 1);
      } finally {
        try { snoeiSlot.releaseLock(); } catch (_) {}
      }
    }
  } catch(e) { Logger.log('cd_schrijfMelding fout: ' + e); }
}

// ── Logboek (schrijft naar 'Logboek' sheet) ─────────────────
function cd_schrijfLogboek(code, sectie, actie, veld, oudeWaarde, nieuweWaarde, gebruiker) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Logboek');
    if (!sheet) {
      sheet = ss.insertSheet('Logboek');
      sheet.appendRow(['Timestamp','VvE Code','Sectie','Actie','Veld','Oude Waarde','Nieuwe Waarde','Gebruiker']);
      sheet.setFrozenRows(1);
    }
    // cd_safeCell op de van-buiten-komende velden (mail-intake kan via cd_processNotifEvent
    // code/actiepunt aanleveren): formule-prefix neutraliseren bij openen in Excel/Sheets-desktop.
    sheet.appendRow([
      new Date().toISOString(),
      cd_safeCell(code || ''),
      cd_safeCell(sectie || ''),
      cd_safeCell(actie || ''),
      cd_safeCell(veld || ''),
      cd_safeCell(oudeWaarde || ''),
      cd_safeCell(nieuweWaarde || ''),
      cd_safeCell(gebruiker || '')
    ]);
    return true;   // cd_meldFout wil weten of de regel er echt staat
  } catch(e) { Logger.log('cd_schrijfLogboek fout: ' + e); return false; }
}

// ── Logboek snoeien: regels ouder dan 7 dagen weg (besluit 2026-10-15) ──────
// Het Logboek was het enige tabblad dat onbeperkt groeide (3.239 regels op 15-10) en de historie
// van afgeronde taken wordt niet gebruikt. Dagelijks gaat alles ouder dan LOGBOEK_BEWAAR_DAGEN weg.
//
// HOE. Het tabblad is append-only en dus chronologisch: we tellen vanaf rij 2 hoeveel regels op
// rij te oud zijn en verwijderen dat blok in één deleteRows. We stoppen bij de eerste regel die
// nog jong genoeg is OF waarvan de tijdstempel niet te lezen is — wat we niet kunnen lezen, wissen
// we niet. Eén aaneengesloten blok, niet 'alle oude regels waar ze ook staan': dat is één
// schrijfactie en kan nooit een verse regel raken die iemand net tussen oude regels zette.
//
// HET DASHBOARD MERKT HET. De incrementele Logboek-lezing (src/data.js, _verwerkLogboek) vergelijkt
// de hele ankerregel A..H; schuiven de rijen op, dan leest hij één keer volledig opnieuw. Bewerken
// of verwijderen van een logregel vanuit het dashboard loopt via assertRowMatch en weigert een
// verschoven rij. Daarom hoeft dit niet op een stil moment: de document-lock (cd_withLock) houdt
// alleen de andere Apps Script-schrijvers buiten de deur.
const LOGBOEK_BEWAAR_DAGEN = 7;

function cd_logboekLeeftijdMs(cel, nu) {
  // Tijdstempels zijn ISO-strings (dashboard én cd_schrijfLogboek); een handmatig ingetikte rij kan
  // een Date zijn. Alles wat niet parseert → NaN, en NaN telt als 'niet oud' (zie hierboven).
  var d = (cel instanceof Date) ? cel : new Date(String(cel || '').trim());
  var t = d.getTime();
  return isNaN(t) ? NaN : nu - t;
}

function cd_logboekSnoeien() {
  var verslag = cd_withLock(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Logboek');
    if (!sheet) return 'geen Logboek-tab';
    var last = sheet.getLastRow();
    if (last < 2) return 'leeg';
    var stempels = sheet.getRange(2, 1, last - 1, 1).getValues();
    var grens = LOGBOEK_BEWAAR_DAGEN * 24 * 60 * 60 * 1000;
    var nu = Date.now();
    var oud = 0;
    for (var i = 0; i < stempels.length; i++) {
      var leeftijd = cd_logboekLeeftijdMs(stempels[i][0], nu);
      if (!(leeftijd > grens)) break;   // te jong of onleesbaar → hier stoppen
      oud++;
    }
    if (oud > 0) sheet.deleteRows(2, oud);
    return oud + ' regel(s) ouder dan ' + LOGBOEK_BEWAAR_DAGEN + ' dagen verwijderd, ' + (last - 1 - oud) + ' over';
  });
  Logger.log('cd_logboekSnoeien: ' + (verslag || 'lock niet verkregen — volgende dag opnieuw'));
}

// Zet de dagelijkse trigger één keer, vanuit de veegbeurt (cd_sweepNotifQueue): zo is een deploy via
// de CI genoeg en hoeft niemand in de editor op 'uitvoeren' te drukken. Bestaat de trigger al, dan
// gebeurt er niets. 03:30 ligt vóór de opvolgmotor (06:30) en het dagoverzicht (08:30), en ver van
// de dagelijkse back-up (02:15) — die kopieert de Sheet in zijn geheel en mag niet halverwege
// een deleteRows vallen.
function cd_logboekSnoeiTriggerAutomatisch() {
  var bestaat = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'cd_logboekSnoeien';
  });
  if (bestaat) return;
  ScriptApp.newTrigger('cd_logboekSnoeien').timeBased().atHour(3).nearMinute(30).everyDays(1).create();
  Logger.log('✓ Dagelijkse Logboek-snoei (±03:30) ingesteld.');
}
