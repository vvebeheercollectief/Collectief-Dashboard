/**
 * ══════════════════════════════════════
 *  MAIL-INTAKE — DEEL C: de motor
 * ══════════════════════════════════════
 *
 * Leest de post op info@, laat Claude bepalen wat het is, en maakt er een taak van via de
 * bestaande cd_createTaskRow. Deel A (taak aanmaken) en Deel B (beheer-playbook.md) waren al af;
 * dit is het stuk dat ertussen zat.
 *
 * ── STAAT STANDAARD UIT ─────────────────────────────────────────────────────────────────────
 * Deze motor doet NIETS totdat de scripteigenschap `MAILINTAKE_AAN` bestaat. Drie standen:
 *
 *   (niet gezet)  → uit. `cd_mailIntakeRonde` keert meteen terug. Dit is de stand na uitrol.
 *   'proef'       → leest de post en schrijft in het uitvoeringslogboek wat hij ZOU doen.
 *                   Er wordt geen taak aangemaakt, geen label gezet, geen mail aangeraakt.
 *   'ja'          → doet het echt.
 *
 * Zo kan de code gewoon meelopen met elke uitrol zonder dat er ook maar één mail verwerkt wordt,
 * en kan de eigenaar hem op een zelfgekozen moment aanzetten — eerst een week op 'proef'.
 *
 * ── WAT ER NOG GEREGELD MOET WORDEN VOORDAT DIT AAN KAN ─────────────────────────────────────
 * 1. Een Gmail-postvak dat dit script mag lezen. Het script draait onder het account waarmee de
 *    Sheet is aangemaakt; dat account moet een écht Gmail-postvak hebben met de post van info@
 *    erin. Komt de post ergens anders binnen, dan is er eerst een doorstuurregel nodig.
 * 2. Één keer toestemming geven. De eerste keer dat een functie hieronder handmatig wordt
 *    gedraaid, vraagt Google om toegang tot Gmail. Zonder die klik draait er niets.
 * 3. Een label 'verwerkt' in Gmail (het script maakt hem aan als hij ontbreekt).
 * 4. Een scripteigenschap `ANTHROPIC_API_KEY` met een sleutel die een uitgavenplafond heeft.
 * 5. Een tijd-trigger op `cd_mailIntakeRonde` (voorstel: elke 5 minuten). Bewust NIET automatisch
 *    aangemaakt: een trigger zetten is het moment waarop dit echt gaat draaien, en dat is een
 *    beslissing van de eigenaar, niet van een uitrol.
 *
 * ── WAT HIJ IN VERSIE 1 WEL EN NIET DOET ────────────────────────────────────────────────────
 * WEL:  een taak aanmaken in OPPAKKEN of LOD, met VvE, omschrijving en deadline uit het playbook.
 * NIET: concept-antwoorden schrijven (aparte brok werk, eigen risico), en niet de drie andere
 *       categorieën. Vergaderverzoeken, offertes en subsidies hebben hun omschrijving in een
 *       andere kolom; die weg is nu wél gerepareerd (CD_OMSCHRIJVING_COL in Notifications.gs)
 *       maar nog niet met echte post beproefd. Alles wat daarop lijkt wordt OPPAKKEN met
 *       '🔎 controleren' ervoor — zichtbaar, en niemand hoeft te raden waarom.
 */

var CD_MI_LABEL       = 'verwerkt';
var CD_MI_MAX_PER_RONDE = 10;      // rem: één ronde mag nooit de hele inbox leegtrekken
var CD_MI_MODEL       = 'claude-haiku-4-5-20251001';
var CD_MI_CATEGORIEEN = ['OPPAKKEN', 'LOD'];

/** De stand van de schakelaar: '', 'proef' of 'ja'. */
function cd_mailIntakeStand() {
  var v = PropertiesService.getScriptProperties().getProperty('MAILINTAKE_AAN');
  v = (v || '').toString().trim().toLowerCase();
  return (v === 'ja' || v === 'proef') ? v : '';
}

function cd_mailIntakeApiKey() {
  var k = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!k) throw new Error('ANTHROPIC_API_KEY ontbreekt in Script Properties.');
  return k;
}

/**
 * Eén ronde. Dit is de functie waar straks de tijd-trigger aan hangt.
 * Vangt zijn eigen fouten af: een trigger die gooit, blijft in de foutstatistiek staan en stuurt
 * elke keer een mail — en één onleesbare mail mag de rest van de ronde niet meenemen.
 */
