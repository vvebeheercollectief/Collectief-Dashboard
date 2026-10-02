// ===== AUTO-PRIORITEIT — UITGEZET (2026-10-02) =====
// Deze functie schreef elke ochtend ±06:00 de prioriteit (Hoog/Midden/Laag) in kolom F van het
// blok Oppakken, plus een 'systeem'-regel 'Auto-prioriteit' in het Logboek.
//
// Niemand leest die kolom nog. Nagelopen op 2026-10-02:
//  · het dashboard rekent de prioriteit sinds v8.9 LIVE uit de deadline uit (berekenPrioriteit in
//    src/util.js — de tabel, het prioriteitsfilter en de sortering); de Prioriteit-kolom staat niet
//    meer in beeld (prioBadge in src/util.js: 'NIET IN GEBRUIK');
//  · de enige frontend-plek die r.prioriteit aanraakt is de bulk-deadlinewijziging (src/bulk.js),
//    en die SCHRIJFT F alleen mee (en zet bij ongedaan maken de oude waarde terug) — hij leest hem
//    niet om iets te beslissen. Het bewerkscherm schrijft F ook bij elke opslag van een Oppakken-taak;
//  · in de backend las niets anders kolom F.
// De dagelijkse herberekening was dus alleen nog een schrijfactie op elke Oppakken-rij die de
// lock vasthield vlak vóór de opvolgmotor (06:30), plus een logregel per dag.
//
// De trigger staat in het script-project en niet in de repo, dus deze functie moet blijven
// bestaan (anders faalt de trigger elke ochtend met 'functie niet gevonden'). Hij doet niets
// meer en ruimt bij de eerste aanroep zijn eigen trigger op. Lukt dat niet (rechten), dan blijft
// hij gewoon een lege aanroep — onschuldig.
// Terugzetten? Haal de vorige versie uit git (commit vóór 2026-10-02) en draai ap_installeerTrigger.
function cd_recalcPrioriteiten() {
  try {
    ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === 'cd_recalcPrioriteiten'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  } catch (e) { Logger.log('cd_recalcPrioriteiten: eigen trigger niet opgeruimd: ' + e); }
}

// Installeerde vroeger de dagelijkse trigger. Nu alleen nog het omgekeerde: haalt hem weg, voor
// wie dat met de hand vanuit de editor wil doen.
function ap_installeerTrigger() {
  cd_recalcPrioriteiten();
  Logger.log('Auto-prioriteit staat uit; de trigger is (voor zover aanwezig) verwijderd.');
}
