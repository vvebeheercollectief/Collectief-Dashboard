// Hoeveel vinkjes één handmatige bewerking hoogstens mag bevatten. Boven dat aantal doen beide
// wegen NIETS en melden ze het in het Logboek: een gebaar van die omvang is vrijwel altijd een
// uitschieter met de vulgreep, en geen van beide is ongedaan te maken.
//   · verplaatsAfgerond archiveert én VERWIJDERT de rij uit 'Nog Te Doen';
//   · verplaatsALV verwijdert niets, maar zou al lang afgevinkte ALV's opnieuw archiveren met de
//     datum van vandaag — en dat voedt 'Laatst gehouden ALV', de chat en de KPI's.
var MAX_AFVINK_PER_KEER = 25;

function verplaatsAfgerond(e) {
 cd_lockedRun('verplaatsAfgerond', () => {
  // `e.range.getSheet()` en NIET `e.source.getActiveSheet()`. Die laatste zegt welk tabblad er in
  // de spreadsheet-UI vooraan staat op het moment dat de trigger draait, en dat hoeft niet het
  // tabblad te zijn waar de bewerking op landde: een installeerbare onEdit-trigger draait
  // asynchroon, in een document waar meerdere mensen tegelijk in werken, en iedereen heeft zijn
  // eigen actieve tabblad. De rijnummers hieronder komen wél uit `e.range`. Twee bronnen van
  // waarheid voor één bewerking is precies de fout waar de allowlist eronder tegen bedoeld is:
  // een vinkje in een BACK-UP van 'Nog Te Doen' zou anders de controle kunnen passeren en met de
  // rijnummers van die back-up in het échte tabblad gaan knippen en plakken.
  var sheet = e.range.getSheet();
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

  // VANGRAIL OP DE OMVANG. Meerdere hokjes tegelijk afvinken is bedoeld gedrag (zie hierboven),
  // maar deze weg archiveert én VERWIJDERT per rij, zonder vraag en zonder ongedaan maken. Eén
  // uitschieter met de vulgreep — hokje aanzetten en per ongeluk doortrekken tot dertig rijen
  // eronder — zou dus in één gebaar dertig lopende taken uit de lijst halen. Een echte afvinkronde
  // met de hand gaat over een handjevol rijen; alles daarboven is vrijwel zeker een ongeluk.
  // Bij twijfel dus NIETS doen, de vinkjes laten staan en het zichtbaar melden — dezelfde keuze
  // als bij een onverwacht 'Afgerond'-tabblad verderop. De gebruiker kan daarna gewoon in kleinere
  // stukken afvinken; niets is verloren.
  var aangevinkt = 0;
  for (var t = 0; t < vinkjes.length; t++) if (vinkjes[t][0] === true) aangevinkt++;
  if (aangevinkt > MAX_AFVINK_PER_KEER) {
    Logger.log('verplaatsAfgerond: ' + aangevinkt + ' vinkjes in één bewerking — niets gedaan');
    // De code van de BOVENSTE aangevinkte rij mee in de logregel. Zonder code komt zo'n regel
    // nergens in beeld: de Logboek-pagina toont alleen notities en contactmomenten, en het
    // VvE-dossier filtert op code. Nu is hij tenminste bij één van de betrokken VvE's terug te
    // vinden, en de tekst noemt het aantal.
    var eersteCode = '';
    for (var u = 0; u < vinkjes.length && !eersteCode; u++) {
      if (vinkjes[u][0] === true) eersteCode = (sheet.getRange(eersteRij + u, 1).getValue() + '').trim();
    }
    cd_schrijfLogboek(eersteCode, '', 'Fout', 'Afgerond', '',
      'Er stonden ' + aangevinkt + ' vinkjes in één bewerking (hoogstens ' + MAX_AFVINK_PER_KEER
      + ' tegelijk). Er is NIETS gearchiveerd en NIETS verwijderd — de vinkjes staan er nog. '
      + 'Was dit per ongeluk (doorgetrokken met de vulgreep)? Zet ze dan weer uit. Klopt het wel, '
      + 'vink dan in kleinere groepjes af.', 'systeem');
    return;
  }

  // Van ONDER naar BOVEN: elke geslaagde archivering verwijdert een rij, en dat zou de nog te
  // behandelen rijnummers omhoog schuiven. Van onderaf blijven ze kloppen.
  for (var rr = laatsteRij; rr >= eersteRij; rr--) {
    if (vinkjes[rr - eersteRij][0] !== true) continue;   // de per-rij-guard in cd_archiveerRij blijft
    cd_archiveerRij(sheet, rr);
  }
 }, () => {
  // Lock 2x niet gekregen: de afvink-actie is NIET uitgevoerd en het vinkje staat er nog. Dat
  // zichtbaar melden op de VvE zelf — een stil weggevallen archivering was voorheen alleen aan
  // het achtergebleven vinkje te zien, en niemand wist waarom (naloop 2026-08-28).
  var s = e.range.getSheet();
  if (s.getName().trim().toLowerCase() !== NTD_SHEET.toLowerCase()) return;
  var code = (s.getRange(e.range.getRow(), 1).getValue() + '').trim();
  cd_schrijfLogboek(code, '', 'Fout', 'Afvinken', '',
    'Het archiveren van deze afvink-actie kon niet starten (een andere bewerking hield het ' +
    'systeem bezet). Het vinkje staat er nog: haal het weg en zet het opnieuw.', 'systeem');
 });
}

