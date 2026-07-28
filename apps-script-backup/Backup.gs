// ══════════════════════════════════════
//  BACKUP — dagelijkse kopie van de PROD-Sheet naar een aparte Drive-map
// ══════════════════════════════════════
// LOS project, bewust NIET gebonden aan de spreadsheet en bewust NIET in apps-script/.
// Reden: een DriveApp-scope in het gebonden project is een scope-uitbreiding en dwingt
// herautorisatie af; tot dat gebeurt vallen cd_checkDeadlines, cd_dailySummary,
// cd_sweepNotifQueue en cd_opvolgingMotor stil. Een back-upmaatregel die het dagelijkse
// werk kan platleggen is erger dan het gat dat hij dicht.
//
// Dit script raakt de PROD-Sheet NOOIT aan — het leest hem alleen via makeCopy.
// Er wordt bewust geen tabblad in de PROD-Sheet geschreven: dat zou via de onChange-
// trigger cd_onNotifQueueChange elke nacht cd_drainNotifQueue wakker maken.

const BK_BRON_ID = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw'; // PROD-Sheet
const BK_MAP_ID  = '1bL53_v3kltsX3qZ88BotU_0ncufNjoGR';            // map 'Dashboard back-ups'
const BK_PREFIX  = 'BACKUP Collectief Dashboard ';
const BK_STAART  = ' — NIET BEWERKEN';
const BK_DAGEN   = 14;  // aantal dagelijkse kopieën dat bewaard blijft
const BK_MAANDEN = 12;  // aantal maandelijkse kopieën dat bewaard blijft
const BK_PROP    = 'bk_laatste_geslaagd';  // ISO-datum van de laatste geslaagde kopie
const BK_MAX_OUD = 2;   // na hoeveel dagen zonder geslaagde kopie er alarm is

// Naam van de kopie van een gegeven dag. Puur → los testbaar.
function bk_naam(d) {
  return BK_PREFIX + Utilities.formatDate(d, 'Europe/Amsterdam', 'yyyy-MM-dd') + BK_STAART;
}

// Haalt de datum uit een back-upnaam. null bij een naam die niet EXACT past, zodat het
// opruimen nooit een vreemd bestand in de map kan raken. Puur → los testbaar.
function bk_datumUitNaam(naam) {
  const m = /^BACKUP Collectief Dashboard (\d{4}-\d{2}-\d{2}) — NIET BEWERKEN$/.exec(naam);
  return m ? m[1] : null;
}

// Welke back-updatums blijven bewaard: de laatste BK_DAGEN dagelijkse, plus per maand de
// OUDSTE kopie van de laatste BK_MAANDEN maanden.
// Bewust 'oudste per maand' en niet 'die van de 1e': een overgeslagen trigger-run zou
// anders een maand definitief zonder maandback-up laten. Puur → los testbaar.
function bk_teBewaren(datums) {
  const op = datums.slice().sort();          // ISO-datums sorteren lexicaal correct
  const houd = {};
  op.slice(-BK_DAGEN).forEach(function (d) { houd[d] = true; });
  const perMaand = {};
  op.forEach(function (d) {
    const maand = d.slice(0, 7);
    if (!perMaand[maand]) perMaand[maand] = d;   // eerste = oudste, want oplopend gesorteerd
  });
  Object.keys(perMaand).sort().slice(-BK_MAANDEN).forEach(function (m) { houd[perMaand[m]] = true; });
  return houd;
}

// Ruimt op binnen ÉÉN map, alleen bestanden waarvan de naam exact past, en alleen met
// setTrashed — nooit hard verwijderen. De prullenbak geeft nog 30 dagen genadetijd.
function bk_ruimOp(map) {
  const gevonden = [], datums = [];
  const it = map.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const d = bk_datumUitNaam(f.getName());
    if (!d) continue;                        // vreemd bestand → met rust laten
    gevonden.push({ file: f, datum: d });
    datums.push(d);
  }
  const houd = bk_teBewaren(datums);
  let weg = 0;
  gevonden.forEach(function (g) {
    if (!houd[g.datum]) { g.file.setTrashed(true); weg++; }
  });
  return weg;
}

