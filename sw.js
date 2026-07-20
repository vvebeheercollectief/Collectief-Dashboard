// Collectief Dashboard — Service Worker
// Verhoog versie bij elke nieuwe deploy zodat clients de nieuwe cache pakken.

const CACHE_VERSION = 'cd-v68';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  // ES-modulegraaf (zonder tests.js — alleen dev) zodat de app-shell ook offline laadt.
  './src/main.js',
  './src/sw-update.js',
  './src/config.js',
  './allowed-emails.js',
  './src/state.js',
  './src/util.js',
  './src/icons.js',
  './src/urgentie.js',
  './src/render-vandaag.js',
  './src/api.js',
  './src/auth.js',
  './src/data.js',
  './src/actions.js',
  './src/ui.js',
  './src/anim.js',
  './src/palette.js',
  './src/crud.js',
  './src/bulk.js',
  './src/snooze.js',
  './src/kenmerken.js',
  './src/ai.js',
  './src/dossier-chat.js',
  './src/notifications.js',
  './src/render-lijsten.js',
  './src/render-offerte.js',
  './src/render-alv.js',
  './src/render-tabel.js',
  './src/render-vve.js',
  './src/render-herhaal.js',
  './src/render-overig.js',
  './src/render-analytics.js',
  './src/offerte-aannemers.js',
  './src/vve-zoekveld.js',
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