// Eén afgevinkte rij naar 'Afgerond'. Los van de trigger zodat een bereik van meerdere rijen er
// rij voor rij langs kan; elke `return` hierin slaat alleen díé rij over.
// SYNC — spiegel van reconcileOffertes + parseAannemers (src/util.js), voor de
// afvink-in-de-Sheet-weg hierboven: staat er een aannemerslijst in kolom P, dan telt alléén
// de lijst (X = aantal |1, N = lijstlengte). Geen lijst → kolom D rauw (rijen van vóór de
// aannemerslijst). Sinds v12.5 — de oude ondergrens (Math.max per kant) is weg, gelijk met
// de frontend; anders archiveerden Sheet-afvinken en dashboard-afronden verschillende tellers.
function cd_reconcileOffertes(rauwD, aannemersCel) {
  var lijst = ((aannemersCel == null ? '' : aannemersCel) + '').split('\n')
    .map(function (l) { return l.trim(); }).filter(function (l) { return l; });
  if (!lijst.length) return (rauwD == null ? '' : rauwD) + '';
  var binnen = 0;
  for (var i = 0; i < lijst.length; i++) {
    var p = lijst[i].lastIndexOf('|');
    if (p >= 0 && lijst[i].slice(p + 1).trim() === '1') binnen++;
  }
  return binnen + '/' + lijst.length;
}

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
  // Offerte-trajecten: kolom D eerst afleiden uit de aannemerslijst (kolom P) — lijst
  // aanwezig → lijst wint; zonder lijst blijft kolom D. Exact wat de afrondweg in het
  // dashboard doet (reconcileOffertes). De lijst zelf gaat hieronder bewust niet mee
  // (M..P leeg), dus de afgeleide teller is het enige wat er van die lijst overblijft;
  // deze Sheet-afvinkweg archiveerde eerder de rauwe kolom D ('0/3' terwijl er twee van
  // drie binnen waren) en dan was de echte stand definitief weg (naloop 2026-08-28).
  if (sectie === "OFFERTE-TRAJECTEN") archief[3] = cd_reconcileOffertes(rowData[3], rowData[15]);
  archief.push(datumAfgerond);              // I = afgerond op
  archief.push("");                         // J = toelichting (bij afvinken in de Sheet is die er niet)
  archief.push(cd_f4val(rowData[10]));      // K = subcategorie (K in de bron)
  archief.push(cd_f4val(rowData[12]));      // L = Herhaal-ID (M in de bron)
  archief.push("", "", "", "");             // M = duur in minuten, blijft hier leeg: afvinken in
                                             // de Sheet zelf kent geen duur. N..P blijven ook leeg.
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
  // De koprij PER SECTIE. Kolom A..H zijn de acht sectievelden en die verschillen per sectie —
  // bij Vergaderverzoeken staat op C de periode en op D de agendapunten, bij Offerte-trajecten op
  // C de aanvraagdatum. Eén gedeelde koprij zou dus onder vier van de vijf blokken de verkeerde
  // namen zetten. Deze lijsten spiegelen SECS[sec].keys uit src/config.js; Apps Script kan dat
  // bestand niet lezen, dus ze staan hier met de hand. Wijzigt daar de kolomvolgorde, dan hoort
  // dit mee te veranderen (de zelftest bewaakt SECS zelf, deze kop niet).
  // De staart I..L is voor alle secties gelijk: afronddatum, toelichting, subcategorie, Herhaal-ID.
  // Dit skelet wordt alleen gebruikt als het tabblad 'Afgerond' ontbreekt; de rijen eronder komen
  // altijd van cd_archiveerRij of van afrondWaarden.
  var STAART = ["Datum afgerond", "Toelichting", "Subcategorie", "Herhaal-ID"];
  var KOPPEN = {
    'OPPAKKEN':            ["VvE-Code","VvE","Actiepunt","Deadline","Behandelaar","Prioriteit","Opmerkingen","In behandeling"],
    'VERGADERVERZOEKEN':   ["VvE-Code","VvE","Periode","Agendapunten","Behandelaar","Deadline","Opmerkingen","In behandeling"],
    'LOD':                 ["VvE-Code","VvE","Actiepunt","Status","Behandelaar","Deadline","Opmerkingen","In behandeling"],
    'OFFERTE-TRAJECTEN':   ["VvE-Code","VvE","Datum aangevraagd","Ontvangen/Aangevraagd","Behandelaar","Deadline","Opmerkingen",""],
    'SUBSIDIE-TRAJECTEN':  ["VvE-Code","VvE","Subsidie","Fase","Behandelaar","Deadline","Opmerkingen","In behandeling"]
  };
  // De volgorde LOD vóór OFFERTE-TRAJECTEN is BEWUST anders dan SKEYS — zo staat het echt op
  // productie, zie de toelichting bovenin src/structuurcheck.js. Niet 'rechttrekken'.
  var BLOKKEN = ['OPPAKKEN', 'VERGADERVERZOEKEN', 'LOD', 'OFFERTE-TRAJECTEN', 'SUBSIDIE-TRAJECTEN'];

  for (var i = 0; i < BLOKKEN.length; i++) {
    var sec = BLOKKEN[i];
    var kop = KOPPEN[sec].concat(STAART);
    var rij = 1 + i * 3;                       // sectiekop, kolomkoprij, lege regel
    sheet.getRange(rij, 1).setValue(sec);
    // Nooit breder schrijven dan het blad is; anders gooit getRange en ligt de hele weg stil.
    var br = Math.min(kop.length, sheet.getMaxColumns());
    sheet.getRange(rij + 1, 1, 1, br).setValues([kop.slice(0, br)]);
    if (i < BLOKKEN.length - 1) sheet.getRange(rij + 2, 1).setValue("");
  }
}

