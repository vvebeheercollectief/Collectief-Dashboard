// Collectief Dashboard — Service Worker
// Verhoog versie bij elke nieuwe deploy zodat clients de nieuwe cache pakken.

// OneSignal draait BEWUST in deze service worker. Dat is geen keuze maar een gegeven: de SDK
// registreert 'sw.js?appId=…&sdkVersion=…' op basis van de workerName-instelling in hun eigen
// dashboard, en die is met de init-opties serviceWorkerPath/serviceWorkerParam niet te
// overrulen (op productie geverifieerd — een eigen bestand op een eigen bereik werd genegeerd).
// Een push komt dus hier binnen, en zonder deze regel is er niemand die hem tekent.
// LET OP de bestandsnaam: in v16 heet de worker OneSignalSDK.sw.js — het veelgeciteerde
// OneSignalSDKWorker.js geeft een 404 en zou de push stil kapot laten.
// In try/catch: is de CDN even onbereikbaar, dan mag dat de hele service worker (en daarmee
// de offline-schil van het dashboard) niet onderuithalen — dan vervalt alleen de push.
// De bijbehorende helft van de oplossing staat in src/sw-update.js: die neemt de bestaande
// registratie over in plaats van er een tweede naast te zetten.
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  console.warn('[sw] OneSignal-worker niet geladen, pushmeldingen uit:', e);
}
// Welk verzoek uit de cache komt (cache-first voor eigen bestanden), gedeeld met de zelftest.
// Lukt het laden niet, dan valt de handler hieronder terug op 'netwerk eerst' — het oude gedrag,
// dat in elk geval nooit oude code vasthoudt.
try {
  importScripts('./sw-strategie.js');
} catch (e) {
  console.warn('[sw] sw-strategie.js niet geladen, terug naar netwerk-eerst:', e);
}

// logo-login.png en src/urgentie.js stonden hier zonder gebruiker: het logo is bij het nieuwe
// loginscherm vervangen, en urgentie.js wordt alleen nog door de testsuite geïmporteerd. Beide
// werden bij iedereen meegedownload en gecached. De BESTANDEN blijven wél staan: src/tests.js
// hangt aan urgentie.js.
const CACHE_VERSION = 'cd-v169';
// Dezelfde waarde als APP_VERSION in src/config.js, en die wordt bij ELKE wijziging opgehoogd.
// Waarom hij hier staat: de browser besluit alleen dat er een nieuwe service worker is als het
// BESTAND sw.js verandert. Een uitrol die alleen src/ raakt liet sw.js dus ongemoeid, en dan
// verscheen de 'nieuwe versie'-balk niet — open sessies bleven de oude modules draaien tot iemand
// toevallig herlaadde. Met deze regel verandert sw.js altijd mee. Er staat een toets in tests.js
// die alarm slaat zodra dit getal en APP_VERSION uit elkaar lopen.
const APP_VERSION = '14.2';
// Geen './' meer: een navigatie naar de app krijgt altijd './index.html' uit de cache (zie
// sw-strategie.js), dus een tweede kopie onder de kale map was alleen een extra download.
const APP_SHELL = [
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png',
  './logo-sidebar.png',
  './beeldmerk-wit.svg',
  './logo-gestapeld-leisteen.svg',
  // ES-modulegraaf (zonder tests.js — alleen dev) zodat de app-shell ook offline laadt.
  './src/main.js',
  './src/sw-update.js',
  './src/versie.js',   // NIET versie.json zelf: dat komt altijd live (minimumversie-rem)
  './src/config.js',
  './allowed-emails.js',
  './src/state.js',
  './src/rij.js',
  './src/util.js',
  './src/icons.js',
  './src/api.js',
  './src/auth.js',
  './src/login-splash.js',
  './src/data.js',
  './src/structuurcheck.js',
  './src/actions.js',
  './src/ui.js',
  './src/anim.js',
  './src/modal-a11y.js',
  './src/bevestig.js',
  './src/palette.js',
  './src/crud.js',
  './src/bulk.js',
  './src/snooze.js',
  './src/inbehandeling.js',
  './src/dubbelcheck.js',
  './src/meervve.js',
  './src/verplaats.js',
  './src/kenmerken.js',
  './src/ai.js',
  './src/dossier-chat.js',
  './src/notifications.js',
  './src/render-lijsten.js',
  './src/subsidie-fase.js',
  './src/crm-fase.js',
  './src/render-offerte.js',
  './src/render-alv.js',
  './src/alv-reset.js',
  './src/render-tabel.js',
  './src/render-vve.js',
  './src/render-herhaal.js',
  './src/render-overig.js',
  './src/render-analytics.js',
  './src/offerte-aannemers.js',
  './src/modal-aannemers.js',
  './src/offerte-stappen.js',
  './src/vve-zoekveld.js',
  './src/weekkiezer.js',
  './src/opmaak.js',
  // Takenbundel. Alle drie horen tot de modulegraaf die main.js binnentrekt. De fetch-handler is
  // cache-first: wat hier ontbreekt wordt pas bij het eerste gebruik opgehaald, en bij 'eerste
  // bezoek en meteen offline' laadt de schil dan niet. De wachtpost in tests.js loopt de graaf af.
  './src/bundel.js',
  './src/bundel-acties.js',
  './src/render-bundel.js',
  // Eenmalige migratie v12.5. Wordt lazy geïmporteerd (alleen via de console-hulp), maar de wachtpost in tests.js
  // volgt óók dynamische imports — en terecht: een dynamische import is net zo goed een verzoek
  // dat bij 'eerste bezoek en meteen offline' niet uit de cache te beantwoorden valt.
  './src/migratie-offerte.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    // Per-resource cachen: één gemiste/hernoemd bestand mag de hele install niet laten falen
    // (anders blijft de oude SW hangen en komt een release nooit door).
    // `cache:'reload'`: langs de HTTP-cache heen. GitHub Pages geeft max-age=600; zonder deze
    // optie kon de NIEUWE cache gevuld worden met een tot tien minuten oude kopie uit de
    // HTTP-cache — oude modules in een nieuwe versie, en met cache-first blijven die dan staan.
    // Geen cache.add: die bewaart een doorverwezen antwoord ongewijzigd (zie schoon() hieronder).
    caches.open(CACHE_VERSION)
      .then(c => Promise.all(APP_SHELL.map(u => fetch(new Request(u, { cache: 'reload' }))
        .then(resp => { if (resp.ok) return c.put(u, schoon(resp)); })
        .catch(() => {}))))
  );
});