function cd_mailIntakeRonde() {
  var stand = cd_mailIntakeStand();
  if (!stand) return;                       // uit — dit is de stand na uitrol
  var proef = (stand === 'proef');

  var label = GmailApp.getUserLabelByName(CD_MI_LABEL);
  if (!label && !proef) label = GmailApp.createLabel(CD_MI_LABEL);

  // Alleen wat nog niet verwerkt is. De zoekopdracht doet het werk, niet een lus over alles:
  // 'in:inbox -label:verwerkt' laat Gmail de selectie maken en houdt de ronde kort.
  var draden = GmailApp.search('in:inbox -label:' + CD_MI_LABEL, 0, CD_MI_MAX_PER_RONDE);
  if (!draden.length) return;

  var vves = cd_mailIntakeVveLijst();
  var gedaan = 0, overgeslagen = 0;

  for (var i = 0; i < draden.length; i++) {
    try {
      var berichten = draden[i].getMessages();
      var m = berichten[berichten.length - 1];      // het laatste bericht in de draad
      var uitslag = cd_mailIntakeClassificeer(m, vves);
      if (!uitslag || !uitslag.vve_code) {
        // Geen VvE herkend: niets aanmaken en NIET labelen, zodat een mens hem nog ziet staan.
        Logger.log('[mail-intake] overgeslagen (geen VvE herkend): ' + m.getSubject());
        overgeslagen++;
        continue;
      }
      var categorie = (CD_MI_CATEGORIEEN.indexOf(uitslag.categorie) > -1) ? uitslag.categorie : 'OPPAKKEN';
      var omschrijving = uitslag.omschrijving || m.getSubject() || 'Bericht via mail';
      // Twijfel of een categorie die versie 1 niet aanmaakt: zichtbaar markeren in plaats van
      // stilzwijgend ergens neerzetten.
      if (uitslag.twijfel || uitslag.categorie !== categorie) omschrijving = '🔎 controleren — ' + omschrijving;

      // De VvE-code moet in de ECHTE lijst staan. Het model kan een code verzinnen, en een taak
      // onder een niet-bestaande code staat wel in de lijst maar hoort bij geen enkel dossier —
      // en niets in het dashboard geeft daar ooit een signaal over. Dan liever laten staan.
      var bekend = false;
      for (var v = 0; v < vves.length; v++) if (vves[v].code === uitslag.vve_code) { bekend = true; break; }
      if (!bekend) {
        Logger.log('[mail-intake] overgeslagen (onbekende VvE-code ' + uitslag.vve_code + '): ' + m.getSubject());
        overgeslagen++;
        continue;
      }

      if (proef) {
        Logger.log('[mail-intake PROEF] zou aanmaken: ' + categorie + ' | ' + uitslag.vve_code +
                   ' | ' + omschrijving + ' | deadline ' + (uitslag.deadline || '-') +
                   ' | onderwerp: ' + m.getSubject());
        gedaan++;
        continue;
      }

      // `cd_lockedRun` verwacht (label, functie). Met één argument is `fn` undefined, gooit
      // `return fn()`, en vangt cd_lockedRun zijn eigen fout op — dan wordt er GEEN taak
      // aangemaakt terwijl de logregel en het label er wél komen. De mail verdwijnt dan uit de
      // inbox en komt nooit terug: drie keer een onwaarheid uit één stille fout, precies wat op
      // deze codebase al eens is dichtgemetseld (zie het create_task-event in Notifications.gs).
      // En daarom hieronder ook de UITKOMST toetsen: het document-slot kan gewoon bezet zijn,
      // en dan geeft cd_lockedRun stil `undefined` terug.
      var rij = cd_lockedRun('mail-intake', function () {
        return cd_createTaskRow(categorie, uitslag.vve_code, uitslag.vve_naam || '', omschrijving,
                                '', uitslag.deadline || '');
      });
      if (!rij) {
        Logger.log('[mail-intake] taak NIET aangemaakt (slot bezet of fout) — mail blijft staan: ' + m.getSubject());
        overgeslagen++;
        continue;
      }
      // Pas nu het journaal en het label. Zevende argument = de gebruiker; zonder dat staat er
      // 'Iemand' in het Logboek en in het VvE-dossier, en is niet te zien dat de robot het deed.
      cd_schrijfLogboek(uitslag.vve_code, categorie, 'Aangemaakt', 'mail-intake', '',
                        m.getSubject() || '', 'mail-intake');
      // En een regel in het Meldingen-tabblad, zodat het team ziet dát er iets is bijgekomen.
      // Bewust GEEN pushbericht: deze motor kan tien taken per ronde neerzetten en dan is een
      // push per stuk geen signaal meer maar ruis. Stilte is echter net zo fout — dan zet de
      // robot werk neer dat niemand opmerkt.
      cd_schrijfMelding('newtask', 'Nieuwe taak uit de mail',
                        uitslag.vve_code + ' — ' + omschrijving, 'allen');
      draden[i].addLabel(label);
      gedaan++;
    } catch (e) {
      // Eén stukgelopen bericht mag de ronde niet stoppen; hij blijft ongelabeld staan en komt
      // volgende ronde vanzelf terug.
      Logger.log('[mail-intake] fout bij een bericht: ' + e);
      overgeslagen++;
    }
  }
  Logger.log('[mail-intake] ronde klaar (' + stand + '): ' + gedaan + ' verwerkt, ' +
             overgeslagen + ' overgeslagen.');
}