function verplaatsALV(e) {
 cd_lockedRun('verplaatsALV', () => {
  // `e.range.getSheet()` om dezelfde reden als bij verplaatsAfgerond hierboven: het tabblad waar de
  // bewerking op landde, niet het tabblad dat toevallig vooraan staat.
  var sheet = e.range.getSheet();
  var range = e.range;

  // Allowlist: alléén het ALV-overzicht zelf. Reset-archieven en backup-tabbladen
  // hebben óók checkboxes in kolom D en mogen deze trigger niet raken.
  if (sheet.getName().trim().toLowerCase() !== ALVO_SHEET.toLowerCase()) return;

  // ALLEEN een bewerking die ÚITSLUITEND over kolom D gaat, en meerdere RIJEN mogen wél —
  // exact dezelfde voorwaarde en dezelfde reden als bij verplaatsAfgerond hierboven.
  // `range.getValue()` en `range.getRow()` geven bij een meercellig bereik alleen de
  // LINKERBOVENHOEK. Vinkte iemand vier Notulen-hokjes tegelijk aan (selecteren en Enter,
  // doortrekken met de vulgreep, of een blok TRUE plakken), dan werd alleen de bovenste ALV
  // gearchiveerd. De andere drie bleven afgevinkt staan zonder archiefregel — stil, en
  // achteraf alleen te herstellen door de datum uit het Logboek terug te zoeken (wat op
  // 26-08-2026 voor 50 regels ook echt is moeten gebeuren).
  if (range.getColumn() !== 4 || range.getNumColumns() !== 1) return;

  var eersteRij = range.getRow(), aantal = range.getNumRows();
  var vinkjes = sheet.getRange(eersteRij, 4, aantal, 1).getValues();
  var teDoen = [];
  for (var i = 0; i < aantal; i++) {
    // > 2 en niet > 1: de data van 'ALV's overzicht' begint op rij 3 (twee koprijen — dezelfde
    // grens als parseAlvo in src/data.js en cd_handleAlvoEdit hieronder). Een blok-plak dat D2
    // op TRUE zette liet de KOLOMKOPRIJ als ALV archiveren: de koptekst verscheen als VvE-code
    // in het archief en telde mee in de KPI's (naloop 2026-08-28).
    if (vinkjes[i][0] === true && (eersteRij + i) > 2) teDoen.push(eersteRij + i);
  }
  if (!teDoen.length) return;
  // Zelfde vangrail als bij verplaatsAfgerond, en om een verwante reden: bij een bereik lezen we de
  // HUIDIGE stand van kolom D, niet wat er veranderde — onEdit geeft die oude waarden bij een
  // meercellig bereik niet. Rijen die al TRUE stonden lopen dus mee. Selecteert iemand D3:D60 en
  // drukt Enter, dan zet Sheets de héle selectie op de tegenwaarde van de linkerbovenhoek en zouden
  // er tientallen ALV's opnieuw in het archief belanden, met de datum van vandaag.
  if (teDoen.length > MAX_AFVINK_PER_KEER) {
    Logger.log('verplaatsALV: ' + teDoen.length + ' vinkjes in één bewerking — niets gedaan');
    // Zelfde reden als bij verplaatsAfgerond: een logregel zonder code komt nergens in beeld.
    var eersteAlvCode = (sheet.getRange(teDoen[0], 1).getValue() + '').trim();
    cd_schrijfLogboek(eersteAlvCode, 'ALVS', 'Fout', 'Notulen', '',
      'Er stonden ' + teDoen.length + ' Notulen-vinkjes aan in één bewerking (hoogstens '
      + MAX_AFVINK_PER_KEER + ' tegelijk). Er is NIETS in "' + ALFA_SHEET + '" gezet. '
      + 'Vink in kleinere groepjes af.', 'systeem');
    return;
  }
  cd_archiveerALVs(sheet, teDoen, teDoen.length > 1);
 }, () => {
  // Zelfde geen-lock-melding als verplaatsAfgerond hierboven, om dezelfde reden.
  var s = e.range.getSheet();
  if (s.getName().trim().toLowerCase() !== ALVO_SHEET.toLowerCase()) return;
  var code = (s.getRange(e.range.getRow(), 1).getValue() + '').trim();
  cd_schrijfLogboek(code, 'ALVS', 'Fout', 'Notulen', '',
    'Het archiveren van dit Notulen-vinkje kon niet starten (een andere bewerking hield het ' +
    'systeem bezet). Het vinkje staat er nog: haal het weg en zet het opnieuw.', 'systeem');
 });
}

