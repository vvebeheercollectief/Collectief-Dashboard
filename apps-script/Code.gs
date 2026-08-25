function verplaatsAfgerond(e) {
 cd_lockedRun('verplaatsAfgerond', () => {
  var sheet = e.source.getActiveSheet();
  var range = e.range;

  // Allowlist, net als verplaatsALV verderop: alléén het echte tabblad 'Nog Te Doen'. Een kopie
  // of back-up daarvan heeft exact dezelfde sectiekoppen én dezelfde checkbox in kolom I; met een
  // denylist op alleen "Afgerond" knipte één vinkje in zo'n back-up een rij uit de BACK-UP en zette
  // hem in het echte archief. Hoofdletterongevoelig + trim, zoals _isAlvoTab in src/alv-reset.js.
  if (sheet.getName().trim().toLowerCase() !== NTD_SHEET.toLowerCase()) return;

  // ALLEEN een bewerking die ÚITSLUITEND over kolom I gaat. Dat is bewust smal: een eerdere opzet
  // liet elk bereik door dat kolom I ook maar RAAKTE, en dan wordt deze trigger destructief bij een
  // gewone plakactie. Plak je een blok A:S terug uit een backup-tabblad en staat daar ergens TRUE
  // in kolom I, dan archiveert hij die rijen en verwijdert ze meteen uit 'Nog Te Doen' — zonder
  // vraag en zonder undo. Het geval waar het om gaat (meerdere hokjes tegelijk aanvinken) is altijd
  // één kolom breed.
  //
  // Meerdere RIJEN mogen wél: `range.getRow()` en `range.getValue()` geven bij een meercellig
  // bereik alleen de linkerbovenhoek, dus vier hokjes tegelijk aanvinken (selecteren en Enter,
  // doortrekken met de vulgreep) leverde één onEdit-event op waarvan alleen de bovenste rij werd
  // behandeld. De rest bleef afgevinkt in de lijst staan, zonder melding en zonder logregel.
  if (range.getColumn() !== 9 || range.getNumColumns() !== 1) return;

  // GOEDKOPE VOORFILTER. `cd_archiveerRij` doet per rij eerst een brede lezing (A..S) vóórdat hij
  // op TRUE kan toetsen. Bij een bereik van honderden rijen — één sleepbeweging over kolom I is zo
  // gemaakt — zijn dat honderden losse Sheet-lezingen binnen de document-lock, terwijl er meestal
  // één hokje echt is aangevinkt. Eén lezing van het vinkjesbereik vervangt dat.
  var eersteRij = range.getRow(), aantal = range.getNumRows();
  var laatsteRij = eersteRij + aantal - 1;
  var vinkjes = sheet.getRange(eersteRij, 9, aantal, 1).getValues();
  // Van ONDER naar BOVEN: elke geslaagde archivering verwijdert een rij, en dat zou de nog te
  // behandelen rijnummers omhoog schuiven. Van onderaf blijven ze kloppen.
  for (var rr = laatsteRij; rr >= eersteRij; rr--) {
    if (vinkjes[rr - eersteRij][0] !== true) continue;   // de per-rij-guard in cd_archiveerRij blijft
    cd_archiveerRij(sheet, rr);
  }
 });
}

