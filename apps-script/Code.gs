function verplaatsAfgerond(e) {
 cd_lockedRun('verplaatsAfgerond', () => {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  if (sheet.getName() === "Afgerond") return;

  if (range.getColumn() !== 9) return;

  if (range.getValue() !== true) return;

  var row = range.getRow();
  var lastCol = 9;
  var rowData = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  // Herverifieer binnen de lock dat de afvink-checkbox (kolom 9) op rij `row` NOG aan staat.
  // `row` komt uit het onEdit-event (vastgelegd vóór de lock); een frontend-write via de
  // Sheets-API loopt buiten de Apps Script-lock en kan in dat venster rijen verschoven hebben,
  // waardoor `row` nu een ándere taak aanwijst. Staat kolom 9 daar niet (meer) op TRUE, dan is
  // dit niet de zojuist-afgevinkte rij → niet kopiëren/verwijderen (resync corrigeert).
  if (rowData[lastCol - 1] !== true) return;

  if (rowData[0] === "" && rowData[1] === "") return;

  // Bepaal in welke sectie de rij zit
  var sectie = "";
  for (var i = row - 1; i >= 1; i--) {
    var cellValue = sheet.getRange(i, 1).getValue().toString().trim().toUpperCase();
    if (cellValue === "OPPAKKEN" || cellValue === "VERGADERVERZOEKEN" || cellValue === "LOD" || cellValue === "OFFERTE-TRAJECTEN") {
      sectie = cellValue;
      break;
    }
  }
  if (sectie === "") return;

  var vveCode = rowData[0];
  var vveNaam = rowData[1];
  var actiepunt = rowData[2];
  var behandelaar = rowData[4];
  var datumAfgerond = new Date();
  var newRow = [vveCode, vveNaam, actiepunt, behandelaar, datumAfgerond];

  var targetSheet = e.source.getSheetByName("Afgerond");
  if (!targetSheet) {
    targetSheet = e.source.insertSheet("Afgerond");
    setupAfgerondSheet(targetSheet);
  }

  var firstCell = targetSheet.getRange(1, 1).getValue().toString().trim().toUpperCase();
  if (firstCell !== "OPPAKKEN") {
    targetSheet.clear();
    setupAfgerondSheet(targetSheet);
  }

  var sectieRow = findSectieRow(targetSheet, sectie);
  if (sectieRow === -1) return;

  var insertRow = sectieRow + 2;
  var lastRowTarget = targetSheet.getLastRow();

  while (insertRow <= lastRowTarget) {
    var checkVal = targetSheet.getRange(insertRow, 1).getValue().toString().trim().toUpperCase();
    if (checkVal === "OPPAKKEN" || checkVal === "VERGADERVERZOEKEN" || checkVal === "LOD" || checkVal === "OFFERTE-TRAJECTEN") {
      break;
    }
    if (targetSheet.getRange(insertRow, 1).getValue() === "") {
      break;
    }
    insertRow++;
  }

  targetSheet.insertRowBefore(insertRow);
  targetSheet.getRange(insertRow, 1, 1, 5).setValues([newRow]);

  sheet.deleteRow(row);
 });
}

function setupAfgerondSheet(sheet) {
  var headers = ["VvE-Code", "VvE", "Actiepunt", "Behandelaar", "Datum afgerond"];

  sheet.getRange(1, 1).setValue("OPPAKKEN");
  sheet.getRange(2, 1, 1, 5).setValues([headers]);
  sheet.getRange(3, 1).setValue("");

  sheet.getRange(4, 1).setValue("VERGADERVERZOEKEN");
  sheet.getRange(5, 1, 1, 5).setValues([headers]);
  sheet.getRange(6, 1).setValue("");

  sheet.getRange(7, 1).setValue("LOD");
  sheet.getRange(8, 1, 1, 5).setValues([headers]);
  sheet.getRange(9, 1).setValue("");

  sheet.getRange(10, 1).setValue("OFFERTE-TRAJECTEN");
  sheet.getRange(11, 1, 1, 5).setValues([headers]);
}