// Eén datumwaarde uit het archief als vergelijkbare tekst 'd-m-jjjj'. Het tabblad bevat allebei
// de vormen: regels die deze trigger schreef staan er als echte Date in, regels die het dashboard
// via de Sheets-API aanlegde als tekst '26-8-2026' (die USER_ENTERED óók als datum bewaart).
// Zonder deze normalisatie zou de ontdubbeling hieronder de twee soorten nooit aan elkaar
// koppelen. Zonder voorloopnullen, want zo staat de rest van het blad erin.
function cd_alvDatumTekst(v) {
  if (v instanceof Date) return v.getDate() + '-' + (v.getMonth() + 1) + '-' + v.getFullYear();
  return (v === null || v === undefined ? '' : v).toString().trim();
}

// De ALV's van deze rijen naar "ALV's afgerond". Los van de trigger, zodat een bereik van
// meerdere rijen er in één keer langs kan: het doeltabblad wordt één keer opgezocht, de
// bestaande regels één keer gelezen en alle nieuwe regels in één setValues weggeschreven.
// Via `sheet.getParent()` en NIET via het onEdit-event: `e` bestaat hier niet (zie de
// toelichting bij cd_archiveerRij — met `e.source` gooit elke aanroep een ReferenceError).
// `blok` = deze aanroep komt uit een bewerking van MEERDERE rijen. Dan weten we niet welke vinkjes
// écht van waarde veranderden (onEdit levert de oude waarden van een bereik niet), dus is de
// dag-ontdubbeling te smal: een ALV die vorig jaar is afgevinkt en nu 'meeliftte' zou een tweede
// archiefregel krijgen met de datum van vandaag. Bij een blok slaan we daarom élke code over die
// de laatste ALFA_RECENT_DAGEN al een archiefregel heeft. Bij één cel — de gewone weg, en de enige
// weg waarop we zéker weten dat er zojuist iets is aangevinkt — blijft de dag-ontdubbeling gelden,
// precies zoals het dashboard die ook hanteert.
var ALFA_RECENT_DAGEN = 180;

