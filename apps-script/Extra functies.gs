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

// ── EENMALIG: 'Bewerkt'-regels opruimen (v6.3, 2026-07-15) ──────────────────
// Achtergrond: elke taak-opslag schreef een 'Bewerkt'-regel — 395 van de 1177 logregels,
// pure overzichtsvervuiling. De frontend logt ze sinds v6.3 niet meer en filtert ze bij het
// inlezen weg; deze functie ruimt de bestaande regels op.
//
// HANDMATIG DRAAIEN vanuit de Apps Script-editor. Geen trigger: de Run-klik is bewust het
// bevestigingsmoment, want verwijderen is onomkeerbaar (op het backup-tabblad na).
// Verwacht resultaat op PROD: 395 verwijderd, 782 over.
function cd_opschonenBewerkt() {
  return cd_withLock(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Logboek');
    if (!sheet) throw new Error("Tabblad 'Logboek' niet gevonden");

    const laatste = sheet.getLastRow();
    if (laatste < 2) { Logger.log('Logboek is leeg — niets te doen'); return; }

    // 1. Backup vóórdat we ook maar iets aanraken.
    const stempel = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd-HHmm');
    const backupNaam = 'Logboek backup ' + stempel;
    sheet.copyTo(ss).setName(backupNaam);
    Logger.log('Backup gemaakt: ' + backupNaam);

    // 2. Rijnummers van exact 'Bewerkt' verzamelen (kolom D = actie).
    //    Exact-match: 'Herhaalregel bewerkt' is een échte actie en moet blijven.
    const acties = sheet.getRange(2, 4, laatste - 1, 1).getValues();
    const teVerwijderen = [];
    for (let i = 0; i < acties.length; i++) {
      if (String(acties[i][0]).trim() === 'Bewerkt') teVerwijderen.push(i + 2);
    }
    Logger.log('Gevonden: ' + teVerwijderen.length + " regels 'Bewerkt' van " + (laatste - 1) + ' datarijen');
    if (!teVerwijderen.length) return { verwijderd: 0, over: laatste - 1, backup: backupNaam };

    // 3. Aaneengesloten blokken samenvoegen (395 rijen = 254 blokken) en van ONDER naar BOVEN
    //    verwijderen — andersom schuiven de rijnummers onder je weg.
    const blokken = [];
    for (let i = 0; i < teVerwijderen.length; i++) {
      const rij = teVerwijderen[i];
      const laatstBlok = blokken[blokken.length - 1];
      if (laatstBlok && rij === laatstBlok.start + laatstBlok.aantal) laatstBlok.aantal++;
      else blokken.push({ start: rij, aantal: 1 });
    }
    for (let i = blokken.length - 1; i >= 0; i--) {
      sheet.deleteRows(blokken[i].start, blokken[i].aantal);
    }

    const over = sheet.getLastRow() - 1;
    const res = { verwijderd: teVerwijderen.length, over: over, backup: backupNaam };
    Logger.log('Klaar: ' + JSON.stringify(res));
    return res;
  });
}

// ── EENMALIG: Meldingen-reparatie (2026-07-15) ──────────────────────────────
// Herstelt een handmatige fout: een lege 'algemeen'-melding werd per ongeluk geschreven
// (die duwde de tab over de 200-cap → de oudste regel 261006 Rijklof werd door de cap-logica
// gesnoeid) en daarna is per abuis nog een echte regel (201063 Irisplein) verwijderd.
// Deze functie: (1) verwijdert de lege junk-regel(s), (2) zet beide echte regels terug op hun
// oorspronkelijke chronologische plek. Idempotent (presence-check) én content-gebaseerd, dus
// veilig om nogmaals te draaien. HANDMATIG draaien vanuit de editor.
function cd_herstelMeldingen_20260715() {
  return cd_withLock(function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Meldingen');
    if (!sh) throw new Error("Tabblad 'Meldingen' niet gevonden");
    const voorDatarijen = sh.getLastRow() - 1;
    const acties = [];

    const kolomA = () => {
      const n = sh.getLastRow();
      return n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues().map(r => String(r[0]).trim());
    };
    const bevat = ts => kolomA().indexOf(ts) !== -1;
    const zetRij = (rij, waarden) => {
      sh.insertRowBefore(rij);
      sh.getRange(rij, 1).setNumberFormat('@');      // tijdstempel als tekst, niet als datum
      sh.getRange(rij, 1, 1, waarden.length).setValues([waarden]);
    };

    // 1) Lege junk-regels weg (type=algemeen, titel+inhoud leeg), van onder naar boven.
    const n = sh.getLastRow();
    const data = n < 2 ? [] : sh.getRange(2, 1, n - 1, 5).getValues();
    const junk = [];
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]).trim() === 'algemeen' && !String(data[i][2]).trim() && !String(data[i][3]).trim()) {
        junk.push(i + 2);
      }
    }
    for (let j = junk.length - 1; j >= 0; j--) sh.deleteRow(junk[j]);
    acties.push('junk verwijderd: ' + junk.length + (junk.length ? ' (rij ' + junk.join(',') + ')' : ''));

    // 2) Rijklof (18 juni) — was de oudste regel → terug op rij 2 (direct onder de koprij).
    const rijklof = ['2026-06-18T06:46:29.761Z', 'n_assigned', '➕ Toegewezen aan jou', '261006 · VvE Rijklof van Goensstraat 25-I/25-II/27', 'Cihad'];
    if (!bevat(rijklof[0])) { zetRij(2, rijklof); acties.push('Rijklof hersteld op rij 2'); }
    else acties.push('Rijklof al aanwezig — overgeslagen');

    // 3) Irisplein (29 juni) — direct ná de regel van 2026-06-29T10:13:33.414Z.
    const iris = ['2026-06-29T10:56:02.982Z', 'n_newtask', '📋 Nieuwe taak — oppakken', '201063 · VvE Irisplein 37/38/39 → Cihad', 'allen'];
    if (!bevat(iris[0])) {
      const idx = kolomA().indexOf('2026-06-29T10:13:33.414Z'); // 0-based binnen de datarijen
      const doelRij = idx === -1 ? sh.getLastRow() + 1 : (idx + 2) + 1;
      zetRij(doelRij, iris);
      acties.push('Irisplein hersteld op rij ' + doelRij);
    } else acties.push('Irisplein al aanwezig — overgeslagen');

    const res = { voor: voorDatarijen, na: sh.getLastRow() - 1, acties: acties };
    Logger.log('Meldingen-reparatie klaar: ' + JSON.stringify(res));
    return res;
  });
}