// De client vraagt de wachtende versie om actief te worden ("Herladen"-knop).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Een doorverwezen antwoord (Vercel cleanUrls: /index.html → /) schoonmaken; zie sw-strategie.js.
// Zonder strategie-bestand doen we het hier zelf, met dezelfde regel.
function schoon(resp) {
  if (typeof self.cdSchoonAntwoord === 'function') return self.cdSchoonAntwoord(resp);
  if (!resp || !resp.redirected) return resp;
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}

// Een goed antwoord in de cache van DEZE versie zetten. Bewust niet afwachten in de keten van de
// pagina: het antwoord gaat meteen door, het wegschrijven loopt erachteraan.
function bewaar(sleutel, resp) {
  if (!resp || !resp.ok) return;
  const kopie = schoon(resp.clone());
  caches.open(CACHE_VERSION).then(c => c.put(sleutel, kopie)).catch(() => {});
}

// Cache-first: eerst de cache van deze versie, bij een misser het netwerk (en dat dan bewaren).
// `sleutel` (optioneel) is de cachesleutel als die anders is dan het verzoek — bij een navigatie
// is dat altijd './index.html', welke query er ook achter de URL staat (?test=1).
// De misser gaat met cache:'no-cache' de deur uit: anders kon de HTTP-cache (GitHub Pages:
// max-age=600) een tot tien minuten oude kopie leveren, en die bleef dan de hele versie in de
// versiecache staan. Een paginamisser vraagt './index.html' zelf op (een navigatieverzoek is niet
// met andere opties na te bouwen). Elk antwoord wordt geschoond: een doorverwezen antwoord mag
// nooit op een navigatie terugkomen, ook niet uit een cache van vóór deze regel.
function uitCache(req, sleutel) {
  return caches.open(CACHE_VERSION)
    .then(c => c.match(sleutel || req))
    .then(hit => {
      if (hit) return schoon(hit);
      const netwerk = sleutel ? fetch(sleutel, { cache: 'no-cache' }) : fetch(new Request(req, { cache: 'no-cache' }));
      return netwerk.then(resp => { bewaar(sleutel || req, resp); return schoon(resp); });
    });
}

// Netwerk-eerst, de cache als vangnet. Alleen nog op een ontwikkelmachine (zie sw-strategie.js),
// of als sw-strategie.js niet geladen kon worden.
function netwerkEerst(req) {
  return fetch(req).then(resp => { bewaar(req, resp); return resp; }).catch(err =>
    caches.match(req).then(r => {
      if (r) return r;
      // index.html is alleen een goed antwoord op een PAGINA-verzoek. Op een gemiste module of
      // stylesheet leverde het HTML op waar JavaScript werd verwacht — een verwarrende
      // parseerfout in plaats van een eerlijke netwerkfout.
      if (req.mode === 'navigate') return caches.match('./index.html').then(schoon);
      throw err;
    }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  // Zonder strategie: alleen GET, en alleen het oude netwerk-eerst. Een POST (de chat-proxy) mag
  // nooit uit een cache beantwoord worden: hier stond ooit een regel die op ÉLK mislukt verzoek
  // de gecachete index.html teruggaf, mét status 200 — de aanroeper kreeg dan een SyntaxError.
  const soort = typeof self.cdSwStrategie === 'function'
    ? self.cdSwStrategie(req, self.location.href)
    : (req.method === 'GET' && new URL(req.url).origin === self.location.origin
       && !/\/versie\.json$/.test(new URL(req.url).pathname) ? 'netwerk' : 'live');   // versie.json: altijd live
  if (soort === 'live') return;   // Google, OneSignal, de proxy, POST: de browser doet het zelf
  if (soort === 'pagina') {
    e.respondWith(uitCache(req, './index.html').catch(() => caches.match('./index.html').then(schoon)));
    return;
  }
  if (soort === 'cache') { e.respondWith(uitCache(req)); return; }
  e.respondWith(netwerkEerst(req));
});