// Dagelijkse trigger. BEWUST niet in een try/catch: een doorgegooide fout levert Google's
// eigen storingsmail aan de eigenaar op, en dat is hier het alarm. Het cd_safeRun-idioom
// uit het gebonden project slokt fouten op naar Logger.log — dat is precies wat je bij een
// back-up NIET wilt.
function bk_dagelijks() {
  const map = DriveApp.getFolderById(BK_MAP_ID);
  const nu = new Date();
  DriveApp.getFileById(BK_BRON_ID).makeCopy(bk_naam(nu), map);
  const weg = bk_ruimOp(map);
  PropertiesService.getScriptProperties()
    .setProperty(BK_PROP, Utilities.formatDate(nu, 'Europe/Amsterdam', 'yyyy-MM-dd'));
  Logger.log('Back-up gemaakt: ' + bk_naam(nu) + ' — ' + weg + ' oude kopie(ën) naar de prullenbak');
}

// Hartslag: gooit een fout als er te lang geen geslaagde kopie is geweest. Ook dit is
// bewust een throw — 'geen bericht is goed nieuws' is geen bewaking.
function bk_controleer() {
  const laatst = PropertiesService.getScriptProperties().getProperty(BK_PROP);
  if (!laatst) throw new Error('Back-up: er is nog nooit een geslaagde kopie gemaakt.');
  const dagen = Math.floor((Date.now() - new Date(laatst + 'T00:00:00Z').getTime()) / 86400000);
  if (dagen > BK_MAX_OUD) {
    throw new Error('Back-up: laatste geslaagde kopie is ' + dagen + ' dagen oud (' + laatst + ').');
  }
  Logger.log('Back-up in orde — laatste geslaagde kopie: ' + laatst);
}

// Installeert beide triggers. Verwijdert eerst alleen de EIGEN triggers, zodat een
// tweede aanroep geen dubbele oplevert. Logger.log i.p.v. een UI-alert: in een los
// (niet-gebonden) project bestaat SpreadsheetApp.getUi() niet.
function bk_installeerTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'bk_dagelijks' || f === 'bk_controleer') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('bk_dagelijks').timeBased().atHour(2).nearMinute(15).everyDays(1).create();
  ScriptApp.newTrigger('bk_controleer').timeBased().atHour(8).nearMinute(0).everyDays(1).create();
  Logger.log('Triggers geïnstalleerd: bk_dagelijks (02:15), bk_controleer (08:00)');
}

// Handmatige zelftest van de pure functies. Draai deze vóór bk_installeerTriggers.
function bk_test() {
  const d = new Date(2026, 6, 28);
  Logger.log('naam:           ' + bk_naam(d));                         // ...2026-07-28 — NIET BEWERKEN
  Logger.log('datum terug:    ' + bk_datumUitNaam(bk_naam(d)));        // 2026-07-28
  Logger.log('vreemde naam:   ' + bk_datumUitNaam('Kopie van iets'));  // null
  Logger.log('bijna-naam:     ' + bk_datumUitNaam(BK_PREFIX + '2026-07-28'));  // null (staart mist)
  // 20 opeenvolgende dagen: 14 blijven als dagelijkse, plus de oudste van die maand → 15.
  const reeks = [];
  for (let i = 1; i <= 20; i++) reeks.push('2026-07-' + ('0' + i).slice(-2));
  const houd = Object.keys(bk_teBewaren(reeks)).sort();
  // Aantal komt uit de uitkomst zelf: een vast getal in de tekst kan liegen als de
  // bewaarregels veranderen, en dan lees je een verkeerde uitkomst als 'goed'.
  Logger.log('bewaard (' + houd.length + '): ' + JSON.stringify(houd));  // 15: 07-01 + 07-07 t/m 07-20
}
