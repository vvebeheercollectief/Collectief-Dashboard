// ══════════════════════════════════════
//  SERVICE WORKER — registratie + "nieuwe versie"-balk
// ══════════════════════════════════════
import { state } from "./state.js";

// Pure beslisregel: toon de herlaad-balk alleen als er al een actieve
// controller is (= dit is een UPDATE, geen eerste installatie).
export function shouldPromptReload(hasController) {
  return !!hasController;
}

// Wijzen twee service-worker-URL's naar HETZELFDE bestand? Query en hash tellen niet mee.
// Nodig omdat OneSignal ons eigen sw.js registreert met een query erachter:
//     sw.js?appId=…&sdkVersion=…
// Puur, dus los testbaar.
export function zelfdeWorker(a, b) {
  if (!a || !b) return false;
  try { return new URL(a, 'https://x/').pathname === new URL(b, 'https://x/').pathname; }
  catch (_) { return false; }
}

// Pak de registratie die er al staat als die naar hetzelfde bestand wijst; registreer anders zelf.
//
// WAAROM (storing 2026-08-06, twee keer misbegrepen voor het klopte): per bereik bestaat er maar
// ÉÉN service-worker-registratie. OneSignal registreert `sw.js?appId=…&sdkVersion=…` op ons
// bereik — die bestandsnaam komt uit hun eigen dashboard-instelling en is met de init-opties
// serviceWorkerPath/serviceWorkerParam NIET te overrulen (op productie geverifieerd: ook met een
// eigen pad en eigen scope bleef hun registratie `sw.js` op ons bereik). Registreerden wij daar
// de kale URL naast, dan verdrongen die twee elkaar om beurten en bleef er telkens een WACHTENDE
// versie staan — precies wat updatefound/reg.waiting hieronder als "nieuwe versie" ziet. Gevolg:
// de balk kwam na élke herlading terug. Nemen we de bestaande registratie over, dan is er niets
// om over te vechten en blijft de update-controle gewoon werken (reg.update() haalt hetzelfde
// bestand op).
function pakRegistratie(swPad, scope) {
  if (!navigator.serviceWorker.getRegistration) {
    return navigator.serviceWorker.register(swPad, { scope, updateViaCache: 'none' });
  }
  return navigator.serviceWorker.getRegistration(scope).then(bestaand => {
    const huidig = bestaand && (bestaand.active || bestaand.waiting || bestaand.installing);
    if (huidig && zelfdeWorker(huidig.scriptURL, swPad)) return bestaand;
    return navigator.serviceWorker.register(swPad, { scope, updateViaCache: 'none' });
  });
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

  return { klik, annuleer, controllerChange, isBezet: () => d.isBezet(), _gearmd: () => !!armTs };
}

// Hoe lang 'Bezig…' mag blijven staan voordat de knop zich weer aanbiedt. Ruim boven een normale
// herlading (die is er binnen een seconde) en boven de tijd die een schrijfactie kost.
// 35 en niet 25 seconden: de KERN houdt een klik 30 seconden gearmd (klikTtl in maakHerlaadKern).
// Met 25 sprak de wachthond dus terwijl de wens nog gewoon geldig was — hij meldde 'het herladen
// kwam niet door', en vijf seconden later herlaadde de pagina alsnog, onaangekondigd. Deze grens
// hoort per definitie ná die van de kern te liggen.
const HERLAAD_WACHTHOND_MS = 35_000;

// Puur (testbaar): hoort de balk er (weer) te staan? Tabblad zichtbaar, een wachtende nieuwe
// versie, en die nieuwe versie is een ÉCHTE update (zie shouldPromptReload).
export function balkWeerTonen(verborgen, reg, controller) {
  return !verborgen && !!(reg && reg.waiting) && shouldPromptReload(controller);
}

// Puur (testbaar): een nieuwe service worker nam dit tabblad over ZONDER dat hier op 'Herladen' is
// geklikt — een ánder venster klikte (sw.js doet clients.claim()). Dit tabblad draait dan nog de
// oude code, terwijl alles wat het vanaf nu nog ophaalt (een lui geladen module) uit de cache van
// de NIEUWE versie komt. Er staat dan geen wachtende versie meer, dus `balkWeerTonen` zou zwijgen.
// Sinds de eigen bestanden cache-first komen is de balk de enige weg naar nieuwe code; dan hoort
// hij hier dus te staan. Niet bij de allereerste installatie (er was nog geen controller).
export function balkNaOvername(gearmd, hadController) {
  return !gearmd && !!hadController;
}

