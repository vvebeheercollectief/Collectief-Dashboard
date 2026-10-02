// ══════════════════════════════════════
//  SW-STRATEGIE — welk verzoek komt uit de cache, welk van het netwerk
// ══════════════════════════════════════
// Gedeeld door sw.js (importScripts) en de zelftest (tests.js laadt dit bestand als gewone
// <script>, want sw.js zelf is in een pagina niet uit te voeren). Daarom een klassiek script dat
// één functie op `self` zet — in de service worker is dat de worker, in de pagina het venster.
//
// WAAROM CACHE-FIRST (meting 2026-10-02). De service worker vroeg elk eigen bestand eerst aan het
// netwerk. GitHub Pages geeft max-age=600, dus na tien minuten werd bij ELKE start de hele
// modulegraaf (~55 bestanden, in een keten van vier rondreizen: index → main.js → imports →
// imports) opnieuw gevalideerd, en elk antwoord daarna nog eens ~1,3 MB in de cache gezet.
// Nu komen de eigen bestanden uit de cache van DEZE versie (CACHE_VERSION in sw.js). Een nieuwe
// versie komt binnen als een nieuwe service worker (sw.js verandert bij elke uitrol mee, zie
// APP_VERSION daar) en wordt actief via de 'nieuwe versie'-balk (src/sw-update.js).
// GEVOLG VOOR UITROLLEN: een wijziging zonder opgehoogde CACHE_VERSION/APP_VERSION in sw.js komt
// bij bestaande gebruikers NIET aan. De toets in tests.js bewaakt dat APP_VERSION gelijk loopt.
//
// Uitkomst:
//   'live'    — de service worker bemoeit zich er niet mee (Google, OneSignal, de chat-proxy,
//               alles wat geen GET is, en sw.js zelf);
//   'pagina'  — een navigatie naar de app: altijd de gecachete index.html van deze versie, zodat
//               HTML en JavaScript gegarandeerd van dezelfde uitrol zijn;
//   'cache'   — eerst de cache, bij een misser het netwerk (en dan in de cache);
//   'netwerk' — eerst het netwerk, de cache alleen als vangnet. Alleen op een ontwikkelmachine
//               (localhost/127.0.0.1): daar serveert de no-store-server steeds verse bestanden en
//               zou een cache-first worker bewerkte code verbergen tot de volgende versie.
(function (g) {
  // Chart.js: een vast versienummer in de URL, dus onveranderlijk — die mag gewoon uit de cache.
  var CHART = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
  var DEV = { 'localhost': 1, '127.0.0.1': 1 };
  g.cdSwStrategie = function (verzoek, swUrl) {
    if (!verzoek || verzoek.method !== 'GET') return 'live';
    var url, sw;
    try { url = new URL(verzoek.url); sw = new URL(swUrl); } catch (_) { return 'live'; }
    if (url.origin !== sw.origin) return url.href === CHART ? 'cache' : 'live';
    if (DEV[sw.hostname]) return 'netwerk';
    var basis = sw.pathname.replace(/[^/]*$/, '');          // de map van sw.js = het bereik
    if (url.pathname.indexOf(basis) !== 0) return 'live';
    var rest = url.pathname.slice(basis.length);
    if (rest === 'sw.js' || rest === 'sw-strategie.js') return 'live';
    if (verzoek.mode === 'navigate' && (rest === '' || rest === 'index.html')) return 'pagina';
    return 'cache';
  };

  // Een antwoord dat via een DOORVERWIJZING binnenkwam, schoon maken voor de cache. Vercel staat op
  // cleanUrls (vercel.json): /index.html geeft een 308 naar /. Het antwoord daarop draagt
  // `redirected: true`, en zo'n antwoord teruggeven op een navigatie (die altijd met
  // redirect-modus 'manual' loopt) WEIGERT de browser — de app laadde dan niet meer op Vercel en
  // staging. Een nieuw Response met dezelfde inhoud, status en koppen is niet 'redirected'.
  g.cdSchoonAntwoord = function (resp) {
    if (!resp || !resp.redirected) return resp;
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
  };
})(self);
