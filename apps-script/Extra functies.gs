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
    const last = sheet.getLastRow();
    if (last > MELDING_MAX + 1) sheet.deleteRows(2, last - MELDING_MAX - 1);
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
  } catch(e) { Logger.log('cd_schrijfLogboek fout: ' + e); }
}
