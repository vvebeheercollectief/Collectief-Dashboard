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
  regels.push('');
  regels.push(stuk ? ('✗ ' + stuk + ' van de ' + totaal + ' bestanden parseert NIET')
                   : ('✓ alle ' + totaal + ' bestanden parseren'));
  return regels.join('\n');
}

run();
