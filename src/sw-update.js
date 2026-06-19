// ══════════════════════════════════════
//  SERVICE WORKER — registratie + "nieuwe versie"-balk
// ══════════════════════════════════════

// Pure beslisregel: toon de herlaad-balk alleen als er al een actieve
// controller is (= dit is een UPDATE, geen eerste installatie).
export function shouldPromptReload(hasController) {
  return !!hasController;
}

let _userWantsReload = false;
let _reloading = false;

function toonUpdateBalk(onReload) {
  if (document.getElementById('sw-update-bar')) return; // nooit dubbel
  const bar = document.createElement('div');
  bar.id = 'sw-update-bar';
  bar.className = 'sw-update-bar';
  bar.innerHTML =
    '<span class="sw-update-txt">Er is een nieuwe versie van het dashboard.</span>'
    + '<button type="button" class="sw-update-btn" id="sw-update-reload">Herladen</button>'
    + '<button type="button" class="sw-update-x" id="sw-update-dismiss" aria-label="Sluiten">×</button>';
  document.body.appendChild(bar);
  document.getElementById('sw-update-reload').addEventListener('click', onReload);
  document.getElementById('sw-update-dismiss').addEventListener('click', () => bar.remove());
}

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // Nieuwe SW heeft overgenomen → eenmalig herladen naar verse code,
  // maar alléén als de gebruiker zelf op "Herladen" klikte (niet bij eerste claim).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!_userWantsReload || _reloading) return;
    _reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    const base = location.pathname.replace(/\/[^/]*$/, '') || '';
    navigator.serviceWorker.register(base + '/sw.js', {
      scope: base + '/',
      updateViaCache: 'none', // omzeil HTTP-cache (GitHub Pages) bij update-checks
    }).then(reg => {
      const vraagHerladen = () => {
        _userWantsReload = true;
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      };

      // Nieuwe versie gevonden tijdens deze sessie
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && shouldPromptReload(navigator.serviceWorker.controller)) {
            toonUpdateBalk(vraagHerladen);
          }
        });
      });

      // Er stond al een nieuwe versie klaar bij het laden van de pagina
      if (reg.waiting && shouldPromptReload(navigator.serviceWorker.controller)) {
        toonUpdateBalk(vraagHerladen);
      }

      // Periodiek + bij terugkeer naar het tabblad actief checken
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000); // elk half uur
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(e => console.warn('SW registratie mislukt:', e));
  });
}