function findSectieRow(sheet, sectie) {
  var lastRow = Math.max(sheet.getLastRow(), 11);
  for (var i = 1; i <= lastRow; i++) {
    if (sheet.getRange(i, 1).getValue().toString().trim().toUpperCase() === sectie) {
      return i;
    }
  }
  return -1;
}
function verplaatsALV(e) {
 cd_lockedRun('verplaatsALV', () => {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // Allowlist: alléén het ALV-overzicht zelf. Reset-archieven en backup-tabbladen
  // hebben óók checkboxes in kolom D en mogen deze trigger niet raken.
  if (sheet.getName().trim().toLowerCase() !== ALVO_SHEET.toLowerCase()) return;

  if (range.getColumn() !== 4) return;

  if (range.getValue() !== true) return;

  var row = range.getRow();
  if (row <= 1) return;

  var vveCode = sheet.getRange(row, 1).getValue();
  var vveNaam = sheet.getRange(row, 2).getValue();

  if (vveCode === "" && vveNaam === "") return;

  // Doeltabblad op naam — nooit "het laatste tabblad": de tabbladvolgorde is niet
  // stabiel (reset-archieven, logboek-backups). Hoofdletterongevoelig + trim, in de
  // stijl van _isAlvoTab in src/alv-reset.js.
  var alleTabs = e.source.getSheets();
  var targetSheet = null;
  for (var t = 0; t < alleTabs.length; t++) {
    if (alleTabs[t].getName().trim().toLowerCase() === ALFA_SHEET.toLowerCase()) {
      targetSheet = alleTabs[t];
      break;
    }
  }
  if (!targetSheet) {
    // Niets schrijven, niets aanmaken (een hernoemd tabblad zou anders een tweede,
    // concurrerende lijst krijgen). Vinkje blijft staan; zichtbaar melden in Logboek.
    Logger.log("verplaatsALV: tabblad '" + ALFA_SHEET + "' niet gevonden — ALV van " + vveCode + " niet gearchiveerd");
    cd_schrijfLogboek(vveCode, 'ALVS', 'Fout', 'Notulen', '',
      "Tabblad '" + ALFA_SHEET + "' niet gevonden — ALV niet gearchiveerd", 'systeem');
    return;
  }

  var datumAfgerond = new Date();
  var newRow = [vveCode, vveNaam, datumAfgerond];

  var lastRow = targetSheet.getLastRow();
  if (lastRow === 0) {
    targetSheet.appendRow(["VvE-code", "VvE-naam", "Datum afgerond"]);
    lastRow = 1;
  }
  targetSheet.getRange(lastRow + 1, 1, 1, 3).setValues([newRow]);
 });
}
function sorteerOfferteTrajecten(e) {
  // Serialiseer t.o.v. de andere mutatie-triggers (verplaatsAfgerond/-ALV, opvolg-motor,
  // queue-drain) via dezelfde document-lock. Voorheen liep deze sort als enige zónder lock.
  cd_lockedRun('sorteerOfferteTrajecten', function() { _sorteerOfferteTrajectenImpl(e); });
}
function _sorteerOfferteTrajectenImpl(e) {
  var ss = e ? e.source : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Nog Te Doen");

  if (!sheet) return;
  if (e && e.source.getActiveSheet().getName() !== "Nog Te Doen") return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;                 // lege sheet: getRange(1,1,0,1) zou crashen
  var allValues = sheet.getRange(1, 1, lastRow, 1).getValues();

  var oppakkenHeader = -1;
  var vergaderHeader = -1;
  var offerteHeader = -1;
  var lodHeader = -1;

  for (var i = 0; i < allValues.length; i++) {
    var val = allValues[i][0].toString().trim().toUpperCase();
    if (val === "OPPAKKEN") oppakkenHeader = i + 1;
    if (val === "VERGADERVERZOEKEN") vergaderHeader = i + 1;
    if (val === "OFFERTE-TRAJECTEN") offerteHeader = i + 1;
    if (val === "LOD") lodHeader = i + 1;
  }

  var editedRow = e ? e.range.getRow() : 0;
  var sortAll = (editedRow === 0);

  var inOppakken = sortAll || (editedRow > oppakkenHeader && editedRow < vergaderHeader);
  var inVergader = sortAll || (editedRow > vergaderHeader && editedRow < offerteHeader);
  var inOfferte = sortAll || (editedRow > offerteHeader && editedRow < lodHeader);
  var inLOD = sortAll || (editedRow > lodHeader);

  // Sorteer OPPAKKEN op kolom H (8)
  if (inOppakken && oppakkenHeader > 0) {
    var oppakkenStart = oppakkenHeader + 2;
    var oppakkenEnd = oppakkenStart - 1;
    for (var a = oppakkenStart; a <= lastRow; a++) {
      var av = allValues[a - 1][0].toString().trim().toUpperCase();
      if (av === "VERGADERVERZOEKEN") break;
      if (allValues[a - 1][0] !== "") oppakkenEnd = a;
    }
    var oppakkenRows = oppakkenEnd - oppakkenStart + 1;
    if (oppakkenRows > 1) {
      sheet.getRange(oppakkenStart, 1, oppakkenRows, 9).sort({column: 8, ascending: true});
    }
  }

  // Sorteer VERGADERVERZOEKEN op kolom H (8)
  if (inVergader && vergaderHeader > 0) {
    var vergaderStart = vergaderHeader + 2;
    var vergaderEnd = vergaderStart - 1;
    for (var b = vergaderStart; b <= lastRow; b++) {
      var bv = allValues[b - 1][0].toString().trim().toUpperCase();
      if (bv === "OFFERTE-TRAJECTEN") break;
      if (allValues[b - 1][0] !== "") vergaderEnd = b;
    }
    var vergaderRows = vergaderEnd - vergaderStart + 1;
    if (vergaderRows > 1) {
      sheet.getRange(vergaderStart, 1, vergaderRows, 9).sort({column: 8, ascending: true});
    }
  }

  // Sorteer OFFERTE-TRAJECTEN op kolom C (3)
  if (inOfferte && offerteHeader > 0) {
    var offerteStart = offerteHeader + 2;
    var offerteEnd = offerteStart - 1;
    for (var j = offerteStart; j <= lastRow; j++) {
      var cv = allValues[j - 1][0].toString().trim().toUpperCase();
      if (cv === "LOD") break;
      if (allValues[j - 1][0] !== "") offerteEnd = j;
    }
    var offerteRows = offerteEnd - offerteStart + 1;
    if (offerteRows > 1) {
      sheet.getRange(offerteStart, 1, offerteRows, 9).sort({column: 3, ascending: true});
    }
  }

  // Sorteer LOD op kolom F (6)
  if (inLOD && lodHeader > 0) {
    var lodStart = lodHeader + 2;
    var lodEnd = lodStart - 1;
    for (var k = lodStart; k <= lastRow; k++) {
      var kv = allValues[k - 1][0].toString().trim().toUpperCase();
      if (kv === "") break;
      lodEnd = k;
    }
    var lodRows = lodEnd - lodStart + 1;
    if (lodRows > 1) {
      sheet.getRange(lodStart, 1, lodRows, 9).sort({column: 6, ascending: true});
    }
  }
}