// Eén afgevinkte rij naar 'Afgerond'. Los van de trigger zodat een bereik van meerdere rijen er
// rij voor rij langs kan; elke `return` hierin slaat alleen díé rij over.
function cd_archiveerRij(sheet, row) {
  var vinkKolom = 9;   // kolom I — het afvink-hokje (heette hier `lastCol` toen A:I álles was)
  // Lees t/m S en niet t/m I. De kolommen Q (taakId), R (bundelId) en S (bundelVolg) moeten mee
  // naar het archief: zonder taaknummer heeft een afgeronde rij geen identiteit meer en laat
  // bouwBundelIndex (src/bundel.js, §3.2b van het ontwerp) hem per definitie buiten de bundel
  // vallen. Vinkte iemand hier een bundellid af, dan verdween dat lid dus helemaal uit de bundel
  // in plaats van doorgestreept bovenin het paneel te blijven staan — en bij een bundel van twee
  // bleef er geen bundel over. Achteraf niet meer te herstellen: de archiefrij had geen identiteit.
  // Nooit breder lezen dan het blad is; getRange gooit anders een fout en legt de hele trigger stil.
  var leesBreedte = Math.min(19, sheet.getMaxColumns());
  var rowData = sheet.getRange(row, 1, 1, leesBreedte).getValues()[0];

  // Herverifieer binnen de lock dat de afvink-checkbox (kolom 9) op rij `row` NOG aan staat.
  // `row` komt uit het onEdit-event (vastgelegd vóór de lock); een frontend-write via de
  // Sheets-API loopt buiten de Apps Script-lock en kan in dat venster rijen verschoven hebben,
  // waardoor `row` nu een ándere taak aanwijst. Staat kolom 9 daar niet (meer) op TRUE, dan is
  // dit niet de zojuist-afgevinkte rij → niet kopiëren/verwijderen (resync corrigeert).
  if (rowData[vinkKolom - 1] !== true) return;

  if (rowData[0] === "" && rowData[1] === "") return;

  // Bepaal in welke sectie de rij zit. Kolom A in ÉÉN lezing ophalen, net als de sectiescan op
  // 'Afgerond' verderop al doet. Cel voor cel omhoog lopen kostte hier tot tientallen losse
  // getValue-aanroepen per afgevinkte taak — seconden binnen de lock, en juist die seconden zijn
  // het venster waarin een schrijfactie van het dashboard (die buiten deze lock om gaat) de rijen
  // kan verschuiven. Zie de her-controle vlak vóór deleteRow onderaan.
  var kolomABron = sheet.getRange(1, 1, row, 1).getValues();
  var sectie = "";
  for (var i = row - 1; i >= 1; i--) {
    var cellValue = kolomABron[i - 1][0].toString().trim().toUpperCase();
    if (cellValue === "OPPAKKEN" || cellValue === "VERGADERVERZOEKEN" || cellValue === "LOD" || cellValue === "OFFERTE-TRAJECTEN" || cellValue === "SUBSIDIE-TRAJECTEN") {
      sectie = cellValue;
      break;
    }
  }
  if (sectie === "") return;

  var vveCode = rowData[0];
  var datumAfgerond = new Date();

  // Het archiefstramien van afrondWaarden (src/crud.js) — NIET meer de oude vijf kolommen.
  // Twee redenen. (1) Het Herhaal-ID moet mee: cd_hr_verwerkAfrondingen leest dat op kolom L van
  // 'Afgerond' (zie Opvolging.gs), en dat bleef bij de vijf-koloms vorm leeg. Een taak met een
  // 'na afronden'-herhaalregel die iemand hier in de Sheet afvinkte, werd dus nooit opnieuw
  // ingepland — stil, en achteraf niet te zien. (2) De vijf-koloms vorm zette de behandelaar op
  // kolom D en de datum op E, terwijl het dashboard daar deadline en behandelaar verwacht;
  // parseSections heeft daar een aparte herkenningsregel voor moeten krijgen. Elke rij die hier
  // vandaan komt is nu gewoon een normale archiefrij.
  // A..H kan letterlijk mee: dat is in beide tabbladen exact SECS[sec].keys, in dezelfde volgorde.
  var archief = rowData.slice(0, 8);
  while (archief.length < 8) archief.push("");
  archief.push(datumAfgerond);              // I = afgerond op
  archief.push("");                         // J = toelichting (bij afvinken in de Sheet is die er niet)
  archief.push(cd_f4val(rowData[10]));      // K = subcategorie (K in de bron)
  archief.push(cd_f4val(rowData[12]));      // L = Herhaal-ID (M in de bron)
  archief.push("", "", "", "");             // M..P blijven leeg, net als bij afrondWaarden
  archief.push(rowData[16] || "", rowData[17] || "", rowData[18] || "");  // Q/R/S: taaknummer + bundel

  // Via `sheet.getParent()` en niet via het onEdit-event: deze functie staat sinds de opsplitsing
  // LOS van de trigger (een bereik van meerdere rijen loopt er rij voor rij langs), dus `e` bestaat
  // hier niet. Met `e.source` gooide élke handmatige afvink-actie meteen een ReferenceError.
  var ss = sheet.getParent();
  var targetSheet = ss.getSheetByName("Afgerond");
  if (!targetSheet) {
    targetSheet = ss.insertSheet("Afgerond");
    setupAfgerondSheet(targetSheet);
  }

  // 'Afgerond' is een ARCHIEF: hier staat de hele historie van afgeronde taken in. Ziet cel A1
  // er anders uit dan verwacht, dan stond hier eerst targetSheet.clear() gevolgd door een vers
  // skelet — één ingevoegde regel bovenaan het tabblad was dus genoeg om bij de eerstvolgende
  // handmatige afvink-actie het COMPLETE archief te wissen, zonder waarschuwing en zonder spoor.
  // Zelfde keuze als bij verplaatsALV hierboven: bij een onverwachte situatie niets schrijven,
  // het vinkje laten staan en het zichtbaar melden. Nooit wissen om te 'herstellen'.
  var firstCell = targetSheet.getRange(1, 1).getValue().toString().trim().toUpperCase();
  if (firstCell !== "OPPAKKEN") {
    Logger.log("verplaatsAfgerond: A1 van 'Afgerond' is '" + firstCell + "' i.p.v. 'OPPAKKEN' — "
      + "niets gewist, taak " + vveCode + " niet gearchiveerd");
    cd_schrijfLogboek(vveCode, sectie, 'Fout', 'Afgerond', '',
      "Tabblad 'Afgerond' ziet er anders uit dan verwacht (A1 = '" + firstCell + "') — "
      + "taak niet gearchiveerd en er is NIETS gewist. Controleer de kop van het tabblad.", 'systeem');
    return;
  }

  // Kolom A in ÉÉN keer ophalen, net als _sorteerOfferteTrajectenImpl verderop. Cel voor cel
  // lezen kostte hier tot honderden losse getValue-aanroepen per afgevinkte taak — en elke cel
  // in de lus zelfs twee keer — allemaal binnen de document-lock.
  var lastRowTarget = targetSheet.getLastRow();
  var kolomA = targetSheet.getRange(1, 1, Math.max(lastRowTarget, 1), 1).getValues();
  var celA = function (r) { return kolomA[r - 1][0]; };
  var kopA = function (r) { return celA(r).toString().trim().toUpperCase(); };

  var sectieRow = -1;
  for (var s = 1; s <= lastRowTarget; s++) {
    if (kopA(s) === sectie) { sectieRow = s; break; }
  }
  if (sectieRow === -1) {
    // Stond hier een kale return: de taak bleef dan afgevinkt in 'Nog Te Doen' staan zonder
    // dat iemand kon zien waarom hij niet in het archief kwam. Nu een spoor, net als hierboven.
    Logger.log("verplaatsAfgerond: sectie '" + sectie + "' niet gevonden in 'Afgerond' — taak "
      + vveCode + " niet gearchiveerd");
    cd_schrijfLogboek(vveCode, sectie, 'Fout', 'Afgerond', '',
      "Sectie '" + sectie + "' ontbreekt in het tabblad 'Afgerond' — taak niet gearchiveerd. "
      + "Voeg de sectiekop toe.", 'systeem');
    return;
  }

  var insertRow = sectieRow + 2;
  while (insertRow <= lastRowTarget) {
    var checkVal = kopA(insertRow);
    if (checkVal === "OPPAKKEN" || checkVal === "VERGADERVERZOEKEN" || checkVal === "LOD" || checkVal === "OFFERTE-TRAJECTEN" || checkVal === "SUBSIDIE-TRAJECTEN") {
      break;
    }
    if (celA(insertRow) === "") {
      break;
    }
    insertRow++;
  }

  targetSheet.insertRowBefore(insertRow);
  // Eén schrijfactie over A..S. Nooit breder dan het blad: schrijven buiten het raster mislukt in
  // Apps Script met een fout die de hele trigger stillegt. 'Afgerond' is 26 kolommen breed
  // (gemeten), dus in de praktijk gaan alle 19 mee; de klem is het vangnet voor een smaller blad.
  var schrijfBreedte = Math.min(archief.length, targetSheet.getMaxColumns());
  targetSheet.getRange(insertRow, 1, 1, schrijfBreedte)
             .setValues([archief.slice(0, schrijfBreedte)]);

  // ── Is rij `row` NOG steeds dezelfde taak? ──────────────────────────────────────────────
  // Tussen de controle bovenaan en dit punt zit echt werk: twee sectiescans, een insertRowBefore
  // en een setValues. Het dashboard schrijft buiten deze document-lock om (de lock serialiseert
  // alleen Apps Script onderling) en verwijdert daarbij NTD-rijen — bij afronden, bij bulk-
  // afronden en bij verwijderen. Schoof er in dat venster iets op, dan wees `row` inmiddels naar
  // een ándere, nog lopende taak: die werd hier stil verwijderd, terwijl de afgevinkte taak
  // gearchiveerd én in de lijst achterbleef. Geen undo, geen spoor.
  // Vers herlezen en vergelijken op IDENTITEIT: kolom A (VvE-code) én kolom Q (het vaste
  // taaknummer) moeten nog gelijk zijn aan wat we zojuist gearchiveerd hebben, en het vinkje in
  // kolom I moet er nog staan. Dezelfde vraag die assertRowMatch in de frontend stelt.
  var naData = sheet.getRange(row, 1, 1, leesBreedte).getValues()[0];
  // Kolom A (VvE-code) + kolom Q (het vaste taaknummer). Heeft de rij geen taaknummer — dat kan bij
  // rijen van vóór de backfill — dan is kolom A alléén niet genoeg: één VvE heeft vaak meerdere
  // taken in dezelfde sectie. Dan telt kolom C erbij als tweede bewijsstuk (de omschrijving; bij
  // Vergaderverzoeken de periode, bij Offerte de aanvraagdatum — in alle gevallen iets dat een
  // buurrij zelden deelt). Zelfde gedachte als de terugval in bevestigInvoegPlek.
  var nrOud = leesBreedte >= 17 ? rowData[16].toString().trim() : '';
  var nrNu  = leesBreedte >= 17 ? naData[16].toString().trim()  : '';
  var zelfdeTaak = naData[vinkKolom - 1] === true
                && naData[0].toString().trim() === rowData[0].toString().trim()
                && (nrOud
                      ? nrNu === nrOud
                      : naData[2].toString().trim() === rowData[2].toString().trim());
  if (!zelfdeTaak) {
    // Niets verwijderen. De archiefregel staat er al, dus de taak staat nu dubbel — zichtbaar en
    // met de hand te herstellen. Dat is oneindig veel beter dan een willekeurige andere taak stil
    // kwijtraken. Een logregel erbij, net als bij de twee andere onverwachte situaties hierboven.
    Logger.log('verplaatsAfgerond: rij ' + row + ' is niet meer dezelfde taak — niets verwijderd');
    cd_schrijfLogboek(vveCode, sectie, 'Fout', 'Afgerond', '',
      "De taak is gearchiveerd, maar regel " + row + " in 'Nog Te Doen' was intussen een andere taak "
      + "geworden — die regel is NIET verwijderd. De afgeronde taak staat nu dubbel; haal hem met "
      + "de hand uit 'Nog Te Doen'.", 'systeem');
    return;
  }

  sheet.deleteRow(row);
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
  sheet.getRange(12, 1).setValue("");

  // Vijfde sectie (2026-07-29). Ontbrak hier, waardoor het zoeken naar de sectiekop op een vers
  // skelet niets vond en een afgevinkte subsidietaak stil niet gearchiveerd werd. De volgorde LOD vóór
  // OFFERTE-TRAJECTEN is BEWUST anders dan SKEYS — zo staat het echt op productie, zie de
  // toelichting bovenin src/structuurcheck.js. Niet 'rechttrekken'.
  sheet.getRange(13, 1).setValue("SUBSIDIE-TRAJECTEN");
  sheet.getRange(14, 1, 1, 5).setValues([headers]);
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
// Breedte van het sorteerbereik. Stond op 9 (A t/m I) terwijl de rijen tot en met Q gevuld
// zijn. Gevolg: bij elke handmatige bewerking schoven A-I wél en J-Q niet, waarna opvolgdatum,
// herhaal-ID, escalatie, offerte-fase en aannemerslijst bij de VERKEERDE taak hoorden. Gemeten
// op 2026-07-29: een sortering die het volledige gevulde bereik dekt verplaatst de rijen zelf
// (inclusief hun vaste taaknummer); een smaller bereik verplaatst alleen celwaarden.
// Bij een nieuwe kolom rechts: dit getal MEE ophogen, anders zakt die kolom weer weg.
// Op 2026-08-17 van 17 naar 19 voor de Takenbundel: R (bundelId) en S (bundelVolg) zijn sinds
// dat traject de laatste gevulde kolommen, en bij 17 bleven ze bij een handmatige bewerking
// liggen terwijl A..Q wél herschikten — dan draagt taak X het bundelnummer van taak Y, zonder
// enige melding. Dit getal hoort dus gelijk te lopen met RASTER_MIN['Nog Te Doen'] in
// src/structuurcheck.js (ook 19); dát getal volgt de breedste schrijfactie van de app.
const NTD_SORT_KOLOMMEN = 19;   // A t/m S
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
  var subsidieHeader = -1;

  for (var i = 0; i < allValues.length; i++) {
    var val = allValues[i][0].toString().trim().toUpperCase();
    if (val === "OPPAKKEN") oppakkenHeader = i + 1;
    if (val === "VERGADERVERZOEKEN") vergaderHeader = i + 1;
    if (val === "OFFERTE-TRAJECTEN") offerteHeader = i + 1;
    if (val === "LOD") lodHeader = i + 1;
    if (val === "SUBSIDIE-TRAJECTEN") subsidieHeader = i + 1;
  }

  // Nooit breder sorteren dan het blad is: getRange gooit een fout zodra numColumns het
  // raster overschrijdt, en die fout zou de hele trigger (incl. de sortering zelf) stilleggen
  // op een Sheet die nog niet verbreed is.
  var sortBreedte = Math.min(NTD_SORT_KOLOMMEN, sheet.getMaxColumns());

  var editedRow = e ? e.range.getRow() : 0;
  var sortAll = (editedRow === 0);

  var inOppakken = sortAll || (editedRow > oppakkenHeader && editedRow < vergaderHeader);
  var inVergader = sortAll || (editedRow > vergaderHeader && editedRow < offerteHeader);
  var inOfferte = sortAll || (editedRow > offerteHeader && editedRow < lodHeader);
  // LOD is sinds de vijfde sectie niet meer het laatste blok, dus niet langer
  // "alles onder de LOD-kop": anders sorteert een bewerking in het subsidieblok
  // de LOD-rijen mee (en andersom).
  var inLOD = sortAll || (editedRow > lodHeader && (subsidieHeader < 0 || editedRow < subsidieHeader));
  var inSubsidie = sortAll || (subsidieHeader > 0 && editedRow > subsidieHeader);

  // Sorteer OPPAKKEN op kolom H (8) = het vinkje 'In behandeling'.
  // LET OP — dit is waarschijnlijk niet bedoeld, maar bewust NIET gewijzigd zonder de gebruiker.
  // Volgens SECS[...].keys (src/config.js), dat één-op-één de kolomvolgorde van dit tabblad is,
  // staat de deadline bij OPPAKKEN in kolom D (4) en bij VERGADERVERZOEKEN in F (6). De drie
  // andere secties sorteren wél op een betekenisvolle kolom (offerte op C = datum aangevraagd,
  // LOD en subsidie op F = deadline). Sorteren op een TRUE/FALSE-vinkje zet alleen 'nog niet in
  // behandeling' bovenaan. Wijzigen verandert de volgorde die de gebruiker in de Sheet zélf ziet
  // — dat is zijn keuze, niet die van een opruimronde. Zie de nachtelijke doorlichting v11.0.
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
      sheet.getRange(oppakkenStart, 1, oppakkenRows, sortBreedte).sort({column: 8, ascending: true});
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
      sheet.getRange(vergaderStart, 1, vergaderRows, sortBreedte).sort({column: 8, ascending: true});
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
      sheet.getRange(offerteStart, 1, offerteRows, sortBreedte).sort({column: 3, ascending: true});
    }
  }

  // Sorteer LOD op kolom F (6)
  if (inLOD && lodHeader > 0) {
    var lodStart = lodHeader + 2;
    var lodEnd = lodStart - 1;
    for (var k = lodStart; k <= lastRow; k++) {
      var kv = allValues[k - 1][0].toString().trim().toUpperCase();
      // Ook stoppen op een volgende sectiekop: alleen op een lege regel breken zou het
      // LOD-blok laten doorlopen tot in SUBSIDIE-TRAJECTEN als daar geen lege rij tussen zit.
      if (kv === "" || kv === "SUBSIDIE-TRAJECTEN") break;
      lodEnd = k;
    }
    var lodRows = lodEnd - lodStart + 1;
    if (lodRows > 1) {
      sheet.getRange(lodStart, 1, lodRows, sortBreedte).sort({column: 6, ascending: true});
    }
  }

  // Sorteer SUBSIDIE-TRAJECTEN op kolom F (6) — de deadline, net als LOD.
  // NIET kolom D: daar staat bij deze sectie de fase.
  if (inSubsidie && subsidieHeader > 0) {
    var subStart = subsidieHeader + 2;
    var subEnd = subStart - 1;
    for (var m = subStart; m <= lastRow; m++) {
      var mv = allValues[m - 1][0].toString().trim().toUpperCase();
      if (mv === "") break;
      subEnd = m;
    }
    var subRows = subEnd - subStart + 1;
    if (subRows > 1) {
      sheet.getRange(subStart, 1, subRows, sortBreedte).sort({column: 6, ascending: true});
    }
  }
}
