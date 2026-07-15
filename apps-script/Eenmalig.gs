// ════════════════════════════════════════════════════════════
//  EENMALIGE ONDERHOUDSFUNCTIE (2026-07-15)
//  Bewust in een eigen bestand met maar één functie: die is dus altijd de standaard bij
//  'Uitvoeren', zodat de editor-functiekiezer nooit per ongeluk een andere functie draait.
//  One-off; wordt na gebruik weer verwijderd.
// ════════════════════════════════════════════════════════════

// ── Meldingen-reparatie ─────────────────────────────────────────────────────
// Herstelt handmatige fouten waarbij per abuis lege 'algemeen'-meldingen zijn geschreven
// (die duwden de tab over de 200-cap → de oudste regel 261006 Rijklof werd gesnoeid) en een
// echte regel (201063 Irisplein) is verwijderd. Verwijdert de lege junk-regel(s) en zet beide
// echte regels terug op hun oorspronkelijke chronologische plek. Content-gebaseerd én
// idempotent (presence-check), dus veilig om nogmaals te draaien.
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
