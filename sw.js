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

// logo-login.png en src/urgentie.js stonden hier zonder gebruiker: het logo is bij het nieuwe
// loginscherm vervangen, en urgentie.js wordt alleen nog door de testsuite geïmporteerd. Beide
// werden bij iedereen meegedownload en gecached. De BESTANDEN blijven wél staan: src/tests.js
// hangt aan urgentie.js.
const CACHE_VERSION = 'cd-v119';
const APP_SHELL = [
  './',
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
  './src/config.js',
  './allowed-emails.js',
  './src/state.js',
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
  './src/kenmerken.js',
  './src/ai.js',
  './src/dossier-chat.js',
  './src/notifications.js',
  './src/render-lijsten.js',
  './src/subsidie-fase.js',
  './src/render-offerte.js',
  './src/render-alv.js',
  './src/alv-reset.js',
  './src/render-tabel.js',
  './src/render-vve.js',
  './src/render-herhaal.js',
  './src/render-overig.js',
  './src/render-analytics.js',
  './src/offerte-aannemers.js',
  './src/vve-zoekveld.js',
  './src/opmaak.js',
  // Takenbundel. Alle drie horen tot de modulegraaf die main.js binnentrekt, dus zonder deze
  // regels laadt de schil niet bij 'eerste bezoek en meteen offline' — de fetch-handler is
  // network-first en vult de cache pas ná een geslaagde ophaal, en die is er dan juist niet.
  './src/bundel.js',
  './src/bundel-acties.js',
  './src/render-bundel.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    // Per-resource cachen: één gemiste/hernoemd bestand mag de hele install niet laten falen
    // (anders blijft de oude SW hangen en komt een release nooit door).
    caches.open(CACHE_VERSION)
      .then(c => Promise.all(APP_SHELL.map(u => c.add(u).catch(() => {}))))
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

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Google Sheets / Google Auth — altijd live (network only).
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com') || url.hostname.includes('gstatic.com')) {
    return; // laat de browser dit zelf afhandelen
  }
  // App-shell: network first met fallback naar cache.
  e.respondWith(
    fetch(e.request).then(resp => {
      // Stop succesvolle GET-responses in cache
      if (e.request.method === 'GET' && resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
