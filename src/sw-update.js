// ══════════════════════════════════════
//  SERVICE WORKER — registratie + "nieuwe versie"-balk
// ══════════════════════════════════════
import { state } from "./state.js";

// Pure beslisregel: toon de herlaad-balk alleen als er al een actieve
// controller is (= dit is een UPDATE, geen eerste installatie).
export function shouldPromptReload(hasController) {
  return !!hasController;
}

// Kern van het herlaadgedrag, injecteerbaar voor tests. Twee harde regels
// (inlogstoring 22-07-2026):
//  1. De herlaad-wens is KORT houdbaar: alleen een klik die echt een wachtende
//     SW activeert armt de herlading, en na `klikTtl` vervalt die wens.
//     Voorheen bleef de vlag de hele vensterlevensduur staan; omdat sw.js bij
//     activatie clients.claim() doet, vuurt een "Herladen"-klik in een ÁNDER
//     venster ook hier een controllerchange af — met een blijven-hangen-vlag
//     herlaadde dit venster dan op een willekeurig later moment.
//  2. Nooit herladen terwijl een inlog/tokenvernieuwing loopt of er nog een
//     schrijfactie onderweg is: dan even wachten (met plafond). Een herlading
//     midden in de Google-inlog gooide het nog-niet-opgeslagen token weg en
//     zette de gebruiker terug op het inlogscherm.
export function maakHerlaadKern(deps = {}) {
  const d = {
    nu: () => Date.now(),
    herlaad: () => location.reload(),
    isBezet: () => (state._authBezig || 0) > 0 || (state.pendingWrites || 0) > 0,
    plan: (fn, ms) => setTimeout(fn, ms),
    klikTtl: 30_000,      // herlaad-wens vervalt 30 s na de klik
    wachtStap: 1000,      // poll-interval zolang de pagina bezet is
    maxWacht: 5 * 60_000, // na 5 min wachten opgeven (bezet-vlag hangt kennelijk)
    ...deps,
  };
  let armTs = 0, reloading = false;

  function arm(waiting) {
    armTs = d.nu();
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function klik(reg) {
    if (reg.waiting) { arm(reg.waiting); return 'gepost'; }
    // Nieuwe versie is nog aan het installeren → armen zodra hij klaarstaat.
    const inst = reg.installing;
    if (inst) {
      const zodraKlaar = () => {
        if (inst.state !== 'installed') return;
        inst.removeEventListener('statechange', zodraKlaar);
        if (reg.waiting) arm(reg.waiting);
      };
      inst.addEventListener('statechange', zodraKlaar);
      return 'wacht-op-install';
    }
    // Geen wachtende én geen installerende SW: de nieuwe versie is vermoedelijk al
    // door een ánder venster geactiveerd, dus dit venster wordt al door de nieuwe SW
    // bediend. Niets te armen — gewoon meteen herladen. Dat is precies wat de gebruiker
    // vroeg, en het is een eigen handeling in plaats van een herlading op een
    // willekeurig later moment (juist dát was de storing van 22-07-2026).
    probeerHerlaad(d.nu());
    return 'herlaad-direct';
  }

  function annuleer() { armTs = 0; }

  function probeerHerlaad(wachtBegin) {
    if (reloading) return;
    if (d.isBezet()) {
      if (d.nu() - wachtBegin > d.maxWacht) { armTs = 0; return; }
      d.plan(() => probeerHerlaad(wachtBegin), d.wachtStap);
      return;
    }
    reloading = true;
    d.herlaad();
  }

  function controllerChange() {
    if (!armTs || reloading) return;
    if (d.nu() - armTs > d.klikTtl) { armTs = 0; return; }
    probeerHerlaad(d.nu());
  }

  return { klik, annuleer, controllerChange, _gearmd: () => !!armTs };
}

function toonUpdateBalk(onReload, onDismiss) {
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
  document.getElementById('sw-update-dismiss').addEventListener('click', () => { bar.remove(); onDismiss(); });
}

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  const kern = maakHerlaadKern();

  // Nieuwe SW heeft overgenomen → eenmalig herladen naar verse code, maar alléén
  // als de gebruiker hier recent op "Herladen" klikte en de pagina niet bezet is
  // met een inlog of schrijfactie (zie maakHerlaadKern).
  navigator.serviceWorker.addEventListener('controllerchange', () => kern.controllerChange());

  window.addEventListener('load', () => {
    const base = location.pathname.replace(/\/[^/]*$/, '') || '';
    navigator.serviceWorker.register(base + '/sw.js', {
      scope: base + '/',
      updateViaCache: 'none', // omzeil HTTP-cache (GitHub Pages) bij update-checks
    }).then(reg => {
      const vraagHerladen = () => kern.klik(reg);
      const balk = () => toonUpdateBalk(vraagHerladen, () => kern.annuleer());

      // Nieuwe versie gevonden tijdens deze sessie
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && shouldPromptReload(navigator.serviceWorker.controller)) {
            balk();
          }
        });
      });

      // Er stond al een nieuwe versie klaar bij het laden van de pagina
      if (reg.waiting && shouldPromptReload(navigator.serviceWorker.controller)) {
        balk();
      }

      // Periodiek + bij terugkeer naar het tabblad actief checken
      const check = () => reg.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000); // elk half uur
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    }).catch(e => console.warn('SW registratie mislukt:', e));
  });
}