/**
 * De VvE-lijst waarmee de AI een code kan herkennen: kolom A (code) en B (naam) van
 * "ALV's overzicht" — hetzelfde tabblad dat het dashboard voor zijn VvE-kiezer gebruikt.
 */
function cd_mailIntakeVveLijst() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ALV's overzicht");
  if (!sh) return [];
  var laatste = Math.max(sh.getLastRow(), 1);
  var waarden = sh.getRange(1, 1, laatste, 2).getValues();
  var uit = [];
  for (var i = 0; i < waarden.length; i++) {
    var code = (waarden[i][0] || '').toString().trim();
    var naam = (waarden[i][1] || '').toString().trim();
    if (/^\d{4,}$/.test(code)) uit.push({ code: code, naam: naam });
  }
  return uit;
}

/**
 * Eén bericht door het model halen. Geeft {vve_code, vve_naam, categorie, omschrijving,
 * deadline, twijfel} terug, of null als er niets bruikbaars uitkomt.
 *
 * De regels staan NIET hier maar in beheer-playbook.md; die tekst gaat mee als instructie. Zo
 * onderhoudt de beheerder het gedrag zonder code aan te raken — dat was de hele opzet van Deel B.
 */
function cd_mailIntakeClassificeer(bericht, vves) {
  var playbook = cd_mailIntakePlaybook();
  var lijst = vves.slice(0, 400).map(function (v) { return v.code + ' = ' + v.naam; }).join('\n');
  var body = (bericht.getPlainBody() || '').slice(0, 6000);
  var prompt =
    'Je bent de intake-assistent van een VvE-beheerkantoor. Hieronder staat het playbook met de ' +
    'regels, daarna de lijst met bekende VvE\'s, daarna één e-mail.\n\n' +
    '=== PLAYBOOK ===\n' + playbook + '\n\n' +
    '=== BEKENDE VvE\'s (code = naam) ===\n' + lijst + '\n\n' +
    '=== E-MAIL ===\nVan: ' + bericht.getFrom() + '\nOnderwerp: ' + bericht.getSubject() +
    '\nDatum: ' + bericht.getDate() + '\n\n' + body + '\n\n' +
    '=== OPDRACHT ===\nAntwoord met UITSLUITEND geldige JSON, zonder uitleg eromheen:\n' +
    '{"vve_code":"","vve_naam":"","categorie":"OPPAKKEN|VERGADERVERZOEKEN|OFFERTE-TRAJECTEN|LOD",' +
    '"omschrijving":"","deadline":"dd-mm-jjjj of leeg","twijfel":true|false}\n' +
    'De omschrijving is één korte regel in het Nederlands die zegt wat er moet gebeuren. ' +
    'Weet je de VvE niet zeker, laat vve_code dan LEEG en zet twijfel op true.';

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': cd_mailIntakeApiKey(), 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: CD_MI_MODEL, max_tokens: 500,
                              messages: [{ role: 'user', content: prompt }] }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 300) {
    Logger.log('[mail-intake] model-fout ' + resp.getResponseCode() + ': ' + resp.getContentText());
    return null;
  }
  var data = JSON.parse(resp.getContentText());
  var tekst = (data.content && data.content[0] && data.content[0].text) || '';
  // Het model kan er per ongeluk tekst omheen zetten; pak het eerste JSON-blok.
  var m = tekst.match(/\{[\s\S]*\}/);
  if (!m) { Logger.log('[mail-intake] geen JSON in antwoord: ' + tekst.slice(0, 200)); return null; }
  try { return JSON.parse(m[0]); }
  catch (e) { Logger.log('[mail-intake] JSON onleesbaar: ' + e); return null; }
}

/**
 * Het playbook. Het staat als bestand in de repo (beheer-playbook.md) maar Apps Script kan daar
 * niet bij; daarom komt de tekst uit een scripteigenschap `BEHEER_PLAYBOOK`. Ontbreekt die, dan
 * draait de intake NIET op een halve instructie maar stopt hij met een duidelijke fout.
 */
function cd_mailIntakePlaybook() {
  var t = PropertiesService.getScriptProperties().getProperty('BEHEER_PLAYBOOK');
  if (!t) throw new Error('BEHEER_PLAYBOOK ontbreekt in Script Properties — plak daar de inhoud ' +
                          'van beheer-playbook.md in. Zonder de regels mag de intake niet draaien.');
  return t;
}

/** Handmatig één proefronde draaien, ongeacht de schakelaar. Verandert niets. */
function test_mailIntakeProef() {
  var props = PropertiesService.getScriptProperties();
  var oud = props.getProperty('MAILINTAKE_AAN');
  props.setProperty('MAILINTAKE_AAN', 'proef');
  try { cd_mailIntakeRonde(); }
  finally { if (oud === null) props.deleteProperty('MAILINTAKE_AAN'); else props.setProperty('MAILINTAKE_AAN', oud); }
}
