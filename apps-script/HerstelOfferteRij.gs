/**
 * EENMALIGE HERSTELACTIE — 6 augustus 2026
 *
 * Bewust het ENIGE functie-item in dit bestand: de functiekiezer in de Apps Script-editor
 * is onbetrouwbaar, en zo staat deze functie gegarandeerd voorgeselecteerd.
 *
 * Doet twee dingen aan tabblad 'Nog Te Doen', sectie OFFERTE-TRAJECTEN:
 *   1. Zet de per ongeluk verwijderde rij van VvE 201104 terug
 *      (Fahrenheitstraat 9-11, "Offerte onderhoud balkons", 2/3, taaknummer Tms5u4wv7w1o).
 *   2. Verwijdert de dubbele rij van VvE 381179 die op 0/2 blijft staan
 *      (taaknummer Tms5u4wv71g4). De complete tegenhanger Tms5u4wv7cdg (2/2) blijft staan.
 *
 * Veiligheid:
 *   - Werkt op TAAKNUMMER (kolom Q), nooit op een rijnummer. Rijnummers schuiven; nummers niet.
 *   - Doet niets als de verwachte inhoud niet exact klopt, en meldt dan waarom.
 *   - Idempotent: twee keer draaien verandert niets extra.
 *   - Verwijdert hooguit één rij, en alleen na controle op nummer én inhoud.
 */
function herstelOfferteRij() {
  var NAAM        = 'Nog Te Doen';
  var SECTIE      = 'OFFERTE-TRAJECTEN';
  var TERUG_NR    = 'Tms5u4wv7w1o';   // moet terugkomen
  var WEG_NR      = 'Tms5u4wv71g4';   // moet weg (dubbel, 0/2)
  var WEG_CODE    = '381179';
  var WEG_STAND   = '0/2';
  var KOL         = 17;               // A t/m Q

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NAAM);
  if (!sheet) { Logger.log('AFGEBROKEN: tabblad "' + NAAM + '" niet gevonden.'); return; }

  var laatste = sheet.getLastRow();
  var waarden = sheet.getRange(1, 1, laatste, KOL).getValues();

  // ── Sectiegrenzen bepalen ───────────────────────────────────────────────
  var kopRij = -1;
  for (var i = 0; i < waarden.length; i++) {
    if (String(waarden[i][0]).trim().toUpperCase() === SECTIE) { kopRij = i + 1; break; }
  }
  if (kopRij === -1) { Logger.log('AFGEBROKEN: sectiekop "' + SECTIE + '" niet gevonden.'); return; }

  // Eerste datarij = kopRij + 2 (kop, dan kolomkoppen). Laatste datarij = tot lege kolom A.
  var eersteData = kopRij + 2;
  var laatsteData = eersteData - 1;
  for (var r = eersteData; r <= waarden.length; r++) {
    if (String(waarden[r - 1][0]).trim() === '') break;
    laatsteData = r;
  }
  Logger.log('Sectie ' + SECTIE + ': kop op rij ' + kopRij + ', data rij ' + eersteData + ' t/m ' + laatsteData + '.');

  // ── Stap 1: ontbrekende rij terugzetten ─────────────────────────────────
  var alAanwezig = false;
  for (var a = eersteData; a <= laatsteData; a++) {
    if (String(waarden[a - 1][16]).trim() === TERUG_NR) { alAanwezig = true; break; }
  }

  if (alAanwezig) {
    Logger.log('Stap 1 overgeslagen: taaknummer ' + TERUG_NR + ' staat er al.');
  } else {
    var doelRij = laatsteData + 1;
    // De doelrij moet echt leeg zijn in kolom A; anders liever niets doen dan iets overschrijven.
    var kolomA = String(sheet.getRange(doelRij, 1).getValue()).trim();
    if (kolomA !== '') {
      Logger.log('AFGEBROKEN stap 1: rij ' + doelRij + ' is niet leeg (kolom A = "' + kolomA + '").');
      return;
    }
    var rij = [
      '201104',
      "VvE Fahrenheitstraat 9-11 te 's-Gravenhage",
      new Date(2026, 3, 30),                                   // 30 april 2026
      '2/3',
      'Jer',
      new Date(2026, 5, 11),                                   // 11 juni 2026
      'Offerte onderhoud balkons aangevraagd bij HGR, Heijstek en Klusbouw',
      '', '', '', '',
      false,                                                   // L Opvolgdatum
      false,                                                   // M HerhaalID
      'T1:21-07-2026|T2:04-08-2026',                           // N Esc
      false,
      false,                                                   // P Aannemers
      TERUG_NR                                                 // Q TaakID
    ];
    sheet.getRange(doelRij, 1, 1, KOL).setValues([rij]);
    Logger.log('Stap 1 KLAAR: rij van 201104 (onderhoud balkons, 2/3) teruggezet op rij ' + doelRij + '.');
    laatsteData = doelRij;
  }

  // ── Stap 2: de dubbele 381179-rij verwijderen ───────────────────────────
  // Opnieuw inlezen: stap 1 heeft de inhoud gewijzigd.
  var na = sheet.getRange(1, 1, sheet.getLastRow(), KOL).getValues();
  var treffers = [];
  for (var b = eersteData; b <= laatsteData; b++) {
    if (String(na[b - 1][16]).trim() === WEG_NR) treffers.push(b);
  }

  if (treffers.length === 0) {
    Logger.log('Stap 2 overgeslagen: taaknummer ' + WEG_NR + ' staat er niet (meer).');
    return;
  }
  if (treffers.length > 1) {
    Logger.log('AFGEBROKEN stap 2: taaknummer ' + WEG_NR + ' staat op meerdere rijen (' + treffers.join(', ') + ').');
    return;
  }

  var wegRij  = treffers[0];
  var code    = String(na[wegRij - 1][0]).trim();
  var stand   = String(na[wegRij - 1][3]).trim();
  if (code !== WEG_CODE || stand !== WEG_STAND) {
    Logger.log('AFGEBROKEN stap 2: rij ' + wegRij + ' bevat code "' + code + '" en stand "' + stand
             + '", verwacht "' + WEG_CODE + '" en "' + WEG_STAND + '". Niets verwijderd.');
    return;
  }

  sheet.deleteRow(wegRij);
  Logger.log('Stap 2 KLAAR: dubbele rij van ' + WEG_CODE + ' (' + WEG_STAND + ', ' + WEG_NR + ') verwijderd op rij ' + wegRij + '.');
  Logger.log('ALLES KLAAR.');
}
