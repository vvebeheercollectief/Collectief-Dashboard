// ===== AUTO-PRIORITEIT — dagelijkse Sheet-update (alleen Oppakken) =====
// Hergebruikt cd_parseDate (Notifications.gs) en cd_schrijfLogboek (Extra functies.gs).
const AP_DEADLINE_COL = 3; // kolom D (0-geteld) = Deadline bij Oppakken
const AP_PRIO_COL     = 5; // kolom F (0-geteld) = Prioriteit bij Oppakken

function ap_berekenPrio(dlVal, today) {
  if (!dlVal) return '';
  const dl = cd_parseDate(dlVal);
  if (!dl) return '';
  const d = new Date(dl.getFullYear(), dl.getMonth(), dl.getDate());
  const dagen = Math.round((d - today) / 86400000);
  if (dagen <= 7)  return 'Hoog';   // Oppakken: ≤7 dagen
  if (dagen <= 14) return 'Midden'; // ≤14 dagen
  return 'Laag';
}

function cd_recalcPrioriteiten() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('Nog Te Doen');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0,0,0,0);
  let inOppakken = false, updates = 0;
  for (let i = 0; i < data.length; i++) {
    const first = (data[i][0] || '').toString().trim().toUpperCase();
    if (['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD'].indexOf(first) !== -1) {
      inOppakken = (first === 'OPPAKKEN'); continue;
    }
    if (!inOppakken || !data[i][0]) continue;
    if (['VvE Code','VvE-Code'].indexOf((data[i][0]+'').trim()) !== -1) continue;
    const nieuw = ap_berekenPrio(data[i][AP_DEADLINE_COL], today);
    const huidig = (data[i][AP_PRIO_COL] || '').toString().trim();
    if (nieuw !== huidig) { sheet.getRange(i+1, AP_PRIO_COL+1).setValue(nieuw); updates++; }
  }
  Logger.log('Auto-prioriteit: ' + updates + ' taken bijgewerkt');
  try { cd_schrijfLogboek('', '', 'Auto-prioriteit', '', '', 'Bijgewerkt: ' + updates, 'systeem'); } catch(e) {}
}

function ap_installeerTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'cd_recalcPrioriteiten')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cd_recalcPrioriteiten').timeBased().atHour(6).everyDays(1).create();
  SpreadsheetApp.getUi().alert('✓ Dagelijkse auto-prioriteit (06:00) is ingesteld.');
}
