// ===== AUTO-PRIORITEIT — dagelijkse Sheet-update (alleen Oppakken) =====
// Hergebruikt cd_parseDate (Notifications.gs) en cd_schrijfLogboek (Extra functies.gs).
const AP_DEADLINE_COL = 3; // kolom D (0-geteld) = Deadline bij Oppakken
const AP_PRIO_COL     = 5; // kolom F (0-geteld) = Prioriteit bij Oppakken

// LET OP — SYNC: deze drempels (7/14) MOETEN gelijk blijven aan PRIO_REGELS.OPPAKKEN
// in src/util.js (stond tot de modularisatie in index.html). Alleen OPPAKKEN wordt server-side herberekend (enige sectie met een
// Prioriteit-kolom F). Voeg je hier ooit andere secties toe, neem dan ook hun eigen
// drempels over (Vergaderverzoeken 14/21, Offerte 21/42, LOD 90/240, Subsidie 14/45) —
// anders krijgen die secties stilletjes de Oppakken-grenzen.
// SUBSIDIE-TRAJECTEN blijft hier BEWUST buiten: AP_PRIO_COL wijst naar kolom F, en dat
// is bij die sectie de DEADLINE, geen prioriteit. Een herberekening zou de deadline
// overschrijven. Prioriteit voor subsidie leeft alleen live in het dashboard.
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
  // cd_lockedRun i.p.v. cd_safeRun: deze functie MUTEERT het blad en deed dat zonder slot, terwijl
  // elke andere schrijvende functie hier er wel een neemt. Draaide de opvolgmotor tegelijk (die
  // voegt rijen in en verwijdert ze), dan wezen de rijnummers uit de momentopname hieronder naar
  // andere taken en zette deze functie een prioriteit in de verkeerde rij. cd_lockedRun vangt de
  // fout net zo goed op als cd_safeRun, dus er gaat geen bescherming verloren.
  cd_lockedRun('cd_recalcPrioriteiten', () => {
    const sheet = SpreadsheetApp.getActive().getSheetByName('Nog Te Doen');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const today = new Date(); today.setHours(0,0,0,0);
    let inOppakken = false, updates = 0, overgeslagen = 0;
    for (let i = 0; i < data.length; i++) {
      const first = (data[i][0] || '').toString().trim().toUpperCase();
      if (['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN'].indexOf(first) !== -1) {
        inOppakken = (first === 'OPPAKKEN'); continue;
      }
      if (!inOppakken || !data[i][0]) continue;
      if (['VvE Code','VvE-Code'].indexOf((data[i][0]+'').trim()) !== -1) continue;
      try {
        const nieuw = ap_berekenPrio(data[i][AP_DEADLINE_COL], today);
        const huidig = (data[i][AP_PRIO_COL] || '').toString().trim();
        if (nieuw === huidig) continue;
        // Rij-controle vlak vóór het schrijven, zoals het dashboard die ook doet. De document-lock
        // houdt alleen ándere Apps Script-runs tegen; het dashboard schrijft via de Sheets-API en
        // loopt daar volledig buitenom. Verschoof een rij tussen de momentopname en dit moment, dan
        // zou hier de prioriteit van de ene taak in de rij van een andere belanden — en dat is aan
        // niets te zien. Eén extra celllezing per WIJZIGING (een handvol per dag), niet per rij.
        // Op IDENTITEIT en niet alleen op de VvE-code: één VvE heeft vaak meerdere taken in
        // dezelfde sectie — daar bestaat het vaste taaknummer in kolom Q juist voor — en dan laat
        // een vergelijking op kolom A een verschoven BUURRIJ van dezelfde VvE gewoon door. Exact
        // dezelfde controle als cd_escaleerStilleDossiers (Opvolging.gs) en cd_archiveerRij.
        const versRij = sheet.getRange(i + 1, 1, 1, Math.min(17, sheet.getMaxColumns())).getValues()[0];
        const codeNu = (versRij[0] || '').toString().trim();
        const nrNu   = (versRij[16] || '').toString().trim();
        const nrOud  = (data[i][16] || '').toString().trim();
        if (codeNu !== (data[i][0] || '').toString().trim() || nrNu !== nrOud) { overgeslagen++; continue; }
        sheet.getRange(i+1, AP_PRIO_COL+1).setValue(nieuw); updates++;
      } catch (rowErr) { Logger.log('cd_recalcPrioriteiten rij ' + (i + 1) + ' fout: ' + rowErr); }
    }
    Logger.log('Auto-prioriteit: ' + updates + ' taken bijgewerkt'
      + (overgeslagen ? ', ' + overgeslagen + ' overgeslagen (rij verschoven)' : ''));
    try { cd_schrijfLogboek('', '', 'Auto-prioriteit', '', '',
      'Bijgewerkt: ' + updates + (overgeslagen ? ' — ' + overgeslagen + ' overgeslagen omdat de rij verschoven was' : ''),
      'systeem'); } catch(e) {}
  });
}

function ap_installeerTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'cd_recalcPrioriteiten')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cd_recalcPrioriteiten').timeBased().atHour(6).everyDays(1).create();
  SpreadsheetApp.getUi().alert('✓ Dagelijkse auto-prioriteit (06:00) is ingesteld.');
}