function toonUpdateBalk(onReload, onDismiss, isBezet) {
  if (document.getElementById('sw-update-bar')) return; // nooit dubbel
  const bar = document.createElement('div');
  bar.id = 'sw-update-bar';
  bar.className = 'sw-update-bar';
  bar.innerHTML =
    '<span class="sw-update-txt">Er is een nieuwe versie van het dashboard.</span>'
    + '<button type="button" class="sw-update-btn" id="sw-update-reload">Herladen</button>'
    + '<button type="button" class="sw-update-x" id="sw-update-dismiss" aria-label="Sluiten">×</button>';
  document.body.appendChild(bar);
  const knop = document.getElementById('sw-update-reload');
  const tekst = bar.querySelector('.sw-update-txt');
  knop.addEventListener('click', () => {
    // Zichtbare bevestiging. Het herladen kan even uitgesteld worden (lopende inlog of
    // schrijfactie, zie maakHerlaadKern), en dan leek de knop kapot: je klikte en er
    // gebeurde niets. Nu zie je dat de klik is aangekomen.
    knop.disabled = true;
    knop.textContent = 'Bezig…';
    // …maar 'Bezig…' mocht ook voorgoed blijven staan. De kern geeft het op als de nieuwe versie
    // niet binnen 30 s actief wordt, of na vijf minuten wachten op een bezette pagina — en in
    // beide gevallen hoorde de gebruiker daar niets meer van. Deze wachthond biedt de knop dan
    // gewoon opnieuw aan. Is de pagina nog écht bezig (inlog of schrijfactie), dan wachten we
    // netjes door in plaats van te beweren dat het mislukt is.
    const wachthond = () => {
      if (!document.getElementById('sw-update-bar')) return;   // balk is al weg
      if (isBezet && isBezet()) { setTimeout(wachthond, HERLAAD_WACHTHOND_MS); return; }
      knop.disabled = false;
      knop.textContent = 'Opnieuw proberen';
      // Een gewone verversing helpt hier niet meer: sinds de eigen bestanden cache-first komen
      // (sw-strategie.js) geeft een gewone verversing zolang de oude versie actief is gewoon weer
      // de oude code. Pas als geen enkel venster de oude versie nog vasthoudt, neemt de nieuwe over.
      if (tekst) tekst.textContent = 'Het herladen kwam niet door. Probeer het nog eens, of sluit alle vensters van het dashboard en open het opnieuw.';
    };
    setTimeout(wachthond, HERLAAD_WACHTHOND_MS);
    onReload();
  });
  document.getElementById('sw-update-dismiss').addEventListener('click', () => { bar.remove(); onDismiss(); });
}

// De update-bewaking van één registratie, los van `navigator` zodat hij te toetsen is met een nep-
// registratie. Drie wegen naar de balk, want elke weg alleen laat een gat:
//   · `updatefound` — een nieuwe versie die tijdens deze sessie begint te installeren;
//   · een versie die AL aan het installeren was toen we de registratie kregen (de listener komt
//     pas na 'load' + getRegistration; dan vuurt updatefound niet meer voor die versie);
//   · een versie die al klaarstond (`reg.waiting`), en na elke update()-controle opnieuw kijken —
//     een update() die een versie vindt die meteen 'installed' is, gaf anders pas bij de volgende
//     tabbladwissel een balk.
// Geeft `check` terug: update() en daarna de balk als er een wachtende versie is.
export function bewaakRegistratie(reg, balk, ctrl, verborgen) {
  ctrl = ctrl || (() => navigator.serviceWorker.controller);
  verborgen = verborgen || (() => document.hidden);
  const volg = nw => {
    if (!nw) return;
    nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && shouldPromptReload(ctrl())) balk();
    });
  };
  reg.addEventListener('updatefound', () => volg(reg.installing));
  volg(reg.installing);
  if (reg.waiting && shouldPromptReload(ctrl())) balk();
  return () => Promise.resolve()
    .then(() => reg.update())
    .then(() => { if (balkWeerTonen(verborgen(), reg, ctrl())) balk(); })
    .catch(() => {});
}

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  const kern = maakHerlaadKern();
  let balk = null;                                            // gezet zodra de registratie er is
  let hadController = !!navigator.serviceWorker.controller;

  // Nieuwe SW heeft overgenomen → eenmalig herladen naar verse code, maar alléén
  // als de gebruiker hier recent op "Herladen" klikte en de pagina niet bezet is
  // met een inlog of schrijfactie (zie maakHerlaadKern). Klikte een ÁNDER venster, dan de balk
  // (zie balkNaOvername).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const toon = balkNaOvername(kern._gearmd(), hadController);
    hadController = true;
    // Dit tabblad draait vanaf nu OUDE code terwijl alles wat het nog ophaalt (een lui geladen
    // module) uit de cache van de NIEUWE versie komt. Wie daarop leunt (verplaatsen, statistiek)
    // weigert dan netjes in plaats van twee versies door elkaar te draaien.
    if (toon) state._codeVerouderd = true;
    kern.controllerChange();
    if (toon && balk) balk();
  });

  window.addEventListener('load', () => {
    const base = location.pathname.replace(/\/[^/]*$/, '') || '';
    pakRegistratie(base + '/sw.js', base + '/').then(reg => {
      const vraagHerladen = () => kern.klik(reg);
      balk = () => toonUpdateBalk(vraagHerladen, () => kern.annuleer(), kern.isBezet);

      const check = bewaakRegistratie(reg, () => balk());

      // Periodiek + bij terugkeer naar het tabblad actief checken. Sinds de eigen bestanden
      // cache-first komen (sw-strategie.js) is dit de ENIGE manier waarop een open tabblad een
      // nieuwe uitrol ontdekt: zonder update() bleef een dashboard dat dagen openstaat op de oude
      // code. De browser doet dit zelf alleen bij een navigatie (en hoogstens eens per 24 uur).
      setInterval(check, 30 * 60 * 1000); // elk half uur
      // Bij terugkeer naar het tabblad óók de balk terug als er nog een nieuwe versie klaarstaat.
      // Een weggeklikte balk kwam in dit tabblad nooit meer terug: `updatefound` vuurt maar één
      // keer per versie, dus wie hem één keer wegklikte bleef dagen op de oude code werken.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        check();
        if (balkWeerTonen(document.hidden, reg, navigator.serviceWorker.controller)) balk();
      });
    }).catch(e => console.warn('SW registratie mislukt:', e));
  });
}