function cd_archiveerALVs(sheet, rijen, blok) {
  var ss = sheet.getParent();

  // Doeltabblad op naam — nooit "het laatste tabblad": de tabbladvolgorde is niet
  // stabiel (reset-archieven, logboek-backups). Hoofdletterongevoelig + trim, in de
  // stijl van _isAlvoTab in src/alv-reset.js.
  var alleTabs = ss.getSheets();
  var targetSheet = null;
  for (var t = 0; t < alleTabs.length; t++) {
    if (alleTabs[t].getName().trim().toLowerCase() === ALFA_SHEET.toLowerCase()) {
      targetSheet = alleTabs[t];
      break;
    }
  }
  if (!targetSheet) {
    // Niets schrijven, niets aanmaken (een hernoemd tabblad zou anders een tweede,
    // concurrerende lijst krijgen). Vinkjes blijven staan; zichtbaar melden in het Logboek.
    // ALLE codes noemen en niet alleen de eerste: sinds deze weg meerdere rijen tegelijk aankan,
    // zou een melding in het enkelvoud de rest stil laten verdwijnen — precies het gedrag dat
    // hier gerepareerd is.
    var codes = [];
    for (var q = 0; q < rijen.length; q++) {
      var c = (sheet.getRange(rijen[q], 1).getValue() + '').trim();
      if (c) codes.push(c);
    }
    Logger.log("verplaatsALV: tabblad '" + ALFA_SHEET + "' niet gevonden — " + codes.length + " ALV('s) niet gearchiveerd: " + codes.join(', '));
    cd_schrijfLogboek(codes[0] || '', 'ALVS', 'Fout', 'Notulen', '',
      "Tabblad '" + ALFA_SHEET + "' niet gevonden — " + codes.length + " ALV('s) niet gearchiveerd ("
      + codes.join(', ') + "). De vinkjes staan er nog.", 'systeem');
    return;
  }

  var lastRow = targetSheet.getLastRow();
  if (lastRow === 0) {
    targetSheet.appendRow(["VvE-code", "VvE-naam", "Datum afgerond"]);
    lastRow = 1;
  }

  // Ontdubbelen op code + de EXACTE dag, precies de regel die het dashboard in
  // toggleAlvoFlag (src/render-alv.js) hanteert. Twee redenen: uit- en weer aanvinken mag geen
  // tweede regel geven, en het dashboard kan de regel van vandaag al gezet hebben. Bewust NIET
  // op kalenderjaar: de datum in dit tabblad is de dag waarop het vinkje gezet werd, dus een ALV
  // van december die pas in januari wordt afgevinkt draagt een januaridatum.
  var bestaand = {}, recent = {};
  var grens = new Date(); grens.setDate(grens.getDate() - ALFA_RECENT_DAGEN);
  if (lastRow > 1) {
    var leesBr = Math.min(3, targetSheet.getMaxColumns());
    var oudeRijen = targetSheet.getRange(2, 1, lastRow - 1, leesBr).getValues();
    for (var b = 0; b < oudeRijen.length; b++) {
      var bCode = (oudeRijen[b][0] + '').trim();
      bestaand[bCode + '\u001f' + cd_alvDatumTekst(oudeRijen[b][2])] = true;
      // Alleen een ECHTE datumwaarde telt mee voor 'recent'. Regels waarin de datum als tekst
      // staat en niet te lezen is, laten we buiten deze rem: liever een dubbele regel dan een
      // ontbrekende.
      var bDat = oudeRijen[b][2];
      if (bDat instanceof Date && bDat >= grens) recent[bCode] = true;
    }
  }

  var datumAfgerond = new Date();
  var vandaag = cd_alvDatumTekst(datumAfgerond);
  // Code en naam van álle aangevinkte rijen in ÉÉN lezing. Per rij twee losse getValue-aanroepen
  // zou bij een blok van twintig hokjes veertig leesacties bínnen de document-lock betekenen —
  // dezelfde afweging als bij de sectiescan in cd_archiveerRij.
  var minR = rijen[0], maxR = rijen[0];
  for (var m = 1; m < rijen.length; m++) {
    if (rijen[m] < minR) minR = rijen[m];
    if (rijen[m] > maxR) maxR = rijen[m];
  }
  var bron = sheet.getRange(minR, 1, maxR - minR + 1, 2).getValues();
  var nieuw = [];
  for (var r = 0; r < rijen.length; r++) {
    var row = rijen[r];
    var vveCode = bron[row - minR][0];
    var vveNaam = bron[row - minR][1];
    if (vveCode === "" && vveNaam === "") continue;
    var sleutel = (vveCode + '').trim() + '\u001f' + vandaag;
    if (bestaand[sleutel]) continue;      // staat er al — niets doen
    if (blok && recent[(vveCode + '').trim()]) continue;   // blok-bewerking: zie ALFA_RECENT_DAGEN
    bestaand[sleutel] = true;             // ook binnen dit bereik niet dubbel
    nieuw.push([vveCode, vveNaam, datumAfgerond]);
  }
  if (!nieuw.length) return;
  // De BREEDTE klemmen, net als de leesbreedte in cd_archiveerRij. Het tabblad wordt met de
  // hand beheerd (er is op 26-08 nog met de hand bijgevuld); is het ooit smaller dan drie
  // kolommen, dan gooit de schrijf een fout en ligt de hele trigger stil in plaats van alleen
  // deze regel.
  var br = Math.min(3, targetSheet.getMaxColumns());
  // appendRow per regel en NIET setValues op het vooraf gelezen `lastRow`: tussen die lezing en
  // dit punt zitten meerdere round-trips, en het dashboard archiveert via values:append — dat
  // loopt volledig búiten de document-lock. Landde zo'n append in dat venster, dan overschreef
  // setValues die regel zonder enige controle en was hij stil weg (naloop 2026-08-28).
  // appendRow bepaalt het tabel-einde per aanroep zelf en groeit het raster vanzelf mee; het
  // aantal regels is door MAX_AFVINK_PER_KEER begrensd, dus de extra schrijfacties zijn beperkt.
  for (var w = 0; w < nieuw.length; w++) targetSheet.appendRow(nieuw[w].slice(0, br));
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
  // Het tabblad waar de bewerking ECHT op landde (zie verplaatsAfgerond), niet het actieve.
  if (e && e.range.getSheet().getName() !== "Nog Te Doen") return;

  // NIET sorteren op een bewerking die alleen over kolom I gaat — dat is het afvink-hokje, en daar
  // hoort `verplaatsAfgerond` bij. Eén handmatige bewerking vuurt namelijk BEIDE triggers af.
  // Ze delen dezelfde document-lock en draaien dus na elkaar, maar de volgorde ligt niet vast.
  // Won de sortering, dan verhuisden de rijen en las `verplaatsAfgerond` daarna zijn vinkjes op de
  // rijnummers van vóór de sortering: kolom I staat daar dan op FALSE, de per-rij-guard stopt, en
  // er gebeurt NIETS — het vinkje blijft staan, er komt geen archiefregel en geen melding. Sorteren
  // heeft bij een afvink-actie ook geen doel: die rij verdwijnt juist uit het blad.
  // Alleen bij een bereik van precies één kolom breed; een bredere bewerking (plakken over H:I)
  // laat `verplaatsAfgerond` zelf al met rust, dus daar is geen wedloop.
  if (e && e.range.getColumn() === 9 && e.range.getNumColumns() === 1) return;

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

  // Sorteer OPPAKKEN op kolom H (8) = het vinkje 'In behandeling'. Bij VERGADERVERZOEKEN idem.
  //
  // DIT BLIJFT ZO — besloten door de gebruiker op 2026-08-26. Niet opnieuw voorstellen.
  // De doorlichting merkte op dat het afwijkt: de andere drie secties sorteren op een datum
  // (offerte op C = datum aangevraagd, LOD en subsidie op F = deadline), en de deadline staat bij
  // Oppakken in kolom D en bij Vergaderverzoeken in F. Sorteren op het vinkje zet dus 'nog niet in
  // behandeling' bovenaan in plaats van 'meest urgent'. Dat is gevraagd en gewenst: deze volgorde
  // is wat de gebruiker in zijn éigen tabblad wil zien, en het dashboard sorteert los daarvan.
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
