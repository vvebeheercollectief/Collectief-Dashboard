// ══════════════════════════════════════
//  SYNTAXCHECK — leest élk .js- en .gs-bestand en laat de parser erop los
// ══════════════════════════════════════
//
//   osascript -l JavaScript tools/syntaxcheck.js
//
// WAAROM DIT BESTAAT. De zelftest draait in de browser, en een syntaxfout ín de zelftest zorgt er
// juist voor dat er NIETS draait: `?test=1` geeft dan nul asserts — niet één rode, gewoon niets, en
// `window._testResult` blijft leeg. Dat is precies één keer gebeurd (twee `catch`-regels achter
// elkaar op één `try`) en het kostte een halve middag, omdat 'nog bezig' in een tabblad op de
// achtergrond niet te onderscheiden is van 'stuk'. Deze controle duurt een seconde en zegt het
// meteen.
//
// Er staat geen Node op deze machine; `osascript -l JavaScript` gebruikt JavaScriptCore, dat op
// het punt van SYNTAXIS hetzelfde oordeelt als de browser en als Apps Script (allebei V8-klasse).
// `new Function(bron)` PARSEERT alleen — er wordt niets uitgevoerd, dus dit raakt geen bestand en
// geen Sheet.
//
// Wat het NIET doet: koppelingen tussen modules controleren (een import van iets dat niet
// geëxporteerd wordt), of gedrag. Daar is de zelftest voor. Dit is de poort ervóór.
ObjC.import('Foundation');

function lees(pad) {
  return $.NSString.stringWithContentsOfFileEncodingError($(pad), $.NSUTF8StringEncoding, null).js;
}

function bestanden(map, achtervoegsel) {
  var fm = $.NSFileManager.defaultManager;
  var namen = ObjC.deepUnwrap(fm.contentsOfDirectoryAtPathError($(map), null)) || [];
  return namen.filter(function (n) { return n.slice(-achtervoegsel.length) === achtervoegsel; });
}

// ES-modules kunnen niet als los blok geparseerd worden: `import`/`export` mag alleen op moduleniveau
// staan. Die regels eruit knippen zodat de parser de RÉST van het bestand wel te zien krijgt.
function zonderModuleRegels(bron) {
  return bron
    .replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+\{[\s\S]*?\};?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^(\s*)export\s+/gm, '$1');
}

function controleer(map, achtervoegsel, kaalMaken) {
  var fouten = [], aantal = 0;
  bestanden(map, achtervoegsel).forEach(function (naam) {
    aantal++;
    var bron = lees(map + naam);
    try { new Function(kaalMaken ? zonderModuleRegels(bron) : bron); }
    catch (e) { fouten.push('  FOUT  ' + naam + ' — ' + e.message); }
  });
  return { aantal: aantal, fouten: fouten };
}

// Vormcontrole op de Apps Script-bestanden. Deze kan NIET in de browsertoetsen: `apps-script` staat
// in de exclude-lijst van _config.yml, dus op de gepubliceerde site bestaat die map niet — en een
// fetch op een 404 gooit niet, hij levert de 404-pagina. De toets dáár las dus HTML en stond altijd
// groen. Hier lezen we de echte bestanden van schijf.
//
// `e.source.getActiveSheet()` geeft het tabblad dat vooraan STAAT, terwijl de rijnummers uit
// `e.range` komen: twee bronnen van waarheid voor één bewerking. Deze fout zat ooit in drie
// functies tegelijk omdat ze van elkaar overgeschreven zijn.
function vormcontroleGs(wortel) {
  var fouten = [];
  ['apps-script/', 'apps-script-klaarstaand/'].forEach(function (map) {
    bestanden(wortel + map, '.gs').forEach(function (naam) {
      lees(wortel + map + naam).split('\n').forEach(function (regel, i) {
        if (/^\s*(\/\/|\*)/.test(regel)) return;
        if (regel.indexOf('getActiveSheet()') > -1) {
          fouten.push('  VORM  ' + naam + ':' + (i + 1) + ' — getActiveSheet(); lees het tabblad uit e.range.getSheet()');
        }
      });
    });
  });
  return fouten;
}

// Gebruikt een module de gedeelde rij-regel zonder hem te IMPORTEREN? Dat is precies het gat dat
// dit gereedschap zelf openliet: `zonderModuleRegels` strípt de importregels voordat het parseert,
// dus een ontbrekende import parseert vrolijk door en slaat pas in de browser stuk — bij de eerste
// klik van een gebruiker, niet bij de controle. (Zo gebeurd in bundel-acties.js, gevonden door de
// browsertoetsen.) Een algemene 'gebruikt-maar-niet-gedefinieerd'-controle is werk voor een echte
// linter; deze doet alleen de vier namen uit src/rij.js — de regel waar élke mutatieweg op leunt.
function importcontroleRij(wortel) {
  var namen = ['rijIndex', 'verseRij', 'regelIndex', 'rijBestaatNog'], fouten = [];
  bestanden(wortel + 'src/', '.js').forEach(function (naam) {
    if (naam === 'rij.js') return;
    var bron = lees(wortel + 'src/' + naam);
    var heeftImport = /from\s*['"]\.\/rij\.js['"]/.test(bron);
    namen.forEach(function (fn) {
      // Geen lookbehind: de JavaScriptCore van Monterey kent `(?<!...)` niet en gooit dan een
      // SyntaxError over het hele gereedschap heen.
      if (new RegExp('(^|[^\\w.$])' + fn + '\\s*\\(').test(bron) && !heeftImport) {
        fouten.push('  IMPORT  ' + naam + ' gebruikt ' + fn + '() maar importeert niets uit ./rij.js');
      }
    });
  });
  return fouten;
}

function run() {
  var wortel = $.NSFileManager.defaultManager.currentDirectoryPath.js + '/';
  var groepen = [
    { naam: 'frontend (src/)',            map: wortel + 'src/',                    ext: '.js', kaal: true  },
    { naam: 'backend (apps-script/)',      map: wortel + 'apps-script/',            ext: '.gs', kaal: false },
    { naam: 'klaarstaand (niet uitgerold)', map: wortel + 'apps-script-klaarstaand/', ext: '.gs', kaal: false },
    { naam: 'service worker',              map: wortel,                             ext: 'sw.js', kaal: false },
  ];
  var regels = [], totaal = 0, stuk = 0;
  groepen.forEach(function (g) {
    var uit = controleer(g.map, g.ext, g.kaal);
    totaal += uit.aantal; stuk += uit.fouten.length;
    regels.push(uit.aantal + ' × ' + g.naam + (uit.fouten.length ? '  ← ' + uit.fouten.length + ' FOUT' : '  ok'));
    uit.fouten.forEach(function (f) { regels.push(f); });
  });
  var imp = importcontroleRij(wortel);
  regels.push(imp.length ? ('importcontrole rij.js  ← ' + imp.length + ' FOUT') : 'importcontrole rij.js  ok');
  imp.forEach(function (f) { regels.push(f); });
  stuk += imp.length;
  var vorm = vormcontroleGs(wortel);
  regels.push(vorm.length ? ('vormcontrole Apps Script  ← ' + vorm.length + ' FOUT') : 'vormcontrole Apps Script  ok');
  vorm.forEach(function (f) { regels.push(f); });
  stuk += vorm.length;
  regels.push('');
  regels.push(stuk ? ('✗ ' + stuk + ' bevinding(en) in de ' + totaal + ' bestanden')
                   : ('✓ alle ' + totaal + ' bestanden parseren en zijn van vorm in orde'));
  return regels.join('\n');
}

run();
